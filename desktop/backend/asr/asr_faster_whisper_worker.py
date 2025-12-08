#!/usr/bin/env python3
"""
Faster-Whisper Worker: streaming ASR based on WhisperLive architecture
Supports real-time audio transcription with VAD (Voice Activity Detection)
"""

import json
import os
import sys
import time
import traceback
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

# ==============================================================================
# OS 级别的文件描述符重定向
# ==============================================================================
ipc_fd = os.dup(sys.stdout.fileno())
ipc_channel = os.fdopen(ipc_fd, "w", buffering=1, encoding="utf-8")
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
sys.stdout = sys.stderr


def send_ipc_message(data):
    """发送 JSON 消息到 Node.js"""
    try:
        json_str = json.dumps(data, ensure_ascii=False)
        ipc_channel.write(json_str + "\n")
        ipc_channel.flush()
    except Exception as exc:
        sys.stderr.write(f"[IPC Error] Failed to send: {exc}\n")
        sys.stderr.flush()


# ==============================================================================
# 环境变量配置
# ==============================================================================
os.environ.setdefault("TQDM_DISABLE", "1")

HF_HOME = os.environ.get("HF_HOME")
DEFAULT_CACHE_DIR = os.path.join(HF_HOME, "hub") if HF_HOME else os.path.expanduser("~/.cache/huggingface/hub")
CACHE_DIR = os.environ.get("ASR_CACHE_DIR") or DEFAULT_CACHE_DIR
os.makedirs(CACHE_DIR, exist_ok=True)

# ==============================================================================
# Faster-Whisper 配置
# ==============================================================================
SAMPLE_RATE = int(os.environ.get("ASR_SAMPLE_RATE", "16000"))
MODEL_SIZE = os.environ.get("ASR_MODEL", "small")
# 默认强制中文（简体）输出，可通过环境变量 ASR_LANGUAGE 覆盖
DEFAULT_LANGUAGE = os.environ.get("ASR_LANGUAGE", "zh")

# 流式处理配置
MIN_AUDIO_SECONDS = float(os.environ.get("ASR_MIN_AUDIO_SECONDS", "1.0"))
MAX_BUFFER_SECONDS = float(os.environ.get("ASR_BUFFER_SECONDS", "30"))
SILENCE_THRESHOLD_SECONDS = float(os.environ.get("ASR_SILENCE_THRESHOLD", "0.8"))

# 分句配置
SENTENCE_END_PUNCTUATION = set("。！？!?.；;")
MIN_SENTENCE_CHARS = int(os.environ.get("MIN_SENTENCE_CHARS", "4"))
MIN_AUTO_COMMIT_CHARS = int(os.environ.get("MIN_AUTO_COMMIT_CHARS", "20"))
MAX_SENTENCE_SECONDS = float(os.environ.get("MAX_SENTENCE_SECONDS", "20"))

# 静音检测配置
NO_SPEECH_THRESHOLD = float(os.environ.get("NO_SPEECH_THRESHOLD", "0.45"))
SAME_OUTPUT_THRESHOLD = int(os.environ.get("SAME_OUTPUT_THRESHOLD", "7"))


def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    """Base64 音频转 float32 numpy array（范围 -1~1）。"""
    import base64
    audio_bytes = base64.b64decode(audio_b64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32) / 32768.0


def extract_incremental_text(previous: str, current: str) -> str:
    """提取增量文本"""
    if not current:
        return ""
    if not previous:
        return current
    if current == previous or current in previous:
        return ""
    if previous in current:
        return current[len(previous):]

    max_overlap = min(len(previous), len(current))
    for overlap in range(max_overlap, 0, -1):
        if previous[-overlap:] == current[:overlap]:
            return current[overlap:]
    return current


@dataclass
class SessionState:
    """
    Faster-Whisper 会话状态，基于 WhisperLive 的 ServeClientBase 设计
    """
    # 音频缓冲区
    frames_np: Optional[np.ndarray] = None
    frames_offset: float = 0.0
    timestamp_offset: float = 0.0
    
    # 转录状态
    current_out: str = ""
    prev_out: str = ""
    same_output_count: int = 0
    end_time_for_same_output: Optional[float] = None
    
    # 已完成的 segments
    transcript: List[dict] = field(default_factory=list)
    text_history: List[str] = field(default_factory=list)
    
    # 语言检测
    language: Optional[str] = None
    language_probability: float = 0.0
    
    # 句子相关
    current_sentence_start: float = 0.0
    last_partial_text: str = ""
    
    # 锁
    lock: threading.Lock = field(default_factory=threading.Lock)
    
    def add_frames(self, frame_np: np.ndarray):
        """添加音频帧到缓冲区，参考 WhisperLive 的 add_frames"""
        with self.lock:
            if self.frames_np is not None and self.frames_np.shape[0] > 45 * SAMPLE_RATE:
                # 丢弃最老的 30 秒
                self.frames_offset += 30.0
                self.frames_np = self.frames_np[int(30 * SAMPLE_RATE):]
                if self.timestamp_offset < self.frames_offset:
                    self.timestamp_offset = self.frames_offset
            
            if self.frames_np is None:
                self.frames_np = frame_np.copy()
            else:
                self.frames_np = np.concatenate((self.frames_np, frame_np), axis=0)
    
    def get_audio_chunk_for_processing(self) -> Tuple[np.ndarray, float]:
        """获取待处理的音频块"""
        with self.lock:
            samples_take = max(0, (self.timestamp_offset - self.frames_offset) * SAMPLE_RATE)
            input_bytes = self.frames_np[int(samples_take):].copy()
        duration = input_bytes.shape[0] / SAMPLE_RATE
        return input_bytes, duration
    
    def format_segment(self, start: float, end: float, text: str, completed: bool = False) -> dict:
        """格式化转录片段"""
        return {
            'start': f"{start:.3f}",
            'end': f"{end:.3f}",
            'text': text,
            'completed': completed
        }
    
    def reset(self):
        """重置会话状态"""
        with self.lock:
            self.frames_np = None
            self.frames_offset = 0.0
            self.timestamp_offset = 0.0
            self.current_out = ""
            self.prev_out = ""
            self.same_output_count = 0
            self.end_time_for_same_output = None
            self.transcript.clear()
            self.text_history.clear()
            self.current_sentence_start = 0.0
            self.last_partial_text = ""
            # 保留 language 设置


def load_faster_whisper_model(model_size: str):
    """加载 Faster-Whisper 模型"""
    try:
        import torch
        from faster_whisper import WhisperModel
    except ImportError as e:
        sys.stderr.write(f"[Faster-Whisper Worker] Import error: {e}\n")
        sys.stderr.write("[Faster-Whisper Worker] Please install: pip install faster-whisper torch\n")
        sys.stderr.flush()
        raise
    
    # 检测设备
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        major, _ = torch.cuda.get_device_capability(device)
        compute_type = "float16" if major >= 7 else "float32"
    else:
        compute_type = "int8"
    
    sys.stderr.write(f"[Faster-Whisper Worker] Loading model '{model_size}' on {device} with {compute_type}\n")
    sys.stderr.flush()
    
    model = WhisperModel(
        model_size,
        device=device,
        compute_type=compute_type,
        download_root=CACHE_DIR,
        local_files_only=False,
    )
    
    return model, device, compute_type


def transcribe_audio(
    model,
    input_sample: np.ndarray,
    language: Optional[str] = None,
    task: str = "transcribe",
    initial_prompt: Optional[str] = None,
    use_vad: bool = True,
) -> Tuple[list, Optional[dict]]:
    """
    调用 faster-whisper 转录音频
    返回: (segments_list, info)
    """
    # 使用 faster-whisper 默认 VAD 配置，避免不兼容参数导致报错
    vad_parameters = None
    
    result, info = model.transcribe(
        input_sample,
        initial_prompt=initial_prompt,
        language=language or DEFAULT_LANGUAGE,
        task=task,
        vad_filter=use_vad,
        vad_parameters=vad_parameters,
    )
    
    # 将 generator 转换为 list
    segments = list(result)
    return segments, info


def update_segments(
    state: SessionState,
    segments: list,
    duration: float,
) -> Optional[dict]:
    """
    处理 Whisper 的转录结果，更新 transcript
    基于 WhisperLive 的 update_segments 逻辑
    """
    offset = None
    state.current_out = ""
    last_segment = None
    
    # 处理完整的 segments（除最后一个）
    if len(segments) > 1 and getattr(segments[-1], 'no_speech_prob', 0) <= NO_SPEECH_THRESHOLD:
        for seg in segments[:-1]:
            text = seg.text.strip()
            state.text_history.append(text)
            
            with state.lock:
                start = state.timestamp_offset + seg.start
                end = state.timestamp_offset + min(duration, seg.end)
            
            if start >= end:
                continue
            if getattr(seg, 'no_speech_prob', 0) > NO_SPEECH_THRESHOLD:
                continue
            
            completed_segment = state.format_segment(start, end, text, completed=True)
            state.transcript.append(completed_segment)
            offset = min(duration, seg.end)
    
    # 处理最后一个 segment
    if segments and getattr(segments[-1], 'no_speech_prob', 0) <= NO_SPEECH_THRESHOLD:
        state.current_out = segments[-1].text.strip()
        with state.lock:
            last_segment = state.format_segment(
                state.timestamp_offset + segments[-1].start,
                state.timestamp_offset + min(duration, segments[-1].end),
                state.current_out,
                completed=False
            )
    
    # 处理重复输出逻辑
    if state.current_out.strip() == state.prev_out.strip() and state.current_out:
        state.same_output_count += 1
        if state.end_time_for_same_output is None:
            state.end_time_for_same_output = segments[-1].end if segments else duration
    else:
        state.same_output_count = 0
        state.end_time_for_same_output = None
    
    # 重复输出达到阈值，提交为完整 segment
    if state.same_output_count > SAME_OUTPUT_THRESHOLD:
        if not state.text_history or state.text_history[-1].strip().lower() != state.current_out.strip().lower():
            state.text_history.append(state.current_out)
            with state.lock:
                completed_segment = state.format_segment(
                    state.timestamp_offset,
                    state.timestamp_offset + min(duration, state.end_time_for_same_output or duration),
                    state.current_out,
                    completed=True
                )
                state.transcript.append(completed_segment)
        
        state.current_out = ""
        offset = min(duration, state.end_time_for_same_output or duration)
        state.same_output_count = 0
        last_segment = None
        state.end_time_for_same_output = None
    else:
        state.prev_out = state.current_out
    
    if offset is not None:
        with state.lock:
            state.timestamp_offset += offset
    
    return last_segment


def handle_streaming_chunk(
    model,
    data: dict,
    sessions_cache: Dict[str, SessionState],
):
    """处理流式音频块"""
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    audio_data_b64 = data.get("audio_data")
    is_final = bool(data.get("is_final", False))
    
    if not audio_data_b64:
        send_ipc_message({"request_id": request_id, "error": "No audio_data provided"})
        return
    
    state = sessions_cache.setdefault(session_id, SessionState())
    samples = decode_audio_chunk(audio_data_b64)
    
    if samples.size == 0:
        return
    
    # 添加音频帧
    state.add_frames(samples)
    
    timestamp_ms = int(time.time() * 1000)
    
    # 获取待处理的音频
    input_bytes, duration = state.get_audio_chunk_for_processing()
    
    # 至少需要 1 秒音频才处理
    if duration < MIN_AUDIO_SECONDS and not is_final:
        return
    
    sys.stderr.write(
        f"[Faster-Whisper Worker] Processing: session={session_id}, "
        f"duration={duration:.2f}s, is_final={is_final}\n"
    )
    sys.stderr.flush()
    
    try:
        # 转录
        segments, info = transcribe_audio(
            model,
            input_bytes,
            language=state.language,
            use_vad=True,
        )
        
        if not segments:
            return
        
        # 更新语言检测
        if state.language is None and info is not None:
            if hasattr(info, 'language') and hasattr(info, 'language_probability'):
                if info.language_probability > 0.5:
                    state.language = info.language
                    state.language_probability = info.language_probability
                    sys.stderr.write(
                        f"[Faster-Whisper Worker] Detected language: {state.language} "
                        f"(prob={state.language_probability:.2f})\n"
                    )
                    sys.stderr.flush()
                    send_ipc_message({
                        "request_id": request_id,
                        "session_id": session_id,
                        "type": "language_detected",
                        "language": state.language,
                        "language_probability": state.language_probability,
                    })
        
        # 更新 segments
        last_segment = update_segments(state, segments, duration)
        
        # 准备发送的 segments
        send_segments = []
        if len(state.transcript) >= 10:
            send_segments = state.transcript[-10:].copy()
        else:
            send_segments = state.transcript.copy()
        
        if last_segment is not None:
            send_segments.append(last_segment)
        
        if not send_segments:
            return
        
        # 构建完整文本
        full_text = " ".join([seg.get('text', '') for seg in send_segments]).strip()
        
        # 发送 partial 消息
        incremental = extract_incremental_text(state.last_partial_text, full_text)
        if incremental or is_final:
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "partial",
                "text": incremental,
                "full_text": full_text,
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": state.language or "auto",
            })
            state.last_partial_text = full_text
            sys.stderr.write(f"[Faster-Whisper Worker] 📝 PARTIAL: \"{incremental[:50]}...\"\n")
            sys.stderr.flush()
        
        # 检查是否有完整的句子需要提交
        for seg in state.transcript:
            if seg.get('completed') and seg not in getattr(state, '_sent_segments', []):
                if not hasattr(state, '_sent_segments'):
                    state._sent_segments = []
                
                send_ipc_message({
                    "request_id": request_id,
                    "session_id": session_id,
                    "type": "sentence_complete",
                    "text": seg['text'],
                    "timestamp": timestamp_ms,
                    "is_final": is_final,
                    "status": "success",
                    "language": state.language or "auto",
                    "audio_duration": duration,
                    "start_time": int(float(seg['start']) * 1000),
                    "end_time": int(float(seg['end']) * 1000),
                })
                state._sent_segments.append(seg)
                sys.stderr.write(f"[Faster-Whisper Worker] 🎯 SENTENCE_COMPLETE: \"{seg['text'][:50]}...\"\n")
                sys.stderr.flush()
        
        # 如果是最终块，提交所有剩余内容
        if is_final and state.current_out:
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "sentence_complete",
                "text": state.current_out,
                "timestamp": timestamp_ms,
                "is_final": True,
                "status": "success",
                "language": state.language or "auto",
                "audio_duration": duration,
                "trigger": "final_chunk",
            })
            sys.stderr.write(f"[Faster-Whisper Worker] 🎯 FINAL_COMMIT: \"{state.current_out[:50]}...\"\n")
            sys.stderr.flush()
            state.current_out = ""
    
    except Exception as exc:
        sys.stderr.write(f"[Faster-Whisper Worker] Transcription error: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()


def handle_batch_file(model, data: dict):
    """处理批量文件识别"""
    request_id = data.get("request_id", "unknown")
    audio_path = data.get("audio_path")
    
    if not audio_path:
        send_ipc_message({"request_id": request_id, "error": "No audio_path provided"})
        return
    if not os.path.exists(audio_path):
        send_ipc_message({"request_id": request_id, "error": f"File not found: {audio_path}"})
        return
    
    try:
        segments, info = transcribe_audio(
            model,
            audio_path,
            use_vad=True,
        )
        
        full_text = " ".join([seg.text.strip() for seg in segments])
        language = info.language if info else "auto"
        
        send_ipc_message({
            "request_id": request_id,
            "text": full_text,
            "language": language,
            "status": "success",
        })
    
    except Exception as exc:
        send_ipc_message({
            "request_id": request_id,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })


def handle_force_commit(data: dict, sessions_cache: Dict[str, SessionState]):
    """强制提交当前句子"""
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    
    sys.stderr.write(f"[Faster-Whisper Worker] force_commit received for session={session_id}\n")
    sys.stderr.flush()
    
    state = sessions_cache.get(session_id)
    if not state:
        sys.stderr.write(f"[Faster-Whisper Worker] No session state found for session={session_id}\n")
        sys.stderr.flush()
        return
    
    if state.current_out and len(state.current_out) >= MIN_SENTENCE_CHARS:
        timestamp_ms = int(time.time() * 1000)
        
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "type": "sentence_complete",
            "text": state.current_out,
            "timestamp": timestamp_ms,
            "is_final": True,
            "status": "success",
            "trigger": "force_commit",
            "language": state.language or "auto",
            "audio_duration": 0,
        })
        
        sys.stderr.write(f"[Faster-Whisper Worker] 🎯 FORCE_COMMIT: \"{state.current_out[:50]}...\"\n")
        sys.stderr.flush()
        
        # 重置当前输出
        state.current_out = ""
        state.prev_out = ""
        state.same_output_count = 0
        state.last_partial_text = ""
    else:
        sys.stderr.write(f"[Faster-Whisper Worker] force_commit: text too short or empty\n")
        sys.stderr.flush()


def main():
    try:
        sys.stderr.write("[Faster-Whisper Worker] Starting Faster-Whisper Worker...\n")
        sys.stderr.flush()
        
        # 加载模型
        model, device, compute_type = load_faster_whisper_model(MODEL_SIZE)
        
        sessions_cache: Dict[str, SessionState] = {}
        send_ipc_message({"status": "ready"})
        
        sys.stderr.write(
            f"[Faster-Whisper Worker] Ready! model={MODEL_SIZE}, device={device}, "
            f"compute_type={compute_type}\n"
        )
        sys.stderr.flush()
        
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            
            try:
                data = json.loads(line)
            except json.JSONDecodeError as exc:
                send_ipc_message({"request_id": "unknown", "error": f"Invalid JSON: {exc}"})
                continue
            
            request_type = data.get("type")
            request_id = data.get("request_id", "default")
            session_id = data.get("session_id", request_id)
            
            if request_type == "reset_session":
                sys.stderr.write(f"[Faster-Whisper Worker] Resetting session: {session_id}\n")
                sys.stderr.flush()
                sessions_cache.pop(session_id, None)
                continue
            
            if request_type == "force_commit":
                handle_force_commit(data, sessions_cache)
                continue
            
            if request_type == "streaming_chunk":
                handle_streaming_chunk(model, data, sessions_cache)
                continue
            
            if request_type == "batch_file" or "audio_path" in data:
                handle_batch_file(model, data)
                continue
            
            send_ipc_message({
                "request_id": request_id,
                "error": f"Unknown request type: {request_type}",
            })
    
    except Exception as exc:
        sys.stderr.write(f"[Faster-Whisper Worker] Fatal error: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        send_ipc_message({"status": "fatal", "error": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()


"""
ASR Worker with Hybrid Sentence Segmentation

当前实现：基于 Faster-Whisper 的语音识别引擎
支持流式识别和混合分句策略。

【优化版本】
核心改进：
1. 滑动窗口识别 - 避免重复识别整个累积的音频
2. 累积足够音频再识别 - 提高识别质量和标点准确性
3. 增量文本提取 - 只输出新识别的部分
4. 智能分句 - 基于标点和语义边界

IPC 协议：
- 输入：streaming_chunk, batch_file, reset_session, force_commit
- 输出：
  - partial: 实时字幕（增量文本）
  - sentence_complete: 完整句子（触发存库）
"""

import base64
import json
import os
import re
import sys
import time
import traceback
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
from faster_whisper import WhisperModel

# ==============================================================================
# 核心修复：OS 级别的文件描述符重定向
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
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"


def resolve_cpu_threads() -> int:
    """Resolve how many CPU threads the decoder may use."""
    env_value = os.environ.get("ASR_CPU_THREADS")
    if env_value:
        try:
            parsed = int(env_value)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            pass
    cpu_count = os.cpu_count() or 2
    # Default to half the cores but at least 2 threads, up to 8 for safety.
    return max(2, min(8, cpu_count // 2 or 1))


CPU_THREADS = resolve_cpu_threads()
DEFAULT_NUM_WORKERS = max(1, min(4, CPU_THREADS // 2 or 1))
try:
    NUM_WORKERS = int(os.environ.get("ASR_NUM_WORKERS", str(DEFAULT_NUM_WORKERS)))
    if NUM_WORKERS <= 0:
        raise ValueError
except (TypeError, ValueError):
    NUM_WORKERS = DEFAULT_NUM_WORKERS

for var in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ[var] = str(CPU_THREADS)
os.environ.setdefault("TQDM_DISABLE", "1")

HF_HOME = os.environ.get("HF_HOME")
DEFAULT_CACHE_DIR = os.path.join(HF_HOME, "hub") if HF_HOME else os.path.expanduser("~/.cache/huggingface/hub")
CACHE_DIR = os.environ.get("ASR_CACHE_DIR") or DEFAULT_CACHE_DIR
os.makedirs(CACHE_DIR, exist_ok=True)

# ==============================================================================
# ASR 配置（优化版）
# ==============================================================================
SAMPLE_RATE = int(os.environ.get("ASR_SAMPLE_RATE", "16000"))

# 【优化】滑动窗口配置
WINDOW_SECONDS = float(os.environ.get("ASR_WINDOW_SECONDS", "20"))  # 识别窗口大小（秒），增加到20秒以获得更好上下文
MIN_NEW_AUDIO_SECONDS = float(os.environ.get("ASR_MIN_NEW_AUDIO", "0.5"))  # 降低触发阈值以提高响应速度
MAX_BUFFER_SECONDS = float(os.environ.get("ASR_BUFFER_SECONDS", "30"))  # 最大缓冲（防止内存溢出）
LOOKBACK_SECONDS = float(os.environ.get("ASR_LOOKBACK_SECONDS", "1.0"))  # 提交句子后保留的音频时长（秒）
MIN_DECODE_SAMPLES = int(0.4 * 16000) # 最小解码采样数

WINDOW_SAMPLES = int(WINDOW_SECONDS * SAMPLE_RATE)
MIN_NEW_AUDIO_SAMPLES = int(MIN_NEW_AUDIO_SECONDS * SAMPLE_RATE)
MAX_BUFFER_SAMPLES = int(MAX_BUFFER_SECONDS * SAMPLE_RATE)

DEFAULT_MODEL_FALLBACK = "base"

# 分句配置
SENTENCE_END_PUNCTUATION = set("。！？!?.；;")  # 句末标点
CLAUSE_PUNCTUATION = set("，,、：:")  # 分句标点
MIN_SENTENCE_CHARS = int(os.environ.get("MIN_SENTENCE_CHARS", "4"))  # 最短句子字符数
MAX_SENTENCE_SECONDS = float(os.environ.get("MAX_SENTENCE_SECONDS", "15"))  # 最长句子时长
SEGMENT_GAP_THRESHOLD = float(os.environ.get("SEGMENT_GAP_THRESHOLD", "0.5"))  # segment 间隙阈值


MODEL_ALIAS_MAP = {
    # Whisper GGML 模型别名映射
    "ggml-base.bin": "base",
    "ggml-small.bin": "small",
    "ggml-medium.bin": "medium",
    "ggml-large.bin": "large-v2",
    "ggml-large-v2.bin": "large-v2",
    "ggml-large-v3.bin": "large-v3",
}


def resolve_model_name() -> str:
    requested = os.environ.get("ASR_MODEL") or DEFAULT_MODEL_FALLBACK

    if not requested:
        return DEFAULT_MODEL_FALLBACK

    candidate = requested.strip()
    lower = candidate.lower()
    if lower in MODEL_ALIAS_MAP:
        return MODEL_ALIAS_MAP[lower]
    if "/" in candidate or lower.startswith("fast") or lower.startswith("systran/"):
        return candidate
    if lower in {"tiny", "base", "small", "medium", "large", "large-v2", "large-v3"}:
        return lower
    sys.stderr.write(f"[Worker] Unknown model alias '{candidate}', fallback to {DEFAULT_MODEL_FALLBACK}\n")
    sys.stderr.flush()
    return DEFAULT_MODEL_FALLBACK


DEVICE = os.environ.get("ASR_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("ASR_COMPUTE_TYPE", "int8")
LANGUAGE = os.environ.get("ASR_LANGUAGE", "zh").strip() or None
BEAM_SIZE = int(os.environ.get("ASR_BEAM_SIZE", "5"))
TEMPERATURE = float(os.environ.get("ASR_TEMPERATURE", "0.0"))
VAD_FILTER = os.environ.get("ASR_VAD_FILTER", "1").lower() not in {"0", "false", "no"}
NO_SPEECH_THRESHOLD = float(os.environ.get("ASR_NO_SPEECH_THRESHOLD", "0.6"))


@dataclass
class SentenceBuffer:
    """当前正在构建的句子"""
    text: str = ""
    start_time: float = 0.0  # 句子开始时间
    last_update_time: float = 0.0  # 最后更新时间


@dataclass
class SessionState:
    """
    会话状态，管理音频缓冲和分句
    
    【优化】滑动窗口模式：
    - 累积音频直到达到最小新音频阈值
    - 只识别最近 WINDOW_SECONDS 的音频
    - 通过文本对比提取增量结果
    """
    chunks: Deque[np.ndarray] = field(default_factory=deque)
    total_samples: int = 0
    
    # 【优化】滑动窗口状态
    last_recognized_samples: int = 0  # 上次识别时的总采样数
    last_recognized_text: str = ""    # 上次识别的完整文本
    pending_text: str = ""            # 待输出的文本（用于分句）
    
    # 分句相关
    current_sentence: SentenceBuffer = field(default_factory=SentenceBuffer)
    sentence_start_time: float = 0.0  # 当前句子开始的时间戳

    # 【新增】句子起始采样点 & 已提交文本长度（用于时长计算和增量对齐）
    sentence_start_sample: int = 0  # 当前句子在整体音频中的起始采样点
    committed_text_length: int = 0  # 已经作为完整句子提交的文本长度
    
    # 完整句子队列
    completed_sentences: List[str] = field(default_factory=list)

    def append_samples(self, samples: np.ndarray):
        """添加音频采样点"""
        self.chunks.append(samples)
        self.total_samples += len(samples)
        
        # 限制最大缓冲
        while self.total_samples > MAX_BUFFER_SAMPLES and self.chunks:
            removed = self.chunks.popleft()
            self.total_samples -= len(removed)

    def get_new_audio_duration(self) -> float:
        """获取自上次识别以来新增的音频时长（秒）"""
        new_samples = self.total_samples - self.last_recognized_samples
        return new_samples / SAMPLE_RATE

    def should_recognize(self) -> bool:
        """判断是否应该进行识别"""
        new_samples = self.total_samples - self.last_recognized_samples
        return new_samples >= MIN_NEW_AUDIO_SAMPLES

    def build_audio(self) -> Optional[np.ndarray]:
        """构建完整音频数组"""
        if not self.chunks:
            return None
        if len(self.chunks) == 1:
            return self.chunks[0]
        return np.concatenate(list(self.chunks))

    def get_window_audio(self) -> Optional[np.ndarray]:
        """获取滑动窗口内的音频（最近 WINDOW_SECONDS）"""
        audio = self.build_audio()
        if audio is None:
            return None
        
        if len(audio) <= WINDOW_SAMPLES:
            return audio
        
        # 只返回最近的窗口
        return audio[-WINDOW_SAMPLES:]

    def mark_recognized(self, text: str):
        """标记已识别，更新状态"""
        self.last_recognized_samples = self.total_samples
        self.last_recognized_text = text

    def clear_audio_before(self, keep_seconds: float):
        """
        清理指定时间之前的音频，保留 keep_seconds 秒作为上下文
        """
        keep_samples = int(keep_seconds * SAMPLE_RATE)
        audio = self.build_audio()
        
        if audio is not None and len(audio) > keep_samples:
            tail = audio[-keep_samples:]
            self.chunks = deque([tail])
            self.total_samples = keep_samples
        else:
            # 如果音频总长度还不到 keep_seconds，则不清除
            pass
        
        # 重置识别状态，因为音频改变了
        self.last_recognized_samples = 0
        # last_recognized_text 不重置，用于去重？或者应该重置？
        # 在滑动窗口逻辑中，last_recognized_text 用于计算 incremental text
        # 当我们清除音频后，下一次识别是新的开始，但也可能包含重叠部分
        # 为了简单起见，这里重置它，依靠 extract_incremental_text 处理重叠
        self.last_recognized_text = ""
        self.pending_text = ""
        self.current_sentence = SentenceBuffer()
        self.sentence_start_time = time.time()

    def reset(self):
        """完全重置状态"""
        self.chunks.clear()
        self.total_samples = 0
        self.last_recognized_samples = 0
        self.last_recognized_text = ""
        self.pending_text = ""
        self.current_sentence = SentenceBuffer()
        self.sentence_start_time = time.time()
        self.completed_sentences.clear()


def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    audio_bytes = base64.b64decode(audio_b64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32) / 32768.0


def generate_chinese_dialogue_prompt(completed_sentences: List[str]) -> str:
    """
    生成固定的简体中文闲聊风格对话 Prompt，引导 Whisper 正确添加标点符号

    使用固定的中文对话模板，包含丰富的标点和闲聊风格表达
    """
    # 固定的中文对话模板，包含丰富的标点和闲聊风格
    fixed_prompt = """你好啊，今天怎么样？天气不错吧？
嗯嗯，我觉得还可以啦。最近在忙什么呢？
哈哈，原来是这样啊。那你有什么计划吗？
哦，听起来挺有趣的！需要我帮忙吗？
好的，没问题。我觉得这个主意不错。
真的吗？那太好了！继续保持吧。
哎呀，怎么会这样呢？有什么我能做的吗？
嗯，我明白你的意思。生活有时候就是这样。
哈哈，说得对！我们一起想想办法吧。
好吧，那就这样决定啦。保持联系哦。"""

    return fixed_prompt


def extract_incremental_text(previous: str, current: str) -> str:
    """提取增量文本（当前文本相对于之前文本的新增部分）"""
    if not current:
        return ""
    if not previous:
        return current
    if current == previous or current in previous:
        return ""
    if previous in current:
        return current[len(previous):]

    # 尝试找到最长的重叠部分
    max_overlap = min(len(previous), len(current))
    for overlap in range(max_overlap, 0, -1):
        if previous[-overlap:] == current[:overlap]:
            return current[overlap:]
    return current


def find_sentence_boundaries(text: str) -> List[Tuple[int, str]]:
    """
    找到文本中的句子边界
    返回: [(边界位置, 边界类型), ...]
    边界类型: 'end' (句末), 'clause' (分句)
    """
    boundaries = []
    for i, char in enumerate(text):
        if char in SENTENCE_END_PUNCTUATION:
            boundaries.append((i + 1, 'end'))
        elif char in CLAUSE_PUNCTUATION:
            boundaries.append((i + 1, 'clause'))
    return boundaries


def split_by_sentence_end(text: str) -> Tuple[List[str], str]:
    """
    按句末标点分割文本
    返回: (完整句子列表, 剩余文本)
    """
    sentences = []
    remaining = text
    
    # 使用正则匹配句末标点
    pattern = r'([^。！？!?.；;]*[。！？!?.；;])'
    matches = list(re.finditer(pattern, text))
    
    if not matches:
        return [], text
    
    last_end = 0
    for match in matches:
        sentence = match.group(1).strip()
        if sentence and len(sentence) >= MIN_SENTENCE_CHARS:
            sentences.append(sentence)
        last_end = match.end()
    
    remaining = text[last_end:].strip()
    return sentences, remaining


def load_model() -> WhisperModel:
    model_name = resolve_model_name()
    sys.stderr.write(f"[ASR Worker] Loading model: {model_name} (Faster-Whisper)\n")
    sys.stderr.write(
        "[ASR Worker] Device="
        f"{DEVICE}, compute_type={COMPUTE_TYPE}, cache={CACHE_DIR}, "
        f"cpu_threads={CPU_THREADS}, workers={NUM_WORKERS}\n"
    )
    sys.stderr.flush()

    # 检查是否为本地模型路径（以.pt或.bin结尾的文件，或者目录）
    if os.path.isfile(model_name) and (model_name.endswith('.pt') or model_name.endswith('.bin')):
        sys.stderr.write(f"[ASR Worker] Loading local model file: {model_name}\n")
        sys.stderr.flush()
        model = WhisperModel(
            model_name,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
            num_workers=NUM_WORKERS,
        )
        sys.stderr.write("[ASR Worker] Local model loaded successfully\n")
        sys.stderr.flush()
        return model
    
    # 检查是否为本地模型目录
    if os.path.isdir(model_name):
        sys.stderr.write(f"[ASR Worker] Loading local model directory: {model_name}\n")
        sys.stderr.flush()
        model = WhisperModel(
            model_name,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
            num_workers=NUM_WORKERS,
        )
        sys.stderr.write("[ASR Worker] Local model directory loaded successfully\n")
        sys.stderr.flush()
        return model

    # 首先尝试从 HuggingFace 加载
    try:
        sys.stderr.write(f"[ASR Worker] Trying to load from HuggingFace: {model_name}\n")
        sys.stderr.flush()
        model = WhisperModel(
            model_name,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=CACHE_DIR,
            cpu_threads=CPU_THREADS,
            num_workers=NUM_WORKERS,
        )
        sys.stderr.write("[ASR Worker] Model loaded from HuggingFace\n")
        sys.stderr.flush()
        return model
    except Exception as hf_exc:
        sys.stderr.write(f"[ASR Worker] HuggingFace download failed: {hf_exc}\n")
        sys.stderr.write(f"[ASR Worker] Trying ModelScope mirror for: {model_name}\n")
        sys.stderr.flush()

        # 尝试从 ModelScope 镜像源加载
        try:
            # 提取模型大小（如果model_name包含斜杠，取最后一部分）
            # 例如 "Xenova/whisper-base" -> "whisper-base"
            model_size = model_name.split('/')[-1] if '/' in model_name else model_name
            modelscope_repo = f"pengzhendong/faster-whisper-{model_size}"
            sys.stderr.write(f"[ASR Worker] Loading from ModelScope: {modelscope_repo}\n")
            sys.stderr.flush()
            model = WhisperModel(
                modelscope_repo,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                download_root=CACHE_DIR,
                cpu_threads=CPU_THREADS,
                num_workers=NUM_WORKERS,
            )
            sys.stderr.write("[ASR Worker] Model loaded from ModelScope\n")
            sys.stderr.flush()
            return model
        except Exception as ms_exc:
            sys.stderr.write(f"[ASR Worker] ModelScope download also failed: {ms_exc}\n")
            sys.stderr.write("[ASR Worker] Both HuggingFace and ModelScope failed, re-raising original error\n")
            sys.stderr.flush()
            # 重新抛出原始的 HuggingFace 异常，因为那是用户最期望的源
            raise hf_exc


def transcribe_audio_with_segments(
    model: WhisperModel, 
    audio_source, 
    initial_prompt: str = None
) -> Tuple[str, List[dict], dict]:
    """
    转录音频并返回 segment 级别的信息
    返回: (完整文本, segments列表, info)
    """
    segments, info = model.transcribe(
        audio_source,
        beam_size=BEAM_SIZE,
        best_of=BEAM_SIZE,
        language=LANGUAGE,
        temperature=TEMPERATURE,
        vad_filter=VAD_FILTER,
        condition_on_previous_text=False,
        initial_prompt=initial_prompt, # 【核心优化】传入上文提示
        no_speech_threshold=NO_SPEECH_THRESHOLD,
        word_timestamps=False,  # 关闭 word-level timestamps 以提高速度
    )
    
    collected_segments = []
    collected_text = []
    
    for segment in segments:
        seg_text = segment.text.strip() if segment.text else ""
        if seg_text:
            collected_text.append(seg_text)
            collected_segments.append({
                "text": seg_text,
                "start": float(segment.start),
                "end": float(segment.end),
                "no_speech_prob": float(segment.no_speech_prob) if hasattr(segment, 'no_speech_prob') else 0.0,
            })
    
    full_text = "".join(collected_text).strip()
    return full_text, collected_segments, info


def handle_streaming_chunk(
    model: WhisperModel,
    data: Dict,
    sessions_cache: Dict[str, SessionState],
):
    """
    处理流式音频块，实现混合分句策略
    """
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    audio_data_b64 = data.get("audio_data")
    
    if not audio_data_b64:
        send_ipc_message({"request_id": request_id, "error": "No audio_data provided"})
        return

    state = sessions_cache.setdefault(session_id, SessionState())
    samples = decode_audio_chunk(audio_data_b64)
    state.append_samples(samples)

    is_final = bool(data.get("is_final", False))
    
    # 检查是否有足够的音频进行识别
    if state.total_samples < MIN_DECODE_SAMPLES and not is_final:
        sys.stderr.write(f"[Worker] Not enough samples: {state.total_samples} < {MIN_DECODE_SAMPLES}, session={session_id}\n")
        sys.stderr.flush()
        return

    audio_array = state.build_audio()
    if audio_array is None or len(audio_array) == 0:
        sys.stderr.write(f"[Worker] No audio to process for session={session_id}\n")
        sys.stderr.flush()
        return

    timestamp_ms = int(time.time() * 1000)
    audio_duration = len(audio_array) / SAMPLE_RATE
    
    sys.stderr.write(f"[Worker] Starting transcription: session={session_id}, samples={len(audio_array)}, duration={audio_duration:.2f}s\n")
    sys.stderr.flush()

    # 【核心优化】构造智能中文对话 Prompt
    # 使用简体中文闲聊风格，包含标点符号引导
    initial_prompt = generate_chinese_dialogue_prompt(state.completed_sentences)
    sys.stderr.write(f"[Worker] Generated Chinese dialogue prompt: \"{initial_prompt[:100]}...\"\n")
    sys.stderr.write(f"[Worker] Prompt length: {len(initial_prompt)} chars\n")

    try:
        full_text, segments, info = transcribe_audio_with_segments(model, audio_array, initial_prompt=initial_prompt)
        sys.stderr.write(f"[Worker] Transcription result: text=\"{full_text[:50] if full_text else '(empty)'}...\", segments={len(segments)}\n")
        sys.stderr.flush()
    except Exception as exc:
        sys.stderr.write(f"[Worker] Streaming decode failed: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "error": str(exc),
        })
        return

    if not full_text:
        sys.stderr.write(f"[Worker] Empty transcription result for session={session_id}\n")
        sys.stderr.flush()
        return

    # ==============================================================================
    # 混合分句策略
    # ==============================================================================
    
    # 1. 检测 Whisper segment 边界（VAD 层面的断句）
    segment_boundaries = []
    if len(segments) > 1:
        for i in range(1, len(segments)):
            gap = segments[i]["start"] - segments[i-1]["end"]
            if gap >= SEGMENT_GAP_THRESHOLD:
                # 找到一个显著的停顿
                segment_boundaries.append({
                    "position": sum(len(s["text"]) for s in segments[:i]),
                    "gap": gap,
                    "time": segments[i-1]["end"],
                })
    
    # 2. 检测句末标点
    complete_sentences, remaining_text = split_by_sentence_end(full_text)
    
    # 3. 检查是否超过最大句子时长
    sentence_duration = (state.total_samples - state.sentence_start_sample) / SAMPLE_RATE
    force_commit = sentence_duration >= MAX_SENTENCE_SECONDS
    
    # 4. 决定是否提交句子
    sentences_to_commit = []
    
    # 4.1 如果有完整句子（以句末标点结尾），提交它们
    if complete_sentences:
        sentences_to_commit.extend(complete_sentences)
        # 更新当前句子为剩余文本
        state.current_sentence.text = remaining_text
        state.committed_text_length = len(full_text) - len(remaining_text)
    
    # 4.2 如果有显著的 segment 边界且当前句子足够长，也可以断句
    elif segment_boundaries and len(state.current_sentence.text) >= MIN_SENTENCE_CHARS * 2:
        # 使用最后一个 segment 边界进行断句
        last_boundary = segment_boundaries[-1]
        boundary_pos = last_boundary["position"]
        if boundary_pos > MIN_SENTENCE_CHARS:
            sentence_part = full_text[:boundary_pos].strip()
            if sentence_part and len(sentence_part) >= MIN_SENTENCE_CHARS:
                sentences_to_commit.append(sentence_part)
                state.current_sentence.text = full_text[boundary_pos:].strip()
                state.committed_text_length = boundary_pos
    
    # 4.3 如果超过最大时长，强制提交当前文本
    elif force_commit and full_text and len(full_text) >= MIN_SENTENCE_CHARS:
        sentences_to_commit.append(full_text)
        state.current_sentence.text = ""
        state.committed_text_length = len(full_text)
    
    # 4.4 如果是最终块，提交所有剩余文本
    elif is_final and full_text and len(full_text) >= MIN_SENTENCE_CHARS:
        sentences_to_commit.append(full_text)
        state.current_sentence.text = ""
        state.committed_text_length = len(full_text)
    
    # 5. 发送完整句子事件
    for sentence in sentences_to_commit:
        if sentence and len(sentence.strip()) >= MIN_SENTENCE_CHARS:
            sys.stderr.write(f"[Worker] 🎯 SENTENCE_COMPLETE: \"{sentence.strip()[:50]}...\" (session={session_id})\n")
            sys.stderr.flush()
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "sentence_complete",
                "text": sentence.strip(),
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": info.language if hasattr(info, "language") else None,
                "audio_duration": audio_duration,
            })
            
            # 【优化】记录已提交句子，用于下次 prompt
            state.completed_sentences.append(sentence.strip())
            
            # 清理已提交句子对应的音频
            state.clear_audio_before(LOOKBACK_SECONDS)
            state.sentence_start_sample = 0
    
    # 6. 发送实时字幕（增量文本）
    current_text = state.current_sentence.text if state.current_sentence.text else (
        remaining_text if complete_sentences else full_text
    )
    
    # 计算增量文本
    if not sentences_to_commit:
        # 没有提交句子，发送增量字幕
        incremental = extract_incremental_text(
            state.current_sentence.text if state.current_sentence.text else "",
            current_text
        ).strip()
        
        if incremental:
            sys.stderr.write(f"[Worker] 📝 PARTIAL: \"{incremental[:30]}...\" full=\"{current_text[:30]}...\" (session={session_id})\n")
            sys.stderr.flush()
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "partial",
                "text": incremental,
                "full_text": current_text,
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": info.language if hasattr(info, "language") else None,
            })
    
    # 更新状态
    state.current_sentence.text = current_text
    state.current_sentence.last_update_time = time.time()


def handle_batch_file(model: WhisperModel, data: Dict):
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
        text, segments, info = transcribe_audio_with_segments(model, audio_path)
    except Exception as exc:
        send_ipc_message({
            "request_id": request_id,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })
        return

    send_ipc_message({
        "request_id": request_id,
        "text": text,
        "segments": segments,
        "language": info.language if hasattr(info, "language") else None,
        "status": "success",
    })


def handle_force_commit(data: Dict, sessions_cache: Dict[str, SessionState]):
    """
    强制提交当前句子（由 JS 侧静音检测触发）
    """
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    
    sys.stderr.write(f"[Worker] force_commit received for session={session_id}\n")
    sys.stderr.flush()
    
    state = sessions_cache.get(session_id)
    if not state:
        sys.stderr.write(f"[Worker] No session state found for session={session_id}\n")
        sys.stderr.flush()
        return
    
    current_text = state.current_sentence.text.strip()
    sys.stderr.write(f"[Worker] force_commit current_sentence=\"{current_text[:50] if current_text else '(empty)'}...\" len={len(current_text)}\n")
    sys.stderr.flush()
    
    if current_text and len(current_text) >= MIN_SENTENCE_CHARS:
        timestamp_ms = int(time.time() * 1000)
        sys.stderr.write(f"[Worker] 🎯 FORCE_COMMIT SENTENCE: \"{current_text[:50]}...\" (session={session_id})\n")
        sys.stderr.flush()
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "type": "sentence_complete",
            "text": current_text,
            "timestamp": timestamp_ms,
            "is_final": True,
            "status": "success",
            "trigger": "silence_timeout",
        })
        
        # 【优化】记录已提交句子
        state.completed_sentences.append(current_text)
        
        # 重置状态
        state.current_sentence = SentenceBuffer()
        state.committed_text_length = 0
        state.clear_audio_before(LOOKBACK_SECONDS)
        state.sentence_start_sample = 0
    else:
        sys.stderr.write(f"[Worker] force_commit: text too short or empty, not sending (min={MIN_SENTENCE_CHARS})\n")
        sys.stderr.flush()


def main():
    try:
        model = load_model()
        sessions_cache: Dict[str, SessionState] = {}
        send_ipc_message({"status": "ready"})

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
            
            # 每隔一定数量打印收到的请求类型
            if request_type == "streaming_chunk":
                # 流式chunk不每次都打印，避免刷屏
                pass
            else:
                sys.stderr.write(f"[Worker] Received request: type={request_type}, session={session_id}\n")
                sys.stderr.flush()

            if request_type == "reset_session":
                sys.stderr.write(f"[Worker] Resetting session: {session_id}\n")
                sys.stderr.flush()
                sessions_cache.pop(session_id, None)
                continue

            if request_type == "force_commit":
                # JS 侧静音检测触发的强制提交
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
        sys.stderr.write(f"[Worker] Fatal error: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        send_ipc_message({"status": "fatal", "error": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

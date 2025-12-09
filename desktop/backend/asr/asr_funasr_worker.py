#!/usr/bin/env python3
"""
FunASR 2-Pass Worker: 基于 funasr_onnx 的流式/离线混合语音识别

参照 RealtimeMicPipeline demo 设计：
- Pass 1 (流式): ParaformerOnline 快速出字，用于实时显示
- Pass 2 (离线): ParaformerOffline + 标点模型，用于最终修正

分句策略：
- VAD 检测语音边界
- 静音累积达到阈值触发 Pass 2 修正
- 支持强制提交 (force_commit)
"""

import json
import os
import sys
import time
import traceback
import base64
from dataclasses import dataclass, field
from typing import Dict, List, Optional

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

MODELSCOPE_CACHE = os.environ.get("MODELSCOPE_CACHE") or os.environ.get("ASR_CACHE_DIR")
if MODELSCOPE_CACHE:
    os.environ.setdefault("MODELSCOPE_CACHE", MODELSCOPE_CACHE)
    os.environ.setdefault("MODELSCOPE_CACHE_HOME", MODELSCOPE_CACHE)

# 离线模式：如果设置了 MODELSCOPE_OFFLINE=1，则跳过网络请求，直接使用本地缓存
OFFLINE_MODE = os.environ.get("MODELSCOPE_OFFLINE", "").lower() in ("1", "true", "yes")
if OFFLINE_MODE:
    sys.stderr.write("[FunASR Worker] Offline mode enabled: using local cache only\n")
    sys.stderr.flush()
    # 设置 modelscope 离线模式相关环境变量
    os.environ["MODELSCOPE_OFFLINE"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    # 尝试配置 modelscope 库的离线模式
    try:
        from modelscope.hub.snapshot_download import snapshot_download
        from modelscope.hub.file_download import model_file_download
        # Monkey-patch: 让 modelscope 跳过版本检查
        import modelscope.hub.api as ms_api
        if hasattr(ms_api, 'HubApi'):
            _original_get_model_files = getattr(ms_api.HubApi, 'get_model_files', None)
            if _original_get_model_files:
                def _patched_get_model_files(self, model_id, revision=None, *args, **kwargs):
                    # 离线模式下直接返回空，让库使用本地缓存
                    return []
                ms_api.HubApi.get_model_files = _patched_get_model_files
    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] Warning: Could not configure modelscope offline mode: {e}\n")
        sys.stderr.flush()

# ==============================================================================
# FunASR 配置
# ==============================================================================
SAMPLE_RATE = int(os.environ.get("ASR_SAMPLE_RATE", "16000"))
CHUNK_MS = int(os.environ.get("ASR_CHUNK_MS", "200"))  # 每次读取的音频块时长 (毫秒)
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_MS / 1000)

# 静音检测配置
SILENCE_THRESHOLD_CHUNKS = int(os.environ.get("ASR_SILENCE_CHUNKS", "3"))  # 连续静音块数触发句尾
SILENCE_BUFFER_KEEP = 2  # 保留多少个静音块让音频更自然

# 分句配置
SENTENCE_END_PUNCTUATION = set("。！？!?.；;")
MIN_SENTENCE_CHARS = int(os.environ.get("MIN_SENTENCE_CHARS", "2"))


def smart_concat(history: str, new_text: str) -> str:
    """
    智能拼接流式文本：处理增量、全量、重叠等情况。
    """
    if not new_text:
        return history
    if not history:
        return new_text
    
    # 1. 检查 new_text 是否完全包含 history (说明 new_text 是全量更新)
    if new_text.startswith(history):
        return new_text
        
    # 2. 检查 history 是否完全包含 new_text (说明 new_text 是旧的全量或者是重复输出)
    if history.endswith(new_text):
        return history
        
    # 3. 检查重叠 (history后缀 与 new_text前缀)
    overlap_len = min(len(history), len(new_text))
    for i in range(overlap_len, 0, -1):
        if history.endswith(new_text[:i]):
            return history + new_text[i:]
            
    # 4. 无重叠，直接拼接
    return history + new_text


def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    """Base64 音频转 float32 numpy array（范围 -1~1）。"""
    audio_bytes = base64.b64decode(audio_b64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32)  # funasr_onnx 接受 float32，不除以 32768


def smart_split_sentences(text: str) -> List[str]:
    """
    智能分句：基于标点符号将长文本切分成自然的句子。
    
    策略：
    1. 优先按句末标点（。！？!?.）分割
    2. 如果分隔后的句子太短，考虑合并
    3. 如果没有句末标点，返回原文
    """
    if not text or len(text) < MIN_SENTENCE_CHARS:
        return [text] if text else []
    
    # 定义句末标点
    sentence_endings = "。！？!?."
    
    sentences = []
    current_sentence = ""
    
    for char in text:
        current_sentence += char
        if char in sentence_endings:
            trimmed = current_sentence.strip()
            if trimmed and len(trimmed) >= MIN_SENTENCE_CHARS:
                sentences.append(trimmed)
            elif trimmed and sentences:
                # 太短的句子合并到上一句
                sentences[-1] += trimmed
            elif trimmed:
                sentences.append(trimmed)
            current_sentence = ""
    
    # 处理剩余的文本
    remaining = current_sentence.strip()
    if remaining:
        if len(remaining) < MIN_SENTENCE_CHARS and sentences:
            # 太短就合并到上一句
            sentences[-1] += remaining
        else:
            sentences.append(remaining)
    
    return sentences if sentences else [text]



@dataclass
class SessionState:
    """
    FunASR 2-Pass 会话状态
    """
    # 音频缓冲区 (给 Pass 2 用)
    full_sentence_buffer: List[np.ndarray] = field(default_factory=list)
    
    # Pass 1 流式模型的上下文缓存
    online_cache: Dict = field(default_factory=dict)
    
    # 静音检测
    silence_counter: int = 0
    is_speaking: bool = False
    
    # 累积的流式文本
    streaming_text: str = ""
    last_sent_text: str = ""
    
    # 时间戳
    start_time: float = 0.0
    
    def reset(self):
        """重置会话状态"""
        self.full_sentence_buffer.clear()
        self.online_cache.clear()
        self.silence_counter = 0
        self.is_speaking = False
        self.streaming_text = ""
        self.last_sent_text = ""
        self.start_time = 0.0


def resolve_local_model_path(model_id: str) -> Optional[str]:
    """
    在离线模式下，解析本地模型路径。
    检查 MODELSCOPE_CACHE 和默认缓存目录下是否存在模型。
    """
    if not OFFLINE_MODE:
        return None
    
    import os.path
    cache_dirs = [
        os.environ.get("MODELSCOPE_CACHE"),
        os.environ.get("ASR_CACHE_DIR"),
        os.path.join(os.path.expanduser("~"), ".cache", "modelscope", "hub"),
    ]
    
    for cache_dir in cache_dirs:
        if not cache_dir:
            continue
        # ModelScope 缓存结构: hub/models/<model_id>/
        candidates = [
            os.path.join(cache_dir, model_id),
            os.path.join(cache_dir, "models", model_id),
        ]
        for candidate in candidates:
            if os.path.isdir(candidate):
                # 检查是否有模型文件
                files = os.listdir(candidate)
                if any(f.endswith(('.onnx', '.bin', '.json')) for f in files):
                    sys.stderr.write(f"[FunASR Worker] Found local model: {candidate}\n")
                    sys.stderr.flush()
                    return candidate
    
    return None


def load_funasr_onnx_models():
    """
    加载 funasr_onnx 模型 (VAD + 流式ASR + 离线ASR + 标点)
    
    支持的环境变量:
    - ASR_MODEL: 模型 ID (funasr-paraformer / funasr-paraformer-large)
        * funasr-paraformer: INT8 量化版，包体约 0.76GB（online/offline/punc/vad），速度更快
        * funasr-paraformer-large: FP32 未量化，约 2.1GB（按 INT8→FP32 体积估算），精度更高
    - ASR_QUANTIZE: 是否使用量化 (true/false)，默认根据模型类型自动选择
    - MODELSCOPE_OFFLINE: 离线模式，跳过网络请求直接使用本地缓存
    """
    try:
        from funasr_onnx.vad_bin import Fsmn_vad
        from funasr_onnx.paraformer_online_bin import Paraformer as ParaformerOnline
        from funasr_onnx.paraformer_bin import Paraformer as ParaformerOffline
        from funasr_onnx.punc_bin import CT_Transformer
    except ImportError as e:
        sys.stderr.write(f"[FunASR Worker] Import error: {e}\n")
        sys.stderr.write("[FunASR Worker] Please install: pip install funasr_onnx\n")
        sys.stderr.flush()
        raise

    # 读取模型配置
    model_id = os.environ.get("ASR_MODEL", "funasr-paraformer")
    is_large = "large" in model_id.lower()
    
    # Large 版本默认不使用量化，精度更高
    quantize_env = os.environ.get("ASR_QUANTIZE", "").lower()
    if quantize_env in ("true", "1", "yes"):
        use_quantize = True
    elif quantize_env in ("false", "0", "no"):
        use_quantize = False
    else:
        # 默认: 普通版量化，Large版不量化
        use_quantize = not is_large
    
    sys.stderr.write(f"[FunASR Worker] Model ID: {model_id}\n")
    sys.stderr.write(f"[FunASR Worker] Is Large model: {is_large}\n")
    sys.stderr.write(f"[FunASR Worker] Use Quantize: {use_quantize}\n")
    sys.stderr.write(f"[FunASR Worker] Offline mode: {OFFLINE_MODE}\n")
    sys.stderr.write(f"[FunASR Worker] Preset size hint: {'~0.76GB INT8 (default)' if use_quantize else '~2.1GB FP32 (higher accuracy)'}\n")
    if OFFLINE_MODE:
        sys.stderr.write("[FunASR Worker] Loading ONNX models from local cache (offline mode)...\n")
    else:
        sys.stderr.write("[FunASR Worker] Loading ONNX models (first run will download)...\n")
    sys.stderr.flush()

    # ONNX 模型配置
    # 可以通过环境变量覆盖默认模型
    vad_model_id = os.environ.get(
        "FUNASR_VAD_MODEL", 
        "damo/speech_fsmn_vad_zh-cn-16k-common-onnx"
    )
    online_model_id = os.environ.get(
        "FUNASR_ONLINE_MODEL",
        "damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx"
    )
    offline_model_id = os.environ.get(
        "FUNASR_OFFLINE_MODEL",
        "damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx"
    )
    punc_model_id = os.environ.get(
        "FUNASR_PUNC_MODEL",
        "damo/punc_ct-transformer_zh-cn-common-vocab272727-onnx"
    )
    
    # 离线模式下，尝试解析本地路径
    vad_model_dir = resolve_local_model_path(vad_model_id) or vad_model_id
    online_model_dir = resolve_local_model_path(online_model_id) or online_model_id
    offline_model_dir = resolve_local_model_path(offline_model_id) or offline_model_id
    punc_model_dir = resolve_local_model_path(punc_model_id) or punc_model_id

    # 1. VAD 模型: 检测语音活动
    sys.stderr.write(f"[FunASR Worker] Loading VAD model: {vad_model_dir}...\n")
    sys.stderr.flush()
    vad_model = Fsmn_vad(
        model_dir=vad_model_dir,
        quantize=use_quantize
    )

    # 2. Pass 1 流式模型: 快速出字
    sys.stderr.write(f"[FunASR Worker] Loading streaming ASR model (Pass 1): {online_model_dir}...\n")
    sys.stderr.flush()
    asr_online_model = ParaformerOnline(
        model_dir=online_model_dir,
        batch_size=1,
        quantize=use_quantize,
        intra_op_num_threads=4
    )

    # 3. Pass 2 非流式模型: 高精度识别
    sys.stderr.write(f"[FunASR Worker] Loading offline ASR model (Pass 2): {offline_model_dir}...\n")
    sys.stderr.flush()
    asr_offline_model = ParaformerOffline(
        model_dir=offline_model_dir,
        batch_size=1,
        quantize=use_quantize,
        intra_op_num_threads=4
    )

    # 4. 标点模型: 给 Pass 2 结果加标点
    sys.stderr.write(f"[FunASR Worker] Loading punctuation model: {punc_model_dir}...\n")
    sys.stderr.flush()
    punc_model = CT_Transformer(
        model_dir=punc_model_dir,
        quantize=use_quantize,
        intra_op_num_threads=2
    )

    sys.stderr.write("[FunASR Worker] All models loaded successfully!\n")
    sys.stderr.write(f"[FunASR Worker] Configuration: model={model_id}, quantize={use_quantize}\n")
    sys.stderr.flush()

    return vad_model, asr_online_model, asr_offline_model, punc_model


def handle_streaming_chunk(
    vad_model,
    asr_online_model,
    asr_offline_model,
    punc_model,
    data: dict,
    sessions_cache: Dict[str, SessionState],
):
    """
    处理流式音频块 - 2-Pass 架构
    
    Pass 1: 实时流式识别，快速返回 partial 结果
    Pass 2: 检测到句尾后，使用离线模型 + 标点进行高精度修正
    """
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    audio_data_b64 = data.get("audio_data")
    is_final = bool(data.get("is_final", False))
    timestamp_ms = data.get("timestamp", int(time.time() * 1000))

    if not audio_data_b64:
        send_ipc_message({"request_id": request_id, "error": "No audio_data provided"})
        return

    state = sessions_cache.setdefault(session_id, SessionState())
    audio_chunk = decode_audio_chunk(audio_data_b64)

    if audio_chunk.size == 0:
        return

    # 记录开始时间
    if not state.is_speaking and state.start_time == 0:
        state.start_time = time.time()

    # ==== VAD 检测 ====
    try:
        vad_segments = vad_model(audio_chunk)
        current_chunk_has_speech = len(vad_segments) > 0
    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] VAD error: {e}\n")
        sys.stderr.flush()
        current_chunk_has_speech = True  # 出错时保守处理

    # ==== 状态管理 ====
    if current_chunk_has_speech:
        state.silence_counter = 0
        state.is_speaking = True
        state.full_sentence_buffer.append(audio_chunk)
    else:
        if state.is_speaking:
            state.silence_counter += 1
            # 保留一点静音段让音频更自然
            if state.silence_counter < SILENCE_BUFFER_KEEP:
                state.full_sentence_buffer.append(audio_chunk)

    # ==== Pass 1: 实时流式识别 ====
    if state.is_speaking:
        try:
            partial_res = asr_online_model(
                audio_chunk,
                param_dict={"cache": state.online_cache, "is_final": False},
            )

            if partial_res:
                # 调试日志：查看实际返回的格式
                sys.stderr.write(f"[FunASR Worker] DEBUG partial_res type={type(partial_res).__name__}, value={str(partial_res)[:100]}\n")
                sys.stderr.flush()
                
                # funasr_onnx 返回格式可能是:
                # 1. [('text', ['chars'])] - 列表包含 tuple
                # 2. [{'preds': 'text'}] - 列表包含字典
                # 3. ('text', ['chars']) - 直接是 tuple
                text = ""
                
                # 先解包列表
                item = partial_res
                while isinstance(item, list) and len(item) > 0:
                    item = item[0]
                
                # 现在 item 应该是 tuple 或 dict 或 str
                if isinstance(item, dict):
                    preds_value = item.get("preds") or item.get("text") or ""
                    # 如果 preds 是 tuple，需要提取字符串
                    if isinstance(preds_value, tuple) and len(preds_value) > 0:
                        text = preds_value[0] if isinstance(preds_value[0], str) else str(preds_value[0])
                    elif isinstance(preds_value, str):
                        text = preds_value
                    else:
                        text = str(preds_value) if preds_value else ""
                elif isinstance(item, tuple) and len(item) > 0:
                    # Tuple 格式: ('text', ['chars']) - 取第一个元素
                    first_elem = item[0]
                    text = first_elem if isinstance(first_elem, str) else str(first_elem)
                elif isinstance(item, str):
                    text = item
                else:
                    text = str(item) if item else ""
                
                sys.stderr.write(f"[FunASR Worker] DEBUG extracted text=\"{text[:50]}...\"\n")
                sys.stderr.flush()
                
                if text:
                    # 使用智能拼接更新 streaming_text，解决流式输出不连续问题
                    new_streaming = smart_concat(state.streaming_text, text)
                    
                    if new_streaming != state.streaming_text:
                        state.streaming_text = new_streaming
                        send_ipc_message({
                            "request_id": request_id,
                            "session_id": session_id,
                            "type": "partial",
                            "text": state.streaming_text,
                            "full_text": state.streaming_text,
                            "timestamp": timestamp_ms,
                            "is_final": False,
                            "status": "success",
                            "language": "zh",
                        })
                        state.last_sent_text = text
                        sys.stderr.write(f"[FunASR Worker] 📝 PARTIAL: \"{state.streaming_text[-50:]}...\"\n")
                        sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[FunASR Worker] Pass 1 error: {e}\n")
            sys.stderr.flush()

    # ==== Pass 2: 检测到句尾，触发高精度修正 ====
    if state.is_speaking and state.silence_counter >= SILENCE_THRESHOLD_CHUNKS:
        _trigger_pass2(
            asr_offline_model,
            punc_model,
            state,
            request_id,
            session_id,
            timestamp_ms,
            trigger="silence",
        )

    # ==== 处理 is_final 标记 ====
    if is_final and state.full_sentence_buffer:
        _trigger_pass2(
            asr_offline_model,
            punc_model,
            state,
            request_id,
            session_id,
            timestamp_ms,
            trigger="final",
        )


def _trigger_pass2(
    asr_offline_model,
    punc_model,
    state: SessionState,
    request_id: str,
    session_id: str,
    timestamp_ms: int,
    trigger: str,
):
    """
    触发 Pass 2: 离线高精度识别 + 标点 + 智能分句
    
    改进：使用标点模型结果进行智能分句，将长文本拆分成多个自然句子分别发送。
    """
    if not state.full_sentence_buffer:
        return

    sys.stderr.write(f"[FunASR Worker] Triggering Pass 2 ({trigger})...\n")
    sys.stderr.flush()

    try:
        # 合并音频片段
        complete_audio = np.concatenate(state.full_sentence_buffer)
        audio_duration = len(complete_audio) / SAMPLE_RATE

        # A. 非流式高精度识别
        offline_res = asr_offline_model(complete_audio)
        raw_text = ""
        if offline_res:
            # 解析返回值（可能是 tuple 或 dict）
            item = offline_res[0] if isinstance(offline_res, list) else offline_res
            if isinstance(item, dict):
                raw_text = item.get("preds") or item.get("text") or ""
            elif isinstance(item, (tuple, list)) and len(item) > 0:
                raw_text = item[0] if isinstance(item[0], str) else str(item[0])
            elif isinstance(item, str):
                raw_text = item
            else:
                raw_text = str(item) if item else ""

        if raw_text and len(raw_text) >= MIN_SENTENCE_CHARS:
            # B. 标点预测
            try:
                punc_res = punc_model(raw_text)
                # 解析标点模型返回值
                if punc_res:
                    punc_item = punc_res[0] if isinstance(punc_res, list) else punc_res
                    if isinstance(punc_item, str):
                        punctuated_text = punc_item
                    elif isinstance(punc_item, (tuple, list)) and len(punc_item) > 0:
                        punctuated_text = punc_item[0] if isinstance(punc_item[0], str) else str(punc_item[0])
                    else:
                        punctuated_text = str(punc_item) if punc_item else raw_text
                else:
                    punctuated_text = raw_text
            except Exception as e:
                sys.stderr.write(f"[FunASR Worker] Punctuation error: {e}\n")
                sys.stderr.flush()
                punctuated_text = raw_text

            sys.stderr.write(f"[FunASR Worker]    Raw: \"{raw_text}\"\n")
            sys.stderr.write(f"[FunASR Worker]    With punc: \"{punctuated_text}\"\n")
            sys.stderr.flush()

            # C. 智能分句：将长文本拆分成多个自然句子
            sentences = smart_split_sentences(punctuated_text)
            
            # 计算每个句子的大致时间分布
            total_chars = sum(len(s) for s in sentences)
            current_time = state.start_time * 1000 if state.start_time else timestamp_ms - (audio_duration * 1000)
            
            for i, sentence in enumerate(sentences):
                # 估算这个句子的时间范围
                sentence_ratio = len(sentence) / max(total_chars, 1)
                sentence_duration = audio_duration * sentence_ratio
                sentence_end_time = current_time + (sentence_duration * 1000)
                
                is_last = (i == len(sentences) - 1)
                
                sys.stderr.write(f"[FunASR Worker] 🎯 SENTENCE [{i+1}/{len(sentences)}]: \"{sentence[:50]}...\"\n")
                sys.stderr.flush()

                send_ipc_message({
                    "request_id": request_id,
                    "session_id": session_id,
                    "type": "sentence_complete",
                    "text": sentence,
                    "raw_text": raw_text if i == 0 else "",  # 只在第一句附带原始文本
                    "timestamp": int(sentence_end_time),
                    "is_final": is_last,
                    "status": "success",
                    "language": "zh",
                    "audio_duration": sentence_duration,
                    "trigger": trigger,
                    "start_time": int(current_time),
                    "end_time": int(sentence_end_time),
                    "sentence_index": i,
                    "total_sentences": len(sentences),
                })
                
                current_time = sentence_end_time

    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] Pass 2 error: {e}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()

    # 重置状态，准备下一句
    state.reset()


def handle_force_commit(
    asr_offline_model,
    punc_model,
    data: dict,
    sessions_cache: Dict[str, SessionState],
):
    """强制提交当前句子"""
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)
    timestamp_ms = int(time.time() * 1000)

    sys.stderr.write(f"[FunASR Worker] force_commit received for session={session_id}\n")
    sys.stderr.flush()

    state = sessions_cache.get(session_id)
    if not state:
        sys.stderr.write(f"[FunASR Worker] No session state found for session={session_id}\n")
        sys.stderr.flush()
        return

    # 如果有缓冲的音频，触发 Pass 2
    if state.full_sentence_buffer:
        _trigger_pass2(
            asr_offline_model,
            punc_model,
            state,
            request_id,
            session_id,
            timestamp_ms,
            trigger="force_commit",
        )
    elif state.streaming_text and len(state.streaming_text) >= MIN_SENTENCE_CHARS:
        # 没有缓冲的音频，但有流式文本，直接提交流式文本
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "type": "sentence_complete",
            "text": state.streaming_text,
            "timestamp": timestamp_ms,
            "is_final": True,
            "status": "success",
            "trigger": "force_commit_text_only",
            "language": "zh",
            "audio_duration": 0,
        })
        state.reset()
    else:
        sys.stderr.write(f"[FunASR Worker] force_commit: no content to commit\n")
        sys.stderr.flush()


def handle_batch_file(asr_offline_model, punc_model, data: dict):
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
        # 读取音频文件
        import wave
        with wave.open(audio_path, 'rb') as wf:
            audio_data = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
            audio_float = audio_data.astype(np.float32)

        # 离线识别
        offline_res = asr_offline_model(audio_float)
        raw_text = ""
        if offline_res:
            # 解析返回值（可能是 tuple 或 dict）
            item = offline_res[0] if isinstance(offline_res, list) else offline_res
            if isinstance(item, dict):
                raw_text = item.get("preds") or item.get("text") or ""
            elif isinstance(item, (tuple, list)) and len(item) > 0:
                raw_text = item[0] if isinstance(item[0], str) else str(item[0])
            elif isinstance(item, str):
                raw_text = item
            else:
                raw_text = str(item) if item else ""

        # 标点
        if raw_text:
            try:
                punc_res = punc_model(raw_text)
                # 解析标点模型返回值
                if punc_res:
                    punc_item = punc_res[0] if isinstance(punc_res, list) else punc_res
                    if isinstance(punc_item, str):
                        final_text = punc_item
                    elif isinstance(punc_item, (tuple, list)) and len(punc_item) > 0:
                        final_text = punc_item[0] if isinstance(punc_item[0], str) else str(punc_item[0])
                    else:
                        final_text = str(punc_item) if punc_item else raw_text
                else:
                    final_text = raw_text
            except Exception:
                final_text = raw_text
        else:
            final_text = ""

        send_ipc_message({
            "request_id": request_id,
            "text": final_text,
            "raw_text": raw_text,
            "language": "zh",
            "status": "success",
        })

    except Exception as exc:
        send_ipc_message({
            "request_id": request_id,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })


def main():
    try:
        sys.stderr.write("[FunASR Worker] Starting FunASR 2-Pass Worker...\n")
        sys.stderr.flush()

        # 加载模型
        vad_model, asr_online_model, asr_offline_model, punc_model = load_funasr_onnx_models()

        sessions_cache: Dict[str, SessionState] = {}
        send_ipc_message({"status": "ready"})

        sys.stderr.write("[FunASR Worker] Ready! 2-Pass mode enabled.\n")
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
                sys.stderr.write(f"[FunASR Worker] Resetting session: {session_id}\n")
                sys.stderr.flush()
                sessions_cache.pop(session_id, None)
                continue

            if request_type == "force_commit":
                handle_force_commit(asr_offline_model, punc_model, data, sessions_cache)
                continue

            if request_type == "streaming_chunk":
                handle_streaming_chunk(
                    vad_model,
                    asr_online_model,
                    asr_offline_model,
                    punc_model,
                    data,
                    sessions_cache,
                )
                continue

            if request_type == "batch_file" or "audio_path" in data:
                handle_batch_file(asr_offline_model, punc_model, data)
                continue

            send_ipc_message({
                "request_id": request_id,
                "error": f"Unknown request type: {request_type}",
            })

    except Exception as exc:
        sys.stderr.write(f"[FunASR Worker] Fatal error: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        send_ipc_message({"status": "fatal", "error": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()

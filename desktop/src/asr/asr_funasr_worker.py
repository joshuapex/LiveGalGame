#!/usr/bin/env python3
"""
FunASR Worker with Streaming Recognition

基于 FunASR/paraformer-zh-streaming 的流式语音识别引擎
支持实时音频流识别、中文标点符号添加和时间戳预测。

核心特性：
1. 滑动窗口流式识别
2. 缓存机制维持上下文
3. 中文标点符号优化
4. 混合分句策略

IPC 协议：
- 输入：streaming_chunk, batch_file, reset_session, force_commit
- 输出：
  - partial: 实时字幕（增量文本）
  - sentence_complete: 完整句子（触发存库）
"""

import base64
import json
import math
import os
import sys
import time
import traceback
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import numpy as np
from funasr import AutoModel

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
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ.setdefault("TQDM_DISABLE", "1")

HF_HOME = os.environ.get("HF_HOME")
DEFAULT_CACHE_DIR = os.path.join(HF_HOME, "hub") if HF_HOME else os.path.expanduser("~/.cache/huggingface/hub")
CACHE_DIR = os.environ.get("ASR_CACHE_DIR") or DEFAULT_CACHE_DIR
os.makedirs(CACHE_DIR, exist_ok=True)

# ==============================================================================
# FunASR 配置
# ==============================================================================
SAMPLE_RATE = int(os.environ.get("ASR_SAMPLE_RATE", "16000"))

# 滑动窗口配置
CHUNK_SIZE = os.environ.get("FUNASR_CHUNK_SIZE", "0,10,5")  # ctx,left,right
CHUNK_SIZE_LIST = [int(x) for x in CHUNK_SIZE.split(",")]
ENCODER_LOOK_BACK = int(os.environ.get("FUNASR_ENCODER_LOOK_BACK", "4"))
DECODER_LOOK_BACK = int(os.environ.get("FUNASR_DECODER_LOOK_BACK", "1"))

# 识别窗口配置
MIN_NEW_AUDIO_SECONDS = float(os.environ.get("ASR_MIN_NEW_AUDIO", "0.5"))
MAX_BUFFER_SECONDS = float(os.environ.get("ASR_BUFFER_SECONDS", "30"))
LOOKBACK_SECONDS = float(os.environ.get("ASR_LOOKBACK_SECONDS", "1.0"))
MIN_DECODE_SAMPLES = int(0.4 * 16000)  # 最小解码采样数

MIN_NEW_AUDIO_SAMPLES = int(MIN_NEW_AUDIO_SECONDS * SAMPLE_RATE)
MAX_BUFFER_SAMPLES = int(MAX_BUFFER_SECONDS * SAMPLE_RATE)

# 分句配置
SENTENCE_END_PUNCTUATION = set("。！？!?.；;")
CLAUSE_PUNCTUATION = set("，,、：:")
MIN_SENTENCE_CHARS = int(os.environ.get("MIN_SENTENCE_CHARS", "4"))
# 【优化】提高自动提交门槛，减少句子截断
MIN_AUTO_COMMIT_CHARS = int(os.environ.get("MIN_AUTO_COMMIT_CHARS", "30"))  # 从18提高到30
MAX_SENTENCE_SECONDS = float(os.environ.get("MAX_SENTENCE_SECONDS", "20"))  # 从15提高到20
# 【优化】提高停顿检测阈值，减少误判
SEGMENT_GAP_THRESHOLD = float(os.environ.get("SEGMENT_GAP_THRESHOLD", "1.2"))  # 从0.5提高到1.2

# 【优化】标点添加策略配置 - 降低延迟，提升响应速度
PUNC_DEBOUNCE_INTERVAL = float(os.environ.get("PUNC_DEBOUNCE_INTERVAL", "0.3"))  # 从0.8降至0.3秒
MIN_CHARS_FOR_PUNC = int(os.environ.get("MIN_CHARS_FOR_PUNC", "3"))  # 从6降至3个字符
PUNC_CONTEXT_SENTENCES = int(os.environ.get("PUNC_CONTEXT_SENTENCES", "2"))  # 保留多少个已完成句子作为上下文


@dataclass
class SentenceBuffer:
    """当前正在构建的句子"""
    text: str = ""
    start_time: float = 0.0
    last_update_time: float = 0.0


# 【核心修复】FunASR 流式模型需要固定大小的 chunk
# chunk_size = [0, 10, 5] 意味着 stride = 10 * 60ms = 600ms = 9600 samples
FUNASR_STRIDE_SAMPLES = int(CHUNK_SIZE_LIST[1] * 0.06 * SAMPLE_RATE)


@dataclass
class SessionState:
    """
    FunASR 会话状态，管理音频缓冲和分句

    【核心修复】添加音频累积器，确保按固定大小送入模型
    """
    # 【新增】音频累积缓冲区
    audio_buffer: np.ndarray = field(default_factory=lambda: np.array([], dtype=np.float32))
    processed_samples: int = 0
    current_sentence: SentenceBuffer = field(default_factory=SentenceBuffer)
    last_partial_text: str = ""
    funasr_cache: Dict = field(default_factory=dict)
    completed_sentences: List[str] = field(default_factory=list)
    # 【优化】增量标点化状态
    last_punc_time: float = 0.0
    raw_text_buffer: str = ""  # 原始未加标点的文本缓冲
    stable_punctuated_text: str = ""  # 已稳定的标点化文本（最后一个句末标点之前）
    unstable_raw_text: str = ""  # 不稳定的原始文本（最后一个句末标点之后）

    def append_audio(self, samples: np.ndarray):
        """累积音频数据"""
        if self.audio_buffer.size == 0:
            self.audio_buffer = samples.astype(np.float32)
        else:
            self.audio_buffer = np.concatenate([self.audio_buffer, samples.astype(np.float32)])

    def get_next_chunk(self) -> Tuple[np.ndarray, bool]:
        """
        获取下一个固定大小的 chunk
        返回: (chunk, has_more)
        """
        if self.audio_buffer.size >= FUNASR_STRIDE_SAMPLES:
            chunk = self.audio_buffer[:FUNASR_STRIDE_SAMPLES]
            self.audio_buffer = self.audio_buffer[FUNASR_STRIDE_SAMPLES:]
            return chunk, self.audio_buffer.size >= FUNASR_STRIDE_SAMPLES
        return None, False

    def get_remaining_audio(self) -> np.ndarray:
        """获取剩余的音频（用于 is_final）"""
        remaining = self.audio_buffer
        self.audio_buffer = np.array([], dtype=np.float32)
        return remaining

    def update_processed_samples(self, samples: int):
        """记录已处理的采样点数量"""
        self.processed_samples += samples

    def reset(self):
        """完全重置会话状态"""
        self.audio_buffer = np.array([], dtype=np.float32)
        self.processed_samples = 0
        self.current_sentence = SentenceBuffer()
        self.last_partial_text = ""
        self.completed_sentences.clear()
        self.funasr_cache = {}
        self.last_punc_time = 0.0
        self.raw_text_buffer = ""
        self.stable_punctuated_text = ""
        self.unstable_raw_text = ""


def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    """解码音频块"""
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

    # 尝试找到最长的重叠部分
    max_overlap = min(len(previous), len(current))
    for overlap in range(max_overlap, 0, -1):
        if previous[-overlap:] == current[:overlap]:
            return current[overlap:]
    return current


def find_last_sentence_end(text: str) -> int:
    """找到文本中最后一个句末标点的位置
    
    返回：最后一个句末标点之后的位置索引，如果没有找到返回 0
    """
    last_pos = -1
    for i, char in enumerate(text):
        if char in SENTENCE_END_PUNCTUATION:
            last_pos = i
    return last_pos + 1 if last_pos >= 0 else 0


def split_stable_unstable(text: str) -> Tuple[str, str]:
    """将文本分割为稳定部分（最后句末标点之前）和不稳定部分（之后）
    
    返回：(stable_part, unstable_part)
    """
    last_end_pos = find_last_sentence_end(text)
    return text[:last_end_pos], text[last_end_pos:]


def find_sentence_boundaries(text: str) -> List[Tuple[int, str]]:
    """找到文本中的句子边界"""
    boundaries = []
    for i, char in enumerate(text):
        if char in SENTENCE_END_PUNCTUATION:
            boundaries.append((i + 1, 'end'))
        elif char in CLAUSE_PUNCTUATION:
            boundaries.append((i + 1, 'clause'))
    return boundaries


def split_by_sentence_end(text: str) -> Tuple[List[str], str]:
    """按句末标点分割文本"""
    import re
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


def load_funasr_models() -> Tuple[AutoModel, AutoModel, AutoModel]:
    """加载 FunASR 模型
    
    使用 ModelScope (默认 hub="ms") 下载模型，国内访问更稳定。
    模型名称映射参见 funasr/download/name_maps_from_hub.py:
      - paraformer-zh-streaming -> iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online
      - ct-punc -> iic/punc_ct-transformer_cn-en-common-vocab471067-large
      - fa-zh -> iic/speech_timestamp_prediction-v1-16k-offline
    
    【重要】使用 model_revision="v2.0.4" 与测试 Demo 保持一致
    """
    sys.stderr.write(f"[FunASR Worker] Loading models from cache: {CACHE_DIR}\n")
    sys.stderr.write(f"[FunASR Worker] Chunk stride: {FUNASR_STRIDE_SAMPLES} samples ({FUNASR_STRIDE_SAMPLES/SAMPLE_RATE*1000:.0f}ms)\n")
    sys.stderr.flush()

    try:
        # 流式识别模型 - 使用 FunASR 官方注册名称，内部会映射到 ModelScope 仓库
        # 【重要】指定 model_revision="v2.0.4" 与 Demo 保持一致
        sys.stderr.write("[FunASR Worker] Loading streaming ASR model: paraformer-zh-streaming (v2.0.4)\n")
        stream_model = AutoModel(
            model="paraformer-zh-streaming",
            model_revision="v2.0.4",
        )
        sys.stderr.write("[FunASR Worker] Streaming model loaded\n")

        # 标点符号模型
        sys.stderr.write("[FunASR Worker] Loading punctuation model: ct-punc (v2.0.4)\n")
        punc_model = AutoModel(
            model="ct-punc",
            model_revision="v2.0.4",
        )
        sys.stderr.write("[FunASR Worker] Punctuation model loaded\n")

        # 时间戳预测模型（可选）
        try:
            sys.stderr.write("[FunASR Worker] Loading timestamp model: fa-zh (v2.0.4)\n")
            ts_model = AutoModel(
                model="fa-zh",
                model_revision="v2.0.4",
            )
            sys.stderr.write("[FunASR Worker] Timestamp model loaded\n")
        except Exception as e:
            sys.stderr.write(f"[FunASR Worker] Timestamp model load failed (optional): {e}\n")
            ts_model = None

        sys.stderr.flush()
        return stream_model, punc_model, ts_model

    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] Model loading failed: {e}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        raise


def funasr_streaming_recognition(
    audio_array: np.ndarray,
    model: AutoModel,
    cache: Dict,
    is_final: bool = False
) -> str:
    """
    FunASR 流式识别

    返回：增量文本
    """
    try:
        # FunASR 流式识别调用
        results = model.generate(
            input=audio_array,
            cache=cache,
            is_final=is_final,
            chunk_size=CHUNK_SIZE_LIST,
            encoder_chunk_look_back=ENCODER_LOOK_BACK,
            decoder_chunk_look_back=DECODER_LOOK_BACK,
        )

        # 提取文本
        chunk_text = ""
        if isinstance(results, list) and results:
            for item in results:
                if isinstance(item, dict) and "text" in item:
                    chunk_text += item["text"]
        elif isinstance(results, dict) and "text" in results:
            chunk_text = results["text"]

        return chunk_text.strip()

    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] Streaming recognition failed: {e}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        return ""


def apply_punctuation(text: str, model: AutoModel) -> str:
    """应用标点符号"""
    if not text or not text.strip():
        return text

    try:
        response = model.generate(input=text.strip())
        if response and isinstance(response, list) and len(response) > 0:
            if isinstance(response[0], dict):
                punctuated_text = response[0].get("text", "") or response[0].get("value", "")
                return punctuated_text.strip() if punctuated_text else text
            else:
                return str(response[0]).strip()
        elif isinstance(response, dict):
            punctuated_text = response.get("text", "") or response.get("value", "")
            return punctuated_text.strip() if punctuated_text else text
        return text
    except Exception as e:
        sys.stderr.write(f"[FunASR Worker] Punctuation failed: {e}\n")
        return text


def apply_incremental_punctuation(
    stable_text: str,
    new_raw_text: str,
    punc_model: AutoModel,
    context_sentences: int = 1
) -> str:
    """
    增量标点化：只对新文本添加标点，保留上下文提升准确性
    
    Args:
        stable_text: 已经标点化且稳定的文本
        new_raw_text: 新增的未标点化文本
        punc_model: 标点模型
        context_sentences: 保留多少个已完成句子作为上下文
    
    Returns:
        标点化后的新文本（不包含上下文）
    """
    if not new_raw_text or not new_raw_text.strip():
        return ""
    
    # 从 stable_text 中提取上下文（最后 N 个句子）
    context = ""
    if stable_text and context_sentences > 0:
        # 找到所有句末标点位置
        sentence_ends = []
        for i, char in enumerate(stable_text):
            if char in SENTENCE_END_PUNCTUATION:
                sentence_ends.append(i + 1)
        
        # 取最后 N 个句子
        if sentence_ends:
            start_pos = sentence_ends[-context_sentences] if len(sentence_ends) >= context_sentences else 0
            context = stable_text[start_pos:]
    
    # 组合上下文 + 新文本进行标点化
    text_to_punctuate = f"{context}{new_raw_text}"
    punctuated_full = apply_punctuation(text_to_punctuate, punc_model)
    
    # 提取新文本对应的标点化结果
    if context:
        # 移除上下文部分，只返回新文本的标点化结果
        # 由于标点可能改变长度，我们需要智能匹配
        context_len = len(context)
        # 简化处理：假设上下文部分基本不变，直接截取
        if len(punctuated_full) > context_len:
            return punctuated_full[context_len:]
        else:
            # 如果标点化后反而变短了，说明可能有问题，返回原始新文本
            return new_raw_text
    else:
        return punctuated_full


def process_single_chunk(
    stream_model: AutoModel,
    punc_model: AutoModel,
    chunk: np.ndarray,
    state: SessionState,
    request_id: str,
    session_id: str,
    is_final: bool,
) -> str:
    """
    处理单个固定大小的 chunk
    返回：识别文本（RAW，无标点）
    """
    try:
        raw_text = funasr_streaming_recognition(
            chunk,
            stream_model,
            state.funasr_cache,
            is_final=is_final,
        )
        return raw_text
    except Exception as exc:
        sys.stderr.write(f"[FunASR Worker] Chunk recognition failed: {exc}\n")
        sys.stderr.flush()
        return ""


def handle_streaming_chunk(
    stream_model: AutoModel,
    punc_model: AutoModel,
    data: Dict,
    sessions_cache: Dict[str, SessionState],
):
    """
    【核心修复】按照固定 stride 大小处理流式音频
    
    关键改进：
    1. 累积音频数据到缓冲区
    2. 按照 FUNASR_STRIDE_SAMPLES (9600 samples = 600ms) 切分
    3. 每个 chunk 依次送入模型，维护 cache 连续性
    """
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

    # 【核心】累积音频到缓冲区
    state.append_audio(samples)
    
    timestamp_ms = int(time.time() * 1000)
    sys.stderr.write(
        f"[FunASR Worker] Audio received: session={session_id}, new_samples={len(samples)}, "
        f"buffer_size={state.audio_buffer.size}, stride={FUNASR_STRIDE_SAMPLES}\n"
    )
    sys.stderr.flush()

    # 【核心】按固定大小切分并依次处理
    accumulated_text = ""
    chunks_processed = 0
    
    while True:
        chunk, has_more = state.get_next_chunk()
        if chunk is None:
            break
        
        chunks_processed += 1
        chunk_text = process_single_chunk(
            stream_model, punc_model, chunk, state,
            request_id, session_id, is_final=False
        )
        if chunk_text:
            accumulated_text += chunk_text
            sys.stderr.write(f"[FunASR Worker] Chunk #{chunks_processed} text: \"{chunk_text[:30]}...\"\n")
            sys.stderr.flush()
        
        state.update_processed_samples(len(chunk))

    # 如果是最终块，处理剩余音频
    if is_final:
        remaining = state.get_remaining_audio()
        if remaining.size > 0:
            chunks_processed += 1
            final_text = process_single_chunk(
                stream_model, punc_model, remaining, state,
                request_id, session_id, is_final=True
            )
            if final_text:
                accumulated_text += final_text
                sys.stderr.write(f"[FunASR Worker] Final chunk text: \"{final_text[:30]}...\"\n")
                sys.stderr.flush()
            state.update_processed_samples(len(remaining))

    if chunks_processed > 0:
        sys.stderr.write(
            f"[FunASR Worker] Processed {chunks_processed} chunks, "
            f"accumulated_text=\"{accumulated_text[:50]}...\"\n"
        )
        sys.stderr.flush()

    if not accumulated_text:
        return

    # =========================================================================
    # 分句处理逻辑
    # =========================================================================
    chunk_start_time_ms = (state.processed_samples - len(samples)) / SAMPLE_RATE * 1000
    chunk_end_time_ms = state.processed_samples / SAMPLE_RATE * 1000
    audio_duration = len(samples) / SAMPLE_RATE

    # 更新原始文本缓冲区（无标点）
    state.raw_text_buffer += accumulated_text
    # 【关键修复】同步更新不稳定区域的原始文本
    state.unstable_raw_text += accumulated_text
    
    sentence_start_time_sec = state.current_sentence.start_time
    if not sentence_start_time_sec:
        sentence_start_time_sec = chunk_start_time_ms / 1000
        state.current_sentence.start_time = sentence_start_time_sec

    # 【优化1】立即更新显示文本（原始文本），不等待标点化
    # 让UI能够实时显示任何识别到的内容
    state.current_sentence.text = f"{state.stable_punctuated_text}{state.unstable_raw_text}"
    
    # 【优化2】先发送partial消息显示原始文本
    current_buffer = state.current_sentence.text
    if current_buffer:
        incremental = extract_incremental_text(state.last_partial_text, current_buffer).strip()
        if incremental:
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "partial",
                "text": incremental,
                "full_text": current_buffer,
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": "zh",
            })
            sys.stderr.write(f"[FunASR Worker] 📝 PARTIAL (raw): \"{incremental[:30]}...\"\n")
            sys.stderr.flush()
            state.last_partial_text = current_buffer

    # 【优化3】异步标点化 - 检查是否需要添加标点（防抖）
    current_time = time.time()
    should_punctuate = (
        len(state.unstable_raw_text) >= MIN_CHARS_FOR_PUNC and
        (current_time - state.last_punc_time) >= PUNC_DEBOUNCE_INTERVAL
    )
    
    # 4. 如果满足条件，只对不稳定区域（新文本）添加标点
    if should_punctuate:
        # 使用增量标点化，保留上下文
        new_punctuated = apply_incremental_punctuation(
            state.stable_punctuated_text,
            state.unstable_raw_text,
            punc_model,
            context_sentences=PUNC_CONTEXT_SENTENCES
        )
        
        # 更新当前显示文本
        state.current_sentence.text = f"{state.stable_punctuated_text}{new_punctuated}"
        state.last_punc_time = current_time
        
        sys.stderr.write(
            f"[FunASR Worker] 🔤 Incremental punctuation: "
            f"stable={len(state.stable_punctuated_text)} chars, "
            f"new_raw={len(state.unstable_raw_text)} chars, "
            f"new_punc={len(new_punctuated)} chars\n"
        )
        sys.stderr.flush()
        
        # 【优化4】标点化后再次发送partial更新，优化显示效果
        incremental_punc = extract_incremental_text(state.last_partial_text, state.current_sentence.text).strip()
        if incremental_punc:
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "partial",
                "text": incremental_punc,
                "full_text": state.current_sentence.text,
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": "zh",
            })
            sys.stderr.write(f"[FunASR Worker] 📝 PARTIAL (punctuated): \"{incremental_punc[:30]}...\"\n")
            sys.stderr.flush()
            state.last_partial_text = state.current_sentence.text
    
    # 3. 对当前文本进行分句检查
    text_for_split = state.current_sentence.text
    
    # 如果文本还未标点化，临时标点化用于分句判断
    if not should_punctuate and len(state.unstable_raw_text) >= MIN_CHARS_FOR_PUNC:
        temp_punctuated = apply_incremental_punctuation(
            state.stable_punctuated_text,
            state.unstable_raw_text,
            punc_model,
            context_sentences=PUNC_CONTEXT_SENTENCES
        )
        text_for_split = f"{state.stable_punctuated_text}{temp_punctuated}"
    
    # 4. 分句：从标点化的文本中提取完整句子
    complete_sentences, remaining_text = split_by_sentence_end(text_for_split)
    sentences_to_commit = [s for s in complete_sentences if len(s.strip()) >= MIN_SENTENCE_CHARS]

    # 超过最大句子时长或结束块时强制提交
    sentence_duration = 0.0
    if sentence_start_time_sec:
        sentence_duration = (chunk_end_time_ms / 1000) - sentence_start_time_sec
    should_force_commit = sentence_duration >= MAX_SENTENCE_SECONDS or is_final

    deferred_text = ""
    commit_ready = []
    for sentence in sentences_to_commit:
        sentence_text = sentence.strip()
        if not sentence_text:
            continue
        if (
            len(sentence_text) < MIN_AUTO_COMMIT_CHARS
            and not should_force_commit
            and not is_final
        ):
            deferred_text += sentence_text
            continue
        commit_ready.append(sentence_text)

    # 5. 提交完整句子
    if commit_ready:
        commit_start_time_sec = sentence_start_time_sec or (chunk_start_time_ms / 1000)
        for sentence_text in commit_ready:
            # 【优化】对最终提交的句子重新标点化，确保准确性
            final_sentence = apply_punctuation(sentence_text, punc_model)
            
            start_ms = int(commit_start_time_sec * 1000)
            send_ipc_message({
                "request_id": request_id,
                "session_id": session_id,
                "type": "sentence_complete",
                "text": final_sentence,
                "timestamp": timestamp_ms,
                "is_final": is_final,
                "status": "success",
                "language": "zh",
                "audio_duration": audio_duration,
                "start_time": start_ms,
            })
            sys.stderr.write(f"[FunASR Worker] 🎯 SENTENCE_COMPLETE: \"{final_sentence[:50]}...\"\n")
            sys.stderr.flush()
            state.completed_sentences.append(final_sentence)
            commit_start_time_sec = chunk_end_time_ms / 1000
        
        # 【关键修复】提交后清空所有缓冲区，重新开始
        # 由于分句逻辑基于标点化文本，无法准确映射回原始文本
        # 因此提交后清空，避免重复处理
        state.unstable_raw_text = ""
        state.raw_text_buffer = ""
        state.stable_punctuated_text = ""
        state.current_sentence.text = ""
        state.last_partial_text = ""
        state.last_punc_time = 0.0
        state.current_sentence.start_time = 0.0
        
        sys.stderr.write(f"[FunASR Worker] ✅ Buffers cleared after commit\n")
        sys.stderr.flush()
        return
    
    # 6. 更新当前句子缓冲区
    state.current_sentence.text = f"{deferred_text}{remaining_text}".strip()
    state.current_sentence.last_update_time = time.time()

    if state.current_sentence.text:
        if deferred_text:
            state.current_sentence.start_time = sentence_start_time_sec or (chunk_start_time_ms / 1000)
        else:
            state.current_sentence.start_time = chunk_end_time_ms / 1000
    else:
        state.current_sentence.start_time = 0.0

    # 7. 强制提交（超时或最终块）
    if should_force_commit and state.unstable_raw_text:
        # 【优化】对不稳定区域重新标点化，确保最终准确性
        final_unstable = apply_incremental_punctuation(
            state.stable_punctuated_text,
            state.unstable_raw_text,
            punc_model,
            context_sentences=PUNC_CONTEXT_SENTENCES
        )
        final_text = f"{state.stable_punctuated_text}{final_unstable}".strip()
        
        start_ms = int(sentence_start_time_sec * 1000) if sentence_start_time_sec else int(chunk_start_time_ms)
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "type": "sentence_complete",
            "text": final_text,
            "timestamp": timestamp_ms,
            "is_final": is_final,
            "status": "success",
            "language": "zh",
            "audio_duration": audio_duration,
            "start_time": start_ms,
            "trigger": "timeout" if not is_final else "final_chunk",
        })
        sys.stderr.write(f"[FunASR Worker] 🎯 FORCE_COMMIT: \"{final_text[:50]}...\"\n")
        sys.stderr.flush()
        state.completed_sentences.append(final_text)
        state.current_sentence = SentenceBuffer()
        state.last_partial_text = ""
        state.raw_text_buffer = ""
        state.stable_punctuated_text = ""
        state.unstable_raw_text = ""
        state.last_punc_time = 0.0
        return

    # 注意：partial消息已经在前面发送过了（第545-587行区域），这里不再重复发送


def handle_batch_file(stream_model: AutoModel, punc_model: AutoModel, data: Dict):
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
        import soundfile as sf
        audio_array, sample_rate = sf.read(audio_path)
        if audio_array.ndim > 1:
            audio_array = audio_array.mean(axis=1)

        # 批量识别
        full_text = funasr_streaming_recognition(audio_array, stream_model, {}, is_final=True)

        # 应用标点
        punctuated_text = apply_punctuation(full_text, punc_model)

        send_ipc_message({
            "request_id": request_id,
            "text": punctuated_text,
            "language": "zh",
            "status": "success",
        })

    except Exception as exc:
        send_ipc_message({
            "request_id": request_id,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })


def handle_force_commit(data: Dict, sessions_cache: Dict[str, SessionState], punc_model: AutoModel):
    """强制提交当前句子"""
    request_id = data.get("request_id", "default")
    session_id = data.get("session_id", request_id)

    sys.stderr.write(f"[FunASR Worker] force_commit received for session={session_id}\n")
    sys.stderr.flush()

    state = sessions_cache.get(session_id)
    if not state:
        sys.stderr.write(f"[FunASR Worker] No session state found for session={session_id}\n")
        sys.stderr.flush()
        return

    # 【优化】使用不稳定区域，增量标点化确保准确性
    if state.unstable_raw_text and len(state.unstable_raw_text) >= MIN_SENTENCE_CHARS:
        final_unstable = apply_incremental_punctuation(
            state.stable_punctuated_text,
            state.unstable_raw_text,
            punc_model,
            context_sentences=PUNC_CONTEXT_SENTENCES
        )
        final_text = f"{state.stable_punctuated_text}{final_unstable}".strip()
        
        timestamp_ms = int(time.time() * 1000)
        start_ms = int(state.current_sentence.start_time * 1000) if state.current_sentence.start_time else timestamp_ms
        sys.stderr.write(f"[FunASR Worker] 🎯 FORCE_COMMIT (silence): \"{final_text[:50]}...\"\n")
        sys.stderr.flush()
        send_ipc_message({
            "request_id": request_id,
            "session_id": session_id,
            "type": "sentence_complete",
            "text": final_text,
            "timestamp": timestamp_ms,
            "is_final": True,
            "status": "success",
            "trigger": "silence_timeout",
            "language": "zh",
            "start_time": start_ms,
            "audio_duration": 0,
        })

        # 记录已提交句子
        state.completed_sentences.append(final_text)

        # 重置状态
        state.current_sentence = SentenceBuffer()
        state.last_partial_text = ""
        state.raw_text_buffer = ""
        state.stable_punctuated_text = ""
        state.unstable_raw_text = ""
        state.last_punc_time = 0.0
    else:
        sys.stderr.write(f"[FunASR Worker] force_commit: text too short or empty\n")
        sys.stderr.flush()


def main():
    try:
        sys.stderr.write("[FunASR Worker] Starting FunASR Worker...\n")
        sys.stderr.flush()

        # 加载模型
        stream_model, punc_model, ts_model = load_funasr_models()

        sessions_cache: Dict[str, SessionState] = {}
        send_ipc_message({"status": "ready"})

        sys.stderr.write("[FunASR Worker] Ready and waiting for input...\n")
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
                handle_force_commit(data, sessions_cache, punc_model)
                continue

            if request_type == "streaming_chunk":
                handle_streaming_chunk(stream_model, punc_model, data, sessions_cache)
                continue

            if request_type == "batch_file" or "audio_path" in data:
                handle_batch_file(stream_model, punc_model, data)
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
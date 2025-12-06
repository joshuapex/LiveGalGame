import base64
import re
from typing import List, Tuple, Optional

import numpy as np

try:
    from faster_whisper import WhisperModel
except ImportError:
    WhisperModel = None


def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    """Base64 音频转 float32 numpy array（范围 -1~1）。"""
    audio_bytes = base64.b64decode(audio_b64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32) / 32768.0


def generate_chinese_dialogue_prompt(completed_sentences: List[str]) -> str:
    """
    生成固定的简体中文闲聊风格对话 Prompt，引导 Whisper 添加标点。
    completed_sentences 参数保留，便于后续根据历史优化 prompt。
    """
    _ = completed_sentences  # 暂未使用，保留扩展
    return """你好啊，今天怎么样？天气不错吧？
嗯嗯，我觉得还可以啦。最近在忙什么呢？
哈哈，原来是这样啊。那你有什么计划吗？
哦，听起来挺有趣的！需要我帮忙吗？
好的，没问题。我觉得这个主意不错。
真的吗？那太好了！继续保持吧。
哎呀，怎么会这样呢？有什么我能做的吗？
嗯，我明白你的意思。生活有时候就是这样。
哈哈，说得对！我们一起想想办法吧。
好吧，那就这样决定啦。保持联系哦。"""


def extract_incremental_text(previous: str, current: str) -> str:
    """提取 current 相比 previous 的新增文本。"""
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


def split_by_sentence_end(
    text: str,
    min_sentence_chars: int,
    sentence_end_punctuation,
) -> Tuple[List[str], str]:
    """
    按句末标点分割文本，返回 (完整句子列表, 剩余文本)。
    """
    sentences: List[str] = []
    remaining = text

    pattern = r'([^{}]*[{}])'.format(
        re.escape("".join(sentence_end_punctuation)),
        re.escape("".join(sentence_end_punctuation)),
    )
    matches = list(re.finditer(pattern, text))

    if not matches:
        return [], text

    last_end = 0
    for match in matches:
        sentence = match.group(1).strip()
        if sentence and len(sentence) >= min_sentence_chars:
            sentences.append(sentence)
        last_end = match.end()

    remaining = text[last_end:].strip()
    return sentences, remaining


def transcribe_audio_with_segments(
    model: "WhisperModel",
    audio_source,
    *,
    initial_prompt: Optional[str] = None,
    beam_size: int = 5,
    language: Optional[str] = None,
    temperature: float = 0.0,
    vad_filter: bool = True,
    no_speech_threshold: Optional[float] = None,
    word_timestamps: bool = False,
) -> Tuple[str, List[dict], dict]:
    """
    调用 whisper 转录，返回 (完整文本, segments 列表, info)。
    beam_size 同时用于 best_of，避免过多配置分散。
    """
    if WhisperModel is None:
        raise ImportError("faster_whisper is required for Whisper transcription; please install faster-whisper.")

    transcribe_kwargs = {
        "beam_size": beam_size,
        "best_of": beam_size,
        "language": language,
        "temperature": temperature,
        "vad_filter": vad_filter,
        "condition_on_previous_text": False,
        "initial_prompt": initial_prompt,
        "word_timestamps": word_timestamps,
    }
    if no_speech_threshold is not None:
        transcribe_kwargs["no_speech_threshold"] = no_speech_threshold

    segments, info = model.transcribe(audio_source, **transcribe_kwargs)

    full_text_parts = []
    segments_data = []
    for seg in segments:
        text = seg.text.strip()
        segments_data.append({
            "start": seg.start,
            "end": seg.end,
            "text": text,
            "avg_logprob": seg.avg_logprob,
            "no_speech_prob": seg.no_speech_prob,
        })
        full_text_parts.append(text)

    full_text = " ".join(full_text_parts).strip()
    return full_text, segments_data, info



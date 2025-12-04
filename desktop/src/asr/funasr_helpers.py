import sys
import traceback
from typing import Dict, Tuple

import numpy as np
from funasr import AutoModel


def load_funasr_models(cache_dir: str, stride_samples: int, sample_rate: int) -> Tuple[AutoModel, AutoModel, AutoModel]:
    """加载 FunASR 模型，返回 (流式ASR, 标点, 时间戳)"""
    sys.stderr.write(f"[FunASR Worker] Loading models from cache: {cache_dir}\n")
    sys.stderr.write(
        f"[FunASR Worker] Chunk stride: {stride_samples} samples "
        f"({stride_samples / sample_rate * 1000:.0f}ms)\n"
    )
    sys.stderr.flush()

    try:
        sys.stderr.write("[FunASR Worker] Loading streaming ASR model: paraformer-zh-streaming (v2.0.4)\n")
        stream_model = AutoModel(model="paraformer-zh-streaming", model_revision="v2.0.4")
        sys.stderr.write("[FunASR Worker] Streaming model loaded\n")

        sys.stderr.write("[FunASR Worker] Loading punctuation model: ct-punc (v2.0.4)\n")
        punc_model = AutoModel(model="ct-punc", model_revision="v2.0.4")
        sys.stderr.write("[FunASR Worker] Punctuation model loaded\n")

        try:
            sys.stderr.write("[FunASR Worker] Loading timestamp model: fa-zh (v2.0.4)\n")
            ts_model = AutoModel(model="fa-zh", model_revision="v2.0.4")
            sys.stderr.write("[FunASR Worker] Timestamp model loaded\n")
        except Exception as exc:
            sys.stderr.write(f"[FunASR Worker] Timestamp model load failed (optional): {exc}\n")
            ts_model = None

        sys.stderr.flush()
        return stream_model, punc_model, ts_model

    except Exception as exc:
        sys.stderr.write(f"[FunASR Worker] Model loading failed: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        raise


def funasr_streaming_recognition(
    audio_array: np.ndarray,
    model: AutoModel,
    cache: Dict,
    chunk_size_list,
    encoder_look_back: int,
    decoder_look_back: int,
    is_final: bool = False,
) -> str:
    """FunASR 流式识别，返回增量文本。"""
    try:
        results = model.generate(
            input=audio_array,
            cache=cache,
            is_final=is_final,
            chunk_size=chunk_size_list,
            encoder_chunk_look_back=encoder_look_back,
            decoder_chunk_look_back=decoder_look_back,
        )

        chunk_text = ""
        if isinstance(results, list) and results:
            for item in results:
                if isinstance(item, dict) and "text" in item:
                    chunk_text += item["text"]
        elif isinstance(results, dict) and "text" in results:
            chunk_text = results["text"]

        return chunk_text.strip()
    except Exception as exc:
        sys.stderr.write(f"[FunASR Worker] Streaming recognition failed: {exc}\n")
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        return ""



#!/usr/bin/env python3
"""
下载 FunASR ONNX 模型。
该脚本通过实例化 funasr_onnx 模型对象来触发自动下载逻辑。
"""
import os
import sys
import json
import argparse
import traceback

# ==============================================================================
# OS 级别的文件描述符重定向，防止库的日志污染 stdout
# ==============================================================================
try:
    ipc_fd = os.dup(sys.stdout.fileno())
    ipc_channel = os.fdopen(ipc_fd, "w", buffering=1, encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
except Exception:
    # 如果重定向失败（例如在非标准终端环境中），则回退到直接使用 stdout
    ipc_channel = sys.stdout

def emit(event, **payload):
    """发送 JSON 消息到 Node.js"""
    try:
        data = {"event": event}
        data.update(payload)
        ipc_channel.write(json.dumps(data, ensure_ascii=False) + "\n")
        ipc_channel.flush()
    except Exception as exc:
        sys.stderr.write(f"[IPC Error] Failed to send: {exc}\n")
        sys.stderr.flush()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--cache-dir", required=False)
    args = parser.parse_args()

    # 设置环境变量
    # FunASR 默认下载到 ~/.cache/modelscope/hub
    # MODELSCOPE_CACHE 语义通常是 "base dir"，实际下载会落到 <base>/hub。
    # 但历史上我们也可能传入了 ".../hub"。这里做兼容归一化，确保 Win/mac/Linux 都稳定落盘。
    cache_base = None
    cache_hub = None
    if args.cache_dir:
        raw = os.path.abspath(args.cache_dir)
        if os.path.basename(raw).lower() == "hub":
            cache_base = os.path.dirname(raw)
            cache_hub = raw
        else:
            cache_base = raw
            cache_hub = os.path.join(raw, "hub")
    else:
        # 兼容旧逻辑：若仅提供 ASR_CACHE_DIR（通常是 HF 的 hub），尝试回退到其父目录作为 base
        cache = os.environ.get("MODELSCOPE_CACHE") or os.environ.get("MODELSCOPE_CACHE_HOME") or os.environ.get("ASR_CACHE_DIR")
        if cache:
            raw = os.path.abspath(cache)
            if os.path.basename(raw).lower() == "hub":
                cache_base = os.path.dirname(raw)
                cache_hub = raw
            else:
                cache_base = raw
                cache_hub = os.path.join(raw, "hub")

    if cache_base:
        os.environ["MODELSCOPE_CACHE"] = cache_base
        os.environ["MODELSCOPE_CACHE_HOME"] = cache_base
        try:
            os.makedirs(cache_base, exist_ok=True)
            os.makedirs(cache_hub, exist_ok=True)
        except Exception:
            pass

    emit("manifest", modelId=args.model_id, message="准备下载 FunASR 模型...", totalBytes=0, fileCount=0)

    try:
        import funasr_onnx
        # 尝试静默 funasr 的日志
        # funasr_onnx 内部可能没有简单的日志级别控制，只能依赖 stderr 重定向
    except ImportError:
        emit("error", modelId=args.model_id, message="funasr_onnx 库未安装，请先安装依赖。")
        sys.exit(1)

    # 模拟 asr_funasr_worker.py 中的模型 ID 逻辑
    is_large = "large" in args.model_id.lower()
    
    # 定义模型路径 (与 worker 保持一致)
    # 这些是默认值，worker 中允许通过环境变量覆盖，这里我们为了下载默认模型，使用默认值
    vad_model_dir = "damo/speech_fsmn_vad_zh-cn-16k-common-onnx"
    punc_model_dir = "damo/punc_ct-transformer_zh-cn-common-vocab272727-onnx"
    
    if is_large:
        online_model_dir = "damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx"
        offline_model_dir = "damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx"
        use_quantize = False
    else:
        online_model_dir = "damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx"
        offline_model_dir = "damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx"
        use_quantize = True

    try:
        from funasr_onnx.vad_bin import Fsmn_vad
        from funasr_onnx.paraformer_online_bin import Paraformer as ParaformerOnline
        from funasr_onnx.paraformer_bin import Paraformer as ParaformerOffline
        from funasr_onnx.punc_bin import CT_Transformer
        
        # 1. 下载 VAD
        emit("manifest", modelId=args.model_id, message=f"正在下载 VAD 模型: {vad_model_dir} (1/4)")
        Fsmn_vad(model_dir=vad_model_dir, quantize=use_quantize)
        
        # 2. 下载 Online
        emit("manifest", modelId=args.model_id, message=f"正在下载流式模型: {online_model_dir} (2/4)")
        ParaformerOnline(model_dir=online_model_dir, batch_size=1, quantize=use_quantize, intra_op_num_threads=1)
        
        # 3. 下载 Offline
        emit("manifest", modelId=args.model_id, message=f"正在下载离线模型: {offline_model_dir} (3/4)")
        ParaformerOffline(model_dir=offline_model_dir, batch_size=1, quantize=use_quantize, intra_op_num_threads=1)

        # 4. 下载 Punc
        emit("manifest", modelId=args.model_id, message=f"正在下载标点模型: {punc_model_dir} (4/4)")
        CT_Transformer(model_dir=punc_model_dir, quantize=use_quantize, intra_op_num_threads=1)

        emit(
            "completed",
            modelId=args.model_id,
            message="FunASR 模型下载完成",
            localDir=cache_hub or os.environ.get("MODELSCOPE_CACHE") or "",
            cacheBase=os.environ.get("MODELSCOPE_CACHE") or "",
            cacheHub=cache_hub or "",
        )
        
    except Exception as e:
        emit("error", modelId=args.model_id, message=str(e), traceback=traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()

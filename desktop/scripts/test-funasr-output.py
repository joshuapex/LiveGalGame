#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
测试 FunASR 的输出格式
根据官方文档: https://github.com/modelscope/FunASR
"""

import json
import sys
from funasr import AutoModel

audio_file = sys.argv[1] if len(sys.argv) > 1 else "/Users/cccmmmdd/LiveGalGame/vad_example.wav"

try:
    print(f"正在加载模型...", file=sys.stderr)
    model = AutoModel(
        model="paraformer-zh",
        vad_model="fsmn-vad",
        punc_model="ct-punc",
        device="cpu"
    )
    print(f"模型加载完成", file=sys.stderr)
    
    print(f"正在识别音频文件: {audio_file}", file=sys.stderr)
    # 根据官方文档，使用 generate 方法
    res = model.generate(
        input=audio_file,
        batch_size_s=60,
        merge_vad=True,
        merge_with_sep=" "
    )
    
    print(f"原始输出类型: {type(res)}", file=sys.stderr)
    print(f"原始输出内容: {res}", file=sys.stderr)
    
    # 提取文本 - 根据官方文档示例改进
    text = ""
    if res:
        if isinstance(res, list) and len(res) > 0:
            # 列表格式: [{"text": "..."}] 或 ["..."]
            item = res[0]
            if isinstance(item, dict):
                # 字典格式: {"text": "..."} 或 {"value": "..."}
                text = item.get("text", item.get("value", ""))
                # 如果是VAD结果，尝试提取文本
                if not text and "value" in item:
                    # VAD结果格式: [{"value": [[beg, end], ...]}]
                    # 这种情况下需要重新识别，或者提取其他字段
                    text = str(item.get("text", ""))
            elif isinstance(item, str):
                # 字符串格式: ["..."]
                text = item
            else:
                # 其他格式，尝试转换为字符串
                text = str(item)
        elif isinstance(res, dict):
            # 直接是字典格式: {"text": "..."}
            text = res.get("text", res.get("value", ""))
        elif isinstance(res, str):
            # 直接是字符串
            text = res
        else:
            # 其他格式，尝试转换为字符串
            text = str(res)
    
    # 如果text是列表，尝试合并
    if isinstance(text, list):
        text = " ".join([str(t) for t in text])
    
    # 清理文本
    text = text.strip() if text else ""
    
    print(f"提取的文本: '{text}'", file=sys.stderr)
    print(f"文本长度: {len(text)}", file=sys.stderr)
    
    # 输出结果
    result = {
        "text": text,
        "raw_output": str(res),
        "output_type": str(type(res)),
        "raw_length": len(res) if isinstance(res, (list, dict, str)) else 0
    }
    print(json.dumps(result, ensure_ascii=False))
    
except Exception as e:
    import traceback
    error_msg = str(e)
    traceback_str = traceback.format_exc()
    print(f"错误: {error_msg}", file=sys.stderr)
    print(f"Traceback:\n{traceback_str}", file=sys.stderr)
    error_result = {
        "text": "",
        "error": error_msg,
        "traceback": traceback_str,
        "raw_output": None
    }
    print(json.dumps(error_result, ensure_ascii=False))
    sys.exit(1)



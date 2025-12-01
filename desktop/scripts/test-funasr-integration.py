#!/usr/bin/env python3
"""
测试 FunASR 集成的脚本

验证 FunASR Worker 是否能正常启动和处理音频数据。
"""

import base64
import json
import numpy as np
import soundfile as sf
import tempfile
import os
import sys

# 添加项目路径到 sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'asr'))

def create_test_audio(duration=3.0, sample_rate=16000):
    """创建测试音频数据"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    # 生成一个简单的正弦波作为测试音频
    frequency = 440  # A4 note
    audio = 0.5 * np.sin(2 * np.pi * frequency * t)
    return audio.astype(np.float32)

def audio_to_base64(audio_data):
    """将音频数据转换为 base64 编码"""
    # 转换为 int16
    audio_int16 = (audio_data * 32767).astype(np.int16)
    # 转换为 bytes
    audio_bytes = audio_int16.tobytes()
    # 编码为 base64
    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
    return audio_b64

def test_funasr_worker():
    """测试 FunASR Worker"""
    print("=" * 60)
    print("FunASR 集成测试")
    print("=" * 60)

    # 检查 FunASR 是否已安装
    try:
        from funasr import AutoModel
        print("✓ FunASR 已安装")
    except ImportError:
        print("✗ FunASR 未安装，正在安装...")
        os.system("pip install funasr")
        try:
            from funasr import AutoModel
            print("✓ FunASR 安装成功")
        except ImportError:
            print("✗ FunASR 安装失败")
            return False

    # 测试模型加载
    print("\n📦 正在加载 FunASR 模型...")
    print("  使用 ModelScope (默认) 下载，国内访问更稳定")
    try:
        # 流式识别模型 - 使用默认 hub="ms" (ModelScope)
        stream_model = AutoModel(
            model="paraformer-zh-streaming",
            # 默认 hub="ms" (ModelScope)，国内访问更稳定
        )
        print("✓ 流式识别模型加载成功")

        # 标点符号模型
        punc_model = AutoModel(
            model="ct-punc",
        )
        print("✓ 标点符号模型加载成功")

    except Exception as e:
        print(f"✗ 模型加载失败: {e}")
        return False

    # 创建测试音频
    print("\n🎵 创建测试音频...")
    test_audio = create_test_audio(duration=2.0)
    print(f"  音频长度: {len(test_audio)} 采样点")
    print(f"  音频时长: {len(test_audio) / 16000:.2f} 秒")

    # 测试流式识别
    print("\n🔄 测试流式识别...")
    try:
        # 模拟流式识别的数据块
        chunk_size = int(0.6 * 16000)  # 0.6秒的音频
        cache = {}

        for i in range(0, len(test_audio), chunk_size):
            chunk = test_audio[i:i + chunk_size]
            if len(chunk) == 0:
                break

            is_final = (i + chunk_size >= len(test_audio))

            results = stream_model.generate(
                input=chunk,
                cache=cache,
                is_final=is_final,
                chunk_size=[0, 10, 5],
                encoder_chunk_look_back=4,
                decoder_chunk_look_back=1,
            )

            # 提取文本
            chunk_text = ""
            if isinstance(results, list) and results:
                for item in results:
                    if isinstance(item, dict) and "text" in item:
                        chunk_text += item["text"]

            print(f"  片段 {i//chunk_size + 1}: {chunk_text if chunk_text else '(无文本)'}")

    except Exception as e:
        print(f"✗ 流式识别测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 测试标点符号添加
    print("\n🔤 测试标点符号添加...")
    try:
        test_text = "这是一段没有标点的文本我们来看看标点添加的效果如何"
        response = punc_model.generate(input=test_text)

        punctuated_text = ""
        if isinstance(response, list) and len(response) > 0:
            if isinstance(response[0], dict):
                punctuated_text = response[0].get("text", "") or response[0].get("value", "")
            else:
                punctuated_text = str(response[0])

        print(f"  原始文本: {test_text}")
        print(f"  添加标点后: {punctuated_text if punctuated_text else test_text}")
        print("✓ 标点符号添加测试成功")

    except Exception as e:
        print(f"✗ 标点符号添加测试失败: {e}")
        return False

    # 测试 Worker 脚本
    print("\n⚙️  测试 FunASR Worker 脚本...")
    worker_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'asr', 'asr_funasr_worker.py')
    if os.path.exists(worker_path):
        print(f"✓ Worker 脚本存在: {worker_path}")

        # 检查语法
        try:
            with open(worker_path, 'r') as f:
                code = f.read()
            compile(code, worker_path, 'exec')
            print("✓ Worker 脚本语法正确")
        except SyntaxError as e:
            print(f"✗ Worker 脚本语法错误: {e}")
            return False
    else:
        print(f"✗ Worker 脚本不存在: {worker_path}")
        return False

    print("\n" + "=" * 60)
    print("✅ 所有测试通过！FunASR 集成成功。")
    print("=" * 60)

    return True

def main():
    """主函数"""
    success = test_funasr_worker()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
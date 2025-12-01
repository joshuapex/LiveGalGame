#!/bin/bash

# FunASR 安装脚本
# 用于安装 FunASR 及其依赖（使用虚拟环境）

set -e

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
VENV_DIR="$PROJECT_DIR/.venv"

echo "========================================"
echo "FunASR 安装脚本（虚拟环境模式）"
echo "========================================"

# 检查Python版本
echo "检查Python版本..."
python3 --version

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
REQUIRED_VERSION="3.8"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "错误: Python 版本必须 >= 3.8，当前版本: $PYTHON_VERSION"
    exit 1
fi

echo "✓ Python版本符合要求: $PYTHON_VERSION"

# 创建或激活虚拟环境
if [ -d "$VENV_DIR" ]; then
    echo ""
    echo "发现已存在的虚拟环境: $VENV_DIR"
else
    echo ""
    echo "创建Python虚拟环境..."
    python3 -m venv "$VENV_DIR"
    echo "✓ 虚拟环境创建成功: $VENV_DIR"
fi

# 激活虚拟环境
echo ""
echo "激活虚拟环境..."
source "$VENV_DIR/bin/activate"

# 升级pip
echo ""
echo "升级pip..."
pip install --upgrade pip

# 安装PyTorch（FunASR的依赖）
echo ""
echo "安装PyTorch（CPU版本）..."
echo "这可能需要几分钟时间..."
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# 安装FunASR
echo ""
echo "安装FunASR..."

pip install -U funasr

# 验证安装
echo ""
echo "验证FunASR安装..."
python -c "import funasr; print(f'FunASR 版本: {funasr.__version__}')"

echo ""
echo "========================================"
echo "✓ FunASR 安装完成！"
echo "========================================"
echo ""
echo "虚拟环境位置: $VENV_DIR"
echo ""
echo "可用的模型："
echo "  - paraformer-zh: 中文语音识别"
echo "  - paraformer-en: 英文语音识别"
echo "  - SenseVoiceSmall: 多语言语音识别（支持中、英、粤、日、韩）"
echo ""
echo "使用方法："
echo "  项目会自动使用虚拟环境中的Python"
echo "  直接启动即可："
echo "  pnpm dev"
echo ""
echo "或显式指定使用 FunASR："
echo "  WHISPER_IMPL=funasr pnpm dev"
echo ""

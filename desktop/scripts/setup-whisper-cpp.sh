#!/bin/bash

# Whisper.cpp 集成设置脚本
# 这个脚本会克隆 whisper.cpp 仓库并编译 Node.js addon

# 不立即退出，允许错误处理
set +e

echo "=========================================="
echo "设置 Whisper.cpp 集成"
echo "=========================================="

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_CPP_DIR="$PROJECT_ROOT/third_party/whisper.cpp"
ADDON_DIR="$WHISPER_CPP_DIR/examples/addon.node"

echo "项目根目录: $PROJECT_ROOT"
echo "Whisper.cpp 目录: $WHISPER_CPP_DIR"

# 检查是否已存在
if [ -d "$WHISPER_CPP_DIR" ]; then
    echo "Whisper.cpp 目录已存在，跳过克隆"
else
    echo "克隆 Whisper.cpp 仓库..."
    mkdir -p "$PROJECT_ROOT/third_party"
    cd "$PROJECT_ROOT/third_party"
    git clone https://github.com/ggml-org/whisper.cpp.git
fi

# 检查编译依赖
echo ""
echo "检查编译依赖..."

# 检查 CMake
if ! command -v cmake &> /dev/null; then
    echo "错误: 未找到 CMake，请先安装 CMake"
    echo "macOS: brew install cmake"
    echo "Linux: sudo apt-get install cmake"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js"
    exit 1
fi

echo "依赖检查通过"

# 编译 whisper.cpp
echo ""
echo "编译 Whisper.cpp..."
cd "$WHISPER_CPP_DIR"

# 创建构建目录
mkdir -p build
cd build

# 配置 CMake
echo "配置 CMake..."
cmake .. -DBUILD_SHARED_LIBS=ON

# 编译
echo "开始编译..."
cmake --build . --config Release

# 编译 Node.js addon
echo ""
echo "编译 Node.js addon..."
cd "$ADDON_DIR"

# 安装 addon 依赖
if [ ! -d "node_modules" ]; then
    echo "安装 addon 依赖..."
    npm install
fi

# 编译 addon（使用 cmake-js）
echo "编译 addon（使用 cmake-js）..."
# 需要指定 whisper.cpp 的构建目录，以便链接到已编译的库
export WHISPER_CPP_BUILD_DIR="$WHISPER_CPP_DIR/build"

# 获取 Electron 版本（移除 ^ 符号）
ELECTRON_VERSION=$(node -p "require('$PROJECT_ROOT/package.json').devDependencies.electron.replace('^', '')" 2>/dev/null || echo "")

# 尝试找到本地安装的 electron
ELECTRON_PATH=$(find "$PROJECT_ROOT/node_modules" -name "electron" -type f 2>/dev/null | head -1)

if [ -n "$ELECTRON_VERSION" ] && [ "$ELECTRON_VERSION" != "undefined" ]; then
    echo "检测到 Electron 版本: $ELECTRON_VERSION"
    
    if [ -n "$ELECTRON_PATH" ]; then
        echo "找到本地 Electron: $ELECTRON_PATH"
        # 尝试使用本地 electron 路径
        ELECTRON_DIST=$(dirname "$(dirname "$ELECTRON_PATH")")/dist
        if [ -d "$ELECTRON_DIST" ]; then
            echo "使用本地 Electron 路径: $ELECTRON_DIST"
            export ELECTRON_DIST="$ELECTRON_DIST"
        fi
    fi
    
    echo "为 Electron 编译 addon..."
    # 为 Electron 编译 addon
    # 如果网络有问题，可以尝试使用 --CD 参数指定 cmake 目录
    if npx cmake-js compile -T addon.node -B Release --runtime=electron --runtime-version="$ELECTRON_VERSION" 2>&1 | tee /tmp/cmake-js.log; then
        echo "✓ Electron addon 编译成功"
    else
        echo "⚠ Electron addon 编译失败，尝试使用 Node.js 版本..."
        echo "（这可能是网络问题，可以稍后重试）"
        echo "使用 Node.js 编译（开发环境可用）..."
        # 尝试使用系统 Node.js 版本（避免下载）
        NODE_VERSION=$(node --version | sed 's/v//')
        echo "使用系统 Node.js 版本: $NODE_VERSION"
        npx cmake-js compile -T addon.node -B Release --CD "$WHISPER_CPP_DIR/build" 2>&1 | tee /tmp/cmake-js-node.log
        CMAKE_JS_EXIT_CODE=${PIPESTATUS[0]}
        if [ $CMAKE_JS_EXIT_CODE -ne 0 ]; then
            echo ""
            echo "❌ Node.js addon 编译失败"
            echo ""
            echo "可能的解决方案："
            echo "1. 检查网络连接（cmake-js 需要下载 Node.js headers）"
            echo "2. 配置代理：export HTTP_PROXY=your_proxy"
            echo "3. 手动下载 headers 到 ~/.cmake-js/node-arm64/$NODE_VERSION/"
            echo "4. 或者先使用 transformers.js 版本（无需编译）："
            echo "   export WHISPER_IMPL=transformers"
            echo ""
            echo "编译错误日志已保存到: /tmp/cmake-js-node.log"
            echo "可以查看详细错误信息"
            exit 1
        fi
    fi
else
    echo "未检测到 Electron，使用 Node.js 编译..."
    NODE_VERSION=$(node --version | sed 's/v//')
    echo "使用系统 Node.js 版本: $NODE_VERSION"
    # 使用 cmake-js 编译，指定 Release 模式
    npx cmake-js compile -T addon.node -B Release --CD "$WHISPER_CPP_DIR/build" 2>&1 | tee /tmp/cmake-js-node.log
    CMAKE_JS_EXIT_CODE=${PIPESTATUS[0]}
    if [ $CMAKE_JS_EXIT_CODE -ne 0 ]; then
        echo ""
        echo "❌ Node.js addon 编译失败"
        echo ""
        echo "可能的解决方案："
        echo "1. 检查网络连接（cmake-js 需要下载 Node.js headers）"
        echo "2. 配置代理：export HTTP_PROXY=your_proxy"
        echo "3. 手动下载 headers 到 ~/.cmake-js/node-arm64/$NODE_VERSION/"
        echo "4. 或者先使用 transformers.js 版本（无需编译）："
        echo "   export WHISPER_IMPL=transformers"
        echo ""
        echo "编译错误日志已保存到: /tmp/cmake-js-node.log"
        exit 1
    fi
fi

echo ""
echo "检查编译结果..."
ADDON_FOUND=false
if [ -f "build/Release/addon.node" ]; then
    echo "✓ Addon 编译成功: build/Release/addon.node"
    ADDON_FOUND=true
elif [ -f "Release/addon.node" ]; then
    echo "✓ Addon 编译成功: Release/addon.node"
    ADDON_FOUND=true
elif [ -f "../../build/Release/addon.node" ]; then
    echo "✓ Addon 编译成功: ../../build/Release/addon.node"
    ADDON_FOUND=true
fi

if [ "$ADDON_FOUND" = false ]; then
    echo "⚠ 警告: 未找到编译后的 addon.node 文件"
    echo "请检查编译错误信息"
    echo ""
    echo "注意: 如果编译失败，应用会自动回退到 transformers.js 版本"
    echo "可以通过设置环境变量强制使用: export WHISPER_IMPL=transformers"
fi

echo ""
echo "=========================================="
echo "Whisper.cpp 设置完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 下载模型文件到 $PROJECT_ROOT/models/"
echo "2. 更新 whisper-service.js 使用新的 API"
echo ""


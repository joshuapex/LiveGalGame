# Whisper.cpp 集成研究

## 选项分析

### 选项 1: Node.js Addon（需要编译）
- 位置：`examples/addon.node`
- 优点：性能最好，原生速度
- 缺点：需要编译 C++ 代码，跨平台构建复杂

### 选项 2: WebAssembly（推荐）
- whisper.cpp 支持 WebAssembly
- 优点：无需编译，跨平台，性能良好
- 缺点：需要检查是否有现成的 npm 包

### 选项 3: 使用预编译二进制 + 子进程
- 优点：简单，无需编译 Node.js addon
- 缺点：需要管理子进程，性能略低

## 推荐方案

基于 Electron 应用的特点，推荐使用 **WebAssembly 版本**（如果可用）或 **Node.js Addon**。

## 模型格式

whisper.cpp 使用 GGML 格式的模型，比 transformers.js 的模型更小：
- `ggml-base.bin` (~150MB) vs `Xenova/whisper-base` (~300MB+)
- 模型可以从 https://huggingface.co/ggml-org 下载

## 下一步

1. 检查是否有现成的 npm 包
2. 如果没有，需要编译 Node.js addon
3. 创建新的 whisper-service.js 使用 whisper.cpp API







# LiveGalGame Desktop

LiveGalGame Desktop 是基于 Electron 的跨平台桌面应用（Windows/macOS），旨在为用户提供实时的对话辅助与复盘学习体验。它通过浮动 HUD 叠加在任意聊天应用之上，提供实时语音转录、AI 建议与即时反馈。

## 系统要求

### macOS
- macOS 12 (Monterey) 或更高版本
- Xcode Command Line Tools (运行 `xcode-select --install` 安装)
- Node.js 20+
- pnpm 8+

### Windows
- Windows 10/11
- Visual Studio Build Tools (包含 "Desktop development with C++" 工作负载)
- Node.js 20+
- pnpm 8+
- Python 3.x (用于 node-gyp 构建)

## 快速开始

### 1. 获取代码
```bash
git clone <repository-url>
cd LiveGalGame/desktop
```

### 2. 安装依赖
安装项目依赖：
```bash
pnpm install
```

**关键步骤**：安装并编译原生依赖（Electron 环境）：
```bash
pnpm exec electron-builder install-app-deps
```
*注意：此步骤对于 `better-sqlite3` 和 `sharp` 等原生模块在 Electron 中正常工作至关重要。如果遇到 `NODE_MODULE_VERSION` 不匹配的错误，请务必重新运行此命令。*

### 3. 配置语音识别 (ASR)
本项目使用 `whisper.cpp` 进行本地高性能语音识别。

**对于 macOS (Apple Silicon)**: 预编译的二进制文件已包含在项目中，无需编译。

**对于其他平台**: 如果你的平台是 Windows 或 macOS (Intel Silicon)，需要编译 whisper CLI：
```bash
npm run setup-whisper-cpp
```
*此脚本会自动编译 whisper.cpp 并生成 CLI 工具。编译成功后，二进制文件会保存在 `third_party/whisper.cpp/build/bin/whisper-cli`*

**下载语音模型**（所有平台都需要）：
```bash
npm run download-ggml-models
```
*默认下载 `base` 模型（约 140MB）。模型文件将保存在 `models/` 目录下。*

### 4. 启动开发环境
```bash
pnpm dev
```
此命令将同时启动：
- Vite 开发服务器 (渲染进程)
- Electron 主进程

启动后，你应该能看到主窗口。点击 "实时助手" 或使用快捷键可以打开 HUD 浮窗。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发环境 |
| `pnpm build:mac` | 构建 macOS 应用 (.dmg) |
| `pnpm build:win` | 构建 Windows 应用 (.exe) |
| `npm run setup-whisper-cpp` | 编译 whisper.cpp 插件 |
| `npm run download-ggml-models` | 下载 ASR 模型 |

## 故障排除

### 1. `better-sqlite3` 或 `sharp` 报错
如果启动时遇到类似 `was compiled against a different Node.js version` 的错误：
```bash
# 重新编译原生依赖
pnpm exec electron-builder install-app-deps
```
对于 `sharp` 的特定问题，也可以尝试：
```bash
npm rebuild sharp --build-from-source
```

### 2. Whisper Addon 未找到
确保你已经运行了 `npm run setup-whisper-cpp` 并且编译成功。检查 `third_party/whisper.cpp/examples/addon.node/build/Release/addon.node` 是否存在。

### 3. 麦克风无声音
- **macOS**: 确保终端或应用已获得麦克风权限（系统设置 -> 隐私与安全性 -> 麦克风）。
- **Windows**: 检查系统声音设置中的输入设备。
- 在应用内的 HUD 设置中，确保选择了正确的音频输入设备。

## 项目结构

- `src/main.js`: Electron 主进程入口
- `src/preload.js`: 预加载脚本，处理 IPC 安全通信
- `src/renderer/`: React 前端代码 (Vite)
- `src/db/`: 数据库管理 (better-sqlite3)
- `src/asr/`: 语音识别服务 (whisper.cpp / transformers.js)
- `scripts/`: 辅助脚本 (模型下载、编译等)

## 贡献指南
欢迎提交 Issue 和 Pull Request。开发前请阅读 `DEVELOPMENT_PLAN.md` 了解开发计划。



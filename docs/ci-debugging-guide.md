# GitHub Actions 自动化排查与调试指南

本文档总结了利用 MCP 浏览器工具与 Cursor 协作排查 GitHub Actions 问题的完整工作流。这种方法能够高效定位 CI/CD 构建失败的根因，特别是针对复杂的跨平台编译和依赖问题。

## 核心思路

传统的 CI 排查通常依赖于阅读冗长的文本日志或盲目推测。本方案的核心在于：
**像用户一样使用浏览器，直观地定位错误现场，结合源码分析，精准修复。**

## 推荐排查工具

1. **MCP Browser Tools** (Cursor 内置)：
   - `browser_navigate`: 访问 GitHub Actions 页面。
   - `browser_snapshot`: 获取页面结构快照，理解页面内容。
   - `browser_click`: 模拟点击，深入查看特定 Job 或 Step 的日志。
   - `browser_wait_for`: 等待动态内容加载。

2. **Codebase Tools**:
   - `read_file`: 读取工作流配置文件 (`.yml`) 和构建脚本。
   - `grep` / `search`: 搜索报错关键词。

## CI 验证全流程

当你修改了代码（例如修复了构建逻辑）并希望验证 CI 是否正常时，请遵循以下步骤：

### 1. 提交代码触发 Action
首先，确保你的修改已提交并推送到远程分支。
```bash
git add .
git commit -m "fix: CI build logic"
git push
```
GitHub Actions 会根据 `.github/workflows/*.yml` 中的 `on: push` 规则自动触发构建。

### 2. 访问 Action 列表页
推送后，立即通过浏览器工具访问 Actions 页面，确认 Action 是否已被触发。

```javascript
// 示例工具调用
browser_navigate({ url: "https://github.com/JStone2934/LiveGalGame/actions" })
```
- **目的**：确认最新的 commit 确实触发了一个新的 Workflow Run。
- **预期**：你应该能看到一个状态为 "in progress"（黄色旋转图标）或 "queued" 的新记录，标题应包含你刚才的 commit message。

### 3. 实时监控构建状态
使用快照工具周期性查看页面，或点击进入详情页等待。

```javascript
// 示例工具调用
browser_snapshot()
// 如果看到运行记录，点击进入详情
browser_click({ element: "in progress: Run ...", ref: "e211" })
```
- **目的**：监控构建进度。
- **技巧**：
  - CI 构建通常需要几分钟到几十分钟。
  - 你可以使用 `browser_wait_for` 或间隔性调用 `browser_snapshot` 来观察状态变化。
  - 关注 "Jobs" 列表，看各个平台的构建任务（如 `Desktop mac (arm64)`）是否开始运行。

### 4. 快速定位失败（如果有）
如果构建变成红色（Failure），立即按照以下步骤定位：

1. **定位失败的 Run**：
   ```javascript
   browser_snapshot()
   // 点击红色的失败记录
   browser_click({ element: "failed: Run ...", ref: "e211" })
   ```
2. **深入 Job 详情**：
   进入详情页后，找到失败的 Job（例如 `Desktop mac (arm64)`），点击进入。
   ```javascript
   browser_wait_for({ time: 2 }) // 等待加载
   browser_click({ element: "failed: Desktop mac (arm64)", ref: "..." })
   ```
3. **获取详细报错日志**：
   查看具体的 Step 日志，复制报错信息进行分析。
   （参考下文 "排查实战案例"）

### 5. 验证成功
如果构建变成绿色（Success），说明修复有效。
- **检查 Artifacts**：在 Run 详情页底部，确认是否生成了预期的构建产物（如 `.dmg` 或 `.exe` 文件）。
- **下载验证**（可选）：如果需要回归测试，可下载 Artifact 进行本地运行（参考 `docs/asr-ci-regression.md`）。

---

## 排查工作流详解（当构建失败时）

### 4. 获取详细报错日志
点击失败的 Job，查看具体的 Step 日志。

**排查实战案例（ASR 依赖编译失败）**：
1. **现象**：Job `Desktop mac (arm64)` 失败。
2. **操作**：点击 Job 链接。
3. **发现**：在 "Install ASR dependencies" 步骤中，pip 报错：
   ```
   Package libavformat was not found in the pkg-config search path.
   ERROR: Failed to build 'av' when getting requirements to build wheel
   ```
4. **分析**：
   - 错误表明 `av` 包试图从源码编译，但系统缺少 `ffmpeg` (libavformat) 库。
   - 检查 `.github/workflows/desktop-build.yml`，发现是在 `Setup Python` 后直接运行 `pip install -r requirements.txt`。
   - CI 环境（GitHub Hosted Runner）默认没有安装 FFmpeg 开发库。

### 5. 源码比对与根因分析
回到代码库，检查相关配置。

- **检查 `requirements.txt`**：确认 `av==10.0.0` 是否存在。
- **检查构建脚本**：查看 `scripts/prepare-python-env.js`。
- **发现矛盾**：
  - 我们已经在 `prepare-python-env.js` 中实现了使用 `conda` 安装预编译二进制包（不需要本地编译）。
  - 但 CI Workflow 中却保留了一个旧的步骤 `pip install -r requirements.txt`，它运行在 `prepare-python-env.js` **之前**。
  - **结论**：CI 的冗余步骤抢先执行了 pip 安装，导致编译失败。

### 6. 修复方案
**移除 CI 中的冗余步骤，统一构建逻辑。**

将环境准备工作完全收敛到 `prepare-python-env.js` 中，利用 Conda 的二进制分发能力解决编译依赖问题。

```yaml
# 修改前
- name: Setup Python ...
- name: Install ASR dependencies ... # ❌ 这里直接 pip install 导致编译失败
  run: pip install -r requirements.txt

# 修改后
# ✅ 移除上述步骤，直接进入 Build 阶段，由脚本统一处理
- name: Build desktop package
  run: pnpm run build:mac # 内部调用 prepare-python-env.js
```

## 实操示例：从最新失败的 Action 中提取详细错误（mac 构建）

以下示例基于 `feat/desktop-branch` 最新一次失败的 Run（#31，commit `e2684c9`），演示如何迅速获取最关键的错误日志：

1) 打开 Action 列表  
   - 访问 `https://github.com/JStone2934/LiveGalGame/actions`，找到最新一条失败的记录（红色 failed）。

2) 进入对应 Run  
   - 点击失败记录，进入详情页后在 “Jobs” 中选择 `Desktop mac (arm64)`（或 x64）。

3) 若网页日志加载不便，可用 GitHub API 直接抓取日志并定位错误  
   - 下载日志（需要 GH_TOKEN，参考 `docs/asr-ci-regression.md`）：  
     ```bash
     cd /Users/cccmmmdd/LiveGalGame
     curl -L -H "Authorization: Bearer $GH_TOKEN" \
       -o /tmp/run-19983014012.log \
       https://api.github.com/repos/JStone2934/LiveGalGame/actions/runs/19983014012/logs
     cd /tmp && unzip -o run-19983014012.log -d run-19983014012-logs
     tail -n 120 "run-19983014012-logs/0_Desktop mac (arm64).txt"
     ```
   - 关键报错（摘录）：  
     ```
     error    libmamba Could not solve for environment specs
       └─ faster-whisper =0.10 * does not exist (perhaps a typo or a missing channel).
     Error: Command failed: .../mamba install -y -p ... ffmpeg av=10.* faster-whisper=0.10.*
     ```
   - 结论：conda-forge 没有 `faster-whisper=0.10.*` 的包，mamba 解算失败，`prepare-python-env.js` 随之退出。

4) 修复方向（供后续操作参考）  
   - 方案 A：改为 pip 安装 faster-whisper，conda 仅装 ffmpeg/av。  
   - 方案 B：在 conda-forge 可用的版本范围内调整 faster-whisper 版本约束。  
   - 方案 C：去掉 mamba 对 faster-whisper 的安装，仅保留 pip 安装。

### 最新经验（2025-12-06）
- mac 构建依赖匹配：`faster-whisper==0.10.0` 预编译轮子使用 `av` 10.x，已在 `requirements.txt` 固定 `av==10.0.0`，`prepare-python-env.js` 中 mamba 只安装 `ffmpeg` + `av==10.0.0`，`faster-whisper` 由 pip 安装（同时锁 `numpy<2`）可避免解算/ABI 冲突。
- 日志/模型下载前务必先开启代理：在 Runner 或本地执行 `dl1` 启用代理后再跑 curl/pip/HF 下载，否则可能超时或 SOCKS 依赖缺失导致模型注册失败。
- 若 GitHub 日志直链下载报 HTTP2 framing 错误，可尝试加 `--http1.1`：`curl --http1.1 -L -o run.log https://api.github.com/.../logs`。

## 持续迭代的循环操作指南

当你需要多轮修复 / 回归时，按以下闭环重复：

1) 做出最小必要改动并提交  
   - 只提交与修复相关的文件，避免把大体积缓存目录（如 `python-bootstrap/`、`__pycache__`）加入版本库。  
   - 推送到对应分支，触发 Actions。

2) 监控最新一次 Run  
   - Actions 列表页找到最新记录（状态可能是 queued/in progress/failed）。  
   - 若失败，点击进入对应 Run，锁定失败的 macOS Job。

3) 获取并阅读日志  
   - 优先看网页日志；若加载慢，用 API 下载压缩日志并解压。  
   - 关注最后的错误段落，通常在尾部能看到最直接的报错。

4) 分析并收敛修复  
   - 判断是依赖解算、编译缺库、脚本逻辑或环境版本问题。  
   - 在源码/脚本里做最小修正，再次提交、推送。

5) 循环直到绿色  
   - 每轮只解决当前最致命的失败点。  
   - 构建转绿后，检查 Artifacts，必要时下载做回归运行（参考 `docs/asr-ci-regression.md`）。

## 总结

通过 **Browser 浏览日志 -> Codebase 定位配置 -> 逻辑一致性分析** 的闭环流程，我们能够快速识别出 CI 配置与实际构建脚本之间的冲突。

这种方法的优势在于：
1. **所见即所得**：直接看到 CI 运行时的真实报错，而非本地猜测。
2. **上下文完整**：能同时看到报错发生的 Step 和其前后的环境设置。
3. **精准打击**：直接定位到配置文件的具体行数进行修复。

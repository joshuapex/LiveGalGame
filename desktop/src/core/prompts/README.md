# Prompt Templates

本目录存放 LiveGalGame Desktop 的 **LLM Prompt 模板**（纯文本/Markdown），用于将 Prompt 从业务 JS 逻辑中解耦，便于：

- 开源协作：Prompt diff 更直观，review 更容易
- 迭代维护：改文案不必改业务代码结构
- 版本管理：可对 Prompt 做独立演进与回滚

## 使用方式

Prompt 由 `src/core/modules/prompt-manager.js` 加载并渲染，支持最小化的变量替换：

- 变量语法：`{{key}}` 或 `{{nested.key}}`
- 未提供的变量默认替换为空字符串（保持运行时鲁棒）
- 如需新增模板：在本目录新增文件，并在 `prompt-manager.js` 的 `PROMPT_FILES` 注册

## 现有模板

- `suggestion.prompt.md`：对话建议生成（TOON suggestions）
- `situation.prompt.md`：时机判断（TOON situation）
- `review.with_nodes.prompt.md`：复盘（有决策节点）
- `review.no_nodes.prompt.md`：复盘（无决策节点）

## 约定与注意事项

- **输出格式优先级最高**：TOON 表头/字段定义必须稳定，否则解析器会失败。
- **好感度评估采用 Rubric**：复盘类 Prompt 使用论文评审式 5 档（reject/weak reject/weak accept/accept/strong accept）来约束 `total_affinity_change` 的取值区间，避免评分漂移。
- Prompt 里尽量避免与运行时变量同名的 `{{...}}` 文本；如果确实需要，考虑改写文案。
- 模板文件会随 Electron 打包（因为位于 `src/core/**/*` 范围内），无需额外配置。

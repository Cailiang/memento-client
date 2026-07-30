# Memento Agent 0.6.29

## 简体中文

`0.6.29` 让忽略项、电脑体检分析动作和 Agent 回复变得更直观。

### 主要变化

- 应用管理顶部新增“已忽略 N 项”，点击后直接查看或恢复被忽略的应用；设置中仍保留统一管理入口。
- 电脑体检中的“处理 / 问 Agent”统一改为“AI 分析”，明确点击只会分析，不会立即删除或修改系统。
- 体检列表不再混用“可安全处理 / 需要确认”与相同按钮，改为显示每项有几个可选操作，并提示用户在 AI 分析后选择。
- AI 分析会比较该项目的全部可选操作，不会默认选择第一项或直接加入执行计划。
- Agent 正文现在正确解析粗体、项目符号、编号列表、换行、代码和表格；模型提供的原始 HTML 不会执行。
- 新增 Markdown 渲染安全测试和应用忽略入口、体检动作的四视口回归检查。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.29` makes ignored items, Computer Health analysis, and Agent responses easier to understand.

### Highlights

- Application Management now shows an “N ignored” control that opens ignored applications directly; Settings still provides the combined manager.
- Computer Health uses AI analysis instead of ambiguous Handle and Ask Agent labels, making it clear that a click does not delete or change anything.
- Health rows show the number of available actions and tell the user to choose after analysis instead of mixing Safe to handle and Needs review with the same button.
- Analysis compares every available operation without selecting the first operation or adding it to an execution plan automatically.
- Agent prose now renders bold text, bullets, numbered lists, line breaks, code, and tables correctly; model-provided raw HTML is never executed.
- Added Markdown safety coverage and four-viewport regression checks for ignored applications and health analysis actions.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

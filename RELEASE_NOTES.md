# Memento Agent 0.6.26

## 简体中文

`0.6.26` 修复 Agent 丢失上下文的问题，并把纯文本诊断升级为与应用功能直接联动的结构化结果。

### 主要变化

- 同一对话会在 SQLite 中保存会话 ID、最近焦点实体和待确认计划；“这个服务”“该应用”“it”等后续指代会继续使用上一轮的精确对象。
- 指代上一轮对象时，检查工具只向模型返回该焦点实体，避免再次列出 nginx、数据库等无关服务。
- Agent 通过 `present_results` 返回受校验的结构化数据，不渲染模型生成的 HTML，避免 XSS、虚构按钮和未经注册的操作。
- 应用诊断使用带 Logo 的紧凑网格，显示最后使用时间和大小，并可直接打开或加入卸载确认计划；存储、后台服务和终端结果可直接加入右侧计划。
- 结果按钮只能引用当前扫描注册的操作 ID；清理、停止、移除、卸载和终端修复仍必须由用户确认后执行。
- 应用语言设为 English 后，Agent 提示词、状态、摘要、结果标题、计划、错误和供应商测试均使用英文；切换语言会重新体检，避免复用旧语言数据。
- 新增 Cisco 服务连续指代、上下文持久化、非法操作拒绝、英文错误和多视口结构化结果测试。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.26` fixes lost Agent context and replaces text-heavy diagnostics with structured results connected to Memento's native capabilities.

### Highlights

- Conversations persist a thread ID, focused entities, and pending plans in SQLite, so follow-ups such as “this service,” “that app,” or “it” retain the exact previous target.
- Referential follow-ups restrict inspection output to the focused entity instead of exposing unrelated services to the model again.
- The Agent uses a validated `present_results` contract. Memento renders trusted React components and never executes or injects model-generated HTML.
- Application findings use a compact logo grid with last-used time, size, Open, and Add to plan. Storage, service, and terminal findings expose their registered actions inline.
- Interactive controls can reference only operation IDs registered by the current scan. Cleanup, stop, remove, uninstall, and terminal actions still require explicit confirmation.
- English mode now controls Agent instructions, statuses, summaries, result titles, plans, errors, and provider tests. Changing language triggers a fresh localized scan.
- Added regression coverage for Cisco service follow-ups, context persistence, invalid operation rejection, English output, and structured results across desktop and mobile viewports.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

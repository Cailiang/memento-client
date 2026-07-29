# Memento Agent 0.6.21

## 简体中文

`0.6.21` 是 `agent` 分支第一次完整重建版本。它不再沿用旧 Renderer 和远端 AI Gateway，而是严格按照 `prototypes/memento-agent/index.html` 实现新的本地 Agent 产品。

### 主要变化

- 从头实现 Agent、电脑体检、应用管理、任务记录和设置五个工作区，并覆盖桌面、窄侧边栏、平板与手机布局。
- 引入 Vercel AI SDK `ToolLoopAgent`，支持 OpenAI 兼容、OpenAI、Anthropic 和 Google Gemini，可保存多个供应商并选择默认模型。
- 使用 Electron 43 自带的 SQLite 保存供应商、加密密钥、应用设置、Agent 任务与工具记录。
- Agent 能读取真实体检数据并准备可执行计划，但不能直接执行或生成任意 Shell 命令；用户确认后才会调用现有受控操作注册表。
- 执行结束会重新体检并保存真实结果；伪造、过期或未确认的操作 ID 会被拒绝。
- 应用管理以带真实 Logo 的网格展示可管理 APP、最后使用时间、大小、打开和卸载操作，系统受保护应用不会列出。
- 存储空间和后台服务支持紧凑的忽略交互；忽略项会同时离开体检结果、执行注册表和 Agent 上下文。
- 删除旧 Hosted AI、Gateway、OAuth、旧 AI 页面、旧配置存储与相关示例，全部开发文档已按新架构重写。
- 新增 SQLite 加密/迁移/供应商测试、Agent 计划边界测试，以及覆盖五个页面和四种视口的 UI 冒烟脚本。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.21` is the first complete rebuild on the `agent` branch. It replaces the old Renderer and remote AI Gateway with the local Agent product defined by `prototypes/memento-agent/index.html`.

### Highlights

- Rebuilt Agent, Computer Health, Applications, Task History, and Settings for desktop, compact sidebar, tablet, and phone layouts.
- Added Vercel AI SDK `ToolLoopAgent` with OpenAI-compatible, OpenAI, Anthropic, and Google Gemini providers, multiple saved configurations, and one default model.
- Added Electron 43 built-in SQLite storage for providers, encrypted keys, app settings, Agent runs, and tool records.
- Agent can inspect real scan data and prepare executable plans, but cannot execute directly or generate arbitrary shell operations. Existing controlled registries run only after confirmation.
- Every execution is followed by a fresh scan and persisted real results. Invented, stale, or unconfirmed operation IDs are rejected.
- Applications uses a real-icon grid with last-used time, size, Open, and confirmed Uninstall. Protected system apps are excluded.
- Storage and services support compact ignored-item management that also removes capabilities from Agent context.
- Removed hosted AI, Gateway, OAuth, old AI pages, old settings storage, and related examples; rewrote development documentation for the new architecture.
- Added SQLite encryption/migration/provider tests, Agent plan-boundary tests, and a four-viewport UI smoke test for all five pages.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

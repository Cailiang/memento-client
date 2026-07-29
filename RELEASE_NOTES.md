# Memento Agent 0.6.28

## 简体中文

`0.6.28` 自动接入本机 CC Switch 供应商，并提高常用页面的可读性与信息密度。

### 主要变化

- 启动时自动检测 `~/.cc-switch/cc-switch.db` 及 CC Switch 自定义配置目录，并导入可用的 Claude、Codex 和 Gemini 供应商。
- 导入会识别 Anthropic、OpenAI Chat、OpenAI Responses 和 Gemini API 格式；无密钥占位配置会跳过，重复启动或相同手工配置不会重复添加。
- CC Switch 数据库只读打开。密钥只在 Electron 主进程读取，并立即使用 Memento 既有 AES-256-GCM 方案重新加密保存。
- 顶部工具栏新增持续可见的版本号，本版本显示为 `v0.6.28`。
- 电脑体检、应用管理和任务记录改用紧凑状态/操作栏；设置页直接进入实际设置内容，不再重复显示大标题和说明。
- Agent 回复、分析进度、结构化结果、电脑体检条目、应用卡片、任务记录和设置表单文字已整体提高到更易读的字号。
- 新增 CC Switch 三类配置、自定义路径、TOML 解析、去重、加密以及四视口紧凑布局测试。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.28` automatically imports local CC Switch providers and improves readability across the primary work areas.

### Highlights

- Memento detects `~/.cc-switch/cc-switch.db` and CC Switch's custom configuration directory at startup, then imports usable Claude, Codex, and Gemini providers.
- Import maps Anthropic, OpenAI Chat, OpenAI Responses, and Gemini API formats. Credential-free placeholders are skipped, and repeated startup or matching manual providers do not create duplicates.
- The CC Switch database is opened read-only. Credentials are read only in the Electron main process and immediately re-encrypted with Memento's existing AES-256-GCM storage.
- The persistent top toolbar now shows the exact build version, `v0.6.28` for this release.
- Computer Health, Applications, and Task History use compact status/action rows; Settings opens directly into useful controls without a redundant title block.
- Agent responses, progress, structured results, health findings, application cards, task history, and settings forms now use more readable text sizes.
- Added coverage for all three CC Switch formats, custom paths, TOML parsing, de-duplication, encryption, and compact four-viewport layouts.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

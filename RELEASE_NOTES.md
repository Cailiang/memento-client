# Memento Agent 0.6.22

## 简体中文

`0.6.22` 修复首次启动、macOS 标题栏、应用卸载反馈和模型供应商配置问题，并与 `prototypes/memento-agent/index.html` 保持一致。

### 主要变化

- 首次启动立即显示无虚假进度的品牌动效，不再出现长时间白屏。
- Logo 和名称下移到 macOS 窗口控制按钮之外，顶部区域仍可拖动窗口。
- 卸载 APP 时显示明确的执行中状态；成功后卡片动画退出，列表立即更新并在后台复检。
- 填写服务地址和密钥后自动获取模型列表，用户直接选择模型，也可刷新或在接口不支持时手动填写。
- 自动把 `https://code.tczor.cn` 等根地址补全为 `/v1` API 基地址，修复错误路由导致的连接超时。
- 编辑已有配置时可复用本地加密密钥获取模型，所有超时和接口错误都会显示可操作且已脱敏的提示。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.22` fixes first launch, macOS title-bar spacing, application uninstall feedback, and provider setup while staying aligned with `prototypes/memento-agent/index.html`.

### Highlights

- Shows an immediate branded startup animation instead of a long blank window, without fake progress.
- Keeps the sidebar brand clear of macOS traffic lights while retaining draggable window regions.
- Shows an explicit uninstalling state, animates successful removal from the grid, and verifies it with a background scan.
- Automatically fetches models after a URL and credential are available, with selection, refresh, error, and manual-entry states.
- Resolves root URLs such as `https://code.tczor.cn` to their `/v1` API base before discovery and Agent requests.
- Reuses encrypted credentials for existing providers and reports shorter, actionable, sanitized timeout and API errors.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

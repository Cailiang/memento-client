# Memento Agent 0.6.25

## 简体中文

`0.6.25` 修复正常 APP 被 macOS 废纸篓接口误报权限错误时无法卸载的问题。

### 主要变化

- 系统废纸篓接口失败但 APP 仍在原位时，自动回退到当前用户的废纸篓。
- 回退严格限制为 `/Applications` 和用户应用目录中的真实 APP，系统受保护或嵌套应用不会被处理。
- 废纸篓中存在同名 APP 时自动选择无冲突名称，不会覆盖已有项目。
- 只有文件系统确实要求更高权限时才显示 macOS 管理员授权，并在成功后验证原路径已经消失。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.25` fixes valid applications failing to uninstall when the macOS Trash API reports an unrelated permission error.

### Highlights

- Falls back to the current user's Trash when the native Trash API fails and leaves the app in place.
- Restricts fallback moves to real applications under `/Applications` or the user's Applications directory; protected and nested bundles remain excluded.
- Selects a non-conflicting destination instead of overwriting an existing item in Trash.
- Requests macOS administrator authorization only for genuine filesystem permission failures and verifies the completed move.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

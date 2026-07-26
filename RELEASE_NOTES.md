# Memento 0.6.16

## English

This release restores AI analysis for actionable storage findings.

### Highlights

- Memento Server now accepts permanent storage cleanup and service-directory cleanup actions in candidate-analysis reports.
- Storage findings that use `delete-storage` can complete AI analysis instead of failing protocol validation.
- Protocol incompatibilities now show a specific update message instead of claiming that the AI provider is unavailable.
- The fix was verified end to end against the real local Gateway and configured model provider.

### Platform note

Full maintenance scanning and cleanup currently support macOS. Windows and Linux packages are previews of the desktop shell and AI settings and do not expose macOS cleanup actions.

## 简体中文

这个版本恢复了可操作存储项目的 AI 分析。

### 主要变化

- Memento Server 现在接受候选分析报告中的永久存储清理和服务目录清理操作。
- 使用 `delete-storage` 的存储项目可以正常完成 AI 分析，不再因协议校验失败。
- 协议不兼容会显示明确的更新提示，不再误报 AI Provider 不可用。
- 已通过本地真实 Gateway 和已配置模型完成端到端验证。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。Windows 和 Linux 安装包用于预览桌面界面与 AI 设置，不会提供 macOS 清理操作。

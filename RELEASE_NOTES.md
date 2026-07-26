# Memento 0.6.14

## English

This release makes application cleanup easier to understand and catches apps that have not been used for three months.

### Highlights

- The former **Applications** module is now named **App cleanup** to reflect that it shows only actionable findings.
- Apps with confirmed Spotlight usage dates older than 90 days are suggested for review, replacing the previous 180-day threshold.
- Applications with unknown usage dates remain excluded to avoid unsafe cleanup suggestions.
- The empty state now states exactly which duplicate and unused-app checks completed without findings.
- Application bundle sizes now use Spotlight logical size, fixing incorrect `1 B` values in cleanup estimates.

### Platform note

Full maintenance scanning and cleanup currently support macOS. Windows and Linux packages are previews of the desktop shell and AI settings and do not expose macOS cleanup actions.

## 简体中文

这个版本让应用清理更容易理解，并能发现已经 3 个月没有使用的应用。

### 主要变化

- 原“应用版本”模块更名为“应用清理”，明确这里只展示可处理的建议。
- Spotlight 使用记录超过 90 天的应用会进入复核建议，替代原来的 180 天阈值。
- 使用时间未知的应用继续排除，避免产生不安全的清理建议。
- 空状态现在会明确说明重复应用与长期未使用应用检查均未发现结果。
- 应用大小改用 Spotlight 逻辑大小，修复清理空间可能错误显示为 `1 B` 的问题。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。Windows 和 Linux 安装包用于预览桌面界面与 AI 设置，不会提供 macOS 清理操作。

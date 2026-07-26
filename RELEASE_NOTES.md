# Memento 0.6.15

## English

This release makes startup scanning easier to follow and fixes false Homebrew cleanup results.

### Highlights

- A new startup animation shows the live state of background services, storage, app cleanup, and terminal diagnostics.
- Progress starts low and advances only as actual scan modules finish, rather than jumping above 60% before work completes.
- Homebrew findings now reflect what `brew cleanup --dry-run` can really remove. On machines where Homebrew skips `openexr` because the newest formula is not installed, it is no longer mislabeled as reclaimable.
- Cleanup is checked again before execution and only succeeds after every listed old keg directory is confirmed gone.

### Platform note

Full maintenance scanning and cleanup currently support macOS. Windows and Linux packages are previews of the desktop shell and AI settings and do not expose macOS cleanup actions.

## 简体中文

这个版本让启动扫描更容易理解，并修复 Homebrew 清理结果与实际目录不一致的问题。

### 主要变化

- 新启动动画会实时展示后台服务、存储空间、应用清理和终端诊断四个模块的状态。
- 进度从低位开始，只在真实扫描模块完成时推进，不会在工作尚未完成时直接跳过 60%。
- Homebrew 候选以 `brew cleanup --dry-run` 的实际可移除结果为准。如果 Homebrew 因最新配方尚未安装而跳过 `openexr`，它不会再被误标为可清理。
- 清理执行前会再次校验，只有列出的旧 keg 目录全部确认消失后才会报告成功。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。Windows 和 Linux 安装包用于预览桌面界面与 AI 设置，不会提供 macOS 清理操作。

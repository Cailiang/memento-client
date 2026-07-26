# Memento 0.6.19

## English

This release makes the application grid easier to identify and use with official localized names and direct launching.

### Highlights

- Official Simplified Chinese application names are read from each app bundle when available; apps without an official localization keep their existing name.
- Every application card now has a direct Open action with visible progress and result feedback.
- Application launching is restricted to manageable apps in the current scan and validated again in the Electron main process.
- Open and Uninstall use a compact two-button layout; uninstall remains destructive and requires confirmation.

### Uninstall scope

Uninstall still requires confirmation and moves only the selected `.app` bundle to the Trash. Documents, preferences, caches, and other application data are kept.

### Platform note

Full maintenance scanning and cleanup currently support macOS. This local Intel x64 package is unsigned and unnotarized.

## 简体中文

这个版本让应用网格更容易识别和操作，新增官方中文名称与直接启动功能。

### 主要变化

- APP 自带简体中文名称时优先显示官方中文名；没有官方中文本地化时保留原名称。
- 每张应用卡新增“打开”操作，并显示执行中状态和结果反馈。
- 仅允许启动当前扫描结果中的可管理应用，Electron 主进程会再次校验路径。
- “打开”和“卸载”采用紧凑双按钮布局；卸载仍为危险操作并需要二次确认。

### 卸载范围

卸载仍需二次确认，并且只会把所选 `.app` 应用本体移到废纸篓；文稿、偏好设置、缓存和其他应用数据都会保留。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。本地 Intel x64 安装包未签名、未公证。

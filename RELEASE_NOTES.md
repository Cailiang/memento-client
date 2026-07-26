# Memento 0.6.18

## English

This release redesigns App cleanup as a visual application grid with real macOS app icons.

### Highlights

- Responsive four-column desktop and two-column narrow-window application grids.
- Real app icons are read securely by the Electron main process and lazy-loaded as cards approach the viewport.
- Cards keep version, exact last-used date, relative age, size, application scope, and Finder location visible.
- Search, unused/shared/user filters, sorting, individual uninstall, and batch selection remain available.
- Protected macOS system apps and the running Memento app are excluded instead of appearing as non-actionable cards.

### Uninstall scope

Uninstall still requires confirmation and moves only the selected `.app` bundle to the Trash. Documents, preferences, caches, and other application data are kept.

### Platform note

Full maintenance scanning and cleanup currently support macOS. This local Intel x64 package is unsigned and unnotarized.

## 简体中文

这个版本将“应用清理”重做为带真实 macOS 应用图标的可视化网格。

### 主要变化

- 桌面窗口采用四列网格，窄窗口采用两列网格。
- 真实 APP 图标由 Electron 主进程安全读取，并在卡片接近可视区域时懒加载。
- 卡片保留版本、最后使用日期、相对天数、大小、应用范围和 Finder 位置。
- 继续支持搜索、闲置/共享/个人应用筛选、排序、单项卸载和批量选择。
- macOS 系统受保护应用和当前运行的 Memento 会直接排除，不再显示不可操作卡片。

### 卸载范围

卸载仍需二次确认，并且只会把所选 `.app` 应用本体移到废纸篓；文稿、偏好设置、缓存和其他应用数据都会保留。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。本地 Intel x64 安装包未签名、未公证。

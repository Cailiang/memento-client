# Memento 0.6.17

## English

This release turns App cleanup into a complete installed-application manager.

### Highlights

- Lists apps installed in shared, user, and macOS system application directories.
- Shows every app's version, size, Finder location, and exact Spotlight last-used date.
- Provides search, practical filters, and sorting by last use, size, or name.
- Supports individual and batch uninstall confirmation for removable apps by moving their bundles to the Trash.
- Keeps system apps and the running Memento app visible but protected from uninstall.
- Treats missing Spotlight usage metadata as unknown, never as evidence that an app is unused.

### Uninstall scope

App cleanup moves only the selected `.app` bundle to the Trash. Documents, preferences, caches, and other application data are kept.

### Platform note

Full maintenance scanning and cleanup currently support macOS. This local Intel x64 package is unsigned and unnotarized.

## 简体中文

这个版本将“应用清理”升级为完整的已安装应用管理器。

### 主要变化

- 罗列共享目录、用户目录和 macOS 系统目录中的已安装 APP。
- 展示每个应用的版本、大小、Finder 位置和 Spotlight 最后使用日期。
- 支持搜索，以及按类型筛选和按最后使用时间、大小或名称排序。
- 可单项或批量选择可卸载应用，确认后将应用本体移到废纸篓。
- 系统应用和当前运行的 Memento 会正常展示，但禁止卸载。
- Spotlight 没有使用记录时显示为未知，不会据此误判应用长期未使用。

### 卸载范围

应用清理只会把所选 `.app` 应用本体移到废纸篓，文稿、偏好设置、缓存和其他应用数据都会保留。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。本地 Intel x64 安装包未签名、未公证。

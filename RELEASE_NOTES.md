# Memento Agent 0.6.31

## 简体中文

`0.6.31` 精简顶部信息，并让更新检查与外部供应商导入更符合用户预期。

### 主要变化

- 顶部右侧不再显示时钟、重复版本、快捷体检和设置按钮；版本号移到 Memento 名称下方。
- 启动后及每小时自动检查 GitHub 最新稳定版本，发现新版本时显示系统通知和应用内提醒；设置中也可立即检查。
- CC Switch 只在首次自动读取一次，完成状态保存在 SQLite；用户删除导入项后不会在下次启动时重新出现。
- 设置新增“重新导入 CC Switch”，需要时可主动读取，并反馈检测到及新增或更新的配置数量。
- 模型供应商的长错误不再挤在状态标签中；失败地址和服务响应会完整换行显示、可选中复制，并隐藏密钥查询参数。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.31` removes redundant toolbar information and makes update checks and external provider imports predictable.

### Highlights

- The clock, duplicate version badge, Quick Scan, and Settings actions were removed from the upper-right toolbar; the build version now sits below the Memento name.
- Memento checks the latest stable GitHub release after startup and every hour, shows native and in-app notifications for updates, and supports a manual Settings check.
- CC Switch is imported automatically only once and records completion in SQLite, so user-deleted imports no longer return on the next launch.
- Settings now provides an explicit Re-import CC Switch action and reports detected and added-or-updated counts.
- Long provider errors now render in wrapping, selectable alerts with the failed endpoint and server response while credential query parameters stay hidden.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

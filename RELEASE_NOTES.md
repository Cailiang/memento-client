# Memento Agent 0.6.36

## 简体中文

`0.6.36` 让清理位置更直观、后台服务分类更紧凑，并可直接从磁盘浏览把项目移到废纸篓。

### 主要变化

- 每条清理建议直接显示路径，点击即可打开目录或在 Finder 中定位文件。
- 后台服务使用水平分类切换，不再纵向堆叠多个分类区块。
- 磁盘项目支持右键在 Finder 中显示或移到废纸篓，操作前会明确确认路径、类型和容量。
- 移除后自动重新扫描磁盘；卷根、系统顶层目录和整个用户主目录不允许从浏览器移除。
- 所有磁盘操作只接受本轮扫描注册的项目 ID，并拒绝符号链接和越界路径。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.36` makes cleanup locations visible, compacts service categories, and allows scanned disk items to move directly to Trash.

### Highlights

- Every cleanup finding shows a clickable registered path that opens the folder or reveals the file in Finder.
- Background services use a horizontal category switcher instead of stacked sections.
- Disk items expose a right-click menu for Finder reveal or Move to Trash, followed by explicit path, type, and size confirmation.
- The disk scan refreshes after removal; the volume root, top-level system folders, and the whole user home folder cannot be removed from the browser.
- Disk actions accept only IDs registered by the current scan and reject symbolic links and out-of-volume paths.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

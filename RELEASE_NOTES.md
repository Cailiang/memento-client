# Memento Agent 0.6.34

## 简体中文

`0.6.34` 让并行 Agent 分析保持可见，并新增完整、异步的磁盘容量浏览器。

### 主要变化

- Agent 页面新增任务切换条，同时分析多个对象时会保留每一项的独立状态和结果。
- 存储空间拆分为安全筛选后的“清理建议”和完整容量“磁盘浏览”，不再让建议数量看起来像磁盘项目总数。
- 磁盘扫描异步运行、支持取消，显示真实项目数、耗时、当前位置和无权限目录数，不显示虚假百分比。
- 分栏浏览器按照容量排序并逐层展开目录和大文件，支持在 Finder 中定位扫描结果。
- 磁盘浏览不会直接删除任意路径；现有白名单清理边界保持不变。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.34` keeps concurrent Agent analyses visible and adds a complete asynchronous disk-usage browser.

### Highlights

- The Agent page now keeps every concurrent analysis visible in a task switcher with independent status and results.
- Storage is split into safety-filtered cleanup findings and a complete disk-usage browser, so the finding count is no longer presented like a disk item total.
- Disk scanning runs asynchronously, can be cancelled, and reports real item counts, elapsed time, current location, and inaccessible locations without a fake percentage.
- The column browser sorts folders and large files by size, drills through their hierarchy, and reveals registered results in Finder.
- Arbitrary disk-browser paths cannot be deleted; existing cleanup allowlists remain unchanged.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

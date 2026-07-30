# Memento Agent 0.6.35

## 简体中文

`0.6.35` 减少重复清理建议，增加后台服务异常分类，并让磁盘浏览可以全屏使用。

### 主要变化

- 同一目录中的多个大文件合并为一条建议，一次即可忽略整个目录；实际清理仍逐文件确认。
- 后台服务按残留、启动失败、资源异常、长期运行、长期未使用和其他启动项分类。
- 服务扫描增加 CPU、内存和连续运行时长证据，并将异常分类提供给 Agent 分析。
- Homebrew 启动失败项也会显示，但不会提供不适用的停止操作。
- 磁盘分栏浏览器支持全屏和 Esc 退出。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.35` reduces repetitive cleanup findings, classifies background-service anomalies, and makes the disk browser usable fullscreen.

### Highlights

- Multiple large files in one folder are grouped into a single finding that can be ignored once; cleanup remains file-by-file.
- Background services are grouped as orphaned, failed, resource-heavy, long-running, stale, or other startup items.
- Service evidence and Agent analysis now include CPU, memory, and elapsed-runtime sampling.
- Failed Homebrew services are visible without exposing an inapplicable stop action.
- The disk column browser supports fullscreen viewing and Escape-key exit.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

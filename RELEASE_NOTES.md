# Memento Agent 0.6.27

## 简体中文

`0.6.27` 改进了 Agent 等待体验，并补齐任务记录与应用管理中的直接操作。

### 主要变化

- Agent 回答时显示从低位开始、缓慢推进的动画进度条、真实阶段和已用时间；结果返回前不会显示 100%。
- 任务记录新增删除入口和确认弹窗，同时删除本机 SQLite 中对应的对话结果与工具调用记录。
- 应用管理现在展示 `/Applications`、`~/Applications` 和 `/System/Applications` 中的应用；App Store 等系统应用可以打开和询问 Agent，但不能卸载。
- 应用可以手动忽略，忽略后会离开应用列表、体检建议、可执行操作和 Agent 上下文，并可在设置中恢复。
- 每个应用新增“问 Agent”入口。分析会携带精确 Bundle ID、路径、版本、最后使用记录、可执行文件、后台组件标记和 URL 协议，适合判断驱动、安全组件或 URL Handler 的用途及卸载影响。
- 迅雷等把中文名放在根 `InfoPlist.strings` 的应用现在会显示官方中文名称；Spotlight 没有记录时显示“无使用记录”。
- 新增真实 App Store 保护、迅雷中文名、Claude Code URL Handler 元数据、应用忽略、历史删除和 Agent 低位进度测试。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.27` improves the Agent waiting experience and adds direct task-history and application-management controls.

### Highlights

- Agent responses now show an animated progress bar that starts low, advances gradually through actual run phases, reports elapsed time, and never reaches 100% before results arrive.
- Task History adds confirmed deletion, including the corresponding locally stored conversation results and tool-call records.
- Application Management now includes apps from `/Applications`, `~/Applications`, and `/System/Applications`. Protected apps such as App Store can be opened and analyzed but not uninstalled.
- Applications can be ignored. Ignored apps leave the inventory, health findings, registered operations, and Agent context until restored in Settings.
- Every application has Ask Agent. The exact Bundle ID, path, version, usage record, executable, background-only role, and URL schemes support precise driver, security-component, helper, and uninstall-impact analysis.
- Apps such as Thunder now use official localized names from root `InfoPlist.strings`; missing Spotlight dates display “No usage record.”
- Added real App Store protection, localized Thunder, Claude Code URL Handler metadata, application ignore, history deletion, and low-start Agent progress coverage.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

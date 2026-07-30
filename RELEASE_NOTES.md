# Memento Agent 0.6.30

## 简体中文

`0.6.30` 缩短从发现问题到完成处理的路径，并让用户随时回到原来的工作位置。

### 主要变化

- 忽略列表新增搜索；已忽略应用继续显示真实名称、Bundle ID、路径和应用 Logo，重启后也不会丢失。
- Agent 中点击“确认并执行”后不再出现第二次确认，而是立即显示清理动画、阶段进度和真实复检状态。
- 从存储空间、后台服务、终端诊断或应用管理进入 Agent 时，会记住标签、项目和滚动位置；顶部按钮可一键返回并高亮原位置。
- 电脑体检新增“直接操作”：熟练用户可以直接清理、停止服务、移除启动项或优化终端，无需先做 AI 分析。
- 直接操作仍只使用当前扫描注册的操作 ID，执行前确认一次，完成后自动重新体检。
- 新增忽略应用元数据、搜索与 Logo、单次确认、直接操作和返回定位的回归测试。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.30` shortens the path from finding an issue to completing the action while preserving the user's working position.

### Highlights

- Ignored items are searchable, and ignored applications retain their real name, Bundle ID, path, and app logo across scans and restarts.
- Confirm and run in Agent no longer opens a second confirmation; it immediately shows a cleanup animation, stage progress, and real verification state.
- Entering Agent from Storage, Services, Terminal, or Applications preserves the source tab, item, and scroll position for one-click return and focus restoration.
- Computer Health now offers direct registered actions for experienced users who want to clean, stop, remove, or optimize without AI analysis first.
- Direct actions still use only current-scan registered operation IDs, require one confirmation, and trigger an automatic verification scan.
- Added regression coverage for ignored metadata, search and logos, single-confirmation execution, direct actions, and source restoration.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

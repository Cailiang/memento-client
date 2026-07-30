# Memento Agent 0.6.37

## 简体中文

`0.6.37` 让终端诊断可以直接完成优化，并为并行 Agent 任务增加关闭功能。

### 主要变化

- 终端诊断顶部新增“一键优化”，一次执行本轮全部安全修复。
- 优化前自动备份 shell 配置，拒绝扫描后发生变化的文件，并在写入前校验 zsh 语法。
- 完成后自动重新体检，执行进度展示真实修复数量和结果。
- 单项终端问题把“直接优化”作为主要操作，AI 分析作为可选辅助。
- Agent 并行任务标签新增关闭按钮；关闭不删除历史，运行中的任务仍在后台继续。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.37` turns terminal diagnostics into direct optimization and adds close controls to concurrent Agent tasks.

### Highlights

- Terminal diagnostics now offer one-click optimization for every safe fix registered by the current scan.
- Shell files are backed up automatically, changed files are rejected, and zsh syntax is validated before replacement.
- Memento scans again after completion and reports the real number of fixes and results.
- Per-finding Optimize is the primary action while AI analysis remains optional.
- Concurrent Agent task tabs can be closed without deleting history; running tasks continue in the background.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

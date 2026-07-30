# Memento Agent 0.6.40

## 简体中文

`0.6.40` 修复 Gemini 3.1 Pro 连接探针和磁盘浏览删除后的列表刷新。

### 主要变化

- Gemini 3 系列连接探针使用模型支持的 `LOW` 推理级别，不再发送 Gemini 3.1 Pro 拒绝的 `MINIMAL`。
- 连接成功仍要求模型真实调用工具并处理工具结果，不会把普通文本响应误判为成功。
- 磁盘项目成功移到废纸篓后立即从当前分栏消失。
- 完整磁盘重扫在后台继续进行，用真实文件系统状态校准容量和层级。
- 中英文 README 与本地开发文档已同步当前 Gemini 代理和磁盘删除行为。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.40` fixes the Gemini 3.1 Pro connection probe and stale disk-browser rows after Trash succeeds.

### Highlights

- Gemini 3 connection probes use the supported `LOW` thinking level instead of the `MINIMAL` level rejected by Gemini 3.1 Pro.
- A successful connection still requires an actual tool call and tool-result continuation; a plain-text response does not pass.
- Disk items disappear from the current column immediately after a successful move to Trash.
- A full disk scan continues in the background to reconcile real capacity and hierarchy.
- English and Simplified Chinese project documentation now reflects the current Gemini proxy and disk-removal behavior.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

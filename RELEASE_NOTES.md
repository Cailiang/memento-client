# Memento Agent 0.6.39

## 简体中文

`0.6.39` 修复独立分析会话、Gemini 高推理模型连接测试和受保护磁盘项目删除，并重新设计计划执行动效。

### 主要变化

- 从电脑体检发起的分析会进入各自独立会话，并行任务不会混合消息和计划。
- 后台任务完成时不会抢走用户当前选择的会话。
- 计划执行改为“执行、复检、完成”三阶段状态管线，跟随真实进度并适配手机与减少动态效果设置。
- Gemini 高推理模型的工具调用探针不再被过小的输出限制提前截断。
- 磁盘浏览删除受保护诊断报告时，原生废纸篓失败后会安全降级，并仅在权限不足时请求管理员授权。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.39` fixes isolated Agent conversations, Gemini high-reasoning connection tests, protected disk-item removal, and redesigns confirmed-plan motion.

### Highlights

- Analyses launched from Computer Health now open independent conversations, so concurrent tasks do not mix messages or plans.
- Background completion no longer steals focus from the conversation selected by the user.
- Confirmed-plan execution now uses a real Run, Verify, Done status pipeline with mobile and reduced-motion support.
- Gemini high-reasoning models receive enough probe output budget to complete the required tool call.
- Protected diagnostic reports use a guarded Trash fallback, requesting administrator authorization only when filesystem permissions require it.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

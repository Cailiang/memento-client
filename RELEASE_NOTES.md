# Memento Agent 0.6.33

## 简体中文

`0.6.33` 修复分批执行与 Antigravity 鉴权，并让执行反馈和磁盘清理更真实、更实用。

### 主要变化

- 执行弹层会先显示再启动操作，从 8% 开始，并按真实复检进度推进；清理动画也重新设计。
- 同一 Agent 任务可分批执行多个操作，复检后仍有效的第二个操作不会再报“操作已经失效”，已完成操作不能重复运行。
- 任务记录新增即时搜索并移除导出入口。
- Antigravity 等 Google 兼容代理改用 Authorization Header，Google 官方接口使用 `x-goog-api-key`。
- 存储扫描新增 Claude、Codex、Antigravity、Grok 缓存、iOS 模拟器缓存、大型应用日志和用户目录大文件。
- AI 配置、密钥、对话和项目不参与清理；大文件只会移到废纸篓。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.33` fixes batched execution and Antigravity authentication while making execution feedback and disk cleanup more useful.

### Highlights

- The execution dialog paints before work begins, starts at 8%, follows real verification progress, and uses a redesigned cleanup animation.
- One Agent task can execute operations in multiple batches. A still-valid second operation no longer expires after verification, and completed operations cannot run twice.
- Task history now has live search and no export action.
- Google-compatible proxies such as Antigravity use Authorization headers, while the official Google API uses `x-goog-api-key`.
- Storage inspection now includes Claude, Codex, Antigravity, and Grok caches, iOS simulator caches, large application logs, and large files in user folders.
- AI configuration, credentials, conversations, and projects are excluded from cleanup; large files only move to Trash.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

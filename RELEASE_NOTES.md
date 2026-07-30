# Memento Agent 0.6.44

## 简体中文

`0.6.44` 启用完整的 GitHub Actions 多平台发布流程，并包含近期完成的 Antigravity 协议适配与磁盘浏览连续删除修复。

### 主要变化

- 推送与项目版本一致的标签后，自动校验源码并在 macOS、Windows 和 Linux 原生 runner 上构建。
- 构建环境使用最新补丁版 Node.js 22.x，并在开始测试前确认内置 SQLite 可用。
- 发布包含 Intel 与 Apple Silicon DMG、x64 与 arm64 Windows EXE、x64 与 arm64 Linux AppImage 和 DEB，以及统一的 `SHA256SUMS.txt`。
- `SHA256SUMS.txt` 只包含上述 8 个安装包并在发布前校验条目数量，不包含自身引用。
- 设置中新增 Antigravity 接口类型，复用 Vercel Google 适配器并明确兼容 Sub2API 的 Gemini 原生协议，无需额外 SDK。
- 磁盘浏览删除成功后立即更新本地树，不再触发全盘重扫；同轮扫描中的其他项目可以继续删除。
- 多个分析任务分别使用独立会话，确认执行计划后的状态动效也已改为紧凑的“执行、复检、完成”流程。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。当前安装包未签名、未公证，操作系统可能显示安全提示；macOS 可在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.44` introduces a complete GitHub Actions release pipeline for every packaged platform and includes the recent Antigravity protocol and consecutive disk-browser removal fixes.

### Highlights

- A matching version tag now validates the source and builds on native macOS, Windows, and Linux runners.
- Builds use the latest patched Node.js 22.x runtime and verify built-in SQLite support before tests begin.
- Each release contains Intel and Apple Silicon DMGs, x64 and arm64 Windows EXEs, x64 and arm64 Linux AppImage and DEB packages, plus a shared `SHA256SUMS.txt`.
- `SHA256SUMS.txt` covers exactly those eight packages, is count-checked before publication, and does not reference itself.
- Settings includes a dedicated Antigravity provider that reuses the Vercel Google adapter while explicitly supporting Sub2API's native Gemini protocol without another SDK.
- Successful disk-browser removal updates the local tree without a full-volume rescan, so other items from the same scan can be removed consecutively.
- Concurrent analyses use separate conversations, and confirmed plans now show a compact Run, Verify, Done execution sequence.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell. Packages are currently unsigned and unnotarized, so the operating system may show a security warning. On macOS, manual approval may be required under System Settings > Privacy & Security.

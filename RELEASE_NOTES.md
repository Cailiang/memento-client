# Memento Agent 0.6.47

## 简体中文

`0.6.47` 新增安全的 Home 隐藏应用残留扫描与废纸篓清理，并保留完整的 GitHub Actions 多平台发布流程。

### 主要变化

- 推送与项目版本一致的标签后，自动校验源码并在 macOS、Windows 和 Linux 原生 runner 上构建。
- 构建环境使用最新补丁版 Node.js 22.x，并在开始测试前确认内置 SQLite 可用。
- Actions 产物上传与下载步骤使用当前 Node.js 24 运行时版本，不再产生 Node.js 20 弃用注解。
- 发布包含 Intel 与 Apple Silicon DMG、x64 与 arm64 Windows EXE、x64 与 arm64 Linux AppImage 和 DEB，以及统一的 `SHA256SUMS.txt`。
- `SHA256SUMS.txt` 只包含上述 8 个安装包并在发布前校验条目数量，不包含自身引用。
- 设置中新增 Antigravity 接口类型，复用 Vercel Google 适配器并明确兼容 Sub2API 的 Gemini 原生协议，无需额外 SDK。
- Antigravity 的 `connection_probe` 现在声明为严格工具，首轮请求会实际使用 Gemini `VALIDATED`，不会因退化为 `AUTO` 而只返回普通文本。
- 存储建议现在扫描 Home 根目录隐藏项目及 `.config`、`.cache`、`.local/share` 一级子项目，只显示至少 30 天未修改且未与当前应用清单明确匹配的候选项。
- shell、凭据、包管理器和隐藏容器根目录受保护；候选项明确标记为需要确认，执行前重新校验，并且只移到废纸篓。
- 磁盘浏览删除成功后立即更新本地树，不再触发全盘重扫；同轮扫描中的其他项目可以继续删除。
- 多个分析任务分别使用独立会话，确认执行计划后的状态动效也已改为紧凑的“执行、复检、完成”流程。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。当前安装包未签名、未公证，操作系统可能显示安全提示；macOS 可在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.47` adds safe hidden Home application-leftover scanning and Trash cleanup while retaining the complete GitHub Actions release pipeline for every packaged platform.

### Highlights

- A matching version tag now validates the source and builds on native macOS, Windows, and Linux runners.
- Builds use the latest patched Node.js 22.x runtime and verify built-in SQLite support before tests begin.
- Artifact upload and download steps use their current Node.js 24 action runtimes without Node.js 20 deprecation annotations.
- Each release contains Intel and Apple Silicon DMGs, x64 and arm64 Windows EXEs, x64 and arm64 Linux AppImage and DEB packages, plus a shared `SHA256SUMS.txt`.
- `SHA256SUMS.txt` covers exactly those eight packages, is count-checked before publication, and does not reference itself.
- Settings includes a dedicated Antigravity provider that reuses the Vercel Google adapter while explicitly supporting Sub2API's native Gemini protocol without another SDK.
- Antigravity now declares `connection_probe` as strict, so the first request actually uses Gemini `VALIDATED` instead of falling back to a text-only `AUTO` response.
- Storage findings now inspect hidden items directly under Home and one level below `.config`, `.cache`, and `.local/share`, retaining only candidates unchanged for at least 30 days and not clearly matched to the current app inventory.
- Shell, credential, package-manager, and hidden container roots remain protected; every candidate requires review, is revalidated before execution, and only moves to Trash.
- Successful disk-browser removal updates the local tree without a full-volume rescan, so other items from the same scan can be removed consecutively.
- Concurrent analyses use separate conversations, and confirmed plans now show a compact Run, Verify, Done execution sequence.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell. Packages are currently unsigned and unnotarized, so the operating system may show a security warning. On macOS, manual approval may be required under System Settings > Privacy & Security.

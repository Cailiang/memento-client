# Memento Agent 0.6.49

## 简体中文

`0.6.49` 缩短存储直接清理反馈、修复 Agent 会话标签重复，并让具体配置分析直接说明软件归属；同时保留安全清理边界与完整 GitHub Actions 多平台发布流程。

### 主要变化

- 推送与项目版本一致的标签后，自动校验源码并在 macOS、Windows 和 Linux 原生 runner 上构建。
- 构建环境使用最新补丁版 Node.js 22.x，并在开始测试前确认内置 SQLite 可用。
- Actions 产物上传与下载步骤使用当前 Node.js 24 运行时版本，不再产生 Node.js 20 弃用注解。
- 发布包含 Intel 与 Apple Silicon DMG、x64 与 arm64 Windows EXE、x64 与 arm64 Linux AppImage 和 DEB，以及统一的 `SHA256SUMS.txt`。
- `SHA256SUMS.txt` 只包含上述 8 个安装包并在发布前校验条目数量，不包含自身引用。
- 设置中新增 Antigravity 接口类型，复用 Vercel Google 适配器并明确兼容 Sub2API 的 Gemini 原生协议，无需额外 SDK。
- Antigravity 的 `connection_probe` 现在声明为严格工具，首轮请求会实际使用 Gemini `VALIDATED`，不会因退化为 `AUTO` 而只返回普通文本。
- 存储建议现在扫描 Home 根目录隐藏项目及 `.config`、`.cache`、`.local/share` 一级子项目，只显示至少 30 天未修改且未与当前应用清单明确匹配的候选项。
- 隐藏残留匹配现在同时索引 `PATH`、Homebrew 和常见用户 bin 目录中的命令；例如 `ipatool` 命令存在时，`~/.ipatool` 不再进入清理建议。
- 已知隐藏配置会提供确定性产品归属；`.lingma` 明确标记为阿里云「通义灵码」智能编码助手的配置目录，并提醒它仍可能由 IDE 插件或命令行工具使用。
- shell、凭据、包管理器和隐藏容器根目录受保护；候选项明确标记为需要确认，执行前重新校验，并且只移到废纸篓。
- 存储建议中的直接清理在真实操作成功后用约 3 秒完成反馈并更新当前列表，不再等待完整电脑体检；服务、终端和 Agent 确认计划仍会重新体检。
- 磁盘浏览删除成功后立即更新本地树，不再触发全盘重扫；同轮扫描中的其他项目可以继续删除。
- Agent 任务标签现在按会话而不是每轮消息管理；同一会话中的追问不会再新建标签，明确新任务与隔离分析继续使用独立会话。
- Agent 分析具体存储项或后台服务时，会先直接说明产品、厂商和用途；证据不足时明确说明未知，不会猜测。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。当前安装包未签名、未公证，操作系统可能显示安全提示；macOS 可在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.49` shortens direct Storage cleanup feedback, fixes duplicate Agent conversation tabs, and makes specific configuration analysis identify its owning software up front while retaining safe cleanup boundaries and the complete GitHub Actions release pipeline.

### Highlights

- A matching version tag now validates the source and builds on native macOS, Windows, and Linux runners.
- Builds use the latest patched Node.js 22.x runtime and verify built-in SQLite support before tests begin.
- Artifact upload and download steps use their current Node.js 24 action runtimes without Node.js 20 deprecation annotations.
- Each release contains Intel and Apple Silicon DMGs, x64 and arm64 Windows EXEs, x64 and arm64 Linux AppImage and DEB packages, plus a shared `SHA256SUMS.txt`.
- `SHA256SUMS.txt` covers exactly those eight packages, is count-checked before publication, and does not reference itself.
- Settings includes a dedicated Antigravity provider that reuses the Vercel Google adapter while explicitly supporting Sub2API's native Gemini protocol without another SDK.
- Antigravity now declares `connection_probe` as strict, so the first request actually uses Gemini `VALIDATED` instead of falling back to a text-only `AUTO` response.
- Storage findings now inspect hidden items directly under Home and one level below `.config`, `.cache`, and `.local/share`, retaining only candidates unchanged for at least 30 days and not clearly matched to the current app inventory.
- Hidden leftover matching now also indexes commands in `PATH`, Homebrew, and common user bin directories; when `ipatool` exists, for example, `~/.ipatool` is no longer offered for cleanup.
- Known hidden configurations include deterministic ownership metadata. `.lingma` is identified as an Alibaba Cloud Tongyi Lingma AI coding-assistant configuration directory that an IDE extension or command-line tool may still use.
- Shell, credential, package-manager, and hidden container roots remain protected; every candidate requires review, is revalidated before execution, and only moves to Trash.
- Direct cleanup from Storage completes its feedback and updates the current list in about three seconds after the real operation succeeds, without waiting for a full computer scan. Service, terminal, and confirmed Agent-plan actions retain full rescans.
- Successful disk-browser removal updates the local tree without a full-volume rescan, so other items from the same scan can be removed consecutively.
- Agent task tabs are keyed by conversation rather than message turn, so follow-up questions stay in one tab while explicit new tasks and isolated analyses remain separate.
- Specific storage-item and background-service analyses lead with the product, vendor, and purpose; insufficient evidence is reported as unknown instead of guessed.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell. Packages are currently unsigned and unnotarized, so the operating system may show a security warning. On macOS, manual approval may be required under System Settings > Privacy & Security.

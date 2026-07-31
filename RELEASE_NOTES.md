# Memento Agent 0.6.50

## 简体中文

`0.6.50` 用动态本机证据替代隐藏配置厂商内置表，拆分后台服务 CPU/内存异常，明确电脑体检的下一步操作，并把自动存储建议严格限制在目录级。

### 主要变化

- 推送与项目版本一致的标签后，自动校验源码并在 macOS、Windows 和 Linux 原生 runner 上构建。
- 构建环境使用最新补丁版 Node.js 22.x，并在开始测试前确认内置 SQLite 可用。
- Actions 产物上传与下载步骤使用当前 Node.js 24 运行时版本，不再产生 Node.js 20 弃用注解。
- 发布包含 Intel 与 Apple Silicon DMG、x64 与 arm64 Windows EXE、x64 与 arm64 Linux AppImage 和 DEB，以及统一的 `SHA256SUMS.txt`。
- `SHA256SUMS.txt` 只包含上述 8 个安装包并在发布前校验条目数量，不包含自身引用。
- 设置中新增 Antigravity 接口类型，复用 Vercel Google 适配器并明确兼容 Sub2API 的 Gemini 原生协议，无需额外 SDK。
- Antigravity 的 `connection_probe` 现在声明为严格工具，首轮请求会实际使用 Gemini `VALIDATED`，不会因退化为 `AUTO` 而只返回普通文本。
- 存储建议现在扫描 Home 根目录隐藏目录及 `.config`、`.cache`、`.local/share` 一级子目录，只显示至少 30 天未修改且未与当前应用或命令明确匹配的候选项。
- 隐藏残留匹配现在同时索引 `PATH`、Homebrew 和常见用户 bin 目录中的命令；例如 `ipatool` 命令存在时，`~/.ipatool` 不再进入清理建议。
- Agent 分析隐藏配置时不再查厂商内置表，而是按精确身份 token 关联其他存储项、后台服务、已安装应用、受限目录文件名、软件包收据、浅层目录结构和已脱敏的 shell 引用。
- 证据明确区分“本机确认”“明确签名”和“未确认”；模型可用通用知识解释产品名，但关于本机状态的结论必须有现场证据。
- shell、凭据、包管理器和隐藏容器根目录受保护；候选项明确标记为需要确认，执行前重新校验，并且只移到废纸篓。
- 后台服务增加独立的 CPU 占用异常和内存占用异常分类；电脑体检评分提供“查看待确认内容”入口并直接打开最高优先级分类。
- 自动存储清理建议只显示目录；下载、桌面、影片中的个人文件和 Docker 虚拟磁盘等单文件只保留在磁盘浏览中。
- 存储建议中的直接清理在真实操作成功后用约 3 秒完成反馈并更新当前列表，不再等待完整电脑体检；服务、终端和 Agent 确认计划仍会重新体检。
- 磁盘浏览删除成功后立即更新本地树，不再触发全盘重扫；同轮扫描中的其他项目可以继续删除。
- Agent 任务标签现在按会话而不是每轮消息管理；同一会话中的追问不会再新建标签，明确新任务与隔离分析继续使用独立会话。
- Agent 分析具体存储项或后台服务时，会先直接说明产品、厂商和用途；证据不足时明确说明未知，不会猜测。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。当前安装包未签名、未公证，操作系统可能显示安全提示；macOS 可在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.50` replaces the hidden-product lookup table with dynamic local evidence, separates high-CPU and high-memory service findings, makes the health summary actionable, and restricts automatic Storage findings to directories.

### Highlights

- A matching version tag now validates the source and builds on native macOS, Windows, and Linux runners.
- Builds use the latest patched Node.js 22.x runtime and verify built-in SQLite support before tests begin.
- Artifact upload and download steps use their current Node.js 24 action runtimes without Node.js 20 deprecation annotations.
- Each release contains Intel and Apple Silicon DMGs, x64 and arm64 Windows EXEs, x64 and arm64 Linux AppImage and DEB packages, plus a shared `SHA256SUMS.txt`.
- `SHA256SUMS.txt` covers exactly those eight packages, is count-checked before publication, and does not reference itself.
- Settings includes a dedicated Antigravity provider that reuses the Vercel Google adapter while explicitly supporting Sub2API's native Gemini protocol without another SDK.
- Antigravity now declares `connection_probe` as strict, so the first request actually uses Gemini `VALIDATED` instead of falling back to a text-only `AUTO` response.
- Storage findings now inspect hidden directories directly under Home and one directory level below `.config`, `.cache`, and `.local/share`, retaining only candidates unchanged for at least 30 days and not clearly matched to current apps or commands.
- Hidden leftover matching now also indexes commands in `PATH`, Homebrew, and common user bin directories; when `ipatool` exists, for example, `~/.ipatool` is no longer offered for cleanup.
- Focused Agent analysis no longer uses a built-in vendor table. Exact identity tokens correlate storage, services, applications, allowlisted filesystem names, package receipts, shallow directory entries, and redacted shell references.
- Evidence is explicitly separated into locally confirmed, strong-signature, and unconfirmed levels. General model knowledge may explain a product name, but local-state claims require observed evidence.
- Shell, credential, package-manager, and hidden container roots remain protected; every candidate requires review, is revalidated before execution, and only moves to Trash.
- Background services expose independent high-CPU and high-memory categories. The health score now offers a Review findings action that opens the highest-priority category.
- Automatic Storage findings contain directories only. Personal files under Downloads, Desktop, and Movies and individual files such as Docker virtual disks remain in Disk browser only.
- Direct cleanup from Storage completes its feedback and updates the current list in about three seconds after the real operation succeeds, without waiting for a full computer scan. Service, terminal, and confirmed Agent-plan actions retain full rescans.
- Successful disk-browser removal updates the local tree without a full-volume rescan, so other items from the same scan can be removed consecutively.
- Agent task tabs are keyed by conversation rather than message turn, so follow-up questions stay in one tab while explicit new tasks and isolated analyses remain separate.
- Specific storage-item and background-service analyses lead with the product, vendor, and purpose; insufficient evidence is reported as unknown instead of guessed.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell. Packages are currently unsigned and unnotarized, so the operating system may show a security warning. On macOS, manual approval may be required under System Settings > Privacy & Security.

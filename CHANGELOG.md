# Changelog / 更新记录

All notable changes to Memento Client are documented here in English and Simplified Chinese.

Memento Client 的重要变更会在这里使用英文和简体中文同步记录。

Version 0.6.21 begins the rebuilt Memento Agent product line. Older entries are retained as historical records of the previous implementation.

0.6.21 版本开始记录从头重建的 Memento Agent 产品线；更早条目仅作为旧实现的历史记录保留。

## 0.6.44 - 2026-07-30

### English

- Restricted `SHA256SUMS.txt` generation to the eight platform packages so the checksum manifest no longer includes an invalid self-reference.
- Added an explicit eight-line checksum-manifest assertion before publishing a GitHub Release.
- Upgraded the release artifact download action to its Node.js 24-based major version, removing the GitHub Actions Node.js 20 deprecation warning.
- Updated release metadata and operator documentation for the corrected publication pipeline.

### 简体中文

- 将 `SHA256SUMS.txt` 的生成范围限制为 8 个平台安装包，校验清单不再包含无效的自身引用。
- 发布 GitHub Release 前新增校验清单必须恰好为 8 行的断言。
- 将发布产物下载 action 升级到基于 Node.js 24 的主版本，消除 GitHub Actions 的 Node.js 20 弃用警告。
- 同步更新修正后发布流程的版本元数据与操作文档。

## 0.6.43 - 2026-07-30

### English

- Raised the minimum development runtime to Node.js 22.13, where built-in SQLite no longer requires the experimental flag.
- Changed release runners to the latest patched Node.js 22.x runtime and added an explicit SQLite availability check before tests and platform builds.
- Preserved the failed `v0.6.42` tag instead of rewriting release history; `v0.6.43` is the corrected automated multi-platform release.
- Updated the setup, development, release, changelog, and bilingual release documentation for the corrected runtime requirement.

### 简体中文

- 将最低开发运行时提高到 Node.js 22.13，该版本的内置 SQLite 不再需要实验开关。
- 发布 runner 改用最新补丁版 Node.js 22.x，并在测试和各平台构建前显式检查 SQLite 可用性。
- 保留失败的 `v0.6.42` 标签而不改写发布历史；`v0.6.43` 是修正后的自动化多平台版本。
- 同步更新环境配置、开发说明、发布流程、变更日志和双语发布说明中的运行时要求。

## 0.6.42 - 2026-07-30

### English

- Added a tag-driven GitHub Actions release pipeline that validates package metadata, runs tests and type checking, and builds native packages on macOS, Windows, and Linux runners.
- Added Intel and Apple Silicon DMGs, x64 and arm64 NSIS installers, and x64 and arm64 AppImage and DEB packages to each public release, together with `SHA256SUMS.txt`.
- Kept manual workflow runs available for non-publishing validation, with all platform artifacts retained temporarily for inspection.
- Documented the complete release contract, version and tag requirements, supported package matrix, unsigned-package status, and the current macOS scope of full scanning and cleanup.
- Updated the English and Simplified Chinese project descriptions, packaging guidance, development notes, and repository contributor instructions for automated releases.

### 简体中文

- 新增由版本标签触发的 GitHub Actions 发布流程：校验包元数据、运行测试与类型检查，并在 macOS、Windows 和 Linux 原生 runner 上构建安装包。
- 每次公开发布提供 Intel 与 Apple Silicon DMG、x64 与 arm64 NSIS 安装包、x64 与 arm64 AppImage 和 DEB，并附带 `SHA256SUMS.txt`。
- 保留手动运行 workflow 的非发布验证能力，所有平台产物会作为临时 Actions Artifacts 供检查。
- 完整记录发布约束、版本与标签要求、支持的安装包矩阵、未签名状态，以及完整扫描和清理目前仍以 macOS 为目标的范围说明。
- 更新中英文项目介绍、打包指南、开发文档和仓库贡献规则，使其与自动发布流程一致。

## 0.6.41 - 2026-07-30

### English

- Added a dedicated Antigravity provider type for Sub2API's Gemini-native `/antigravity/v1beta` protocol, model discovery, and `x-goog-api-key` authentication without adding another SDK.
- Made Antigravity connection probes use the gateway-compatible `VALIDATED` tool mode while still requiring a real tool callback and tool-result continuation; Gemini 3 probes retain `LOW` thinking.
- Migrated existing Google provider rows whose URL contains `/antigravity`, and classified matching CC Switch imports as Antigravity automatically.
- Stopped rescanning the full disk after every successful Trash operation. The removed subtree now disappears immediately, visible ancestor sizes update locally, and unrelated IDs from the same scan remain valid for consecutive removals.
- Added provider migration, protocol, capability-registry, immutable-tree, and two-removal UI smoke coverage; updated all current project and release documentation.

### 简体中文

- 新增 Antigravity 独立接口类型，明确适配 Sub2API 的 Gemini 原生 `/antigravity/v1beta` 路由、模型发现和 `x-goog-api-key` 认证，无需引入另一套 SDK。
- Antigravity 连接探针改用网关兼容的 `VALIDATED` 工具模式，同时仍要求真实执行工具回调和工具结果续传；Gemini 3 继续使用 `LOW` 推理级别。
- 自动迁移服务地址包含 `/antigravity` 的已有 Google 配置，CC Switch 中匹配的配置也会自动归类为 Antigravity。
- 停止在每次成功移到废纸篓后重扫整块磁盘；被删子树立即消失、可见祖先容量本地更新，同轮扫描的其他 ID 继续有效，可连续删除。
- 新增供应商迁移、协议、能力注册表、不可变树和连续两次删除 UI 冒烟覆盖，并同步更新当前项目与发布文档。

## 0.6.40 - 2026-07-30

### English

- Fixed Gemini 3.1 Pro connection tests by using its supported `LOW` thinking level instead of `MINIMAL`; the probe still requires a real tool call and tool-result continuation.
- Removed a successfully trashed disk-browser item from the current column immediately, then kept the full disk rescan in the background to reconcile capacity and hierarchy without leaving stale UI behind.
- Added focused immutable-tree tests and UI smoke coverage that confirms a trashed disk node actually detaches from the rendered browser.
- Updated the English and Simplified Chinese project READMEs, local Agent development guide, release notes, package metadata, and Gemini proxy authentication documentation.

### 简体中文

- 修复 Gemini 3.1 Pro 连接测试：使用模型支持的 `LOW` 推理级别替代 `MINIMAL`，同时继续要求真实完成工具调用和工具结果续传。
- 磁盘浏览项目成功移到废纸篓后立即从当前分栏移除，完整磁盘重扫改在后台校准容量和层级，不再让旧项目残留在界面中。
- 新增不可变磁盘树单测与 UI 冒烟覆盖，确认删除后的节点确实从渲染列表脱离。
- 更新中英文项目 README、本地 Agent 开发说明、发布说明、包元数据和 Gemini 代理认证文档。

## 0.6.39 - 2026-07-30

### English

- Isolated every analysis launched from Computer Health into its own Agent conversation, matching Application analysis. Concurrent tasks no longer mix unrelated prompts, results, plans, or follow-up context.
- Prevented a completing background task from taking focus back after the user has selected another conversation, and extended UI coverage to verify both isolation and reopening.
- Replaced the confirmed-plan Trash animation with a compact Run, Verify, Done status pipeline. The new motion follows real execution state, uses stable dimensions, supports reduced motion, and remains free of horizontal overflow on mobile.
- Fixed Gemini high-reasoning connection tests by using minimal reasoning for the capability probe and allowing enough output tokens for the required function call to complete.
- Added a guarded disk-browser Trash fallback for macOS-protected report types. After the native Trash API fails, Memento tries a verified move into the current user's Trash and requests administrator authorization only for filesystem permission failures.
- Kept the disk fallback behind the existing scan capability registry, realpath and symbolic-link checks, protected-root rules, collision-safe Trash naming, and post-move verification.

### 简体中文

- 从电脑体检发起的每个分析现在都会创建独立 Agent 会话，与应用分析保持一致；并行任务不再混合无关的提示、结果、计划或追问上下文。
- 修复后台任务完成时抢回当前会话的问题；用户切换会话后保持原选择，并新增会话隔离与重新打开的 UI 回归覆盖。
- 将确认计划后的垃圾桶动画替换为紧凑的“执行、复检、完成”状态管线；新动效跟随真实执行阶段，尺寸稳定，支持减少动态效果，并在手机宽度下无横向溢出。
- 修复 Gemini 高推理模型的连接测试：能力探针使用最低推理级别，并提供足够的输出 token 让必须执行的函数调用完成。
- 为 macOS 受保护的诊断报告等项目增加磁盘浏览废纸篓降级；原生废纸篓 API 失败后，先尝试移动到当前用户废纸篓，仅在文件系统权限不足时请求管理员授权。
- 磁盘删除降级继续受本轮扫描能力注册表、realpath 与符号链接校验、受保护根目录规则、废纸篓重名处理和移动后验证约束。

## 0.6.38 - 2026-07-30

### English

- Fixed disk-browser removal while fullscreen: the Trash confirmation dialog now renders above the fullscreen browser instead of being hidden behind it.
- Extended the UI smoke test to open the disk browser fullscreen, invoke Move to Trash from the context menu, and interact with the confirmation dialog.
- Aligned custom Google Gemini provider URLs with Gemini CLI semantics by appending `/v1beta` when the address does not already include an API version.
- Google model discovery and Agent requests now use the native `x-goog-api-key` authentication behavior for official and proxied Gemini endpoints.
- Added regression coverage for custom Gemini proxy routing, authentication, explicit API versions, and diagnostic endpoint reporting.

### 简体中文

- 修复全屏磁盘浏览中的删除操作：移到废纸篓确认框现在显示在全屏浏览器之上，不会再被遮挡。
- UI 冒烟测试现在会进入磁盘浏览全屏模式，通过右键菜单触发移到废纸篓，并实际操作确认框。
- Google Gemini 自定义供应商地址与 Gemini CLI 语义对齐：地址未包含 API 版本时自动补充 `/v1beta`。
- Google 模型发现和 Agent 请求对官方及代理 Gemini 接口统一使用原生 `x-goog-api-key` 认证方式。
- 新增自定义 Gemini 代理路由、认证、显式 API 版本和诊断请求地址的回归覆盖。

## 0.6.37 - 2026-07-30

### English

- Added one-click terminal optimization that batches every registered safe fix from the current scan, backs up affected shell files, validates zsh syntax, and automatically scans again to verify the result.
- Promoted per-finding Optimize actions ahead of optional AI analysis so terminal findings with deterministic fixes can be resolved directly.
- Reused the existing confirmation and execution progress workflow for terminal batches, including accurate item counts, grouped per-file writes, stale-content rejection, and backup-based recovery support.
- Added independent close controls to concurrent Agent task tabs. Closing removes a task only from the current workspace, preserves history, lets running work continue in the background, and selects a neighboring task when the active tab closes.
- Added UI smoke coverage for terminal batch confirmation and task-tab closure without history deletion.

### 简体中文

- 终端诊断新增一键优化：合并执行本轮扫描注册的全部安全修复，自动备份受影响的 shell 配置、校验 zsh 语法，并在完成后重新体检验证。
- 单项问题把“直接优化”提升到 AI 分析之前，具备确定性修复的问题可以直接解决。
- 终端批量操作复用现有确认和执行进度流程，准确显示项目数量，按配置文件合并写入，拒绝已变化的内容，并保留基于备份的恢复能力。
- 并行 Agent 任务标签新增独立关闭按钮。关闭只移出当前工作区，不删除历史；运行中任务继续在后台执行，关闭当前标签时自动选择相邻任务。
- UI 冒烟新增终端批量确认和任务标签关闭且不删除历史的覆盖。

## 0.6.36 - 2026-07-30

### English

- Cleanup findings now show their registered file or folder path directly in each row. Clicking the path opens the exact folder or reveals the file in Finder without accepting arbitrary Renderer paths.
- Replaced vertically stacked background-service groups with a compact horizontal category switcher for all, orphaned, failed, resource-heavy, long-running, stale, and other startup items.
- Added a disk-browser context menu with Finder reveal and Move to Trash actions. Removal always requires a second confirmation and refreshes the disk scan after completion.
- Kept disk removal inside the current scan's ID-to-path capability registry, rejected symbolic links and paths outside the scanned volume, and blocked the volume root, top-level volume folders, and the user home directory itself.
- Added UI smoke coverage for clickable cleanup paths, service category switching, disk context menus, and removal-scope confirmation, plus focused disk-trash path validation tests.

### 简体中文

- 清理建议现在直接展示已注册的文件或目录路径；点击路径会打开准确目录或在 Finder 中定位文件，Renderer 不能传入任意路径。
- 后台服务从纵向分组改为紧凑的水平分类切换，包含全部、残留、启动失败、资源异常、长期运行、长期未使用和其他启动项。
- 磁盘浏览新增右键菜单，可在 Finder 中显示或移到废纸篓；移除前必须二次确认，完成后自动刷新磁盘扫描。
- 磁盘移除严格使用本轮扫描的 ID 到路径能力注册表，拒绝符号链接和扫描卷外路径，并禁止移除卷根目录、卷顶层目录和用户主目录本身。
- UI 冒烟新增清理路径点击、服务分类切换、磁盘右键菜单与移除范围确认覆盖，同时补充磁盘废纸篓路径安全测试。

## 0.6.35 - 2026-07-30

### English

- Grouped multiple large files in the same user folder into one cleanup finding. Ignoring the finding now covers the folder once, while cleanup remains explicitly file-by-file and never removes the whole folder.
- Added background-service anomaly categories for orphaned startup items, startup failures, high CPU or memory usage, services running continuously for at least 30 days, and stopped configurations unchanged for at least 180 days.
- Added read-only PID, CPU, memory, and elapsed-runtime sampling to service evidence and Agent context without expanding automatic cleanup permissions.
- Included failed Homebrew services as analysis findings while retaining direct stop actions only for running services.
- Added a fullscreen disk browser with a dedicated toggle, complete viewport coverage, and Escape-key exit.
- Added parser and anomaly-threshold tests, and verified the production build, real-device scan, Electron startup, responsive UI, and Intel x64 installer.

### 简体中文

- 同一用户目录中的多个大文件现在合并为一条清理建议；忽略一次即可覆盖该目录，但清理仍需逐个选择文件，绝不会直接移除整个目录。
- 后台服务新增异常分类：残留启动项、启动失败、CPU 或内存占用异常、连续运行至少 30 天，以及停止且配置至少 180 天未变化的项目。
- 服务证据和 Agent 上下文新增只读 PID、CPU、内存和连续运行时长采样，不扩大自动清理权限。
- Homebrew 启动失败的服务现在会作为分析项展示；只有正在运行的服务才提供直接停止操作。
- 磁盘浏览新增全屏切换，完整覆盖视口并支持 Esc 退出。
- 补充解析和异常阈值测试，并验证生产构建、真实设备扫描、Electron 启动、响应式界面和 Intel x64 安装包。

## 0.6.34 - 2026-07-30

### English

- Added a persistent Agent task switcher. Starting another analysis no longer hides the first task: concurrent and recently completed tasks retain their own status and can be reopened without merging isolated contexts.
- Split Storage into **Cleanup findings** and **Disk browser**. The existing count now explicitly represents safety-filtered actionable findings rather than every item on disk.
- Added a cancellable asynchronous main-data-volume scan powered by macOS `du`. It streams elapsed time, current location, scanned-entry count, and inaccessible-location count without showing a fabricated percentage.
- Added an OmniDiskSweeper-inspired column browser that sorts folders and large files by size, drills through the hierarchy, shows the selected item’s share of scanned space, and can reveal only registered scan results in Finder.
- Retains items of at least 5 MB, caps exceptionally wide folders at 200 visible children with an aggregate remainder, and never exposes arbitrary disk-browser paths as cleanup actions.
- Added parser, real-directory scan, hierarchy, sorting, truncation, concurrent-task, responsive disk-browser, and overflow coverage.

### 简体中文

- Agent 新增持续可见的任务切换条。开始第二项分析后，第一项不会再从界面消失；并行任务和最近完成的任务保留独立状态，也可以随时切回，不会混合隔离任务的上下文。
- 存储空间拆分为“清理建议”和“磁盘浏览”。原有数量现在明确表示经过安全规则筛选、可以处理的建议，而不是磁盘中的全部内容。
- 新增基于 macOS `du` 的主数据卷异步扫描，可取消，并实时显示耗时、当前位置、已检查项目数和无权限位置数，不使用虚假的百分比。
- 新增参考 OmniDiskSweeper 的分栏容量浏览器：按大小排列目录和大文件，逐层展开，显示选中项占扫描容量的比例，并且只能在 Finder 中定位本轮扫描注册的项目。
- 只保留不小于 5 MB 的管理目标；异常宽的目录最多展示 200 个直接子项，其余容量合并显示；磁盘浏览中的任意路径不会直接成为清理操作。
- 补充解析、真实目录扫描、层级、排序、截断、并行任务、响应式磁盘浏览和横向溢出测试。

## 0.6.33 - 2026-07-30

### English

- Rebuilt the confirmed-action progress dialog so it paints before IPC execution starts, begins at 8%, follows actual verification scan progress, and uses a quieter cleanup animation with reduced-motion support instead of jumping to a fixed 78%.
- Reconciled unchanged registered action and terminal-fix capabilities across verification scans. A task can now execute selected steps in multiple batches, retains prior results, and prevents already completed steps from running twice.
- Added live task-history search across prompts, providers, models, statuses, responses, and errors; removed the low-value history export action.
- Fixed Google-compatible proxies such as Antigravity by sending API credentials in an Authorization header for both model discovery and model execution. The official Google endpoint uses `x-goog-api-key`; credentials are no longer placed in the model-list URL.
- Expanded storage inspection with grouped rebuildable caches for Claude, Codex, Antigravity, and Grok, plus iOS simulator caches, large application logs, and large files under Downloads, Desktop, and Movies.
- Kept AI settings, credentials, conversations, sessions, workspaces, and projects outside cleanup allowlists. Rebuildable caches and logs require explicit permanent-cleanup confirmation; large user files can only be moved to Trash after their size, timestamp, real path, and parent folder are revalidated.
- Updated the interactive prototype, focused safety tests, visual smoke coverage, product documentation, and release documentation for version 0.6.33.

### 简体中文

- 重做确认执行进度弹层：先完成首帧绘制再调用 IPC，初始进度为 8%，复检阶段跟随真实扫描进度，并使用更克制的清理动效与减少动态效果支持，不再直接跳到固定 78%。
- 复检后会对内容未变化的操作与终端修复能力进行安全对账。同一任务现在可以分批执行选中步骤，保留之前的真实结果，并阻止已完成步骤被重复执行。
- 任务记录新增按任务、供应商、模型、状态、回答和错误即时搜索；删除价值较低的任务记录导出功能。
- 修复 Antigravity 等 Google 兼容代理：模型发现和模型调用都使用 Authorization Header；Google 官方地址使用 `x-goog-api-key`，模型列表 URL 不再携带密钥。
- 存储检查新增 Claude、Codex、Antigravity、Grok 可重建缓存分组，同时增加 iOS 模拟器缓存、大体积应用日志，以及下载、桌面和影片目录中的大文件。
- AI 设置、密钥、对话、会话、工作区和项目始终不进入清理白名单。可重建缓存和日志需要明确确认后永久清理；大文件只允许在重新校验大小、时间、真实路径和所属目录后移到废纸篓。
- 同步更新 0.6.33 交互原型、安全测试、视觉冒烟覆盖、产品文档和发布记录。

## 0.6.32 - 2026-07-30

### English

- Upgraded the supported build chain from Vite 5 to Vite 7.3.6, electron-vite 2 to 5.0.0, electron-builder 25 to 26.15.3, React's Vite plugin 4 to 5.2.0, and Vitest 2 to 3.2.7.
- Raised the development requirement to Node.js 22.12 or newer to satisfy the current packaging toolchain and recorded the same constraint in package metadata.
- Added repeatable full and runtime-only npm audit commands. The shipped dependency audit is clean; the full development audit dropped from 33 findings, including 2 critical, to 16 high-severity findings inherited from electron-builder's latest stable packaging dependencies.
- Verified that unit tests, type checking, production main/preload/Renderer builds, device scanning, real Electron startup, and the four-viewport UI suite remain compatible with the upgraded toolchain.
- Updated the interactive HTML prototype, product documentation, development notes, and release documentation for version 0.6.32.

### 简体中文

- 构建工具链从 Vite 5 升级至 Vite 7.3.6、electron-vite 2 升级至 5.0.0、electron-builder 25 升级至 26.15.3、React Vite 插件 4 升级至 5.2.0、Vitest 2 升级至 3.2.7。
- 本地开发环境提高到 Node.js 22.12 或更高版本，以满足当前打包工具链要求，并在包元数据中记录同一约束。
- 新增可重复执行的完整审计与仅运行时依赖审计命令。随应用发布的运行时依赖审计为 0；完整开发依赖审计从 33 项（含 2 项严重问题）降至 16 项高危问题，剩余项均继承自 electron-builder 最新稳定版的打包依赖。
- 已验证单元测试、类型检查、主进程/preload/Renderer 生产构建、设备扫描、真实 Electron 启动和四视口 UI 测试均兼容升级后的工具链。
- 同步更新 0.6.32 交互 HTML 原型、产品文档、开发说明和发布记录。

## 0.6.31 - 2026-07-30

### English

- Removed the clock, duplicate version badge, Quick Scan, and Settings actions from the upper-right toolbar; the exact build version now replaces “Local Agent” below the Memento name.
- Added a GitHub Releases update check shortly after launch and every hour, with trusted-link validation, semantic version comparison, a native notification, a compact in-app notice, and a manual Settings check.
- Changed CC Switch discovery to a one-time automatic import recorded in SQLite, so user-deleted providers remain deleted across launches; Settings now offers an explicit re-import action with detected and imported counts.
- Moved provider connection state back to a short status label and added wrapping, selectable error alerts that retain the failed endpoint and bounded server response without exposing credential query parameters.
- Updated the interactive HTML prototype, unit coverage, browser smoke checks, Electron smoke selectors, product documentation, and release documentation for the new behavior.

### 简体中文

- 移除顶部右侧的时钟、重复版本标签、快捷体检和设置操作；准确版本号改为显示在 Memento 名称下，替换无意义的“Local Agent”。
- 新增启动后及每小时一次的 GitHub Releases 更新检查，包含可信链接校验、语义版本比较、系统通知、紧凑应用内提醒和设置中的手动检查。
- CC Switch 改为使用 SQLite 标记的一次性自动导入，用户删除的供应商不会在下次启动时恢复；设置中新增明确的手动重新导入，并反馈检测与导入数量。
- 供应商连接状态恢复为短标签，完整错误改用可换行、可选中的告警区展示，同时保留失败地址和有限长度的服务端响应，并去除凭据查询参数。
- 同步更新交互 HTML 原型、单元测试、浏览器冒烟检查、Electron 版本选择器、产品文档和发布文档。

## 0.6.30 - 2026-07-30

### English

- Added search to the shared ignored-items manager across applications, services, and storage, including name, Bundle ID, and path matching.
- Preserved read-only metadata and icon access for ignored applications so their real localized name and app logo remain visible after a scan or restart, while their uninstall and reveal capabilities stay revoked.
- Removed the duplicate Agent plan dialog: Confirm and run is now the single confirmation and immediately opens a cleanup-themed progress surface driven by actual executing, verifying, completed, and failed states.
- Added source-aware Agent navigation that remembers Application Management or the exact Computer Health tab, item, and scroll position, then restores and highlights that working position on return.
- Added registered direct actions to storage, service, and terminal findings so experienced users can clean, stop, remove, or optimize without first requesting AI analysis; each system-changing action still has one explicit confirmation and post-action verification.
- Added regression coverage for ignored-app metadata, search and logos, single-confirmation execution, direct actions, and source restoration.

### 简体中文

- 统一忽略列表新增搜索，支持应用、后台服务和存储项目，并可按名称、Bundle ID 与路径匹配。
- 扫描和重启后仍保留已忽略应用的只读元数据与图标入口，可展示真实中文名和应用 Logo；卸载与定位能力仍会被白名单撤销。
- 移除 Agent 计划的重复确认弹窗：“确认并执行”就是唯一确认，点击后立即进入由真实执行、复检、完成和失败状态驱动的清理进度界面。
- Agent 新增来源返回能力，记住应用管理或电脑体检的精确标签、项目与滚动位置，返回后恢复并短暂高亮刚才的工作位置。
- 存储、后台服务和终端建议新增已注册的直接操作，熟练用户无需先做 AI 分析即可清理、停止、移除或优化；所有系统修改仍保留一次明确确认和操作后复检。
- 新增已忽略应用元数据、搜索与 Logo、单次确认执行、直接操作和来源恢复的回归覆盖。

## 0.6.29 - 2026-07-30

### English

- Added a visible ignored-applications entry to Application Management that opens the shared ignored-items dialog directly on its Applications tab.
- Renamed Computer Health's ambiguous Handle and Ask Agent row actions to AI analysis, with a Sparkles icon and prompts that explicitly prevent execution or automatic plan selection.
- Replaced the mixed Safe to handle and Needs review labels with the number of available operations plus a clear “choose after AI analysis” explanation; analysis-only findings explicitly state that no system changes occur.
- Changed health-item prompts to compare every registered operation instead of silently choosing the first operation for the confirmation plan.
- Added safe Markdown rendering for Agent prose, including semantic bullet and numbered lists, bold text, line breaks, code, blockquotes, and tables while keeping raw HTML disabled.
- Added Markdown security/semantics coverage and browser checks for direct ignored-app access and unambiguous health actions.

### 简体中文

- 应用管理顶部新增清晰可见的“已忽略 N 项”入口，点击后直接打开忽略列表的“应用”标签。
- 电脑体检中含义模糊的“处理”和“问 Agent”统一改为带图标的“AI 分析”，提示词明确禁止直接执行或自动选择计划操作。
- 移除混在分析入口旁的“可安全处理 / 需要确认”，改为显示可选操作数量和“AI 分析后再选择”；只读发现会明确显示“不会修改系统”。
- 体检项目会让 Agent 比较该项目的全部已注册操作，不再默认把第一项加入确认计划。
- Agent 正文新增安全 Markdown 渲染，支持语义化项目符号、编号列表、粗体、换行、代码、引用和表格，同时禁用原始 HTML。
- 新增 Markdown 安全与语义测试，以及应用忽略入口和体检分析文案的浏览器回归检查。

## 0.6.28 - 2026-07-29

### English

- Added read-only automatic import of usable Claude, Codex, and Gemini providers from the local CC Switch SQLite database, including its custom configuration-directory override.
- Mapped CC Switch API formats to the matching Vercel AI SDK provider, parsed Codex TOML with a real parser, skipped credential-free placeholders, and de-duplicated both repeated imports and matching manual configurations.
- Kept imported credentials inside the Electron main process and immediately re-encrypted them with Memento's existing AES-256-GCM storage before exposing only masked provider metadata to the Renderer.
- Added the package version to the persistent top toolbar so desktop and mobile layouts identify the exact build being tested.
- Replaced redundant large headings on Computer Health, Applications, Task History, and Settings with compact status/action rows or direct content.
- Increased Agent response, progress, structured-result, health, application, history, and settings text sizes while retaining the compact utility layout across four responsive viewports.
- Added CC Switch database, provider mapping, custom-path, encryption, de-duplication, build-version, and compact-layout regression coverage.

### 简体中文

- 新增对本机 CC Switch SQLite 的只读自动导入，支持其自定义配置目录，并同步可用的 Claude、Codex 和 Gemini 供应商。
- 按 CC Switch 的 API 格式映射到对应 Vercel AI SDK 供应商，使用正式 TOML 解析器读取 Codex 配置，跳过无密钥占位项，并对重复启动和相同手工配置去重。
- 导入密钥始终留在 Electron 主进程，并立即使用 Memento 既有 AES-256-GCM 方案重新加密；Renderer 仍只接收掩码后的供应商信息。
- 顶部工具栏持续显示软件版本号，桌面与移动布局都能确认正在测试的准确版本。
- 电脑体检、应用管理、任务记录和设置移除重复的大标题区，改为紧凑状态/操作栏或直接进入内容。
- 提高 Agent 回复、进度、结构化结果、体检、应用、任务记录和设置文字字号，同时保持四种响应式视口下的紧凑工具界面。
- 新增 CC Switch 数据库、供应商映射、自定义路径、加密、去重、构建版本和紧凑布局回归覆盖。

## 0.6.27 - 2026-07-29

### English

- Replaced the single Agent spinner with a compact animated progress surface that starts below 25%, advances gradually through real run phases, reports elapsed time, and never reaches completion before a result arrives.
- Added confirmed task-history deletion backed by SQLite; deleting a run also removes its related tool-call records through the existing foreign-key cascade.
- Expanded Application Management to include read-only apps from `/System/Applications`, including App Store, while keeping uninstall unavailable for macOS-protected bundles.
- Added application ignored items to Settings and enforced them across the visible inventory, application findings, registered actions, reveal targets, and Agent inspection context.
- Added a per-application Ask Agent action with exact name, Bundle ID, version, path, last-used record, executable, background-only role, and URL schemes for precise purpose and uninstall-impact analysis.
- Added root `InfoPlist.strings` name resolution so apps such as Thunder use their official Simplified Chinese display name; unknown Spotlight dates now read “No usage record” instead of implying a scan failure.
- Expanded unit, browser, and real-Electron smoke coverage for low-start progress, task deletion, application ignoring, localized Thunder naming, App Store protection, and helper metadata.

### 简体中文

- 使用紧凑的动画进度界面替代单一 Agent 转圈：从 25% 以下开始，按真实任务阶段缓慢推进，显示已用时间，并在结果返回前不会假装完成。
- 新增带确认的任务记录删除；SQLite 删除任务后会通过既有外键级联同步清除对应工具调用记录。
- 应用管理新增 `/System/Applications` 只读应用，包括 App Store；macOS 受保护应用仍不会提供卸载操作。
- 忽略列表新增应用分类，并同时约束可见应用、应用建议、已注册操作、定位目标和 Agent 检查上下文。
- 每张应用卡片新增“问 Agent”，携带精确名称、Bundle ID、版本、路径、最后使用记录、可执行文件、后台组件标记和 URL 协议，用于分析用途与卸载影响。
- 新增根目录 `InfoPlist.strings` 名称解析，迅雷等应用会显示官方简体中文名；Spotlight 没有日期时改为“无使用记录”，不再让人误以为扫描失败。
- 扩展单元、浏览器和真实 Electron 冒烟测试，覆盖低位起步进度、历史删除、应用忽略、迅雷中文名、App Store 保护和辅助组件元数据。

## 0.6.26 - 2026-07-29

### English

- Added persisted conversation IDs, focused entities, structured presentations, and pending-plan context so follow-up references resolve to the previous exact service, application, storage item, or terminal finding.
- Restricted referential follow-up inspections to the focused entity, preventing unrelated services from displacing requests such as “stop and remove this service.”
- Added a validated `present_results` Agent tool and trusted React result components instead of rendering arbitrary model-generated HTML.
- Added compact, interactive application-logo grids plus storage, service, and terminal result rows with Open and registered Add to plan actions.
- Kept all result actions behind current-scan operation validation and the existing user-confirmation boundary.
- Made the application language authoritative for Agent instructions, statuses, summaries, plans, errors, provider tests, and language-triggered scan refreshes.
- Migrated SQLite to schema version 2 and expanded unit and four-viewport visual coverage for context, structured results, direct actions, and English-only Agent output.

### 简体中文

- 持久化会话 ID、焦点实体、结构化展示和待确认计划上下文，让后续指代继续绑定上一轮的精确服务、应用、存储项目或终端发现。
- 指代上一轮对象时只检查焦点实体，避免“停止并删除这个服务”被无关服务列表干扰。
- 新增受校验的 `present_results` Agent 工具和可信 React 结果组件，不渲染模型生成的任意 HTML。
- 新增带 Logo 的紧凑应用结果网格，以及存储、服务、终端结果行，可直接打开或把已注册操作加入计划。
- 所有结果动作仍需通过当前扫描操作注册表和既有用户确认边界。
- 应用语言现在统一控制 Agent 提示词、状态、摘要、计划、错误、供应商测试，并在切换语言后重新体检。
- SQLite 升级到 schema 2，补充上下文、结构化结果、直接操作和 Agent 全英文输出的单元与四视口视觉测试。

## 0.6.25 - 2026-07-29

### English

- Fixed application uninstall failures when Electron's macOS Trash API reports an unrelated privacy or DiagnosticReports permission error for a valid application.
- Uninstall now verifies the registered target, tries the native Trash API first, and safely falls back to moving the application into the current user's Trash when the native call leaves it in place.
- The fallback accepts only real `.app` bundles under `/Applications` or the user's Applications directory, rejects protected and nested application bundles, and chooses a non-conflicting Finder-style name.
- Applications that genuinely require elevated filesystem access now use the existing macOS administrator authorization flow, with source and destination verification before the action is marked complete.
- Added focused allowlist, collision, and permission-error tests, plus a local `/Applications` to Trash round-trip check.

### 简体中文

- 修复 Electron 的 macOS 废纸篓接口对正常应用误报隐私或 DiagnosticReports 权限错误时无法卸载的问题。
- 卸载现在会先验证已注册目标并调用系统废纸篓接口；如果系统调用后 APP 仍在原位，会安全回退到当前用户的废纸篓。
- 回退只接受 `/Applications` 或用户应用目录中的真实 `.app`，拒绝系统受保护和嵌套应用，并使用 Finder 风格的无冲突名称。
- 真正需要更高文件权限的应用会继续使用 macOS 管理员授权，并在标记成功前验证原路径和废纸篓目标。
- 新增应用白名单、重名、权限错误测试，并完成 `/Applications` 到废纸篓的本机往返验证。

## 0.6.24 - 2026-07-29

### English

- Fixed false connection-test timeouts for slower reasoning and coding models such as `gpt-5.6-sol`.
- The full tool probe now allows up to 60 seconds overall and 45 seconds per provider step instead of applying a fragile 20-second limit to both model requests.
- The first probe step still requires a tool call, while the follow-up step now correctly requires a normal response after receiving the tool result instead of forcing the same tool a second time.
- Updated the in-progress state to identify the model being verified and replaced the misleading URL/network timeout hint with a response-latency message.

### 简体中文

- 修复 `gpt-5.6-sol` 等推理、编程模型在连接测试中被错误判定为超时的问题。
- 完整工具验证的总上限由容易误判的 20 秒调整为 60 秒，并为每次供应商请求设置 45 秒上限。
- 第一步仍强制调用测试工具；第二步收到工具结果后会正确要求普通回复，不再错误地强制模型再次调用同一工具。
- 测试中状态会显示正在验证的模型，误导性的地址/网络超时提示也改为响应耗时提示。

## 0.6.23 - 2026-07-29

### English

- Fixed an early preload DOM access that disabled the entire Electron bridge and made the production app silently show five demo applications without real icons.
- Restored the complete manageable application inventory and lazy real-icon loading; the current-device Electron check now sees 62 non-system applications instead of demo data.
- Added a production Electron smoke test that requires the preload API, real application cards, and a real application icon so browser-only UI checks cannot hide this regression again.
- Filtered image, audio, realtime, embedding, moderation, and internal-only entries out of mixed OpenAI model catalogs while preferring provider capability metadata when available.
- Model discovery now reports how many incompatible models were excluded; the provider editor explains the filtered Agent-ready result and still retains manual entry as a fallback.
- Verified the supplied OpenAI endpoint directly: its `/v1/models` route is healthy, but its 20-entry catalog mixes 14 Agent-ready text models with 6 incompatible entries.

### 简体中文

- 修复 preload 在 DOM 创建前访问页面导致整个 Electron 桥接失效的问题；该回归会让生产应用静默退回 5 个演示 APP，并失去所有真实 Logo。
- 恢复完整的可管理应用列表和真实 Logo 懒加载；当前设备的 Electron 检查从演示数据恢复为 62 个非系统应用。
- 新增生产 Electron 冒烟测试，强制验证 preload API、真实应用卡片和真实应用 Logo，避免纯浏览器 UI 测试再次掩盖同类问题。
- 对混合 OpenAI 模型目录过滤图片、音频、实时、Embedding、审核和内部专用模型；供应商提供能力元数据时优先使用元数据判断。
- 模型发现会返回过滤数量，设置页明确显示 Agent 可用模型与不兼容模型数量，同时保留手动填写兜底。
- 已直接验证用户提供的 OpenAI 入口：`/v1/models` 正常，但 20 项目录中混有 14 个 Agent 文本模型和 6 个不兼容项目。

## 0.6.22 - 2026-07-29

### English

- Replaced the first-launch blank surface with an immediate, theme-matched Memento boot animation that does not use fake progress.
- Reserved a macOS title-bar safe area above the sidebar brand and added draggable regions so the logo and name no longer overlap the window controls.
- Added a dedicated uninstalling state in the confirmation dialog, disabled repeated input, and animated the application card out of the grid before a background verification scan.
- Added automatic model discovery after a provider URL and credential are available, including loading, retry, error, manual-entry fallback, and model selection states.
- Normalized root and full endpoint URLs to provider API bases; `https://code.tczor.cn` now resolves to `https://code.tczor.cn/v1` for model discovery and Agent requests.
- Reused encrypted stored credentials when refreshing an existing provider's models, shortened connection-test timeouts, and added actionable sanitized errors.
- Extended provider and UI smoke coverage for URL normalization, model parsing, stored-key reuse, discovery timeout, uninstall feedback, and the inline boot surface.

### 简体中文

- 使用立即可见、配色一致且不伪造进度的 Memento 启动动画替代首次启动白屏。
- 在侧栏品牌上方预留 macOS 标题栏安全区，并加入窗口拖动区域，Logo 和名称不再与关闭按钮重叠。
- 卸载确认窗口新增明确的“正在卸载”状态并阻止重复操作；成功后应用卡片先退出网格，再在后台复检。
- 用户填写供应商地址和密钥后会自动获取模型列表，提供加载、重试、错误提示、手动填写兜底和模型选择状态。
- 根域名和完整接口地址会统一解析为模型 API 基地址；`https://code.tczor.cn` 现在会解析为 `https://code.tczor.cn/v1` 后再获取模型或发起 Agent 请求。
- 编辑已有供应商时可复用加密保存的密钥刷新模型；连接测试超时更短，错误提示可操作且会清除敏感信息。
- 补充地址归一化、模型解析、密钥复用、发现超时、卸载反馈和内联启动画面的测试与 UI 冒烟覆盖。

## 0.6.21 - 2026-07-29

### English

- Rebuilt the product from scratch against `prototypes/memento-agent/index.html`, with new Agent, Computer Health, Applications, Task History, and Settings work areas across desktop and mobile layouts.
- Replaced the old hosted AI/Gateway flow with a local Vercel AI SDK `ToolLoopAgent` supporting OpenAI-compatible, OpenAI, Anthropic, and Google Gemini providers.
- Added multiple-provider management, required tool-calling connection tests, default-model selection, and Electron `node:sqlite` persistence.
- Added AES-256-GCM API-key encryption with a separate `0600` master-key file; plaintext credentials stay out of the Renderer, SQLite, logs, and Agent context.
- Added read-only inspection tools and confirmed plan execution through the existing registered cleanup and terminal-fix boundaries, followed by a fresh verification scan.
- Added persisted cancellation and strict rejection of invented, stale, oversized, empty, or unconfirmed operation IDs.
- Rebuilt application management as a real-icon grid showing manageable apps, last-used time, size, Open, and confirmed Uninstall while excluding protected system apps.
- Kept storage/service ignored items outside visible scans, action registries, reveal targets, and Agent context.
- Removed the old AI service, hosted authentication, Gateway providers and examples, AI Renderer pages, old settings store, protocol registration, and obsolete documentation.
- Added AgentStore encryption/migration/provider/history tests, plan-validation tests, and an automated 20-screenshot UI smoke test covering four viewports and critical interactions.
- Rewrote the English and Chinese READMEs, Local Agent architecture, release notes, and repository development contract for the rebuilt product.

### 简体中文

- 严格按照 `prototypes/memento-agent/index.html` 从头重建产品，实现新的 Agent、电脑体检、应用管理、任务记录和设置工作区，并覆盖桌面与移动布局。
- 使用本地 Vercel AI SDK `ToolLoopAgent` 替代旧 Hosted AI/Gateway 流程，支持 OpenAI 兼容、OpenAI、Anthropic 和 Google Gemini。
- 新增多供应商管理、真实工具调用连接测试、默认模型选择，以及 Electron `node:sqlite` 持久化。
- 使用 AES-256-GCM 加密 API Key，主密钥单独保存在权限为 `0600` 的文件中；明文密钥不会进入 Renderer、SQLite、日志或 Agent 上下文。
- 新增只读检查工具，处理计划仍通过现有清理与终端修复注册表确认执行，结束后重新体检验证。
- 取消等待确认的计划会真正持久化；伪造、过期、超量、空或未确认的操作 ID 会被严格拒绝。
- 将应用管理重建为真实 Logo 网格，展示可管理 APP、最后使用时间、大小、打开和确认卸载，同时排除系统受保护应用。
- 存储/服务忽略项会同时离开可见体检、操作注册表、Finder 定位目标和 Agent 上下文。
- 删除旧 AI 服务、Hosted 登录、Gateway Provider 与示例、旧 AI 页面、旧设置存储、协议注册和过时文档。
- 新增 AgentStore 加密/迁移/供应商/历史测试、计划校验测试，以及覆盖四种视口和关键交互的 20 张截图 UI 冒烟测试。
- 完整重写中英文 README、本地 Agent 架构、发布说明和仓库开发约束，使文档与重建后的产品一致。

## 0.6.20 - 2026-07-29

### English

- Replaced exposed whitelist controls with the compact Ignored items interaction approved in the Memento Agent prototype.
- Background-service and storage rows now place Ignore item in a `...` menu and explain the exact effect before confirmation.
- Added a centralized Ignored items manager in Settings with storage/service tabs, live counts, empty states, and Restore detection actions.
- Ignored candidates leave current and future scan results immediately; their cleanup actions and Finder targets are also revoked so AI or Agent flows cannot bypass the rule.
- Documented the Agent prototype as the production UI source of truth and made versioned, verified local DMG delivery mandatory after every code or UI change.

### 简体中文

- 将直接暴露的白名单控件替换为 Memento Agent 原型中确认的紧凑“忽略列表”交互。
- 后台服务和存储空间行把“忽略此项”收纳到 `...` 菜单，并在确认前明确说明实际影响。
- 设置页新增统一的忽略列表管理窗口，包含存储空间/后台服务分类、实时数量、空状态和“恢复检测”操作。
- 忽略项会立即从当前及后续扫描结果中移除，同时撤销清理动作与 Finder 定位能力，AI 或 Agent 流程无法绕过。
- 将 Agent 原型写入文档作为正式 UI 的实现真源，并明确每次代码或 UI 修改后都必须升级版本、验证并交付本地 DMG。

## 0.6.19 - 2026-07-26

### English

- App cleanup now uses each application bundle's official Simplified Chinese display name when available, while retaining the official bundle or file name when no localization exists.
- Added an Open action to every application card, with progress and result feedback and main-process validation against the current scanned application allowlist.
- Kept Open visually secondary and Uninstall destructive, with a stable two-column action layout and the existing uninstall confirmation.

### 简体中文

- 应用清理现在会优先显示 APP 安装包自带的官方简体中文名称；没有中文本地化资源时保留官方 Bundle 名称或文件名。
- 每张应用卡新增“打开”操作，提供执行中和结果反馈，并由主进程根据当前扫描清单校验可启动路径。
- “打开”保持中性次操作，“卸载”继续使用危险操作样式和二次确认，双按钮布局保持稳定。

## 0.6.18 - 2026-07-26

### English

- Replaced the App cleanup table with a responsive application grid that keeps app identity and cleanup controls easy to scan.
- Added real macOS application icons loaded on demand through a path-validated main-process API; offscreen icons are deferred and unavailable icons use a consistent fallback.
- Each application card now shows the app icon, name, version, last-used date, relative age, size, install scope, Finder location, selection control, and confirmed uninstall action.
- Removed protected macOS system applications and the currently running Memento app from the inventory, counts, and filters.
- Replaced the redundant removable filter with useful shared-app and user-app filters while preserving search, unused-app filtering, sorting, and batch selection.

### 简体中文

- 将应用清理表格改为响应式应用网格，让应用识别信息和清理操作更便于浏览。
- 新增真实 macOS 应用图标，通过主进程校验路径后按需加载；屏幕外图标延迟读取，无法获取图标时使用统一占位图标。
- 每张应用卡现在会展示图标、名称、版本、最后使用日期、相对天数、大小、安装范围、Finder 位置、选择框和需确认的卸载操作。
- macOS 系统受保护应用和当前运行的 Memento 不再进入应用清单、数量统计和筛选结果。
- 使用共享应用与个人应用筛选替代重复的“可卸载”筛选，同时保留搜索、闲置筛选、排序和批量选择。

## 0.6.17 - 2026-07-26

### English

- App cleanup now inventories installed apps from shared, user, and macOS system application directories instead of showing only duplicate or long-unused findings.
- Every app row shows its version, Finder location, bundle size, and exact Spotlight last-used date with a relative age; missing usage metadata is labeled as unknown and is never treated as unused.
- Added app search, removable/unused/system filters, last-used/size/name sorting, per-app uninstall actions, and batch selection for removable apps.
- macOS system apps and the running Memento app remain visible but protected from uninstall; other app bundles move to the Trash only after explicit confirmation, while documents and app data remain.
- Preserved duplicate and 3-month-unused findings for overview health calculations while keeping the complete installed-app inventory separate.

### 简体中文

- 应用清理现在会罗列共享目录、用户目录和 macOS 系统目录中的已安装 APP，不再只显示重复安装或长期未使用的项目。
- 每个应用都展示版本、Finder 位置、应用大小、Spotlight 最后使用日期和相对天数；缺少使用记录时明确标为未知，且不会误判为闲置应用。
- 新增应用搜索、可卸载/闲置/系统筛选、按最后使用时间/大小/名称排序、单项卸载和可卸载应用批量选择。
- macOS 系统应用和当前运行的 Memento 会显示但受保护；其他应用必须确认后才会移到废纸篓，文稿和应用数据仍会保留。
- 重复应用与近 3 个月未使用的发现仍用于概览健康度计算，完整应用清单与问题建议保持独立。

## 0.6.16 - 2026-07-26

### English

- Synchronized candidate-analysis actions between the desktop app and Memento Server, including permanent storage cleanup and service-directory cleanup.
- Fixed storage AI analysis failing when a candidate included the newer `delete-storage` action.
- Gateway request-format errors now appear as an app/server compatibility issue instead of the misleading “AI service unavailable” message.
- Added client and server regression tests and verified the repaired path against the real local Gateway and configured model provider.

### 简体中文

- 同步桌面客户端与 Memento Server 的候选分析动作协议，补齐永久存储清理和服务目录清理。
- 修复存储项目包含新版 `delete-storage` 操作时 AI 分析失败的问题。
- Gateway 请求格式错误现在会明确提示客户端与服务端不兼容，不再误报“AI 服务暂时不可用”。
- 新增客户端和服务端回归测试，并使用本地真实 Gateway 与已配置模型完成修复链路验证。

## 0.6.15 - 2026-07-26

### English

- Redesigned the startup scan with a restrained radar animation, visible states for all four modules, and an accessible overall progress indicator.
- Startup progress now begins at 4%, stays at 10% while parallel checks start, and advances only when a real scan module finishes instead of jumping immediately to 62%.
- Homebrew old-version findings now come from `brew cleanup --dry-run` rather than raw Cellar directory counts, so formulas that Homebrew refuses to clean are no longer shown as actionable.
- Homebrew cleanup revalidates the dry-run immediately before execution and reports failure unless every listed old keg directory is actually removed.
- Added a repository release workflow requiring a patch-version bump, release notes, verification, a local x64 DMG, checksum, and source commit for every completed change.

### 简体中文

- 重做启动扫描界面，新增克制的雷达扫描动画、四个模块的实时状态，以及具备无障碍语义的总体进度。
- 启动进度从 4% 开始，并行检查启动时保持在 10%；之后只在真实模块完成时推进，不再一启动就跳到 62%。
- Homebrew 旧版本候选改为依据 `brew cleanup --dry-run`，不再只看 Cellar 目录数量；Homebrew 当前拒绝清理的配方不会再误显示为可操作项。
- Homebrew 清理执行前会重新校验 dry-run，执行后逐个检查旧 keg 目录；未实际移除时不会误报完成。
- 新增仓库发布流程，要求每次完成改动都升级补丁版本、更新发布说明、完成验证、构建本地 x64 DMG、生成校验值并提交源码。

## 0.6.14 - 2026-07-26

### English

- Renamed the Applications module to **App cleanup** so it is clear that the page shows actionable findings rather than every installed application.
- Reduced the unused-application threshold from 180 days to 90 days while continuing to exclude applications with unknown Spotlight usage metadata.
- Added a specific empty state explaining that no confirmed duplicate apps or apps unused for more than three months were found.
- Corrected application size reporting by using Spotlight logical bundle size instead of the directory entry size.
- Kept duplicate detection for matching Bundle IDs across `/Applications` and `~/Applications`.

### 简体中文

- 将“应用版本”更名为“应用清理”，明确该页面展示的是可处理建议，而不是全部已安装应用。
- 应用未使用阈值从 180 天缩短为 90 天；Spotlight 使用时间未知的应用仍不会被误判为清理候选。
- 新增专用空状态，明确说明没有发现可确认的重复应用或超过 3 个月未使用的应用。
- 改用 Spotlight 的应用包逻辑大小，修复 `.app` 大小可能错误显示为 `1 B` 的问题。
- 保留 `/Applications` 与 `~/Applications` 中相同 Bundle ID 的重复副本检测。

## 0.6.13 - 2026-07-26

### English

- Storage cleanup now permanently removes strictly allowlisted rebuildable targets, verifies that the source disappeared, and rescans so released space is reflected immediately; Xcode Archives and other protected data remain analysis-only.
- Permanent storage actions show an explicit irreversible confirmation with the affected size and no longer imply that moving data to Trash releases disk space.
- Terminal diagnostics can automatically apply deterministic local fixes for repeated initialization, synchronous startup requests, version-manager startup loading, and invalid or duplicate PATH entries.
- Shell configuration changes are hash-checked, syntax-validated, backed up, written atomically, and reversible unless the user edits the file afterward.
- Automatic terminal optimization never runs AI-generated commands; the confirmation dialog lists every built-in change before execution.

### 简体中文

- 存储清理现在会永久删除严格限制在白名单内的可重建目标，检查原路径已经消失，并重新扫描以立即反映释放的空间；Xcode Archives 等受保护数据仍然只分析、不自动清理。
- 永久存储操作会明确提示不可撤销和影响大小，不再把“移到废纸篓”误当成已经释放磁盘空间。
- 终端诊断可自动处理重复初始化、启动阶段同步网络请求、版本管理器启动加载，以及无效或重复 PATH 等确定性本地问题。
- shell 配置修改会校验扫描时哈希与 zsh 语法，自动备份并原子写入；如果用户之后没有再次编辑，可一键撤销。
- 终端自动优化绝不运行 AI 生成的命令，执行前会逐项列出所有内置变更。

## 0.6.12 - 2026-07-25

### English

- Removed redundant item detail drawers from service, storage, and application lists; useful context and actions now stay directly in each row.
- Consolidated general and AI preferences under one Settings destination with a compact two-tab switcher.
- Replaced large theme previews with concise palette swatches while preserving all eight themes.
- Clarified inline AI states for starting, running, viewing, and collapsing an analysis.
- Reduced the primary navigation to six items and tightened desktop and mobile layouts.

### 简体中文

- 移除后台服务、存储空间和应用列表中信息重复的详情侧栏；有效说明与操作直接保留在每一行。
- 将通用设置和 AI 设置合并到同一个“设置”入口，并使用紧凑的双标签切换。
- 使用简洁色板替代大幅主题预览，同时保留全部八套主题。
- 明确 AI 分析的开始、进行中、查看结果和收起状态。
- 主导航精简为六项，并收紧桌面与手机布局。

## 0.6.11 - 2026-07-25

### English

- Moved service and storage whitelist management into **Results / Whitelist** tabs within each module.
- Replaced oversized module introductions with compact headers that keep the list in the first viewport.
- AI analysis now expands directly below the selected item instead of opening in the details sidebar.
- Simplified directory links to quiet inline paths with a Finder icon and removed duplicate storage paths.
- The async AI task center now hides the task currently open inline and restores it after users leave the item.

### 简体中文

- 服务和存储白名单并回对应模块，通过“扫描结果 / 白名单”标签切换。
- 移除占用空间过大的模块说明，改为紧凑页头，让列表更早进入首屏。
- AI 分析改为在所选项目下方直接展开，不再出现在详情侧栏中。
- 目录入口改为轻量行内路径加 Finder 图标，并去除存储项目的重复路径。
- 当前行内展开的 AI 任务不再重复出现在任务中心；离开项目后仍可从任务中心找回。

## 0.6.10 - 2026-07-25

### English

- Added a dedicated sidebar whitelist manager with separate service and storage sections.
- Added storage-item whitelisting based on stable item locations.
- Removing a whitelist entry automatically rescans and restores the item.
- Whitelisting immediately unregisters the item's cleanup and Finder capabilities in the main process.
- Removed ambiguous service checkboxes in favor of explicit row actions, while preserving batch selection for storage and applications.

### 简体中文

- 侧栏新增独立白名单管理，分别展示服务和存储项目。
- 新增基于稳定路径的存储项目白名单。
- 移出白名单后自动重新扫描并恢复项目。
- 加入白名单时，主进程会立即注销项目的清理和 Finder 定位能力。
- 移除含义不明确的服务复选框，改用明确的行内操作；存储和应用仍支持批量选择。

## 0.6.9 - 2026-07-25

### English

- Fixed privileged LaunchAgent removal by using the valid macOS `/bin/test` command instead of the nonexistent `/usr/bin/test`.
- Added an application-owned staging step before sending protected items to Trash.
- Added verification for both source removal and staged files, with a recoverable fallback location if the Trash API fails.
- Cleanup failures now show the concrete macOS error message.
- Real-world verification successfully removed `com.sogou.SogouTaskManager.plist` from `/Library/LaunchAgents` and preserved it in Trash.

### 简体中文

- 将授权清理脚本中不存在的 `/usr/bin/test` 修正为 macOS 有效的 `/bin/test`。
- 受保护项目在进入废纸篓前会先移动到应用自己的暂存目录。
- 新增原位置和暂存文件双重检查；废纸篓 API 失败时会保留可恢复的暂存位置。
- 清理失败时直接显示 macOS 返回的具体错误信息。
- 已真实验证成功移除 `/Library/LaunchAgents/com.sogou.SogouTaskManager.plist`，文件保留在废纸篓中。

## 0.6.8 - 2026-07-25

### English

- Added a service whitelist. Whitelisted services are hidden from scan results and can be restored from Settings.
- Fixed **Keep in menu bar after closing** by creating and validating the menu bar icon before the main window is hidden.
- Added exact, clickable Finder locations to every storage candidate.
- Fixed privileged startup-item removal so an expected `launchctl bootout` failure cannot prevent the configuration from moving to Trash.
- Added post-authorization source checks so cleanup is never reported as complete while a target still exists.
- Verified `com.sogou.SogouTaskManager` has one removal action and follows the corrected root-owned LaunchAgent cleanup path.

### 简体中文

- 新增服务白名单。加入白名单的服务不再出现在扫描结果中，可在设置中恢复显示。
- 修复“关闭后驻留菜单栏”：主窗口隐藏前会先创建并验证菜单栏图标。
- 所有存储空间项目新增准确且可点击的 Finder 位置。
- 修复授权移除启动项：预期内的 `launchctl bootout` 失败不会再阻止配置移到废纸篓。
- 新增授权后的源文件检查，清理目标仍存在时不会误报操作完成。
- 已确认 `com.sogou.SogouTaskManager` 只显示一个移除操作，并使用修复后的 root LaunchAgent 清理流程。

## 0.6.7 - 2026-07-25

### English

- Removed duplicate **Remove startup item** actions from stale LaunchAgents such as `com.sogou.SogouTaskManager`.
- Service locations now prefer the owning application, a specific user project, or the Homebrew formula directory. Broad working directories such as `/usr/local/var` are no longer shown when a more specific configured program location exists.
- Missing configured programs are reported as missing instead of linking to an unrelated working directory.
- Removing a startup item now keeps the service visible when a related software or directory cleanup choice remains, so users can decide on that second step separately.
- AI service analysis now explains the software's real purpose instead of repeating LaunchAgent state. It also distinguishes removing a startup item from deleting software or a directory.
- Parallel AI analyses now run independently, and strict structured responses prevent malformed model output from hiding completed results.

### 简体中文

- 移除 `com.sogou.SogouTaskManager` 等失效 LaunchAgent 上重复的“移除启动项”操作。
- 服务位置优先显示所属应用、具体的用户项目目录或 Homebrew formula 目录。存在更具体的程序位置时，不再显示 `/usr/local/var` 这类宽泛工作目录。
- 配置指向的程序已不存在时，会明确说明，不再链接到无关目录。
- 移除启动项后，如果仍有关联软件或目录清理选项，服务会继续保留在列表中，用户可以再单独决定第二步。
- AI 服务分析现在会说明软件的真实用途，不再复述 LaunchAgent 状态，并严格区分“移除启动项”与“删除软件或目录”。
- 多项 AI 分析现在可独立并行执行，严格的结构化响应会避免模型格式异常导致结果无法显示。

## 0.6.6 - 2026-07-25

### English

- Every non-Apple LaunchAgent can now remove its startup item independently while keeping the program directory and user data.
- LaunchAgents with an explicit user-owned working directory also offer a separate, clearly warned option to move the related startup items and entire directory to Trash.
- Related services that share a working directory are stopped and handled together, while broad, protected, or symbolic-link directory targets are rejected.
- AI analyses can now run in parallel. Hosted authentication refresh is shared safely across concurrent requests, and server timeouts are no longer reported as rate limits.
- The local development gateway allows four concurrent analyses per user, with higher development-only request limits. Two real hosted analyses were verified concurrently.

### 简体中文

- 所有非 Apple LaunchAgent 现在都可以单独“移除启动项”，同时保留程序目录和用户数据。
- 如果 LaunchAgent 明确声明了当前用户所有的工作目录，还会提供独立的“删除关联目录”选项，并在执行前明确警告影响。
- 共用工作目录的相关服务会一起停止和处理；过于宽泛、受保护或符号链接目录会被拒绝。
- AI 分析现在可以并行运行。并发请求会安全共用登录 Token 刷新，服务端超时也不再被误报为请求过于频繁。
- 本地开发 Gateway 允许每个用户同时进行 4 项分析，并提高了仅用于开发环境的请求频率上限。已使用两条真实 AI 请求并发验证。

## 0.6.5 - 2026-07-25

### English

- **Ask AI** now starts analysis immediately without a request preview, token estimate, or second confirmation. The internal allowlist, redaction, and request integrity checks remain enforced.
- Replaced the single transient AI status bar with a persistent task panel. Multiple running and completed analyses show their original item names, and completed results remain available until opened or dismissed.
- Running services now show a verified service location when one can be derived from their launch configuration. The path can be opened directly in Finder.
- Added real-scan coverage for service locations and Finder reveal-target registration.

### 简体中文

- 点击“问 AI”后直接开始分析，不再展示请求预览、Token 预估或二次确认；内部字段白名单、脱敏和请求完整性校验仍然保留。
- 将单条短暂的 AI 状态提示改为常驻任务面板。多个进行中和已完成的分析都会显示原项目名称，完成结果会保留到用户查看或关闭。
- 从启动配置中能可靠识别位置时，运行中的服务会显示服务目录，并可直接在 Finder 中打开。
- 真实扫描验证新增服务目录和 Finder 打开目标的检查。

## 0.6.4 - 2026-07-25

### English

- AI analysis now continues as a background task when users close the inspector, switch views, or inspect another service. List actions and a global activity bar show the current task state.
- Stopped non-Apple LaunchAgents remain visible after a new scan and no longer show an invalid Stop action.
- Services that share an application or exact data directory now expose the same deduplicated uninstall action from every related row.
- Added safe cleanup for services such as ShadowsocksX-NG whose launch configuration points to a dedicated directory under Application Support instead of an application bundle.

### 简体中文

- AI 分析改为后台任务。关闭详情、切换页面或查看其他服务时分析会继续，列表入口和全局状态条会显示当前进度。
- 已停止的非 Apple LaunchAgent 在重新扫描后仍会显示，并且不再提供无效的“停止”操作。
- 同一应用或同一精确数据目录下的多个服务会共享去重后的卸载操作，每一条相关服务都能发起清理。
- 支持安全清理 ShadowsocksX-NG 这类没有应用包、但启动配置明确指向 Application Support 专用目录的服务。

## 0.6.3 - 2026-07-25

### English

- Removed Electron `safeStorage` and macOS Keychain access from AI credential storage.
- AI login tokens and API keys are now stored in Memento's local application data with current-user-only file permissions.
- Legacy encrypted credentials are ignored, so users may need to reconnect Memento Server or enter their API key once after upgrading.

### 简体中文

- AI 凭据存储不再使用 Electron `safeStorage`，也不再请求访问 macOS 钥匙串。
- AI 登录 Token 和 API Key 改为保存在仅当前系统用户可读的 Memento 本地应用数据中。
- 旧版加密凭据将被忽略，升级后可能需要重新连接一次 Memento Server 或重新填写 API Key。

## 0.6.2 - 2026-07-25

### English

- Changed the application Bundle ID to `com.fcl.memento`.
- Added Chinese and English interface settings, window behavior controls, and eight visual themes.
- Made AI answers shorter and easier to understand, with a direct answer about whether an item can be stopped, removed, or cleaned.
- Kept stopped services visible so users can still review or uninstall the related software.
- Fixed action labels that remained in English after switching back to Chinese.
- Added reproducible release builds for macOS x64/arm64, Windows x64, and Linux x64.
- Expanded the public documentation, security boundaries, build instructions, and release process.

### 简体中文

- 应用 Bundle ID 修改为 `com.fcl.memento`。
- 新增中英文界面设置、窗口行为配置和八种视觉主题。
- AI 回答改为更短、更容易理解的表达，直接说明项目能否停止、删除或清理。
- 停止服务后继续保留条目，用户仍可查看详情或卸载相关软件。
- 修复切换回中文后部分操作按钮仍显示英文的问题。
- 新增 macOS x64/arm64、Windows x64 和 Linux x64 的可重复发布构建。
- 补充开源项目说明、安全边界、构建方式和发布流程。

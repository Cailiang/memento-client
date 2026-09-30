# Memento Agent 1.0.2 - CC Switch 一次性导入 / One-Time CC Switch Import

## 简体中文

- **只询问一次：** 首次检测到可用 CC Switch 配置时，Memento 会询问是否导入；选择后不会重复弹出。
- **独立副本：** 导入结果保存为 Memento 自己的加密供应商配置，用户可以自由修改名称、地址、模型和密钥，不会跟随 CC Switch 变化，也不会回写 CC Switch。
- **手动复制：** 设置页可以按需再次复制 CC Switch 配置，除此之外 Memento 不会读取或同步 CC Switch。

## English

- **One-time prompt:** Memento asks once whether to import usable CC Switch providers when it first detects them.
- **Independent copies:** Imported providers are encrypted Memento configurations that can be edited freely. They do not follow or write back to CC Switch.
- **Explicit copy action:** Settings can copy CC Switch configurations again when requested; there is no background synchronization.

---

# Memento Agent 1.0.1 - App Store 更新检测 / App Store Update Detection

## 简体中文

- **App Store 更新检测：** 通过应用内的 App Store 收据和 Apple lookup 服务识别更新；没有安装 `mas` 时，钉钉等 App Store 应用也能显示准确的版本差异。
- **更新方式清晰：** 应用卡片会区分“可在 Memento 内更新”和“需打开 App Store/应用更新”，并提供对应的筛选器与操作按钮。
- **来源校验：** Homebrew Cask 结果会比较实际版本，只保留确实更高的更新。

## English

- **Mac App Store detection:** Receipt-backed applications are checked through Apple's lookup service, so App Store installs such as DingTalk still show their exact version delta without `mas`.
- **Clear update paths:** Application cards distinguish updates Memento can install from updates that need the App Store or the application's own updater, with matching filters and action labels.
- **Source validation:** Homebrew Cask results are compared with the installed version to avoid stale update reports.

---

# Memento Agent 1.0.0 - 首个稳定版本 / First Stable Release

## 简体中文

`1.0.0` 完成首个稳定版本的交互收口。

### 主要变化

- **辅助功能说明：** 网络卡片在无法自动切换活动监视器面板时，会说明权限用途、设置路径和权限边界。它只用于点击“网络”标签。
- **应用卡片空间：** 默认窗口宽度调整为 1440 像素，应用卡片中的“问 Agent”、更新和管理操作不再拥挤。
- **快捷筛选：** 从概览页点击“不常用”或“需要更新”的数字，会直接进入应用管理并选中对应筛选。
- **系统进程提示：** 进程列表中的“系统进程”标签使用红色显示。

## English

`1.0.0` closes the first stable interaction pass for Memento Agent.

### Highlights

- **Accessibility explanation:** If Memento cannot switch Activity Monitor to the Network panel automatically, it explains the permission purpose, settings path, and scope. The permission is used only to click the Network tab.
- **Application-card space:** The default window width is now 1440 pixels, giving Agent, update, and management actions room to breathe.
- **Filter shortcuts:** Clicking Unused or Updates available in Overview opens Applications with that filter selected.
- **System-process warning:** The System process label is now red in the live process list.

---

# Memento Agent 0.7.15 - 应用内更新与进程列表可读性 / In-App Updates and Process Readability

## 简体中文

`0.7.15` 让应用管理可以在 Memento 内执行更多更新，并收紧命令行启动优化列表的可操作边界。

### 主要变化

- **应用更新：** Homebrew Cask 和 Mac App Store 继续使用各自的命令行更新源；Sparkle appcast 提供下载包时，Memento 会通过 HTTPS 下载、校验 Bundle ID、签名团队和严格代码签名，再替换应用。无法安全取得安装包时仍使用应用自带更新器。
- **命令行启动：** 没有注册修复操作的“可查看配置”诊断不再出现在优化列表中。
- **进程列表：** 概览页进程名称、资源数值、筛选器和操作菜单字号调大，行高同步增加。

## English

`0.7.15` brings more application updates into Memento and keeps reference-only terminal diagnostics out of the actionable list.

### Highlights

- **Application updates:** Homebrew Cask and Mac App Store updates keep their package-manager paths. When a Sparkle appcast includes a package URL, Memento downloads it over HTTPS, verifies bundle identity, signing team, and strict code signing, then replaces the bundle. If a safe package is unavailable, the app's own updater remains available.
- **Terminal startup:** Findings without a registered fix, including reference-only configuration diagnostics, are hidden from the optimization list.
- **Process list:** Overview uses larger process names, resource values, filters, action-menu text, and row spacing.

---

# Memento Agent 0.7.14 - 应用活跃时间 / Application Activity Dates

## 简体中文

`0.7.14` 修复应用管理中大量应用显示“无使用记录”的问题。

### 主要变化

- **活跃时间：** 优先使用 Spotlight 的 `kMDItemLastUsedDate`；Spotlight 没有数据时，使用 `.app` 包目录修改时间作为 Mole 兼容的活动估算。
- **时间显示：** 应用卡片按天、周、月和年显示相对时间，例如“7 个月前”和“2 年前”。
- **数据边界：** 丢弃无效、2001 年以前和未来异常时间；兜底时间表示安装或更新活动，不宣称是精确启动记录。

## English

`0.7.14` fixes application cards that reported “No usage record” for many apps.

### Highlights

- **Activity dates:** Read Spotlight `kMDItemLastUsedDate` first, then use the `.app` bundle mtime as Mole-compatible activity estimate when Spotlight has no value.
- **Humanized ages:** Show application ages in day, week, month, and year units, such as “7 months ago” and “2 years ago”.
- **Validation:** Reject invalid, pre-2001, and future dates; bundle mtime is documented as installation/update activity evidence rather than an exact launch record.

---

# Memento Agent 0.7.13 - 应用分析进度与卡片交互 / Application Scan Progress and Card Interaction

## 简体中文

`0.7.13` 优化应用扫描反馈和应用卡片的空间使用。

### 主要变化

- **应用分析：** 概览首次扫描时在卡片内显示动画进度条，完成后显示已安装、不常用和可更新应用数量。
- **应用卡片：** 点击卡片即可打开应用；移除独立“打开”按钮，更新状态改为标题下方的紧凑徽标。
- **卡片入口：** CPU/内存卡片跳到对应降序进程列表，磁盘卡片打开磁盘分析，电池卡片打开系统设置，网络卡片打开活动监视器网络面板。
- **进程列表：** 移除“高占用进程”板块，扩展实时采样数量，支持用户/系统筛选和颜色区分。
- **应用更新：** 应用管理支持 Homebrew Cask、Mac App Store（`mas`）和 Sparkle appcast 来源，并为每个来源使用对应的更新动作。
- **首次加载：** 概览页启动应用扫描，应用分析统计、进程 Logo 和 Memento 自身图标不再依赖先打开应用管理。
- **终端诊断：** 没有自动修复的诊断也可以直接打开相关 shell 配置文件查看。

## English

`0.7.13` improves application scan feedback and application-card interaction density.

### Highlights

- **Application analysis:** Overview shows an animated in-card progress bar during the first inventory scan, then shows installed, unused, and updateable counts.
- **Application cards:** Clicking or keyboard-activating a card opens the app; the standalone Open button is removed and update status is shown as a compact badge under the title.
- **Card navigation:** CPU and Memory cards jump to descending process lists, Disk opens Disk analysis, Battery opens System Settings, and Network opens Activity Monitor's Network panel.
- **Process list:** The high-usage process block is replaced by a larger live sample with User/System filters and distinct colors.
- **Application updates:** Applications recognizes Homebrew Cask, Mac App Store (`mas`), and Sparkle appcast sources and routes each update action to its matching updater.
- **First-load inventory:** Overview starts the application scan itself, so counts, process logos, and Memento's own icon are ready without visiting Applications first.
- **Terminal diagnostics:** Findings without safe automatic edits can still open their related shell configuration file.

---

# Memento Agent 0.7.12 - 应用更新来源与概览初始化 / Application Updates and Overview Initialization

## 简体中文

`0.7.12` 扩展应用更新来源，并让概览页面首次打开就拥有完整的应用和进程图标数据。

### 主要变化

- **应用分析：** 概览显示已安装、不常用和可更新应用数量，点击进入应用管理。
- **卡片入口：** CPU/内存卡片跳到对应降序进程列表，磁盘卡片打开磁盘分析，电池卡片打开系统设置，网络卡片打开活动监视器网络面板。
- **进程列表：** 移除“高占用进程”板块，扩展实时采样数量，支持用户/系统筛选和颜色区分。
- **应用更新：** 应用管理支持 Homebrew Cask、Mac App Store（`mas`）和 Sparkle appcast 来源，并为每个来源使用对应的更新动作。
- **首次加载：** 概览页启动应用扫描，应用分析统计、进程 Logo 和 Memento 自身图标不再依赖先打开应用管理。

## English

`0.7.12` broadens application update sources and makes Overview initialize its application inventory immediately.

### Highlights

- **Application analysis:** Overview shows installed, unused, and updateable application counts and opens Applications.
- **Card navigation:** CPU and Memory cards jump to descending process lists, Disk opens Disk analysis, Battery opens System Settings, and Network opens Activity Monitor's Network panel.
- **Process list:** The high-usage process block is replaced by a larger live sample with User/System filters and distinct colors.
- **Application updates:** Applications recognizes Homebrew Cask, Mac App Store (`mas`), and Sparkle appcast sources and routes each update action to its matching updater.
- **First-load inventory:** Overview starts the application scan itself, so counts, process logos, and Memento's own icon are ready without visiting Applications first.

---

# Memento Agent 0.7.11 - 概览分析与进程筛选 / Overview Analysis and Process Filters

## 简体中文

`0.7.11` 让概览页面成为可操作的设备入口，并补齐应用更新和终端诊断操作。

### 主要变化

- **应用分析：** 概览显示已安装、不常用和可更新应用数量，点击进入应用管理。
- **卡片入口：** CPU/内存卡片跳到对应降序进程列表，磁盘卡片打开磁盘分析，电池和网络卡片打开 macOS 系统设置。
- **进程列表：** 移除“高占用进程”板块，扩展实时采样数量，支持用户/系统筛选和颜色区分。
- **应用更新：** 应用管理增加检查更新和更新按钮；Homebrew Cask 应用在检测到安全更新来源时可直接更新。
- **终端诊断：** 没有自动修复的诊断也可以直接打开相关 shell 配置文件查看。

## English

`0.7.11` turns Overview into an actionable device workspace and adds application update and terminal diagnostic actions.

### Highlights

- **Application analysis:** Overview shows installed, unused, and updateable application counts and opens Applications.
- **Card navigation:** CPU and Memory cards jump to descending process lists, Disk opens Disk analysis, and Battery/Network open macOS System Settings.
- **Process list:** The high-usage process block is replaced by a larger live sample with User/System filters and distinct colors.
- **Application updates:** Applications adds Check updates and per-app Update actions when Homebrew Cask provides a safe update source.
- **Terminal diagnostics:** Findings without safe automatic edits can still open their related shell configuration file.

---

# Memento Agent 0.7.10 - 进程图标、终端模块与清理进度 / Process Logos, Terminal Module, and Cleanup Progress

## 简体中文

`0.7.10` 让进程、命令行启动优化和清理执行结果更容易理解和处理。

### 主要变化

- **进程图标：** 首页高占用进程会匹配已安装应用 Bundle，并按需加载对应 Logo。
- **独立终端模块：** “命令行启动优化”现在和“应用管理”“磁盘分析”处于同一级导航；清理页专注于存储和后台服务。
- **清理进度动画：** 执行批量清理时逐项展示等待、处理中、完成或失败状态，持续反馈当前进度。
- **失败处理：** 失败行会显示具体错误原因，完成后可以只重试失败的操作，不需要重新勾选整批项目。

## English

`0.7.10` makes process identity, terminal startup optimization, and cleanup results easier to understand and act on.

### Highlights

- **Process logos:** Overview process rows match sampled commands to installed application bundles and load their logos on demand.
- **Standalone terminal module:** Terminal startup optimization now sits beside Applications and Disk analysis in primary navigation; Cleanup focuses on storage and background services.
- **Animated cleanup progress:** Batch cleanup shows each item moving through waiting, working, completed, or failed states while progress advances.
- **Failure handling:** Failed rows keep their concrete error messages and can be retried as a smaller batch without selecting everything again.

---

# Memento Agent 0.7.9 - 依赖安全修复 / Dependency Security Fix

## 简体中文

`0.7.9` 修复了随应用发布的 `electron-updater` 依赖链中的 `js-yaml@4.3.0` 高危公告。

### 主要变化

- **依赖安全：** 将 `electron-updater` 和 Electron Builder 使用的 `js-yaml` 4.x 间接依赖固定到 `4.3.2`，覆盖受影响的 4.3.0/4.3.1 版本。
- **发布校验：** 运行时 `npm audit --omit=dev` 已通过，发布依赖树不再报告该高危问题。

## English

`0.7.9` fixes the high-severity `js-yaml@4.3.0` advisory in the shipped `electron-updater` dependency chain.

### Highlights

- **Dependency security:** Pin the `js-yaml` 4.x transitive dependency used by `electron-updater` and Electron Builder to `4.3.2`, covering the affected 4.3.0/4.3.1 releases.
- **Release verification:** `npm audit --omit=dev` passes, and the shipped dependency tree no longer reports this high-severity issue.

---

# Memento Agent 0.7.8 - 清理菜单与选择状态 / Cleanup Navigation and Selection State

## 简体中文

`0.7.8` 修复了清理页进入 AI 后勾选状态丢失的问题，并补齐后台服务和命令行启动项的菜单入口。

### 主要变化

- **选择状态：** 从清理项目进入 AI 解释后返回，原有勾选继续保留；返回时也恢复来源类别。
- **后台服务：** 清理菜单新增后台服务分类，可以查看扫描到的服务、启动项和对应操作。
- **命令行启动项：** 清理菜单新增命令行启动项分类，可以查看 shell 启动诊断，并直接执行带备份的可撤销修复。

## English

`0.7.8` keeps Cleanup selections across isolated AI explanations and adds visible menus for background services and terminal startup findings.

### Highlights

- **Selection state:** Returning from an item explanation preserves the checked Cleanup items and restores the source category.
- **Background services:** Cleanup now has a dedicated menu for scanned services, launch agents, and their registered operations.
- **Terminal startup:** Cleanup now exposes shell startup diagnostics and directly runs reversible, backed-up configuration fixes.

---

# Memento Agent 0.7.7 - 开发者产物与应用加载 / Developer Artifacts and Application Loading

## 简体中文

`0.7.7` 补齐了开发者项目构建产物清理，并让应用管理在扫描期间明确反馈状态。

### 主要变化

- **开发者项目产物：** 在常见项目目录中识别 `node_modules`、`target`、`build`、`dist`、`.build`、`.next`、`.turbo`、覆盖率和其他可重建产物，按项目显示大小和路径。
- **安全边界：** 最近活动目录、包含嵌套 Git 仓库或部署密钥的产物不会进入默认清理；移动到废纸篓前会重新校验项目根目录、目录类型和修改时间。
- **规则外线索：** 已注册目标的弱线索现在提供明确的“移到废纸篓”确认操作，同时仍保持规则外标签和 AI 解释入口。
- **应用加载：** 首次扫描显示阶段信息与骨架动画；已有结果刷新时继续保留当前列表，并显示紧凑进度状态；失败时可直接重试。

## English

`0.7.7` adds developer project artifact cleanup and makes application inventory loading explicit.

### Highlights

- **Developer project artifacts:** Discover `node_modules`, `target`, `build`, `dist`, `.build`, `.next`, `.turbo`, coverage, and other rebuildable outputs under bounded project roots, with project and path context.
- **Safety boundaries:** Recently active directories and outputs containing nested Git repositories or deployment key material are protected from default cleanup. The main process revalidates the project root, directory type, and modification time before moving an artifact to Trash.
- **Outside-rule clues:** Weak clues with registered targets now expose an explicit confirmed Move to Trash action while retaining their outside-rule label and AI explanation entry.
- **Application loading:** The first scan shows phase text and animated skeleton cards; later refreshes keep the current list visible and add compact progress feedback. Scan failures offer a direct retry.

---

# Memento Agent 0.7.6 - 更新安装退出修复 / Update Installation Exit Fix

## 简体中文

`0.7.6` 修复更新安装时应用没有真正退出的问题。

### 主要变化

- **菜单栏驻留兼容：** 开始更新前明确标记应用正在退出，避免“关闭后驻留菜单栏”拦截 `quitAndInstall` 的窗口关闭流程。
- **失败恢复：** 如果更新器同步抛出错误，会恢复正常窗口关闭行为并显示错误状态。

## English

`0.7.6` fixes updates that remained stuck in the Installing state.

### Highlights

- **Tray compatibility:** Mark the app as quitting before `quitAndInstall` so Keep in menu bar cannot intercept the updater's shutdown.
- **Failure recovery:** Restore normal window-close behavior when the updater throws synchronously and expose the error state.

---

# Memento Agent 0.7.5 - macOS 磁盘容量一致性 / macOS Disk Capacity Alignment

## 简体中文

`0.7.5` 让概览中的磁盘可用空间尽量跟随 macOS 系统口径。

### 主要变化

- **系统容量口径：** 使用 macOS 原生宗卷容量估算，包含系统可按需释放的可清除空间。
- **显示格式：** 磁盘容量改用十进制 GB，并明确标注包含 macOS 可清除空间。
- **回归覆盖：** 增加容量解析器、文档和四视口 UI 冒烟断言。

## English

`0.7.5` brings Overview disk availability closer to the macOS system view.

### Highlights

- **System capacity:** Read macOS native volume capacity estimates, including space macOS can purge when needed.
- **Display format:** Use decimal GB for disk capacity and explain that purgeable space is included.
- **Regression coverage:** Add capacity parser, documentation, and four-viewport UI smoke coverage.

---

# Memento Agent 0.7.4 - Agent 进程操作 / Agent Process Actions

## 简体中文

`0.7.4` 补齐了从概览进程询问 AI 到结束进程的确认操作，并优化了 Top 5 饼图。

### 主要变化

- **Agent 进程操作：** 询问具体进程后，Agent 结果显示“退出进程”和“强制退出进程”两个需要确认的操作，不再把进程问题误配成应用打开或卸载。
- **主进程复核：** 进程操作使用实时 PID、所有者和命令路径重新校验，系统进程和其他用户进程不会注册为可执行操作。
- **饼图：** CPU 和内存 Top 5 饼图尺寸增大，移除图形内部的 TOP 文案。

## English

`0.7.4` completes the focused process workflow from Ask AI to confirmed termination and improves the Top 5 charts.

### Highlights

- **Agent process actions:** Asking about a specific process now renders separate confirmable Quit process and Force quit process actions instead of unrelated application Open or Uninstall actions.
- **Main-process revalidation:** Process operations recheck the live PID, owner, and command path; system and other-user processes never become executable operations.
- **Pie charts:** CPU and memory Top 5 charts are larger and no longer place a TOP label inside the graphic.

---

# Memento Agent 0.7.3 - 稳定进程交互 / Stable Process Interaction

## 简体中文

`0.7.3` 解决了实时刷新导致进程行和操作菜单移动的问题。

### 主要变化

- **稳定操作目标：** 鼠标或键盘焦点进入高占用进程列表后，暂存当前进程顺序和数据；刷新继续更新页面其他状态，但不会移动当前操作入口。离开列表后恢复实时数据。
- **回归覆盖：** 四视口 UI 冒烟测试验证操作菜单跨刷新周期保持打开。

## English

`0.7.3` fixes process rows and action menus moving while live monitoring refreshes.

### Highlights

- **Stable targets:** When the pointer or keyboard focus enters the high-usage process panel, the current process order and values are held while the rest of the Overview keeps refreshing. Live process data resumes when focus leaves the panel.
- **Regression coverage:** Four-viewport UI smoke coverage keeps an action menu open across a refresh interval.

---

# Memento Agent 0.7.2 - 进程监控 / Process Monitoring

## 简体中文

`0.7.2` 扩展了概览中的高占用进程工作流，让用户可以比较资源占用、了解进程并在安全边界内处理自己的进程。

### 主要变化

- **排序与图表：** 高占用进程支持按名称、CPU、内存排序，并新增 CPU 和内存 Top 5 饼图。
- **进程操作：** 可询问 AI、复制进程名称或 PID；非系统进程可选择退出或强制退出。主进程会在执行前重新读取 PID、所有者和命令路径，系统进程与其他用户进程保持保护。
- **回归覆盖：** demo、preload、真实 Electron 和四视口 UI 冒烟测试覆盖了新增进程界面。

## English

`0.7.2` extends Overview's high-usage process workflow so users can compare resource use, understand a process, and act on their own processes within a protected boundary.

### Highlights

- **Sorting and charts:** Sort high-usage processes by name, CPU, or memory and view CPU and memory Top 5 pie charts.
- **Process actions:** Ask AI, copy a process name or PID, and gracefully or force-quit non-system processes. The main process re-reads the PID, owner, and command path before execution; system and other-user processes remain protected.
- **Regression coverage:** Demo, preload, real Electron, and four-viewport UI smoke tests cover the new process surface.

---

# Memento Agent 0.7.1 - 确定性清理 / Deterministic Cleanup

## 简体中文

`0.7.1` 把“信任重置”落实到新的 macOS 主界面与清理闭环：规则负责发现和执行，AI 只在用户需要时解释结果。

### 主要变化

- **四个主模块：** 主导航收敛为“概览、清理、应用管理、磁盘分析”。概览显示实时硬件和进程指标，磁盘容量浏览不再混入清理规则列表。
- **规则优先：** 扫描与执行共用一个规则注册表，明确标记系统、应用、浏览器、开发工具、日志和设备分类；规则路径、最低体积、风险和是否可执行不再分散维护。
- **覆盖更完整：** 增加浏览器、Electron 应用、Python、Go、Rust、Android、Maven、Xcode、AI 客户端和系统诊断规则；完整测量合格应用缓存，并发现第三方 Sandbox 与 Group Container 中受限的缓存目录。
- **安全批量清理：** 安全项默认选择但仍需一次确认；需要确认项由用户主动选择；规则外弱线索不能执行。批量操作只移除实际成功的结果，失败项保留供检查。
- **AI 锦上添花：** AI 只作为每个清理项的解释入口，不参与规则匹配、空间统计、默认选择或执行授权。
- **执行保护：** 动态目标仅允许固定层级的缓存或临时目录，Apple 与凭据类容器受保护，目录本身及其祖先中的符号链接都会被拒绝。
- **实机结果：** 当前开发 Mac 的可信可释放空间由约 26.1 GB 提升到 44.6 GB，完整扫描仍约 9 秒。

## English

`0.7.1` carries the trust reset into the primary macOS workspace and cleanup loop: rules own discovery and execution, while AI explains findings only when requested.

### Highlights

- **Four primary modules:** Navigation is centered on Overview, Cleanup, Applications, and Disk analysis. Overview shows live hardware and process metrics, while disk-capacity browsing remains separate from cleanup rules.
- **Rules first:** Discovery and execution share one registry with explicit System, Applications, Browsers, Developer, Logs, and Devices categories. Paths, thresholds, risk, and action eligibility no longer drift between scanners and executors.
- **Broader measured coverage:** Adds browser, Electron app, Python, Go, Rust, Android, Maven, Xcode, AI-client, and system-diagnostic rules; measures every eligible application cache and bounded third-party Sandbox/Group Container cache folder.
- **Safe batch cleanup:** Safe items are preselected but still require confirmation. Review items are opt-in and weak outside-rule clues are not executable. Batch reconciliation removes only operations that actually succeed.
- **AI as enhancement:** AI remains a per-item explanation action and does not control rule matching, size estimates, default selection, or execution authorization.
- **Execution protection:** Dynamic targets are limited to exact cache or temporary-directory depths. Apple and credential identities are protected, and targets with symbolic-link ancestors are rejected.
- **Real-device result:** Trusted reclaimable coverage increased from about 26.1 GB to 44.6 GB on the development Mac while the complete scan remained around nine seconds.

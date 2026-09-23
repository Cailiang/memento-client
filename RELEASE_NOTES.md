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

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

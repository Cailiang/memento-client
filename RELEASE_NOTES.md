# Memento Agent 0.7.0 - 信任重置 / Trust Reset

## 简体中文

`0.7.0` 重新定义 Memento 第一次打开时如何表达本机状态：确定性体检是基础能力，AI 是按需使用的解释与计划层，弱证据不会被包装成系统问题。

### 主要变化

- **健康、空间、线索分开：** 首页独立展示系统状态、安全可释放空间、可行动问题和审查线索。仅凭年龄和身份未匹配得到的隐藏目录不会扣健康分，也不会计入安全可释放空间。
- **Finding 信任合同：** 每个候选显式包含 `confidence`、稳定 `reasonCodes` 和 `estimateQuality`。存储页拆为“可信建议”“审查线索”和“磁盘浏览”。
- **无模型首次体验：** 应用启动后直接完成本机体检；不配置 Provider 也能查看可信结果、确认直接操作，并在历史中审计。
- **统一维护账本：** SQLite schema v4 记录直接操作、应用卸载、磁盘删除、终端优化与恢复、Agent 计划的逐项结果、恢复入口和稳定错误码。删除历史只删除审计记录。
- **可诊断扫描：** 扫描结果提供系统、服务、存储、应用、终端和总耗时；模块失败使用稳定诊断码，避免只能解析本地化文案。
- **反馈与安全：** 新增私密漏洞报告、安全政策、贡献指南、Bug 表单和保护隐私的误报模板。
- **macOS 正式发布：** GitHub Release 只发布 Intel/Apple Silicon 的签名、公证 macOS 包和更新载荷，共 8 个资产；校验清单只包含 2 个 DMG。Windows/Linux 仅作为内部 CI 可移植性产物。

## English

`0.7.0` resets how Memento communicates trust on first launch: deterministic health inspection is the product baseline, AI is an optional explanation and planning layer, and weak evidence is no longer presented as a system problem.

### Highlights

- **Health, space, and clues are separate:** System status, safely reclaimable space, actionable findings, and review clues are independent. Age-only unmatched directories do not reduce health or increase safe reclaimable space.
- **Explicit finding trust:** Every candidate carries `confidence`, stable `reasonCodes`, and `estimateQuality`. Storage now has Trusted findings, Review clues, and Disk browser modes.
- **Provider-free first run:** Memento opens on Health. Trusted review, confirmed direct execution, and audit history work without configuring a model.
- **Unified maintenance ledger:** SQLite schema v4 records per-operation results, stable errors, and recovery availability for direct actions, app removal, disk Trash, terminal fixes/restores, and Agent plans. Deleting history removes records only.
- **Diagnosable scans:** Results include system, service, storage, application, terminal, and total timings plus stable module diagnostic codes.
- **Security and feedback:** Adds private vulnerability reporting, a security policy, contribution guidance, bug reporting, and a privacy-conscious false-positive form.
- **macOS public distribution:** GitHub Releases now contain only signed and notarized Intel/Apple Silicon macOS packages and updater payloads: eight assets with two DMG checksums. Windows/Linux builds remain internal CI portability artifacts.

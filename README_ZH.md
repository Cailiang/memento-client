# Memento Agent

[![Release](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)

Memento 是一款本地桌面系统维护 Agent。它把确定性的设备检查、清理工具与用户自行配置的模型结合起来：模型可以解释扫描结果并准备操作计划，但 Memento 只会执行经过用户检查和确认的已注册操作。

[English](README.md) | [最新版本](https://github.com/Cailiang/memento-client/releases/latest)

## 主要功能

- **Agent：** 用自然语言描述维护目标，查看结构化结果，检查建议计划，并验证执行结果。
- **概览：** 在一个安静的实时工作台中查看健康度、CPU、GPU、内存、电池、磁盘、网络和高占用进程。
- **清理：** 按系统、应用、浏览器、开发工具、日志和设备分类扫描可重建数据；安全项默认选择，确认项和规则外线索独立展示。
- **应用管理：** 查看已安装应用及其元数据，打开或忽略应用，确认后把支持卸载的应用移到废纸篓。
- **磁盘分析：** 逐层浏览磁盘占用，通过经过校验的不透明节点操作打开目录、请求 AI 解释或移到废纸篓。
- **历史记录：** 用统一的本机维护账本审计直接操作、Agent 计划、磁盘删除、终端优化和恢复；Agent 对话保留在独立标签页。
- **设置：** 管理模型供应商、后台自动更新、窗口行为、忽略项、主题和语言。

## 安全边界

Memento 不会向模型提供通用 Shell 或不受限制的文件系统访问能力。

1. 确定性扫描器生成当前设备快照，并注册只对该快照有效的操作。
2. 只读 Agent 工具仅提供精简的扫描结果和不透明操作 ID。
3. 模型准备结构化结果或计划时，只能选择扫描中实际存在的 ID。
4. 用户选择计划项，并在高风险操作确认框中明确确认。
5. Electron 主进程在执行前重新校验每个操作，执行后再验证实际结果。

每个扫描候选都显式携带置信度、稳定 reason code 和估算质量。弱归属线索不会降低系统健康分、增加安全可释放空间或影响侧栏数量。确定性扫描与直接清理不依赖模型；只有用户要求解释或生成计划时才使用 AI。

被忽略的存储项、服务和应用会同时离开扫描结果、可执行操作和 Agent 上下文。API 密钥始终留在主进程，不会返回给渲染层，也不会进入模型提示词。

## 平台支持

| 平台 | 支持状态 |
| --- | --- |
| macOS | 正式支持扫描、分析、清理、签名安装包和自动更新 |
| Windows / Linux | 只保留内部 CI 可移植性构建，不公开发布，也不承诺系统维护能力 |

## 快速开始

环境要求：

- 使用 macOS 执行设备扫描和清理
- Node.js 22.13 或更高版本
- npm

```bash
npm ci
npm run dev
```

应用启动后直接进入本机概览。概览、规则扫描、分类选择、批量确认清理和维护账本都不需要模型。只有需要解释某个清理项或生成计划时，才在**设置**中配置 OpenAI、Anthropic、Google Gemini、DeepSeek、Grok/xAI、Antigravity 或自定义 OpenAI 兼容地址。

首次执行本机配置扫描时，Memento 会读取 `~/.claude`、`~/.codex`、`~/.gemini` 和 `~/.grok` 中的 API 配置，并通过供应商的只读模型列表校验密钥、服务地址和指定模型。损坏、不完整、认证失败、只有 OAuth、使用不受支持会话令牌或模型不可用的配置会被过滤；再次扫描也会移除先前错误导入且仍未通过校验的本机配置。Memento 不要求安装 CC Switch，也不会自动读取它；“导入 CC Switch”是需要用户主动触发的可选操作，同样会执行连接校验，并在再次导入时移除已失效或已从 CC Switch 删除的旧导入。

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run electron:smoke
npm run audit:runtime
```

先在一个终端启动 Web 开发服务器：

```bash
npm run dev:web -- --port 4174
```

保持服务器运行，再在另一个终端执行浏览器 UI 冒烟测试：

```bash
npm run ui:smoke -- http://127.0.0.1:4174
```

`npm run audit:runtime` 只检查随应用分发的依赖；需要同时检查开发和打包依赖时，使用 `npm run audit`。

## 本地数据

Memento 使用 Electron 应用数据目录中的本地 SQLite 数据库保存设置、供应商、会话、计划、工具调用和统一维护账本。恢复引用和私有路径只保存在本机，不会通过历史列表 IPC 返回。API 密钥使用 AES-256-GCM 加密，独立的本地主密钥使用受限文件权限保存。

这项设计用于避免密钥意外出现在渲染层、数据库、提示词和日志中，但不声称能够抵御可同时读取完整应用数据目录与进程内存的攻击者。

## 项目文档

- [本地 Agent 架构与开发](docs/LOCAL_AGENT_DEVELOPMENT.md)
- [发布流程](docs/RELEASING.md)
- [安全策略](SECURITY.md)
- [参与贡献](CONTRIBUTING.md)
- [更新记录](CHANGELOG.md)
- [当前版本说明](RELEASE_NOTES.md)

## 安装包

推送匹配的 `v*` 标签后，`Release` GitHub Actions 工作流会生成以下安装包：

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| macOS | Intel x64、Apple Silicon arm64 | DMG |

Memento 每小时自动检查更新。发现新版本后会在后台下载，下载完成后在侧边栏版本号旁显示“更新”按钮；点击后直接安装并重启，不再弹出单独的更新提示。

每个 GitHub Release 包含 2 个 DMG、2 个已签名应用的更新 ZIP、2 个 blockmap、`latest-mac.yml` 和 `SHA256SUMS.txt`，共 8 个资产；校验清单严格只包含 2 个 DMG。Windows/Linux 构建只作为临时 GitHub Actions 可移植性产物，不进入公开 Release。macOS 安装包会使用项目 Developer ID Application 证书签名，经 Apple 公证并装订票据后再上传。

## 许可证

[MIT](LICENSE)

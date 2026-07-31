# Memento Agent

[![Release](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)

Memento 是一款本地桌面系统维护 Agent。它把确定性的设备检查、清理工具与用户自行配置的模型结合起来：模型可以解释扫描结果并准备操作计划，但 Memento 只会执行经过用户检查和确认的已注册操作。

[English](README.md) | [最新版本](https://github.com/Cailiang/memento-client/releases/latest)

## 主要功能

- **Agent：** 用自然语言描述维护目标，查看结构化结果，检查建议计划，并验证执行结果。
- **电脑体检：** 查看存储建议和磁盘占用，检查后台服务，并诊断终端启动问题。
- **应用管理：** 查看已安装应用及其元数据，打开或忽略应用，确认后把支持卸载的应用移到废纸篓。
- **任务记录：** 重新打开、搜索和删除保存在本机的 Agent 任务及工具调用记录。
- **设置：** 管理模型供应商、软件更新、窗口行为、忽略项、主题和语言。

## 安全边界

Memento 不会向模型提供通用 Shell 或不受限制的文件系统访问能力。

1. 确定性扫描器生成当前设备快照，并注册只对该快照有效的操作。
2. 只读 Agent 工具仅提供精简的扫描结果和不透明操作 ID。
3. 模型准备结构化结果或计划时，只能选择扫描中实际存在的 ID。
4. 用户选择计划项，并在高风险操作确认框中明确确认。
5. Electron 主进程在执行前重新校验每个操作，执行后再验证实际结果。

被忽略的存储项、服务和应用会同时离开扫描结果、可执行操作和 Agent 上下文。API 密钥始终留在主进程，不会返回给渲染层，也不会进入模型提示词。

## 平台支持

| 平台 | 支持状态 |
| --- | --- |
| macOS | 完整支持扫描、分析、清理和打包 |
| Windows | 提供桌面安装包用于可移植性验证，不支持 macOS 系统维护能力 |
| Linux | 提供桌面安装包用于可移植性验证，不支持 macOS 系统维护能力 |

## 快速开始

环境要求：

- 使用 macOS 执行设备扫描和清理
- Node.js 22.13 或更高版本
- npm

```bash
npm ci
npm run dev
```

应用启动后，在**设置**中配置模型供应商。当前支持 OpenAI 兼容接口、OpenAI、Anthropic、Antigravity 和 Google Gemini。Memento 也可以从本机 CC Switch 导入受支持的 Claude、Codex 和 Gemini 配置。

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

Memento 使用 Electron 应用数据目录中的本地 SQLite 数据库保存设置、供应商、会话、计划和工具调用记录。API 密钥使用 AES-256-GCM 加密，独立的本地主密钥使用受限文件权限保存。

这项设计用于避免密钥意外出现在渲染层、数据库、提示词和日志中，但不声称能够抵御可同时读取完整应用数据目录与进程内存的攻击者。

## 项目文档

- [本地 Agent 架构与开发](docs/LOCAL_AGENT_DEVELOPMENT.md)
- [发布流程](docs/RELEASING.md)
- [更新记录](CHANGELOG.md)
- [当前版本说明](RELEASE_NOTES.md)

## 安装包

推送匹配的 `v*` 标签后，`Release` GitHub Actions 工作流会生成以下安装包：

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| macOS | Intel x64、Apple Silicon arm64 | DMG |
| Windows | x64、arm64 | NSIS EXE |
| Linux | x64、arm64 | AppImage、DEB |

每个 GitHub Release 包含 8 个平台安装包和 `SHA256SUMS.txt`。macOS 安装包会完成 ad-hoc 签名，确保 Apple Silicon 能够校验应用包；在配置项目自有的 Apple 凭据前，安装包仍没有 Developer ID 签名和公证。首次启动时可能仍需右键选择“打开”，或前往“系统设置 > 隐私与安全性”手动允许。

## 许可证

[MIT](LICENSE)

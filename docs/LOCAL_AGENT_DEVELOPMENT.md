# Memento 本地 Agent 开发设计

状态：架构选型与交互原型已确认，等待分阶段实现
目标分支：`agent`
最后更新：2026-07-29
适用范围：Electron 客户端、本地 Agent、多模型 Provider、SQLite 配置与运行记录

## 1. 架构决策

Memento 将废弃依赖 AI 服务端的分析架构，改为在 Electron 主进程中运行本地 Agent。

已确认的技术决策：

1. Agent SDK 采用开源的 [Vercel AI SDK](https://github.com/vercel/ai)，许可证为 Apache-2.0。
2. Agent 运行循环使用 AI SDK 的 `ToolLoopAgent`，不使用 Vercel AI Gateway。
3. 模型请求由 Electron Main Process 直接发送到用户配置的 Provider。
4. OpenAI-compatible 服务使用 [`@ai-sdk/openai-compatible`](https://github.com/vercel/ai/tree/main/packages/openai-compatible)，支持自定义 Base URL、API Key、Headers 和模型名称。
5. 对不兼容 OpenAI 协议的厂商，按需增加 AI SDK 官方 Provider 包，例如 `@ai-sdk/anthropic` 和 `@ai-sdk/google`。
6. 用户配置、Agent 会话、执行记录和未来的软件配置统一存储到 SQLite。
7. API Key 使用 AES-256-GCM 加密后存入 SQLite，运行时在主进程解密；不使用系统 Keychain。
8. Agent 只能通过 Memento 注册的结构化工具控制电脑，Renderer 和模型都不能直接提交任意本机路径。

### 1.1 选型依据

Vercel AI SDK 满足本项目的核心要求：

- TypeScript 原生，适合现有 Electron + React 技术栈。
- 使用统一接口连接 OpenAI、Anthropic、Google 和 OpenAI-compatible Provider。
- 支持流式输出、结构化数据、工具调用和多轮工具循环。
- Provider 层与 Agent 工具层解耦，便于更换厂商而不重写本机能力。
- `createOpenAICompatible()` 原生接受 `baseURL`、`apiKey` 和自定义 Headers。
- SDK 只负责模型通信与工具循环，本机扫描和清理仍由 Memento 自己实现。

没有选择完整 Agent 平台的原因是：Memento 不需要独立 Agent 服务、云端部署、多 Agent 编排平台或托管可观测服务。桌面维护工具更需要较小的依赖面和可审计的本地工具执行。

### 1.2 运行时前置条件

截至 2026-07-29，当前项目使用 Electron 33.4.11，内置 Node.js 20.18.3；最新 AI SDK 7 要求 Node.js 22 或更高版本。

正式接入前必须：

1. 将 Electron 升级到内置 Node.js 22 或更高版本的稳定版本。
2. 验证 `electron-vite`、`electron-builder`、x64/arm64 构建和现有扫描功能。
3. 固定 AI SDK 与 Provider 包版本，避免不同 Provider 协议版本漂移。
4. 在 Electron Main Process 中验证流式请求、取消请求和工具调用。

不为兼容旧 Electron 而采用过期的 AI SDK 主版本。

## 2. 总体架构

```text
Electron Renderer
  对话、任务进度、操作预览、确认、历史记录、设置
                         |
                         | typed IPC
                         v
Electron Main Process
  LocalAgentRuntime
    |- Vercel AI SDK / ToolLoopAgent
    |- ProviderRegistry
    |- ToolRegistry
    |- PermissionPolicy
    |- RunStore
    `- VerificationService
          |                    |
          | HTTPS             | local calls
          v                    v
  User-configured model   Scanner / Cleanup / Apps / Services / Terminal
                         |
                         v
                  SQLite + encrypted secrets
```

### 2.1 进程边界

- Renderer 只负责展示状态和收集用户意图。
- Main Process 持有数据库、解密密钥、Provider 客户端和工具执行权。
- Renderer 只能提交 Provider ID、Agent Run ID、Tool Call ID 和用户确认结果。
- Main Process 根据 ID 从数据库和内存中恢复真实参数。
- 模型输出必须经过 Zod Schema 校验后才能进入工具调用流程。

### 2.2 废弃范围

新架构完成后删除：

- Memento Server / AI Gateway 连接模式。
- Hosted 登录、OAuth、设备绑定、配额和 Gateway Token。
- `MEMENTO_GATEWAY_URL` 及 Gateway 冒烟示例。
- 为远端服务设计的 Preview ID 和 Hosted 请求协议。
- 仅返回建议、不能继续执行的旧 AI 分析流程。

迁移完成前，旧实现和新实现不得同时出现在正式 UI 中。

## 3. Provider 设计

### 3.1 最小配置

每个 Provider 至少包含：

```ts
interface AiProviderConfig {
  id: string
  name: string
  protocol: 'openai-compatible' | 'anthropic' | 'google'
  baseUrl: string
  model: string
  encryptedApiKey: EncryptedSecret
  enabled: boolean
}
```

页面主要让用户填写 Base URL 和 API Key。连接成功后优先自动读取模型列表；无法读取时再显示模型名称输入框。

### 3.2 Provider Registry

```text
openai-compatible -> createOpenAICompatible({ baseURL, apiKey, headers })
anthropic         -> createAnthropic({ baseURL, apiKey })
google            -> createGoogleGenerativeAI({ baseURL, apiKey })
```

首个版本优先实现 OpenAI-compatible，覆盖 OpenAI 兼容代理、本地服务和多数第三方厂商。原生 Anthropic、Google 协议按真实用户需求增加。

连接测试必须分别验证：

- Base URL 可访问。
- API Key 有效。
- 配置模型存在。
- 模型能够流式输出。
- 模型支持工具调用。
- 工具参数能够通过 Schema 校验。

“连接成功”不能只测试普通文本聊天。

## 4. SQLite 与配置存储

SQLite 仅在 Electron Main Process 中打开，推荐使用 `better-sqlite3`。所有 Schema 变化必须通过有版本号的迁移完成。

第一阶段数据表：

```text
schema_migrations  数据库版本
app_settings       主题、语言、扫描和交互设置
ai_providers       Provider、URL、模型、加密 API Key
agent_sessions     用户会话
agent_messages     用户和 Agent 的可展示消息
agent_runs         一次任务的状态、时间和结果
tool_calls         工具参数摘要、确认状态和执行结果
action_backups     可撤销操作的备份索引
```

### 4.1 API Key 加密

采用简单、跨平台、不依赖系统授权的本地加密方案：

1. 首次启动生成 32 字节随机 Master Key。
2. Master Key 保存在应用数据目录的独立文件中，文件权限设置为 `0600`。
3. 每次保存 API Key 都生成新的 12 字节随机 IV。
4. 使用 AES-256-GCM 加密。
5. SQLite 保存算法版本、IV、Auth Tag 和 Ciphertext。
6. Main Process 发起模型请求前解密，明文不发送到 Renderer、不写日志、不进入 Agent 上下文。

该方案用于避免数据库内容和普通配置文件直接暴露密钥，不以抵御已经能够完整读取用户应用数据目录的本机攻击者为目标。

## 5. 本地 Agent Runtime

`LocalAgentRuntime` 负责：

- 创建和恢复 Agent Run。
- 从 Provider Registry 获取 AI SDK 模型。
- 向 `ToolLoopAgent` 注册当前任务允许使用的工具。
- 将工具调用写入 SQLite。
- 暂停需要确认的操作。
- 接收用户确认后恢复执行。
- 取消正在进行的模型请求或工具执行。
- 工具完成后重新扫描并验证实际结果。
- 生成面向用户的完成摘要。

Agent 页面不展示模型的隐藏推理过程，只展示真实状态：

```text
preparing -> analyzing -> plan_ready -> awaiting_confirmation
          -> executing -> verifying -> completed
                                  `-> failed / cancelled
```

### 5.1 工具设计原则

模型不直接调用通用 `run_shell(command)`。优先提供职责明确的工具：

- `get_system_snapshot`
- `scan_storage`
- `inspect_storage_item`
- `list_applications`
- `inspect_application`
- `open_application`
- `uninstall_application`
- `list_background_services`
- `inspect_background_service`
- `stop_background_service`
- `remove_startup_item`
- `analyze_terminal_startup`
- `apply_terminal_fix`
- `restore_last_change`

每个工具必须定义：

- Zod 输入和输出 Schema。
- 可访问的目标范围。
- 风险等级。
- 是否需要用户确认。
- 是否可撤销。
- 超时和取消策略。
- 执行后的验证方法。

## 6. 已确认的页面与交互基准

Memento Agent 的正式界面必须严格按照
[`prototypes/memento-agent/index.html`](../../prototypes/memento-agent/index.html)
实现。该原型是页面结构、界面文案、信息密度与交互方式的唯一基准；需要调整时先更新并确认原型，再修改正式应用。

当前已确认：

1. Agent 是主要工作入口，基础体检、存储空间、后台服务、应用清理和终端管理仍保留清晰的独立入口。
2. 用户用自然语言提出目标，Agent 展示真实分析、确认、执行和验证状态；不提供含义模糊的“加入计划”操作。
3. 设置允许保存并管理多个模型供应商，用户可分别配置 URL、请求密钥和模型。
4. 设置页只保留模型供应商、窗口行为、忽略列表和外观等有效配置，不提供没有实际作用的“Agent 行为”开关。
5. 后台服务和存储空间直接在列表行展示有效信息与操作；没有新增信息时不打开冗余详情页。
6. 后台服务和存储空间可从行内更多菜单加入忽略列表。忽略前必须确认，忽略后立即从结果、可执行工具和 Agent 上下文中移除。
7. 设置页集中管理忽略列表，按存储空间和后台服务分类，并可通过“恢复检测”重新扫描。
8. 页面保持紧凑、安静、易扫描，并覆盖窄窗口布局、键盘操作、明确焦点和减少动态效果偏好。

## 6.1 开发与交付约束

每次代码或 UI 修改都必须升级补丁版本，并同步更新 `CHANGELOG.md` 与
`RELEASE_NOTES.md`。完成测试、类型检查、生产构建和扫描冒烟测试后，必须构建并验证本地 Intel x64 DMG、计算 SHA-256、提交代码，再把安装包路径和校验值交付给用户。不得等待用户再次提醒。

## 7. 第一阶段实施顺序

在功能和页面设计确认后，按以下顺序实施：

1. Electron 与构建工具升级。
2. SQLite、迁移机制和加密字段。
3. Provider 设置、模型发现和工具调用能力测试。
4. LocalAgentRuntime 和只读工具。
5. Agent 对话、流式状态和任务历史页面。
6. 操作预览、确认、执行、取消和重新验证。
7. 迁移现有确定性清理工具。
8. 删除旧 Gateway、Hosted 和旧 AI Analysis 实现。
9. 跨平台打包、回归测试和发布迁移。

## 8. 验收底线

- 没有配置 Provider 时，基础扫描和手动清理仍可使用。
- Provider 配置和 API Key 不离开用户电脑，模型请求除外。
- API Key 明文不出现在 SQLite、Renderer、日志、错误消息和 Agent 上下文中。
- Agent 调用的每个本机工具都有结构化记录。
- 需要确认的工具在用户确认前不能执行。
- 清理完成必须根据重新扫描结果报告实际变化。
- 模型中断、应用退出或网络失败后，运行状态可以恢复或明确终止。
- Provider 可以更换而不影响工具实现和历史数据。

# Memento AI 分析功能开发设计

状态：AI Analysis MVP implemented
目标版本：AI Analysis MVP
最后更新：2026-07-24
适用范围：macOS Electron 客户端、可选官方 AI Gateway、本地模型与 BYOK Provider

## 1. 文档目的

本文档定义 Memento 如何在不破坏现有安全边界的前提下增加 AI 分析能力。当前实现允许用户按需解读终端启动诊断、后台服务和存储候选项，但基础扫描、风险分级和清理操作仍然可以完全离线运行。

本文档是后续实现、评审和验收的共同依据，覆盖：

- 产品边界与默认行为
- 客户端和服务端架构
- 本地脱敏和数据最小化
- AI Provider 抽象
- 本地模型、BYOK 和官方托管服务
- 登录、Token、设备绑定、配额与成本控制
- AI 输入输出协议
- 操作安全边界
- 测试、监控和分阶段交付计划

## 2. 核心决策

Memento 采用“离线核心 + 可选 AI”的混合架构。

1. 扫描、计时、规则判断、风险分级和清理不依赖 AI。
2. AI 只解释终端诊断、后台服务和存储候选项，不直接修改配置、停止服务或清理文件。
3. 默认不上传 `.zshrc`、环境变量值、主机名、用户名或完整路径。
4. AI 只能基于脱敏后的结构化报告生成建议。
5. AI 返回值不能修改 `ScanCandidate.risk`、`CandidateAction` 或主进程动作白名单。
6. 官方 AI 服务必须登录并受配额限制，客户端不包含任何服务端模型密钥。
7. 开源客户端同时支持本地模型和 BYOK，官方服务不是程序可用性的前置条件。
8. AI Provider 协议公开，允许社区实现自托管 Provider。

## 3. 目标与非目标

### 3.1 MVP 目标

- 在终端诊断页提供“AI 深度分析”入口。
- 在后台服务和存储项目详情中提供按需分析入口。
- 使用独立“AI 设置”页面统一管理 Gateway、Ollama 和 BYOK。
- 支持 `disabled`、`local`、`byok`、`hosted` 四种模式。
- 将当前 `TerminalFinding` 转换为稳定、脱敏的 AI 报告协议。
- 支持 OpenAI-compatible BYOK Provider。
- 支持本机 Ollama Provider。
- 定义并实现官方 Gateway 的鉴权、额度和业务接口。
- AI 输出必须是结构化 JSON，并经过客户端二次校验。
- 用户调用前可以查看将发送的数据。
- 网络失败、额度耗尽或模型异常时，规则诊断仍正常工作。

### 3.2 MVP 非目标

- AI 自动删除缓存、停止服务或卸载应用。
- AI 自动写入 `.zshrc`、`.zprofile` 或其他启动文件。
- 上传完整 shell 配置进行无边界聊天。
- 将官方 Gateway 暴露为通用模型代理。
- 使用设备指纹替代用户登录。
- 依赖代码混淆、CORS 或客户端密钥保护官方服务。
- 在第一阶段分析任意用户文件或项目源代码。

### 3.3 后续可选目标

- 生成可审阅的配置修改 diff。
- 对修改后的配置运行 `zsh -n` 静态检查。
- 创建本地备份并允许一键恢复。
- 对应用残留进行跨候选项关联分析。
- 使用 `zprof` 和逐插件二分测试提供更精确的耗时归因。

## 4. 设计原则

### 4.1 确定性逻辑优先

能由系统 API、真实计时或规则可靠得到的结论，不交给模型猜测。例如：

- 进程是否正在运行
- 文件占用空间
- Bundle ID 是否重复
- shell 启动中位数
- 配置中是否存在 `compinit`
- 某个清理动作是否进入废纸篓

AI 负责解释这些事实之间的关系，并生成便于用户理解的处理顺序。

### 4.2 最小权限

- Renderer 不直接访问文件系统或模型服务。
- AI 网络请求由 Electron Main Process 发起。
- Provider API Key 只由 Main Process 读取和使用。
- Hosted Token 和 Provider API Key 保存在仅当前系统用户可读的本地配置文件中，不访问系统钥匙串。
- AI 输出不进入 `registeredActions`。

### 4.3 数据最小化

只发送模型完成当前任务所需的字段。能发送枚举和计数时，不发送原始文本；能发送 `~/.zshrc:86` 时，不发送绝对用户目录；能发送规则代码时，不发送整行配置。

### 4.4 可解释与可撤销

每条 AI 建议必须包含：

- 建议标题
- 依据的 finding ID
- 置信度
- 风险级别
- 用户需要做什么
- 是否可能改变 shell 行为

终端配置自动修改必须使用内置规则、展示结构化变更摘要、创建备份、通过语法检查并由用户确认；不得显示可能含密钥的配置原文。

## 5. 当前系统基线

当前应用已经具备以下安全基础：

- `src/main/scanner.ts` 在主进程执行只读扫描。
- `src/shared/types.ts` 定义 Renderer 可见的结构化数据。
- `src/main/index.ts` 使用一次性扫描 ID 建立动作白名单。
- Renderer 只能提交候选项 ID，不能提交任意路径。
- 可恢复文件清理使用 `shell.trashItem`；存储清理仅对本地扫描注册的严格白名单目标执行永久删除，并检查原路径已经消失。
- 终端自动优化只接受本地扫描注册的确定性规则，写入前校验文件哈希与 zsh 语法，并为撤销保留备份。
- BrowserWindow 启用 `contextIsolation` 和 Chromium sandbox。

AI 功能必须沿用相同模式：Renderer 只提交“分析哪个扫描结果”和“使用哪个已配置 Provider”，Main Process 从内存中的扫描结果构建请求。

Renderer 不得自行组装可包含任意文本的 Hosted 请求。

## 6. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron Renderer                                           │
│ 设置、分析进度、后台任务、结构化建议                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ typed IPC
┌──────────────────────────▼──────────────────────────────────┐
│ Electron Main Process                                       │
│ Scan Store -> Normalizer -> Redactor -> Provider Router      │
│              Output Validator -> AI Result Store             │
│              Secure Credential Store                         │
└───────────────┬──────────────────┬──────────────────────────┘
                │                  │
        loopback only          HTTPS only
                │                  │
┌───────────────▼───────┐  ┌──────▼───────────────────────────┐
│ Ollama / Local Model  │  │ BYOK Provider or Official Gateway│
└───────────────────────┘  └──────────────────────────────────┘
                                      │
                         Official Gateway only
                                      │
                            ┌─────────▼─────────┐
                            │ Model Provider     │
                            │ server-side key    │
                            └────────────────────┘
```

### 6.1 信任边界

| 边界 | 信任级别 | 允许内容 |
|---|---|---|
| Renderer | 不可信 UI | Provider ID、扫描 ID、用户发起分析 |
| Main Process | 本地可信 | 原始扫描结果、本地凭据、Provider 请求 |
| Local Provider | 用户选择后可信 | 脱敏报告，可按设置允许更多本地内容 |
| BYOK Provider | 外部服务 | 脱敏报告，不发送本地凭据 |
| Official Gateway | 受控服务 | 脱敏报告、账号与额度信息 |
| Model Provider | 第三方处理方 | Gateway 再次过滤后的提示词 |

## 7. AI 模式

```ts
export type AiMode = 'disabled' | 'local' | 'byok' | 'hosted'

export interface AiSettings {
  mode: AiMode
  providerId?: string
  model?: string
  allowRawConfig: false
  showDataPreview: true
}
```

### 7.1 Disabled

- 默认模式。
- 不加载模型 SDK。
- 不发送网络请求。
- 规则诊断完整可用。

### 7.2 Local

- MVP 支持 Ollama。
- 默认地址固定为 `http://127.0.0.1:11434`。
- 第一阶段只允许 loopback 地址，避免配置项被滥用为 SSRF 代理。
- 模型列表通过 Ollama 本地 API 获取。
- 没有可用模型时显示安装或拉取提示，不自动下载模型。

### 7.3 BYOK

- 用户输入自己的 Provider API Key。
- Key 以普通配置形式存储在应用配置目录，文件权限限制为仅当前系统用户可读写，内容不写入日志。
- 请求由 Main Process 直接发送到已内置的 Provider 域名。
- MVP 不允许用户设置任意 Base URL。自定义地址放到高级设置，并限制为 HTTPS。
- 删除 Provider 配置时同时删除本地凭据和最近的 Provider 错误信息。

### 7.4 Hosted

- 使用系统浏览器完成 OAuth + PKCE 登录。
- 客户端只持有短期 Access Token 和轮换 Refresh Token。
- 官方 Gateway 持有实际模型 Provider Key。
- 服务端按账号、设备、IP、并发和月度预算限制调用。
- Hosted 模式是便利功能，不是应用核心能力。

## 8. 终端 AI 分析数据流

```text
用户点击 AI 深度分析
  -> Renderer 调用 ai:prepare-terminal-analysis(scanId)
  -> Main Process 检查 scanId 是否为当前扫描
  -> 从内存 ScanResult 生成 NormalizedTerminalReport
  -> 本地 Redactor 脱敏
  -> 返回内部 DataPreview 句柄给 Renderer
  -> Renderer 立即调用 ai:analyze-terminal(previewId, providerId)
  -> Main Process 校验 previewId、过期时间和内容哈希
  -> Provider Router 调用对应 Provider
  -> 验证模型 JSON Schema
  -> 丢弃未知字段和无效 evidence ID
  -> 保存本地 AI 结果
  -> Renderer 展示建议
```

### 8.1 为什么分两次 IPC

准备和发送在内部保持两次 IPC，但对用户表现为一次点击：

1. Renderer 无法在准备后替换请求内容。
2. `previewId` 绑定规范化报告哈希、Provider 和过期时间。
3. Main Process 可以在真正发送前再次验证当前扫描和 Provider。
4. 用户点击具体项目的“问 AI”即表示发起这一次分析，不再增加第二次确认。

`previewId` 建议 5 分钟后过期。重新扫描会立即使所有旧 preview 失效。

### 8.2 后台服务与存储候选项数据流

Renderer 只提交 `scanId + candidateId`。Main Process 从当前内存扫描中定位候选项，并生成 `NormalizedCandidateReport`：保留候选项名称、闭集类别、本地规则风险、状态、大小、年龄、已注册操作种类和少量布尔事实；排除完整路径、原始 evidence、描述文案、操作目标和文件内容。

服务场景使用固定 prompt 识别用途，并区分停止当前进程、取消自动启动和移除关联软件的影响。存储场景使用另一套固定 prompt 判断缓存、构建产物、应用数据或虚拟磁盘的可重建性与清理后果。两者的 evidence ID 固定为匿名 `candidate`，AI 结果仍不能进入 `registeredActions`。

## 9. 客户端模块设计

建议新增目录：

```text
src/
  main/
    ai/
      ai-service.ts
      ai-result-store.ts
      preview-store.ts
      normalize-terminal.ts
      redact.ts
      validate-output.ts
      providers/
        provider.ts
        ollama-provider.ts
        openai-compatible-provider.ts
        hosted-provider.ts
      auth/
        hosted-auth.ts
        token-store.ts
        pkce.ts
      credentials/
        secure-store.ts
  shared/
    ai-types.ts
    ai-errors.ts
    ai-schema.ts
  renderer/src/
    ai/
      AiSettings.tsx
      AiDataPreview.tsx
      AiAnalysisPanel.tsx
      AiSuggestionRow.tsx
```

### 9.1 Main Process 服务职责

`AiService` 负责：

- 校验当前 scanId
- 规范化扫描结果
- 调用脱敏器
- 管理 preview 生命周期
- 选择 Provider
- 验证输出
- 返回可展示结果

`AiService` 不负责：

- 修改扫描候选项风险等级
- 创建或执行清理动作
- 直接修改 shell 配置
- 保存原始 `.zshrc` 内容

### 9.2 IPC 设计

```ts
export interface MementoAiApi {
  getSettings(): Promise<PublicAiSettings>
  updateSettings(input: UpdateAiSettingsInput): Promise<PublicAiSettings>
  testProvider(providerId: string): Promise<ProviderHealth>
  prepareTerminalAnalysis(scanId: string): Promise<AiDataPreview>
  analyzeTerminal(input: {
    previewId: string
    providerId: string
  }): Promise<AiTerminalAnalysis>
  cancelAnalysis(requestId: string): Promise<void>
  getHostedSession(): Promise<HostedSessionState>
  startHostedLogin(): Promise<HostedLoginState>
  logoutHosted(): Promise<void>
}
```

IPC 参数必须通过 Zod 或等价 schema 验证。不得接受：

- 任意文件路径
- 任意 system prompt
- 任意 Provider URL
- 任意模型参数对象
- Renderer 提供的完整扫描报告

## 10. 扫描协议扩展

当前 `TerminalFinding` 以展示文本为主。AI 协议需要稳定的机器代码，避免模型依赖中文文案。

建议扩展：

```ts
export type TerminalFindingCode =
  | 'shell_startup_slow'
  | 'shell_config_cost_high'
  | 'shell_measurement_timeout'
  | 'nvm_eager_load'
  | 'pyenv_eager_init'
  | 'conda_eager_init'
  | 'ruby_manager_eager_init'
  | 'compinit_detected'
  | 'network_call_during_startup'
  | 'shell_file_large'
  | 'path_missing_entries'
  | 'path_duplicate_entries'

export interface TerminalFinding {
  id: string
  code: TerminalFindingCode
  title: string
  detail: string
  severity: 'good' | 'notice' | 'slow'
  durationMs?: number
  source?: string
  recommendation?: string
  attributes?: Record<string, string | number | boolean>
}
```

展示文本仍由本地规则生成。AI 输入主要使用 `code`、`severity`、`durationMs` 和经过白名单过滤的 `attributes`。

## 11. AI 输入协议

### 11.1 NormalizedTerminalReport

```ts
export interface NormalizedTerminalReport {
  schemaVersion: 1
  reportId: string
  generatedAt: string
  platform: {
    os: 'macos'
    osMajorVersion: number
    architecture: 'arm64' | 'x64' | 'unknown'
  }
  shell: {
    family: 'zsh' | 'bash' | 'fish' | 'other'
    version?: string
    baselineMs: number | null
    startupMs: number | null
    configCostMs: number | null
    sampleCount: number
  }
  findings: Array<{
    id: string
    code: TerminalFindingCode
    severity: 'good' | 'notice' | 'slow'
    durationMs?: number
    source: SanitizedSource | null
    attributes: Record<string, string | number | boolean>
  }>
  configFiles: Array<{
    logicalPath: '~/.zshrc' | '~/.zprofile' | '~/.zshenv' | '~/.zlogin'
    exists: boolean
    lineCount?: number
    sizeBytes?: number
  }>
  privacy: {
    rawConfigIncluded: false
    redactionVersion: string
    removedFieldCount: number
  }
}

export interface SanitizedSource {
  logicalPath?: string
  line?: number
  kind: 'shell-config' | 'environment' | 'measurement' | 'unknown'
}
```

### 11.2 明确禁止的字段

MVP 请求中不得出现：

- `SystemSnapshot.hostname`
- 用户目录绝对路径
- 环境变量的值
- shell 配置完整行内容
- SSH host、用户名或私钥路径
- Git remote
- 浏览器 Cookie
- API Key、Access Token、Refresh Token
- 进程完整命令行参数

### 11.3 数据预览

`AiDataPreview` 应包含用户可理解的摘要，而不是只显示 JSON：

```ts
export interface AiDataPreview {
  previewId: string
  expiresAt: string
  providerId: string | null
  summary: {
    findingCount: number
    configFileCount: number
    includesRawConfig: false
    approximateInputTokens: number
  }
  payload: NormalizedTerminalReport
}
```

首个版本可以默认展开 JSON，并在上方明确显示“不会发送配置原文和环境变量值”。

## 12. 本地脱敏管线

脱敏必须发生在 Main Process，并且早于任何 Provider 调用和网络日志。

```text
ScanResult
  -> Allowlist Normalization
  -> Path Canonicalization
  -> Secret Detection
  -> Identifier Pseudonymization
  -> Size and Token Limit
  -> Final Schema Validation
  -> Data Preview
```

### 12.1 Allowlist Normalization

只从已知字段构建新对象，不使用对象展开复制整个 `ScanResult`。任何新增扫描字段都不会自动进入 AI 请求。

### 12.2 路径处理

- `$HOME/.zshrc` 转为 `~/.zshrc`。
- 非白名单路径只保留文件扩展名和逻辑类型。
- 不发送 `/Users/<name>`。
- 行号可以保留，因为它有助于用户定位。

### 12.3 Secret 检测

即使 MVP 不发送原始配置，也要实现通用 Redactor，为后续 diff 功能做准备。至少检测：

- `Authorization: Bearer ...`
- 常见 `*_TOKEN`、`*_SECRET`、`*_PASSWORD`、`*_KEY`
- PEM private key block
- GitHub、AWS、Google、Slack 等常见 Token 前缀
- URL 中的 `user:password@host`
- 长度大于阈值的高熵字符串

替换格式：

```text
[REDACTED:api-token]
[REDACTED:private-key]
[REDACTED:credential-url]
```

不得把命中的秘密写入调试日志。

### 12.4 服务端二次脱敏

Official Gateway 在调用模型前重复执行一套独立脱敏规则。服务端二次脱敏是纵深防御，不能取代客户端脱敏。

### 12.5 脱敏测试样本

测试必须包含专门构造的 canary secret。测试失败时不允许发布 AI 功能。

## 13. AI 输出协议

模型必须返回结构化 JSON。MVP 不接受自由文本作为最终协议。

```ts
export type AiSuggestionRisk = 'informational' | 'review' | 'behavior-change'

export interface AiTerminalAnalysis {
  schemaVersion: 1
  requestId: string
  generatedAt: string
  provider: {
    id: string
    model: string
  }
  summary: {
    diagnosis: string
    expectedPriority: 'low' | 'medium' | 'high'
  }
  suggestions: Array<{
    id: string
    title: string
    explanation: string
    evidenceFindingIds: string[]
    confidence: number
    risk: AiSuggestionRisk
    action: {
      kind: 'explain-only' | 'show-manual-steps'
      steps?: string[]
    }
  }>
  limitations: string[]
}
```

### 13.1 输出校验规则

- `schemaVersion` 必须等于客户端支持的版本。
- 建议最多 8 条。
- `confidence` 必须在 0 到 1 之间。
- 每个 evidence ID 必须存在于输入报告。
- 不允许出现 `execute`、`delete`、任意路径或 shell 命令字段。
- 文本字段设置最大长度。
- 未知字段一律丢弃。
- 校验失败时最多重试一次格式修复，仍失败则返回 `AI_INVALID_OUTPUT`。

### 13.2 AI 不得覆盖规则结论

AI 结果单独存储和展示。不得执行以下赋值：

```ts
candidate.risk = aiSuggestion.risk
candidate.action = aiGeneratedAction
registeredActions.set(aiSuggestion.id, ...)
```

规则扫描结果和 AI 建议在 UI 中必须使用不同视觉标签。

## 14. Provider 抽象

```ts
export interface AiProvider {
  readonly id: string
  readonly kind: 'local' | 'byok' | 'hosted'

  health(signal?: AbortSignal): Promise<ProviderHealth>

  analyzeTerminal(
    report: NormalizedTerminalReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis>
}

export interface AiRequestContext {
  requestId: string
  locale: 'zh-CN' | 'en-US'
  maxOutputTokens: number
}

export interface ProviderHealth {
  available: boolean
  authenticated: boolean
  models?: string[]
  errorCode?: AiErrorCode
}
```

Provider 必须实现统一的超时、取消和错误映射。

建议默认值：

- 连接超时：5 秒
- 总请求超时：60 秒
- 最大输入：64 KiB
- 最大预估输入 Token：12,000
- 最大输出 Token：2,000
- 同一用户并发分析：4（由 Gateway 配置）

这些值属于初始工程默认值，应支持服务端配置调整。

## 15. Local Provider

### 15.1 Ollama

MVP 接口：

- `GET http://127.0.0.1:11434/api/tags`
- `POST http://127.0.0.1:11434/api/chat`

约束：

- 只允许 `127.0.0.1`、`::1` 和 `localhost`。
- 禁止自动跟随到非 loopback 重定向。
- 只发送结构化报告。
- Provider 不可用时不自动切换到 Hosted，避免用户在不知情时上传数据。
- 本地模型输出也必须经过相同 JSON Schema 校验。

### 15.2 本地模型能力提示

小模型可能无法稳定输出符合 schema 的结果。UI 应显示模型兼容状态：

- 已验证
- 可以尝试
- 输出格式不兼容

兼容性来自本地 smoke test，不是模型名称硬编码。

## 16. BYOK Provider

### 16.1 MVP Provider

第一阶段实现 OpenAI-compatible 协议。后续通过独立 Adapter 支持其他供应商，避免在业务代码中判断 Provider 品牌。

### 16.2 密钥存储

```text
用户输入 Key
  -> Renderer 通过一次性 IPC 提交
  -> Main Process 写入独立的 AI 凭据配置
  -> ai-credentials.json 以当前用户权限落盘
  -> Renderer 只获得 keyPresent: true
```

限制：

- IPC 响应不得返回 Key。
- 日志不得记录请求 Header。
- 错误信息不得包含 Provider 原始响应 Header。
- UI 只显示 Key 后四位，后四位单独保存，不需要解密 Key。
- 不调用 Electron `safeStorage` 或系统钥匙串；能读取应用数据目录的同一系统用户也能读取凭据。

### 16.3 网络目的地

内置 Provider 使用固定 HTTPS Origin。高级自定义 Base URL 默认关闭。启用时：

- 只允许 HTTPS。
- 禁止 loopback、link-local、RFC1918 和云元数据 IP，除非明确选择 Local Provider。
- DNS 解析后再次检查目标地址。
- 禁止跨 Origin 重定向。

## 17. Official AI Gateway

### 17.1 推荐技术栈

当前实现采用：

- Go 1.24+
- Gin
- Go 结构体与严格 JSON 解码
- MySQL 8.0+
- 进程内分钟级限流与 MySQL 幂等记录
- 结构化请求日志

Gateway 位于同一仓库的 `memento-server`，与 `memento-client` 独立构建和部署。多副本部署前应将分钟级限流迁移到 Redis 或 Valkey，并接入 OpenTelemetry。

### 17.2 Gateway 不是什么

Gateway 不是通用 `/chat/completions` 反向代理。它只暴露 Memento 业务接口，模型、system prompt、最大 Token 和输出 schema 都由服务器决定。

### 17.3 API 路由

| Method | Path | Auth | 用途 |
|---|---|---|---|
| `GET` | `/v1/health` | No | 服务健康检查 |
| `GET` | `/v1/session` | Yes | 当前用户、套餐和剩余额度 |
| `POST` | `/v1/auth/pkce/start` | No | 创建登录事务 |
| `POST` | `/v1/auth/pkce/exchange` | No | 用授权码交换 Token |
| `POST` | `/v1/auth/refresh` | Refresh | 轮换 Token |
| `POST` | `/v1/auth/logout` | Yes | 撤销 Refresh Token |
| `POST` | `/v1/devices/register` | Yes | 注册设备公钥，可选强化 |
| `POST` | `/v1/analysis/terminal` | Yes | 终端结构化分析 |
| `POST` | `/v1/analysis/candidate` | Yes | 后台服务或存储候选项分析 |
| `GET` | `/v1/usage` | Yes | 当前配额与用量 |

### 17.4 请求示例

```http
POST /v1/analysis/terminal HTTP/1.1
Authorization: Bearer <short-lived-access-token>
Content-Type: application/json
Idempotency-Key: 2f21f3d8-...
X-Memento-Client-Version: 0.4.0

{
  "schemaVersion": 1,
  "report": {
    "schemaVersion": 1,
    "reportId": "local-random-id",
    "platform": {
      "os": "macos",
      "osMajorVersion": 15,
      "architecture": "arm64"
    },
    "shell": {
      "family": "zsh",
      "baselineMs": 34,
      "startupMs": 504,
      "configCostMs": 470,
      "sampleCount": 3
    },
    "findings": []
  }
}
```

### 17.5 认证流程

推荐使用系统浏览器的 Authorization Code + PKCE：

1. 客户端生成 `code_verifier` 和 `code_challenge`。
2. Main Process 打开系统浏览器。
3. OAuth Provider 完成登录并回调 Gateway。
4. Gateway 通过自定义 URL Scheme 或 loopback callback 将一次性授权码交给客户端。
5. 客户端使用授权码和 `code_verifier` 交换 Token。
6. Gateway 返回短期 Access Token 和一次性 Refresh Token。

OAuth Client ID 可以公开。OAuth Client Secret、模型 Key 和 Refresh Token 哈希只存在服务端。

建议 Token 策略：

- Access Token 有效期 10 分钟。
- Refresh Token 每次使用后轮换。
- 服务端只保存 Refresh Token 哈希。
- 检测到旧 Refresh Token 重放时撤销整个 Token Family。
- Logout 撤销当前设备 Token Family。

时间属于建议初始值，可通过服务端配置调整。

### 17.6 设备绑定

设备绑定用于降低 Token 被复制后的滥用，不用于取代账号鉴权。

可选强化方案（当前客户端不实现，以避免请求钥匙串授权）：

1. 客户端生成 P-256 密钥对。
2. 私钥交由操作系统安全存储保存，并明确向用户说明授权原因。
3. 公钥注册到 Gateway。
4. 每个请求附带类似 DPoP 的签名证明，包含 method、URL、时间、随机 ID 和 Access Token 哈希。
5. Gateway 检查时间窗口、nonce 和重放缓存。

这不能阻止已登录用户自行编写兼容客户端。服务的最终保护仍然依赖账号权限、配额、限流和成本上限。

### 17.7 Gateway 请求处理顺序

```text
TLS termination
  -> Request size limit
  -> Access Token validation
  -> Optional device proof validation
  -> Account and entitlement check
  -> Account / device / IP rate limit
  -> Idempotency lookup
  -> JSON Schema validation
  -> Server-side redaction
  -> Token budget estimate
  -> Model request
  -> Structured output validation
  -> Usage ledger commit
  -> Response
```

### 17.8 数据库最小模型

`users`

- `id`
- `created_at`
- `status`

`oauth_identities`

- `user_id`
- `provider`
- `provider_subject`
- 唯一索引 `(provider, provider_subject)`

`entitlements`

- `user_id`
- `plan`
- `analysis_limit_daily`
- `analysis_limit_monthly`
- `valid_until`

`devices`

- `id`
- `user_id`
- `public_key_jwk`
- `created_at`
- `last_seen_at`
- `revoked_at`

`refresh_tokens`

- `id`
- `user_id`
- `device_id`
- `token_family_id`
- `token_hash`
- `expires_at`
- `rotated_at`
- `revoked_at`

`usage_ledger`

- `id`
- `user_id`
- `device_id`
- `request_id`
- `operation`
- `provider`
- `model`
- `input_tokens`
- `output_tokens`
- `estimated_cost_micros`
- `created_at`

默认不建立保存完整 Prompt 或完整扫描报告的表。

## 18. 配额与成本控制

官方服务上线前必须具备以下限制：

- 每账号每日次数
- 每账号每月次数或 Token
- 每设备并发数
- 每 IP 短时间请求速率
- 单请求最大输入字节
- 单请求最大输入和输出 Token
- 单账号月度成本硬上限
- 全局每日和月度成本熔断
- Provider 错误率熔断

建议的 MVP 初始配置：

| 配置 | 初始值 |
|---|---:|
| Free 每日分析 | 3 次 |
| Free 每月分析 | 30 次 |
| 单账号并发 | 4 |
| 单设备每分钟 | 5 次 |
| 单 IP 每分钟 | 30 次 |
| 请求体 | 64 KiB |
| 输入 Token | 12,000 |
| 输出 Token | 2,000 |

这些是成本保护默认值，不是产品承诺，应保存在服务端配置中。

### 18.1 幂等

客户端每次调用生成 `Idempotency-Key`。Gateway 在短期内缓存同一用户和同一 Key 的结果，避免网络重试重复扣费。

### 18.2 缓存

第一阶段不缓存跨用户的完整 AI 结果。未来可以按“规则代码集合 + 量化耗时区间 + prompt 版本”缓存通用解释，但不得把原始路径或用户标识放入缓存键。

## 19. Prompt 与模型编排

### 19.1 Prompt 版本化

所有 system prompt 必须有版本，例如 `terminal-analysis-v1`。Gateway 记录 prompt 版本，但不记录用户原始报告。

### 19.2 System Prompt 约束

Prompt 至少要求模型：

- 只基于输入证据给出结论。
- 不声称已经执行任何命令。
- 不建议直接永久删除文件。
- 不要求上传秘密或完整环境变量。
- 不编造耗时数据。
- 不输出未在 schema 中定义的字段。
- 无足够证据时写入 `limitations`。
- 建议修改 shell 行为时将风险标为 `behavior-change`。

### 19.3 模型选择

客户端不直接选择 Hosted 模型。Gateway 根据操作、用户套餐、输入大小和服务健康决定模型。这样可以：

- 防止用户把 Gateway 当成任意昂贵模型代理。
- 统一 prompt 和 schema 能力。
- 在模型升级时不要求客户端升级。
- 实施成本路由和故障切换。

### 19.4 输出修复

模型输出 schema 失败时允许一次修复请求，只发送验证错误和原始模型输出，不重新发送用户报告。第二次仍失败则终止，不循环重试。

## 20. 安全执行边界

### 20.1 MVP

AI 建议只能是：

- 解释原因
- 给出手动步骤
- 指向本地 finding 和配置行号

不能：

- 调用 `runActions`
- 添加 `RegisteredAction`
- 执行 shell 命令
- 写入文件
- 自动停止服务

### 20.2 后续 diff 模式

未来允许 AI 生成 diff 时，使用独立协议：

```ts
export interface ProposedConfigPatch {
  target: '~/.zshrc' | '~/.zprofile' | '~/.zshenv' | '~/.zlogin'
  baseContentHash: string
  unifiedDiff: string
  explanation: string
  risk: 'review' | 'behavior-change'
}
```

应用流程：

1. Main Process 检查目标在固定白名单内。
2. 检查当前文件 hash 等于 `baseContentHash`。
3. 在 UI 展示完整 diff。
4. 用户明确确认。
5. 创建带时间戳的本地备份。
6. 将 diff 应用到临时文件。
7. 运行 `/bin/zsh -n <temp-file>`。
8. 原子替换目标文件。
9. 保留恢复入口。

即使支持 diff，模型也不能提供任意目标路径。

## 21. 产品交互

### 21.1 首次使用

侧栏提供独立“AI 设置”。调试版本首次运行默认选择 Memento Server，并连接 `http://127.0.0.1:8787`；开发 Gateway 返回一次性授权码时，客户端自动完成 PKCE 会话。用户仍可切换为：

- 本地 Ollama
- 使用自己的 API Key
- 登录官方服务
- 关闭 AI

实际分析必须从终端、后台服务或存储项目的上下文入口发起。点击“问 AI”后立即开始，用户不需要查看请求体、Token 预估或再次确认。

### 21.2 一键分析与数据边界

界面只显示项目名称与分析状态，不展示 Provider 请求体、字段清单或 Token 用量。主进程仍必须在后台完成：

- 从当前扫描按字段白名单重新构建报告
- 路径和敏感内容脱敏
- 输入 schema、大小和请求完整性校验
- Provider 与当前配置一致性校验

分析采用应用级异步任务。用户可以关闭详情或继续浏览其他项目；任务面板持续显示原项目名称，完成结果保留到用户查看或关闭。

### 21.3 分析结果

结果区域包括：

- 一句话诊断
- 建议优先级
- 建议列表
- 每条建议的证据链接
- 置信度
- 行为改变风险
- 模型局限性
- Provider 和模型标识

AI 建议不得使用“安全”“可以直接删除”等词替代现有规则风险标签。

### 21.4 状态机

```ts
export type AiAnalysisState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'analyzing'; requestId: string }
  | { status: 'succeeded'; analysis: AiTerminalAnalysis }
  | { status: 'failed'; error: PublicAiError }
  | { status: 'cancelled' }
```

分析状态由应用级任务存储按 `scanId + candidateId` 保存。关闭详情、切换页面或查看其他项目不会取消正在执行的请求，重新打开原项目时继续显示进度或结果；用户显式取消时才使用 `AbortController` 传播到 Provider。AI 结果仍不会自动转为清理动作。

## 22. 错误模型

```ts
export type AiErrorCode =
  | 'AI_DISABLED'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_AUTH_REQUIRED'
  | 'AI_AUTH_EXPIRED'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RATE_LIMITED'
  | 'AI_INPUT_TOO_LARGE'
  | 'AI_PREVIEW_EXPIRED'
  | 'AI_SCAN_CHANGED'
  | 'AI_REQUEST_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_REDACTION_FAILED'
  | 'AI_CANCELLED'
  | 'AI_INTERNAL_ERROR'

export interface PublicAiError {
  code: AiErrorCode
  message: string
  retryable: boolean
  retryAfterSeconds?: number
}
```

客户端不得直接展示 Provider 原始错误，因为其中可能包含请求 ID、内部 URL 或 Header。详细错误只写入本地脱敏日志。

## 23. 隐私与数据保留

### 23.1 客户端

- 默认只保留最近一次 AI 结果。
- 用户可以清除所有 AI 设置、Token 和历史结果。
- AI 历史不进入系统扫描日志。
- 崩溃报告不附加 AI payload。

### 23.2 Official Gateway

默认保留：

- 账号 ID
- 请求时间
- 操作类型
- 模型和 Token 用量
- 错误代码
- 成本

默认不保留：

- 完整结构化报告
- 完整 prompt
- 完整模型输出
- shell 配置内容
- 用户主机名和绝对路径

如需临时采样排查模型质量，必须：

- 明确用户 opt-in
- 独立加密存储
- 设置短期 TTL
- 限制内部访问
- 支持删除请求

## 24. 威胁模型

| 威胁 | 处理方式 | 剩余风险 |
|---|---|---|
| 从开源客户端提取服务密钥 | 客户端不包含服务端密钥 | 无法阻止合法用户自行实现客户端 |
| 匿名滥用 Gateway | 登录、配额、限流 | 批量注册账号仍需风控 |
| Access Token 被复制 | 短期 Token、Refresh 轮换、可选设备证明 | 本机被完全控制时仍可能泄露 |
| Refresh Token 重放 | Token Family 重放检测与撤销 | 离线攻击取决于本地应用数据目录的访问权限 |
| BYOK Key 泄露到日志 | Main Process 使用、日志过滤、错误包装 | 调试工具或恶意本机进程仍可能读取内存 |
| 上传 shell secret | Allowlist、双重脱敏、数据预览 | 未知格式可能绕过模式规则，因此 MVP 不上传原文 |
| Prompt injection | 不上传任意配置文本，固定 schema | 后续 raw config 模式需要额外隔离 |
| AI 建议危险操作 | 输出 schema、只读建议、不能进入动作白名单 | 用户仍可能手动执行建议，需要清晰风险说明 |
| Gateway 被当成通用代理 | 固定业务路由、固定模型和 prompt | 攻击者可能构造边界输入，需要 schema 和 Token 上限 |
| SSRF | Provider Origin 白名单、地址解析检查 | DNS rebinding 需要连接阶段再次校验 |
| 重试造成重复扣费 | Idempotency-Key | Provider 在超时后实际完成仍需用量对账 |

明确无效的保护手段：

- 把共享 API Key 写入 Electron 环境变量
- 混淆客户端 JavaScript
- 只检查 User-Agent
- 只依赖 CORS
- 把固定 HMAC Key 放进应用包
- 隐藏 Gateway URL
- 使用不可撤销的机器指纹

## 25. 日志与可观测性

### 25.1 客户端日志

允许：

- requestId
- Provider ID
- 开始和结束时间
- 输入字节数
- 输出 schema 是否通过
- 标准化错误代码

禁止：

- API Key 或 Token
- Authorization Header
- 完整输入 payload
- 完整模型原始输出
- 配置原文

### 25.2 Gateway 指标

- 请求量、成功率和 P50/P95 延迟
- Auth、quota、rate-limit 拒绝量
- Provider 错误率
- schema 校验失败率
- 输入和输出 Token
- 单用户和全局成本
- 脱敏命中数量，不记录命中原文

### 25.3 初始 SLO

- Gateway 月可用性目标：99.5%
- 非流式分析 P95 小于 30 秒
- 账本记录和 Provider 用量差异可追踪
- 配额系统故障时 fail closed，不允许无限调用

## 26. 测试策略

### 26.1 单元测试

- `normalize-terminal` 只输出白名单字段。
- 路径转换不泄露用户目录。
- Redactor 覆盖每类 secret 和高熵字符串。
- Provider 输出 schema 校验。
- 非法 evidence ID 被删除。
- Preview 过期和 scanId 变化。
- Token 加密存储和删除。
- 错误映射不包含 Provider 原始 Header。

### 26.2 Provider 合约测试

所有 Provider 共享一套测试：

- 健康检查成功和失败
- 超时
- 取消
- HTTP 401、429、500
- 非 JSON 输出
- schema 缺字段
- 超长输出
- 正常结构化结果

### 26.3 Gateway 集成测试

- PKCE 登录交换
- Refresh Token 轮换
- 旧 Refresh Token 重放撤销
- 额度耗尽
- 并发限制
- Idempotency-Key 重试
- 请求体和 Token 上限
- 服务端二次脱敏
- Provider 故障熔断
- Usage Ledger 记录

### 26.4 安全测试

- 在 payload 中放入 canary API Key，断言 Provider Mock 未收到。
- 尝试通过 Renderer IPC 传入自定义路径和 system prompt。
- 尝试把 Provider URL 指向云元数据服务。
- 尝试使用已撤销设备 Token。
- 检查日志中不存在 canary secret。
- 检查 AI 结果不能出现在 `registeredActions`。

### 26.5 UI 测试

- 四种模式设置流程。
- 一键分析、后台任务与取消。
- 多个完成结果可以按原项目名称逐项返回或关闭。
- 分析 loading、error、empty 和 success 状态。
- 额度耗尽和登录过期。
- 窄窗口无文本遮挡。
- AI 服务失败时规则建议仍可操作。

## 27. 仓库结构建议

第一阶段保持同一工作区内的客户端与服务端双目录：

```text
memento/
  memento-client/              Electron + React client
    src/main/ai/
    src/shared/ai-types.ts
    docs/
  memento-server/              Gin + MySQL Gateway
    cmd/server/
    internal/
      auth/
      analysis/
      httpapi/
      model/
    configs/
```

客户端与 Gateway 通过 schema v1 JSON 协议解耦。Electron IPC 类型保留在客户端，数据库模型只保留在 Gateway。

## 28. 环境变量

Gateway 建议变量：

```text
MYSQL_DSN=
JWT_SECRET=
OIDC_AUTHORIZE_URL=
OIDC_TOKEN_URL=
OIDC_USERINFO_URL=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_CALLBACK_URL=
MODEL_PROVIDER_BASE_URL=
MODEL_PROVIDER_API_KEY=
MODEL_DEFAULT_TERMINAL_ANALYSIS=
```

规则：

- `.env` 不提交仓库。
- 生产密钥由云 Secret Manager 注入。
- 当前 MVP 使用高强度服务端 JWT Secret；生产密钥由 Secret Manager 注入并定期轮换。
- 客户端仓库和构建流水线不接触 `MODEL_PROVIDER_API_KEY`。

## 29. 分阶段实施计划

### Phase 0：协议与脱敏基础

任务：

- 为 `TerminalFinding` 增加稳定 `code` 和白名单 attributes。
- 新建 `src/shared/ai-types.ts`。
- 实现 `normalize-terminal.ts`。
- 实现路径处理和 Redactor。
- 实现 `AiDataPreview` 和 preview store。
- 为 canary secret 建立测试集。

验收：

- 对任意当前 `ScanResult` 可以生成 schema v1 报告。
- 报告不包含 hostname、绝对 HOME、环境变量值和配置原文。
- 新增扫描字段不会自动进入报告。
- 全部脱敏测试通过。

### Phase 1：Local + BYOK Terminal AI

任务：

- 实现 Provider interface。
- 实现 Ollama Provider。
- 实现 OpenAI-compatible BYOK Provider。
- 实现独立的本地 credential store，不访问系统钥匙串。
- 增加 IPC、设置页、一键分析和分析结果 UI。
- 实现输出 schema 校验、取消和统一错误。

验收：

- 没有网络时规则诊断不受影响。
- Ollama 和 BYOK 至少各通过一套合约测试。
- Renderer 无法读取 Provider Key。
- AI 结果不能触发任何清理动作。
- 外部调用前用户可以看到完整脱敏 payload。

### Phase 2：Official Gateway MVP

任务：

- 创建 Gin Gateway。
- 实现 OAuth + PKCE。
- 实现 Access Token、Refresh Token 轮换和退出。
- 实现 `/v1/analysis/terminal`。
- 实现 `/v1/analysis/candidate` 及服务、存储专用 prompt。
- 实现 MySQL usage ledger 与幂等记录。
- 实现进程内分钟级限流，并为多副本 Redis/Valkey 迁移保留边界。
- 实现额度与全局成本熔断。
- 实现 OpenTelemetry 指标。

验收：

- 未登录请求无法调用模型。
- 客户端和 Gateway 都不包含对方的秘密。
- 重复请求不会重复扣费。
- 超额请求在调用模型之前被拒绝。
- Gateway 不保存完整报告。
- Provider Key 只存在服务端 Secret Manager。

### Phase 3：设备绑定与服务强化

任务：

- 注册设备公钥。
- 增加请求 proof 和重放缓存。
- 增加异常账号和 IP 风控。
- 增加 Token Family 重放告警。
- 增加 Provider 熔断与备用模型策略。

验收：

- 复制 Access Token 到未注册设备后不能使用受保护接口。
- nonce 重放被拒绝。
- 设备可以在账号页面撤销。

### Phase 4：可审阅配置 diff

任务：

- 实现独立 patch schema。
- 实现目标文件白名单和 hash 绑定。
- 实现 diff UI、备份、`zsh -n` 和恢复。
- 建立 shell 行为回归测试。

验收：

- 没有用户确认不能写文件。
- 文件在分析后变化会拒绝应用旧 patch。
- 语法检查失败不会覆盖原文件。
- 每次修改都可以从 UI 恢复。

## 30. 第一轮开发任务顺序

建议下一步严格按以下顺序实施：

1. 扩展 `TerminalFinding.code`，补齐当前规则的稳定代码。
2. 编写 `NormalizedTerminalReport` Zod schema。
3. 实现 allowlist normalizer。
4. 实现 Redactor 和 canary 测试。
5. 实现 preview store 与两阶段 IPC。
6. 在终端页面增加一键分析的 loading、error 和 result UI。
7. 定义 Provider 合约测试。
8. 实现 Ollama Provider。
9. 实现 BYOK secure store 和 OpenAI-compatible Provider。
10. 完成 Phase 1 验收后再创建官方 Gateway。

这样可以先证明隐私协议和用户体验，再承担账号系统和托管成本。

## 31. Definition of Done

AI Contextual Analysis 完成必须同时满足：

- 基础扫描和清理完全不依赖 AI。
- 调试版本默认连接本机 Memento Server，连接失败时本地扫描仍完整可用。
- AI 只能从具体项目的上下文入口由用户点击发起，不存在自动上传。
- MVP 不上传 shell 配置原文。
- 候选项分析不上传完整路径、原始 evidence、文件内容或清理目标。
- Provider Key 和 Refresh Token 不暴露给 Renderer。
- AI 输入通过 allowlist 构建并通过 schema 校验。
- AI 输出通过 schema 校验，引用的 evidence ID 都真实存在。
- AI 输出不能进入清理动作白名单。
- Local、BYOK、Hosted 失败都不会影响规则诊断。
- Redactor canary 测试、Provider 合约测试和 UI 状态测试通过。
- Official Gateway 有账号鉴权、配额、限流、幂等和全局成本熔断。
- 日志和遥测不包含 secret、配置原文或完整 AI payload。
- README 和隐私说明同步更新。

## 32. 待确认但不阻塞 Phase 0 的决策

以下选择在开发 Gateway 前确认即可：

- 官方登录使用 GitHub、Apple、邮箱还是统一 OIDC。
- Hosted 免费额度和订阅策略。
- 正式模型供应商和数据保留条款。
- Gateway 部署平台和所在区域。
- 是否允许高级用户配置自托管 HTTPS Provider。
- 是否在官方服务中提供多语言输出。
- 是否开源 Gateway 全部代码，或只开源协议和基础自托管实现。

Phase 0 和 Phase 1 不依赖这些商业选择，可以立即开始。

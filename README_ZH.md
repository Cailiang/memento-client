# Memento Agent

Memento 是一款运行在 macOS 本机的系统维护 Agent。它把确定性的设备扫描、清理工具与用户自行配置的模型结合起来：模型可以读取结构化体检结果并准备具体计划，但只有用户明确确认后，Memento 才会执行已经注册并校验过的操作。

[English](README.md)

## 产品功能

应用已经按照确认过的交互原型 [`../prototypes/memento-agent/index.html`](../prototypes/memento-agent/index.html) 从头重建，包含五个工作区：

- **Agent：** 用自然语言描述目标，查看处理计划，勾选步骤，确认执行并复检结果。
- **电脑体检：** 直接查看存储空间、后台服务和终端启动问题，不为没有额外信息的项目打开冗余详情页。
- **应用管理：** 使用带真实 Logo 的网格浏览可管理 APP，查看最后使用时间和大小，打开 APP，或确认后移到废纸篓。系统受保护应用不会显示。
- **任务记录：** 查看保存在本机的 Agent 任务，并把可见记录导出为 JSON。
- **设置：** 管理多个模型供应商、窗口行为、忽略列表、界面主题和语言。

存储空间和后台服务可以从列表行的更多菜单加入忽略列表。忽略后，该项目会同时离开体检结果、可执行操作和 Agent 工具上下文，直到用户在设置中恢复检测。

## 本地 Agent

Memento 使用开源的 [Vercel AI SDK](https://github.com/vercel/ai) 和 `ToolLoopAgent`。应用不再依赖 Memento 服务端、Hosted 登录、AI Gateway 或软件方提供的请求密钥。

用户可以保存多个供应商并选择默认模型：

- OpenAI 兼容接口
- OpenAI
- Anthropic
- Google Gemini

每个配置包含名称、接口类型、服务地址、请求密钥和所选模型。地址和密钥可用后，Memento 会自动补全 API 基地址并获取模型列表；编辑已有配置时可以复用本地加密密钥。“测试连接”会真实验证模型访问与工具调用能力，而不是只检查普通文本回复。

## 执行边界

模型不会获得通用 Shell 工具，也不能直接执行清理。

1. 确定性扫描器为本次设备快照注册操作 ID。
2. Agent 只读工具返回精简的结构化发现和这些已注册 ID。
3. 模型只能用它实际看到的 ID 调用 `prepare_action_plan`。
4. 主进程会拒绝伪造、过期、空、超量或未确认的计划。
5. 用户在确认弹窗中检查并确认选中的步骤。
6. 现有清理注册表和终端修复注册表执行操作。
7. Memento 重新体检，并保存每个操作的真实结果。

## 本地数据

应用使用 Electron 自带的 `node:sqlite` 保存设置、模型供应商、Agent 任务和工具调用记录。API Key 使用 AES-256-GCM 加密；随机生成的 32 字节主密钥单独保存在权限为 `0600` 的文件中。

只有 Electron 主进程在创建模型请求时会解密密钥。明文密钥不会返回 Renderer、写入 SQLite、放进 Agent 上下文或进入日志。这是一套刻意保持简单的本地加密方案，不以抵御已经能够完整读取用户应用数据目录与进程内存的攻击者为目标。

## 本地开发

环境要求：

- 完整扫描、清理和 DMG 校验需要 macOS
- Node.js 22 或更高版本
- npm

```bash
npm install
npm run dev
```

常用验证命令：

```bash
npm test
npm run typecheck
npm run build
npm run scan:smoke
npm run dev:web -- --port 4174
npm run ui:smoke -- http://127.0.0.1:4174
```

UI 冒烟测试会在 `1440x900`、`1024x768`、`820x1180` 和 `390x844` 四种视口检查全部五个页面与横向溢出，并覆盖 Agent 计划、确认弹窗、体检标签页、应用筛选和供应商编辑器。

## 打包规则

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --x64
```

每次用户要求的代码或 UI 修改都必须升级补丁版本，同步更新 `CHANGELOG.md` 和 `RELEASE_NOTES.md`，完成全部验证，构建并挂载 Intel x64 DMG，确认安装包版本与架构，计算 SHA-256，最后提交源码。没有可用签名凭据时，本地安装包不会签名或公证。

实现细节见 [本地 Agent 开发文档](docs/LOCAL_AGENT_DEVELOPMENT.md)。

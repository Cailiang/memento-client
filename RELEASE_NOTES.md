# Memento Agent 0.6.56

## 简体中文

`0.6.56` 简化了模型供应商配置，并改为从已经配置好的本机 AI 工具中发现可用 API 配置。CC Switch 不再自动读取，只保留为可选导入。

### 主要变化

- 首次扫描 `~/.claude`、`~/.codex`、`~/.gemini` 和 `~/.grok`，只导入能够解析出有效密钥、服务地址和模型的配置。
- 自动过滤损坏、不完整、只有 OAuth 或使用不受支持会话令牌的配置；密钥仍只在主进程中完成校验与加密。
- CC Switch 改为用户主动点击的可选入口，没有安装 CC Switch 不影响本机配置发现。
- 普通设置只需选择供应商并填写密钥；协议与官方服务地址由 Memento 确定，推荐模型随应用版本维护。
- 模型选择、手动模型 ID 和自定义服务地址移入高级设置；已经保存的模型不会被模型发现或新推荐静默替换。
- 默认和删除操作显示完整文字及具体影响；删除前会确认，并明确不会修改第三方工具中的原始配置。

## English

`0.6.56` simplifies model-provider setup and discovers usable API configurations from AI tools already configured on the Mac. CC Switch is no longer read automatically and remains an optional import.

### Highlights

- Scans `~/.claude`, `~/.codex`, `~/.gemini`, and `~/.grok` on the first attempt, importing only configurations with a valid credential, endpoint, and model.
- Filters malformed, incomplete, OAuth-only, and unsupported session-token configurations. Credentials remain in the main process for validation and encryption.
- Makes CC Switch a user-initiated optional source; local discovery does not depend on CC Switch being installed.
- Keeps ordinary setup to a provider choice and API key. Memento determines official protocols and endpoints and maintains tested recommended models with app releases.
- Moves model selection, manual model IDs, and custom endpoints into Advanced settings. Saved models are never silently replaced by discovery or newer recommendations.
- Gives default and deletion actions explicit labels and consequences. Deletion requires confirmation and does not modify original third-party configurations.

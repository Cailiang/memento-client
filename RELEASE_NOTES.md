# Memento Agent 0.6.59

## 简体中文

`0.6.59` 将真实的只读连接校验扩展到用户主动触发的 CC Switch 导入，无法使用的供应商不再进入 Memento。

### 主要变化

- “导入 CC Switch”保持手动触发，不会在后台自动读取 CC Switch。
- 字段解析后会并行请求每个供应商的只读模型列表；密钥、服务地址和当前指定模型全部通过后才会导入。
- 认证失败、网络不可达、不支持模型列表或指定模型不存在的 Claude、Codex 与 Gemini 配置会被过滤，校验不会产生模型调用费用。
- 再次导入会移除校验失败或已从 CC Switch 删除的 `cc-switch-*` 配置；如果被移除的是默认供应商，会选择一个剩余配置继续作为默认。
- 设置页会反馈读取、新增或更新、过滤和移除数量，API 密钥不会进入渲染层或日志。
- 已在报告问题的本机 CC Switch 数据库做只读验证：7 个完整候选中 2 个通过，5 个无效配置被过滤。

## English

`0.6.59` extends real read-only connection validation to the user-initiated CC Switch import, preventing unusable suppliers from entering Memento.

### Highlights

- **Import CC Switch** remains explicitly user-triggered; Memento does not read CC Switch automatically.
- Requests every parsed supplier's read-only model catalog in parallel and imports it only when the credential, endpoint, and exact configured model all pass.
- Filters unauthorized, unreachable, unsupported-catalog, and unavailable-model Claude, Codex, and Gemini configurations without making a billed model-generation request.
- Removes invalid or deleted managed `cc-switch-*` entries on re-import and safely promotes a remaining provider when the removed entry was the default.
- Reports read, added or updated, rejected, and removed counts in Settings while keeping API keys out of the Renderer and logs.
- Verified read-only against the reported local CC Switch database: 2 of 7 complete candidates passed and 5 invalid configurations were filtered out.

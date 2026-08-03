# Memento Agent 0.6.58

## 简体中文

`0.6.58` 修复“扫描本机 AI 配置”把无法使用的 Claude、Gemini 等配置加入供应商列表的问题。配置现在必须通过真实的只读连接校验才能导入。

### 主要变化

- 字段解析后会并行请求供应商只读模型列表，校验密钥、服务地址以及当前指定模型是否真实可用。
- 认证失败、网络不可达、不支持模型列表或指定模型不存在的配置不会被导入，校验不会产生模型调用费用。
- 再次扫描会移除先前错误导入且仍未通过校验的 `local-config-*` 配置；如果它原本是默认供应商，会选择一个剩余配置继续作为默认。
- 现有安装升级后会对 0.6.56 曾经导入但没有连接验证的本机配置执行一次重新校验。
- 已在报告问题的本机环境验证：4 个来源中 Claude 与 Gemini 返回认证失败并被过滤，Codex 与 Grok 通过校验。

## English

`0.6.58` fixes Scan local AI configurations adding unusable Claude, Gemini, and other configurations to the provider list. A configuration must now pass a real read-only connection check before import.

### Highlights

- Requests each provider's read-only model catalog in parallel after parsing, validating the credential, endpoint, and exact configured model.
- Rejects unauthorized, unreachable, unsupported-catalog, and unavailable-model configurations without making a billed model-generation request.
- Removes previously imported `local-config-*` entries that still fail a rescan and safely promotes a remaining provider when the removed entry was the default.
- Revalidates the untested local configurations imported by version 0.6.56 once after an existing installation upgrades.
- Verified in the reported local environment: Claude and Gemini failed authentication and were filtered, while Codex and Grok passed.

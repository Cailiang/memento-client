# Memento Agent 0.6.24

## 简体中文

`0.6.24` 修复推理模型连接测试被错误判定为超时的问题，并与 `prototypes/memento-agent/index.html` 保持一致。

### 主要变化

- 完整工具调用测试允许 60 秒总耗时和单步 45 秒耗时，适配响应较慢的推理与编程模型。
- 第一步强制调用工具，第二步收到工具结果后只需正常回复，不再被错误地要求再次调用同一工具。
- 测试中会显示正在验证的模型；超时提示会准确说明模型响应较慢，不再误导用户检查已经正常的地址和网络。
- 实测当前 `gpt-5.6-sol` 配置能够完成两步工具调用验证。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.24` fixes false connection-test timeouts for reasoning models while staying aligned with `prototypes/memento-agent/index.html`.

### Highlights

- Allows 60 seconds overall and 45 seconds per provider request for the complete tool-call probe, accommodating slower reasoning and coding models.
- Requires the tool on the first step, then correctly requests a normal response after the tool result instead of forcing the same tool again.
- Shows which model is being verified and reports response latency accurately instead of suggesting that a healthy URL or network is broken.
- Confirms the current `gpt-5.6-sol` configuration can complete the two-step tool-call probe.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

# Memento Agent 0.6.38

## 简体中文

`0.6.38` 修复全屏磁盘删除确认，并兼容 Gemini CLI 使用的自定义代理地址。

### 主要变化

- 全屏磁盘浏览中的“移到废纸篓”确认框不再被全屏界面遮挡。
- UI 测试会在全屏模式中完成右键菜单和确认框交互，防止问题再次出现。
- Gemini 自定义服务地址会按 Gemini CLI 规则自动补充 `/v1beta`。
- 模型列表请求会访问代理的 Gemini 原生接口，不再误读同一代理的 OpenAI 模型接口。
- 官方和代理 Gemini 请求统一使用 `x-goog-api-key` 认证。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.38` fixes fullscreen disk removal confirmation and supports custom proxy URLs used by Gemini CLI.

### Highlights

- Move to Trash confirmation now stays above the fullscreen disk browser.
- UI coverage exercises the context menu and confirmation dialog while fullscreen.
- Custom Gemini service URLs follow Gemini CLI behavior and automatically receive `/v1beta`.
- Model discovery now reaches the proxy's native Gemini endpoint instead of interpreting its OpenAI model endpoint.
- Official and proxied Gemini requests consistently use `x-goog-api-key` authentication.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

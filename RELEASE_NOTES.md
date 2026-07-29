# Memento Agent 0.6.23

## 简体中文

`0.6.23` 修复应用管理误用演示数据和 OpenAI 混合模型列表问题，并与 `prototypes/memento-agent/index.html` 保持一致。

### 主要变化

- 修复启动阶段 preload 崩溃导致生产应用退回 5 个演示 APP 的问题，恢复当前设备 62 个可管理应用和真实 Logo。
- 新增真实 Electron 冒烟测试，直接验证 preload、真实应用列表和真实 Logo，不再只依赖浏览器演示数据。
- OpenAI 模型列表会过滤图片、音频、实时、Embedding、审核和内部专用模型，只显示适合 Agent 的候选项。
- 设置页会显示可用模型数量和过滤数量；接口缺少能力元数据时仍使用保守规则，并保留手动填写兜底。
- 已验证该自定义 OpenAI 入口服务正常；其 20 项原始目录中有 14 个 Agent 可用文本模型、6 个不兼容项目。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.23` fixes demo-data fallback in Application Management and mixed OpenAI model catalogs while staying aligned with `prototypes/memento-agent/index.html`.

### Highlights

- Fixes a startup preload crash that made the production app fall back to five demo apps, restoring 62 manageable apps and real icons on the current device.
- Adds a real Electron smoke test for the preload bridge, application inventory, and application icons instead of relying only on browser demo data.
- Filters image, audio, realtime, embedding, moderation, and internal-only models out of OpenAI catalogs before they reach the Agent model picker.
- Reports both Agent-ready and excluded model counts, prefers capability metadata, and retains manual entry when an endpoint is unusual.
- Confirms the custom OpenAI endpoint is healthy; its raw 20-entry catalog contains 14 Agent-ready text models and 6 incompatible entries.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

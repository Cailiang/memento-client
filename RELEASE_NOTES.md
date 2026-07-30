# Memento Agent 0.6.32

## 简体中文

`0.6.32` 完成构建工具链的跨主版本安全升级，同时保持现有应用功能和安装包兼容。

### 主要变化

- Vite 5 升级至 7.3.6，electron-vite 2 升级至 5.0.0，electron-builder 25 升级至 26.15.3。
- React Vite 插件升级至 5.2.0，Vitest 升级至 3.2.7；Node.js 开发要求调整为 22.12 或更高版本。
- 随应用发布的运行时依赖安全审计为 0；完整开发依赖审计由 33 项降至 16 项，且不再包含严重问题。
- 剩余审计项均来自 electron-builder 最新稳定版的上游打包依赖，没有通过高风险强制覆盖来破坏跨平台打包兼容性。
- 单元测试、生产构建、设备扫描、真实 Electron 启动和四种视口 UI 测试均已通过。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.32` completes the cross-major security upgrade of the build toolchain while preserving existing application and packaging behavior.

### Highlights

- Vite 5 is upgraded to 7.3.6, electron-vite 2 to 5.0.0, and electron-builder 25 to 26.15.3.
- React's Vite plugin is upgraded to 5.2.0 and Vitest to 3.2.7; development now requires Node.js 22.12 or newer.
- The shipped runtime dependency audit is clean. The full development audit is reduced from 33 findings to 16 and no longer contains critical findings.
- The remaining findings are inherited from the latest stable electron-builder packaging dependencies; risky cross-major overrides were not used because they would compromise cross-platform packaging compatibility.
- Unit tests, production builds, device scanning, real Electron startup, and all four UI viewports pass on the upgraded chain.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

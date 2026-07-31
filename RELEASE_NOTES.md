# Memento Agent 0.6.53

## 简体中文

`0.6.53` 修复 Apple Silicon 安装包被 macOS 提示“已损坏”的签名问题，并为最终 DMG 增加自动校验。

### 主要变化

- arm64 和 x64 应用现在都会对主应用、Electron Framework 及所有 Helper 应用执行完整 ad-hoc 签名，不再只保留无法通过应用包校验的链接器签名。
- ad-hoc 打包明确关闭 Hardened Runtime，避免 Electron 内置 Framework 因 Team ID 不一致而在启动时被 Library Validation 拒绝。
- GitHub Actions 会挂载最终 DMG，并在上传前检查镜像校验和、应用版本、可执行架构、Bundle ID 以及 `codesign --verify --deep --strict` 结果。
- 打包过程不会自动使用构建机器上的第三方证书；未来配置项目自有 Apple 凭据后，才会启用 Developer ID 签名和公证。
- 中英文 README 和开发、发布文档已经收敛到当前本地 Agent 架构，旧服务端界面截图与本地生成产物已经移除。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。

macOS 安装包已经完成 ad-hoc 签名，因此不会再因应用包签名无效而显示“已损坏”。在配置 Developer ID 与公证前，Gatekeeper 仍可能提示无法验证开发者；首次启动时可右键 Memento 选择“打开”，或前往“系统设置 > 隐私与安全性”手动允许。

## English

`0.6.53` fixes the invalid app-bundle signature that caused macOS to report the Apple Silicon package as damaged and adds automated verification of the final DMG.

### Highlights

- Both arm64 and x64 packages now apply a complete ad-hoc signature to the main app, Electron Framework, and every helper app instead of retaining only linker signatures that fail bundle validation.
- Ad-hoc packages explicitly disable Hardened Runtime so Electron's bundled frameworks are not rejected by Library Validation because of mismatched Team IDs.
- GitHub Actions mounts each final DMG and checks its image checksum, app version, executable architecture, bundle identifier, and `codesign --verify --deep --strict` result before upload.
- Packaging never adopts an unrelated certificate from the build machine. Developer ID signing and notarization will be enabled only after project-owned Apple credentials are configured.
- The bilingual README and development and release documentation now describe the current local Agent architecture; obsolete server-era screenshots and generated local artifacts were removed.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell.

macOS packages are now fully ad-hoc signed, so an invalid bundle signature no longer produces the damaged-app warning. Until Developer ID signing and notarization are configured, Gatekeeper may still report an unidentified developer. Use **Control-click > Open** or approve Memento under **System Settings > Privacy & Security** for the first launch.

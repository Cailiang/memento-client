# Memento Agent 0.6.54

## 简体中文

`0.6.54` 为 macOS 安装包启用正式的 Developer ID 签名和 Apple 公证，解决 Apple Silicon 用户安装后被提示“已损坏，无法打开”的问题。

### 主要变化

- Intel 与 Apple Silicon 应用均使用项目的 `Developer ID Application` 证书签名，并启用 Hardened Runtime。
- GitHub Actions 使用隔离的临时钥匙串导入签名证书，不会污染构建机器的默认钥匙串。
- electron-builder 完成应用签名和公证后，工作流还会单独签名最终 DMG、提交 Apple 公证并装订票据。
- 上传安装包前会验证应用版本、可执行架构、Bundle ID、签名主体、Team ID、Gatekeeper 结果，以及应用和 DMG 的公证票据。

### 安装说明

完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。

公证后的 macOS 安装包可直接打开和安装，不再需要移除隔离属性或在“隐私与安全性”中手动放行。若从第三方镜像或缓存下载，请先确认文件校验和与 GitHub Release 中的 `SHA256SUMS.txt` 一致。

## English

`0.6.54` enables production Developer ID signing and Apple notarization for macOS packages, resolving the damaged-app warning seen after installing the Apple Silicon build.

### Highlights

- Both Intel and Apple Silicon apps are signed with the project's `Developer ID Application` certificate and Hardened Runtime enabled.
- GitHub Actions imports the signing certificate into an isolated temporary keychain without modifying the build machine's persistent keychain.
- After electron-builder signs and notarizes the app, the workflow separately signs the final DMG, submits it to Apple for notarization, and staples the ticket.
- Before upload, release verification checks the app version, executable architecture, bundle identifier, signing authority, Team ID, Gatekeeper assessments, and stapled tickets for both the app and DMG.

### Installation

Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell.

The notarized macOS package can be opened and installed normally without removing quarantine attributes or manually approving it in Privacy & Security. When downloading from a mirror or cache, verify the file against `SHA256SUMS.txt` from the GitHub Release first.

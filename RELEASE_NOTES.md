# Memento Agent 0.6.55

## 简体中文

`0.6.55` 新增应用内后台自动更新。Memento 会自动下载新版本，并只在版本号旁提供安装入口，不再弹出单独的更新提示。

### 主要变化

- 启动后和每小时自动检查稳定版本；发现新版本后直接在后台下载。
- 侧边栏版本号旁显示准备状态和下载百分比，下载完成后变为“更新”按钮。
- 点击“更新”后安装已经下载的版本并重启 Memento，无需打开 GitHub Release 页面手动下载安装。
- 设置页保留“立即检查”，并显示检查、下载、就绪、安装、失败和安装包不支持等状态。
- GitHub Release 新增 macOS ZIP、更新块映射和分架构元数据；工作流会严格验证完整的 19 个发布资产。

### 安装说明

应用内更新从本版本开始可用，因此首次安装 `0.6.55` 仍需从 GitHub Release 下载对应平台安装包。完整扫描和清理目前支持 macOS；Windows 与 Linux 安装包用于桌面外壳的可移植性验证。

macOS 安装包继续使用 Developer ID 签名、Apple 公证和票据装订。若从第三方镜像或缓存下载，请先确认安装包校验和与 GitHub Release 中的 `SHA256SUMS.txt` 一致。

## English

`0.6.55` adds background in-app updates. Memento downloads a new version automatically and exposes installation only beside the sidebar version, without a separate update popup.

### Highlights

- Checks the stable release channel after startup and every hour, then downloads a newer version in the background.
- Shows preparation and download progress beside the sidebar version; the control becomes an Update button when the package is ready.
- Installs the downloaded version and restarts Memento when Update is selected, without opening GitHub Releases for a manual download.
- Keeps Check now in Settings and reports checking, downloading, ready, installing, failure, and unsupported-package states.
- Adds macOS ZIPs, updater blockmaps, and architecture-aware metadata to GitHub Releases, with strict validation of all 19 assets.

### Installation

In-app updates begin with this version, so the first installation of `0.6.55` still requires the matching package from GitHub Releases. Full scanning and cleanup currently support macOS; Windows and Linux packages validate portability of the desktop shell.

macOS packages remain Developer ID signed, Apple-notarized, and stapled. When downloading from a mirror or cache, verify the installer against `SHA256SUMS.txt` from the GitHub Release first.

# Memento Agent 0.6.41

## 简体中文

`0.6.41` 新增 Antigravity 独立接口类型，并支持磁盘浏览连续删除而不触发全盘重扫。

### 主要变化

- 设置中新增 Antigravity 类型，默认使用 Sub2API `/antigravity/v1beta` 路由。
- Antigravity 继续复用 Vercel Google 适配器，不需要额外 SDK；连接探针使用兼容的 `VALIDATED` 工具模式。
- 已有 `/antigravity` Google 配置和匹配的 CC Switch 配置会自动迁移。
- 删除磁盘项目后只移除对应子树及注册 ID，不再自动扫描整块磁盘。
- 同轮扫描中的其他项目保持可用，可以连续移到废纸篓；界面同步更新祖先容量。

### 安装说明

完整扫描和清理目前支持 macOS。本地 Intel x64 DMG 未签名、未公证，安装时可能需要在“系统设置 > 隐私与安全性”中手动允许。

## English

`0.6.41` adds a dedicated Antigravity provider and supports consecutive disk-browser removal without full rescans.

### Highlights

- Settings now exposes Antigravity with Sub2API's `/antigravity/v1beta` route by default.
- Antigravity reuses the Vercel Google adapter and requires no extra SDK; its probe selects the compatible `VALIDATED` tool mode.
- Existing `/antigravity` Google configurations and matching CC Switch entries migrate automatically.
- Trash removes only the selected disk subtree and registered IDs, with no automatic full-volume scan.
- Other items from the same scan remain available for consecutive removal while visible ancestor capacity updates locally.

### Installation

Full scanning and cleanup currently support macOS. The local Intel x64 DMG is unsigned and unnotarized, so macOS may require manual approval under System Settings > Privacy & Security.

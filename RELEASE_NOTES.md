# Memento Agent 0.6.57

## 简体中文

`0.6.57` 修复软件更新检查和“立即检查”按钮。当前安装版本高于不含自动更新清单的旧公开版本时，Memento 会正确显示已是最新版本，不再显示原始 HTTP 404 错误。

### 主要变化

- 更新检查会先比较 GitHub 最新稳定版本，只有存在更高版本时才请求自动更新清单并开始后台下载。
- 修复当前版本为 `v0.6.56`、最新公开版本为 `v0.6.54` 且缺少 `latest-mac.yml` 时的错误状态。
- 更新服务异常时显示简短的本地化恢复提示，不再把底层 HTTP 异常和请求地址直接展示在设置页。
- “立即检查”使用固定紧凑尺寸；长状态文字独立换行，不再挤压或放大按钮。
- 错误状态通过无障碍实时区域播报，并新增版本预检查、缺失清单识别和按钮尺寸回归覆盖。

## English

`0.6.57` fixes software update checks and the Check now button. When the installed build is newer than a legacy public release without updater metadata, Memento now reports that it is up to date instead of exposing a raw HTTP 404 error.

### Highlights

- Compares the latest stable GitHub version before requesting updater manifests or starting a background download.
- Handles the `v0.6.56` installation with legacy public release `v0.6.54` and its missing `latest-mac.yml` as up to date.
- Replaces raw updater HTTP exceptions and request URLs with concise localized recovery guidance.
- Gives Check now a stable compact size and lets long status text wrap without stretching or compressing the action.
- Adds accessible error announcements and regression coverage for release preflight, missing manifests, and button dimensions.

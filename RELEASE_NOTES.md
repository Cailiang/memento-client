# Memento Agent 0.6.60

## 简体中文

`0.6.60` 修复软件更新检查，并为本机 AI 配置和 CC Switch 导入增加真实连接校验；公开安装包由 GitHub Actions 完成签名、公证和完整资产校验。

### 主要变化

- 修复已安装版本高于最新公开版本时，“立即检查”请求缺失更新清单并报错的问题，同时恢复紧凑的按钮尺寸和本地化错误提示。
- 扫描 Claude、Codex、Gemini 和 Grok 本机配置时，会通过只读模型列表校验密钥、服务地址和精确模型；失败项会被过滤，再次扫描会清理旧的无效导入。
- “导入 CC Switch”保持手动触发，并执行相同校验；再次导入会移除校验失败或已从 CC Switch 删除的 `cc-switch-*` 配置。
- 如果清理的是默认供应商，会安全选择一个剩余配置继续作为默认；API 密钥不会进入渲染层或日志。
- 已在报告问题的本机 CC Switch 数据库做只读验证：7 个完整候选中 2 个通过，5 个无效配置被过滤。
- Linux x64 的原生 `x86_64.AppImage` 与 `amd64.deb` 会在发布时规范为 `x64` 名称并同步更新自动更新清单，确保全部 19 个 Release 资产可以完成校验和发布。

## English

`0.6.60` repairs software update checks and adds real connection validation to local AI and CC Switch imports. Public packages are signed, notarized, and fully validated by GitHub Actions.

### Highlights

- Fixes **Check now** requesting a missing update manifest when the installed version is newer than the latest public release, and restores its compact size and localized errors.
- Validates local Claude, Codex, Gemini, and Grok credentials, endpoints, and exact models through read-only model catalogs; failed entries are filtered and stale invalid imports are removed on rescan.
- Keeps **Import CC Switch** explicitly user-triggered while applying the same validation and removing invalid or deleted managed `cc-switch-*` entries on re-import.
- Safely promotes a remaining provider if a removed import was the default, while keeping API keys out of the Renderer and logs.
- Verified read-only against the reported local CC Switch database: 2 of 7 complete candidates passed and 5 invalid configurations were filtered out.
- Normalizes native Linux x64 `x86_64.AppImage` and `amd64.deb` names to the published `x64` convention and rewrites updater metadata so all 19 Release assets can be validated and published.

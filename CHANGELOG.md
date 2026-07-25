# Changelog / 更新记录

All notable changes to Memento Client are documented here in English and Simplified Chinese.

Memento Client 的重要变更会在这里使用英文和简体中文同步记录。

## 0.6.12 - 2026-07-25

### English

- Removed redundant item detail drawers from service, storage, and application lists; useful context and actions now stay directly in each row.
- Consolidated general and AI preferences under one Settings destination with a compact two-tab switcher.
- Replaced large theme previews with concise palette swatches while preserving all eight themes.
- Clarified inline AI states for starting, running, viewing, and collapsing an analysis.
- Reduced the primary navigation to six items and tightened desktop and mobile layouts.

### 简体中文

- 移除后台服务、存储空间和应用列表中信息重复的详情侧栏；有效说明与操作直接保留在每一行。
- 将通用设置和 AI 设置合并到同一个“设置”入口，并使用紧凑的双标签切换。
- 使用简洁色板替代大幅主题预览，同时保留全部八套主题。
- 明确 AI 分析的开始、进行中、查看结果和收起状态。
- 主导航精简为六项，并收紧桌面与手机布局。

## 0.6.11 - 2026-07-25

### English

- Moved service and storage whitelist management into **Results / Whitelist** tabs within each module.
- Replaced oversized module introductions with compact headers that keep the list in the first viewport.
- AI analysis now expands directly below the selected item instead of opening in the details sidebar.
- Simplified directory links to quiet inline paths with a Finder icon and removed duplicate storage paths.
- The async AI task center now hides the task currently open inline and restores it after users leave the item.

### 简体中文

- 服务和存储白名单并回对应模块，通过“扫描结果 / 白名单”标签切换。
- 移除占用空间过大的模块说明，改为紧凑页头，让列表更早进入首屏。
- AI 分析改为在所选项目下方直接展开，不再出现在详情侧栏中。
- 目录入口改为轻量行内路径加 Finder 图标，并去除存储项目的重复路径。
- 当前行内展开的 AI 任务不再重复出现在任务中心；离开项目后仍可从任务中心找回。

## 0.6.10 - 2026-07-25

### English

- Added a dedicated sidebar whitelist manager with separate service and storage sections.
- Added storage-item whitelisting based on stable item locations.
- Removing a whitelist entry automatically rescans and restores the item.
- Whitelisting immediately unregisters the item's cleanup and Finder capabilities in the main process.
- Removed ambiguous service checkboxes in favor of explicit row actions, while preserving batch selection for storage and applications.

### 简体中文

- 侧栏新增独立白名单管理，分别展示服务和存储项目。
- 新增基于稳定路径的存储项目白名单。
- 移出白名单后自动重新扫描并恢复项目。
- 加入白名单时，主进程会立即注销项目的清理和 Finder 定位能力。
- 移除含义不明确的服务复选框，改用明确的行内操作；存储和应用仍支持批量选择。

## 0.6.9 - 2026-07-25

### English

- Fixed privileged LaunchAgent removal by using the valid macOS `/bin/test` command instead of the nonexistent `/usr/bin/test`.
- Added an application-owned staging step before sending protected items to Trash.
- Added verification for both source removal and staged files, with a recoverable fallback location if the Trash API fails.
- Cleanup failures now show the concrete macOS error message.
- Real-world verification successfully removed `com.sogou.SogouTaskManager.plist` from `/Library/LaunchAgents` and preserved it in Trash.

### 简体中文

- 将授权清理脚本中不存在的 `/usr/bin/test` 修正为 macOS 有效的 `/bin/test`。
- 受保护项目在进入废纸篓前会先移动到应用自己的暂存目录。
- 新增原位置和暂存文件双重检查；废纸篓 API 失败时会保留可恢复的暂存位置。
- 清理失败时直接显示 macOS 返回的具体错误信息。
- 已真实验证成功移除 `/Library/LaunchAgents/com.sogou.SogouTaskManager.plist`，文件保留在废纸篓中。

## 0.6.8 - 2026-07-25

### English

- Added a service whitelist. Whitelisted services are hidden from scan results and can be restored from Settings.
- Fixed **Keep in menu bar after closing** by creating and validating the menu bar icon before the main window is hidden.
- Added exact, clickable Finder locations to every storage candidate.
- Fixed privileged startup-item removal so an expected `launchctl bootout` failure cannot prevent the configuration from moving to Trash.
- Added post-authorization source checks so cleanup is never reported as complete while a target still exists.
- Verified `com.sogou.SogouTaskManager` has one removal action and follows the corrected root-owned LaunchAgent cleanup path.

### 简体中文

- 新增服务白名单。加入白名单的服务不再出现在扫描结果中，可在设置中恢复显示。
- 修复“关闭后驻留菜单栏”：主窗口隐藏前会先创建并验证菜单栏图标。
- 所有存储空间项目新增准确且可点击的 Finder 位置。
- 修复授权移除启动项：预期内的 `launchctl bootout` 失败不会再阻止配置移到废纸篓。
- 新增授权后的源文件检查，清理目标仍存在时不会误报操作完成。
- 已确认 `com.sogou.SogouTaskManager` 只显示一个移除操作，并使用修复后的 root LaunchAgent 清理流程。

## 0.6.7 - 2026-07-25

### English

- Removed duplicate **Remove startup item** actions from stale LaunchAgents such as `com.sogou.SogouTaskManager`.
- Service locations now prefer the owning application, a specific user project, or the Homebrew formula directory. Broad working directories such as `/usr/local/var` are no longer shown when a more specific configured program location exists.
- Missing configured programs are reported as missing instead of linking to an unrelated working directory.
- Removing a startup item now keeps the service visible when a related software or directory cleanup choice remains, so users can decide on that second step separately.
- AI service analysis now explains the software's real purpose instead of repeating LaunchAgent state. It also distinguishes removing a startup item from deleting software or a directory.
- Parallel AI analyses now run independently, and strict structured responses prevent malformed model output from hiding completed results.

### 简体中文

- 移除 `com.sogou.SogouTaskManager` 等失效 LaunchAgent 上重复的“移除启动项”操作。
- 服务位置优先显示所属应用、具体的用户项目目录或 Homebrew formula 目录。存在更具体的程序位置时，不再显示 `/usr/local/var` 这类宽泛工作目录。
- 配置指向的程序已不存在时，会明确说明，不再链接到无关目录。
- 移除启动项后，如果仍有关联软件或目录清理选项，服务会继续保留在列表中，用户可以再单独决定第二步。
- AI 服务分析现在会说明软件的真实用途，不再复述 LaunchAgent 状态，并严格区分“移除启动项”与“删除软件或目录”。
- 多项 AI 分析现在可独立并行执行，严格的结构化响应会避免模型格式异常导致结果无法显示。

## 0.6.6 - 2026-07-25

### English

- Every non-Apple LaunchAgent can now remove its startup item independently while keeping the program directory and user data.
- LaunchAgents with an explicit user-owned working directory also offer a separate, clearly warned option to move the related startup items and entire directory to Trash.
- Related services that share a working directory are stopped and handled together, while broad, protected, or symbolic-link directory targets are rejected.
- AI analyses can now run in parallel. Hosted authentication refresh is shared safely across concurrent requests, and server timeouts are no longer reported as rate limits.
- The local development gateway allows four concurrent analyses per user, with higher development-only request limits. Two real hosted analyses were verified concurrently.

### 简体中文

- 所有非 Apple LaunchAgent 现在都可以单独“移除启动项”，同时保留程序目录和用户数据。
- 如果 LaunchAgent 明确声明了当前用户所有的工作目录，还会提供独立的“删除关联目录”选项，并在执行前明确警告影响。
- 共用工作目录的相关服务会一起停止和处理；过于宽泛、受保护或符号链接目录会被拒绝。
- AI 分析现在可以并行运行。并发请求会安全共用登录 Token 刷新，服务端超时也不再被误报为请求过于频繁。
- 本地开发 Gateway 允许每个用户同时进行 4 项分析，并提高了仅用于开发环境的请求频率上限。已使用两条真实 AI 请求并发验证。

## 0.6.5 - 2026-07-25

### English

- **Ask AI** now starts analysis immediately without a request preview, token estimate, or second confirmation. The internal allowlist, redaction, and request integrity checks remain enforced.
- Replaced the single transient AI status bar with a persistent task panel. Multiple running and completed analyses show their original item names, and completed results remain available until opened or dismissed.
- Running services now show a verified service location when one can be derived from their launch configuration. The path can be opened directly in Finder.
- Added real-scan coverage for service locations and Finder reveal-target registration.

### 简体中文

- 点击“问 AI”后直接开始分析，不再展示请求预览、Token 预估或二次确认；内部字段白名单、脱敏和请求完整性校验仍然保留。
- 将单条短暂的 AI 状态提示改为常驻任务面板。多个进行中和已完成的分析都会显示原项目名称，完成结果会保留到用户查看或关闭。
- 从启动配置中能可靠识别位置时，运行中的服务会显示服务目录，并可直接在 Finder 中打开。
- 真实扫描验证新增服务目录和 Finder 打开目标的检查。

## 0.6.4 - 2026-07-25

### English

- AI analysis now continues as a background task when users close the inspector, switch views, or inspect another service. List actions and a global activity bar show the current task state.
- Stopped non-Apple LaunchAgents remain visible after a new scan and no longer show an invalid Stop action.
- Services that share an application or exact data directory now expose the same deduplicated uninstall action from every related row.
- Added safe cleanup for services such as ShadowsocksX-NG whose launch configuration points to a dedicated directory under Application Support instead of an application bundle.

### 简体中文

- AI 分析改为后台任务。关闭详情、切换页面或查看其他服务时分析会继续，列表入口和全局状态条会显示当前进度。
- 已停止的非 Apple LaunchAgent 在重新扫描后仍会显示，并且不再提供无效的“停止”操作。
- 同一应用或同一精确数据目录下的多个服务会共享去重后的卸载操作，每一条相关服务都能发起清理。
- 支持安全清理 ShadowsocksX-NG 这类没有应用包、但启动配置明确指向 Application Support 专用目录的服务。

## 0.6.3 - 2026-07-25

### English

- Removed Electron `safeStorage` and macOS Keychain access from AI credential storage.
- AI login tokens and API keys are now stored in Memento's local application data with current-user-only file permissions.
- Legacy encrypted credentials are ignored, so users may need to reconnect Memento Server or enter their API key once after upgrading.

### 简体中文

- AI 凭据存储不再使用 Electron `safeStorage`，也不再请求访问 macOS 钥匙串。
- AI 登录 Token 和 API Key 改为保存在仅当前系统用户可读的 Memento 本地应用数据中。
- 旧版加密凭据将被忽略，升级后可能需要重新连接一次 Memento Server 或重新填写 API Key。

## 0.6.2 - 2026-07-25

### English

- Changed the application Bundle ID to `com.fcl.memento`.
- Added Chinese and English interface settings, window behavior controls, and eight visual themes.
- Made AI answers shorter and easier to understand, with a direct answer about whether an item can be stopped, removed, or cleaned.
- Kept stopped services visible so users can still review or uninstall the related software.
- Fixed action labels that remained in English after switching back to Chinese.
- Added reproducible release builds for macOS x64/arm64, Windows x64, and Linux x64.
- Expanded the public documentation, security boundaries, build instructions, and release process.

### 简体中文

- 应用 Bundle ID 修改为 `com.fcl.memento`。
- 新增中英文界面设置、窗口行为配置和八种视觉主题。
- AI 回答改为更短、更容易理解的表达，直接说明项目能否停止、删除或清理。
- 停止服务后继续保留条目，用户仍可查看详情或卸载相关软件。
- 修复切换回中文后部分操作按钮仍显示英文的问题。
- 新增 macOS x64/arm64、Windows x64 和 Linux x64 的可重复发布构建。
- 补充开源项目说明、安全边界、构建方式和发布流程。

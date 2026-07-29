# Memento 0.6.20

## English

This release introduces a compact, centralized way to ignore storage and background-service findings without weakening cleanup boundaries.

### Highlights

- Storage and background-service rows now expose Ignore item from a compact `...` menu.
- A confirmation explains whether the item is protected from cleanup or skipped during service checks.
- Settings includes one Ignored items manager with separate Storage and Services tabs, live counts, and Restore detection.
- Ignored findings are removed from scan results, registered cleanup actions, Finder locations, and data visible to AI or Agent flows.
- The approved Agent HTML prototype is now documented as the required source for production UI implementation.

### Ignore scope

Ignoring does not delete storage or stop a service. It prevents future detection and processing until the user restores the item in Settings.

### Platform note

Full maintenance scanning and cleanup currently support macOS. This local Intel x64 package is unsigned and unnotarized.

## 简体中文

这个版本提供紧凑、统一的忽略列表管理，同时确保忽略规则真正约束扫描和清理能力。

### 主要变化

- 存储空间和后台服务列表通过紧凑的 `...` 菜单提供“忽略此项”。
- 确认弹窗会区分存储保护和后台服务跳过检测的实际影响。
- 设置页新增统一的“忽略列表”管理窗口，按存储空间和后台服务分类，显示实时数量并支持“恢复检测”。
- 忽略项会从扫描结果、已注册清理动作、Finder 定位和 AI/Agent 可见数据中同时移除。
- 开发文档已明确：正式界面必须以确认过的 Agent HTML 原型为实现基准。

### 忽略范围

忽略操作不会删除存储内容，也不会停止后台服务；项目只会在设置中恢复后重新参与检测和处理。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。本地 Intel x64 安装包未签名、未公证。

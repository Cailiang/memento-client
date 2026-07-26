# Memento 0.6.13

## English

This release makes storage cleanup release disk space immediately and turns deterministic terminal findings into safe, automatic actions.

### Highlights

- Rebuildable storage targets are permanently deleted from a strict local allowlist after an explicit irreversible confirmation, then rescanned so released space is visible immediately. Xcode Archives and other protected data remain analysis-only.
- Terminal findings that match built-in rules now offer one-click automatic optimization instead of instructions a user must execute manually.
- Supported fixes include invalid or duplicate PATH entries, repeated completion initialization, synchronous startup network requests, and eager version-manager initialization.
- Every shell edit verifies the scanned file hash, validates zsh syntax, creates an adjacent backup, writes atomically, and supports one-step undo when the file has not changed afterward.
- AI-generated commands are never executed. The confirmation dialog lists only deterministic local changes registered by the current scan.

### Platform note

Full maintenance scanning and cleanup currently support macOS. Windows and Linux packages are previews of the desktop shell and AI settings and do not expose macOS cleanup actions.

## 简体中文

这个版本让存储清理真正立即释放磁盘空间，并把可确定处理的终端问题变成安全的自动操作。

### 主要变化

- 可重建的存储目标只会从严格的本地白名单中永久删除；执行前明确提示不可撤销，完成后重新扫描并立即显示释放空间。Xcode Archives 等受保护数据仍然只分析、不自动清理。
- 匹配内置规则的终端问题现在可以一键自动优化，不再只给出需要用户手动执行的建议。
- 支持自动处理无效或重复 PATH、重复补全初始化、启动阶段同步网络请求，以及版本管理器提前加载。
- 每次 shell 修改都会检查扫描时哈希、验证 zsh 语法、在原目录创建备份并原子写入；文件未被再次编辑时可一键撤销。
- 绝不执行 AI 生成的命令；确认框只列出本次扫描注册的确定性本地变更。

### 平台说明

完整的维护扫描和清理功能目前只支持 macOS。Windows 和 Linux 安装包用于预览桌面界面与 AI 设置，不会提供 macOS 清理操作。

<div align="center">

# Memento

### 谨慎、透明的 macOS 清理与启动诊断工具

[![Release](https://img.shields.io/github/v/release/Cailiang/memento-client?label=release)](https://github.com/Cailiang/memento-client/releases/latest)
[![Build](https://github.com/Cailiang/memento-client/actions/workflows/release.yml/badge.svg)](https://github.com/Cailiang/memento-client/actions/workflows/release.yml)
[![Platform](https://img.shields.io/badge/builds-macOS%20%7C%20Windows%20%7C%20Linux-59636e)](https://github.com/Cailiang/memento-client/releases)
[![License](https://img.shields.io/github/license/Cailiang/memento-client)](LICENSE)

[English](README.md) | 简体中文 | [更新记录](CHANGELOG.md)

</div>

Memento 用来发现被遗忘的后台服务、占用空间较大的临时文件、重复或长期未使用的应用，以及拖慢终端启动的配置。所有清理操作都必须来自本机扫描建立的白名单，并经过用户明确确认。只有当用户不清楚某个项目或担心处理影响时，才需要使用 AI。

![Memento 概览](.artifacts/memento-overview.png)

## 下载

请从 [GitHub Releases](https://github.com/Cailiang/memento-client/releases/latest) 下载最新版本。

| 平台 | 安装包 | 支持情况 |
| --- | --- | --- |
| macOS Intel | `Memento-*-x64.dmg` | 完整维护与诊断功能 |
| macOS Apple 芯片 | `Memento-*-arm64.dmg` | 完整维护与诊断功能 |
| Windows x64 | `Memento-*-x64.exe` | 桌面界面与 AI 设置预览 |
| Linux x64 | `Memento-*-x86_64.AppImage` 或 `Memento-*-amd64.deb` | 桌面界面与 AI 设置预览 |

当前维护扫描引擎只支持 macOS。Windows 和 Linux 版本可以安全启动，但不会提供 macOS 清理操作；发布这些版本是为了在原生扫描能力开发期间验证跨平台桌面界面。

macOS 安装包目前可能尚未完成 Apple 公证。如果系统阻止首次启动，请右键 Memento 并选择“打开”。

## 主要功能

- **后台服务：** 检查运行中的 Homebrew 服务和 LaunchAgent，识别所属软件，并提供安全的停止或卸载选择。
- **存储空间：** 查找 Xcode、Homebrew、npm、pnpm、Yarn、Gradle、CocoaPods 和应用产生的大体积临时文件。
- **应用版本：** 检查 Homebrew 旧版本、重复应用副本和长期未使用的应用。
- **终端启动：** 测量无配置基线和完整启动耗时，定位同步初始化与 PATH 问题。
- **按需 AI 分析：** 用简短、日常的语言说明项目用途，以及停止、删除或清理会不会带来问题。

![AI 服务分析](.artifacts/memento-service-ai-result.png)

## 安全边界

- 扫描过程只读，不需要管理员权限。
- 渲染层不能提交任意文件路径；操作只能使用本次扫描生成的临时 ID。
- 可恢复的清理会把文件移到系统废纸篓，不会直接永久删除。
- 受保护或高风险的数据只提供分析，不提供清理按钮。
- AI 不能创建或执行清理目标，只能解释本地扫描已经识别的项目。
- AI 报告采用字段白名单，不包含文件原文、账号密钥或不受限制的本机路径。

## AI 配置

“AI 设置”提供三种连接方式：

- **Memento Server：** 本地开发默认连接 `http://127.0.0.1:8787`，可通过 `MEMENTO_GATEWAY_URL` 修改。
- **本地 Ollama：** 固定连接 `http://127.0.0.1:11434`。
- **自己的 API Key：** 连接兼容 Responses API 的服务，密钥使用 Electron `safeStorage` 加密保存。

终端问题、后台服务和存储项目都需要用户主动选择 AI 分析。发送前会展示数据预览，明确说明将提交哪些结构化字段。

## 本地开发

需要 Node.js 20 或更高版本及 npm。完整扫描和操作测试需要 macOS。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm test
npm run typecheck
npm run scan:smoke
npm run build
npm run dist:mac
```

`npm run dev:web` 会使用明确标注的演示数据打开界面。真实扫描和清理只会在 Electron 中启用。

## 发布流程

推送 `v*` 标签会触发 [.github/workflows/release.yml](.github/workflows/release.yml)。工作流会确认标签与 `package.json` 版本一致，构建 macOS x64/arm64、Windows x64 和 Linux x64 安装包，并使用双语 [Release 说明](RELEASE_NOTES.md) 创建 GitHub Release。

## 开发文档

- [AI 分析功能设计](docs/AI_ANALYSIS_DEVELOPMENT.md)
- [AI Gateway 可运行示例](examples/ai-gateway-smoke/README.md)
- [版本更新记录](CHANGELOG.md)

## 开源协议

Memento Client 使用 [MIT License](LICENSE)。Memento Server 独立维护，不属于这个开源仓库。

import path from 'node:path'
import type { CleanupCategory, RiskLevel } from '../shared/types'

interface LocalizedCopy {
  zh: string
  en: string
}

export interface CleanupRule {
  id: string
  category: CleanupCategory
  name: LocalizedCopy
  description: LocalizedCopy
  relativeTargets: readonly (readonly string[])[]
  risk: RiskLevel
  minimumBytes?: number
  actionable?: boolean
  grouped?: boolean
}

export interface ResolvedCleanupRule extends Omit<CleanupRule, 'relativeTargets'> {
  targets: string[]
}

const MB = 1024 * 1024

const electronCacheTargets = (applicationDirectory: string): readonly (readonly string[])[] => [
  ['Library', 'Application Support', applicationDirectory, 'Cache'],
  ['Library', 'Application Support', applicationDirectory, 'Code Cache'],
  ['Library', 'Application Support', applicationDirectory, 'GPUCache'],
  ['Library', 'Application Support', applicationDirectory, 'Service Worker', 'CacheStorage'],
  ['Library', 'Application Support', applicationDirectory, 'Shared Dictionary', 'cache']
]

export const CLEANUP_RULES: readonly CleanupRule[] = [
  {
    id: 'system-saved-state',
    category: 'system',
    name: { zh: '应用恢复状态', en: 'Saved application states' },
    description: { zh: '应用窗口和恢复状态的临时快照；不会删除文稿或应用设置。', en: 'Temporary window and restoration snapshots. Documents and app settings are preserved.' },
    relativeTargets: [['Library', 'Saved Application State']],
    risk: 'review',
    minimumBytes: 20 * MB
  },
  {
    id: 'diagnostic-reports',
    category: 'logs',
    name: { zh: '诊断与崩溃报告', en: 'Diagnostic and crash reports' },
    description: { zh: 'macOS 和应用生成的旧诊断报告；清理后将失去这些历史排障记录。', en: 'Historical diagnostics from macOS and applications. Cleanup removes old troubleshooting records.' },
    relativeTargets: [['Library', 'DiagnosticReports']],
    risk: 'review',
    minimumBytes: 10 * MB
  },
  {
    id: 'xcode-derived-data',
    category: 'developer',
    name: { zh: 'Xcode DerivedData', en: 'Xcode DerivedData' },
    description: { zh: '编译中间产物。Xcode 会在下次构建时重新生成。', en: 'Intermediate build output that Xcode regenerates during the next build.' },
    relativeTargets: [['Library', 'Developer', 'Xcode', 'DerivedData']],
    risk: 'safe'
  },
  {
    id: 'xcode-archives',
    category: 'developer',
    name: { zh: 'Xcode Archives', en: 'Xcode Archives' },
    description: { zh: '归档构建可能仍用于崩溃符号化或重新分发，仅提供空间分析。', en: 'Archived builds may still be needed for symbolication or redistribution and remain analysis-only.' },
    relativeTargets: [['Library', 'Developer', 'Xcode', 'Archives']],
    risk: 'protected',
    actionable: false
  },
  {
    id: 'ios-device-support',
    category: 'devices',
    name: { zh: 'iOS DeviceSupport', en: 'iOS DeviceSupport' },
    description: { zh: '连接过的 iOS 版本调试支持文件，可按需重新生成。', en: 'Debug support files for previously connected iOS versions. They can be regenerated.' },
    relativeTargets: [['Library', 'Developer', 'Xcode', 'iOS DeviceSupport']],
    risk: 'safe'
  },
  {
    id: 'ios-simulator-caches',
    category: 'devices',
    name: { zh: 'iOS 模拟器缓存', en: 'iOS simulator caches' },
    description: { zh: '模拟器运行时生成的缓存，不会删除模拟器设备或应用数据。', en: 'Rebuildable simulator caches. Simulator devices and their app data are preserved.' },
    relativeTargets: [['Library', 'Developer', 'CoreSimulator', 'Caches']],
    risk: 'safe'
  },
  {
    id: 'homebrew-downloads',
    category: 'developer',
    name: { zh: 'Homebrew 下载缓存', en: 'Homebrew download cache' },
    description: { zh: '已下载的软件包和源码缓存，不影响已安装的软件。', en: 'Downloaded packages and source archives. Installed software is not affected.' },
    relativeTargets: [['Library', 'Caches', 'Homebrew']],
    risk: 'safe'
  },
  {
    id: 'npm-content-cache',
    category: 'developer',
    name: { zh: 'npm 内容缓存', en: 'npm content cache' },
    description: { zh: 'npm 下载缓存，后续安装依赖时会重新下载。', en: 'npm download cache. Future installs may download dependencies again.' },
    relativeTargets: [['.npm', '_cacache']],
    risk: 'safe'
  },
  {
    id: 'pnpm-store',
    category: 'developer',
    name: { zh: 'pnpm 包存储', en: 'pnpm package store' },
    description: { zh: 'pnpm 的共享包存储；项目依赖仍保留，但后续安装可能重新下载。', en: 'Shared pnpm package storage. Existing project dependencies remain, but future installs may download packages again.' },
    relativeTargets: [['Library', 'pnpm', 'store']],
    risk: 'review'
  },
  {
    id: 'yarn-cache',
    category: 'developer',
    name: { zh: 'Yarn 下载缓存', en: 'Yarn download cache' },
    description: { zh: 'Yarn 下载缓存，不影响项目中已经安装的依赖。', en: 'Yarn download cache. Dependencies already installed in projects are not affected.' },
    relativeTargets: [['Library', 'Caches', 'Yarn']],
    risk: 'safe'
  },
  {
    id: 'gradle-cache',
    category: 'developer',
    name: { zh: 'Gradle 构建缓存', en: 'Gradle build cache' },
    description: { zh: 'Gradle 依赖与构建缓存，后续构建会重新下载或生成。', en: 'Gradle dependency and build caches. Future builds will download or regenerate them.' },
    relativeTargets: [['.gradle', 'caches']],
    risk: 'safe'
  },
  {
    id: 'cocoapods-cache',
    category: 'developer',
    name: { zh: 'CocoaPods 缓存', en: 'CocoaPods cache' },
    description: { zh: 'CocoaPods 下载缓存，不会修改项目中的 Pods 目录。', en: 'CocoaPods download cache. Pods directories inside projects are not modified.' },
    relativeTargets: [['Library', 'Caches', 'CocoaPods']],
    risk: 'safe'
  },
  {
    id: 'python-download-caches',
    category: 'developer',
    name: { zh: 'Python 下载缓存', en: 'Python download caches' },
    description: { zh: 'pip 与 uv 下载的软件包缓存；不会修改虚拟环境或项目文件。', en: 'Package downloads cached by pip and uv. Virtual environments and project files are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'pip'],
      ['Library', 'Caches', 'uv'],
      ['.cache', 'pip'],
      ['.cache', 'uv']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'go-build-caches',
    category: 'developer',
    name: { zh: 'Go 构建与下载缓存', en: 'Go build and download caches' },
    description: { zh: 'Go 编译缓存与已下载模块缓存；不会修改项目源码。', en: 'Go compilation and downloaded module caches. Project source is preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'go-build'],
      ['go', 'pkg', 'mod', 'cache']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'rust-download-caches',
    category: 'developer',
    name: { zh: 'Rust 下载缓存', en: 'Rust download caches' },
    description: { zh: 'Cargo 下载的 crate 与 Git 数据；不会删除已安装工具链或项目。', en: 'Crates and Git data downloaded by Cargo. Installed toolchains and projects are preserved.' },
    relativeTargets: [
      ['.cargo', 'registry', 'cache'],
      ['.cargo', 'git', 'db']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'android-cache',
    category: 'developer',
    name: { zh: 'Android 工具缓存', en: 'Android tool cache' },
    description: { zh: 'Android 开发工具生成的下载与构建缓存；不会删除 SDK 或模拟器设备。', en: 'Download and build caches from Android developer tools. SDKs and virtual devices are preserved.' },
    relativeTargets: [['.android', 'cache']],
    risk: 'safe'
  },
  {
    id: 'maven-repository',
    category: 'developer',
    name: { zh: 'Maven 本地仓库', en: 'Maven local repository' },
    description: { zh: '本地 Maven 依赖仓库；清理后构建需要重新下载依赖。', en: 'Local Maven dependency repository. Builds must download dependencies again after cleanup.' },
    relativeTargets: [['.m2', 'repository']],
    risk: 'review',
    minimumBytes: 100 * MB
  },
  {
    id: 'claude-caches',
    category: 'applications',
    name: { zh: 'Claude 可重建缓存', en: 'Claude rebuildable caches' },
    description: { zh: 'Claude Desktop 与 Claude Code 的网页、GPU、日志和下载缓存；保留登录、配置、对话和项目。', en: 'Web, GPU, log, and download caches from Claude Desktop and Claude Code. Login, settings, conversations, and projects are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'com.anthropic.claudefordesktop'],
      ['Library', 'Caches', 'claude-cli-nodejs'],
      ...electronCacheTargets('Claude'),
      ['.claude', 'cache']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'codex-caches',
    category: 'applications',
    name: { zh: 'Codex 可重建缓存', en: 'Codex rebuildable caches' },
    description: { zh: 'Codex App 与 CLI 的浏览器、GPU、日志和临时缓存；保留配置、凭据、会话和项目。', en: 'Browser, GPU, log, and temporary caches from Codex App and CLI. Settings, credentials, sessions, and projects are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'Codex'],
      ['Library', 'Caches', 'com.openai.codex'],
      ['Library', 'Application Support', 'Codex', 'Default', 'Cache'],
      ['Library', 'Application Support', 'Codex', 'Default', 'Code Cache'],
      ['Library', 'Application Support', 'Codex', 'Default', 'GPUCache'],
      ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'Cache'],
      ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'Code Cache'],
      ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'GPUCache'],
      ['Library', 'Application Support', 'Codex', 'GPUPersistentCache', 'GPUCache'],
      ['.codex', 'log'],
      ['.codex', 'tmp']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'antigravity-caches',
    category: 'applications',
    name: { zh: 'Antigravity 可重建缓存', en: 'Antigravity rebuildable caches' },
    description: { zh: 'Antigravity 的编辑器、扩展、网页和 GPU 缓存；保留工作区、账号和供应商配置。', en: 'Editor, extension, web, and GPU caches from Antigravity. Workspaces, accounts, and provider settings are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'com.google.antigravity'],
      ['Library', 'Caches', 'com.google.antigravity-ide'],
      ...electronCacheTargets('Antigravity'),
      ['Library', 'Application Support', 'Antigravity', 'CachedData'],
      ...electronCacheTargets('Antigravity IDE'),
      ['Library', 'Application Support', 'Antigravity IDE', 'CachedData']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'grok-caches',
    category: 'applications',
    name: { zh: 'Grok 可重建缓存', en: 'Grok rebuildable caches' },
    description: { zh: 'Grok 客户端的网页和 GPU 缓存；保留登录、对话和设置。', en: 'Web and GPU caches from Grok clients. Login, conversations, and settings are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'ai.x.grok'],
      ['Library', 'Caches', 'com.xai.grok'],
      ...electronCacheTargets('Grok')
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'work-app-caches',
    category: 'applications',
    name: { zh: '办公与协作应用缓存', en: 'Work and collaboration app caches' },
    description: { zh: 'Slack、Discord 和 Notion 的网页与图形缓存；保留账号、工作区和离线文稿。', en: 'Web and graphics caches from Slack, Discord, and Notion. Accounts, workspaces, and offline documents are preserved.' },
    relativeTargets: [
      ...electronCacheTargets('Slack'),
      ...electronCacheTargets('discord'),
      ...electronCacheTargets('Notion')
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'editor-app-caches',
    category: 'developer',
    name: { zh: '代码编辑器缓存', en: 'Code editor caches' },
    description: { zh: 'Visual Studio Code 与 Cursor 的网页、GPU 和 Service Worker 缓存；保留设置、扩展与项目。', en: 'Web, GPU, and Service Worker caches from Visual Studio Code and Cursor. Settings, extensions, and projects are preserved.' },
    relativeTargets: [
      ...electronCacheTargets('Code'),
      ...electronCacheTargets('Cursor')
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'safari-caches',
    category: 'browsers',
    name: { zh: 'Safari 网页缓存', en: 'Safari web caches' },
    description: { zh: 'Safari 的网页与网络缓存；不会删除浏览记录、书签、Cookie 或登录状态。', en: 'Safari web and network caches. History, bookmarks, cookies, and sign-in state are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'com.apple.Safari'],
      ['Library', 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Caches']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'chromium-browser-caches',
    category: 'browsers',
    name: { zh: 'Chromium 浏览器缓存', en: 'Chromium browser caches' },
    description: { zh: 'Chrome、Edge、Brave 与 Arc 的网页缓存；不会删除历史记录、书签、Cookie 或密码。', en: 'Web caches from Chrome, Edge, Brave, and Arc. History, bookmarks, cookies, and passwords are preserved.' },
    relativeTargets: [
      ['Library', 'Caches', 'Google', 'Chrome'],
      ['Library', 'Caches', 'Microsoft Edge'],
      ['Library', 'Caches', 'BraveSoftware', 'Brave-Browser'],
      ['Library', 'Caches', 'company.thebrowser.Browser']
    ],
    risk: 'safe',
    grouped: true
  },
  {
    id: 'firefox-caches',
    category: 'browsers',
    name: { zh: 'Firefox 网页缓存', en: 'Firefox web caches' },
    description: { zh: 'Firefox Profile 的网页缓存；不会删除历史记录、书签、Cookie 或密码。', en: 'Web caches from Firefox profiles. History, bookmarks, cookies, and passwords are preserved.' },
    relativeTargets: [['Library', 'Caches', 'Firefox']],
    risk: 'safe'
  }
] as const

export function resolveCleanupRules(home: string): ResolvedCleanupRule[] {
  const resolvedHome = path.resolve(home)
  return CLEANUP_RULES.map(({ relativeTargets, ...rule }) => ({
    ...rule,
    targets: relativeTargets.map((parts) => path.join(resolvedHome, ...parts))
  }))
}

const protectedContainerTokens = [
  '1password',
  'agilebits',
  'authenticator',
  'authy',
  'bitwarden',
  'dashlane',
  'keychain',
  'lastpass'
] as const

function isProtectedContainerIdentity(identity: string): boolean {
  const normalized = identity.toLocaleLowerCase()
  return normalized.startsWith('com.apple.') ||
    normalized.startsWith('group.com.apple.') ||
    protectedContainerTokens.some((token) => normalized.includes(token))
}

function relativeParts(target: string, home: string): string[] | null {
  if (!path.isAbsolute(target)) return null
  const relative = path.relative(path.resolve(home), path.resolve(target))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
  const parts = relative.split(path.sep)
  if (parts.some((part) => !part || part === '.' || part === '..' || /[\0\r\n]/.test(part))) return null
  return parts
}

export type DynamicCleanupTargetKind = 'application-cache' | 'application-log' | 'sandbox-cache' | 'group-cache'

export function dynamicCleanupTargetKind(target: string, home: string): DynamicCleanupTargetKind | null {
  const parts = relativeParts(target, home)
  if (!parts) return null

  if (parts.length === 3 && parts[0] === 'Library' && parts[1] === 'Caches' && !parts[2].startsWith('com.apple.')) {
    return 'application-cache'
  }
  if (parts.length === 3 && parts[0] === 'Library' && parts[1] === 'Logs' && !parts[2].startsWith('com.apple.')) {
    return 'application-log'
  }
  if (
    parts.length === 6 &&
    parts[0] === 'Library' &&
    parts[1] === 'Containers' &&
    !isProtectedContainerIdentity(parts[2]) &&
    parts[3] === 'Data' &&
    parts[4] === 'Library' &&
    parts[5] === 'Caches'
  ) {
    return 'sandbox-cache'
  }
  if (
    parts.length === 5 &&
    parts[0] === 'Library' &&
    parts[1] === 'Containers' &&
    !isProtectedContainerIdentity(parts[2]) &&
    parts[3] === 'Data' &&
    parts[4] === 'tmp'
  ) {
    return 'sandbox-cache'
  }
  if (
    parts.length === 5 &&
    parts[0] === 'Library' &&
    parts[1] === 'Group Containers' &&
    !isProtectedContainerIdentity(parts[2]) &&
    parts[3] === 'Library' &&
    parts[4] === 'Caches'
  ) {
    return 'group-cache'
  }
  if (
    parts.length === 4 &&
    parts[0] === 'Library' &&
    parts[1] === 'Group Containers' &&
    !isProtectedContainerIdentity(parts[2]) &&
    parts[3] === 'tmp'
  ) {
    return 'group-cache'
  }
  return null
}

export function cleanupRuleForTarget(target: string, home: string): ResolvedCleanupRule | null {
  const resolvedTarget = path.resolve(target)
  return resolveCleanupRules(home).find((rule) => rule.targets.includes(resolvedTarget)) ?? null
}

export function isAllowedCleanupTarget(target: string, home: string): boolean {
  const rule = cleanupRuleForTarget(target, home)
  if (rule) return rule.actionable !== false
  return dynamicCleanupTargetKind(target, home) !== null
}

function browserLikeName(target: string): boolean {
  return /(arc|brave|chrome|chromium|edge|firefox|mozilla|opera|safari|vivaldi)/i.test(path.basename(target))
}

export function cleanupCategoryForTarget(target: string, home: string): CleanupCategory {
  const rule = cleanupRuleForTarget(target, home)
  if (rule) return rule.category
  const dynamic = dynamicCleanupTargetKind(target, home)
  if (dynamic === 'application-log') return 'logs'
  if (browserLikeName(target)) return 'browsers'
  return 'applications'
}

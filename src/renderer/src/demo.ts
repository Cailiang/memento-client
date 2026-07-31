import type { AppLanguage } from '../../shared/app-settings'
import type {
  DiskUsageNode,
  DiskUsageScanResult,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  ScanSection,
  TerminalFinding
} from '../../shared/types'

const GB = 1024 ** 3
const MB = 1024 ** 2

function demoDiskNode(
  id: string,
  name: string,
  location: string,
  sizeBytes: number,
  children: DiskUsageNode[] = [],
  kind: DiskUsageNode['kind'] = 'directory'
): DiskUsageNode {
  return {
    id,
    name,
    location,
    sizeBytes,
    kind,
    childCount: children.length,
    omittedChildCount: 0,
    omittedSizeBytes: 0,
    children
  }
}

export function localizedDemoDiskUsageResult(language: AppLanguage): DiskUsageScanResult {
  const fang = language === 'en-US' ? 'fangcl' : 'fangcl'
  const applicationSupport = demoDiskNode('disk-app-support', 'Application Support', `/Users/${fang}/Library/Application Support`, 48.6 * GB, [
    demoDiskNode('disk-claude', 'Claude', `/Users/${fang}/Library/Application Support/Claude`, 2.8 * GB),
    demoDiskNode('disk-codex-app', 'Codex', `/Users/${fang}/Library/Application Support/Codex`, 1.6 * GB),
    demoDiskNode('disk-antigravity-app', 'Antigravity', `/Users/${fang}/Library/Application Support/Antigravity`, 972 * MB)
  ])
  const userLibrary = demoDiskNode('disk-user-library', 'Library', `/Users/${fang}/Library`, 121.2 * GB, [
    applicationSupport,
    demoDiskNode('disk-caches', 'Caches', `/Users/${fang}/Library/Caches`, 19.4 * GB),
    demoDiskNode('disk-containers', 'Containers', `/Users/${fang}/Library/Containers`, 17.1 * GB),
    demoDiskNode('disk-developer', 'Developer', `/Users/${fang}/Library/Developer`, 15.8 * GB)
  ])
  const user = demoDiskNode('disk-user', fang, `/Users/${fang}`, 239.4 * GB, [
    userLibrary,
    demoDiskNode('disk-downloads', 'Downloads', `/Users/${fang}/Downloads`, 51.7 * GB),
    demoDiskNode('disk-movies', 'Movies', `/Users/${fang}/Movies`, 18.2 * GB),
    demoDiskNode('disk-gradle', '.gradle', `/Users/${fang}/.gradle`, 4.9 * GB),
    demoDiskNode('disk-gemini', '.gemini', `/Users/${fang}/.gemini`, 3.9 * GB),
    demoDiskNode('disk-cache', '.cache', `/Users/${fang}/.cache`, 2 * GB),
    demoDiskNode('disk-codex', '.codex', `/Users/${fang}/.codex`, 1.1 * GB),
    demoDiskNode('disk-antigravity', '.antigravity', `/Users/${fang}/.antigravity`, 376.5 * MB)
  ])
  const users = demoDiskNode('disk-users', 'Users', '/Users', 242.5 * GB, [
    user,
    demoDiskNode('disk-shared', 'Shared', '/Users/Shared', 2.8 * GB)
  ])
  const root = demoDiskNode('disk-root', 'Macintosh HD', '/', 287.6 * GB, [
    users,
    demoDiskNode('disk-applications', 'Applications', '/Applications', 38 * GB),
    demoDiskNode('disk-library', 'Library', '/Library', 6.8 * GB)
  ])
  return {
    scanId: `demo-disk-${language}`,
    root,
    scannedEntries: 186_420,
    retainedEntries: 2_846,
    inaccessibleEntries: 14,
    minimumDisplayBytes: 5 * MB,
    startedAt: new Date(Date.now() - 82_000).toISOString(),
    completedAt: new Date().toISOString()
  }
}

export const demoResult: ScanResult = {
  scanId: 'browser-demo',
  startedAt: new Date(Date.now() - 42_000).toISOString(),
  completedAt: new Date().toISOString(),
  system: {
    hostname: 'Fang 的 MacBook Pro',
    osVersion: '15.5',
    diskTotalBytes: 494 * GB,
    diskFreeBytes: 68.4 * GB,
    memoryTotalBytes: 32 * GB,
    memoryUsedBytes: 21.7 * GB,
    uptimeSeconds: 19 * 24 * 60 * 60 + 8 * 60 * 60
  },
  candidates: [
    {
      id: 'demo-derived-data',
      section: 'storage',
      name: 'Xcode DerivedData',
      subtitle: '~/Library/Developer/Xcode/DerivedData',
      location: '~/Library/Developer/Xcode/DerivedData',
      description: '编译中间产物。Xcode 会在下次构建时重新生成。',
      sizeBytes: 12.8 * GB,
      ageDays: 18,
      risk: 'safe',
      status: '可清理',
      evidence: ['占用 12.8 GB', '最近修改于 18 天前'],
      action: {
        kind: 'delete-storage',
        label: '永久清理',
        consequence: '缓存会被永久删除并立即释放空间。下次完整构建会重新生成这些内容。',
        reversible: false
      }
    },
    {
      id: 'demo-npm',
      section: 'storage',
      name: 'npm 内容缓存',
      subtitle: '~/.npm/_cacache',
      location: '~/.npm/_cacache',
      description: 'npm 下载缓存，后续安装依赖时会重新下载。',
      sizeBytes: 4.6 * GB,
      ageDays: 37,
      risk: 'safe',
      status: '可清理',
      evidence: ['占用 4.6 GB', '最近修改于 37 天前'],
      action: {
        kind: 'delete-storage',
        label: '永久清理',
        consequence: '缓存会被永久删除并立即释放空间，后续安装依赖时可能重新下载。',
        reversible: false
      }
    },
    {
      id: 'demo-lingma',
      section: 'storage',
      name: '.lingma',
      subtitle: 'Home 隐藏项目',
      location: '~/.lingma',
      description: '当前应用清单和可执行命令目录中没有找到明确匹配；AI 分析会继续关联本机服务、配置文件名、软件包收据和 shell 引用。',
      sizeBytes: 84 * MB,
      ageDays: 64,
      risk: 'review',
      status: '需确认归属',
      evidence: ['隐藏位置：~/.lingma', '未匹配到已安装的 macOS 应用或可执行命令', '最近修改于 64 天前'],
      action: {
        kind: 'trash-home-artifact',
        label: '移到废纸篓',
        consequence: '整个隐藏目录及其中的配置和数据会移到废纸篓；如果仍有应用或命令使用它，相关设置可能会被重置。',
        reversible: true
      }
    },
    {
      id: 'demo-postgres',
      section: 'services',
      name: 'postgresql@14',
      subtitle: 'Homebrew 后台服务',
      description: '登录后持续运行。停止后不会卸载软件，之后仍可重新启动。',
      location: '/usr/local/opt/postgresql@14',
      risk: 'review',
      status: '运行中，PID 1148',
      evidence: ['运行用户：fang', '已连续运行 19 天', 'CPU 34.2% · 内存 1.4 GB'],
      serviceAnomalies: ['high-cpu', 'high-memory'],
      serviceMetrics: {
        pid: 1148,
        cpuPercent: 34.2,
        memoryBytes: 1.4 * GB,
        runningSeconds: 19 * 24 * 60 * 60
      },
      action: {
        kind: 'stop-brew-service',
        label: '停止服务',
        consequence: '服务将立即停止，并取消登录时自动启动。',
        reversible: true
      }
    },
    {
      id: 'demo-sunlogin',
      section: 'services',
      name: 'com.oray.sunlogin.desktopagent',
      subtitle: '向日葵远程控制 · 用户登录启动项',
      description: '已从启动配置中的可执行路径定位到关联应用，可选择仅停止，或审阅后移除应用与精确匹配的数据。',
      location: '/Applications/SunloginClient.app',
      risk: 'review',
      status: '已加载',
      evidence: [
        '配置：~/Library/LaunchAgents/com.oray.sunlogin.desktopagent.plist',
        '程序：/Applications/SunloginClient.app/Contents/MacOS/SunloginClient',
        '关联应用：/Applications/SunloginClient.app',
        'Bundle ID：com.oray.sunlogin.client',
        '检测到 4 项精确匹配的用户数据'
      ],
      operations: [
        {
          id: 'demo-sunlogin-stop',
          kind: 'stop-launch-agent',
          label: '仅停止服务',
          consequence: '进程将停止，但应用、配置文件和用户数据都会保留。',
          reversible: true
        },
        {
          id: 'demo-sunlogin-cleanup',
          kind: 'trash-service-software',
          label: '卸载并清理检测到的数据',
          consequence: '先停止服务，再把向日葵、启动项和 4 项按 Bundle ID 匹配的数据移到废纸篓。文稿和未精确匹配的数据不会处理。',
          reversible: true,
          estimatedBytes: 286 * MB,
          requiresAdmin: true
        }
      ]
    },
    {
      id: 'demo-lianghua-webui',
      section: 'services',
      name: 'com.lianghua.webui.fangcl',
      subtitle: '用户登录启动项',
      description: '已从启动配置确认服务使用的工作目录。可以只移除当前启动项；确认不再需要同目录中的源码和数据后，也可以移除相关服务并将整个目录移到废纸篓。',
      location: '/Users/fangcl/src/du/Lianghua_BTC_pg',
      risk: 'review',
      status: '已停止',
      evidence: [
        '配置：~/Library/LaunchAgents/com.lianghua.webui.fangcl.plist',
        '程序：/bin/bash',
        '服务目录：/Users/fangcl/src/du/Lianghua_BTC_pg'
      ],
      operations: [
        {
          id: 'demo-lianghua-remove-startup',
          kind: 'trash-launch-agent-config',
          label: '移除启动项',
          consequence: '将这个已停止服务的启动配置移到废纸篓。程序目录和用户数据都会保留。',
          reversible: true
        },
        {
          id: 'demo-lianghua-remove-directory',
          kind: 'trash-service-directory',
          label: '移除相关服务并删除目录',
          consequence: '停止引用同一目录的服务，将 2 个启动配置和整个目录 /Users/fangcl/src/du/Lianghua_BTC_pg 移到废纸篓。目录中的源码、虚拟环境和数据都会一起移动。',
          reversible: true
        }
      ]
    },
    {
      id: 'demo-app-android-studio',
      section: 'applications',
      name: 'Android Studio Preview',
      subtitle: '版本 2023.1 Canary 8',
      description: '检测到相同 Bundle ID 的多个应用副本。建议核对项目兼容性。',
      sizeBytes: 2.1 * GB,
      ageDays: 412,
      risk: 'review',
      status: '重复版本',
      evidence: ['旧副本：/Applications/Android Studio Preview.app', '另有当前版本 2025.1'],
      action: {
        kind: 'trash',
        label: '移到废纸篓',
        consequence: '应用副本会移到废纸篓，应用数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-app-postman',
      section: 'applications',
      name: 'Postman',
      subtitle: '版本 10.21.4',
      description: 'Spotlight 记录显示该应用已超过 3 个月没有使用。',
      sizeBytes: 713 * MB,
      ageDays: 286,
      risk: 'review',
      status: '3 个月未使用',
      evidence: ['286 天未使用', '位置：/Applications/Postman.app'],
      action: {
        kind: 'trash',
        label: '移到废纸篓',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    }
  ],
  applications: [
    {
      id: 'demo-inventory-android-studio',
      name: 'Android Studio Preview',
      version: '2023.1 Canary 8',
      bundleId: 'com.google.android.studio',
      location: '/Applications/Android Studio Preview.app',
      sizeBytes: 2.1 * GB,
      lastUsedAt: '2025-06-09T03:20:00.000Z',
      scope: 'shared',
      unused: true,
      action: {
        id: 'demo-app-android-studio',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-postman',
      name: 'Postman',
      version: '10.21.4',
      bundleId: 'com.postmanlabs.mac',
      location: '/Applications/Postman.app',
      sizeBytes: 713 * MB,
      lastUsedAt: '2025-10-13T08:45:00.000Z',
      scope: 'shared',
      unused: true,
      action: {
        id: 'demo-app-postman',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-arc',
      name: 'Arc',
      version: '1.102.0',
      bundleId: 'company.thebrowser.Browser',
      location: '/Applications/Arc.app',
      sizeBytes: 624 * MB,
      lastUsedAt: '2026-07-26T01:14:00.000Z',
      scope: 'shared',
      unused: false,
      action: {
        id: 'demo-app-arc',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-vscode',
      name: 'Visual Studio Code',
      version: '1.102.2',
      bundleId: 'com.microsoft.VSCode',
      location: '/Applications/Visual Studio Code.app',
      sizeBytes: 548 * MB,
      lastUsedAt: '2026-07-25T12:06:00.000Z',
      scope: 'shared',
      unused: false,
      action: {
        id: 'demo-app-vscode',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-miro',
      name: 'Miro',
      version: '0.8.97',
      bundleId: 'com.electron.realtimeboard',
      location: '~/Applications/Miro.app',
      sizeBytes: 391 * MB,
      lastUsedAt: null,
      scope: 'user',
      unused: false,
      action: {
        id: 'demo-app-miro',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-thunder',
      name: '迅雷',
      version: '5.80.5',
      bundleId: 'com.xunlei.Thunder',
      location: '/Applications/Thunder.app',
      sizeBytes: 691 * MB,
      lastUsedAt: '2026-07-24T12:06:00.000Z',
      scope: 'shared',
      executable: 'Thunder',
      urlSchemes: ['thunder', 'ed2k', 'magnet'],
      unused: false,
      action: {
        id: 'demo-app-thunder',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-claude-handler',
      name: 'Claude Code URL Handler',
      version: '1.0',
      bundleId: 'com.anthropic.claude-code-url-handler',
      location: '~/Applications/Claude Code URL Handler.app',
      sizeBytes: 1.2 * MB,
      lastUsedAt: null,
      scope: 'user',
      backgroundOnly: true,
      executable: 'claude',
      urlSchemes: ['claude-cli'],
      unused: false,
      action: {
        id: 'demo-app-claude-handler',
        kind: 'trash',
        label: '卸载',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    },
    {
      id: 'demo-inventory-app-store',
      name: 'App Store',
      version: '3.0',
      bundleId: 'com.apple.AppStore',
      location: '/System/Applications/App Store.app',
      sizeBytes: 45 * MB,
      lastUsedAt: '2026-07-29T01:00:00.000Z',
      scope: 'system',
      executable: 'App Store',
      urlSchemes: ['itms-apps', 'macappstore'],
      unused: false,
      protectedReason: 'macOS 系统应用'
    }
  ],
  ignoredApplications: [],
  terminal: {
    shell: '/bin/zsh',
    baselineMs: 34,
    startupMs: 1240,
    sampleCount: 3,
    configFiles: [
      { logicalPath: '~/.zshenv', exists: false },
      { logicalPath: '~/.zprofile', exists: true, lineCount: 18, sizeBytes: 624 },
      { logicalPath: '~/.zshrc', exists: true, lineCount: 142, sizeBytes: 5840 },
      { logicalPath: '~/.zlogin', exists: false }
    ],
    findings: [
      {
        id: 'demo-terminal-total',
        code: 'shell_startup_slow',
        title: '交互 shell 启动偏慢',
        detail: '三次测量取中位数，完整配置耗时 1240 ms。',
        severity: 'slow',
        durationMs: 1240,
        source: '/bin/zsh',
        recommendation: '优先处理下方命中的同步初始化项，然后重新扫描。'
      },
      {
        id: 'demo-terminal-config',
        code: 'shell_config_cost_high',
        title: '配置层额外耗时',
        detail: '无配置基线 34 ms，用户配置增加约 1206 ms。',
        severity: 'slow',
        durationMs: 1206,
        source: '启动基线对比'
      },
      {
        id: 'demo-terminal-nvm',
        code: 'nvm_eager_load',
        title: 'NVM 在启动阶段加载',
        detail: 'NVM 的 shell 脚本会同步读取文件系统，常见于启动延迟。',
        severity: 'notice',
        source: '~/.zshrc:86',
        recommendation: '改为首次调用 node、npm 或 nvm 时再延迟加载。',
        fix: {
          id: 'demo-terminal-nvm',
          label: '暂停自动初始化',
          consequence: '注释 NVM 自动初始化配置；修改前会自动备份 .zshrc。'
        }
      },
      {
        id: 'demo-terminal-compinit',
        code: 'compinit_detected',
        title: 'Zsh 补全系统初始化',
        detail: '配置中重复调用了 compinit，会明显拖慢终端启动。',
        severity: 'notice',
        source: '~/.zshrc:42',
        recommendation: '保留第一次 compinit，移除后续重复调用。',
        fix: {
          id: 'demo-terminal-compinit',
          label: '移除重复初始化',
          consequence: '保留第一次 compinit，注释其余重复调用；修改前会自动备份 .zshrc。'
        }
      }
    ]
  },
  warnings: []
}

export async function runDemoScan(
  onProgress: (progress: ScanProgress) => void,
  language: AppLanguage
): Promise<ScanResult> {
  const english = language === 'en-US'
  const sections: ScanSection[] = ['services', 'storage', 'applications', 'terminal']
  const steps: ScanProgress[] = english
    ? [
        { section: 'system', progress: 4, message: 'Reading system status', activeSections: [], completedSections: [] },
        { section: 'system', progress: 10, message: 'System status loaded. Checking four modules in parallel', activeSections: sections, completedSections: [] },
        { section: 'services', progress: 30, message: 'Background services complete. Continuing the remaining checks', activeSections: ['storage', 'applications', 'terminal'], completedSections: ['services'] },
        { section: 'applications', progress: 50, message: 'App cleanup complete. Continuing the remaining checks', activeSections: ['storage', 'terminal'], completedSections: ['services', 'applications'] },
        { section: 'storage', progress: 70, message: 'Storage complete. Continuing the remaining checks', activeSections: ['terminal'], completedSections: ['services', 'applications', 'storage'] },
        { section: 'terminal', progress: 90, message: 'All four modules checked. Preparing the results', activeSections: [], completedSections: ['services', 'storage', 'applications', 'terminal'] },
        { section: 'system', progress: 100, message: 'Scan complete', activeSections: [], completedSections: ['services', 'storage', 'applications', 'terminal'] }
      ]
    : [
        { section: 'system', progress: 4, message: '读取系统状态', activeSections: [], completedSections: [] },
        { section: 'system', progress: 10, message: '系统状态已读取，正在并行检查四个模块', activeSections: sections, completedSections: [] },
        { section: 'services', progress: 30, message: '后台服务检查完成，继续检查其余项目', activeSections: ['storage', 'applications', 'terminal'], completedSections: ['services'] },
        { section: 'applications', progress: 50, message: '应用清理检查完成，继续检查其余项目', activeSections: ['storage', 'terminal'], completedSections: ['services', 'applications'] },
        { section: 'storage', progress: 70, message: '存储空间检查完成，继续检查其余项目', activeSections: ['terminal'], completedSections: ['services', 'applications', 'storage'] },
        { section: 'terminal', progress: 90, message: '四个模块均已检查，正在整理结果', activeSections: [], completedSections: ['services', 'storage', 'applications', 'terminal'] },
        { section: 'system', progress: 100, message: '扫描完成', activeSections: [], completedSections: ['services', 'storage', 'applications', 'terminal'] }
      ]
  for (const step of steps) {
    onProgress(step)
    await new Promise((resolve) => window.setTimeout(resolve, 160))
  }
  return {
    ...localizedDemoResult(language),
    completedAt: new Date().toISOString()
  }
}

export function localizedDemoResult(language: AppLanguage): ScanResult {
  if (language === 'zh-CN') return demoResult

  const candidateCopy: Record<string, Pick<ScanCandidate, 'name' | 'description' | 'status' | 'evidence'> & { subtitle?: string }> = {
    'demo-derived-data': {
      name: 'Xcode DerivedData',
      subtitle: '~/Library/Developer/Xcode/DerivedData',
      description: 'Intermediate build products. Xcode recreates them during the next build.',
      status: 'Reclaimable',
      evidence: ['Uses 12.8 GB', 'Last modified 18 days ago']
    },
    'demo-npm': {
      name: 'npm content cache',
      subtitle: '~/.npm/_cacache',
      description: 'Downloaded npm cache. Dependencies will be downloaded again when needed.',
      status: 'Reclaimable',
      evidence: ['Uses 4.6 GB', 'Last modified 37 days ago']
    },
    'demo-lingma': {
      name: '.lingma',
      subtitle: 'Hidden Home item',
      description: 'No installed macOS app or executable command was matched. AI analysis can correlate local services, configuration names, package receipts, and shell references.',
      status: 'Ownership review',
      evidence: ['Hidden location: ~/.lingma', 'No installed macOS application or executable command was matched', 'Last modified 64 days ago']
    },
    'demo-postgres': {
      name: 'postgresql@14',
      subtitle: 'Homebrew background service',
      description: 'Runs continuously after login. Stopping it does not uninstall the software, and it can be started again.',
      status: 'Running, PID 1148',
      evidence: ['Running as user: fang', 'Running continuously for 19 days']
    },
    'demo-sunlogin': {
      name: 'com.oray.sunlogin.desktopagent',
      subtitle: 'Sunlogin remote control · user login item',
      description: 'The related app was identified from the executable path in its launch configuration. You can stop it only, or review and remove the app and exact-match data.',
      status: 'Loaded',
      evidence: [
        'Config: ~/Library/LaunchAgents/com.oray.sunlogin.desktopagent.plist',
        'Program: /Applications/SunloginClient.app/Contents/MacOS/SunloginClient',
        'Related app: /Applications/SunloginClient.app',
        'Bundle ID: com.oray.sunlogin.client',
        'Found 4 exact-match user data items'
      ]
    },
    'demo-app-android-studio': {
      name: 'Android Studio Preview',
      subtitle: 'Version 2023.1 Canary 8',
      description: 'Multiple copies with the same bundle ID were found. Review project compatibility before removal.',
      status: 'Duplicate version',
      evidence: ['Old copy: /Applications/Android Studio Preview.app', 'Current version 2025.1 is also installed']
    },
    'demo-app-postman': {
      name: 'Postman',
      subtitle: 'Version 10.21.4',
      description: 'Spotlight records show that this application has not been used for more than three months.',
      status: 'Not used for 3+ months',
      evidence: ['Not used for 286 days', 'Location: /Applications/Postman.app']
    }
  }
  const actionCopy: Record<string, { label: string; consequence: string }> = {
    'demo-derived-data': { label: 'Clean permanently', consequence: 'The cache will be permanently deleted to release space immediately. Xcode recreates it during the next full build.' },
    'demo-npm': { label: 'Clean permanently', consequence: 'The cache will be permanently deleted to release space immediately. npm may download dependencies again later.' },
    'demo-lingma': { label: 'Move to Trash', consequence: 'The hidden directory and its data will move to the Trash. Settings may reset if an app or command still uses it.' },
    'demo-postgres': { label: 'Stop service', consequence: 'The service will stop immediately and no longer start automatically at login.' },
    'demo-sunlogin-stop': { label: 'Stop service only', consequence: 'The process will stop, while the app, configuration, and user data remain.' },
    'demo-sunlogin-cleanup': { label: 'Uninstall and clean detected data', consequence: 'Stops the service, then moves Sunlogin, its login item, and 4 exact-match data items to the Trash. Documents and non-exact matches remain.' },
    'demo-app-android-studio': { label: 'Move to Trash', consequence: 'The app copy will move to the Trash. Application data and preferences remain.' },
    'demo-app-postman': { label: 'Move to Trash', consequence: 'The app will move to the Trash. Its documents, data, and preferences remain.' }
  }
  const findingCopy: Record<string, Pick<TerminalFinding, 'title' | 'detail'> & { recommendation?: string; source?: string; fix?: TerminalFinding['fix'] }> = {
    'demo-terminal-total': { title: 'Interactive shell startup is slow', detail: 'The median of three measurements is 1240 ms with the full configuration.', recommendation: 'Address the synchronous initialization findings below, then scan again.', source: '/bin/zsh' },
    'demo-terminal-config': { title: 'Configuration adds significant startup time', detail: 'The clean baseline is 34 ms. User configuration adds about 1206 ms.', source: 'Startup baseline comparison' },
    'demo-terminal-nvm': { title: 'NVM loads during startup', detail: 'NVM shell scripts synchronously read the file system and commonly delay startup.', recommendation: 'Load it lazily the first time node, npm, or nvm is called.', source: '~/.zshrc:86', fix: { id: 'demo-terminal-nvm', label: 'Disable automatic initialization', consequence: 'Comment out NVM automatic initialization after backing up .zshrc.' } },
    'demo-terminal-compinit': { title: 'Zsh completion initializes more than once', detail: 'The configuration calls compinit repeatedly, which can noticeably delay terminal startup.', recommendation: 'Keep the first compinit call and remove later duplicates.', source: '~/.zshrc:42', fix: { id: 'demo-terminal-compinit', label: 'Remove duplicate initialization', consequence: 'Keep the first compinit call and comment out later duplicates after backing up .zshrc.' } }
  }

  return {
    ...demoResult,
    system: { ...demoResult.system, hostname: "Fang's MacBook Pro" },
    applications: demoResult.applications.map((application) => ({
      ...application,
      protectedReason: application.protectedReason ? 'macOS system application' : undefined,
      action: application.action ? {
        ...application.action,
        label: 'Uninstall',
        consequence: 'The app bundle will move to the Trash. Its documents, data, and preferences remain.'
      } : undefined
    })),
    candidates: demoResult.candidates.map((candidate) => {
      const copy = candidateCopy[candidate.id]
      const action = candidate.action && actionCopy[candidate.id]
      return {
        ...candidate,
        ...copy,
        action: candidate.action && action ? { ...candidate.action, ...action } : candidate.action,
        operations: candidate.operations?.map((operation) => ({ ...operation, ...actionCopy[operation.id] }))
      }
    }),
    terminal: {
      ...demoResult.terminal,
      findings: demoResult.terminal.findings.map((finding) => ({ ...finding, ...findingCopy[finding.id] }))
    }
  }
}

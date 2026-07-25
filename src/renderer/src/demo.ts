import type { AppLanguage } from '../../shared/app-settings'
import type { ScanCandidate, ScanProgress, ScanResult, TerminalFinding } from '../../shared/types'

const GB = 1024 ** 3
const MB = 1024 ** 2

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
      description: '编译中间产物。Xcode 会在下次构建时重新生成。',
      sizeBytes: 12.8 * GB,
      ageDays: 18,
      risk: 'safe',
      status: '可清理',
      evidence: ['占用 12.8 GB', '最近修改于 18 天前'],
      action: {
        kind: 'trash',
        label: '移到废纸篓',
        consequence: '项目会被移到废纸篓。下次完整构建会重新生成这些内容。',
        reversible: true
      }
    },
    {
      id: 'demo-docker',
      section: 'storage',
      name: 'Docker 虚拟磁盘',
      subtitle: '~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
      description: '包含 Docker 镜像、容器和卷。请在 Docker 内执行 prune，不应直接删除。',
      sizeBytes: 38.2 * GB,
      ageDays: 0,
      risk: 'protected',
      status: '仅分析',
      evidence: ['占用 38.2 GB', '包含 6 个正在使用的卷']
    },
    {
      id: 'demo-npm',
      section: 'storage',
      name: 'npm 内容缓存',
      subtitle: '~/.npm/_cacache',
      description: 'npm 下载缓存，后续安装依赖时会重新下载。',
      sizeBytes: 4.6 * GB,
      ageDays: 37,
      risk: 'safe',
      status: '可清理',
      evidence: ['占用 4.6 GB', '最近修改于 37 天前'],
      action: {
        kind: 'trash',
        label: '移到废纸篓',
        consequence: '缓存会移到废纸篓，后续安装依赖时可能重新下载。',
        reversible: true
      }
    },
    {
      id: 'demo-postgres',
      section: 'services',
      name: 'postgresql@14',
      subtitle: 'Homebrew 后台服务',
      description: '登录后持续运行。停止后不会卸载软件，之后仍可重新启动。',
      risk: 'review',
      status: '运行中，PID 1148',
      evidence: ['运行用户：fang', '已连续运行 19 天'],
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
      description: 'Spotlight 记录显示该应用已超过半年没有使用。',
      sizeBytes: 713 * MB,
      ageDays: 286,
      risk: 'review',
      status: '长期未使用',
      evidence: ['286 天未使用', '位置：/Applications/Postman.app'],
      action: {
        kind: 'trash',
        label: '移到废纸篓',
        consequence: '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。',
        reversible: true
      }
    }
  ],
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
        recommendation: '改为首次调用 node、npm 或 nvm 时再延迟加载。'
      },
      {
        id: 'demo-terminal-compinit',
        code: 'compinit_detected',
        title: 'Zsh 补全系统初始化',
        detail: '未缓存或重复执行的 compinit 会明显拖慢终端启动。',
        severity: 'notice',
        source: '~/.zshrc:42',
        recommendation: '复用 .zcompdump，并确保配置中只调用一次 compinit。'
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
  const steps: ScanProgress[] = english
    ? [
        { section: 'system', progress: 8, message: 'Reading system status' },
        { section: 'services', progress: 24, message: 'Checking background services and login items' },
        { section: 'storage', progress: 48, message: 'Measuring development tool and application caches' },
        { section: 'applications', progress: 68, message: 'Checking application versions and last-used dates' },
        { section: 'terminal', progress: 86, message: 'Measuring terminal startup and inspecting shell configuration' },
        { section: 'system', progress: 100, message: 'Scan complete' }
      ]
    : [
        { section: 'system', progress: 8, message: '读取系统状态' },
        { section: 'services', progress: 24, message: '检查后台服务与登录启动项' },
        { section: 'storage', progress: 48, message: '统计开发工具与应用缓存' },
        { section: 'applications', progress: 68, message: '核对应用版本与最后使用时间' },
        { section: 'terminal', progress: 86, message: '测量终端启动并分析 shell 配置' },
        { section: 'system', progress: 100, message: '扫描完成' }
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

function localizedDemoResult(language: AppLanguage): ScanResult {
  if (language === 'zh-CN') return demoResult

  const candidateCopy: Record<string, Pick<ScanCandidate, 'name' | 'description' | 'status' | 'evidence'> & { subtitle?: string }> = {
    'demo-derived-data': {
      name: 'Xcode DerivedData',
      subtitle: '~/Library/Developer/Xcode/DerivedData',
      description: 'Intermediate build products. Xcode recreates them during the next build.',
      status: 'Reclaimable',
      evidence: ['Uses 12.8 GB', 'Last modified 18 days ago']
    },
    'demo-docker': {
      name: 'Docker virtual disk',
      subtitle: '~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
      description: 'Contains Docker images, containers, and volumes. Use Docker prune instead of deleting it directly.',
      status: 'Analysis only',
      evidence: ['Uses 38.2 GB', 'Contains 6 active volumes']
    },
    'demo-npm': {
      name: 'npm content cache',
      subtitle: '~/.npm/_cacache',
      description: 'Downloaded npm cache. Dependencies will be downloaded again when needed.',
      status: 'Reclaimable',
      evidence: ['Uses 4.6 GB', 'Last modified 37 days ago']
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
      description: 'Spotlight records show that this application has not been used for more than six months.',
      status: 'Not used recently',
      evidence: ['Not used for 286 days', 'Location: /Applications/Postman.app']
    }
  }
  const actionCopy: Record<string, { label: string; consequence: string }> = {
    'demo-derived-data': { label: 'Move to Trash', consequence: 'The build products will move to the Trash. Xcode recreates them during the next full build.' },
    'demo-npm': { label: 'Move to Trash', consequence: 'The cache will move to the Trash. npm may download dependencies again later.' },
    'demo-postgres': { label: 'Stop service', consequence: 'The service will stop immediately and no longer start automatically at login.' },
    'demo-sunlogin-stop': { label: 'Stop service only', consequence: 'The process will stop, while the app, configuration, and user data remain.' },
    'demo-sunlogin-cleanup': { label: 'Uninstall and clean detected data', consequence: 'Stops the service, then moves Sunlogin, its login item, and 4 exact-match data items to the Trash. Documents and non-exact matches remain.' },
    'demo-app-android-studio': { label: 'Move to Trash', consequence: 'The app copy will move to the Trash. Application data and preferences remain.' },
    'demo-app-postman': { label: 'Move to Trash', consequence: 'The app will move to the Trash. Its documents, data, and preferences remain.' }
  }
  const findingCopy: Record<string, Pick<TerminalFinding, 'title' | 'detail'> & { recommendation?: string; source?: string }> = {
    'demo-terminal-total': { title: 'Interactive shell startup is slow', detail: 'The median of three measurements is 1240 ms with the full configuration.', recommendation: 'Address the synchronous initialization findings below, then scan again.', source: '/bin/zsh' },
    'demo-terminal-config': { title: 'Configuration adds significant startup time', detail: 'The clean baseline is 34 ms. User configuration adds about 1206 ms.', source: 'Startup baseline comparison' },
    'demo-terminal-nvm': { title: 'NVM loads during startup', detail: 'NVM shell scripts synchronously read the file system and commonly delay startup.', recommendation: 'Load it lazily the first time node, npm, or nvm is called.', source: '~/.zshrc:86' },
    'demo-terminal-compinit': { title: 'Zsh completion system initialization', detail: 'Uncached or repeated compinit calls can noticeably delay terminal startup.', recommendation: 'Reuse .zcompdump and make sure compinit runs only once.', source: '~/.zshrc:42' }
  }

  return {
    ...demoResult,
    system: { ...demoResult.system, hostname: "Fang's MacBook Pro" },
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

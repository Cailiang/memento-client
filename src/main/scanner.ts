import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type {
  ActionKind,
  CandidateOperation,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  SystemSnapshot,
  TerminalConfigFile,
  TerminalFinding
} from '../shared/types'
import type { AppLanguage } from '../shared/app-settings'
import {
  parseDiskFree,
  parseDuKilobytes,
  parseLaunchctlLabels,
  parseMetadataValue
} from './parsers'
import {
  buildBundleDataCandidates,
  findContainingAppBundle,
  findServiceLocation,
  findOwnedServiceDataRoot,
  findUserServiceDirectory,
  isAllowedServiceCleanupTarget,
  isAllowedUserSelectedServiceDirectory
} from './service-cleanup'

const execFileAsync = promisify(execFile)
const HOME = os.homedir()
const DAY_MS = 86_400_000

function t(language: AppLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

export type RegisteredAction =
  | {
      kind: Exclude<ActionKind, 'trash-launch-agent-config' | 'trash-service-software' | 'trash-service-directory'>
      target: string
    }
  | {
      kind: 'trash-launch-agent-config' | 'trash-service-software'
      target: string
      targets: string[]
      serviceTargets: string[]
      requiresAdmin: boolean
    }
  | {
      kind: 'trash-service-directory'
      target: string
      directoryTarget: string
      targets: string[]
      serviceTargets: string[]
      requiresAdmin: boolean
    }

interface RegisteredOperation {
  id?: string
  action: Omit<CandidateOperation, 'id'>
  registeredAction: RegisteredAction
}

export interface ScanBundle {
  result: ScanResult
  actions: Map<string, RegisteredAction>
  revealTargets: Map<string, string>
}

interface CommandResult {
  stdout: string
  stderr: string
}

async function run(
  command: string,
  args: string[],
  timeout = 12_000
): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' }
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function pathIsDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function pathIsRealDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.lstat(target)).isDirectory()
  } catch {
    return false
  }
}

function ageInDays(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_MS))
}

function displayPath(target: string): string {
  return target.startsWith(HOME) ? `~${target.slice(HOME.length)}` : target
}

async function getPathSize(target: string): Promise<number> {
  const stats = await fs.stat(target)
  if (stats.isFile()) return stats.size
  try {
    const { stdout } = await run('/usr/bin/du', ['-sk', target], 25_000)
    return parseDuKilobytes(stdout)
  } catch {
    return 0
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

function registerCandidate(
  actions: Map<string, RegisteredAction>,
  candidate: Omit<ScanCandidate, 'id'>,
  registeredAction?: RegisteredAction,
  registeredOperations: RegisteredOperation[] = [],
  revealTargets?: Map<string, string>,
  revealTarget?: string
): ScanCandidate {
  const id = randomUUID()
  if (registeredAction) actions.set(id, registeredAction)
  if (revealTargets && revealTarget) revealTargets.set(id, revealTarget)
  const operations = registeredOperations.map(({ id, action, registeredAction: operation }) => {
    const operationId = id ?? randomUUID()
    actions.set(operationId, operation)
    return { ...action, id: operationId }
  })
  return {
    ...candidate,
    id,
    operations: operations.length ? operations : candidate.operations
  }
}

async function scanSystem(): Promise<SystemSnapshot> {
  let diskTotalBytes = 0
  let diskFreeBytes = 0

  try {
    const { stdout } = await run('/bin/df', ['-k', '/'])
    const disk = parseDiskFree(stdout)
    diskTotalBytes = disk.totalBytes
    diskFreeBytes = disk.freeBytes
  } catch {
    // A partial snapshot is still useful when disk metadata is unavailable.
  }

  let osVersion = os.release()
  try {
    const { stdout } = await run('/usr/bin/sw_vers', ['-productVersion'])
    osVersion = stdout.trim()
  } catch {
    // Fall back to the Darwin release above.
  }

  return {
    hostname: os.hostname().replace(/\.local$/, ''),
    osVersion,
    diskTotalBytes,
    diskFreeBytes,
    memoryTotalBytes: os.totalmem(),
    memoryUsedBytes: os.totalmem() - os.freemem(),
    uptimeSeconds: os.uptime()
  }
}

async function scanBrewServices(
  actions: Map<string, RegisteredAction>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((item) =>
    require('node:fs').existsSync(item)
  )
  if (!brew) return []

  try {
    const { stdout } = await run(brew, ['services', 'list', '--json'], 15_000)
    const services = JSON.parse(stdout) as Array<{
      name: string
      status?: string
      user?: string
      file?: string
      pid?: number | null
    }>

    return services
      .filter((service) => service.status === 'started' || Boolean(service.pid))
      .map((service) =>
        registerCandidate(
          actions,
          {
            section: 'services',
            name: service.name,
            subtitle: t(language, 'Homebrew 后台服务', 'Homebrew background service'),
            description: t(language, '登录后持续运行。停止后不会卸载软件，之后仍可重新启动。', 'Runs continuously after login. Stopping it does not uninstall the software, and it can be started again.'),
            risk: 'review',
            status: service.pid ? t(language, `运行中，PID ${service.pid}`, `Running, PID ${service.pid}`) : t(language, '运行中', 'Running'),
            evidence: [
              service.user ? t(language, `运行用户：${service.user}`, `User: ${service.user}`) : t(language, '由当前用户启动', 'Started by the current user'),
              service.file ? t(language, `配置：${displayPath(service.file)}`, `Configuration: ${displayPath(service.file)}`) : t(language, '由 Homebrew 管理', 'Managed by Homebrew')
            ],
            action: {
              kind: 'stop-brew-service',
              label: t(language, '停止服务', 'Stop service'),
              consequence: t(language, '服务将立即停止，并取消登录时自动启动。', 'The service will stop immediately and no longer start automatically at login.'),
              reversible: true
            }
          },
          { kind: 'stop-brew-service', target: service.name }
        )
      )
  } catch {
    return []
  }
}

interface LaunchAgentExecutable {
  program: string | null
  appPath: string | null
  workingDirectory: string | null
  dataRoot: string | null
  serviceDirectory: string | null
  serviceLocation: string | null
  relatedPaths: string[]
}

function launchAgentPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const expanded = value.startsWith('~/') ? path.join(HOME, value.slice(2)) : value
  return path.isAbsolute(expanded) ? path.resolve(expanded) : null
}

async function inspectLaunchAgentExecutable(target: string): Promise<LaunchAgentExecutable> {
  try {
    const { stdout } = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', target])
    const plist = JSON.parse(stdout) as Record<string, unknown>
    const argumentValues = Array.isArray(plist.ProgramArguments)
      ? plist.ProgramArguments.filter((item): item is string => typeof item === 'string')
      : []
    const values = [plist.Program, ...argumentValues]
      .map(launchAgentPath)
      .filter((item): item is string => item !== null)
    const program = values[0] ?? null
    const appPath =
      values
        .map((item) => findContainingAppBundle(item))
        .find((item): item is string => item !== null) ?? null
    const workingDirectory = launchAgentPath(plist.WorkingDirectory)
    const dataRoot = findOwnedServiceDataRoot(HOME, program, workingDirectory)
    const serviceDirectory = findUserServiceDirectory(HOME, program, workingDirectory)
    const serviceLocation = findServiceLocation(HOME, program, workingDirectory, appPath)
    const relatedPaths = [plist.StandardOutPath, plist.StandardErrorPath]
      .map(launchAgentPath)
      .filter((item): item is string => item !== null)
      .filter((item) => isAllowedServiceCleanupTarget(item, HOME))
    return {
      program,
      appPath,
      workingDirectory,
      dataRoot,
      serviceDirectory,
      serviceLocation,
      relatedPaths: [...new Set(relatedPaths)]
    }
  } catch {
    return {
      program: null,
      appPath: null,
      workingDirectory: null,
      dataRoot: null,
      serviceDirectory: null,
      serviceLocation: null,
      relatedPaths: []
    }
  }
}

async function scanLaunchAgents(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const roots = [path.join(HOME, 'Library/LaunchAgents'), '/Library/LaunchAgents']
  let loadedLabels = new Set<string>()

  try {
    const { stdout } = await run('/bin/launchctl', ['list'])
    loadedLabels = parseLaunchctlLabels(stdout)
  } catch {
    return []
  }

  const entries: Array<{ target: string; label: string; stats: Awaited<ReturnType<typeof fs.stat>> }> = []
  for (const root of roots) {
    try {
      const files = await fs.readdir(root)
      for (const file of files.filter((name) => name.endsWith('.plist'))) {
        const target = path.join(root, file)
        const stats = await fs.stat(target)
        let label = path.basename(file, '.plist')
        try {
          const { stdout } = await run('/usr/bin/plutil', [
            '-extract',
            'Label',
            'raw',
            '-o',
            '-',
            target
          ])
          label = stdout.trim() || label
        } catch {
          // Most launch agents use their label as the plist filename.
        }
        entries.push({ target, label, stats })
      }
    } catch {
      // Missing launch-agent folders are normal.
    }
  }

  const inspectedEntries = await mapLimit(
    entries.filter(({ label }) => !label.startsWith('com.apple.')),
    5,
    async (entry) => ({ ...entry, ...(await inspectLaunchAgentExecutable(entry.target)) })
  )
  const sharedCleanupOperationIds = new Map<string, string>()
  const sharedCleanupOperationId = (key: string): string => {
    const existing = sharedCleanupOperationIds.get(key)
    if (existing) return existing
    const id = randomUUID()
    sharedCleanupOperationIds.set(key, id)
    return id
  }

  return mapLimit(inspectedEntries, 5, async ({
    target,
    label,
    stats,
    program,
    appPath: foundApp,
    workingDirectory,
    dataRoot,
    serviceDirectory,
    serviceLocation: inspectedServiceLocation
  }) => {
    const isLoaded = loadedLabels.has(label)
    const ageDays = ageInDays(stats.mtime)
    const evidence = [
      t(language, `配置：${displayPath(target)}`, `Configuration: ${displayPath(target)}`),
      ageDays > 180 ? t(language, `${ageDays} 天未修改配置`, `Configuration unchanged for ${ageDays} days`) : t(language, '配置近期有变更', 'Configuration changed recently')
    ]
    let appPath = foundApp
    let appName: string | null = null
    let bundleId: string | null = null
    let serviceLocation = inspectedServiceLocation

    if (serviceLocation && !(await pathIsDirectory(serviceLocation))) serviceLocation = null

    if (program) {
      evidence.push(t(language, `程序：${displayPath(program)}`, `Program: ${displayPath(program)}`))
      if (!(await pathExists(program))) {
        evidence.push(
          t(
            language,
            `配置指向的程序位置已不存在：${displayPath(program)}`,
            `The program location in the configuration no longer exists: ${displayPath(program)}`
          )
        )
      }
    }
    if (dataRoot) evidence.push(t(language, `关联数据：${displayPath(dataRoot)}`, `Associated data: ${displayPath(dataRoot)}`))
    if (appPath && !(await pathExists(appPath))) appPath = null
    if (!serviceLocation) {
      serviceLocation = findServiceLocation(HOME, program, workingDirectory, appPath)
      if (serviceLocation && !(await pathIsDirectory(serviceLocation))) serviceLocation = null
    }
    if (serviceLocation) evidence.push(t(language, `服务目录：${serviceLocation}`, `Service directory: ${serviceLocation}`))
    if (foundApp && !appPath) evidence.push(t(language, `目标应用不存在：${displayPath(foundApp)}`, `Target application is missing: ${displayPath(foundApp)}`))

    if (appPath) {
      appName = path.basename(appPath, '.app')
      try {
        const { stdout } = await run('/usr/bin/plutil', [
          '-convert',
          'json',
          '-o',
          '-',
          path.join(appPath, 'Contents', 'Info.plist')
        ])
        const appInfo = JSON.parse(stdout) as Record<string, unknown>
        bundleId =
          typeof appInfo.CFBundleIdentifier === 'string' ? appInfo.CFBundleIdentifier : null
        const displayName =
          typeof appInfo.CFBundleDisplayName === 'string'
            ? appInfo.CFBundleDisplayName
            : typeof appInfo.CFBundleName === 'string'
              ? appInfo.CFBundleName
              : null
        if (displayName) appName = displayName
      } catch {
        // The .app path is still exact evidence even if Info.plist is malformed.
      }

      evidence.push(t(language, `关联应用：${displayPath(appPath)}`, `Associated application: ${displayPath(appPath)}`))
      if (bundleId) evidence.push(`Bundle ID：${bundleId}`)

      try {
        const { stderr } = await run('/usr/bin/codesign', ['-dv', '--verbose=2', appPath])
        const teamId = stderr.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim()
        if (teamId && teamId !== 'not set') evidence.push(t(language, `签名 Team ID：${teamId}`, `Signing Team ID: ${teamId}`))
      } catch {
        evidence.push(t(language, '应用签名：无法验证', 'Application signature could not be verified'))
      }
    }

    const registeredOperations: RegisteredOperation[] = []
    if (isLoaded) {
      registeredOperations.push({
        action: {
          kind: 'stop-launch-agent',
          label: t(language, '仅停止服务', 'Stop service only'),
          consequence: t(language, '进程将停止，但应用、配置文件和用户数据都会保留。', 'The process will stop while the application, configuration, and user data remain in place.'),
          reversible: true
        },
        registeredAction: { kind: 'stop-launch-agent', target }
      })
    }

    const configRemovalRequiresAdmin = target.startsWith('/Library/LaunchAgents/')
    registeredOperations.push({
      action: {
        kind: 'trash-launch-agent-config',
        label: t(language, '移除启动项', 'Remove startup item'),
        consequence: isLoaded
          ? t(language, '停止这个服务，并将它的启动配置移到废纸篓。程序目录和用户数据都会保留。', 'Stop this service and move its launch configuration to the Trash. Its program directory and user data remain.')
          : t(language, '将这个已停止服务的启动配置移到废纸篓。程序目录和用户数据都会保留。', 'Move this stopped service\'s launch configuration to the Trash. Its program directory and user data remain.'),
        reversible: true,
        requiresAdmin: configRemovalRequiresAdmin
      },
      registeredAction: {
        kind: 'trash-launch-agent-config',
        target,
        targets: [target],
        serviceTargets: isLoaded ? [target] : [],
        requiresAdmin: configRemovalRequiresAdmin
      }
    })

    if (appPath && isAllowedServiceCleanupTarget(appPath, HOME)) {
      const associatedConfigTargets = inspectedEntries
        .filter((entry) => entry.appPath === appPath)
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      const serviceTargets = inspectedEntries
        .filter((entry) => entry.appPath === appPath && loadedLabels.has(entry.label))
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      if (associatedConfigTargets.length > 0) {
        const dataCandidates = bundleId ? buildBundleDataCandidates(HOME, bundleId) : []
        const existingData = (
          await Promise.all(
            dataCandidates.map(async (candidate) =>
              (await pathExists(candidate)) ? candidate : null
            )
          )
        ).filter((candidate): candidate is string => candidate !== null)
        const cleanupTargets = [
          ...new Set([...associatedConfigTargets, appPath, ...existingData])
        ].filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))

        if (
          associatedConfigTargets.every((configTarget) => cleanupTargets.includes(configTarget)) &&
          cleanupTargets.includes(appPath)
        ) {
          if (existingData.length) {
            evidence.push(t(language, `检测到 ${existingData.length} 项精确匹配的用户数据`, `${existingData.length} exactly matched user data items detected`))
          }
          const requiresAdmin =
            appPath.startsWith('/Applications/') ||
            associatedConfigTargets.some((configTarget) =>
              configTarget.startsWith('/Library/LaunchAgents/')
            )
          registeredOperations.push({
            id: sharedCleanupOperationId(`app:${appPath}`),
            action: {
              kind: 'trash-service-software',
              label: t(language, '卸载并清理检测到的数据', 'Uninstall and clean detected data'),
              consequence: t(language, `停止同一应用的 ${serviceTargets.length} 个已加载服务，再把 ${appName ?? path.basename(appPath, '.app')}、${associatedConfigTargets.length} 个启动配置和 ${existingData.length} 项按 Bundle ID 匹配的数据移到废纸篓。文稿和未精确匹配的数据不会处理。`, `Stop ${serviceTargets.length} loaded services for the same application, then move ${appName ?? path.basename(appPath, '.app')}, ${associatedConfigTargets.length} launch configurations, and ${existingData.length} Bundle ID-matched data items to the Trash. Documents and unmatched data are left untouched.`),
              reversible: true,
              requiresAdmin
            },
            registeredAction: {
              kind: 'trash-service-software',
              target: associatedConfigTargets[0],
              targets: cleanupTargets,
              serviceTargets,
              requiresAdmin
            }
          })
        }
      }
    }

    if (!foundApp && dataRoot) {
      const dataEntries = inspectedEntries.filter((entry) => entry.dataRoot === dataRoot)
      const configTargets = dataEntries
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      const serviceTargets = dataEntries
        .filter((entry) => loadedLabels.has(entry.label))
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      const relatedCandidates = [
        ...new Set(dataEntries.flatMap((entry) => entry.relatedPaths))
      ].filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
      const existingRelatedPaths = (
        await Promise.all(
          relatedCandidates.map(async (candidate) => (await pathExists(candidate) ? candidate : null))
        )
      ).filter((candidate): candidate is string => candidate !== null)
      const cleanupTargets = [
        ...new Set([...configTargets, dataRoot, ...existingRelatedPaths])
      ].filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))

      if (
        configTargets.length > 0 &&
        configTargets.every((configTarget) => cleanupTargets.includes(configTarget)) &&
        cleanupTargets.includes(dataRoot) &&
        await pathExists(dataRoot)
      ) {
        const requiresAdmin = configTargets.some((configTarget) =>
          configTarget.startsWith('/Library/LaunchAgents/')
        )
        registeredOperations.push({
          id: sharedCleanupOperationId(`data:${dataRoot}`),
          action: {
            kind: 'trash-service-software',
            label: t(language, '卸载并清理服务数据', 'Uninstall and clean service data'),
            consequence: t(
              language,
              `停止同组仍在运行的 ${serviceTargets.length} 个服务，再把 ${configTargets.length} 个启动配置、${displayPath(dataRoot)} 和 ${existingRelatedPaths.length} 个明确关联的日志移到废纸篓。不会按名称猜测其他文件。`,
              `Stop ${serviceTargets.length} running services in the same group, then move ${configTargets.length} launch configurations, ${displayPath(dataRoot)}, and ${existingRelatedPaths.length} explicitly associated logs to the Trash. No other files are guessed by name.`
            ),
            reversible: true,
            requiresAdmin
          },
          registeredAction: {
            kind: 'trash-service-software',
            target: configTargets[0],
            targets: cleanupTargets,
            serviceTargets,
            requiresAdmin
          }
        })
      }
    }

    const userSelectedDirectoryAvailable =
      !foundApp &&
      Boolean(serviceDirectory) &&
      isAllowedUserSelectedServiceDirectory(serviceDirectory ?? '', HOME) &&
      await pathIsRealDirectory(serviceDirectory ?? '')

    if (userSelectedDirectoryAvailable && serviceDirectory) {
      const directoryEntries = inspectedEntries.filter(
        (entry) => entry.serviceDirectory === serviceDirectory
      )
      const configTargets = directoryEntries
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      const serviceTargets = directoryEntries
        .filter((entry) => loadedLabels.has(entry.label))
        .map((entry) => entry.target)
        .filter((candidate) => isAllowedServiceCleanupTarget(candidate, HOME))
        .sort()
      const cleanupTargets = [...configTargets, serviceDirectory]
      if (configTargets.length > 0) {
        const requiresAdmin = configTargets.some((configTarget) =>
          configTarget.startsWith('/Library/LaunchAgents/')
        )
        registeredOperations.push({
          id: sharedCleanupOperationId(`directory:${serviceDirectory}`),
          action: {
            kind: 'trash-service-directory',
            label: t(language, '移除相关服务并删除目录', 'Remove services and directory'),
            consequence: t(
              language,
              `停止引用同一目录的 ${serviceTargets.length} 个已加载服务，将 ${configTargets.length} 个启动配置和整个目录 ${serviceDirectory} 移到废纸篓。目录中的源码、虚拟环境和数据都会一起移动。`,
              `Stop ${serviceTargets.length} loaded services that reference the same directory, then move ${configTargets.length} launch configurations and the entire directory ${serviceDirectory} to the Trash. Source code, virtual environments, and data inside it will all be moved.`
            ),
            reversible: true,
            requiresAdmin
          },
          registeredAction: {
            kind: 'trash-service-directory',
            target: configTargets[0],
            directoryTarget: serviceDirectory,
            targets: cleanupTargets,
            serviceTargets,
            requiresAdmin
          }
        })
      }
    }

    const softwareCleanupAvailable = registeredOperations.some(
      ({ action }) => action.kind === 'trash-service-software'
    )
    const dataCleanupAvailable = softwareCleanupAvailable && !appPath
    const directoryCleanupAvailable = registeredOperations.some(
      ({ action }) => action.kind === 'trash-service-directory'
    )
    const displayAppName = appName ?? (foundApp ? path.basename(foundApp, '.app') : null)
    return registerCandidate(
      actions,
      {
        section: 'services',
        name: label,
        subtitle: displayAppName
          ? `${displayAppName}${foundApp && !appPath ? t(language, '（已缺失）', ' (missing)') : ''} · ${target.startsWith(HOME) ? t(language, '用户登录启动项', 'User login item') : t(language, '全局登录启动项', 'System login item')}`
          : target.startsWith(HOME)
            ? t(language, '用户登录启动项', 'User login item')
            : t(language, '全局登录启动项', 'System login item'),
        description: directoryCleanupAvailable
          ? t(language, '已从启动配置确认服务使用的工作目录。可以只移除当前启动项；确认不再需要同目录中的源码和数据后，也可以移除相关服务并将整个目录移到废纸篓。', 'The service working directory was confirmed from its launch configuration. You can remove only this startup item, or, after confirming the source code and data are no longer needed, remove related services and move the entire directory to the Trash.')
          : dataCleanupAvailable
          ? t(language, '已从启动配置中的精确路径定位到服务程序和专用数据目录，可选择停止，或审阅后将同组启动项与关联数据移到废纸篓。', 'Exact paths in the launch configuration identify the service program and its dedicated data directory. You can stop it, or review and move the grouped launch items and associated data to the Trash.')
          : softwareCleanupAvailable
          ? t(language, '已从启动配置中的可执行路径定位到关联应用，可选择仅停止，或审阅后移除应用与精确匹配的数据。', 'The associated application was identified from the launch configuration. You can stop only, or review and remove the application and exactly matched data.')
          : foundApp && !appPath
            ? t(language, '启动配置指向的应用已经不存在，可停止仍在反复尝试启动的服务并移除失效配置。', 'The application referenced by this launch configuration is missing. The service can be stopped and its stale configuration removed.')
            : appPath
            ? t(language, '已定位关联应用，但它位于自动清理白名单之外；请使用软件自带卸载器，本工具只提供停止操作。', 'The associated application was identified but is outside the automatic cleanup allowlist. Use its own uninstaller; Memento only offers a stop action.')
            : isLoaded
              ? t(language, '当前服务已加载。可以只停止，也可以移除启动项；移除启动项不会删除程序目录或用户数据。', 'The service is loaded. You can stop it only or remove its startup item. Removing the startup item does not delete its program directory or user data.')
              : t(language, '服务已经停止，但启动配置仍然存在。可以移除启动项，程序目录和用户数据会继续保留。', 'The service is stopped, but its launch configuration remains. You can remove the startup item while keeping its program directory and user data.'),
        ageDays,
        risk: 'review',
        status: isLoaded ? t(language, '已加载', 'Loaded') : t(language, '已停止', 'Stopped'),
        location: serviceLocation ?? undefined,
        evidence
      },
      undefined,
      registeredOperations,
      revealTargets,
      serviceLocation ?? undefined
    )
  })
}

async function scanServices(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const [brewServices, launchAgents] = await Promise.all([
    scanBrewServices(actions, language),
    scanLaunchAgents(actions, revealTargets, language)
  ])
  return [...brewServices, ...launchAgents]
}

interface StorageDefinition {
  name: { zh: string; en: string }
  target: string
  description: { zh: string; en: string }
  risk: 'safe' | 'review' | 'protected'
  minimumBytes?: number
  action?: boolean
}

const storageDefinitions: StorageDefinition[] = [
  {
    name: { zh: 'Xcode DerivedData', en: 'Xcode DerivedData' },
    target: path.join(HOME, 'Library/Developer/Xcode/DerivedData'),
    description: { zh: '编译中间产物。Xcode 会在下次构建时重新生成。', en: 'Intermediate build output that Xcode regenerates during the next build.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'Xcode Archives', en: 'Xcode Archives' },
    target: path.join(HOME, 'Library/Developer/Xcode/Archives'),
    description: { zh: '已归档的构建产物，可能仍用于崩溃符号化或重新分发。', en: 'Archived builds that may still be needed for crash symbolication or redistribution.' },
    risk: 'review',
    action: true
  },
  {
    name: { zh: 'iOS DeviceSupport', en: 'iOS DeviceSupport' },
    target: path.join(HOME, 'Library/Developer/Xcode/iOS DeviceSupport'),
    description: { zh: '连接过的 iOS 版本调试支持文件，可按需重新生成。', en: 'Debug support files for previously connected iOS versions. They can be regenerated when needed.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'Homebrew 下载缓存', en: 'Homebrew download cache' },
    target: path.join(HOME, 'Library/Caches/Homebrew'),
    description: { zh: '已下载的软件包和源码缓存，不影响已安装的软件。', en: 'Downloaded packages and source archives. Installed software is not affected.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'npm 内容缓存', en: 'npm content cache' },
    target: path.join(HOME, '.npm/_cacache'),
    description: { zh: 'npm 下载缓存，后续安装依赖时会重新下载。', en: 'npm download cache. Dependencies may be downloaded again during future installs.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'pnpm 包存储', en: 'pnpm package store' },
    target: path.join(HOME, 'Library/pnpm/store'),
    description: { zh: 'pnpm 的共享包存储。清理后项目依赖仍保留，但新安装可能需要重新下载。', en: 'Shared pnpm package store. Existing project dependencies remain, but future installs may download packages again.' },
    risk: 'review',
    action: true
  },
  {
    name: { zh: 'Yarn 下载缓存', en: 'Yarn download cache' },
    target: path.join(HOME, 'Library/Caches/Yarn'),
    description: { zh: 'Yarn 下载缓存，不影响项目中已安装的依赖。', en: 'Yarn download cache. Dependencies already installed in projects are not affected.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'Gradle 构建缓存', en: 'Gradle build cache' },
    target: path.join(HOME, '.gradle/caches'),
    description: { zh: 'Gradle 依赖与构建缓存，后续构建会重新下载或生成。', en: 'Gradle dependencies and build cache. Future builds will download or regenerate them.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'CocoaPods 缓存', en: 'CocoaPods cache' },
    target: path.join(HOME, 'Library/Caches/CocoaPods'),
    description: { zh: 'CocoaPods 下载缓存，不会修改项目中的 Pods 目录。', en: 'CocoaPods download cache. Pods directories inside projects are not modified.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'Docker 虚拟磁盘', en: 'Docker virtual disk' },
    target: path.join(HOME, 'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw'),
    description: { zh: '包含 Docker 镜像、容器和卷。请在 Docker 内执行 prune，不应直接删除。', en: 'Contains Docker images, containers, and volumes. Manage it inside Docker instead of deleting it directly.' },
    risk: 'protected',
    minimumBytes: 100 * 1024 * 1024
  }
]

async function scanDefinedStorage(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const inspected = await mapLimit(storageDefinitions, 4, async (definition) => {
    if (!(await pathExists(definition.target))) return null
    const [stats, sizeBytes] = await Promise.all([
      fs.stat(definition.target),
      getPathSize(definition.target)
    ])
    if (sizeBytes < (definition.minimumBytes ?? 10 * 1024 * 1024)) return null

    const action = definition.action
      ? {
          kind: 'trash' as const,
          label: t(language, '移到废纸篓', 'Move to Trash'),
          consequence: t(language, '项目会被移到废纸篓。相关工具可能需要重新下载或生成这些内容。', 'The item will be moved to the Trash. Related tools may need to download or regenerate it.'),
          reversible: true
        }
      : undefined

    return registerCandidate(
      actions,
      {
        section: 'storage',
        name: language === 'en-US' ? definition.name.en : definition.name.zh,
        subtitle: displayPath(definition.target),
        description: language === 'en-US' ? definition.description.en : definition.description.zh,
        sizeBytes,
        ageDays: ageInDays(stats.mtime),
        risk: definition.risk,
        status: definition.risk === 'protected' ? t(language, '仅分析', 'Analysis only') : t(language, '可清理', 'Reclaimable'),
        location: displayPath(definition.target),
        evidence: [
          t(language, `占用 ${formatBytesForEvidence(sizeBytes)}`, `Size: ${formatBytesForEvidence(sizeBytes)}`),
          t(language, `最近修改于 ${ageInDays(stats.mtime)} 天前`, `Last modified ${ageInDays(stats.mtime)} days ago`)
        ],
        action
      },
      action ? { kind: 'trash', target: definition.target } : undefined,
      [],
      revealTargets,
      definition.target
    )
  })
  return inspected.filter((item): item is ScanCandidate => item !== null)
}

function formatBytesForEvidence(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

async function scanApplicationCaches(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  excludedTargets: Set<string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const cacheRoot = path.join(HOME, 'Library/Caches')
  let names: string[]
  try {
    names = await fs.readdir(cacheRoot)
  } catch {
    return []
  }

  const targets = names
    .filter((name) => !name.startsWith('com.apple.') && name !== 'Homebrew' && name !== 'Yarn')
    .map((name) => path.join(cacheRoot, name))
    .filter((target) => !excludedTargets.has(target))

  const inspected = await mapLimit(targets.slice(0, 80), 6, async (target) => {
    try {
      const [stats, sizeBytes] = await Promise.all([fs.stat(target), getPathSize(target)])
      if (sizeBytes < 50 * 1024 * 1024) return null
      const name = path.basename(target)
      return registerCandidate(
        actions,
        {
          section: 'storage',
          name,
          subtitle: t(language, '应用缓存', 'Application cache'),
          description: t(language, '应用生成的缓存目录。清理后应用会在需要时重建。', 'Cache generated by an application. The application will rebuild it when needed.'),
          sizeBytes,
          ageDays: ageInDays(stats.mtime),
          risk: 'safe',
          status: t(language, '可清理', 'Reclaimable'),
          location: displayPath(target),
          evidence: [
            t(language, `位置：${displayPath(target)}`, `Location: ${displayPath(target)}`),
            t(language, `最近修改于 ${ageInDays(stats.mtime)} 天前`, `Last modified ${ageInDays(stats.mtime)} days ago`)
          ],
          action: {
            kind: 'trash',
            label: t(language, '移到废纸篓', 'Move to Trash'),
            consequence: t(language, '缓存目录会移到废纸篓，应用下次启动时可能稍慢。', 'The cache will be moved to the Trash. The application may start more slowly next time.'),
            reversible: true
          }
        },
        { kind: 'trash', target },
        [],
        revealTargets,
        target
      )
    } catch {
      return null
    }
  })

  return inspected
    .filter((item): item is ScanCandidate => item !== null)
    .sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
    .slice(0, 16)
}

async function scanBrewVersions(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((item) =>
    require('node:fs').existsSync(item)
  )
  if (!brew) return []

  let cellar: string
  try {
    cellar = (await run(brew, ['--cellar'])).stdout.trim()
  } catch {
    return []
  }

  let formulas: string[]
  try {
    formulas = await fs.readdir(cellar)
  } catch {
    return []
  }

  const candidates = await mapLimit(formulas, 5, async (formula) => {
    const formulaRoot = path.join(cellar, formula)
    try {
      const versions = (await fs.readdir(formulaRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      if (versions.length < 2) return null

      const oldVersions = versions.slice(0, -1)
      const sizeParts = await mapLimit(oldVersions, 2, (version) =>
        getPathSize(path.join(formulaRoot, version))
      )
      const sizeBytes = sizeParts.reduce((sum, value) => sum + value, 0)
      if (sizeBytes < 5 * 1024 * 1024) return null

      return registerCandidate(
        actions,
        {
          section: 'storage',
          name: formula,
          subtitle: t(language, `Homebrew 保留了 ${versions.length} 个版本`, `Homebrew keeps ${versions.length} versions`),
          description: t(language, '旧 keg 通常可以由 Homebrew 安全清理，当前版本会保留。', 'Homebrew can usually clean old kegs safely while keeping the current version.'),
          sizeBytes,
          risk: 'safe',
          status: t(language, '旧版本', 'Old versions'),
          location: displayPath(formulaRoot),
          evidence: [
            t(language, `保留当前版本 ${versions.at(-1)}`, `Current version kept: ${versions.at(-1)}`),
            t(language, `待清理版本：${oldVersions.join(', ')}`, `Versions to clean: ${oldVersions.join(', ')}`)
          ],
          action: {
            kind: 'brew-cleanup',
            label: t(language, '清理旧版本', 'Clean old versions'),
            consequence: t(language, `Homebrew 将清理 ${formula} 的旧版本，当前版本不受影响。`, `Homebrew will clean old ${formula} versions. The current version is not affected.`),
            reversible: false
          }
        },
        { kind: 'brew-cleanup', target: formula },
        [],
        revealTargets,
        formulaRoot
      )
    } catch {
      return null
    }
  })

  return candidates.filter((item): item is ScanCandidate => item !== null)
}

async function scanStorage(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const definedTargets = new Set(storageDefinitions.map((item) => item.target))
  const [defined, caches, brewVersions] = await Promise.all([
    scanDefinedStorage(actions, revealTargets, language),
    scanApplicationCaches(actions, revealTargets, definedTargets, language),
    scanBrewVersions(actions, revealTargets, language)
  ])
  return [...defined, ...caches, ...brewVersions].sort(
    (a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)
  )
}

interface ApplicationMetadata {
  target: string
  name: string
  bundleId: string | null
  version: string
  sizeBytes: number
  lastUsedAt: Date | null
}

async function findApplications(root: string, depth = 2): Promise<string[]> {
  if (depth < 0) return []
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(root, { withFileTypes: true }) as never
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries as unknown as import('node:fs').Dirent[]) {
    if (!entry.isDirectory()) continue
    const target = path.join(root, entry.name)
    if (entry.name.endsWith('.app')) {
      found.push(target)
    } else if (!entry.name.startsWith('.') && depth > 0) {
      found.push(...(await findApplications(target, depth - 1)))
    }
  }
  return found
}

async function inspectApplication(target: string, language: AppLanguage): Promise<ApplicationMetadata | null> {
  try {
    const { stdout } = await run('/usr/bin/mdls', [
      '-name',
      'kMDItemCFBundleIdentifier',
      '-name',
      'kMDItemVersion',
      '-name',
      'kMDItemLastUsedDate',
      '-name',
      'kMDItemFSSize',
      target
    ])
    const sizeValue = parseMetadataValue(stdout, 'kMDItemFSSize')
    const dateValue = parseMetadataValue(stdout, 'kMDItemLastUsedDate')
    return {
      target,
      name: path.basename(target, '.app'),
      bundleId: parseMetadataValue(stdout, 'kMDItemCFBundleIdentifier'),
      version: parseMetadataValue(stdout, 'kMDItemVersion') ?? t(language, '未知版本', 'Unknown version'),
      sizeBytes: Number.parseInt(sizeValue ?? '0', 10) || 0,
      lastUsedAt: dateValue ? new Date(dateValue) : null
    }
  } catch {
    return null
  }
}

async function scanApplications(
  actions: Map<string, RegisteredAction>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const appPaths = [
    ...(await findApplications('/Applications')),
    ...(await findApplications(path.join(HOME, 'Applications')))
  ]
  const inspected = await mapLimit([...new Set(appPaths)], 8, (target) => inspectApplication(target, language))
  const applications = inspected.filter((item): item is ApplicationMetadata => item !== null)
  const candidatePaths = new Set<string>()
  const candidates: ScanCandidate[] = []

  const byBundle = new Map<string, ApplicationMetadata[]>()
  for (const application of applications) {
    if (!application.bundleId) continue
    const group = byBundle.get(application.bundleId) ?? []
    group.push(application)
    byBundle.set(application.bundleId, group)
  }

  for (const group of byBundle.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true })
    )
    const newest = sorted.at(-1)!
    for (const application of sorted.slice(0, -1)) {
      candidatePaths.add(application.target)
      candidates.push(
        registerCandidate(
          actions,
          {
            section: 'applications',
            name: application.name,
            subtitle: t(language, `${application.version}，另有 ${newest.version}`, `${application.version}; ${newest.version} is also installed`),
            description: t(language, '检测到相同 Bundle ID 的多个应用副本。建议核对路径和插件兼容性。', 'Multiple application copies share the same Bundle ID. Review their locations and plug-in compatibility.'),
            sizeBytes: application.sizeBytes,
            ageDays: application.lastUsedAt ? ageInDays(application.lastUsedAt) : undefined,
            risk: 'review',
            status: t(language, '重复版本', 'Duplicate version'),
            evidence: [
              t(language, `旧副本：${displayPath(application.target)}`, `Older copy: ${displayPath(application.target)}`),
              t(language, `保留候选：${displayPath(newest.target)}`, `Suggested copy to keep: ${displayPath(newest.target)}`)
            ],
            action: {
              kind: 'trash',
              label: t(language, '移到废纸篓', 'Move to Trash'),
              consequence: t(language, '这个应用副本会被移到废纸篓，应用数据和偏好设置会保留。', 'This application copy will be moved to the Trash. Its data and preferences remain.'),
              reversible: true
            }
          },
          { kind: 'trash', target: application.target }
        )
      )
    }
  }

  for (const application of applications) {
    if (
      candidatePaths.has(application.target) ||
      !application.lastUsedAt ||
      ageInDays(application.lastUsedAt) < 180
    ) {
      continue
    }
    const ageDays = ageInDays(application.lastUsedAt)
    candidates.push(
      registerCandidate(
        actions,
        {
          section: 'applications',
          name: application.name,
          subtitle: t(language, `版本 ${application.version}`, `Version ${application.version}`),
          description: t(language, 'Spotlight 记录显示该应用已超过半年没有使用。应用数据不会随应用本体一起删除。', 'Spotlight indicates that this application has not been used for more than six months. Its data is not removed with the application bundle.'),
          sizeBytes: application.sizeBytes,
          ageDays,
          risk: 'review',
          status: t(language, '长期未使用', 'Not used recently'),
          evidence: [
            t(language, `${ageDays} 天未使用`, `Not used for ${ageDays} days`),
            t(language, `位置：${displayPath(application.target)}`, `Location: ${displayPath(application.target)}`)
          ],
          action: {
            kind: 'trash',
            label: t(language, '移到废纸篓', 'Move to Trash'),
            consequence: t(language, '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。', 'The application bundle will be moved to the Trash. Documents, data, and preferences remain.'),
            reversible: true
          }
        },
        { kind: 'trash', target: application.target }
      )
    )
  }

  return candidates.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0))
}

async function measureShell(shell: string, clean: boolean): Promise<number | null> {
  const args = shell.endsWith('zsh')
    ? clean
      ? ['-dfi', '-c', 'exit']
      : ['-i', '-c', 'exit']
    : clean
      ? ['--noprofile', '--norc', '-i', '-c', 'exit']
      : ['-i', '-c', 'exit']
  const samples: number[] = []

  for (let index = 0; index < 3; index += 1) {
    const started = performance.now()
    try {
      await run(shell, args, 10_000)
      samples.push(performance.now() - started)
    } catch {
      const duration = performance.now() - started
      if (duration < 9_900) samples.push(duration)
    }
  }

  if (!samples.length) return null
  samples.sort((a, b) => a - b)
  return Math.round(samples[Math.floor(samples.length / 2)])
}

interface ShellRule {
  code: TerminalFinding['code']
  pattern: RegExp
  title: { zh: string; en: string }
  detail: { zh: string; en: string }
  recommendation: { zh: string; en: string }
}

const shellRules: ShellRule[] = [
  {
    code: 'nvm_eager_load',
    pattern: /\b(nvm\.sh|nvm use|NVM_DIR)\b/,
    title: { zh: 'NVM 在启动阶段加载', en: 'NVM loads during shell startup' },
    detail: { zh: 'NVM 的 shell 脚本会同步读取文件系统，常见于启动延迟。', en: 'The NVM shell script reads the file system synchronously and commonly adds startup delay.' },
    recommendation: { zh: '改为首次调用 node、npm 或 nvm 时再延迟加载。', en: 'Load NVM lazily when node, npm, or nvm is first used.' }
  },
  {
    code: 'pyenv_eager_init',
    pattern: /\bpyenv init\b/,
    title: { zh: 'pyenv 每次启动初始化', en: 'pyenv initializes on every startup' },
    detail: { zh: 'pyenv init 会创建补全和 shim 配置，可能增加交互 shell 的启动时间。', en: 'pyenv init configures completions and shims and may increase interactive shell startup time.' },
    recommendation: { zh: '只在交互 shell 中初始化，并检查是否重复调用。', en: 'Initialize it only in interactive shells and check for duplicate calls.' }
  },
  {
    code: 'conda_eager_init',
    pattern: /\b(conda initialize|conda\.sh)\b/,
    title: { zh: 'Conda 自动初始化', en: 'Conda initializes automatically' },
    detail: { zh: 'Conda 注入的启动片段通常较长，也可能执行外部命令。', en: 'The startup block injected by Conda is usually long and may run external commands.' },
    recommendation: { zh: '关闭 base 自动激活，或改为需要时手动初始化。', en: 'Disable automatic base activation or initialize Conda only when needed.' }
  },
  {
    code: 'ruby_manager_eager_init',
    pattern: /\b(rbenv init|rvm\/scripts\/rvm)\b/,
    title: { zh: 'Ruby 版本管理器初始化', en: 'Ruby version manager initializes at startup' },
    detail: { zh: 'Ruby 环境管理器会在每个新终端中执行初始化脚本。', en: 'The Ruby environment manager runs its initialization script in every new terminal.' },
    recommendation: { zh: '检查是否可以延迟加载，或删除不再使用的版本管理器。', en: 'Consider lazy loading or remove a version manager that is no longer used.' }
  },
  {
    code: 'compinit_detected',
    pattern: /\bcompinit\b/,
    title: { zh: 'Zsh 补全系统初始化', en: 'Zsh completion system initializes at startup' },
    detail: { zh: '未缓存或重复执行的 compinit 会明显拖慢终端启动。', en: 'Uncached or repeated compinit calls can noticeably slow terminal startup.' },
    recommendation: { zh: '复用 .zcompdump，并确保配置中只调用一次 compinit。', en: 'Reuse .zcompdump and ensure compinit is called only once.' }
  },
  {
    code: 'network_call_during_startup',
    pattern: /\b(curl|wget)\b[^\n]*https?:\/\//,
    title: { zh: '启动时访问网络', en: 'Network access during shell startup' },
    detail: { zh: '终端配置包含同步网络请求，网络波动会直接阻塞窗口打开。', en: 'The shell configuration contains a synchronous network request that can block terminal startup.' },
    recommendation: { zh: '把网络检查移到后台任务，避免在 shell 启动路径执行。', en: 'Move network checks to a background task outside the shell startup path.' }
  }
]

async function inspectShellFiles(language: AppLanguage): Promise<{
  findings: TerminalFinding[]
  configFiles: TerminalConfigFile[]
}> {
  const files = ['.zshenv', '.zprofile', '.zshrc', '.zlogin']
  const findings: TerminalFinding[] = []
  const configFiles: TerminalConfigFile[] = []

  for (const filename of files) {
    const target = path.join(HOME, filename)
    let content: string
    try {
      content = await fs.readFile(target, 'utf8')
    } catch {
      configFiles.push({
        logicalPath: `~/${filename}` as TerminalConfigFile['logicalPath'],
        exists: false
      })
      continue
    }

    const lines = content.split('\n')
    const sizeBytes = Buffer.byteLength(content)
    configFiles.push({
      logicalPath: `~/${filename}` as TerminalConfigFile['logicalPath'],
      exists: true,
      lineCount: lines.length,
      sizeBytes
    })
    if (lines.length > 350 || Buffer.byteLength(content) > 40 * 1024) {
      findings.push({
        id: randomUUID(),
        code: 'shell_file_large',
        title: t(language, `${filename} 配置较大`, `${filename} is a large configuration file`),
        detail: t(language, `包含 ${lines.length} 行配置，较大的启动文件更容易积累重复初始化。`, `It contains ${lines.length} lines. Large startup files are more likely to accumulate duplicate initialization.`),
        severity: 'notice',
        source: displayPath(target),
        recommendation: t(language, '按功能拆分配置，并删除已经停用的插件初始化片段。', 'Split the configuration by purpose and remove initialization blocks for disabled plug-ins.'),
        attributes: { lineCount: lines.length, sizeBytes }
      })
    }

    for (const rule of shellRules) {
      const lineIndex = lines.findIndex((line) => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('#') && rule.pattern.test(trimmed)
      })
      if (lineIndex === -1) continue
      findings.push({
        id: randomUUID(),
        code: rule.code,
        title: language === 'en-US' ? rule.title.en : rule.title.zh,
        detail: language === 'en-US' ? rule.detail.en : rule.detail.zh,
        severity: 'notice',
        source: `${displayPath(target)}:${lineIndex + 1}`,
        recommendation: language === 'en-US' ? rule.recommendation.en : rule.recommendation.zh,
        attributes: { line: lineIndex + 1 }
      })
    }
  }

  const pathEntries = (process.env.PATH ?? '').split(':').filter(Boolean)
  const missing = (
    await Promise.all(
      pathEntries.map(async (entry) => ({ entry, exists: await pathExists(entry) }))
    )
  ).filter(({ exists }) => !exists)
  const duplicateCount = pathEntries.length - new Set(pathEntries).size
  if (missing.length) {
    findings.push({
      id: randomUUID(),
      code: 'path_missing_entries',
      title: t(language, 'PATH 中有无效目录', 'PATH contains missing directories'),
      detail: t(language, `${missing.length} 个目录不存在。`, `${missing.length} directories do not exist.`),
      severity: 'notice',
      source: t(language, '当前 shell 环境', 'Current shell environment'),
      recommendation: t(language, '清理 PATH 拼接逻辑，移除已经不存在的目录。', 'Clean up PATH construction and remove directories that no longer exist.'),
      attributes: { missingCount: missing.length }
    })
  }
  if (duplicateCount) {
    findings.push({
      id: randomUUID(),
      code: 'path_duplicate_entries',
      title: t(language, 'PATH 中有重复目录', 'PATH contains duplicate directories'),
      detail: t(language, `${duplicateCount} 个目录被重复添加。`, `${duplicateCount} directories were added more than once.`),
      severity: 'notice',
      source: t(language, '当前 shell 环境', 'Current shell environment'),
      recommendation: t(language, '检查 PATH 拼接逻辑，避免多个插件反复追加同一目录。', 'Review PATH construction so multiple plug-ins do not append the same directory.'),
      attributes: { duplicateCount }
    })
  }

  return { findings, configFiles }
}

async function scanTerminal(language: AppLanguage): Promise<ScanResult['terminal']> {
  const shell = process.env.SHELL || '/bin/zsh'
  const [baselineMs, startupMs, fileInspection] = await Promise.all([
    measureShell(shell, true),
    measureShell(shell, false),
    inspectShellFiles(language)
  ])
  const findings: TerminalFinding[] = []

  if (startupMs !== null) {
    const severity = startupMs > 700 ? 'slow' : startupMs > 300 ? 'notice' : 'good'
    findings.push({
      id: randomUUID(),
      code: severity === 'good' ? 'shell_startup_normal' : 'shell_startup_slow',
      title:
        severity === 'slow'
          ? t(language, '交互 shell 启动偏慢', 'Interactive shell startup is slow')
          : severity === 'notice'
            ? t(language, '交互 shell 有优化空间', 'Interactive shell startup can be improved')
            : t(language, '交互 shell 启动正常', 'Interactive shell startup is normal'),
      detail: t(language, `三次测量取中位数，完整配置耗时 ${startupMs} ms。`, `The median of three measurements is ${startupMs} ms with the full configuration.`),
      severity,
      durationMs: startupMs,
      source: shell,
      recommendation:
        severity === 'good' ? undefined : t(language, '优先处理下方命中的同步初始化项，然后重新扫描。', 'Review the synchronous initialization findings below, then scan again.')
    })
  } else {
    findings.push({
      id: randomUUID(),
      code: 'shell_measurement_timeout',
      title: t(language, '无法完成 shell 计时', 'Shell timing did not complete'),
      detail: t(language, 'shell 在超时前没有正常退出，配置中可能存在阻塞命令。', 'The shell did not exit before the timeout. Its configuration may contain a blocking command.'),
      severity: 'slow',
      source: shell,
      recommendation: t(language, '在终端运行 zsh -xlic exit，检查最后停留的初始化命令。', 'Trace an interactive shell startup and inspect the last initialization step reached.')
    })
  }

  if (baselineMs !== null && startupMs !== null) {
    const configCost = Math.max(0, startupMs - baselineMs)
    findings.push({
      id: randomUUID(),
      code: configCost > 150 ? 'shell_config_cost_high' : 'shell_config_cost_normal',
      title: t(language, '配置层额外耗时', 'Additional configuration cost'),
      detail: t(language, `无配置基线 ${baselineMs} ms，用户配置增加约 ${configCost} ms。`, `The clean baseline is ${baselineMs} ms; user configuration adds about ${configCost} ms.`),
      severity: configCost > 400 ? 'slow' : configCost > 150 ? 'notice' : 'good',
      durationMs: configCost,
      source: t(language, '启动基线对比', 'Startup baseline comparison')
    })
  }

  return {
    shell,
    baselineMs,
    startupMs,
    sampleCount: 3,
    findings: [...findings, ...fileInspection.findings],
    configFiles: fileInspection.configFiles
  }
}

export async function runFullScan(
  onProgress: (progress: ScanProgress) => void,
  language: AppLanguage = 'zh-CN'
): Promise<ScanBundle> {
  const startedAt = new Date().toISOString()
  const actions = new Map<string, RegisteredAction>()
  const revealTargets = new Map<string, string>()
  const warnings: string[] = []

  onProgress({ section: 'system', progress: 4, message: t(language, '读取系统状态', 'Reading system status') })
  const system = await scanSystem()

  if (process.platform !== 'darwin') {
    const warning = t(
      language,
      '当前维护扫描仅支持 macOS；此版本只提供界面和 AI 设置预览。',
      'Maintenance scanning currently supports macOS only. This build provides a preview of the desktop UI and AI settings.'
    )
    onProgress({ section: 'system', progress: 100, message: warning })
    return {
      actions,
      revealTargets,
      result: {
        scanId: randomUUID(),
        startedAt,
        completedAt: new Date().toISOString(),
        system,
        candidates: [],
        terminal: {
          shell: process.env.ComSpec || process.env.SHELL || 'unsupported',
          baselineMs: null,
          startupMs: null,
          sampleCount: 0,
          findings: [],
          configFiles: []
        },
        warnings: [warning]
      }
    }
  }

  onProgress({ section: 'services', progress: 12, message: t(language, '检查后台服务与登录启动项', 'Checking background services and login items') })
  const servicesPromise = scanServices(actions, revealTargets, language).catch((error: Error) => {
    warnings.push(t(language, `服务扫描未完成：${error.message}`, `Service scan did not complete: ${error.message}`))
    return []
  })

  onProgress({ section: 'storage', progress: 26, message: t(language, '统计开发工具与应用缓存', 'Measuring developer tool and application caches') })
  const storagePromise = scanStorage(actions, revealTargets, language).catch((error: Error) => {
    warnings.push(t(language, `存储扫描未完成：${error.message}`, `Storage scan did not complete: ${error.message}`))
    return []
  })

  onProgress({ section: 'applications', progress: 44, message: t(language, '核对应用版本与最后使用时间', 'Checking application versions and last-used dates') })
  const applicationsPromise = scanApplications(actions, language).catch((error: Error) => {
    warnings.push(t(language, `应用扫描未完成：${error.message}`, `Application scan did not complete: ${error.message}`))
    return []
  })

  onProgress({ section: 'terminal', progress: 62, message: t(language, '测量终端启动并分析 shell 配置', 'Measuring terminal startup and analyzing shell configuration') })
  const terminalPromise = scanTerminal(language).catch((error: Error) => {
    warnings.push(t(language, `终端诊断未完成：${error.message}`, `Terminal diagnostics did not complete: ${error.message}`))
    return {
      shell: process.env.SHELL || '/bin/zsh',
      baselineMs: null,
      startupMs: null,
      sampleCount: 0,
      findings: [],
      configFiles: []
    }
  })

  const [services, storage, applications, terminal] = await Promise.all([
    servicesPromise,
    storagePromise,
    applicationsPromise,
    terminalPromise
  ])
  onProgress({ section: 'system', progress: 96, message: t(language, '整理建议并建立操作白名单', 'Preparing recommendations and the action allowlist') })

  const result: ScanResult = {
    scanId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    system,
    candidates: [...services, ...storage, ...applications],
    terminal,
    warnings
  }
  onProgress({ section: 'system', progress: 100, message: t(language, '扫描完成', 'Scan complete') })
  return { result, actions, revealTargets }
}

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import type { Dirent, Stats } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type {
  ActionKind,
  ApplicationScope,
  CandidateOperation,
  InstalledApplication,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  ScanSection,
  ServiceAnomalyKind,
  ServiceRuntimeMetrics,
  SystemSnapshot,
  TerminalConfigFile,
  TerminalFinding
} from '../shared/types'
import type { AppLanguage } from '../shared/app-settings'
import {
  parseDiskFree,
  parseDuKilobytes,
  parseLaunchctlEntries,
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
import {
  terminalContentHash,
  type RegisteredTerminalFix
} from './terminal-fixes'
import { brewCleanupVersionTargets } from './brew-cleanup'
import {
  commandSearchRoots,
  discoverHiddenHomeArtifacts,
  installedApplicationIdentityTokens,
  installedCommandIdentityTokens,
  type HiddenHomeArtifactSource
} from './home-hidden-cleanup'

const execFileAsync = promisify(execFile)
const HOME = os.homedir()
const DAY_MS = 86_400_000
export const APPLICATION_UNUSED_DAYS = 90
const LONG_RUNNING_SERVICE_SECONDS = 30 * 24 * 60 * 60
const HIGH_SERVICE_CPU_PERCENT = 20
const HIGH_SERVICE_MEMORY_BYTES = 1024 * 1024 * 1024

function t(language: AppLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

export type RegisteredAction =
  | {
      kind: Exclude<ActionKind, 'trash-launch-agent-config' | 'trash-service-software' | 'trash-service-directory' | 'brew-cleanup' | 'delete-storage-group' | 'trash-home-artifact'>
      target: string
    }
  | {
      kind: 'delete-storage-group'
      target: string
      targets: string[]
    }
  | {
      kind: 'trash-home-artifact'
      target: string
      expectedModifiedAtMs: number
      expectedKind: 'directory'
    }
  | {
      kind: 'brew-cleanup'
      target: string
      formulaRoot: string
      removableVersions: string[]
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
  terminalFixes: Map<string, RegisteredTerminalFix>
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
    env: { ...process.env, LC_ALL: 'C', HOMEBREW_NO_AUTO_UPDATE: '1' }
  })
  return { stdout: result.stdout, stderr: result.stderr }
}

function parseElapsedSeconds(value: string): number | undefined {
  const match = value.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/)
  if (!match) return undefined
  const [, days = '0', hours = '0', minutes, seconds] = match
  return Number(days) * 86_400 + Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds)
}

async function inspectServiceProcess(pid?: number | null): Promise<ServiceRuntimeMetrics | undefined> {
  if (!pid || pid <= 0) return undefined
  try {
    const { stdout } = await run('/bin/ps', ['-p', String(pid), '-o', 'etime=,%cpu=,rss='])
    const match = stdout.trim().match(/^(\S+)\s+([\d.]+)\s+(\d+)$/)
    if (!match) return { pid }
    return {
      pid,
      runningSeconds: parseElapsedSeconds(match[1]),
      cpuPercent: Number.parseFloat(match[2]),
      memoryBytes: Number.parseInt(match[3], 10) * 1024
    }
  } catch {
    return { pid }
  }
}

export function classifyServiceAnomalies(input: {
  loaded: boolean
  programMissing?: boolean
  ageDays?: number
  failed?: boolean
  metrics?: ServiceRuntimeMetrics
}): ServiceAnomalyKind[] {
  const anomalies: ServiceAnomalyKind[] = []
  if (input.programMissing) anomalies.push('orphaned')
  if (input.failed) anomalies.push('failed')
  if ((input.metrics?.cpuPercent ?? 0) >= HIGH_SERVICE_CPU_PERCENT) anomalies.push('high-cpu')
  if ((input.metrics?.memoryBytes ?? 0) >= HIGH_SERVICE_MEMORY_BYTES) anomalies.push('high-memory')
  if ((input.metrics?.runningSeconds ?? 0) >= LONG_RUNNING_SERVICE_SECONDS) anomalies.push('long-running')
  if (!input.loaded && (input.ageDays ?? 0) >= 180) anomalies.push('stale')
  return anomalies
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

export function isApplicationUnused(lastUsedAt: Date | null, now = Date.now()): boolean {
  if (!lastUsedAt) return false
  return Math.max(0, Math.floor((now - lastUsedAt.getTime()) / DAY_MS)) >= APPLICATION_UNUSED_DAYS
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

    return mapLimit(
      services.filter((service) => service.status === 'started' || service.status === 'error' || Boolean(service.pid)),
      5,
      async (service) => {
        const running = service.status === 'started' || Boolean(service.pid)
        const metrics = await inspectServiceProcess(service.pid)
        const serviceAnomalies = classifyServiceAnomalies({
          loaded: running,
          failed: service.status === 'error',
          metrics
        })
        const runtimeEvidence = metrics?.runningSeconds
          ? t(language, `已连续运行 ${Math.floor(metrics.runningSeconds / 86_400)} 天`, `Running continuously for ${Math.floor(metrics.runningSeconds / 86_400)} days`)
          : null
        const resourceEvidence = metrics?.cpuPercent !== undefined && metrics.memoryBytes !== undefined
          ? t(language, `CPU ${metrics.cpuPercent.toFixed(1)}% · 内存 ${formatBytesForEvidence(metrics.memoryBytes)}`, `CPU ${metrics.cpuPercent.toFixed(1)}% · Memory ${formatBytesForEvidence(metrics.memoryBytes)}`)
          : null
        return registerCandidate(
          actions,
          {
            section: 'services',
            name: service.name,
            subtitle: t(language, 'Homebrew 后台服务', 'Homebrew background service'),
            description: t(language, '登录后持续运行。停止后不会卸载软件，之后仍可重新启动。', 'Runs continuously after login. Stopping it does not uninstall the software, and it can be started again.'),
            risk: 'review',
            status: service.status === 'error'
              ? t(language, '启动异常', 'Startup failed')
              : service.pid ? t(language, `运行中，PID ${service.pid}`, `Running, PID ${service.pid}`) : t(language, '运行中', 'Running'),
            evidence: [
              service.user ? t(language, `运行用户：${service.user}`, `User: ${service.user}`) : t(language, '由当前用户启动', 'Started by the current user'),
              service.file ? t(language, `配置：${displayPath(service.file)}`, `Configuration: ${displayPath(service.file)}`) : t(language, '由 Homebrew 管理', 'Managed by Homebrew'),
              ...(runtimeEvidence ? [runtimeEvidence] : []),
              ...(resourceEvidence ? [resourceEvidence] : [])
            ],
            serviceAnomalies,
            serviceMetrics: metrics,
            action: running ? {
              kind: 'stop-brew-service',
              label: t(language, '停止服务', 'Stop service'),
              consequence: t(language, '服务将立即停止，并取消登录时自动启动。', 'The service will stop immediately and no longer start automatically at login.'),
              reversible: true
            } : undefined
          },
          running ? { kind: 'stop-brew-service', target: service.name } : undefined
        )
      }
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
  let loadedEntries = new Map<string, number | null>()

  try {
    const { stdout } = await run('/bin/launchctl', ['list'])
    loadedEntries = parseLaunchctlEntries(stdout)
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
    const isLoaded = loadedEntries.has(label)
    const metrics = await inspectServiceProcess(loadedEntries.get(label))
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

    let programMissing = false
    if (program) {
      evidence.push(t(language, `程序：${displayPath(program)}`, `Program: ${displayPath(program)}`))
      if (!(await pathExists(program))) {
        programMissing = true
        evidence.push(
          t(
            language,
            `配置指向的程序位置已不存在：${displayPath(program)}`,
            `The program location in the configuration no longer exists: ${displayPath(program)}`
          )
        )
      }
    }
    const serviceAnomalies = classifyServiceAnomalies({
      loaded: isLoaded,
      programMissing,
      ageDays,
      metrics
    })
    if (metrics?.runningSeconds) evidence.push(t(language, `已连续运行 ${Math.floor(metrics.runningSeconds / 86_400)} 天`, `Running continuously for ${Math.floor(metrics.runningSeconds / 86_400)} days`))
    if (metrics?.cpuPercent !== undefined && metrics.memoryBytes !== undefined) evidence.push(t(language, `CPU ${metrics.cpuPercent.toFixed(1)}% · 内存 ${formatBytesForEvidence(metrics.memoryBytes)}`, `CPU ${metrics.cpuPercent.toFixed(1)}% · Memory ${formatBytesForEvidence(metrics.memoryBytes)}`))
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
        .filter((entry) => entry.appPath === appPath && loadedEntries.has(entry.label))
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
        .filter((entry) => loadedEntries.has(entry.label))
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
        .filter((entry) => loadedEntries.has(entry.label))
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
        serviceAnomalies,
        serviceMetrics: metrics,
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

interface StorageGroupDefinition {
  name: { zh: string; en: string }
  description: { zh: string; en: string }
  targets: string[]
}

const storageGroupDefinitions: StorageGroupDefinition[] = [
  {
    name: { zh: 'Claude 可重建缓存', en: 'Claude rebuildable caches' },
    description: { zh: 'Claude Desktop 与 Claude Code 的网页、GPU、MCP 日志和下载缓存；不会删除登录、配置、对话或项目文件。', en: 'Web, GPU, MCP log, and download caches from Claude Desktop and Claude Code. Login, settings, conversations, and projects are preserved.' },
    targets: [
      path.join(HOME, 'Library/Caches/com.anthropic.claudefordesktop'),
      path.join(HOME, 'Library/Caches/claude-cli-nodejs'),
      path.join(HOME, 'Library/Application Support/Claude/Cache'),
      path.join(HOME, 'Library/Application Support/Claude/Code Cache'),
      path.join(HOME, 'Library/Application Support/Claude/GPUCache'),
      path.join(HOME, 'Library/Application Support/Claude/Service Worker/CacheStorage'),
      path.join(HOME, 'Library/Application Support/Claude/Shared Dictionary/cache'),
      path.join(HOME, '.claude/cache')
    ]
  },
  {
    name: { zh: 'Codex 可重建缓存', en: 'Codex rebuildable caches' },
    description: { zh: 'Codex App 与 Codex CLI 的浏览器、GPU、日志和临时缓存；不会删除配置、凭据、会话或项目文件。', en: 'Browser, GPU, log, and temporary caches from Codex App and Codex CLI. Settings, credentials, sessions, and projects are preserved.' },
    targets: [
      path.join(HOME, 'Library/Caches/Codex'),
      path.join(HOME, 'Library/Caches/com.openai.codex'),
      path.join(HOME, 'Library/Application Support/Codex/Default/Cache'),
      path.join(HOME, 'Library/Application Support/Codex/Default/Code Cache'),
      path.join(HOME, 'Library/Application Support/Codex/Default/GPUCache'),
      path.join(HOME, 'Library/Application Support/Codex/codex-browser-app/Cache'),
      path.join(HOME, 'Library/Application Support/Codex/codex-browser-app/Code Cache'),
      path.join(HOME, 'Library/Application Support/Codex/codex-browser-app/GPUCache'),
      path.join(HOME, 'Library/Application Support/Codex/GPUPersistentCache/GPUCache'),
      path.join(HOME, '.codex/log'),
      path.join(HOME, '.codex/tmp')
    ]
  },
  {
    name: { zh: 'Antigravity 可重建缓存', en: 'Antigravity rebuildable caches' },
    description: { zh: 'Antigravity 的编辑器、扩展、网页和 GPU 缓存；不会删除工作区、账号或供应商配置。', en: 'Editor, extension, web, and GPU caches from Antigravity. Workspaces, accounts, and provider settings are preserved.' },
    targets: [
      path.join(HOME, 'Library/Caches/com.google.antigravity'),
      path.join(HOME, 'Library/Caches/com.google.antigravity-ide'),
      ...['Antigravity', 'Antigravity IDE'].flatMap((directory) => [
        path.join(HOME, 'Library/Application Support', directory, 'Cache'),
        path.join(HOME, 'Library/Application Support', directory, 'CachedData'),
        path.join(HOME, 'Library/Application Support', directory, 'Code Cache'),
        path.join(HOME, 'Library/Application Support', directory, 'GPUCache'),
        path.join(HOME, 'Library/Application Support', directory, 'Service Worker/CacheStorage'),
        path.join(HOME, 'Library/Application Support', directory, 'Shared Dictionary/cache')
      ])
    ]
  },
  {
    name: { zh: 'Grok 可重建缓存', en: 'Grok rebuildable caches' },
    description: { zh: 'Grok 客户端的网页与 GPU 缓存；不会删除登录、对话或设置。', en: 'Web and GPU caches from Grok clients. Login, conversations, and settings are preserved.' },
    targets: [
      path.join(HOME, 'Library/Caches/ai.x.grok'),
      path.join(HOME, 'Library/Caches/com.xai.grok'),
      path.join(HOME, 'Library/Application Support/Grok/Cache'),
      path.join(HOME, 'Library/Application Support/Grok/Code Cache'),
      path.join(HOME, 'Library/Application Support/Grok/GPUCache'),
      path.join(HOME, 'Library/Application Support/Grok/Service Worker/CacheStorage')
    ]
  }
]

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
    risk: 'protected'
  },
  {
    name: { zh: 'iOS DeviceSupport', en: 'iOS DeviceSupport' },
    target: path.join(HOME, 'Library/Developer/Xcode/iOS DeviceSupport'),
    description: { zh: '连接过的 iOS 版本调试支持文件，可按需重新生成。', en: 'Debug support files for previously connected iOS versions. They can be regenerated when needed.' },
    risk: 'safe',
    action: true
  },
  {
    name: { zh: 'iOS 模拟器缓存', en: 'iOS simulator caches' },
    target: path.join(HOME, 'Library/Developer/CoreSimulator/Caches'),
    description: { zh: '模拟器运行时生成的可重建缓存，不会删除模拟器设备或其中的应用数据。', en: 'Rebuildable simulator runtime caches. Simulator devices and their application data are preserved.' },
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
      fs.lstat(definition.target),
      getPathSize(definition.target)
    ])
    if (stats.isSymbolicLink() || !stats.isDirectory()) return null
    if (sizeBytes < (definition.minimumBytes ?? 10 * 1024 * 1024)) return null

    const action = definition.action
      ? {
          kind: 'delete-storage' as const,
          label: t(language, '永久清理', 'Clean permanently'),
          consequence: t(language, '缓存会被永久删除并立即释放空间。相关工具之后可能需要重新下载或生成这些内容。', 'The cache will be permanently deleted to release space immediately. Related tools may need to download or regenerate it later.'),
          reversible: false
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
      action ? { kind: 'delete-storage', target: definition.target } : undefined,
      [],
      revealTargets,
      definition.target
    )
  })
  return inspected.filter((item): item is ScanCandidate => item !== null)
}

async function scanStorageGroups(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const inspected = await mapLimit(storageGroupDefinitions, 2, async (definition) => {
    const existing = (await mapLimit(definition.targets, 4, async (target) => {
      try {
        const stats = await fs.lstat(target)
        if (stats.isSymbolicLink() || !stats.isDirectory()) return null
        return { target, stats, sizeBytes: await getPathSize(target) }
      } catch {
        return null
      }
    })).filter((item): item is { target: string; stats: Stats; sizeBytes: number } => item !== null)
    const sizeBytes = existing.reduce((sum, item) => sum + item.sizeBytes, 0)
    if (!existing.length || sizeBytes < 5 * 1024 * 1024) return null
    const targets = existing.map((item) => item.target)
    const latestModifiedAt = new Date(Math.max(...existing.map((item) => item.stats.mtimeMs)))
    return registerCandidate(
      actions,
      {
        section: 'storage',
        name: language === 'en-US' ? definition.name.en : definition.name.zh,
        subtitle: t(language, `AI 客户端缓存 · ${targets.length} 个目录`, `AI client caches · ${targets.length} folders`),
        description: language === 'en-US' ? definition.description.en : definition.description.zh,
        sizeBytes,
        ageDays: ageInDays(latestModifiedAt),
        risk: 'safe',
        status: t(language, '可安全重建', 'Safely rebuildable'),
        location: displayPath(path.dirname(targets[0])),
        evidence: [
          t(language, `合计占用 ${formatBytesForEvidence(sizeBytes)}`, `Total size: ${formatBytesForEvidence(sizeBytes)}`),
          ...existing.slice(0, 5).map((item) => (
            `${displayPath(item.target)} · ${formatBytesForEvidence(item.sizeBytes)}`
          ))
        ],
        action: {
          kind: 'delete-storage-group',
          label: t(language, '清理 AI 缓存', 'Clean AI caches'),
          consequence: t(language, '只会永久删除上面列出的可重建缓存目录，客户端下次启动时可能重新下载内容。', 'Only the listed rebuildable cache folders are permanently removed. The clients may download content again on next launch.'),
          reversible: false,
          estimatedBytes: sizeBytes
        }
      },
      { kind: 'delete-storage-group', target: targets[0], targets },
      [],
      revealTargets,
      targets[0]
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
      const [stats, sizeBytes] = await Promise.all([fs.lstat(target), getPathSize(target)])
      if (stats.isSymbolicLink() || !stats.isDirectory()) return null
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
            kind: 'delete-storage',
            label: t(language, '永久清理', 'Clean permanently'),
            consequence: t(language, '缓存目录会被永久删除并立即释放空间，应用下次启动时可能稍慢。', 'The cache directory will be permanently deleted to release space immediately. The application may start more slowly next time.'),
            reversible: false
          }
        },
        { kind: 'delete-storage', target },
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

async function scanApplicationLogs(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const logRoot = path.join(HOME, 'Library/Logs')
  let entries: Dirent[]
  try {
    entries = await fs.readdir(logRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const inspected = await mapLimit(entries.slice(0, 120), 6, async (entry) => {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('com.apple.')) return null
    const target = path.join(logRoot, entry.name)
    try {
      const [stats, sizeBytes] = await Promise.all([fs.lstat(target), getPathSize(target)])
      if (stats.isSymbolicLink() || sizeBytes < 25 * 1024 * 1024) return null
      return registerCandidate(
        actions,
        {
          section: 'storage',
          name: entry.name,
          subtitle: t(language, '应用日志', 'Application logs'),
          description: t(language, '应用生成的诊断和运行日志；清理不会删除文稿或设置，但会失去旧的故障排查记录。', 'Diagnostic and runtime logs generated by applications. Documents and settings are preserved, but old troubleshooting records are removed.'),
          sizeBytes,
          ageDays: ageInDays(stats.mtime),
          risk: 'review',
          status: t(language, '建议确认', 'Review first'),
          location: displayPath(target),
          evidence: [
            t(language, `占用 ${formatBytesForEvidence(sizeBytes)}`, `Size: ${formatBytesForEvidence(sizeBytes)}`),
            t(language, `最近修改于 ${ageInDays(stats.mtime)} 天前`, `Last modified ${ageInDays(stats.mtime)} days ago`)
          ],
          action: {
            kind: 'delete-storage',
            label: t(language, '永久清理日志', 'Delete logs permanently'),
            consequence: t(language, '该应用的旧日志会永久删除并立即释放空间，文稿和设置不受影响。', 'Old logs from this application are permanently removed to release space. Documents and settings are not affected.'),
            reversible: false,
            estimatedBytes: sizeBytes
          }
        },
        { kind: 'delete-storage', target },
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
    .sort((left, right) => (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0))
    .slice(0, 12)
}

function hiddenArtifactSourceLabel(
  source: HiddenHomeArtifactSource,
  language: AppLanguage
): string {
  const labels: Record<HiddenHomeArtifactSource, [string, string]> = {
    home: ['Home 隐藏项目', 'Hidden Home item'],
    config: ['.config 隐藏配置', 'Hidden .config item'],
    cache: ['.cache 隐藏缓存', 'Hidden .cache item'],
    'local-share': ['.local/share 隐藏数据', 'Hidden .local/share data']
  }
  return language === 'en-US' ? labels[source][1] : labels[source][0]
}

async function scanHiddenHomeArtifacts(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  applications: readonly InstalledApplication[],
  language: AppLanguage
): Promise<ScanCandidate[]> {
  const installedIdentities = installedApplicationIdentityTokens(applications)
  const commandIdentities = await installedCommandIdentityTokens(commandSearchRoots(HOME))
  for (const identity of commandIdentities) installedIdentities.add(identity)
  const discovered = await discoverHiddenHomeArtifacts(installedIdentities, HOME)
  const measured = await mapLimit(discovered.slice(0, 100), 6, async (artifact) => {
    try {
      return { artifact, sizeBytes: await getPathSize(artifact.target) }
    } catch {
      return null
    }
  })

  return measured
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
    .slice(0, 40)
    .map(({ artifact, sizeBytes }) => {
      return registerCandidate(
        actions,
        {
          section: 'storage',
          name: artifact.name,
          subtitle: hiddenArtifactSourceLabel(artifact.source, language),
          description: t(
            language,
            '当前应用清单和可执行命令目录中都没有找到与它明确匹配的项目。AI 分析会继续关联本机服务、配置文件名、软件包收据和 shell 引用，请确认用途后再清理。',
            'No installed application or indexed executable command clearly matches this item. AI analysis can correlate local services, configuration names, package receipts, and shell references before cleanup.'
          ),
          sizeBytes,
          ageDays: ageInDays(artifact.modifiedAt),
          risk: 'review',
          status: t(language, '需确认归属', 'Ownership review'),
          location: displayPath(artifact.target),
          evidence: [
            t(language, `隐藏位置：${displayPath(artifact.target)}`, `Hidden location: ${displayPath(artifact.target)}`),
            t(language, '未匹配到已安装的 macOS 应用或可执行命令', 'No installed macOS application or executable command was matched'),
            t(language, `最近修改于 ${ageInDays(artifact.modifiedAt)} 天前`, `Last modified ${ageInDays(artifact.modifiedAt)} days ago`)
          ],
          action: {
            kind: 'trash-home-artifact',
            label: t(language, '移到废纸篓', 'Move to Trash'),
            consequence: t(
              language,
              '整个隐藏项目及其中的配置和数据会移到废纸篓。如果它仍被应用或命令行工具使用，相关设置可能会被重置。',
              'The entire hidden item, including its configuration and data, moves to the Trash. Settings may be reset if an app or command-line tool still uses it.'
            ),
            reversible: true,
            estimatedBytes: sizeBytes
          }
        },
        {
          kind: 'trash-home-artifact',
          target: artifact.target,
          expectedModifiedAtMs: artifact.modifiedAtMs,
          expectedKind: artifact.kind
        },
        [],
        revealTargets,
        artifact.target
      )
    })
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

  const installedFormulae = (
    await mapLimit(formulas, 10, async (formula) => {
      const formulaRoot = path.join(cellar, formula)
      try {
        const versions = (await fs.readdir(formulaRoot, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        return versions.length > 1 ? { formula, formulaRoot, versions } : null
      } catch {
        return null
      }
    })
  ).filter((item): item is { formula: string; formulaRoot: string; versions: string[] } => item !== null)
  if (!installedFormulae.length) return []

  let cleanupPreview: CommandResult
  try {
    cleanupPreview = await run(
      brew,
      ['cleanup', '--dry-run', ...installedFormulae.map((item) => item.formula)],
      60_000
    )
  } catch {
    return []
  }
  const cleanupOutput = `${cleanupPreview.stdout}\n${cleanupPreview.stderr}`
  if (!cleanupOutput.includes(`Would remove: ${cellar}${path.sep}`)) return []

  const candidates = await mapLimit(installedFormulae, 5, async ({ formula, formulaRoot, versions }) => {
    try {
      const removableVersions = brewCleanupVersionTargets(
        cleanupOutput,
        formulaRoot,
        versions
      )
      if (!removableVersions.length) return null

      const retainedVersions = versions.filter((version) => !removableVersions.includes(version))
      const sizeParts = await mapLimit(removableVersions, 2, (version) =>
        getPathSize(path.join(formulaRoot, version))
      )
      const sizeBytes = sizeParts.reduce((sum, value) => sum + value, 0)
      if (sizeBytes < 5 * 1024 * 1024) return null

      return registerCandidate(
        actions,
        {
          section: 'storage',
          name: formula,
          subtitle: t(language, `Homebrew 可清理 ${removableVersions.length} 个旧版本`, `Homebrew can clean ${removableVersions.length} old versions`),
          description: t(language, '仅展示 Homebrew 已确认可安全移除的旧 keg，正在使用的版本会保留。', 'Only old kegs that Homebrew confirms are safe to remove are shown. Versions in use are kept.'),
          sizeBytes,
          risk: 'safe',
          status: t(language, '旧版本', 'Old versions'),
          location: displayPath(formulaRoot),
          evidence: [
            t(language, `保留版本：${retainedVersions.join(', ')}`, `Versions kept: ${retainedVersions.join(', ')}`),
            t(language, `待清理版本：${removableVersions.join(', ')}`, `Versions to clean: ${removableVersions.join(', ')}`)
          ],
          action: {
            kind: 'brew-cleanup',
            label: t(language, '清理旧版本', 'Clean old versions'),
            consequence: t(language, `Homebrew 将清理 ${formula} 的旧版本，当前版本不受影响。`, `Homebrew will clean old ${formula} versions. The current version is not affected.`),
            reversible: false
          }
        },
        { kind: 'brew-cleanup', target: formula, formulaRoot, removableVersions },
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
  const definedTargets = new Set([
    ...storageDefinitions.map((item) => item.target),
    ...storageGroupDefinitions.flatMap((item) => item.targets)
  ])
  const [defined, groups, caches, logs, brewVersions] = await Promise.all([
    scanDefinedStorage(actions, revealTargets, language),
    scanStorageGroups(actions, revealTargets, language),
    scanApplicationCaches(actions, revealTargets, definedTargets, language),
    scanApplicationLogs(actions, revealTargets, language),
    scanBrewVersions(actions, revealTargets, language)
  ])
  return [...defined, ...groups, ...caches, ...logs, ...brewVersions].sort(
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
  backgroundOnly: boolean
  executable: string | null
  urlSchemes: string[]
}

interface ApplicationScan {
  candidates: ScanCandidate[]
  applications: InstalledApplication[]
}

const APPLICATION_ROOTS = [
  '/Applications',
  path.join(HOME, 'Applications'),
  '/System/Applications'
]

export function plistApplicationName(info: Record<string, unknown>): string | null {
  for (const key of ['CFBundleDisplayName', 'CFBundleName']) {
    const value = info[key]
    if (typeof value !== 'string') continue
    const name = value.trim()
    if (name && !name.includes('$(')) return name
  }
  return null
}

export function applicationNamePlistPaths(target: string, language: AppLanguage): string[] {
  const resources = path.join(target, 'Contents', 'Resources')
  const localized = language === 'zh-CN'
    ? ['zh-Hans.lproj', 'zh_CN.lproj', 'zh.lproj'].map((directory) =>
        path.join(resources, directory, 'InfoPlist.strings')
      )
    : []
  const developmentLocalization = language === 'zh-CN'
    ? [path.join(resources, 'InfoPlist.strings')]
    : []
  return [...localized, ...developmentLocalization, path.join(target, 'Contents', 'Info.plist')]
}

async function readPlist(target: string): Promise<Record<string, unknown> | null> {
  if (!(await pathExists(target))) return null
  try {
    const { stdout } = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', target])
    const value = JSON.parse(stdout) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export function applicationPlistCapabilities(info: Record<string, unknown> | null): {
  backgroundOnly: boolean
  executable: string | null
  urlSchemes: string[]
} {
  const urlTypes = Array.isArray(info?.CFBundleURLTypes) ? info.CFBundleURLTypes : []
  const urlSchemes = urlTypes.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const schemes = (value as Record<string, unknown>).CFBundleURLSchemes
    return Array.isArray(schemes)
      ? schemes.filter((scheme): scheme is string => typeof scheme === 'string')
      : []
  }).map((scheme) => scheme.trim()).filter(Boolean)
  return {
    backgroundOnly: info?.LSBackgroundOnly === true,
    executable: typeof info?.CFBundleExecutable === 'string' ? info.CFBundleExecutable : null,
    urlSchemes: [...new Set(urlSchemes)].slice(0, 20)
  }
}

export async function resolveApplicationName(
  target: string,
  language: AppLanguage
): Promise<string> {
  for (const plistPath of applicationNamePlistPaths(target, language)) {
    const info = await readPlist(plistPath)
    const name = info ? plistApplicationName(info) : null
    if (name) return name
  }
  return path.basename(target, '.app')
}

export function applicationScope(target: string): ApplicationScope {
  if (target === path.join(HOME, 'Applications') || target.startsWith(`${path.join(HOME, 'Applications')}${path.sep}`)) {
    return 'user'
  }
  if (target === '/System' || target.startsWith(`/System${path.sep}`)) return 'system'
  return 'shared'
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
  const namePromise = resolveApplicationName(target, language)
  const infoPromise = readPlist(path.join(target, 'Contents', 'Info.plist'))
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
      '-name',
      'kMDItemLogicalSize',
      target
    ])
    const sizeValue = parseMetadataValue(stdout, 'kMDItemLogicalSize') ??
      parseMetadataValue(stdout, 'kMDItemFSSize')
    const dateValue = parseMetadataValue(stdout, 'kMDItemLastUsedDate')
    const info = await infoPromise
    return {
      target,
      name: await namePromise,
      bundleId: parseMetadataValue(stdout, 'kMDItemCFBundleIdentifier') ??
        (typeof info?.CFBundleIdentifier === 'string' ? info.CFBundleIdentifier : null),
      version: parseMetadataValue(stdout, 'kMDItemVersion') ??
        (typeof info?.CFBundleShortVersionString === 'string' ? info.CFBundleShortVersionString : t(language, '未知版本', 'Unknown version')),
      sizeBytes: Number.parseInt(sizeValue ?? '0', 10) || 0,
      lastUsedAt: dateValue ? new Date(dateValue) : null,
      ...applicationPlistCapabilities(info)
    }
  } catch {
    const info = await infoPromise
    if (info) {
      return {
        target,
        name: await namePromise,
        bundleId: typeof info.CFBundleIdentifier === 'string' ? info.CFBundleIdentifier : null,
        version: typeof info.CFBundleShortVersionString === 'string'
          ? info.CFBundleShortVersionString
          : t(language, '未知版本', 'Unknown version'),
        sizeBytes: await getPathSize(target),
        lastUsedAt: null,
        ...applicationPlistCapabilities(info)
      }
    }
    return {
      target,
      name: await namePromise,
      bundleId: null,
      version: t(language, '未知版本', 'Unknown version'),
      sizeBytes: 0,
      lastUsedAt: null,
      ...applicationPlistCapabilities(null)
    }
  }
}

async function scanApplications(
  actions: Map<string, RegisteredAction>,
  revealTargets: Map<string, string>,
  language: AppLanguage
): Promise<ApplicationScan> {
  const discovered = await Promise.all(APPLICATION_ROOTS.map((root) => findApplications(root)))
  const appPaths = discovered.flat()
  const inspected = await mapLimit([...new Set(appPaths)], 8, (target) => inspectApplication(target, language))
  const applications = inspected.filter((item): item is ApplicationMetadata => item !== null)
  const inventoryApplications = applications.filter(
    (application) => application.bundleId !== 'com.fcl.memento'
  )
  const manageableApplications = inventoryApplications.filter(
    (application) => applicationScope(application.target) !== 'system'
  )
  const candidatePaths = new Set<string>()
  const candidates: ScanCandidate[] = []

  const inventory = inventoryApplications.map((application): InstalledApplication => {
    const id = randomUUID()
    const scope = applicationScope(application.target)
    const action: CandidateOperation | undefined = scope === 'system'
      ? undefined
      : {
          id: randomUUID(),
          kind: 'trash',
          label: t(language, '卸载', 'Uninstall'),
          consequence: t(language, '应用本体会移到废纸篓，其文稿、数据和偏好设置会保留。', 'The app bundle will move to the Trash. Its documents, data, and preferences remain.'),
          reversible: true
        }
    if (action) actions.set(action.id, { kind: 'trash', target: application.target })
    revealTargets.set(id, application.target)
    return {
      id,
      name: application.name,
      version: application.version,
      bundleId: application.bundleId,
      location: displayPath(application.target),
      sizeBytes: application.sizeBytes,
      lastUsedAt: application.lastUsedAt && !Number.isNaN(application.lastUsedAt.getTime())
        ? application.lastUsedAt.toISOString()
        : null,
      scope,
      backgroundOnly: application.backgroundOnly,
      executable: application.executable,
      urlSchemes: application.urlSchemes,
      unused: isApplicationUnused(application.lastUsedAt),
      protectedReason: scope === 'system'
        ? t(language, 'macOS 系统应用', 'macOS system application')
        : undefined,
      action
    }
  })
  const inventoryByPath = new Map(
    inventory.map((application) => [application.location, application])
  )

  const byBundle = new Map<string, ApplicationMetadata[]>()
  for (const application of manageableApplications) {
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
      const inventoryApplication = inventoryByPath.get(displayPath(application.target))
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
            action: inventoryApplication?.action
              ? { ...inventoryApplication.action, label: t(language, '移到废纸篓', 'Move to Trash') }
              : undefined
          },
          undefined,
          inventoryApplication?.action ? [{
            id: inventoryApplication.action.id,
            action: inventoryApplication.action,
            registeredAction: { kind: 'trash', target: application.target }
          }] : []
        )
      )
    }
  }

  for (const application of manageableApplications) {
    if (
      candidatePaths.has(application.target) ||
      !application.lastUsedAt ||
      !isApplicationUnused(application.lastUsedAt)
    ) {
      continue
    }
    const ageDays = ageInDays(application.lastUsedAt)
    const inventoryApplication = inventoryByPath.get(displayPath(application.target))
    candidates.push(
      registerCandidate(
        actions,
        {
          section: 'applications',
          name: application.name,
          subtitle: t(language, `版本 ${application.version}`, `Version ${application.version}`),
          description: t(language, 'Spotlight 记录显示该应用已超过 3 个月没有使用。应用数据不会随应用本体一起删除。', 'Spotlight indicates that this application has not been used for more than three months. Its data is not removed with the application bundle.'),
          sizeBytes: application.sizeBytes,
          ageDays,
          risk: 'review',
          status: t(language, '3 个月未使用', 'Not used for 3+ months'),
          evidence: [
            t(language, `${ageDays} 天未使用`, `Not used for ${ageDays} days`),
            t(language, `位置：${displayPath(application.target)}`, `Location: ${displayPath(application.target)}`)
          ],
          action: inventoryApplication?.action
            ? { ...inventoryApplication.action, label: t(language, '移到废纸篓', 'Move to Trash') }
            : undefined
        },
        undefined,
        inventoryApplication?.action ? [{
          id: inventoryApplication.action.id,
          action: inventoryApplication.action,
          registeredAction: { kind: 'trash', target: application.target }
        }] : []
      )
    )
  }

  return {
    candidates: candidates.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)),
    applications: inventory.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }
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

async function readInteractivePath(shell: string): Promise<string[]> {
  try {
    const args = ['-i', '-c', 'printf "__MEMENTO_PATH__%s\\n" "$PATH"']
    const { stdout } = await run(shell, args, 10_000)
    const value = stdout
      .split('\n')
      .find((line) => line.startsWith('__MEMENTO_PATH__'))
      ?.slice('__MEMENTO_PATH__'.length)
    if (value !== undefined) return value.split(':').filter(Boolean)
  } catch {
    // Fall back to the environment inherited by the app.
  }
  return (process.env.PATH ?? '').split(':').filter(Boolean)
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

function shellFixCopy(
  code: TerminalFinding['code'],
  lineCount: number,
  language: AppLanguage
): { label: string; consequence: string } {
  if (code === 'compinit_detected') {
    return {
      label: t(language, '移除重复初始化', 'Remove duplicate initialization'),
      consequence: t(
        language,
        `保留第一次 compinit，注释其余 ${lineCount} 处重复调用。修改前会自动备份配置。`,
        `Keep the first compinit call and comment out ${lineCount} duplicate call(s). The configuration is backed up first.`
      )
    }
  }
  if (code === 'network_call_during_startup') {
    return {
      label: t(language, '停用启动网络请求', 'Disable startup network requests'),
      consequence: t(
        language,
        `注释 ${lineCount} 处启动阶段的同步网络请求，避免网络波动阻塞终端。修改前会自动备份配置。`,
        `Comment out ${lineCount} synchronous network request(s) during startup so network delays cannot block the terminal. The configuration is backed up first.`
      )
    }
  }
  return {
    label: t(language, '暂停自动初始化', 'Disable automatic initialization'),
    consequence: t(
      language,
      `注释 ${lineCount} 处自动初始化配置；相关版本管理器仍可按需手动启用。修改前会自动备份配置。`,
      `Comment out ${lineCount} automatic initialization line(s). The related version manager can still be enabled manually when needed. The configuration is backed up first.`
    )
  }
}

async function inspectShellFiles(
  language: AppLanguage,
  terminalFixes: Map<string, RegisteredTerminalFix>,
  shell: string
): Promise<{
  findings: TerminalFinding[]
  configFiles: TerminalConfigFile[]
}> {
  const files = ['.zshenv', '.zprofile', '.zshrc', '.zlogin']
  const findings: TerminalFinding[] = []
  const configFiles: TerminalConfigFile[] = []
  const fileHashes = new Map<string, string>()
  const fileContents = new Map<string, string>()

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
    const contentHash = terminalContentHash(content)
    fileHashes.set(target, contentHash)
    fileContents.set(target, content)
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
      const lineIndexes = lines.flatMap((line, index) => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('#') && rule.pattern.test(trimmed) ? [index] : []
      })
      if (!lineIndexes.length) continue
      if (rule.code === 'compinit_detected' && lineIndexes.length < 2) continue
      const lineIndexesToFix = rule.code === 'compinit_detected'
        ? lineIndexes.slice(1)
        : lineIndexes
      const id = randomUUID()
      const fixCopy = lineIndexesToFix.length
        ? shellFixCopy(rule.code, lineIndexesToFix.length, language)
        : null
      if (fixCopy) {
        terminalFixes.set(id, {
          kind: 'comment-lines',
          target,
          expectedHash: contentHash,
          lineNumbers: lineIndexesToFix
        })
      }
      findings.push({
        id,
        code: rule.code,
        title: language === 'en-US' ? rule.title.en : rule.title.zh,
        detail: language === 'en-US' ? rule.detail.en : rule.detail.zh,
        severity: 'notice',
        source: `${displayPath(target)}:${lineIndexes[0] + 1}`,
        recommendation: language === 'en-US' ? rule.recommendation.en : rule.recommendation.zh,
        attributes: { line: lineIndexes[0] + 1, matchCount: lineIndexes.length },
        fix: fixCopy ? { id, ...fixCopy } : undefined
      })
    }
  }

  const pathEntries = await readInteractivePath(shell)
  const missing = (
    await Promise.all(
      pathEntries.map(async (entry) => ({ entry, exists: await pathExists(entry) }))
    )
  ).filter(({ exists }) => !exists)
  const duplicateCount = pathEntries.length - new Set(pathEntries).size
  if (missing.length) {
    const id = randomUUID()
    const zshrcTarget = path.join(HOME, '.zshrc')
    const zshrcHash = fileHashes.get(zshrcTarget)
    const zshrcContent = fileContents.get(zshrcTarget)
    const fix = shell.endsWith('zsh') && zshrcHash && zshrcContent &&
      !zshrcContent.includes('# Memento removes PATH entries that no longer exist.')
      ? {
          id,
          label: t(language, '移除无效 PATH', 'Remove missing PATH entries'),
          consequence: t(
            language,
            `在 .zshrc 末尾加入本地校验，自动忽略 ${missing.length} 个已不存在的目录。修改前会自动备份配置。`,
            `Add a local check to .zshrc that ignores ${missing.length} missing directories automatically. The configuration is backed up first.`
          )
        }
      : undefined
    if (fix && zshrcHash) {
      terminalFixes.set(id, {
        kind: 'prune-path',
        target: zshrcTarget,
        expectedHash: zshrcHash
      })
    }
    findings.push({
      id,
      code: 'path_missing_entries',
      title: t(language, 'PATH 中有无效目录', 'PATH contains missing directories'),
      detail: t(language, `${missing.length} 个目录不存在。`, `${missing.length} directories do not exist.`),
      severity: 'notice',
      source: t(language, '当前 shell 环境', 'Current shell environment'),
      recommendation: t(language, '清理 PATH 拼接逻辑，移除已经不存在的目录。', 'Clean up PATH construction and remove directories that no longer exist.'),
      attributes: { missingCount: missing.length },
      fix
    })
  }
  if (duplicateCount) {
    const id = randomUUID()
    const zshrcTarget = path.join(HOME, '.zshrc')
    const zshrcHash = fileHashes.get(zshrcTarget)
    const zshrcContent = fileContents.get(zshrcTarget)
    const fix = shell.endsWith('zsh') && zshrcHash && zshrcContent &&
      !zshrcContent.split('\n').some((line) => line.trim() === 'typeset -U path PATH')
      ? {
          id,
          label: t(language, '自动去重 PATH', 'Deduplicate PATH automatically'),
          consequence: t(language, '在 .zshrc 末尾加入 zsh 原生 PATH 去重设置。修改前会自动备份配置。', 'Add zsh\'s native PATH deduplication setting to .zshrc. The configuration is backed up first.')
        }
      : undefined
    if (fix && zshrcHash) {
      terminalFixes.set(id, {
        kind: 'dedupe-path',
        target: zshrcTarget,
        expectedHash: zshrcHash
      })
    }
    findings.push({
      id,
      code: 'path_duplicate_entries',
      title: t(language, 'PATH 中有重复目录', 'PATH contains duplicate directories'),
      detail: t(language, `${duplicateCount} 个目录被重复添加。`, `${duplicateCount} directories were added more than once.`),
      severity: 'notice',
      source: t(language, '当前 shell 环境', 'Current shell environment'),
      recommendation: t(language, '检查 PATH 拼接逻辑，避免多个插件反复追加同一目录。', 'Review PATH construction so multiple plug-ins do not append the same directory.'),
      attributes: { duplicateCount },
      fix
    })
  }

  return { findings, configFiles }
}

async function scanTerminal(
  language: AppLanguage,
  terminalFixes: Map<string, RegisteredTerminalFix>
): Promise<ScanResult['terminal']> {
  const shell = process.env.SHELL || '/bin/zsh'
  const [baselineMs, startupMs, fileInspection] = await Promise.all([
    measureShell(shell, true),
    measureShell(shell, false),
    inspectShellFiles(language, terminalFixes, shell)
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
  const terminalFixes = new Map<string, RegisteredTerminalFix>()
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
      terminalFixes,
      result: {
        scanId: randomUUID(),
        startedAt,
        completedAt: new Date().toISOString(),
        system,
        candidates: [],
        applications: [],
        ignoredApplications: [],
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

  const scanSections: ScanSection[] = ['services', 'storage', 'applications', 'terminal']
  const completedSections: ScanSection[] = []
  onProgress({
    section: 'system',
    progress: 10,
    message: t(language, '系统状态已读取，正在并行检查四个模块', 'System status loaded. Checking four modules in parallel'),
    activeSections: scanSections,
    completedSections
  })

  const reportSectionComplete = (section: ScanSection): void => {
    completedSections.push(section)
    const remaining = scanSections.filter((item) => !completedSections.includes(item))
    const labels: Record<ScanSection, [string, string]> = {
      services: ['后台服务', 'Background services'],
      storage: ['存储空间', 'Storage'],
      applications: ['应用清理', 'App cleanup'],
      terminal: ['终端诊断', 'Terminal diagnostics']
    }
    onProgress({
      section,
      progress: 10 + completedSections.length * 20,
      message: remaining.length
        ? t(language, `${labels[section][0]}检查完成，继续检查其余项目`, `${labels[section][1]} complete. Continuing the remaining checks`)
        : t(language, '四个模块均已检查，正在整理结果', 'All four modules checked. Preparing the results'),
      activeSections: remaining,
      completedSections: [...completedSections]
    })
  }

  const servicesPromise = scanServices(actions, revealTargets, language)
    .catch((error: Error) => {
      warnings.push(t(language, `服务扫描未完成：${error.message}`, `Service scan did not complete: ${error.message}`))
      return []
    })
    .finally(() => reportSectionComplete('services'))

  const storageBasePromise = scanStorage(actions, revealTargets, language)
    .catch((error: Error) => {
      warnings.push(t(language, `存储扫描未完成：${error.message}`, `Storage scan did not complete: ${error.message}`))
      return []
    })

  const applicationsPromise = scanApplications(actions, revealTargets, language)
    .catch((error: Error) => {
      warnings.push(t(language, `应用扫描未完成：${error.message}`, `Application scan did not complete: ${error.message}`))
      return { candidates: [], applications: [] }
    })
    .finally(() => reportSectionComplete('applications'))

  const storagePromise = Promise.all([storageBasePromise, applicationsPromise])
    .then(async ([storage, applicationScan]) => {
      try {
        const hiddenHome = await scanHiddenHomeArtifacts(
          actions,
          revealTargets,
          applicationScan.applications,
          language
        )
        return [...storage, ...hiddenHome].sort(
          (left, right) => (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0)
        )
      } catch (error) {
        warnings.push(t(
          language,
          `Home 隐藏项目扫描未完成：${(error as Error).message}`,
          `Hidden Home item scan did not complete: ${(error as Error).message}`
        ))
        return storage
      }
    })
    .finally(() => reportSectionComplete('storage'))

  const terminalPromise = scanTerminal(language, terminalFixes)
    .catch((error: Error) => {
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
    .finally(() => reportSectionComplete('terminal'))

  const [services, storage, applicationScan, terminal] = await Promise.all([
    servicesPromise,
    storagePromise,
    applicationsPromise,
    terminalPromise
  ])
  onProgress({
    section: 'system',
    progress: 96,
    message: t(language, '整理建议并建立操作白名单', 'Preparing recommendations and the action allowlist'),
    activeSections: [],
    completedSections: scanSections
  })

  const result: ScanResult = {
    scanId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    system,
    candidates: [...services, ...storage, ...applicationScan.candidates],
    applications: applicationScan.applications,
    ignoredApplications: [],
    terminal,
    warnings
  }
  onProgress({
    section: 'system',
    progress: 100,
    message: t(language, '扫描完成', 'Scan complete'),
    activeSections: [],
    completedSections: scanSections
  })
  return { result, actions, revealTargets, terminalFixes }
}

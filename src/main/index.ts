import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
  type MenuItemConstructorOptions
} from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  ActionResult,
  AppUpdateState,
  DiskUsageProgress,
  ScanProgress,
  ScanResult,
  TerminalFixRunResult
} from '../shared/types'
import type {
  AddAgentPlanItemsInput,
  CcSwitchImportResult,
  DiscoverAgentModelsInput,
  ExecuteAgentPlanInput,
  SaveAgentProviderInput,
  StartAgentRunInput
} from '../shared/agent-types'
import {
  DEFAULT_APP_SETTINGS,
  type AppLanguage,
  type AppSettings,
  type AppTheme,
  type UpdateAppSettingsInput
} from '../shared/app-settings'
import { AgentStore } from './agent/agent-store'
import { findCcSwitchDatabase, readCcSwitchProviders } from './agent/cc-switch-import'
import { LocalAgentRuntime } from './agent/local-agent-runtime'
import { selectExecutablePlanItems } from './agent/plan-validation'
import { providerErrorMessage, testProviderConnection } from './agent/provider-factory'
import { discoverProviderModels } from './agent/provider-config'
import {
  applicationTrashDestination,
  isAllowedApplicationTrashTarget,
  isPermissionError,
  trashDestination
} from './application-trash'
import { runFullScan, type RegisteredAction } from './scanner'
import { applyScanWhitelist } from './scan-whitelist'
import { buildPrivilegedMoves, privilegedMoveArguments } from './privileged-cleanup'
import {
  isAllowedServiceCleanupTarget,
  isAllowedUserSelectedServiceDirectory
} from './service-cleanup'
import {
  deleteStorageTarget,
  deleteStorageTargets,
  isAllowedStorageCleanupTarget
} from './storage-cleanup'
import { validateLargeFileCleanupTarget } from './large-file-cleanup'
import { validateHiddenHomeArtifactCleanupTarget } from './home-hidden-cleanup'
import { brewCleanupVersionTargets, isSafeBrewVersion } from './brew-cleanup'
import { reconcileScanCapabilities } from './scan-capability-reconciliation'
import {
  diskUsageScanRoot,
  DiskUsageScanner,
  validateDiskUsageTrashTarget,
  withoutDiskUsageTargets
} from './disk-usage-scanner'
import { fetchUpdateState } from './update-checker'
import {
  applyTerminalFixGroup,
  restoreTerminalBackup,
  type RegisteredTerminalFix,
  type TerminalFixBackup
} from './terminal-fixes'

const execFileAsync = promisify(execFile)
let registeredActions = new Map<string, RegisteredAction>()
let registeredRevealTargets = new Map<string, string>()
let registeredTerminalFixes = new Map<string, RegisteredTerminalFix>()
const applicationIconCache = new Map<string, string | null>()
let registeredApplicationIconTargets = new Map<string, string>()
let applicationIconQueue = Promise.resolve()
let lastTerminalFixBackups = new Map<string, TerminalFixBackup>()
let scanInProgress = false
let currentScanResult: ScanResult | null = null
let diskUsageScanner: DiskUsageScanner | null = null
let registeredDiskUsageTargets = new Map<string, string>()
let agentStore: AgentStore | null = null
let agentRuntime: LocalAgentRuntime | null = null
let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let updateTimer: NodeJS.Timeout | null = null
let lastNotifiedVersion: string | null = null
let updateState: AppUpdateState | null = null

function mainText(chinese: string, english: string): string {
  return appSettings.language === 'en-US' ? english : chinese
}

function mainDisplayPath(target: string): string {
  const home = os.homedir()
  return target.startsWith(home) ? `~${target.slice(home.length)}` : target
}

function importCcSwitchProviders(): CcSwitchImportResult {
  const databasePath = findCcSwitchDatabase(app.getPath('home'), app.getPath('appData'))
  if (!databasePath) return { databaseFound: false, detected: 0, imported: 0 }
  const candidates = readCcSwitchProviders(databasePath)
  return {
    databaseFound: true,
    detected: candidates.length,
    imported: agentStore!.syncCcSwitchProviders(candidates)
  }
}

function emptyUpdateState(): AppUpdateState {
  return {
    currentVersion: app.getVersion(),
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: null,
    checkedAt: null,
    error: null
  }
}

async function openUpdatePage(): Promise<void> {
  const releaseUrl = updateState?.releaseUrl
  if (!releaseUrl?.startsWith('https://github.com/Cailiang/memento-client/releases/')) {
    throw new Error(mainText('当前没有可打开的新版本页面', 'No update page is currently available.'))
  }
  await shell.openExternal(releaseUrl)
}

async function checkForAppUpdate(showSystemNotification: boolean): Promise<AppUpdateState> {
  updateState = await fetchUpdateState(app.getVersion())
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('memento:update-state', updateState)
  }
  if (
    showSystemNotification &&
    updateState.updateAvailable &&
    updateState.latestVersion &&
    updateState.latestVersion !== lastNotifiedVersion &&
    Notification.isSupported()
  ) {
    lastNotifiedVersion = updateState.latestVersion
    const notification = new Notification({
      title: mainText('Memento 有新版本', 'A Memento update is available'),
      body: mainText(
        `v${updateState.latestVersion} 已发布，点击查看安装包。`,
        `v${updateState.latestVersion} is available. Click to view the installer.`
      )
    })
    notification.on('click', () => void openUpdatePage().catch(() => undefined))
    notification.show()
  }
  return updateState
}

async function readApplicationIcon(target: string): Promise<string | null> {
  if (applicationIconCache.has(target)) return applicationIconCache.get(target) ?? null
  const operation = applicationIconQueue.then(async () => {
    if (applicationIconCache.has(target)) return applicationIconCache.get(target) ?? null
    try {
      const resourcesDirectory = path.join(target, 'Contents', 'Resources')
      const infoPath = path.join(target, 'Contents', 'Info.plist')
      let iconPath: string | null = null
      try {
        const { stdout } = await execFileAsync('/usr/bin/plutil', [
          '-extract',
          'CFBundleIconFile',
          'raw',
          '-o',
          '-',
          infoPath
        ], { timeout: 5_000 })
        const configuredName = String(stdout).trim()
        if (configuredName && path.basename(configuredName) === configuredName) {
          const filename = configuredName.toLowerCase().endsWith('.icns')
            ? configuredName
            : `${configuredName}.icns`
          const configuredPath = path.join(resourcesDirectory, filename)
          if (existsSync(configuredPath)) iconPath = configuredPath
        }
      } catch {
        // Fall through to the bundle's available ICNS resources.
      }
      if (!iconPath) {
        const fallbackName = (await readdir(resourcesDirectory))
          .filter((name) => name.toLowerCase().endsWith('.icns'))
          .sort((a, b) => a.localeCompare(b))[0]
        if (fallbackName) iconPath = path.join(resourcesDirectory, fallbackName)
      }
      let value: string | null = null
      if (iconPath) {
        const conversionDirectory = await mkdtemp(path.join(os.tmpdir(), 'memento-icon-'))
        const outputPath = path.join(conversionDirectory, 'icon.png')
        try {
          await execFileAsync('/usr/bin/sips', [
            '-z',
            '96',
            '96',
            '-s',
            'format',
            'png',
            iconPath,
            '--out',
            outputPath
          ], { timeout: 8_000 })
          const png = await readFile(outputPath)
          value = `data:image/png;base64,${png.toString('base64')}`
        } finally {
          await unlink(outputPath).catch(() => undefined)
          await rmdir(conversionDirectory).catch(() => undefined)
        }
      }
      applicationIconCache.set(target, value)
      return value
    } catch {
      applicationIconCache.set(target, null)
      return null
    }
  })
  applicationIconQueue = operation.then(() => undefined, () => undefined)
  return operation
}

function themeBackground(theme: AppTheme): string {
  const backgrounds: Record<AppTheme, string> = {
    porcelain: '#f4f2ed',
    graphite: '#101318',
    tiffany: '#e7f3f1',
    klein: '#eef1f8',
    burgundy: '#f2e9ed',
    mars: '#e7efeb',
    prussian: '#071e2a',
    midnight: '#171918'
  }
  return backgrounds[theme]
}

const PRIVILEGED_STAGE_SCRIPT = `
on appendCommand(currentCommand, nextCommand)
  if currentCommand is "" then return nextCommand
  return currentCommand & " && " & nextCommand
end appendCommand

on run argv
  set guiDomain to item 1 of argv
  set serviceCount to (item 2 of argv) as integer
  set argumentIndex to 3
  set shellCommand to ""

  if serviceCount > 0 then
    repeat with serviceIndex from 1 to serviceCount
      set serviceTarget to item argumentIndex of argv
      set launchCommand to "(/bin/launchctl bootout " & quoted form of guiDomain & " " & quoted form of serviceTarget & " >/dev/null 2>&1 || true)"
      set shellCommand to my appendCommand(shellCommand, launchCommand)
      set argumentIndex to argumentIndex + 1
    end repeat
  end if

  repeat while argumentIndex <= count argv
    set sourcePath to item argumentIndex of argv
    set destinationPath to item (argumentIndex + 1) of argv
    set moveCommand to "/bin/test -e " & quoted form of sourcePath & " && /bin/test ! -e " & quoted form of destinationPath & " && /bin/mv " & quoted form of sourcePath & " " & quoted form of destinationPath & " && /bin/test ! -e " & quoted form of sourcePath
    set shellCommand to my appendCommand(shellCommand, moveCommand)
    set argumentIndex to argumentIndex + 2
  end repeat

  do shell script shellCommand with administrator privileges
end run
`

function commandErrorDetail(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : ''
  const message = error instanceof Error ? error.message.trim() : ''
  const detail = stderr || message
  if (!detail) return null
  return detail.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 300) ?? null
}

async function trashServiceSoftwareWithAdmin(
  uid: number,
  serviceTargets: string[],
  targets: string[]
): Promise<void> {
  const cleanupRoot = path.join(app.getPath('userData'), 'Privileged Cleanup')
  await mkdir(cleanupRoot, { recursive: true, mode: 0o700 })
  const stagingDirectory = await mkdtemp(path.join(cleanupRoot, 'pending-'))
  const moves = buildPrivilegedMoves(stagingDirectory, targets)
  const argumentsList = privilegedMoveArguments(uid, serviceTargets, moves)
  let adminError: unknown = null

  try {
    await execFileAsync(
      '/usr/bin/osascript',
      ['-e', PRIVILEGED_STAGE_SCRIPT, '--', ...argumentsList],
      { timeout: 120_000, maxBuffer: 1024 * 1024 }
    )
  } catch (error) {
    adminError = error
  }

  const remainingTargets = moves.filter(({ source }) => existsSync(source))
  if (remainingTargets.length > 0) {
    await rmdir(stagingDirectory).catch(() => undefined)
    const detail = commandErrorDetail(adminError)
    throw new Error(
      mainText(
        `macOS 未能移动 ${remainingTargets.length} 个清理目标${detail ? `：${detail}` : '，请重试'}`,
        `macOS could not move ${remainingTargets.length} cleanup target(s)${detail ? `: ${detail}` : '. Try again.'}`
      )
    )
  }

  const missingStagedTargets = moves.filter(({ destination }) => !existsSync(destination))
  if (missingStagedTargets.length > 0) {
    throw new Error(
      mainText(
        `启动项已从原位置移除，但有 ${missingStagedTargets.length} 个暂存项目无法确认，请重新扫描`,
        `The startup item left its original location, but ${missingStagedTargets.length} staged item(s) could not be verified. Scan again.`
      )
    )
  }

  for (const { destination } of moves) {
    try {
      await shell.trashItem(destination)
    } catch {
      throw new Error(
        mainText(
          `启动项已移除，但无法移到废纸篓；项目暂存在 ${stagingDirectory}`,
          `The startup item was removed but could not be moved to Trash. It remains staged at ${stagingDirectory}.`
        )
      )
    }
  }
  await rmdir(stagingDirectory).catch(() => undefined)
}

async function moveApplicationToTrashWithAdmin(
  source: string,
  destination: string
): Promise<void> {
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error(mainText('无法确定当前用户', 'The current user could not be determined.'))
  try {
    await execFileAsync(
      '/usr/bin/osascript',
      [
        '-e',
        PRIVILEGED_STAGE_SCRIPT,
        '--',
        ...privilegedMoveArguments(uid, [], [{ source, destination }])
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024 }
    )
  } catch (error) {
    const detail = commandErrorDetail(error)
    throw new Error(mainText(
      `macOS 未能将应用移到废纸篓${detail ? `：${detail}` : '，请重试'}`,
      `macOS could not move the application to Trash${detail ? `: ${detail}` : '. Try again.'}`
    ))
  }
}

async function moveDiskUsageTargetToTrashWithAdmin(
  source: string,
  destination: string
): Promise<void> {
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error(mainText('无法确定当前用户', 'The current user could not be determined.'))
  try {
    await execFileAsync(
      '/usr/bin/osascript',
      [
        '-e',
        PRIVILEGED_STAGE_SCRIPT,
        '--',
        ...privilegedMoveArguments(uid, [], [{ source, destination }])
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024 }
    )
  } catch (error) {
    const detail = commandErrorDetail(error)
    throw new Error(mainText(
      `macOS 未能将磁盘项目移到废纸篓${detail ? `：${detail}` : '，请重试'}`,
      `macOS could not move the disk item to Trash${detail ? `: ${detail}` : '. Try again.'}`
    ))
  }
}

async function trashDiskUsageTarget(target: string): Promise<void> {
  try {
    await shell.trashItem(target)
  } catch {
    // Finder can reject protected report types even when their parent is writable.
  }
  if (!existsSync(target)) return

  const trashDirectory = path.join(os.homedir(), '.Trash')
  if (!existsSync(trashDirectory) || !lstatSync(trashDirectory).isDirectory()) {
    throw new Error(mainText('无法访问当前用户的废纸篓', 'The current user Trash is unavailable.'))
  }
  const destination = trashDestination(target, trashDirectory)
  try {
    await rename(target, destination)
  } catch (error) {
    if (!isPermissionError(error)) {
      const detail = commandErrorDetail(error)
      throw new Error(mainText(
        `无法将磁盘项目移到废纸篓${detail ? `：${detail}` : ''}`,
        `The disk item could not be moved to Trash${detail ? `: ${detail}` : ''}`
      ))
    }
    await moveDiskUsageTargetToTrashWithAdmin(target, destination)
  }
  if (existsSync(target) || !existsSync(destination)) {
    throw new Error(mainText(
      '磁盘项目仍在原位置，移动未完成',
      'The disk item is still in its original location. The move did not complete.'
    ))
  }
}

async function trashApplication(target: string): Promise<void> {
  const home = os.homedir()
  if (
    !isAllowedApplicationTrashTarget(target, home) ||
    !existsSync(target) ||
    !lstatSync(target).isDirectory()
  ) {
    throw new Error(mainText(
      '应用目标未通过本地安全校验，请重新扫描',
      'The application target did not pass local safety checks. Scan again.'
    ))
  }

  try {
    await shell.trashItem(target)
  } catch {
    // Some valid apps trigger unrelated macOS privacy errors in Electron's Trash API.
  }
  if (!existsSync(target)) return

  const trashDirectory = path.join(home, '.Trash')
  if (!existsSync(trashDirectory) || !lstatSync(trashDirectory).isDirectory()) {
    throw new Error(mainText('无法访问当前用户的废纸篓', 'The current user Trash is unavailable.'))
  }
  const destination = applicationTrashDestination(target, trashDirectory)
  try {
    await rename(target, destination)
  } catch (error) {
    if (!isPermissionError(error)) {
      const detail = commandErrorDetail(error)
      throw new Error(mainText(
        `无法将应用移到废纸篓${detail ? `：${detail}` : ''}`,
        `The application could not be moved to Trash${detail ? `: ${detail}` : ''}`
      ))
    }
    await moveApplicationToTrashWithAdmin(target, destination)
  }
  if (existsSync(target) || !existsSync(destination)) {
    throw new Error(mainText(
      '应用仍在原位置，卸载未完成',
      'The application is still in its original location. Uninstall did not complete.'
    ))
  }
}

function trayCopy(language: AppLanguage): { open: string; quit: string; tooltip: string } {
  return language === 'en-US'
    ? { open: 'Open Memento', quit: 'Quit Memento', tooltip: 'Memento is running' }
    : { open: '打开 Memento', quit: '退出 Memento', tooltip: 'Memento 正在后台运行' }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  void app.dock?.show()
  mainWindow.show()
  mainWindow.focus()
}

function refreshTray(): boolean {
  if (!appSettings.closeToTray) {
    tray?.destroy()
    tray = null
    void app.dock?.show()
    return false
  }

  const copy = trayCopy(appSettings.language)
  if (!tray) {
    const iconFilename = 'icon.png'
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, iconFilename)
      : path.join(process.cwd(), 'build', iconFilename)
    const sourceImage = nativeImage.createFromPath(iconPath)
    if (sourceImage.isEmpty()) {
      console.error(`Memento tray icon is missing: ${iconPath}`)
      return false
    }
    tray = new Tray(sourceImage.resize({ width: 18, height: 18 }))
    tray.on('click', showMainWindow)
  }
  const template: MenuItemConstructorOptions[] = [
    { label: copy.open, click: showMainWindow },
    { type: 'separator' },
    {
      label: copy.quit,
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]
  tray.setToolTip(copy.tooltip)
  tray.setContextMenu(Menu.buildFromTemplate(template))
  return true
}

function applyWindowSettings(): void {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: appSettings.launchAtLogin })
  }
  mainWindow?.setBackgroundColor(themeBackground(appSettings.theme))
  refreshTray()
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    show: false,
    title: `Memento ${app.getVersion()}`,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 17 },
    backgroundColor: themeBackground(appSettings.theme),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      additionalArguments: [`--memento-theme=${appSettings.theme}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = window

  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (!isQuitting && appSettings.closeToTray && refreshTray()) {
      event.preventDefault()
      window.hide()
      void app.dock?.hide()
    }
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function executeRegisteredAction(action: RegisteredAction): Promise<void> {
  if (action.kind === 'delete-storage') {
    if (!isAllowedStorageCleanupTarget(action.target, os.homedir())) {
      throw new Error(mainText('存储目标未通过本地安全校验，请重新扫描', 'The storage target did not pass local validation. Scan again.'))
    }
    if (!existsSync(action.target)) {
      throw new Error(mainText('缓存已经不存在，请重新扫描', 'The cache no longer exists. Scan again.'))
    }
    await deleteStorageTarget(action.target)
    return
  }

  if (action.kind === 'delete-storage-group') {
    if (
      !action.targets.length ||
      !action.targets.includes(action.target) ||
      action.targets.some((target) => !isAllowedStorageCleanupTarget(target, os.homedir()))
    ) {
      throw new Error(mainText('存储目标未通过本地安全校验，请重新扫描', 'A storage target did not pass local validation. Scan again.'))
    }
    await deleteStorageTargets(action.targets)
    return
  }

  if (action.kind === 'trash-large-file') {
    await validateLargeFileCleanupTarget(
      action.target,
      action.expectedSizeBytes,
      action.expectedModifiedAtMs
    )
    await shell.trashItem(action.target)
    if (existsSync(action.target)) {
      throw new Error(mainText('大文件仍在原位置，请重新扫描', 'The large file is still in its original location. Scan again.'))
    }
    return
  }

  if (action.kind === 'trash-home-artifact') {
    const target = await validateHiddenHomeArtifactCleanupTarget(
      action.target,
      action.expectedModifiedAtMs,
      action.expectedKind
    )
    await shell.trashItem(target)
    if (existsSync(target)) {
      throw new Error(mainText(
        '隐藏项目仍在原位置，请重新扫描',
        'The hidden item is still in its original location. Scan again.'
      ))
    }
    return
  }

  if (action.kind === 'trash') {
    if (!existsSync(action.target)) throw new Error(mainText('项目已不存在，可能已经被移动或删除', 'The item no longer exists. It may have been moved or deleted.'))
    await trashApplication(action.target)
    return
  }

  if (action.kind === 'stop-brew-service') {
    const brew = existsSync('/opt/homebrew/bin/brew')
      ? '/opt/homebrew/bin/brew'
      : '/usr/local/bin/brew'
    await execFileAsync(brew, ['services', 'stop', action.target], { timeout: 30_000 })
    return
  }

  if (action.kind === 'stop-launch-agent') {
    const uid = process.getuid?.()
    if (uid === undefined) throw new Error(mainText('无法确定当前用户', 'The current user could not be determined.'))
    await execFileAsync('/bin/launchctl', ['bootout', `gui/${uid}`, action.target], {
      timeout: 15_000
    })
    return
  }

  if (
    action.kind === 'trash-launch-agent-config' ||
    action.kind === 'trash-service-software' ||
    action.kind === 'trash-service-directory'
  ) {
    const uid = process.getuid?.()
    if (uid === undefined) throw new Error(mainText('无法确定当前用户', 'The current user could not be determined.'))
    const validTargets = action.kind === 'trash-service-directory'
      ? action.targets.includes(action.directoryTarget) &&
        isAllowedUserSelectedServiceDirectory(action.directoryTarget, os.homedir()) &&
        existsSync(action.directoryTarget) &&
        lstatSync(action.directoryTarget).isDirectory() &&
        action.targets.every((target) =>
          target === action.directoryTarget ||
          isAllowedServiceCleanupTarget(target, os.homedir())
        )
      : action.targets.every((target) =>
          isAllowedServiceCleanupTarget(target, os.homedir())
        )
    if (
      !action.targets.length ||
      !action.targets.includes(action.target) ||
      action.serviceTargets.some((target) => !action.targets.includes(target)) ||
      !validTargets
    ) {
      throw new Error(mainText('清理目标未通过本地安全校验，请重新扫描', 'The cleanup target did not pass local safety checks. Scan again.'))
    }

    if (action.targets.some((target) => !existsSync(target))) {
      throw new Error(mainText('清理目标在扫描后发生变化，请重新扫描', 'The cleanup target changed after the scan. Scan again.'))
    }

    if (action.requiresAdmin) {
      await trashServiceSoftwareWithAdmin(uid, action.serviceTargets, action.targets)
      return
    }

    for (const serviceTarget of action.serviceTargets) {
      await execFileAsync('/bin/launchctl', ['bootout', `gui/${uid}`, serviceTarget], {
        timeout: 15_000
      })
    }

    for (const target of action.targets) {
      await shell.trashItem(target)
      if (existsSync(target)) {
        throw new Error(mainText('清理目标仍在原位置，请重新扫描', 'A cleanup target is still in its original location. Scan again.'))
      }
    }
    return
  }

  if (action.kind === 'brew-cleanup') {
    const brew = existsSync('/opt/homebrew/bin/brew')
      ? '/opt/homebrew/bin/brew'
      : '/usr/local/bin/brew'
    if (
      !action.removableVersions.length ||
      action.removableVersions.some((version) => !isSafeBrewVersion(version))
    ) {
      throw new Error(mainText('Homebrew 清理目标无效，请重新扫描', 'The Homebrew cleanup target is invalid. Scan again.'))
    }

    const commandOptions = {
      timeout: 60_000,
      env: { ...process.env, LC_ALL: 'C', HOMEBREW_NO_AUTO_UPDATE: '1' }
    }
    const { stdout: cellarOutput } = await execFileAsync(
      brew,
      ['--cellar', action.target],
      commandOptions
    )
    const currentFormulaRoot = String(cellarOutput).trim()
    if (path.resolve(currentFormulaRoot) !== path.resolve(action.formulaRoot)) {
      throw new Error(mainText('Homebrew 目录在扫描后发生变化，请重新扫描', 'The Homebrew directory changed after the scan. Scan again.'))
    }

    const { stdout, stderr } = await execFileAsync(
      brew,
      ['cleanup', '--dry-run', action.target],
      commandOptions
    )
    const stillRemovable = new Set(
      brewCleanupVersionTargets(
        `${String(stdout)}\n${String(stderr)}`,
        action.formulaRoot,
        action.removableVersions
      )
    )
    if (action.removableVersions.some((version) => !stillRemovable.has(version))) {
      throw new Error(mainText('Homebrew 的可清理版本已经变化，请重新扫描', 'Homebrew cleanup candidates changed after the scan. Scan again.'))
    }

    await execFileAsync(brew, ['cleanup', action.target], commandOptions)
    const remaining = action.removableVersions.filter((version) =>
      existsSync(path.join(action.formulaRoot, version))
    )
    if (remaining.length) {
      throw new Error(mainText(
        `Homebrew 未移除版本 ${remaining.join(', ')}，未将本次操作标记为完成`,
        `Homebrew did not remove ${remaining.join(', ')}. This action was not marked complete.`
      ))
    }
    return
  }
}

function updateRegisteredActionsAfterExecution(action: RegisteredAction): void {
  if (action.kind === 'stop-launch-agent') {
    for (const registered of registeredActions.values()) {
      if ('serviceTargets' in registered) {
        registered.serviceTargets = registered.serviceTargets.filter(
          (target) => target !== action.target
        )
      }
    }
    return
  }

  if (action.kind !== 'trash-launch-agent-config') return
  const removedTargets = new Set(action.targets)
  for (const [id, registered] of registeredActions) {
    if (!('serviceTargets' in registered)) continue
    registered.targets = registered.targets.filter((target) => !removedTargets.has(target))
    registered.serviceTargets = registered.serviceTargets.filter(
      (target) => !removedTargets.has(target)
    )
    if (!registered.targets.length) registeredActions.delete(id)
    else if (removedTargets.has(registered.target)) registered.target = registered.targets[0]
  }
}

async function executeTerminalFixBatch(ids: string[]): Promise<TerminalFixRunResult> {
  const uniqueIds = [...new Set(ids)].slice(0, 100)
  const results: ActionResult[] = []
  const groups = new Map<string, Array<{ id: string; fix: RegisteredTerminalFix }>>()

  for (const id of uniqueIds) {
    const fix = registeredTerminalFixes.get(id)
    if (!fix) {
      results.push({
        id,
        ok: false,
        message: mainText('优化操作已过期，请重新扫描', 'This optimization has expired. Scan again.')
      })
      continue
    }
    const group = groups.get(fix.target) ?? []
    group.push({ id, fix })
    groups.set(fix.target, group)
  }

  const completedBackups = new Map<string, TerminalFixBackup>()
  for (const [target, group] of groups) {
    try {
      const backup = await applyTerminalFixGroup(group.map((item) => item.fix))
      completedBackups.set(target, backup)
      for (const item of group) {
        results.push({
          id: item.id,
          ok: true,
          message: mainText(
            `已自动优化，原配置备份在 ${mainDisplayPath(backup.backup)}`,
            `Optimized automatically. The original configuration is backed up at ${mainDisplayPath(backup.backup)}.`
          )
        })
      }
      for (const [id, registered] of registeredTerminalFixes) {
        if (registered.target === target) registeredTerminalFixes.delete(id)
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : mainText('自动优化失败', 'Automatic optimization failed.')
      for (const item of group) results.push({ id: item.id, ok: false, message })
    }
  }

  if (completedBackups.size) lastTerminalFixBackups = completedBackups
  return { results, canUndo: lastTerminalFixBackups.size > 0 }
}

async function undoLastTerminalFixes(): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  for (const [target, backup] of [...lastTerminalFixBackups]) {
    try {
      await restoreTerminalBackup(backup)
      lastTerminalFixBackups.delete(target)
      results.push({
        id: target,
        ok: true,
        message: mainText(
          `已恢复 ${mainDisplayPath(target)}`,
          `Restored ${mainDisplayPath(target)}.`
        )
      })
    } catch (error) {
      results.push({
        id: target,
        ok: false,
        message: error instanceof Error
          ? error.message
          : mainText('无法恢复终端配置', 'The terminal configuration could not be restored.')
      })
    }
  }
  return results
}

async function executeActionBatch(ids: string[]): Promise<ActionResult[]> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length > 100)) {
    throw new Error(mainText('操作请求无效', 'The action request is invalid.'))
  }
  const uniqueIds = [...new Set(ids)].slice(0, 100)
  const results: ActionResult[] = []
  for (const id of uniqueIds) {
    const action = registeredActions.get(id)
    if (!action) {
      results.push({
        id,
        ok: false,
        message: mainText('操作已过期，请重新扫描', 'This action has expired. Scan again.')
      })
      continue
    }
    try {
      await executeRegisteredAction(action)
      updateRegisteredActionsAfterExecution(action)
      registeredActions.delete(id)
      results.push({ id, ok: true, message: mainText('操作完成', 'Action completed') })
    } catch (error) {
      results.push({
        id,
        ok: false,
        message: error instanceof Error ? error.message : mainText('操作失败', 'Action failed')
      })
    }
  }
  return results
}

async function performScan(
  language: AppLanguage,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanResult> {
  if (scanInProgress) throw new Error(mainText('扫描正在进行中', 'A scan is already in progress.'))
  scanInProgress = true
  try {
    const scannedBundle = reconcileScanCapabilities(
      {
        actions: registeredActions,
        terminalFixes: registeredTerminalFixes
      },
      await runFullScan(onProgress ?? (() => undefined), language)
    )
    registeredApplicationIconTargets = new Map(
      scannedBundle.result.applications.flatMap((application) => {
        const target = scannedBundle.revealTargets.get(application.id)
        return target ? [[application.id, target] as const] : []
      })
    )
    const bundle = applyScanWhitelist(
      scannedBundle,
      appSettings.serviceWhitelist,
      appSettings.storageWhitelist,
      appSettings.applicationWhitelist
    )
    registeredActions = bundle.actions
    registeredRevealTargets = bundle.revealTargets
    registeredTerminalFixes = bundle.terminalFixes
    currentScanResult = bundle.result
    return bundle.result
  } finally {
    scanInProgress = false
  }
}

app.whenReady().then(async () => {
  agentStore = new AgentStore(app.getPath('userData'))
  if (!agentStore.hasCompletedCcSwitchAutoImport()) {
    try {
      importCcSwitchProviders()
    } finally {
      agentStore.markCcSwitchAutoImportCompleted()
    }
  }
  agentRuntime = new LocalAgentRuntime(agentStore)
  appSettings = agentStore.getAppSettings()
  applyWindowSettings()

  ipcMain.handle('memento:get-version', () => app.getVersion())
  ipcMain.handle('memento:update:get', () => updateState ?? emptyUpdateState())
  ipcMain.handle('memento:update:check', () => checkForAppUpdate(false))
  ipcMain.handle('memento:update:open', () => openUpdatePage())
  ipcMain.handle('memento:get-application-icon', async (_event, id: string) => {
    if (typeof id !== 'string' || id.length > 100) return null
    const application = [
      ...(currentScanResult?.applications ?? []),
      ...(currentScanResult?.ignoredApplications ?? [])
    ].find((item) => item.id === id)
    const target = application ? registeredApplicationIconTargets.get(id) : null
    if (!application || !target || !existsSync(target)) return null
    return readApplicationIcon(target)
  })
  ipcMain.handle('memento:open-application', async (_event, id: string) => {
    if (typeof id !== 'string' || id.length > 100) {
      throw new Error(mainText('应用入口无效，请重新扫描', 'The application is invalid. Scan again.'))
    }
    const application = currentScanResult?.applications.find((item) => item.id === id)
    const target = application ? registeredRevealTargets.get(id) : null
    if (
      !application ||
      !target ||
      path.extname(target).toLowerCase() !== '.app' ||
      !existsSync(target) ||
      !lstatSync(target).isDirectory()
    ) {
      throw new Error(mainText('应用已经不存在，请重新扫描', 'The application no longer exists. Scan again.'))
    }
    const error = await shell.openPath(target)
    if (error) {
      throw new Error(mainText(`无法打开应用：${error}`, `Could not open the application: ${error}`))
    }
  })
  ipcMain.handle('memento:settings:get', () => appSettings)
  ipcMain.handle('memento:settings:update', (_event, input: UpdateAppSettingsInput) => {
    const previousLanguage = appSettings.language
    appSettings = agentStore!.updateAppSettings(input)
    applyWindowSettings()
    if (appSettings.language !== previousLanguage) {
      currentScanResult = null
      registeredActions = new Map()
      registeredRevealTargets = new Map()
      registeredApplicationIconTargets = new Map()
      registeredTerminalFixes = new Map()
      applicationIconCache.clear()
    }
    if (currentScanResult && (
      'serviceWhitelist' in input ||
      'storageWhitelist' in input ||
      'applicationWhitelist' in input
    )) {
      const filtered = applyScanWhitelist(
        {
          result: currentScanResult,
          actions: registeredActions,
          revealTargets: registeredRevealTargets,
          terminalFixes: registeredTerminalFixes
        },
        appSettings.serviceWhitelist,
        appSettings.storageWhitelist,
        appSettings.applicationWhitelist
      )
      currentScanResult = filtered.result
      registeredActions = filtered.actions
      registeredRevealTargets = filtered.revealTargets
      registeredTerminalFixes = filtered.terminalFixes
    }
    return appSettings
  })

  ipcMain.handle('memento:scan', (event, language?: AppLanguage) =>
    performScan(language ?? appSettings.language, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('memento:scan-progress', progress)
    })
  )

  ipcMain.handle('memento:disk-usage:scan', async (event) => {
    if (diskUsageScanner) {
      throw new Error(mainText('磁盘扫描已经在进行中', 'A disk scan is already running.'))
    }
    const scanner = new DiskUsageScanner()
    diskUsageScanner = scanner
    try {
      const bundle = await scanner.scan(appSettings.language, (progress: DiskUsageProgress) => {
        if (!event.sender.isDestroyed()) event.sender.send('memento:disk-usage-progress', progress)
      })
      registeredDiskUsageTargets = bundle.targets
      return bundle.result
    } finally {
      if (diskUsageScanner === scanner) diskUsageScanner = null
    }
  })

  ipcMain.handle('memento:disk-usage:cancel', () => {
    diskUsageScanner?.cancel()
  })

  ipcMain.handle('memento:disk-usage:reveal', async (_event, id: string) => {
    if (typeof id !== 'string' || id.length > 100) {
      throw new Error(mainText('磁盘项目入口无效，请重新扫描', 'The disk item is invalid. Scan again.'))
    }
    const target = registeredDiskUsageTargets.get(id)
    if (!target || !existsSync(target)) {
      throw new Error(mainText('磁盘项目已经不存在，请重新扫描', 'The disk item no longer exists. Scan again.'))
    }
    if (target === diskUsageScanRoot()) {
      const error = await shell.openPath('/')
      if (error) throw new Error(error)
      return
    }
    shell.showItemInFolder(target)
  })

  ipcMain.handle('memento:disk-usage:trash', async (_event, id: string) => {
    if (typeof id !== 'string' || id.length > 100) {
      throw new Error(mainText('磁盘项目入口无效，请重新扫描', 'The disk item is invalid. Scan again.'))
    }
    const target = registeredDiskUsageTargets.get(id)
    if (!target || !existsSync(target)) {
      throw new Error(mainText('磁盘项目已经不存在，请重新扫描', 'The disk item no longer exists. Scan again.'))
    }
    let validatedTarget: string
    try {
      validatedTarget = await validateDiskUsageTrashTarget(target, diskUsageScanRoot())
    } catch {
      throw new Error(mainText('这个磁盘项目不能从浏览器中移除', 'This disk item cannot be removed from the browser.'))
    }
    await trashDiskUsageTarget(validatedTarget)
    registeredDiskUsageTargets = withoutDiskUsageTargets(registeredDiskUsageTargets, target)
  })

  ipcMain.handle('memento:agent:providers:list', () => agentStore!.listProviders())
  ipcMain.handle('memento:agent:providers:import-cc-switch', () => importCcSwitchProviders())
  ipcMain.handle('memento:agent:providers:models', async (_event, input: DiscoverAgentModelsInput) => {
    const provider = agentStore!.resolveModelDiscoveryInput(input)
    try {
      return await discoverProviderModels(provider)
    } catch (error) {
      throw new Error(providerErrorMessage(error, provider.apiKey, appSettings.language))
    }
  })
  ipcMain.handle('memento:agent:providers:save', (_event, input: SaveAgentProviderInput) =>
    agentStore!.saveProvider(input)
  )
  ipcMain.handle('memento:agent:providers:delete', (_event, id: string) => {
    agentStore!.deleteProvider(id)
  })
  ipcMain.handle('memento:agent:providers:set-default', (_event, id: string) =>
    agentStore!.setDefaultProvider(id)
  )
  ipcMain.handle('memento:agent:providers:test', async (_event, input: SaveAgentProviderInput) => {
    const provider = agentStore!.resolvePrivateProviderInput(input)
    try {
      const result = await testProviderConnection(provider, undefined, appSettings.language)
      if (input.id) agentStore!.markProviderConnection(input.id, 'connected')
      return result
    } catch (error) {
      if (input.id) agentStore!.markProviderConnection(input.id, 'failed')
      throw new Error(providerErrorMessage(error, provider.apiKey, appSettings.language))
    }
  })
  ipcMain.handle('memento:agent:runs:list', () => agentStore!.listRuns())
  ipcMain.handle('memento:agent:runs:get', (_event, runId: string) => agentStore!.getRun(runId))
  ipcMain.handle('memento:agent:runs:delete', (_event, runId: string) => {
    const run = agentStore!.getRun(typeof runId === 'string' ? runId : '')
    if (run && ['preparing', 'analyzing', 'plan-ready', 'executing', 'verifying'].includes(run.status)) {
      throw new Error(mainText('任务仍在运行，完成后才能删除记录', 'The task is still running. Delete it after it finishes.'))
    }
    agentStore!.deleteRun(runId)
  })
  ipcMain.handle('memento:agent:runs:start', (event, input: StartAgentRunInput) => {
    if (!currentScanResult) {
      throw new Error(mainText('请先完成一次电脑体检', 'Complete a computer health scan first.'))
    }
    if (scanInProgress) {
      throw new Error(mainText(
        '电脑体检正在进行，请完成后再启动 Agent',
        'The computer health scan is still running. Start the Agent after it completes.'
      ))
    }
    return agentRuntime!.start(input, currentScanResult, appSettings.language, (agentEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send('memento:agent-run-event', agentEvent)
    })
  })
  ipcMain.handle('memento:agent:runs:cancel', (_event, runId: string) => {
    agentRuntime!.cancel(runId)
  })
  ipcMain.handle('memento:agent:plans:add', (_event, input: AddAgentPlanItemsInput) => {
    if (!currentScanResult) {
      throw new Error(mainText('请先完成一次电脑体检', 'Complete a computer health scan first.'))
    }
    return agentRuntime!.addPlanItems(input, currentScanResult)
  })

  ipcMain.handle('memento:reveal-candidate-location', async (_event, id: string) => {
    if (typeof id !== 'string' || id.length > 100) {
      throw new Error(mainText('目录入口无效，请重新扫描', 'The location is invalid. Scan again.'))
    }
    const target = registeredRevealTargets.get(id)
    if (!target || !existsSync(target)) {
      throw new Error(mainText('目录已经不存在，请重新扫描', 'The location no longer exists. Scan again.'))
    }
    if (target.toLowerCase().endsWith('.app') || !lstatSync(target).isDirectory()) {
      shell.showItemInFolder(target)
      return
    }
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })

  ipcMain.handle('memento:run-terminal-fixes', async (_event, ids: string[]) => {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length > 100)) {
      throw new Error(mainText('终端优化请求无效', 'The terminal optimization request is invalid.'))
    }
    return executeTerminalFixBatch(ids)
  })

  ipcMain.handle('memento:undo-terminal-fixes', () => undoLastTerminalFixes())

  ipcMain.handle('memento:agent:plans:execute', async (event, input: ExecuteAgentPlanInput) => {
    const validated = selectExecutablePlanItems(
      agentStore!.getRun(typeof input?.runId === 'string' ? input.runId : ''),
      input,
      appSettings.language
    )
    const { run, items: selected } = validated
    const sendStatus = (status: 'executing' | 'verifying', message: string): void => {
      agentStore!.updateRun(run.id, { status })
      if (!event.sender.isDestroyed()) {
        event.sender.send('memento:agent-run-event', {
          type: 'status',
          runId: run.id,
          status,
          message
        })
      }
    }

    let results: ActionResult[] = []
    try {
      sendStatus('executing', mainText('正在执行已确认的操作', 'Executing confirmed operations'))
      const actionResults = await executeActionBatch(
        selected.filter((item) => item.kind === 'action').map((item) => item.id)
      )
      const terminalResult = await executeTerminalFixBatch(
        selected.filter((item) => item.kind === 'terminal-fix').map((item) => item.id)
      )
      results = [...actionResults, ...terminalResult.results]
      sendStatus('verifying', mainText('正在重新体检并验证结果', 'Scanning again to verify results'))
      const scan = await performScan(appSettings.language, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('memento:scan-progress', progress)
      })
      const combinedResults = new Map(run.results.map((result) => [result.id, result]))
      results.forEach((result) => combinedResults.set(result.id, result))
      const completed = agentStore!.updateRun(run.id, {
        status: 'completed',
        results: [...combinedResults.values()],
        error: results.some((result) => !result.ok)
          ? mainText('部分操作未能完成', 'Some operations could not be completed.')
          : null
      })
      if (!event.sender.isDestroyed()) {
        event.sender.send('memento:agent-run-event', { type: 'completed', run: completed })
      }
      return { run: completed, scan }
    } catch (error) {
      const failed = agentStore!.updateRun(run.id, {
        status: 'failed',
        results,
        error: error instanceof Error
          ? error.message
          : mainText('执行后复检失败', 'The post-action verification scan failed.')
      })
      if (!event.sender.isDestroyed()) {
        event.sender.send('memento:agent-run-event', { type: 'failed', run: failed })
      }
      throw error
    }
  })

  ipcMain.handle('memento:run-actions', (_event, ids: string[]) => executeActionBatch(ids))

  createWindow()
  const initialUpdateCheck = setTimeout(() => {
    void checkForAppUpdate(true)
  }, 3_000)
  initialUpdateCheck.unref()
  updateTimer = setInterval(() => {
    void checkForAppUpdate(true)
  }, 60 * 60 * 1_000)
  updateTimer.unref()
  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  diskUsageScanner?.cancel()
  diskUsageScanner = null
  if (updateTimer) clearInterval(updateTimer)
  updateTimer = null
  agentStore?.close()
  agentStore = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

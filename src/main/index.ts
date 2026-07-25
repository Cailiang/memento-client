import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MenuItemConstructorOptions
} from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import { mkdir, mkdtemp, rmdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { ActionResult, ScanProgress, ScanResult } from '../shared/types'
import type { UpdateAiSettingsInput } from '../shared/ai-types'
import {
  DEFAULT_APP_SETTINGS,
  type AppLanguage,
  type AppSettings,
  type AppTheme,
  type UpdateAppSettingsInput
} from '../shared/app-settings'
import { AiService } from './ai/ai-service'
import { toPublicAiError } from './ai/errors'
import { AppSettingsStore } from './app-settings-store'
import { runFullScan, type RegisteredAction } from './scanner'
import { applyScanWhitelist } from './scan-whitelist'
import { buildPrivilegedMoves, privilegedMoveArguments } from './privileged-cleanup'
import {
  isAllowedServiceCleanupTarget,
  isAllowedUserSelectedServiceDirectory
} from './service-cleanup'

const execFileAsync = promisify(execFile)
let registeredActions = new Map<string, RegisteredAction>()
let registeredRevealTargets = new Map<string, string>()
let scanInProgress = false
let currentScanResult: ScanResult | null = null
let aiService: AiService | null = null
let appSettingsStore: AppSettingsStore | null = null
let appSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function mainText(chinese: string, english: string): string {
  return appSettings.language === 'en-US' ? english : chinese
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

function aiFailure(error: unknown): Error {
  return new Error(`MEMENTO_AI_ERROR:${JSON.stringify(toPublicAiError(error))}`)
}

function registerAiHandler<T extends unknown[], R>(
  channel: string,
  handler: (...args: T) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (_event, ...args: T) => {
    try {
      return await handler(...args)
    } catch (error) {
      throw aiFailure(error)
    }
  })
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
  if (action.kind === 'trash') {
    if (!existsSync(action.target)) throw new Error(mainText('项目已不存在，可能已经被移动或删除', 'The item no longer exists. It may have been moved or deleted.'))
    await shell.trashItem(action.target)
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
    }
    return
  }

  if (action.kind === 'brew-cleanup') {
    const brew = existsSync('/opt/homebrew/bin/brew')
      ? '/opt/homebrew/bin/brew'
      : '/usr/local/bin/brew'
    await execFileAsync(brew, ['cleanup', action.target], { timeout: 60_000 })
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
    if (!('targets' in registered)) continue
    registered.targets = registered.targets.filter((target) => !removedTargets.has(target))
    registered.serviceTargets = registered.serviceTargets.filter(
      (target) => !removedTargets.has(target)
    )
    if (!registered.targets.length) registeredActions.delete(id)
    else if (removedTargets.has(registered.target)) registered.target = registered.targets[0]
  }
}

app.whenReady().then(async () => {
  const gatewayUrl = (
    process.env['MEMENTO_GATEWAY_URL'] ||
    'http://127.0.0.1:8787'
  ).replace(/\/$/, '')
  appSettingsStore = new AppSettingsStore(app.getPath('userData'))
  appSettings = await appSettingsStore.get()
  applyWindowSettings()
  aiService = new AiService(
    app.getPath('userData'),
    gatewayUrl,
    app.getVersion(),
    () => currentScanResult,
    () => appSettings.language
  )
  void aiService.initializeDefaultConnection()
  app.setAsDefaultProtocolClient('memento')

  ipcMain.handle('memento:get-version', () => app.getVersion())
  ipcMain.handle('memento:settings:get', () => appSettings)
  ipcMain.handle('memento:settings:update', async (_event, input: UpdateAppSettingsInput) => {
    appSettings = await appSettingsStore!.update(input)
    applyWindowSettings()
    if (currentScanResult && ('serviceWhitelist' in input || 'storageWhitelist' in input)) {
      const filtered = applyScanWhitelist(
        {
          result: currentScanResult,
          actions: registeredActions,
          revealTargets: registeredRevealTargets
        },
        appSettings.serviceWhitelist,
        appSettings.storageWhitelist
      )
      currentScanResult = filtered.result
      registeredActions = filtered.actions
      registeredRevealTargets = filtered.revealTargets
      aiService?.invalidatePreviews()
    }
    return appSettings
  })

  ipcMain.handle('memento:scan', async (event, language?: AppLanguage) => {
    if (scanInProgress) throw new Error(mainText('扫描正在进行中', 'A scan is already in progress.'))
    scanInProgress = true
    try {
      const scannedBundle = await runFullScan((progress: ScanProgress) => {
        if (!event.sender.isDestroyed()) event.sender.send('memento:scan-progress', progress)
      }, language ?? appSettings.language)
      const bundle = applyScanWhitelist(
        scannedBundle,
        appSettings.serviceWhitelist,
        appSettings.storageWhitelist
      )
      registeredActions = bundle.actions
      registeredRevealTargets = bundle.revealTargets
      currentScanResult = bundle.result
      aiService?.invalidatePreviews()
      return bundle.result
    } finally {
      scanInProgress = false
    }
  })

  registerAiHandler('memento:ai:get-settings', () => aiService!.getSettings())
  registerAiHandler('memento:ai:update-settings', (input: UpdateAiSettingsInput) =>
    aiService!.updateSettings(input)
  )
  registerAiHandler('memento:ai:test-provider', (providerId: string) =>
    aiService!.testProvider(providerId)
  )
  registerAiHandler('memento:ai:prepare-terminal-analysis', (scanId: string) =>
    aiService!.prepareTerminalAnalysis(scanId)
  )
  registerAiHandler(
    'memento:ai:prepare-candidate-analysis',
    (input: { scanId: string; candidateId: string }) => aiService!.prepareCandidateAnalysis(input)
  )
  registerAiHandler(
    'memento:ai:analyze-terminal',
    (input: { previewId: string; providerId: string }) => aiService!.analyzeTerminal(input)
  )
  registerAiHandler(
    'memento:ai:analyze-candidate',
    (input: { previewId: string; providerId: string }) => aiService!.analyzeCandidate(input)
  )
  registerAiHandler('memento:ai:cancel-analysis', (requestId: string) => {
    aiService!.cancelAnalysis(requestId)
  })
  registerAiHandler('memento:ai:get-hosted-session', () => aiService!.getHostedSession())
  registerAiHandler('memento:ai:start-hosted-login', () => aiService!.startHostedLogin())
  registerAiHandler('memento:ai:logout-hosted', () => aiService!.logoutHosted())

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

  ipcMain.handle('memento:run-actions', async (_event, ids: string[]) => {
    const uniqueIds = [...new Set(ids)].slice(0, 100)
    const results: ActionResult[] = []

    for (const id of uniqueIds) {
      const action = registeredActions.get(id)
      if (!action) {
        results.push({ id, ok: false, message: mainText('操作已过期，请重新扫描', 'This action has expired. Scan again.') })
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
  })

  createWindow()
  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('memento://auth/')) void aiService?.completeHostedLogin(url)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

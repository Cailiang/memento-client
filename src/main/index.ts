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
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
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
import { isAllowedServiceCleanupTarget } from './service-cleanup'

const execFileAsync = promisify(execFile)
let registeredActions = new Map<string, RegisteredAction>()
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

const PRIVILEGED_TRASH_SCRIPT = `
on appendCommand(currentCommand, nextCommand)
  if currentCommand is "" then return nextCommand
  return currentCommand & " && " & nextCommand
end appendCommand

on run argv
  set guiDomain to item 1 of argv
  set serviceCount to (item 2 of argv) as integer
  set argumentIndex to 3
  set shellCommand to ""

  repeat with serviceIndex from 1 to serviceCount
    set serviceTarget to item argumentIndex of argv
    set launchCommand to "/bin/launchctl bootout " & quoted form of guiDomain & " " & quoted form of serviceTarget
    set shellCommand to my appendCommand(shellCommand, launchCommand)
    set argumentIndex to argumentIndex + 1
  end repeat

  repeat while argumentIndex <= count argv
    set sourcePath to item argumentIndex of argv
    set destinationPath to item (argumentIndex + 1) of argv
    set moveCommand to "/usr/bin/test -e " & quoted form of sourcePath & " && /usr/bin/test ! -e " & quoted form of destinationPath & " && /bin/mv " & quoted form of sourcePath & " " & quoted form of destinationPath
    set shellCommand to my appendCommand(shellCommand, moveCommand)
    set argumentIndex to argumentIndex + 2
  end repeat

  do shell script shellCommand with administrator privileges
end run
`

function uniqueTrashDestination(target: string): string {
  const extension = path.extname(target)
  const name = path.basename(target, extension)
  return path.join(
    os.homedir(),
    '.Trash',
    `${name} (Memento ${randomUUID().slice(0, 8)})${extension}`
  )
}

async function trashServiceSoftwareWithAdmin(
  uid: number,
  serviceTargets: string[],
  targets: string[]
): Promise<void> {
  const argumentsList = [
    `gui/${uid}`,
    String(serviceTargets.length),
    ...serviceTargets,
    ...targets.flatMap((target) => [target, uniqueTrashDestination(target)])
  ]
  await execFileAsync('/usr/bin/osascript', ['-e', PRIVILEGED_TRASH_SCRIPT, '--', ...argumentsList], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024
  })
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

function refreshTray(): void {
  if (!appSettings.closeToTray) {
    tray?.destroy()
    tray = null
    void app.dock?.show()
    return
  }

  const copy = trayCopy(appSettings.language)
  if (!tray) {
    const iconFilename = process.platform === 'darwin' ? 'icon.icns' : 'icon.png'
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, iconFilename)
      : path.join(process.cwd(), 'build', iconFilename)
    const image = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
    image.setTemplateImage(true)
    tray = new Tray(image)
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
    if (!isQuitting && appSettings.closeToTray) {
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
    action.kind === 'trash-service-software'
  ) {
    const uid = process.getuid?.()
    if (uid === undefined) throw new Error(mainText('无法确定当前用户', 'The current user could not be determined.'))
    if (
      !action.targets.length ||
      !action.serviceTargets.length ||
      !action.targets.includes(action.target) ||
      action.serviceTargets.some((target) => !action.targets.includes(target)) ||
      action.targets.some((target) => !isAllowedServiceCleanupTarget(target, os.homedir()))
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
    return appSettings
  })

  ipcMain.handle('memento:scan', async (event, language?: AppLanguage) => {
    if (scanInProgress) throw new Error(mainText('扫描正在进行中', 'A scan is already in progress.'))
    scanInProgress = true
    try {
      const bundle = await runFullScan((progress: ScanProgress) => {
        if (!event.sender.isDestroyed()) event.sender.send('memento:scan-progress', progress)
      }, language ?? appSettings.language)
      registeredActions = bundle.actions
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

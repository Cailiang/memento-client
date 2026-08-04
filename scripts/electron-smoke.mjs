import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electronLauncher } from 'playwright-core'

const profileDirectory = mkdtempSync(path.join(tmpdir(), 'memento-electron-smoke-'))
let electronApp

try {
  electronApp = await electronLauncher.launch({
    args: ['.', `--user-data-dir=${profileDirectory}`],
    env: { ...process.env, MEMENTO_TEST_RUN: '1' }
  })
  const page = await electronApp.firstWindow()
  await page.locator('.nav-button[title="应用管理"]').waitFor({ timeout: 15_000 })

  const preloadReady = await page.evaluate(() => Boolean(
    window.memento?.scan &&
    window.memento.scanDiskUsage &&
    window.memento.cancelDiskUsageScan &&
    window.memento.revealDiskUsageNode &&
    window.memento.onDiskUsageProgress &&
    window.memento.listMaintenanceRuns &&
    window.memento.deleteMaintenanceRuns &&
    window.memento.revealMaintenanceRecovery
  ))
  if (!preloadReady) throw new Error('preload API is unavailable')
  const providers = await page.evaluate(() => window.memento?.listAgentProviders() ?? [])
  if (providers.some((provider) => 'apiKey' in provider)) {
    throw new Error('provider credentials unexpectedly crossed the preload boundary')
  }
  if (await page.locator('.nav-button[title="电脑体检"]').getAttribute('aria-current') !== 'page') {
    throw new Error('first window did not open on deterministic Health')
  }

  await page.locator('.nav-button[title="应用管理"]').click()
  await page.locator('.app-card').first().waitFor({ timeout: 30_000 })
  await page.locator('.app-logo img').first().waitFor({ timeout: 20_000 })

  const result = await page.evaluate(() => ({
    applications: document.querySelectorAll('.app-card').length,
    loadedIcons: document.querySelectorAll('.app-logo img').length,
    summary: document.querySelector('.page-command-summary')?.textContent ?? '',
    visibleVersion: document.querySelector('.brand-version')?.textContent ?? ''
  }))
  result.importedCcSwitchProviders = providers.filter((provider) => provider.id.startsWith('cc-switch-')).length
  if (result.applications < 1 || result.loadedIcons < 1) {
    throw new Error(`application inventory did not render: ${JSON.stringify(result)}`)
  }
  const runtimeVersion = await page.evaluate(() => window.memento?.getVersion())
  if (!runtimeVersion || result.visibleVersion !== `v${runtimeVersion}`) {
    throw new Error(`visible version does not match runtime: ${JSON.stringify({ runtimeVersion, ...result })}`)
  }
  const manageableCard = page.locator('.app-card').filter({ has: page.locator('.uninstall-app') }).first()
  const manageableName = await manageableCard.locator('.app-title strong').textContent()
  await manageableCard.locator('.app-ignore-button').click()
  await page.getByRole('dialog').locator('.primary-button').click()
  await page.getByRole('button', { name: /已忽略 1 项/ }).click()
  const ignoredDialog = page.getByRole('dialog', { name: '忽略列表' })
  await ignoredDialog.locator('.ignored-row .app-logo img').waitFor({ timeout: 20_000 })
  await ignoredDialog.getByRole('searchbox', { name: '搜索忽略项目' }).fill(manageableName ?? '')
  if (await ignoredDialog.locator('.ignored-row').count() !== 1) {
    throw new Error(`ignored application search did not find ${JSON.stringify(manageableName)}`)
  }
  await ignoredDialog.locator('.ignored-row .quiet-button').click()
  await ignoredDialog.locator('.ignored-row').waitFor({ state: 'detached', timeout: 60_000 })
  await ignoredDialog.getByRole('button', { name: '完成' }).click()
  await page.locator('.app-card').first().waitFor({ timeout: 30_000 })
  await page.locator('select[aria-label="筛选应用"]').selectOption('system')
  const appStore = page.locator('.app-card').filter({ hasText: 'App Store' }).first()
  await appStore.waitFor({ timeout: 20_000 })
  if (await appStore.locator('.uninstall-app').count()) {
    throw new Error('protected App Store unexpectedly exposes uninstall')
  }
  await page.locator('select[aria-label="筛选应用"]').selectOption('all')
  await page.locator('input[aria-label="搜索应用名称"]').fill('com.xunlei.Thunder')
  const thunderName = await page.locator('.app-card .app-title strong').first().textContent()
  if (thunderName !== '迅雷') {
    throw new Error(`localized Thunder name was not loaded: ${JSON.stringify(thunderName)}`)
  }
  console.log(`Electron smoke test passed: ${JSON.stringify(result)}`)
} finally {
  await electronApp?.close().catch(() => undefined)
  rmSync(profileDirectory, { recursive: true, force: true })
}

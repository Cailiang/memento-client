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

  const preloadReady = await page.evaluate(() => Boolean(window.memento?.scan))
  if (!preloadReady) throw new Error('preload API is unavailable')

  await page.locator('.nav-button[title="应用管理"]').click()
  await page.locator('.app-card').first().waitFor({ timeout: 30_000 })
  await page.locator('.app-logo img').first().waitFor({ timeout: 20_000 })

  const result = await page.evaluate(() => ({
    applications: document.querySelectorAll('.app-card').length,
    loadedIcons: document.querySelectorAll('.app-logo img').length,
    summary: document.querySelector('.page-heading p')?.textContent ?? ''
  }))
  if (result.applications < 1 || result.loadedIcons < 1) {
    throw new Error(`application inventory did not render: ${JSON.stringify(result)}`)
  }
  console.log(`Electron smoke test passed: ${JSON.stringify(result)}`)
} finally {
  await electronApp?.close().catch(() => undefined)
  rmSync(profileDirectory, { recursive: true, force: true })
}

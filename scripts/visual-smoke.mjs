import { chromium } from 'playwright-core'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174'
const pages = [
  ['agent', null],
  ['health', '电脑体检'],
  ['apps', '应用管理'],
  ['history', '任务记录'],
  ['settings', '设置']
]
const viewports = [
  ['1440x900', { width: 1440, height: 900 }],
  ['1024x768', { width: 1024, height: 768 }],
  ['820x1180', { width: 820, height: 1180 }],
  ['390x844', { width: 390, height: 844 }]
]

function browserExecutable() {
  const configured = chromium.executablePath()
  if (existsSync(configured)) return configured
  const cache = path.join(homedir(), 'Library', 'Caches', 'ms-playwright')
  const versions = existsSync(cache)
    ? readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse()
    : []
  for (const version of versions) {
    const candidate = path.join(
      cache,
      version,
      'chrome-mac-x64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing'
    )
    if (existsSync(candidate)) return candidate
  }
  return configured
}

const browser = await chromium.launch({
  headless: true,
  executablePath: browserExecutable()
})
const failures = []

try {
  const indexHtml = await fetch(baseUrl).then((response) => response.text())
  if (!indexHtml.includes('class="boot-screen"') || !indexHtml.includes('正在准备本地工作区')) {
    failures.push('startup: inline boot screen is missing')
  }

  for (const [viewportName, viewport] of viewports) {
    for (const [pageName, navigationTitle] of pages) {
      const page = await browser.newPage({ viewport })
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      if (navigationTitle) {
        await page.locator(`.nav-button[title="${navigationTitle}"]`).click()
        await page.waitForTimeout(220)
      }
      await page.screenshot({
        path: `/tmp/memento-${viewportName}-${pageName}.png`,
        fullPage: viewport.width <= 820
      })
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth
      }))
      if (overflow.document > 1 || overflow.body > 1) {
        failures.push(`${viewportName}/${pageName}: horizontal overflow ${JSON.stringify(overflow)}`)
      }
      await page.close()
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('textarea[aria-label="输入任务"]').fill('检查可以安全清理的空间')
  await page.locator('button[aria-label="发送"]').click()
  await page.locator('.plan-panel.is-visible').waitFor({ timeout: 5_000 })
  await page.locator('.agent-result-section').first().waitFor({ timeout: 5_000 })
  await page.screenshot({ path: '/tmp/memento-interaction-agent-results.png' })
  await page.locator('.plan-actions .primary-button').click()
  await page.locator('[role="dialog"]').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[role="dialog"]').waitFor({ state: 'hidden' })

  await page.locator('.nav-button[title="电脑体检"]').click()
  for (const tab of ['存储空间', '后台服务', '终端诊断']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click()
  }
  await page.locator('.nav-button[title="应用管理"]').click()
  await page.locator('input[aria-label="搜索应用名称"]').fill('Visual Studio Code')
  const applicationCard = page.locator('.app-card').first()
  await applicationCard.waitFor()
  await applicationCard.locator('.uninstall-app').click()
  await page.locator('[role="dialog"] .danger-button').click()
  await page.locator('.uninstall-progress').waitFor()
  await page.screenshot({ path: '/tmp/memento-interaction-uninstall.png' })
  await applicationCard.waitFor({ state: 'detached', timeout: 3_000 })
  await page.locator('.nav-button[title="设置"]').click()
  await page.locator('button[aria-label="添加供应商"]').click()
  await page.locator('#provider-name').fill('测试供应商')
  await page.locator('#provider-url').fill('https://code.tczor.cn')
  await page.locator('#provider-key').fill('test-key')
  await page.locator('#provider-model').waitFor({ state: 'visible' })
  await page.locator('#provider-model').selectOption('deepseek-chat', { timeout: 4_000 })
  await page.screenshot({ path: '/tmp/memento-interaction-provider-models.png' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByText('测试供应商', { exact: true }).first().waitFor()
  await page.close()

  for (const [name, viewport] of [
    ['1024x768', { width: 1024, height: 768 }],
    ['390x844', { width: 390, height: 844 }]
  ]) {
    const resultPage = await browser.newPage({ viewport })
    await resultPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await resultPage.locator('textarea[aria-label="输入任务"]').fill('帮我检查长期没用的应用和可以安全清理的应用残留')
    await resultPage.locator('button[aria-label="发送"]').click()
    await resultPage.locator('.agent-app-result').first().waitFor({ timeout: 5_000 })
    await resultPage.screenshot({
      path: `/tmp/memento-${name}-agent-application-results.png`,
      fullPage: viewport.width <= 820
    })
    const overflow = await resultPage.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ))
    if (overflow > 1) failures.push(`${name}/agent-application-results: horizontal overflow ${overflow}`)
    await resultPage.close()
  }

  const englishPage = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await englishPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await englishPage.locator('.nav-button[title="设置"]').click()
  await englishPage.locator('.setting-row select').last().selectOption('en-US')
  await englishPage.locator('.nav-button[title="Agent"]').click()
  await englishPage.locator('textarea[aria-label="Enter task"]').fill('帮我检查长期没用的应用')
  await englishPage.locator('button[aria-label="Send"]').click()
  await englishPage.getByText('Unused applications', { exact: true }).waitFor({ timeout: 5_000 })
  const englishConversation = await englishPage.locator('.conversation').innerText()
  if (!englishConversation.includes('I found applications that have not been used for three months.')) {
    failures.push('english-agent: response did not follow the interface language')
  }
  const englishAgentOutput = [
    await englishPage.locator('.message.assistant').allInnerTexts(),
    await englishPage.locator('.agent-rail').innerText()
  ].flat().join('\n')
  if (/[\u4e00-\u9fff]/.test(englishAgentOutput)) {
    failures.push('english-agent: Agent output or plan still contains Chinese text')
  }
  await englishPage.screenshot({ path: '/tmp/memento-english-agent-results.png' })
  await englishPage.close()
} finally {
  await browser.close()
}

if (failures.length) {
  throw new Error(`UI smoke test failed:\n${failures.join('\n')}`)
}

console.log(`UI smoke test passed: ${viewports.length * pages.length} screenshots in /tmp`)

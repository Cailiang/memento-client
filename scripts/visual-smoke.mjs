import { chromium } from 'playwright-core'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174'
const expectedVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
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
      const visibleVersion = await page.locator('.brand-version').textContent()
      if (visibleVersion !== `v${expectedVersion}`) {
        failures.push(`${viewportName}/${pageName}: wrong visible version ${JSON.stringify(visibleVersion)}`)
      }
      if (await page.locator('.topbar-actions').count()) {
        failures.push(`${viewportName}/${pageName}: removed topbar actions are still rendered`)
      }
      if (pageName !== 'agent' && await page.locator('.page-heading').count()) {
        failures.push(`${viewportName}/${pageName}: redundant page heading is still rendered`)
      }
      await page.close()
    }
  }

  const settingsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await settingsPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await settingsPage.locator('.nav-button[title="设置"]').click()
  if (!await settingsPage.getByRole('button', { name: '重新导入 CC Switch' }).isVisible()) {
    failures.push('settings: manual CC Switch import is missing')
  }
  if (!await settingsPage.getByRole('button', { name: '立即检查' }).isVisible()) {
    failures.push('settings: manual update check is missing')
  }
  await settingsPage.close()

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('textarea[aria-label="输入任务"]').fill('检查可以安全清理的空间')
  await page.locator('button[aria-label="发送"]').click()
  const agentProgress = page.locator('.agent-progress')
  await agentProgress.waitFor({ timeout: 2_000 })
  const startingProgress = Number(await agentProgress.locator('[role="progressbar"]').getAttribute('aria-valuenow'))
  if (startingProgress < 1 || startingProgress > 35) {
    failures.push(`agent-progress: unrealistic starting value ${startingProgress}`)
  }
  await page.screenshot({ path: '/tmp/memento-interaction-agent-progress.png' })
  await page.locator('.plan-panel.is-visible').waitFor({ timeout: 5_000 })
  await page.locator('.agent-result-section').first().waitFor({ timeout: 5_000 })
  await page.screenshot({ path: '/tmp/memento-interaction-agent-results.png' })
  await page.locator('.plan-actions .primary-button').click()
  const executionDialog = page.locator('[role="dialog"]').filter({ has: page.locator('.execution-stage') })
  await executionDialog.waitFor()
  if (await page.getByRole('dialog', { name: /确认处理计划/ }).count()) {
    failures.push('agent-execution: duplicate confirmation dialog is still rendered')
  }
  const executionStart = Number(await executionDialog.locator('[role="progressbar"]').getAttribute('aria-valuenow'))
  if (executionStart !== 32) failures.push(`agent-execution: unexpected execution progress ${executionStart}`)
  await page.screenshot({ path: '/tmp/memento-interaction-agent-execution.png' })
  await executionDialog.getByRole('button', { name: '完成' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('[role="dialog"] .dialog-actions button')?.hasAttribute('disabled'))
  await executionDialog.getByRole('button', { name: '完成' }).click()

  await page.locator('.nav-button[title="任务记录"]').click()
  const historyEntries = page.locator('.history-entry')
  const historyCount = await historyEntries.count()
  await historyEntries.first().locator('.history-delete').click()
  await page.getByRole('dialog', { name: '删除任务记录？' }).waitFor()
  await page.screenshot({ path: '/tmp/memento-interaction-history-delete.png' })
  await page.getByRole('dialog', { name: '删除任务记录？' }).locator('.danger-button').click()
  if (await historyEntries.count() !== historyCount - 1) failures.push('history-delete: task row was not removed')

  await page.locator('.nav-button[title="电脑体检"]').click()
  for (const tab of ['存储空间', '后台服务', '终端诊断']) {
    await page.getByRole('tab', { name: new RegExp(tab) }).click()
    const actionLabels = await page.locator('.health-panel.is-active .row-actions > .secondary-button:first-child').allTextContents()
    if (!actionLabels.length || actionLabels.some((label) => label.trim() !== 'AI 分析')) {
      failures.push(`health/${tab}: analysis actions are ambiguous ${JSON.stringify(actionLabels)}`)
    }
    const recommendationLabels = await page.locator('.health-panel.is-active .data-row .row-meta strong').allTextContents()
    if (recommendationLabels.some((label) => ['可安全处理', '需要确认'].includes(label.trim()))) {
      failures.push(`health/${tab}: obsolete risk/action labels are still visible`)
    }
  }
  await page.getByRole('tab', { name: /存储空间/ }).click()
  const directActionButton = page.locator('.health-panel.is-active .direct-action-button').first()
  await directActionButton.click()
  await page.locator('.health-panel.is-active .row-menu-popover [role="menuitem"]').first().click()
  const directConfirm = page.getByRole('dialog', { name: /直接执行/ })
  await directConfirm.waitFor()
  await directConfirm.locator('.primary-button, .danger-button').click()
  const directProgress = page.locator('[role="dialog"]').filter({ has: page.locator('.execution-stage') })
  await directProgress.waitFor()
  await page.waitForFunction(() => !document.querySelector('[role="dialog"] .dialog-actions button')?.hasAttribute('disabled'))
  await directProgress.getByRole('button', { name: '完成' }).click()

  await page.getByRole('tab', { name: /后台服务/ }).click()
  await page.locator('.health-panel.is-active .row-actions > .secondary-button:first-child').first().click()
  const returnButton = page.getByRole('button', { name: '返回后台服务' })
  await returnButton.waitFor()
  await returnButton.click()
  if (await page.getByRole('tab', { name: /后台服务/ }).getAttribute('aria-selected') !== 'true') {
    failures.push('agent-return: source health tab was not restored')
  }
  await page.waitForFunction(() => Boolean(document.activeElement?.getAttribute('data-focus-id')))
  await page.waitForTimeout(1_000)

  await page.getByRole('tab', { name: /终端诊断/ }).click()
  await page.locator('.health-panel.is-active .row-actions > .secondary-button').first().click()
  const healthAnalysisPrompt = await page.locator('.message.user .message-body').last().textContent()
  if (!healthAnalysisPrompt || !/不要(?:直接)?修改/.test(healthAnalysisPrompt)) {
    failures.push(`health: analysis action did not preserve the no-change boundary ${JSON.stringify(healthAnalysisPrompt)}`)
  }
  await page.locator('.nav-button[title="应用管理"]').click()
  await page.locator('select[aria-label="筛选应用"]').selectOption('system')
  const systemCard = page.locator('.app-card').filter({ hasText: 'App Store' })
  await systemCard.waitFor()
  if (await systemCard.locator('.uninstall-app').count()) failures.push('applications: system app exposes uninstall')
  await page.locator('select[aria-label="筛选应用"]').selectOption('all')
  await page.locator('input[aria-label="搜索应用名称"]').fill('Visual Studio Code')
  const applicationCard = page.locator('.app-card').first()
  await applicationCard.waitFor()
  await applicationCard.locator('.uninstall-app').click()
  await page.locator('[role="dialog"] .danger-button').click()
  await page.locator('.uninstall-progress').waitFor()
  await page.screenshot({ path: '/tmp/memento-interaction-uninstall.png' })
  await applicationCard.waitFor({ state: 'detached', timeout: 3_000 })
  await page.locator('input[aria-label="搜索应用名称"]').fill('Claude Code URL Handler')
  const claudeCard = page.locator('.app-card').first()
  await claudeCard.locator('.app-ignore-button').click()
  await page.getByRole('dialog', { name: /忽略 Claude Code URL Handler/ }).locator('.primary-button').click()
  await claudeCard.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '已忽略 1 项', exact: true }).click()
  const applicationIgnoredDialog = page.getByRole('dialog', { name: '忽略列表' })
  const applicationIgnoredTab = applicationIgnoredDialog.getByRole('tab', { name: /应用/ })
  if (await applicationIgnoredTab.getAttribute('aria-selected') !== 'true') {
    failures.push('applications: direct ignored-items entry did not open the Applications tab')
  }
  if (await applicationIgnoredDialog.locator('.ignored-row .app-logo').count() !== 1) {
    failures.push('applications: ignored application does not show an app logo')
  }
  const ignoredSearch = applicationIgnoredDialog.getByRole('searchbox', { name: '搜索忽略项目' })
  await ignoredSearch.fill('com.anthropic.claude-code-url-handler')
  await applicationIgnoredDialog.locator('.ignored-row').waitFor()
  await ignoredSearch.fill('not-a-real-ignored-app')
  await applicationIgnoredDialog.getByText('没有匹配的忽略项目', { exact: true }).waitFor()
  await ignoredSearch.fill('')
  await page.screenshot({ path: '/tmp/memento-interaction-application-ignored.png' })
  await applicationIgnoredDialog.getByRole('button', { name: '完成' }).click()
  await page.locator('.nav-button[title="设置"]').click()
  await page.getByRole('button', { name: '管理', exact: true }).click()
  await page.getByRole('tab', { name: /应用/ }).click()
  await page.locator('.ignored-row small').filter({ hasText: 'com.anthropic.claude-code-url-handler' }).waitFor()
  await page.getByRole('dialog', { name: '忽略列表' }).getByRole('button', { name: '完成' }).click()
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

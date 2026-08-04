import { chromium } from 'playwright-core'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174'
const expectedVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const pages = [
  ['overview', null],
  ['health', '清理'],
  ['apps', '应用管理'],
  ['disk', '磁盘分析'],
  ['agent', 'AI 助手'],
  ['history', '操作记录'],
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

async function navigate(page, title) {
  await page.locator(`button[title="${title}"]:visible`).first().click()
}

async function fillAgentPrompt(page, label, prompt) {
  const input = page.locator(`textarea[aria-label="${label}"]`)
  await input.waitFor({ state: 'visible', timeout: 15_000 })
  await input.fill(prompt, { timeout: 15_000 })
}

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
        await navigate(page, navigationTitle)
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
      if (viewport.width > 1100 && await page.locator('.brand-meta').count() !== 1) {
        failures.push(`${viewportName}/${pageName}: version-adjacent update region is missing`)
      }
      if (await page.locator('.update-notice').count()) {
        failures.push(`${viewportName}/${pageName}: removed standalone update notice is still rendered`)
      }
      if (await page.locator('.topbar-actions').count()) {
        failures.push(`${viewportName}/${pageName}: removed topbar actions are still rendered`)
      }
      if (pageName !== 'agent' && await page.locator('.page-heading').count()) {
        failures.push(`${viewportName}/${pageName}: redundant page heading is still rendered`)
      }
      if (pageName === 'overview') {
        if (await page.locator('.overview-card').count() !== 8) {
          failures.push(`${viewportName}/overview: expected eight live metric cards`)
        }
        if (!await page.locator('.overview-process-row').first().isVisible()) {
          failures.push(`${viewportName}/overview: process table is missing`)
        }
        if (await page.locator('.nav-list .nav-button').count() !== 4) {
          failures.push(`${viewportName}/overview: primary navigation is not limited to four product modules`)
        }
        if (viewport.width <= 520) {
          const mobileOverviewLayout = await page.evaluate(() => {
            const stack = document.querySelector('.page-stack')
            const navigation = document.querySelector('.sidebar')
            const overview = document.querySelector('.overview-page')
            if (!stack || !navigation || !overview) return null
            const stackRect = stack.getBoundingClientRect()
            const navigationRect = navigation.getBoundingClientRect()
            return {
              stackBottom: stackRect.bottom,
              navigationTop: navigationRect.top,
              scrollable: overview.scrollHeight > overview.clientHeight
            }
          })
          if (!mobileOverviewLayout || mobileOverviewLayout.stackBottom > mobileOverviewLayout.navigationTop + 1) {
            failures.push(`${viewportName}/overview: content viewport overlaps mobile navigation ${JSON.stringify(mobileOverviewLayout)}`)
          } else if (!mobileOverviewLayout.scrollable) {
            failures.push(`${viewportName}/overview: overview does not retain an independent mobile scroll area`)
          }
        }
      }
      if (viewport.width <= 520 && pageName === 'health') {
        const mobileHealthLayout = await page.evaluate(() => {
          const band = document.querySelector('.cleanup-summary-band')
          const firstFinding = document.querySelector('.cleanup-row')
          const navigation = document.querySelector('.sidebar')
          if (!band || !firstFinding || !navigation) return null
          const findingRect = firstFinding.getBoundingClientRect()
          const navigationRect = navigation.getBoundingClientRect()
          return {
            columns: getComputedStyle(band).gridTemplateColumns.split(' ').length,
            findingTop: findingRect.top,
            findingBottom: findingRect.bottom,
            navigationTop: navigationRect.top
          }
        })
        if (!mobileHealthLayout || mobileHealthLayout.columns !== 2) {
          failures.push(`${viewportName}/health: cleanup summary does not retain the compact two-column layout`)
        } else if (
          mobileHealthLayout.findingTop < mobileHealthLayout.navigationTop &&
          mobileHealthLayout.findingBottom > mobileHealthLayout.navigationTop
        ) {
          failures.push(`${viewportName}/health: first trusted finding is obscured by mobile navigation ${JSON.stringify(mobileHealthLayout)}`)
        }
      }
      await page.close()
    }
  }

  const settingsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await settingsPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(settingsPage, '设置')
  if (!await settingsPage.getByRole('button', { name: '扫描本机 AI 配置' }).isVisible()) {
    failures.push('settings: local AI configuration scan is missing')
  }
  if (!await settingsPage.getByRole('button', { name: '导入 CC Switch' }).isVisible()) {
    failures.push('settings: optional CC Switch import is missing')
  }
  if (!await settingsPage.getByText(/CC Switch 仅在你选择导入时读取，并执行相同校验/).isVisible()) {
    failures.push('settings: CC Switch import is not explained as optional and validated')
  }
  if (await settingsPage.getByLabel('接口类型').count()) {
    failures.push('settings: API type is still exposed as a user choice')
  }
  if (!await settingsPage.getByText('Memento 推荐模型', { exact: true }).isVisible()) {
    failures.push('settings: built-in recommended model is missing')
  }
  const updateCheckButton = settingsPage.getByRole('button', { name: '立即检查' })
  if (!await updateCheckButton.isVisible()) {
    failures.push('settings: manual update check is missing')
  } else {
    const bounds = await updateCheckButton.boundingBox()
    if (!bounds || bounds.width > 100 || bounds.height > 36) {
      failures.push(`settings: manual update check has oversized bounds ${JSON.stringify(bounds)}`)
    }
    await updateCheckButton.click()
    if (!await settingsPage.getByText('已是最新版本', { exact: true }).isVisible()) {
      failures.push('settings: manual update check did not reach the up-to-date state')
    }
  }
  if (!await settingsPage.getByText('Memento 每小时自动检查新版本，并在后台完成下载。').isVisible()) {
    failures.push('settings: background update behavior is not explained')
  }
  await settingsPage.close()

  const firstRunPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const firstRunUrl = new URL(baseUrl)
  firstRunUrl.searchParams.set('noProvider', '1')
  await firstRunPage.goto(firstRunUrl.href, { waitUntil: 'networkidle' })
  if (await firstRunPage.locator('.nav-button[title="概览"]').getAttribute('aria-current') !== 'page') {
    failures.push('first-run: app did not open on Overview')
  }
  if (!await firstRunPage.getByText('尚未配置模型', { exact: true }).isVisible()) {
    failures.push('first-run: no-provider state is missing')
  }
  for (const label of ['健康度', 'CPU', 'GPU', '内存', '电池', '磁盘', '网络', '性能状态']) {
    if (!await firstRunPage.locator('.overview-card header').getByText(label, { exact: true }).first().isVisible()) {
      failures.push(`overview: ${label} metric is missing`)
    }
  }
  await navigate(firstRunPage, '清理')
  if (!await firstRunPage.getByRole('tab', { name: /安全清理/ }).isVisible() ||
      !await firstRunPage.getByRole('tab', { name: /需要确认/ }).isVisible()) {
    failures.push('cleanup: safe and review findings are not separated')
  }
  try {
    await firstRunPage.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.textContent?.includes('清理所选项目'))
      return button instanceof HTMLButtonElement && !button.disabled
    }, undefined, { timeout: 15_000 })
  } catch {
    failures.push('first-run: deterministic direct action is disabled without a provider')
  }
  await firstRunPage.screenshot({ path: '/tmp/memento-first-run-no-provider.png' })
  await firstRunPage.close()

  const updatePage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const updateUrl = new URL(baseUrl)
  updateUrl.searchParams.set('demoUpdate', 'downloaded')
  await updatePage.goto(updateUrl.href, { waitUntil: 'networkidle' })
  const installUpdateButton = updatePage.getByRole('button', { name: '安装新版本并重启 Memento' })
  if (!await installUpdateButton.isVisible()) {
    failures.push('update: version-adjacent install button is missing')
  } else {
    await updatePage.screenshot({ path: '/tmp/memento-interaction-update-ready.png' })
    await installUpdateButton.click()
    if (!await updatePage.getByRole('button', { name: '正在安装新版本' }).isDisabled()) {
      failures.push('update: install button did not enter the installing state')
    }
  }
  if (await updatePage.locator('.update-notice').count()) {
    failures.push('update: standalone update notice is still rendered')
  }
  await updatePage.close()

  const concurrentPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await concurrentPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(concurrentPage, 'AI 助手')
  await fillAgentPrompt(concurrentPage, '输入任务', '分析 Xcode 派生数据')
  await concurrentPage.locator('button[aria-label="发送"]').click()
  await navigate(concurrentPage, '清理')
  await concurrentPage.locator('button[aria-label^="让 AI 解释"]').first().click()
  const taskItems = concurrentPage.locator('.agent-task-item')
  await taskItems.nth(1).waitFor()
  if (await taskItems.count() !== 2) failures.push('agent-concurrency: both analysis tasks are not visible')
  const activeConversationPrompts = await concurrentPage.locator('.conversation .message.user').allTextContents()
  if (
    activeConversationPrompts.length !== 1 ||
    activeConversationPrompts.some((prompt) => prompt.includes('分析 Xcode 派生数据'))
  ) {
    failures.push(`agent-concurrency: isolated analysis reused another conversation ${JSON.stringify(activeConversationPrompts)}`)
  }
  await taskItems.first().locator('.agent-task-select').click()
  if (!await concurrentPage.locator('.message.user').filter({ hasText: '分析 Xcode 派生数据' }).count()) {
    failures.push('agent-concurrency: first analysis cannot be reopened')
  }
  await taskItems.nth(1).locator('.agent-task-close').click()
  if (await concurrentPage.locator('.agent-task-switcher').count()) {
    failures.push('agent-concurrency: closed task remains in the workspace switcher')
  }
  await concurrentPage.screenshot({ path: '/tmp/memento-interaction-agent-concurrency.png' })
  await concurrentPage.close()

  const conversationPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await conversationPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(conversationPage, '清理')
  await conversationPage.getByRole('tab', { name: /需要确认/ }).click()
  const lingmaRow = conversationPage.locator('.cleanup-row').filter({ hasText: '.lingma' })
  if (!await lingmaRow.count()) {
    failures.push('agent-evidence: .lingma storage finding is missing')
  } else {
    await lingmaRow.getByRole('button', { name: /让 AI 解释/ }).click()
    await conversationPage.locator('.agent-result-section').waitFor({ timeout: 5_000 })
    await conversationPage.locator('textarea[aria-label="输入任务"]').fill('它现在还可能被什么使用？')
    await conversationPage.locator('button[aria-label="发送"]').click()
    await conversationPage.locator('.conversation .message.user').nth(1).waitFor({ timeout: 2_000 })
    await conversationPage.waitForTimeout(1_100)
    if (await conversationPage.locator('.agent-task-switcher').count()) {
      failures.push('agent-conversation: a follow-up turn created another task tab')
    }
  }
  await conversationPage.close()

  const healthReviewPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await healthReviewPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(healthReviewPage, '清理')
  if (await healthReviewPage.locator('.cleanup-categories button').count() !== 7) {
    failures.push('cleanup-categories: expected seven stable cleanup categories')
  }
  await healthReviewPage.getByRole('button', { name: /浏览器缓存/ }).click()
  if (!await healthReviewPage.locator('.cleanup-row').filter({ hasText: 'Safari' }).count()) {
    failures.push('cleanup-categories: browser category does not isolate browser rules')
  }
  await healthReviewPage.getByRole('tab', { name: /需要确认/ }).click()
  await healthReviewPage.getByRole('button', { name: /全部项目/ }).click()
  if (!await healthReviewPage.locator('.cleanup-trust.is-clue').count()) {
    failures.push('cleanup-review: outside-rule clues are not visibly isolated')
  }
  await healthReviewPage.close()

  const diskPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await diskPage.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(diskPage, '磁盘分析')
  await diskPage.locator('.disk-usage-surface').waitFor({ timeout: 3_000 })
  await diskPage.locator('.disk-column').first().locator('.disk-node').first().click()
  await diskPage.locator('.disk-column').nth(1).locator('.disk-node').first().click()
  if (await diskPage.locator('.disk-column').count() < 3) {
    failures.push('disk-browser: hierarchy did not open a third column')
  }
  if (await diskPage.locator('.disk-usage-surface [role="progressbar"]').count()) {
    failures.push('disk-browser: asynchronous scan uses a fake percentage progress bar')
  }
  const askTarget = diskPage.locator('.disk-column').last().locator('.disk-node').first()
  await askTarget.click({ button: 'right' })
  const askItem = diskPage.locator('.disk-context-menu').getByRole('menuitem', { name: '询问 AI' })
  if (!await askItem.isVisible()) {
    failures.push('disk-browser: directory context menu does not expose Ask AI')
  } else {
    await askItem.click()
    await diskPage.locator('.message.user').filter({ hasText: '分析磁盘目录' }).waitFor()
    await navigate(diskPage, '磁盘分析')
    await diskPage.locator('.disk-column').first().locator('.disk-node').first().click()
    await diskPage.locator('.disk-column').nth(1).locator('.disk-node').first().click()
  }
  await diskPage.getByRole('button', { name: '全屏浏览' }).click()
  for (let removal = 0; removal < 2; removal += 1) {
    const trashTarget = diskPage.locator('.disk-column').last().locator('.disk-node').first()
    const trashTargetId = await trashTarget.getAttribute('data-node-id')
    await trashTarget.click({ button: 'right' })
    const diskContextMenu = diskPage.locator('.disk-context-menu')
    await diskContextMenu.waitFor()
    await diskContextMenu.getByRole('menuitem', { name: '移到废纸篓' }).click()
    const diskTrashDialog = diskPage.getByRole('dialog', { name: /移到废纸篓/ })
    await diskTrashDialog.waitFor()
    if (!await diskTrashDialog.getByText(/整个目录|文件会移到废纸篓/).count()) {
      failures.push('disk-browser: Trash confirmation does not explain the removal scope')
    }
    await diskTrashDialog.getByRole('button', { name: '移到废纸篓', exact: true }).click()
    if (trashTargetId) {
      await diskPage.locator(`.disk-node[data-node-id="${trashTargetId}"]`).waitFor({ state: 'detached' })
    } else {
      failures.push(`disk-browser: Trash target ${removal + 1} did not expose its registered ID`)
    }
  }
  await diskPage.getByRole('button', { name: '退出全屏' }).click()
  await diskPage.screenshot({ path: '/tmp/memento-interaction-disk-browser.png' })
  await diskPage.setViewportSize({ width: 390, height: 844 })
  await diskPage.screenshot({ path: '/tmp/memento-interaction-disk-browser-mobile.png', fullPage: true })
  const diskMobileOverflow = await diskPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (diskMobileOverflow > 1) failures.push(`disk-browser/mobile: horizontal page overflow ${diskMobileOverflow}`)
  await diskPage.close()

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await navigate(page, 'AI 助手')
  await fillAgentPrompt(page, '输入任务', '检查可以安全清理的空间')
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
  if (executionStart < 5 || executionStart > 20) failures.push(`agent-execution: unrealistic starting progress ${executionStart}`)
  await page.screenshot({ path: '/tmp/memento-interaction-agent-execution.png' })
  await executionDialog.getByRole('button', { name: '完成' }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => !document.querySelector('[role="dialog"] .dialog-actions button')?.hasAttribute('disabled'))
  await executionDialog.getByRole('button', { name: '完成' }).click()

  await navigate(page, '操作记录')
  const maintenanceTab = page.getByRole('tab', { name: /维护账本/ })
  if (await maintenanceTab.getAttribute('aria-selected') !== 'true') {
    failures.push('maintenance-history: maintenance ledger is not the default history view')
  }
  const maintenanceEntry = page.locator('.maintenance-history-row').first()
  if (!await maintenanceEntry.isVisible()) {
    failures.push('maintenance-history: completed operation is not visible')
  } else {
    if (!await maintenanceEntry.getByText('已完成', { exact: true }).isVisible()) {
      failures.push('maintenance-history: completion status is missing')
    }
    const recoveryButton = maintenanceEntry.getByRole('button', { name: '显示配置备份' })
    if (!await recoveryButton.isVisible()) {
      failures.push('maintenance-history: recovery action is missing')
    } else {
      await recoveryButton.click()
      await page.getByText('已打开恢复位置', { exact: true }).waitFor()
    }
  }
  await page.screenshot({ path: '/tmp/memento-interaction-maintenance-history.png' })
  await page.getByRole('tab', { name: /Agent 对话/ }).click()
  const historyEntries = page.locator('.history-entry')
  const historyCount = await historyEntries.count()
  if (await page.getByRole('button', { name: '导出', exact: true }).count()) {
    failures.push('history-search: obsolete export action is still rendered')
  }
  const historySearch = page.getByRole('searchbox', { name: '搜索历史记录' })
  const firstHistoryTitle = await historyEntries.first().locator('.history-title strong').textContent()
  await historySearch.fill(firstHistoryTitle ?? '')
  if (await historyEntries.count() !== 1) failures.push('history-search: task filtering did not narrow the list')
  await historySearch.fill('')
  await page.getByRole('checkbox', { name: '全选当前记录' }).check()
  const bulkDelete = page.getByRole('button', { name: new RegExp(`删除所选（${historyCount}）`) })
  if (!await bulkDelete.isVisible()) failures.push('history-delete: bulk deletion action is missing')
  else await bulkDelete.click()
  const bulkDeleteDialog = page.getByRole('dialog', {
    name: historyCount > 1 ? new RegExp(`删除 ${historyCount} 条任务记录`) : '删除任务记录？'
  })
  await bulkDeleteDialog.waitFor()
  await page.screenshot({ path: '/tmp/memento-interaction-history-delete.png' })
  await bulkDeleteDialog.locator('.danger-button').click()
  if (await historyEntries.count() !== 0) failures.push('history-delete: selected task rows were not removed')

  await navigate(page, '清理')
  if (!await page.getByRole('tab', { name: /安全清理/ }).isVisible() ||
      !await page.getByRole('tab', { name: /需要确认/ }).isVisible()) {
    failures.push('cleanup: trust-level switcher is missing')
  }
  if (await page.locator('.cleanup-categories button').count() !== 7) {
    failures.push('cleanup: stable category navigation is incomplete')
  }
  const batchButton = page.getByRole('button', { name: /清理所选项目/ })
  await batchButton.click()
  const batchDialog = page.getByRole('dialog', { name: /确认清理 \d+ 项/ })
  await batchDialog.waitFor()
  if (!await batchDialog.getByText(/再次通过路径校验/).count()) {
    failures.push('cleanup-batch: confirmation does not state the execution-time validation boundary')
  }
  await batchDialog.getByRole('button', { name: '取消' }).click()

  const candidateLocation = page.locator('.cleanup-row .candidate-location').first()
  if (!await candidateLocation.isVisible()) failures.push('health/storage: cleanup finding path is missing')
  else await candidateLocation.click()
  const directCandidate = page.locator('.cleanup-row').first()
  const directCandidateId = await directCandidate.getAttribute('data-focus-id')
  const directCandidateCount = await page.locator('.cleanup-row').count()
  await directCandidate.locator('.cleanup-single-action').click()
  const directConfirm = page.getByRole('dialog', { name: /直接执行/ })
  await directConfirm.waitFor()
  const directStartedAt = Date.now()
  await directConfirm.locator('.primary-button, .danger-button').click()
  const directProgress = page.locator('[role="dialog"]').filter({ has: page.locator('.execution-stage') })
  await directProgress.waitFor()
  await page.waitForFunction(() => !document.querySelector('[role="dialog"] .dialog-actions button')?.hasAttribute('disabled'))
  const directDuration = Date.now() - directStartedAt
  if (directDuration < 2_400 || directDuration > 5_000) {
    failures.push(`health/storage: direct deletion feedback took ${directDuration}ms instead of about 3 seconds`)
  }
  if (!directCandidateId || await page.locator(`[data-focus-id="${directCandidateId}"]`).count()) {
    failures.push('health/storage: completed permanent cleanup did not remove its current finding')
  }
  if (await page.locator('.cleanup-row').count() !== directCandidateCount - 1) {
    failures.push('health/storage: completed permanent cleanup removed an unexpected number of findings')
  }
  await directProgress.getByRole('button', { name: '完成' }).click()

  await page.getByRole('tab', { name: /需要确认/ }).click()
  const reviewRow = page.locator('.cleanup-row').filter({ hasText: '.lingma' })
  await reviewRow.getByRole('button', { name: /让 AI 解释/ }).click()
  const returnButton = page.getByRole('button', { name: '返回存储空间' })
  await returnButton.waitFor()
  const healthAnalysisPrompt = await page.locator('.message.user .message-body').last().textContent()
  if (!healthAnalysisPrompt || !/不要直接执行/.test(healthAnalysisPrompt)) {
    failures.push(`health: analysis action did not preserve the no-change boundary ${JSON.stringify(healthAnalysisPrompt)}`)
  }
  await returnButton.click()
  if (await page.getByRole('tab', { name: /需要确认/ }).getAttribute('aria-selected') !== 'true') {
    failures.push('agent-return: source cleanup trust level was not restored')
  }
  await page.waitForFunction(() => Boolean(document.activeElement?.getAttribute('data-focus-id')))
  await page.waitForTimeout(1_000)
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
  await navigate(page, '设置')
  await page.getByRole('button', { name: '管理', exact: true }).click()
  await page.getByRole('tab', { name: /应用/ }).click()
  await page.locator('.ignored-row small').filter({ hasText: 'com.anthropic.claude-code-url-handler' }).waitFor()
  await page.getByRole('dialog', { name: '忽略列表' }).getByRole('button', { name: '完成' }).click()
  await page.locator('button[aria-label="添加供应商"]').click()
  await page.locator('#provider-preset').selectOption('antigravity')
  await page.locator('#provider-name').fill('测试供应商')
  if (!await page.locator('.recommended-model code').getByText('gemini-3.1-pro-high', { exact: true }).isVisible()) {
    failures.push('settings: Antigravity recommended model is missing')
  }
  if (await page.locator('#provider-type').count() || await page.locator('#provider-url').count()) {
    failures.push('settings: official provider protocol or base URL is exposed')
  }
  await page.locator('#provider-key').fill('test-key')
  await page.getByText('高级设置', { exact: true }).click()
  await page.locator('#provider-model').waitFor({ state: 'visible' })
  await page.locator('#provider-model').selectOption('gemini-3.1-pro-preview', { timeout: 4_000 })
  await page.screenshot({ path: '/tmp/memento-interaction-provider-models.png' })
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await page.getByText('测试供应商', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '删除配置', exact: true }).click()
  const providerDeleteDialog = page.getByRole('dialog', { name: /删除“测试供应商”配置/ })
  await providerDeleteDialog.waitFor()
  if (!await providerDeleteDialog.getByText(/不会修改 Claude、Codex、Gemini、Grok 或 CC Switch/).count()) {
    failures.push('settings: provider deletion does not explain its external configuration boundary')
  }
  await providerDeleteDialog.getByRole('button', { name: '取消' }).click()
  await page.close()

  for (const [name, viewport] of [
    ['1024x768', { width: 1024, height: 768 }],
    ['390x844', { width: 390, height: 844 }]
  ]) {
    const resultPage = await browser.newPage({ viewport })
    await resultPage.goto(baseUrl, { waitUntil: 'networkidle' })
    await navigate(resultPage, 'AI 助手')
    await fillAgentPrompt(resultPage, '输入任务', '帮我检查长期没用的应用和可以安全清理的应用残留')
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
  await navigate(englishPage, '设置')
  await englishPage.locator('.setting-row select').last().selectOption('en-US')
  await navigate(englishPage, 'AI assistant')
  await fillAgentPrompt(englishPage, 'Enter task', '帮我检查长期没用的应用')
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

console.log(`UI smoke test passed: ${viewports.length * pages.length} viewport screenshots plus interaction captures in /tmp`)

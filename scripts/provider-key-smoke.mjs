import assert from 'node:assert/strict'
import { createServer } from 'node:http'

// Exercise the production Renderer, IPC, encrypted store and SDK against a
// loopback provider. Only synthetic credentials are used by this test.
export async function verifyProviderKeyEditing(page) {
  const requests = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
    requests.push({ path: request.url, authorization: request.headers.authorization })
    response.setHeader('content-type', 'application/json')
    if (request.headers.authorization === 'Bearer smoke-invalid-3333') {
      response.writeHead(401)
      response.end(JSON.stringify({ error: { message: 'Synthetic invalid credential' } }))
      return
    }
    if (request.url === '/v1/models') {
      response.end(JSON.stringify({ data: [{ id: 'smoke-model' }] }))
      return
    }
    const probe = body?.tools?.some((item) => item.function?.name === 'connection_probe') &&
      !body.messages.some((item) => item.role === 'tool')
    response.end(JSON.stringify({
      id: 'smoke-response', object: 'chat.completion', created: 1, model: 'smoke-model',
      choices: [{ index: 0, finish_reason: probe ? 'tool_calls' : 'stop', message: probe
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'smoke-call', type: 'function',
            function: { name: 'connection_probe', arguments: '{"acknowledgement":"ready"}' } }] }
        : { role: 'assistant', content: 'OK' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const input = {
      id: 'cc-switch-smoke-key-edit', name: 'Key editing regression',
      type: 'openai-compatible', baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'smoke-model', apiKey: 'smoke-original-1111'
    }
    await page.evaluate((provider) => window.memento.saveAgentProvider(provider), input)
    await page.reload()
    await page.locator('.nav-button[title="概览"]').waitFor({ timeout: 60_000 })
    await page.locator('.utility-button[title="设置"]').click()
    await page.locator('.provider-item').filter({ hasText: input.name }).click()
    const key = page.locator('#provider-key')
    await page.waitForFunction(() => document.querySelector('#provider-key')?.placeholder === '••••1111')
    await key.fill('smoke-replacement-2222')
    await page.locator('#provider-name').fill('Edited local copy')
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.locator('.provider-editor-header .risk-label').filter({ hasText: '已连接' }).waitFor()
    assert.equal(await key.inputValue(), 'smoke-replacement-2222', 'Testing must retain the unsaved replacement key')
    assert.equal(await page.locator('#provider-name').inputValue(), 'Edited local copy')
    assert(requests.some((request) => request.path === '/v1/chat/completions' &&
      request.authorization === 'Bearer smoke-replacement-2222'), 'Connection test must use the replacement key')

    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.waitForFunction(() => {
      const key = document.querySelector('#provider-key')
      return key?.value === '' && key.placeholder === '••••2222'
    })
    // Reload only after the automatic scan finishes; a second scan cannot run
    // while the main process is still serving the previous Renderer.
    await page.locator('.nav-button[title="清理"]').click()
    await page.locator('.page-command-summary').filter({ hasText: '最后扫描' }).waitFor({ timeout: 120_000 })
    await page.reload()
    await page.locator('.nav-button[title="概览"]').waitFor({ timeout: 60_000 })
    await page.locator('.utility-button[title="设置"]').click()
    await page.locator('.provider-item').filter({ hasText: 'Edited local copy' }).click()
    await page.waitForFunction(() => document.querySelector('#provider-key')?.placeholder === '••••2222')
    const offset = requests.length
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.locator('.provider-editor-header .risk-label').filter({ hasText: '已连接' }).waitFor()
    const savedRequests = requests.slice(offset).filter((request) => request.path === '/v1/chat/completions')
    assert.equal(savedRequests.length, 2)
    assert(savedRequests.every((request) => request.authorization === 'Bearer smoke-replacement-2222'),
      'Requests after reload must use the encrypted saved replacement key')

    await key.fill('smoke-invalid-3333')
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.locator('.provider-error-panel').filter({ hasText: '连接测试失败' }).waitFor()
    assert.equal(await key.inputValue(), 'smoke-invalid-3333', 'Failed tests must retain edits too')
    const saved = await page.evaluate(async (id) => (await window.memento.listAgentProviders()).find((item) => item.id === id), input.id)
    assert.equal(saved.keyHint, '••••2222', 'Testing must not save a draft key')
    assert(!('apiKey' in saved), 'Saved plaintext keys must not cross IPC')

    await key.fill('smoke-direct-save-4444')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('#provider-key')?.placeholder === '••••4444')
    await page.locator('#provider-name').fill('Renamed without changing the key')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.provider-item.is-active strong')?.textContent === 'Renamed without changing the key')
    assert.equal(await key.getAttribute('placeholder'), '••••4444', 'Blank key must preserve the saved credential')
    const finalOffset = requests.length
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.locator('.provider-editor-header .risk-label').filter({ hasText: '已连接' }).waitFor()
    assert(requests.slice(finalOffset).filter((request) => request.path === '/v1/chat/completions')
      .every((request) => request.authorization === 'Bearer smoke-direct-save-4444'))
    console.log('Provider key regression passed: edit, test, save, reload, failure and blank-key preservation')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

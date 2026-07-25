import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const host = process.env.MEMENTO_GATEWAY_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.MEMENTO_GATEWAY_PORT || '8787', 10)
const gatewayToken = process.env.MEMENTO_GATEWAY_TOKEN
const upstreamBaseUrl = (process.env.TCZOR_BASE_URL || 'https://code.tczor.cn').replace(
  /\/$/,
  ''
)
const upstreamKey = process.env.TCZOR_API_KEY
const upstreamModel = process.env.TCZOR_MODEL || 'gpt-5.5'
const mockProvider = process.env.MOCK_PROVIDER === '1'
const maxBodyBytes = 64 * 1024

if (!gatewayToken) {
  throw new Error('MEMENTO_GATEWAY_TOKEN is required')
}

if (!mockProvider && !upstreamKey) {
  throw new Error('TCZOR_API_KEY is required unless MOCK_PROVIDER=1')
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(`${JSON.stringify(body, null, 2)}\n`)
}

function secureEqual(left, right) {
  const leftDigest = createHash('sha256').update(left).digest()
  const rightDigest = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

function authorize(request) {
  const value = request.headers.authorization || ''
  const prefix = 'Bearer '
  return value.startsWith(prefix) && secureEqual(value.slice(prefix.length), gatewayToken)
}

async function readJsonBody(request) {
  const chunks = []
  let length = 0

  for await (const chunk of request) {
    length += chunk.length
    if (length > maxBodyBytes) {
      const error = new Error('Request body exceeds 64 KiB')
      error.code = 'BODY_TOO_LARGE'
      throw error
    }
    chunks.push(chunk)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function validateReport(body) {
  const report = body?.report
  const shell = report?.shell
  if (!report || report.schemaVersion !== 1 || !shell) {
    throw new Error('Expected report.schemaVersion=1 and report.shell')
  }

  for (const field of ['baselineMs', 'startupMs', 'configCostMs']) {
    const value = shell[field]
    if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`report.shell.${field} must be a non-negative number or null`)
    }
  }

  if (!Array.isArray(report.findings) || report.findings.length > 64) {
    throw new Error('report.findings must be an array with at most 64 items')
  }

  return {
    schemaVersion: 1,
    shell: {
      family: String(shell.family || 'unknown').slice(0, 32),
      baselineMs: shell.baselineMs ?? null,
      startupMs: shell.startupMs ?? null,
      configCostMs: shell.configCostMs ?? null,
      sampleCount: Math.min(Math.max(Number(shell.sampleCount) || 0, 0), 10)
    },
    findings: report.findings.map((finding) => ({
      id: String(finding.id || '').slice(0, 80),
      code: String(finding.code || 'unknown').slice(0, 80),
      severity: ['good', 'notice', 'slow'].includes(finding.severity)
        ? finding.severity
        : 'notice',
      durationMs:
        Number.isFinite(finding.durationMs) && finding.durationMs >= 0
          ? finding.durationMs
          : undefined,
      source: finding.source
        ? {
            kind: String(finding.source.kind || 'unknown').slice(0, 40),
            logicalPath: String(finding.source.logicalPath || '').slice(0, 120),
            line: Number.isInteger(finding.source.line) ? finding.source.line : undefined
          }
        : null
    }))
  }
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text
  if (!Array.isArray(payload.output)) return null

  for (const item of payload.output) {
    if (!Array.isArray(item.content)) continue
    for (const content of item.content) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return content.text
      }
    }
  }
  return null
}

function parseJsonText(text) {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(withoutFence)
}

function validateAnalysis(value, validEvidenceIds) {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string') {
    throw new Error('Upstream output is missing summary')
  }

  const priority = ['low', 'medium', 'high'].includes(value.priority)
    ? value.priority
    : 'medium'
  const suggestions = Array.isArray(value.suggestions) ? value.suggestions.slice(0, 5) : []

  return {
    summary: value.summary.slice(0, 1200),
    priority,
    suggestions: suggestions.map((suggestion) => ({
      title: String(suggestion.title || '').slice(0, 200),
      explanation: String(suggestion.explanation || '').slice(0, 1600),
      evidenceIds: Array.isArray(suggestion.evidenceIds)
        ? suggestion.evidenceIds
            .map(String)
            .filter((id) => validEvidenceIds.has(id))
            .slice(0, 8)
        : []
    }))
  }
}

function mockAnalysis(report) {
  const slowFindings = report.findings.filter((finding) => finding.severity === 'slow')
  return {
    summary:
      report.shell.configCostMs > 300
        ? `用户配置增加约 ${report.shell.configCostMs} ms，建议优先处理同步初始化项。`
        : '当前 shell 配置耗时没有达到明显偏慢的阈值。',
    priority: slowFindings.length ? 'high' : 'low',
    suggestions: slowFindings.slice(0, 2).map((finding) => ({
      title: `检查 ${finding.code}`,
      explanation: '该项目来自本地确定性扫描，修改前应核对对应配置位置。',
      evidenceIds: [finding.id]
    }))
  }
}

async function callUpstream(report) {
  const instructions = [
    '你是 macOS 终端启动诊断助手。',
    '只依据输入报告给出结论，不要声称执行了命令。',
    '不要建议直接删除文件，也不要编造输入中不存在的耗时。',
    '只返回 JSON，不要使用 Markdown 代码围栏。',
    'JSON 结构：',
    '{"summary":"string","priority":"low|medium|high","suggestions":[{"title":"string","explanation":"string","evidenceIds":["finding-id"]}]}'
  ].join('\n')

  const upstreamResponse = await fetch(`${upstreamBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${upstreamKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: upstreamModel,
      store: false,
      instructions,
      input: JSON.stringify(report)
    }),
    signal: AbortSignal.timeout(60_000)
  })

  if (!upstreamResponse.ok) {
    await upstreamResponse.body?.cancel()
    const error = new Error(`Upstream request failed with status ${upstreamResponse.status}`)
    error.code = 'UPSTREAM_ERROR'
    throw error
  }

  const payload = await upstreamResponse.json()
  const text = extractOutputText(payload)
  if (!text) {
    const error = new Error('Upstream response did not contain output_text')
    error.code = 'UPSTREAM_INVALID_OUTPUT'
    throw error
  }

  return {
    analysis: parseJsonText(text),
    usage: payload.usage
      ? {
          inputTokens: payload.usage.input_tokens,
          outputTokens: payload.usage.output_tokens
        }
      : undefined
  }
}

const server = createServer(async (request, response) => {
  const requestId = randomUUID()
  response.setHeader('x-request-id', requestId)

  if (request.method === 'GET' && request.url === '/v1/health') {
    sendJson(response, 200, { ok: true, mockProvider, model: upstreamModel })
    return
  }

  if (request.method !== 'POST' || request.url !== '/v1/analysis/terminal') {
    sendJson(response, 404, { error: { code: 'NOT_FOUND', requestId } })
    return
  }

  if (!authorize(request)) {
    sendJson(response, 401, { error: { code: 'UNAUTHORIZED', requestId } })
    return
  }

  try {
    const body = await readJsonBody(request)
    const report = validateReport(body)
    const validEvidenceIds = new Set(report.findings.map((finding) => finding.id))
    const upstream = mockProvider
      ? { analysis: mockAnalysis(report), usage: undefined }
      : await callUpstream(report)
    const analysis = validateAnalysis(upstream.analysis, validEvidenceIds)

    sendJson(response, 200, {
      schemaVersion: 1,
      requestId,
      provider: mockProvider ? 'mock' : 'tczor',
      model: upstreamModel,
      analysis,
      usage: upstream.usage
    })
  } catch (error) {
    const code = error?.code || 'INVALID_REQUEST'
    const status = code === 'BODY_TOO_LARGE' ? 413 : code.startsWith('UPSTREAM_') ? 502 : 400
    sendJson(response, status, {
      error: {
        code,
        message: error instanceof Error ? error.message : 'Request failed',
        requestId
      }
    })
  }
})

server.listen(port, host, () => {
  process.stdout.write(
    `Memento AI Gateway listening on http://${host}:${port} (${mockProvider ? 'mock' : 'tczor'})\n`
  )
})

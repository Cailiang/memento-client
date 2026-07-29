import type {
  AgentProviderModelsResult,
  AgentProviderType
} from '../../shared/agent-types'

export interface PrivateModelDiscoveryInput {
  type: AgentProviderType
  baseUrl: string
  apiKey: string
}

type FetchProvider = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

const DEFAULT_API_PATH: Record<AgentProviderType, string> = {
  'openai-compatible': '/v1',
  openai: '/v1',
  anthropic: '/v1',
  google: '/v1beta'
}

const ENDPOINT_SUFFIXES = [
  '/chat/completions',
  '/responses',
  '/messages',
  '/models'
]

export function normalizeProviderBaseUrl(type: AgentProviderType, value: string): string {
  const source = value.trim()
  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    throw new Error('服务地址格式无效')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('服务地址只支持 HTTP 或 HTTPS')
  }
  if (parsed.username || parsed.password) {
    throw new Error('服务地址不能包含用户名或密码')
  }

  parsed.search = ''
  parsed.hash = ''
  let pathname = parsed.pathname.replace(/\/+$/, '')
  const lowercasePath = pathname.toLowerCase()
  const endpointSuffix = ENDPOINT_SUFFIXES.find((suffix) => lowercasePath.endsWith(suffix))
  if (endpointSuffix) pathname = pathname.slice(0, -endpointSuffix.length)
  if (!pathname || pathname === '/') pathname = DEFAULT_API_PATH[type]
  parsed.pathname = pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/+$/, '')
}

const NON_AGENT_MODEL_PATTERNS = [
  /(^|[-_.])(audio|realtime|transcribe|transcription)([-_.]|$)/,
  /(^|[-_.])(image|dall-e)([-_.]|$)/,
  /(^|[-_.])(embedding|embeddings|embed)([-_.]|$)/,
  /(^|[-_.])(moderation|tts|speech|whisper)([-_.]|$)/,
  /^codex-auto-review$/
]

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((item): item is string => typeof item === 'string')
}

export function isAgentCapableModel(
  type: AgentProviderType,
  id: string,
  metadata: Record<string, unknown>
): boolean {
  const normalizedId = id.toLowerCase()
  if (NON_AGENT_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedId))) return false

  if (type === 'google') {
    const methods = stringArray(metadata.supportedGenerationMethods)
    if (methods?.length) {
      return methods.some((method) =>
        ['generatecontent', 'streamgeneratecontent'].includes(method.toLowerCase())
      )
    }
  }

  const endpoints = stringArray(metadata.supported_endpoint_types) ??
    stringArray(metadata.supportedEndpoints)
  if (endpoints?.length) {
    return endpoints.some((endpoint) => /chat|response|message|generatecontent/i.test(endpoint))
  }
  return true
}

function parseModels(
  type: AgentProviderType,
  payload: unknown
): { models: string[]; excludedModelCount: number } {
  if (!payload || typeof payload !== 'object') return { models: [], excludedModelCount: 0 }
  const record = payload as Record<string, unknown>
  const entries = type === 'google' ? record.models : record.data
  if (!Array.isArray(entries)) return { models: [], excludedModelCount: 0 }
  const discovered = entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const value = type === 'google' ? item.name : item.id
    if (typeof value !== 'string' || !value.trim()) return []
    const id = type === 'google' ? value.replace(/^models\//, '') : value
    return id.trim() ? [{ id: id.trim(), metadata: item }] : []
  })
  const unique = [...new Map(discovered.map((model) => [model.id, model])).values()]
  const models = unique
    .filter((model) => isAgentCapableModel(type, model.id, model.metadata))
    .map((model) => model.id)
    .sort((left, right) =>
      left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' })
    )
  return { models, excludedModelCount: unique.length - models.length }
}

function discoveryHeaders(input: PrivateModelDiscoveryInput): HeadersInit {
  if (input.type === 'anthropic') {
    return {
      Accept: 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': input.apiKey
    }
  }
  if (input.type === 'google') return { Accept: 'application/json' }
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${input.apiKey}`
  }
}

function modelsEndpoint(input: PrivateModelDiscoveryInput, baseUrl: string): URL {
  const endpoint = new URL(`${baseUrl.replace(/\/+$/, '')}/models`)
  if (input.type === 'google') endpoint.searchParams.set('key', input.apiKey)
  return endpoint
}

function responseError(status: number): Error {
  if (status === 401 || status === 403) {
    return new Error('请求密钥无效，或没有读取模型列表的权限')
  }
  if (status === 404 || status === 405) {
    return new Error('服务没有提供模型列表接口')
  }
  if (status === 429) return new Error('模型服务请求过于频繁，请稍后重试')
  if (status >= 500) return new Error('模型服务暂时不可用，请稍后重试')
  return new Error(`获取模型列表失败（HTTP ${status}）`)
}

export async function discoverProviderModels(
  input: PrivateModelDiscoveryInput,
  fetchProvider: FetchProvider = fetch,
  timeoutMs = 15_000
): Promise<AgentProviderModelsResult> {
  const resolvedBaseUrl = normalizeProviderBaseUrl(input.type, input.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchProvider(modelsEndpoint(input, resolvedBaseUrl), {
      method: 'GET',
      headers: discoveryHeaders(input),
      signal: controller.signal
    })
    if (!response.ok) throw responseError(response.status)
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new Error('模型列表接口返回了无法识别的数据')
    }
    const { models, excludedModelCount } = parseModels(input.type, payload)
    if (!models.length) throw new Error('服务已连接，但没有返回可用模型')
    return { models, resolvedBaseUrl, excludedModelCount }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('获取模型列表超时，请检查服务地址或网络后重试')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

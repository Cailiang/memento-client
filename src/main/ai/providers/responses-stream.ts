import { AiError } from '../errors'

export interface ResponsesStreamResult {
  text: string
  inputTokens?: number
  outputTokens?: number
}

function outputTextFromResponse(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const response = value as Record<string, unknown>
  if (typeof response.output_text === 'string') return response.output_text
  if (!Array.isArray(response.output)) return null
  for (const rawItem of response.output) {
    if (!rawItem || typeof rawItem !== 'object') continue
    const item = rawItem as Record<string, unknown>
    if (!Array.isArray(item.content)) continue
    for (const rawContent of item.content) {
      if (!rawContent || typeof rawContent !== 'object') continue
      const content = rawContent as Record<string, unknown>
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return null
}

export function parseJsonText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new AiError('AI_INVALID_OUTPUT', '模型没有返回有效 JSON')
  }
}

export async function readResponsesStream(response: Response): Promise<ResponsesStreamResult> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    let payload: Record<string, unknown>
    try {
      payload = (await response.json()) as Record<string, unknown>
    } catch {
      throw new AiError('AI_INVALID_OUTPUT', '模型没有返回有效 JSON')
    }
    const text = outputTextFromResponse(payload)
    if (!text) throw new AiError('AI_INVALID_OUTPUT', '模型响应缺少 output_text')
    const usage = payload.usage as Record<string, unknown> | undefined
    return {
      text,
      inputTokens: Number(usage?.input_tokens) || undefined,
      outputTokens: Number(usage?.output_tokens) || undefined
    }
  }
  if (!response.body) throw new AiError('AI_INVALID_OUTPUT', '模型响应没有数据流')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  const processLine = (line: string): void => {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line.slice(6)) as Record<string, unknown>
    } catch {
      return
    }
    const type = String(event.type ?? '')
    if (type === 'response.output_text.delta' || type === 'output_text.delta') {
      if (typeof event.delta === 'string') output += event.delta
    }
    if (type === 'response.failed' || type === 'response.incomplete' || type === 'error') {
      throw new AiError('AI_PROVIDER_UNAVAILABLE', '模型服务返回异常事件', true)
    }
    if (type === 'response.completed' && event.response && typeof event.response === 'object') {
      const completed = event.response as Record<string, unknown>
      const usage = completed.usage as Record<string, unknown> | undefined
      inputTokens = Number(usage?.input_tokens) || inputTokens
      outputTokens = Number(usage?.output_tokens) || outputTokens
      if (!output) output = outputTextFromResponse(completed) ?? output
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) processLine(line)
  }
  buffer += decoder.decode()
  if (buffer) processLine(buffer)
  if (!output.trim()) throw new AiError('AI_INVALID_OUTPUT', '模型没有返回分析内容')
  return { text: output, inputTokens, outputTokens }
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  outerSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  const abort = (): void => controller.abort(outerSignal?.reason)
  outerSignal?.addEventListener('abort', abort, { once: true })
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch {
    if (outerSignal?.aborted) throw new AiError('AI_CANCELLED', '分析已取消', true)
    if (controller.signal.aborted) throw new AiError('AI_REQUEST_TIMEOUT', '模型请求超时', true)
    throw new AiError('AI_PROVIDER_UNAVAILABLE', '无法连接 AI 服务', true)
  } finally {
    clearTimeout(timeout)
    outerSignal?.removeEventListener('abort', abort)
  }
}

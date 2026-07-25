import type { AiErrorCode, PublicAiError } from '../../../shared/ai-types'

const ERROR_COPY: Partial<Record<AiErrorCode, [string, string]>> = {
  AI_DISABLED: ['请先启用 AI', 'Enable AI before starting analysis'],
  AI_PROVIDER_NOT_CONFIGURED: ['当前 AI Provider 尚未配置完成', 'The current AI provider is not configured'],
  AI_PROVIDER_UNAVAILABLE: ['AI 服务暂时不可用', 'The AI service is temporarily unavailable'],
  AI_AUTH_REQUIRED: ['请先完成 AI 连接或密钥配置', 'Connect the AI service or configure an API key first'],
  AI_AUTH_EXPIRED: ['连接已过期，请重新连接', 'The connection has expired. Connect again'],
  AI_QUOTA_EXCEEDED: ['本期 AI 分析额度已用完', 'The AI analysis quota has been used up'],
  AI_RATE_LIMITED: ['AI 请求过于频繁，请稍后重试', 'AI requests are too frequent. Try again shortly'],
  AI_INPUT_TOO_LARGE: ['分析报告过大，无法发送', 'The analysis report is too large to send'],
  AI_PREVIEW_EXPIRED: ['数据预览已过期，请重新准备分析', 'The data preview has expired. Prepare the analysis again'],
  AI_SCAN_CHANGED: ['扫描结果已经变化，请重新扫描', 'The scan results changed. Scan again'],
  AI_REQUEST_TIMEOUT: ['AI 请求超时，请重试', 'The AI request timed out. Try again'],
  AI_INVALID_OUTPUT: ['AI 返回了无法读取的结果，请重试', 'AI returned an unreadable result. Try again'],
  AI_REDACTION_FAILED: ['脱敏检查未通过，报告不会发送', 'The redaction check failed. The report was not sent'],
  AI_CANCELLED: ['分析已取消', 'Analysis cancelled'],
  AI_INTERNAL_ERROR: ['AI 分析暂时不可用', 'AI analysis is temporarily unavailable']
}

export function parseLocalizedAiError(
  error: unknown,
  english: boolean,
  fallback: [string, string]
): PublicAiError {
  const message = error instanceof Error ? error.message : String(error)
  const marker = 'MEMENTO_AI_ERROR:'
  const markerIndex = message.indexOf(marker)
  let parsed: PublicAiError | null = null
  if (markerIndex >= 0) {
    try {
      parsed = JSON.parse(message.slice(markerIndex + marker.length)) as PublicAiError
    } catch {
      parsed = null
    }
  }
  const code = parsed?.code ?? 'AI_INTERNAL_ERROR'
  const copy = ERROR_COPY[code]
  return {
    code,
    message: copy?.[english ? 1 : 0] ?? parsed?.message ?? fallback[english ? 1 : 0],
    retryable: parsed?.retryable ?? true,
    retryAfterSeconds: parsed?.retryAfterSeconds
  }
}

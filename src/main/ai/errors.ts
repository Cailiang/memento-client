import type { AiErrorCode, PublicAiError } from '../../shared/ai-types'

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = 'AiError'
  }
}
export function toPublicAiError(error: unknown): PublicAiError {
  if (error instanceof AiError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds
    }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'AI_CANCELLED', message: '分析已取消', retryable: true }
  }
  return { code: 'AI_INTERNAL_ERROR', message: 'AI 分析暂时不可用', retryable: true }
}

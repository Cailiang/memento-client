import { randomUUID } from 'node:crypto'
import type {
  AiTerminalAnalysis,
  NormalizedAiReport,
  NormalizedCandidateReport,
  NormalizedTerminalReport,
  ProviderHealth
} from '../../../shared/ai-types'
import { HostedAuth } from '../auth/hosted-auth'
import { AiError } from '../errors'
import { validateAnalysisOutput } from '../validate-output'
import type { AiProvider, AiRequestContext } from './provider'

export class HostedProvider implements AiProvider {
  readonly id = 'memento-hosted'
  readonly kind = 'hosted' as const
  readonly model = 'managed'

  constructor(
    private readonly auth: HostedAuth,
    private readonly clientVersion: string
  ) {}

  async health(): Promise<ProviderHealth> {
    const session = await this.auth.session()
    return {
      available: session.authenticated,
      authenticated: session.authenticated,
      errorCode: session.authenticated ? undefined : 'AI_AUTH_REQUIRED'
    }
  }

  async analyzeTerminal(
    report: NormalizedTerminalReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis> {
    return this.analyze(
      '/v1/analysis/terminal',
      report,
      new Set(report.findings.map((item) => item.id)),
      context,
      signal
    )
  }

  async analyzeCandidate(
    report: NormalizedCandidateReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis> {
    return this.analyze(
      '/v1/analysis/candidate',
      report,
      new Set([report.candidate.id]),
      context,
      signal
    )
  }

  private async analyze(
    endpoint: string,
    report: NormalizedAiReport,
    evidenceIds: Set<string>,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis> {
    const response = await this.auth.authorizedFetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-memento-client-version': this.clientVersion,
        'x-memento-locale': context.locale
      },
      body: JSON.stringify({ schemaVersion: 1, report })
    })
    if (response.status === 401) {
      await response.body?.cancel()
      throw new AiError('AI_AUTH_EXPIRED', '登录已过期，请重新登录')
    }
    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10)
      await response.body?.cancel()
      throw new AiError('AI_RATE_LIMITED', '官方服务请求过于频繁', true, retryAfter || undefined)
    }
    if (response.status === 402) {
      await response.body?.cancel()
      throw new AiError('AI_QUOTA_EXCEEDED', '本期 AI 分析额度已用完')
    }
    if (response.status === 504) {
      await response.body?.cancel()
      throw new AiError('AI_REQUEST_TIMEOUT', 'AI 请求超时，请重试', true)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiError('AI_PROVIDER_UNAVAILABLE', '官方 AI 服务暂时不可用', true)
    }
    const raw = (await response.json()) as Record<string, unknown>
    const analysis = raw.analysis ?? raw
    const provider = raw.provider && typeof raw.provider === 'object'
      ? (raw.provider as Record<string, unknown>)
      : {}
    return validateAnalysisOutput(analysis, evidenceIds, {
      requestId: typeof raw.requestId === 'string' ? raw.requestId : context.requestId,
      providerId: typeof provider.id === 'string' ? provider.id : this.id,
      model: typeof provider.model === 'string' ? provider.model : this.model,
      candidate: 'candidate' in report
    })
  }
}

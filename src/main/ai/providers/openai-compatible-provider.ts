import type {
  AiTerminalAnalysis,
  NormalizedAiReport,
  NormalizedCandidateReport,
  NormalizedTerminalReport,
  ProviderHealth
} from '../../../shared/ai-types'
import { AiError } from '../errors'
import { validateAnalysisOutput } from '../validate-output'
import type { AiProvider, AiRequestContext } from './provider'
import { candidateAnalysisInstructions, outputLanguageInstruction, TERMINAL_ANALYSIS_INSTRUCTIONS } from './provider'
import { fetchWithTimeout, parseJsonText, readResponsesStream } from './responses-stream'

const TCZOR_RESPONSES_URL = 'https://code.tczor.cn/v1/responses'

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = 'tczor-byok'
  readonly kind = 'byok' as const

  constructor(
    readonly model: string,
    private readonly getApiKey: () => Promise<string | null>
  ) {}

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const apiKey = await this.getApiKey()
    if (!apiKey) return { available: false, authenticated: false, errorCode: 'AI_AUTH_REQUIRED' }
    try {
      const response = await fetchWithTimeout(
        TCZOR_RESPONSES_URL,
        {
          method: 'POST',
          redirect: 'error',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            accept: 'text/event-stream'
          },
          body: JSON.stringify({
            model: this.model,
            stream: true,
            store: false,
            max_output_tokens: 16,
            instructions: '只返回 JSON。',
            input: '{"ping":true}'
          })
        },
        15_000,
        signal
      )
      await response.body?.cancel()
      return { available: response.ok, authenticated: response.status !== 401 }
    } catch {
      return { available: false, authenticated: true, errorCode: 'AI_PROVIDER_UNAVAILABLE' }
    }
  }

  async analyzeTerminal(
    report: NormalizedTerminalReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis> {
    return this.analyze(
      report,
      TERMINAL_ANALYSIS_INSTRUCTIONS,
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
      report,
      candidateAnalysisInstructions(report.analysisKind),
      new Set([report.candidate.id]),
      context,
      signal
    )
  }

  private async analyze(
    report: NormalizedAiReport,
    instructions: string,
    evidenceIds: Set<string>,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new AiError('AI_AUTH_REQUIRED', '请先保存自己的 API Key')
    const response = await fetchWithTimeout(
      TCZOR_RESPONSES_URL,
      {
        method: 'POST',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream'
        },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          store: false,
          max_output_tokens: context.maxOutputTokens,
          instructions: `${instructions}\n${outputLanguageInstruction(context.locale)}`,
          input: JSON.stringify(report)
        })
      },
      300_000,
      signal
    )
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel()
      throw new AiError('AI_AUTH_REQUIRED', 'API Key 无效或没有模型权限')
    }
    if (response.status === 429) {
      await response.body?.cancel()
      throw new AiError('AI_RATE_LIMITED', '模型服务请求过于频繁', true)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiError('AI_PROVIDER_UNAVAILABLE', `模型服务返回 HTTP ${response.status}`, true)
    }
    const streamed = await readResponsesStream(response)
    return validateAnalysisOutput(parseJsonText(streamed.text), evidenceIds, {
      requestId: context.requestId,
      providerId: this.id,
      model: this.model,
      candidate: 'candidate' in report
    })
  }
}

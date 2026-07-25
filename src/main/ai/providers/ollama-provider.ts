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
import { fetchWithTimeout, parseJsonText } from './responses-stream'

const OLLAMA_ORIGIN = 'http://127.0.0.1:11434'

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama'
  readonly kind = 'local' as const

  constructor(readonly model: string) {}

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    try {
      const response = await fetchWithTimeout(
        `${OLLAMA_ORIGIN}/api/tags`,
        { method: 'GET', redirect: 'error' },
        5_000,
        signal
      )
      if (!response.ok) return { available: false, authenticated: true }
      const payload = (await response.json()) as { models?: Array<{ name?: unknown }> }
      const models = (payload.models ?? [])
        .map((item) => (typeof item.name === 'string' ? item.name : ''))
        .filter(Boolean)
      return { available: true, authenticated: true, models }
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
    const response = await fetchWithTimeout(
      `${OLLAMA_ORIGIN}/api/chat`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: 'json',
          options: { num_predict: context.maxOutputTokens, temperature: 0.2 },
          messages: [
            { role: 'system', content: `${instructions}\n${outputLanguageInstruction(context.locale)}` },
            { role: 'user', content: JSON.stringify(report) }
          ]
        })
      },
      60_000,
      signal
    )
    if (response.status === 404) {
      await response.body?.cancel()
      throw new AiError('AI_PROVIDER_NOT_CONFIGURED', `Ollama 中没有模型 ${this.model}`)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiError('AI_PROVIDER_UNAVAILABLE', `Ollama 返回 HTTP ${response.status}`, true)
    }
    const payload = (await response.json()) as { message?: { content?: unknown } }
    if (typeof payload.message?.content !== 'string') {
      throw new AiError('AI_INVALID_OUTPUT', 'Ollama 响应缺少 message.content')
    }
    return validateAnalysisOutput(
      parseJsonText(payload.message.content),
      evidenceIds,
      {
        requestId: context.requestId,
        providerId: this.id,
        model: this.model,
        candidate: 'candidate' in report
      }
    )
  }
}

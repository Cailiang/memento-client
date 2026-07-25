import { randomUUID } from 'node:crypto'
import type {
  AiDataPreview,
  AiAnalysisKind,
  AiProviderId,
  AiTerminalAnalysis,
  HostedLoginState,
  HostedSessionState,
  ProviderHealth,
  PublicAiSettings,
  UpdateAiSettingsInput
} from '../../shared/ai-types'
import type { ScanResult } from '../../shared/types'
import type { AppLanguage } from '../../shared/app-settings'
import { HostedAuth } from './auth/hosted-auth'
import { SecureCredentialStore } from './credentials/secure-store'
import { AiError } from './errors'
import { normalizeCandidateReport } from './normalize-candidate'
import { normalizeTerminalReport } from './normalize-terminal'
import { PreviewStore } from './preview-store'
import { HostedProvider } from './providers/hosted-provider'
import { OllamaProvider } from './providers/ollama-provider'
import { OpenAiCompatibleProvider } from './providers/openai-compatible-provider'
import type { AiProvider } from './providers/provider'
import { assertNoKnownSecret } from './redact'
import { AiSettingsStore } from './settings-store'

export class AiService {
  private readonly previews = new PreviewStore()
  private readonly credentials: SecureCredentialStore
  private readonly settings: AiSettingsStore
  private readonly hostedAuth: HostedAuth
  private readonly activeRequests = new Map<string, AbortController>()
  private lastResult: AiTerminalAnalysis | null = null

  constructor(
    userDataPath: string,
    private readonly gatewayUrl: string,
    private readonly clientVersion: string,
    private readonly currentScan: () => ScanResult | null,
    private readonly currentLanguage: () => AppLanguage
  ) {
    this.credentials = new SecureCredentialStore(userDataPath)
    this.settings = new AiSettingsStore(userDataPath, this.credentials, gatewayUrl)
    this.hostedAuth = new HostedAuth(gatewayUrl, this.credentials)
  }

  async initializeDefaultConnection(): Promise<void> {
    const settings = await this.settings.getPublic()
    if (settings.mode !== 'hosted') return
    try {
      const hostname = new URL(this.gatewayUrl).hostname
      if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '::1') return
      const session = await this.hostedAuth.session()
      if (!session.authenticated) await this.hostedAuth.startLogin()
    } catch {
      // The local Gateway may start after the client. The settings page can reconnect later.
    }
  }

  invalidatePreviews(): void {
    this.previews.invalidateAll()
  }

  getSettings(): Promise<PublicAiSettings> {
    return this.settings.getPublic()
  }

  updateSettings(input: UpdateAiSettingsInput): Promise<PublicAiSettings> {
    return this.settings.update(input)
  }

  private async provider(providerId?: string): Promise<AiProvider> {
    const settings = await this.settings.getPublic()
    if (settings.mode === 'disabled' || !settings.providerId) {
      throw new AiError('AI_DISABLED', '请先选择 AI 模式')
    }
    if (providerId && providerId !== settings.providerId) {
      throw new AiError('AI_PROVIDER_NOT_CONFIGURED', 'Provider 与当前设置不一致')
    }
    if (settings.providerId === 'ollama') {
      return new OllamaProvider(settings.model ?? 'qwen2.5:7b')
    }
    if (settings.providerId === 'tczor-byok') {
      if (!settings.keyPresent) throw new AiError('AI_AUTH_REQUIRED', '请先保存自己的 API Key')
      return new OpenAiCompatibleProvider(
        settings.model ?? 'grok-4.5',
        () => this.credentials.get('byok-api-key')
      )
    }
    return new HostedProvider(this.hostedAuth, this.clientVersion)
  }

  async testProvider(providerId: string): Promise<ProviderHealth> {
    return (await this.provider(providerId)).health()
  }

  async prepareTerminalAnalysis(scanId: string): Promise<AiDataPreview> {
    if (typeof scanId !== 'string' || scanId.length > 100) {
      throw new AiError('AI_SCAN_CHANGED', '扫描 ID 无效')
    }
    const scan = this.currentScan()
    if (!scan || scan.scanId !== scanId) {
      throw new AiError('AI_SCAN_CHANGED', '扫描结果已经变化，请重新扫描')
    }
    const settings = await this.settings.getPublic()
    if (!settings.providerId) throw new AiError('AI_DISABLED', '请先选择 AI 模式')
    await this.provider(settings.providerId)
    const report = normalizeTerminalReport(scan)
    try {
      assertNoKnownSecret(JSON.stringify(report))
    } catch {
      throw new AiError('AI_REDACTION_FAILED', '脱敏检查未通过，报告不会发送')
    }
    return this.previews.create(scan.scanId, settings.providerId, 'terminal', report)
  }

  async prepareCandidateAnalysis(input: {
    scanId: string
    candidateId: string
  }): Promise<AiDataPreview> {
    if (
      !input ||
      typeof input.scanId !== 'string' ||
      typeof input.candidateId !== 'string' ||
      input.scanId.length > 100 ||
      input.candidateId.length > 100
    ) {
      throw new AiError('AI_SCAN_CHANGED', '扫描项目无效')
    }
    const scan = this.currentScan()
    if (!scan || scan.scanId !== input.scanId) {
      throw new AiError('AI_SCAN_CHANGED', '扫描结果已经变化，请重新扫描')
    }
    const candidate = scan.candidates.find((item) => item.id === input.candidateId)
    if (!candidate || (candidate.section !== 'services' && candidate.section !== 'storage')) {
      throw new AiError('AI_SCAN_CHANGED', '该扫描项目不支持 AI 分析')
    }
    const settings = await this.settings.getPublic()
    if (!settings.providerId) throw new AiError('AI_DISABLED', '请先启用 AI')
    await this.provider(settings.providerId)
    const report = normalizeCandidateReport(scan, candidate)
    try {
      assertNoKnownSecret(JSON.stringify(report))
    } catch {
      throw new AiError('AI_REDACTION_FAILED', '脱敏检查未通过，报告不会发送')
    }
    const kind = candidate.section === 'services' ? 'service' : 'storage'
    return this.previews.create(scan.scanId, settings.providerId, kind, report)
  }

  async analyzeTerminal(input: {
    previewId: string
    providerId: string
  }): Promise<AiTerminalAnalysis> {
    return this.analyze(input, 'terminal')
  }

  async analyzeCandidate(input: {
    previewId: string
    providerId: string
  }): Promise<AiTerminalAnalysis> {
    return this.analyze(input, ['service', 'storage'])
  }

  private async analyze(
    input: { previewId: string; providerId: string },
    expectedKind: AiAnalysisKind | AiAnalysisKind[]
  ): Promise<AiTerminalAnalysis> {
    if (
      !input ||
      typeof input.previewId !== 'string' ||
      typeof input.providerId !== 'string' ||
      input.previewId.length > 100 ||
      input.providerId.length > 100
    ) {
      throw new AiError('AI_PREVIEW_EXPIRED', '分析参数无效')
    }
    if (this.activeRequests.size > 0) {
      throw new AiError('AI_RATE_LIMITED', '已有一个分析正在进行', true)
    }
    const scan = this.currentScan()
    if (!scan) throw new AiError('AI_SCAN_CHANGED', '请先完成一次扫描')
    const preview = this.previews.consume(input.previewId, input.providerId, scan.scanId)
    const expectedKinds = Array.isArray(expectedKind) ? expectedKind : [expectedKind]
    if (!expectedKinds.includes(preview.kind)) {
      throw new AiError('AI_PREVIEW_EXPIRED', '分析场景与数据预览不一致')
    }
    const provider = await this.provider(input.providerId)
    const requestId = randomUUID()
    const controller = new AbortController()
    this.activeRequests.set(requestId, controller)
    this.activeRequests.set(input.previewId, controller)
    try {
      const context = { requestId, locale: this.currentLanguage(), maxOutputTokens: 4_000 }
      const result = preview.kind === 'terminal' && 'findings' in preview.payload
        ? await provider.analyzeTerminal(preview.payload, context, controller.signal)
        : preview.kind !== 'terminal' && 'candidate' in preview.payload
          ? await provider.analyzeCandidate(preview.payload, context, controller.signal)
          : (() => {
              throw new AiError('AI_PREVIEW_EXPIRED', '分析数据类型无效')
            })()
      this.lastResult = result
      return result
    } finally {
      this.activeRequests.delete(requestId)
      this.activeRequests.delete(input.previewId)
    }
  }

  cancelAnalysis(requestId: string): void {
    if (typeof requestId !== 'string' || requestId.length > 100) return
    this.activeRequests.get(requestId)?.abort()
  }

  getHostedSession(): Promise<HostedSessionState> {
    return this.hostedAuth.session()
  }

  startHostedLogin(): Promise<HostedLoginState> {
    return this.hostedAuth.startLogin()
  }

  logoutHosted(): Promise<void> {
    return this.hostedAuth.logout()
  }

  completeHostedLogin(callbackUrl: string): Promise<void> {
    return this.hostedAuth.completeLogin(callbackUrl)
  }

  getLastResult(): AiTerminalAnalysis | null {
    return this.lastResult
  }
}

export function isKnownProviderId(value: string): value is AiProviderId {
  return value === 'ollama' || value === 'tczor-byok' || value === 'memento-hosted'
}

import type { TerminalFindingCode } from './types'

export type AiMode = 'disabled' | 'local' | 'byok' | 'hosted'
export type AiProviderId = 'ollama' | 'tczor-byok' | 'memento-hosted'
export type AiAnalysisKind = 'terminal' | 'service' | 'storage'
export type AiCandidateAnalysisKind = Exclude<AiAnalysisKind, 'terminal'>

export interface PublicAiSettings {
  mode: AiMode
  providerId: AiProviderId | null
  model: string | null
  allowRawConfig: false
  showDataPreview: true
  keyPresent: boolean
  keyHint: string | null
  hostedGatewayUrl: string
}

export interface UpdateAiSettingsInput {
  mode: AiMode
  model?: string
  byokApiKey?: string
  clearByokKey?: boolean
}

export type AiErrorCode =
  | 'AI_DISABLED'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_AUTH_REQUIRED'
  | 'AI_AUTH_EXPIRED'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RATE_LIMITED'
  | 'AI_INPUT_TOO_LARGE'
  | 'AI_PREVIEW_EXPIRED'
  | 'AI_SCAN_CHANGED'
  | 'AI_REQUEST_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_REDACTION_FAILED'
  | 'AI_CANCELLED'
  | 'AI_INTERNAL_ERROR'

export interface PublicAiError {
  code: AiErrorCode
  message: string
  retryable: boolean
  retryAfterSeconds?: number
}

export interface SanitizedSource {
  logicalPath?: string
  line?: number
  kind: 'shell-config' | 'environment' | 'measurement' | 'unknown'
}

export interface NormalizedTerminalReport {
  schemaVersion: 1
  reportId: string
  generatedAt: string
  platform: {
    os: 'macos'
    osMajorVersion: number
    architecture: 'arm64' | 'x64' | 'unknown'
  }
  shell: {
    family: 'zsh' | 'bash' | 'fish' | 'other'
    version?: string
    baselineMs: number | null
    startupMs: number | null
    configCostMs: number | null
    sampleCount: number
  }
  findings: Array<{
    id: string
    code: TerminalFindingCode
    severity: 'good' | 'notice' | 'slow'
    durationMs?: number
    source: SanitizedSource | null
    attributes: Record<string, string | number | boolean>
  }>
  configFiles: Array<{
    logicalPath: '~/.zshrc' | '~/.zprofile' | '~/.zshenv' | '~/.zlogin'
    exists: boolean
    lineCount?: number
    sizeBytes?: number
  }>
  privacy: {
    rawConfigIncluded: false
    redactionVersion: string
    removedFieldCount: number
  }
}

export interface NormalizedCandidateReport {
  schemaVersion: 1
  reportId: string
  generatedAt: string
  analysisKind: AiCandidateAnalysisKind
  platform: {
    os: 'macos'
    osMajorVersion: number
    architecture: 'arm64' | 'x64' | 'unknown'
  }
  candidate: {
    id: 'candidate'
    name: string
    category:
      | 'homebrew-service'
      | 'launch-agent'
      | 'background-service'
      | 'cache'
      | 'build-artifact'
      | 'virtual-disk'
      | 'application-data'
      | 'storage-other'
    ruleRisk: 'safe' | 'review' | 'protected'
    status: 'running' | 'loaded' | 'reclaimable' | 'analysis-only' | 'unknown'
    sizeBytes?: number
    ageDays?: number
    availableActions: Array<{
      kind: string
      reversible: boolean
    }>
    facts: Record<string, string | number | boolean>
  }
  privacy: {
    rawPathsIncluded: false
    rawContentIncluded: false
    redactionVersion: string
    removedFieldCount: number
  }
}

export type NormalizedAiReport = NormalizedTerminalReport | NormalizedCandidateReport

export interface AiDataPreview {
  previewId: string
  expiresAt: string
  providerId: AiProviderId
  kind: AiAnalysisKind
  summary: {
    recordCount: number
    findingCount?: number
    configFileCount?: number
    includesRawConfig: false
    approximateInputTokens: number
  }
  payload: NormalizedAiReport
}

export type AiSuggestionRisk = 'informational' | 'review' | 'behavior-change'

export interface AiTerminalAnalysis {
  schemaVersion: 1
  requestId: string
  generatedAt: string
  provider: {
    id: string
    model: string
  }
  summary: {
    diagnosis: string
    expectedPriority: 'low' | 'medium' | 'high'
  }
  suggestions: Array<{
    id: string
    title: string
    explanation: string
    evidenceFindingIds: string[]
    confidence: number
    risk: AiSuggestionRisk
    action: {
      kind: 'explain-only' | 'show-manual-steps'
      steps?: string[]
    }
  }>
  limitations: string[]
}

export interface ProviderHealth {
  available: boolean
  authenticated: boolean
  models?: string[]
  errorCode?: AiErrorCode
}

export interface HostedSessionState {
  authenticated: boolean
  userId?: string
  plan?: string
  dailyRemaining?: number
  monthlyRemaining?: number
}

export interface HostedLoginState {
  status: 'authenticated' | 'browser-opened' | 'failed'
  message: string
}

export interface MementoAiApi {
  getAiSettings: () => Promise<PublicAiSettings>
  updateAiSettings: (input: UpdateAiSettingsInput) => Promise<PublicAiSettings>
  testAiProvider: (providerId: string) => Promise<ProviderHealth>
  prepareTerminalAnalysis: (scanId: string) => Promise<AiDataPreview>
  prepareCandidateAnalysis: (input: {
    scanId: string
    candidateId: string
  }) => Promise<AiDataPreview>
  analyzeTerminal: (input: {
    previewId: string
    providerId: string
  }) => Promise<AiTerminalAnalysis>
  analyzeCandidate: (input: {
    previewId: string
    providerId: string
  }) => Promise<AiTerminalAnalysis>
  cancelAnalysis: (requestId: string) => Promise<void>
  getHostedSession: () => Promise<HostedSessionState>
  startHostedLogin: () => Promise<HostedLoginState>
  logoutHosted: () => Promise<void>
}

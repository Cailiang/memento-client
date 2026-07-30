import type { ActionResult, ScanResult } from './types'
import type { AppLanguage } from './app-settings'

export type AgentProviderType =
  | 'openai-compatible'
  | 'openai'
  | 'anthropic'
  | 'google'

export type AgentProviderConnectionState = 'untested' | 'connected' | 'failed'

export interface AgentProvider {
  id: string
  name: string
  type: AgentProviderType
  baseUrl: string
  model: string
  isDefault: boolean
  connectionState: AgentProviderConnectionState
  keyPresent: boolean
  keyHint: string | null
  createdAt: string
  updatedAt: string
}

export interface SaveAgentProviderInput {
  id?: string
  name: string
  type: AgentProviderType
  baseUrl: string
  model: string
  apiKey?: string
}

export interface DiscoverAgentModelsInput {
  id?: string
  type: AgentProviderType
  baseUrl: string
  apiKey?: string
}

export interface AgentProviderModelsResult {
  models: string[]
  resolvedBaseUrl: string
  excludedModelCount: number
}

export interface AgentProviderTestResult {
  ok: boolean
  message: string
  toolCalling: boolean
  testedAt: string
}

export interface CcSwitchImportResult {
  databaseFound: boolean
  detected: number
  imported: number
}

export type AgentRunStatus =
  | 'preparing'
  | 'analyzing'
  | 'plan-ready'
  | 'awaiting-confirmation'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type AgentPlanItemKind = 'action' | 'terminal-fix'

export interface AgentPlanItem {
  id: string
  kind: AgentPlanItemKind
  actionKind: string
  title: string
  detail: string
  estimatedBytes: number
  risk: 'safe' | 'review'
  reversible: boolean
}

export type AgentResultKind = 'services' | 'storage' | 'applications' | 'terminal'

export interface AgentResultOperation {
  id: string
  label: string
  consequence: string
  reversible: boolean
  estimatedBytes: number
}

export interface AgentCandidateResultItem {
  kind: 'services' | 'storage'
  id: string
  name: string
  subtitle: string
  description: string
  status: string
  risk: 'safe' | 'review' | 'protected'
  sizeBytes: number
  location: string | null
  evidence: string[]
  serviceAnomalies?: string[]
  serviceMetrics?: {
    pid?: number
    cpuPercent?: number
    memoryBytes?: number
    runningSeconds?: number
  }
  operations: AgentResultOperation[]
}

export interface AgentApplicationResultItem {
  kind: 'applications'
  id: string
  name: string
  version: string
  bundleId?: string | null
  location: string
  scope?: 'user' | 'shared' | 'system'
  protectedReason?: string
  backgroundOnly?: boolean
  executable?: string | null
  urlSchemes?: string[]
  sizeBytes: number
  lastUsedAt: string | null
  unused: boolean
  operation: AgentResultOperation | null
}

export interface AgentTerminalResultItem {
  kind: 'terminal'
  id: string
  title: string
  detail: string
  severity: 'good' | 'notice' | 'slow'
  durationMs: number | null
  source: string | null
  recommendation: string | null
  operation: AgentResultOperation | null
}

export type AgentResultItem =
  | AgentCandidateResultItem
  | AgentApplicationResultItem
  | AgentTerminalResultItem

export interface AgentResultSection {
  kind: AgentResultKind
  title: string
  items: AgentResultItem[]
}

export interface AgentFocus {
  kind: AgentResultKind
  id: string
  name: string
}

export interface AgentPresentation {
  summary: string
  sections: AgentResultSection[]
}

export interface AgentRunRecord {
  id: string
  conversationId: string
  language: AppLanguage
  prompt: string
  status: AgentRunStatus
  providerId: string
  providerName: string
  model: string
  response: string | null
  presentation: AgentPresentation | null
  focus: AgentFocus[]
  plan: AgentPlanItem[]
  results: ActionResult[]
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface StartAgentRunInput {
  prompt: string
  conversationId?: string
}

export type AgentRunEvent =
  | {
      type: 'status'
      runId: string
      status: AgentRunStatus
      message: string
    }
  | {
      type: 'completed'
      run: AgentRunRecord
    }
  | {
      type: 'failed'
      run: AgentRunRecord
    }

export interface ExecuteAgentPlanInput {
  runId: string
  itemIds: string[]
}

export interface ExecuteAgentPlanResult {
  run: AgentRunRecord
  scan: ScanResult
}

export interface AddAgentPlanItemsInput {
  runId: string
  itemIds: string[]
}

export interface MementoAgentApi {
  listAgentProviders: () => Promise<AgentProvider[]>
  discoverAgentProviderModels: (
    input: DiscoverAgentModelsInput
  ) => Promise<AgentProviderModelsResult>
  saveAgentProvider: (input: SaveAgentProviderInput) => Promise<AgentProvider>
  deleteAgentProvider: (id: string) => Promise<void>
  setDefaultAgentProvider: (id: string) => Promise<AgentProvider[]>
  testAgentProvider: (input: SaveAgentProviderInput) => Promise<AgentProviderTestResult>
  importCcSwitchProviders: () => Promise<CcSwitchImportResult>
  startAgentRun: (input: StartAgentRunInput) => Promise<AgentRunRecord>
  cancelAgentRun: (runId: string) => Promise<void>
  addAgentPlanItems: (input: AddAgentPlanItemsInput) => Promise<AgentRunRecord>
  executeAgentPlan: (input: ExecuteAgentPlanInput) => Promise<ExecuteAgentPlanResult>
  listAgentRuns: () => Promise<AgentRunRecord[]>
  getAgentRun: (runId: string) => Promise<AgentRunRecord | null>
  deleteAgentRun: (runId: string) => Promise<void>
  onAgentRunEvent: (callback: (event: AgentRunEvent) => void) => () => void
}

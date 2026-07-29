import type { ActionResult, ScanResult } from './types'

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
}

export interface AgentProviderTestResult {
  ok: boolean
  message: string
  toolCalling: boolean
  testedAt: string
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

export interface AgentRunRecord {
  id: string
  prompt: string
  status: AgentRunStatus
  providerId: string
  providerName: string
  model: string
  response: string | null
  plan: AgentPlanItem[]
  results: ActionResult[]
  error: string | null
  createdAt: string
  updatedAt: string
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

export interface MementoAgentApi {
  listAgentProviders: () => Promise<AgentProvider[]>
  discoverAgentProviderModels: (
    input: DiscoverAgentModelsInput
  ) => Promise<AgentProviderModelsResult>
  saveAgentProvider: (input: SaveAgentProviderInput) => Promise<AgentProvider>
  deleteAgentProvider: (id: string) => Promise<void>
  setDefaultAgentProvider: (id: string) => Promise<AgentProvider[]>
  testAgentProvider: (input: SaveAgentProviderInput) => Promise<AgentProviderTestResult>
  startAgentRun: (prompt: string) => Promise<AgentRunRecord>
  cancelAgentRun: (runId: string) => Promise<void>
  executeAgentPlan: (input: ExecuteAgentPlanInput) => Promise<ExecuteAgentPlanResult>
  listAgentRuns: () => Promise<AgentRunRecord[]>
  getAgentRun: (runId: string) => Promise<AgentRunRecord | null>
  onAgentRunEvent: (callback: (event: AgentRunEvent) => void) => () => void
}

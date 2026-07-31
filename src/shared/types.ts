export type ScanSection = 'services' | 'storage' | 'applications' | 'terminal'

import type { MementoAgentApi } from './agent-types'
import type { MementoSettingsApi } from './app-settings'

export type RiskLevel = 'safe' | 'review' | 'protected'

export type ActionKind =
  | 'trash'
  | 'delete-storage'
  | 'delete-storage-group'
  | 'trash-home-artifact'
  | 'stop-brew-service'
  | 'stop-launch-agent'
  | 'trash-launch-agent-config'
  | 'trash-service-software'
  | 'trash-service-directory'
  | 'brew-cleanup'

export interface CandidateAction {
  kind: ActionKind
  label: string
  consequence: string
  reversible: boolean
  estimatedBytes?: number
  requiresAdmin?: boolean
}

export interface CandidateOperation extends CandidateAction {
  id: string
}

export interface ScanCandidate {
  id: string
  section: Exclude<ScanSection, 'terminal'>
  name: string
  subtitle: string
  description: string
  sizeBytes?: number
  ageDays?: number
  risk: RiskLevel
  status: string
  location?: string
  evidence: string[]
  action?: CandidateAction
  operations?: CandidateOperation[]
  serviceAnomalies?: ServiceAnomalyKind[]
  serviceMetrics?: ServiceRuntimeMetrics
}

export type ServiceAnomalyKind =
  | 'orphaned'
  | 'high-cpu'
  | 'high-memory'
  | 'long-running'
  | 'failed'
  | 'stale'

export interface ServiceRuntimeMetrics {
  pid?: number
  cpuPercent?: number
  memoryBytes?: number
  runningSeconds?: number
}

export type ApplicationScope = 'user' | 'shared' | 'system'

export interface InstalledApplication {
  id: string
  name: string
  version: string
  bundleId: string | null
  location: string
  sizeBytes: number
  lastUsedAt: string | null
  scope: ApplicationScope
  backgroundOnly?: boolean
  executable?: string | null
  urlSchemes?: string[]
  unused: boolean
  protectedReason?: string
  action?: CandidateOperation
}

export type TerminalFindingCode =
  | 'shell_startup_slow'
  | 'shell_startup_normal'
  | 'shell_config_cost_high'
  | 'shell_config_cost_normal'
  | 'shell_measurement_timeout'
  | 'nvm_eager_load'
  | 'pyenv_eager_init'
  | 'conda_eager_init'
  | 'ruby_manager_eager_init'
  | 'compinit_detected'
  | 'network_call_during_startup'
  | 'shell_file_large'
  | 'path_missing_entries'
  | 'path_duplicate_entries'

export interface TerminalFinding {
  id: string
  code: TerminalFindingCode
  title: string
  detail: string
  severity: 'good' | 'notice' | 'slow'
  durationMs?: number
  source?: string
  recommendation?: string
  attributes?: Record<string, string | number | boolean>
  fix?: TerminalFixAction
}

export interface TerminalFixAction {
  id: string
  label: string
  consequence: string
}

export interface TerminalConfigFile {
  logicalPath: '~/.zshrc' | '~/.zprofile' | '~/.zshenv' | '~/.zlogin'
  exists: boolean
  lineCount?: number
  sizeBytes?: number
}

export interface SystemSnapshot {
  hostname: string
  osVersion: string
  diskTotalBytes: number
  diskFreeBytes: number
  memoryTotalBytes: number
  memoryUsedBytes: number
  uptimeSeconds: number
}

export interface ScanResult {
  scanId: string
  startedAt: string
  completedAt: string
  system: SystemSnapshot
  candidates: ScanCandidate[]
  applications: InstalledApplication[]
  ignoredApplications: InstalledApplication[]
  terminal: {
    shell: string
    baselineMs: number | null
    startupMs: number | null
    sampleCount: number
    findings: TerminalFinding[]
    configFiles: TerminalConfigFile[]
  }
  warnings: string[]
}

export interface ScanProgress {
  section: ScanSection | 'system'
  progress: number
  message: string
  activeSections?: ScanSection[]
  completedSections?: ScanSection[]
}

export type DiskUsageNodeKind = 'directory' | 'file'

export interface DiskUsageNode {
  id: string
  name: string
  location: string
  sizeBytes: number
  kind: DiskUsageNodeKind
  childCount: number
  omittedChildCount: number
  omittedSizeBytes: number
  children: DiskUsageNode[]
}

export interface DiskUsageScanResult {
  scanId: string
  root: DiskUsageNode
  scannedEntries: number
  retainedEntries: number
  inaccessibleEntries: number
  minimumDisplayBytes: number
  startedAt: string
  completedAt: string
}

export interface DiskUsageProgress {
  phase: 'scanning' | 'organizing'
  scannedEntries: number
  retainedEntries: number
  inaccessibleEntries: number
  currentLocation: string
  elapsedMs: number
  message: string
}

export interface ActionResult {
  id: string
  ok: boolean
  message: string
}

export interface TerminalFixRunResult {
  results: ActionResult[]
  canUndo: boolean
}

export interface AppUpdateState {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: string | null
  error: string | null
}

export interface MementoApi extends MementoAgentApi, MementoSettingsApi {
  getVersion: () => Promise<string>
  getUpdateState: () => Promise<AppUpdateState>
  checkForUpdates: () => Promise<AppUpdateState>
  openUpdatePage: () => Promise<void>
  scan: (language?: import('./app-settings').AppLanguage) => Promise<ScanResult>
  scanDiskUsage: () => Promise<DiskUsageScanResult>
  cancelDiskUsageScan: () => Promise<void>
  revealDiskUsageNode: (id: string) => Promise<void>
  trashDiskUsageNode: (id: string) => Promise<void>
  getApplicationIcon: (id: string) => Promise<string | null>
  openApplication: (id: string) => Promise<void>
  runActions: (ids: string[]) => Promise<ActionResult[]>
  runTerminalFixes: (ids: string[]) => Promise<TerminalFixRunResult>
  undoTerminalFixes: () => Promise<ActionResult[]>
  revealCandidateLocation: (id: string) => Promise<void>
  onScanProgress: (callback: (progress: ScanProgress) => void) => () => void
  onDiskUsageProgress: (callback: (progress: DiskUsageProgress) => void) => () => void
  onUpdateState: (callback: (state: AppUpdateState) => void) => () => void
  platform: NodeJS.Platform
}

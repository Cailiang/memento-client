export type MaintenanceOperationSource =
  | 'direct'
  | 'agent'
  | 'disk-browser'
  | 'terminal'
  | 'undo'

export type MaintenanceRunStatus = 'running' | 'completed' | 'partial' | 'failed'
export type MaintenanceOperationStatus = 'pending' | 'completed' | 'failed'
export type MaintenanceRecoveryMode = 'none' | 'trash' | 'backup'

export interface MaintenanceOperationRecord {
  id: string
  runId: string
  operationId: string
  kind: string
  title: string
  status: MaintenanceOperationStatus
  reversible: boolean
  estimatedBytes: number | null
  actualBytes: number | null
  recoveryMode: MaintenanceRecoveryMode
  recoveryAvailable: boolean
  errorCode: string | null
  message: string | null
  createdAt: string
  completedAt: string | null
}

export interface MaintenanceRunRecord {
  id: string
  source: MaintenanceOperationSource
  scanId: string | null
  agentRunId: string | null
  title: string
  status: MaintenanceRunStatus
  operations: MaintenanceOperationRecord[]
  createdAt: string
  completedAt: string | null
}

export interface CreateMaintenanceOperationInput {
  operationId: string
  kind: string
  title: string
  reversible: boolean
  estimatedBytes?: number | null
  recoveryMode?: MaintenanceRecoveryMode
}

export interface CreateMaintenanceRunInput {
  source: MaintenanceOperationSource
  scanId?: string | null
  agentRunId?: string | null
  title: string
  operations: CreateMaintenanceOperationInput[]
}

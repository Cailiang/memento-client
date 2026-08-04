import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  AgentFocus,
  AgentPlanItem,
  AgentPresentation,
  AgentProvider,
  AgentProviderConnectionState,
  AgentRunRecord,
  AgentRunStatus,
  DiscoverAgentModelsInput,
  SaveAgentProviderInput
} from '../../shared/agent-types'
import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
  type AppLanguage,
  type UpdateAppSettingsInput
} from '../../shared/app-settings'
import type { ActionResult } from '../../shared/types'
import type {
  CreateMaintenanceRunInput,
  MaintenanceOperationRecord,
  MaintenanceOperationStatus,
  MaintenanceRunRecord
} from '../../shared/maintenance-types'
import {
  normalizeProviderBaseUrl,
  type PrivateModelDiscoveryInput
} from './provider-config'
import type { ImportedProviderCandidate } from './provider-import'

// Vite 5 does not yet recognize node:sqlite as a built-in during tests.
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

interface PrivateAgentProvider extends AgentProvider {
  apiKey: string
}

interface ProviderRow {
  id: string
  name: string
  type: AgentProvider['type']
  base_url: string
  model: string
  api_key_iv: Uint8Array
  api_key_tag: Uint8Array
  api_key_ciphertext: Uint8Array
  is_default: number
  connection_state: AgentProviderConnectionState
  created_at: string
  updated_at: string
}

interface RunRow {
  id: string
  conversation_id: string
  language: AppLanguage
  prompt: string
  status: AgentRunStatus
  provider_id: string
  provider_name: string
  model: string
  response: string | null
  presentation_json: string
  focus_json: string
  plan_json: string
  results_json: string
  error: string | null
  created_at: string
  updated_at: string
}

interface MaintenanceRunRow {
  id: string
  source: MaintenanceRunRecord['source']
  scan_id: string | null
  agent_run_id: string | null
  title: string
  status: MaintenanceRunRecord['status']
  created_at: string
  completed_at: string | null
}

interface MaintenanceOperationRow {
  id: string
  run_id: string
  operation_id: string
  kind: string
  title: string
  status: MaintenanceOperationStatus
  reversible: number
  estimated_bytes: number | null
  actual_bytes: number | null
  recovery_mode: MaintenanceOperationRecord['recoveryMode']
  recovery_ref: string | null
  error_code: string | null
  message: string | null
  created_at: string
  completed_at: string | null
}

const PROVIDER_TYPES = new Set<AgentProvider['type']>([
  'openai-compatible',
  'openai',
  'anthropic',
  'antigravity',
  'google'
])

function now(): string {
  return new Date().toISOString()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function storeText(language: AppLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

function normalizedProviderUrl(
  language: AppLanguage,
  type: AgentProvider['type'],
  value: string
): string {
  try {
    return normalizeProviderBaseUrl(type, value)
  } catch (error) {
    if (language !== 'en-US' || !(error instanceof Error)) throw error
    const translations = new Map([
      ['服务地址格式无效', 'The service URL is invalid.'],
      ['服务地址只支持 HTTP 或 HTTPS', 'The service URL must use HTTP or HTTPS.'],
      ['服务地址不能包含用户名或密码', 'The service URL cannot contain a username or password.']
    ])
    throw new Error(translations.get(error.message) ?? error.message)
  }
}

function validateProviderInput(
  input: SaveAgentProviderInput,
  language: AppLanguage
): SaveAgentProviderInput {
  const id = typeof input.id === 'string' ? input.id.trim() : undefined
  if (id && id.length > 100) {
    throw new Error(storeText(language, '模型供应商 ID 无效', 'The model provider ID is invalid.'))
  }
  const name = input.name.trim().slice(0, 80)
  const baseUrl = input.baseUrl.trim().slice(0, 2048)
  const model = input.model.trim().slice(0, 200)
  if (!name || !baseUrl || !model || !PROVIDER_TYPES.has(input.type)) {
    throw new Error(storeText(
      language,
      '供应商名称、接口类型、服务地址和模型不能为空',
      'Provider name, API type, service URL, and model are required.'
    ))
  }
  return {
    id,
    name,
    type: input.type,
    baseUrl: normalizedProviderUrl(language, input.type, baseUrl),
    model,
    apiKey: input.apiKey?.trim()
  }
}

function validateDiscoveryInput(
  input: DiscoverAgentModelsInput,
  language: AppLanguage
): Omit<PrivateModelDiscoveryInput, 'apiKey'> & { id?: string; apiKey?: string } {
  const id = typeof input.id === 'string' ? input.id.trim() : undefined
  if (id && id.length > 100) {
    throw new Error(storeText(language, '模型供应商 ID 无效', 'The model provider ID is invalid.'))
  }
  if (!PROVIDER_TYPES.has(input.type) || typeof input.baseUrl !== 'string' || !input.baseUrl.trim()) {
    throw new Error(storeText(language, '请先填写有效的服务地址', 'Enter a valid service URL first.'))
  }
  return {
    id,
    type: input.type,
    baseUrl: normalizedProviderUrl(language, input.type, input.baseUrl.slice(0, 2048)),
    apiKey: input.apiKey?.trim()
  }
}

export class AgentStore {
  private readonly database: InstanceType<typeof DatabaseSync>
  private readonly masterKey: Buffer

  constructor(userDataDirectory: string) {
    mkdirSync(userDataDirectory, { recursive: true, mode: 0o700 })
    this.masterKey = this.loadMasterKey(path.join(userDataDirectory, 'agent-master.key'))
    this.database = new DatabaseSync(path.join(userDataDirectory, 'memento.sqlite'))
    this.database.exec('PRAGMA journal_mode = WAL')
    this.database.exec('PRAGMA foreign_keys = ON')
    this.migrate()
    this.recoverInterruptedMaintenanceRuns()
    this.initializeAppSettings(path.join(userDataDirectory, 'app-settings.json'))
  }

  close(): void {
    this.database.close()
  }

  getAppSettings(): AppSettings {
    const row = this.database.prepare(`
      SELECT value_json FROM app_settings WHERE key = 'general'
    `).get() as { value_json: string } | undefined
    return normalizeAppSettings(row ? parseJson(row.value_json, DEFAULT_APP_SETTINGS) : DEFAULT_APP_SETTINGS)
  }

  updateAppSettings(input: UpdateAppSettingsInput): AppSettings {
    const next = normalizeAppSettings({ ...this.getAppSettings(), ...input })
    this.database.prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES ('general', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(JSON.stringify(next), now())
    return next
  }

  hasCompletedLocalAiConfigImport(): boolean {
    const row = this.database.prepare(`
      SELECT value_json FROM app_settings WHERE key = 'local_ai_config_import_v2'
    `).get() as { value_json: string } | undefined
    return row?.value_json === 'true'
  }

  markLocalAiConfigImportCompleted(): void {
    this.database.prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES ('local_ai_config_import_v2', 'true', ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(now())
  }

  listProviders(): AgentProvider[] {
    const rows = this.database.prepare(`
      SELECT * FROM ai_providers
      ORDER BY is_default DESC, updated_at DESC
    `).all() as unknown as ProviderRow[]
    return rows.map((row) => this.publicProvider(row))
  }

  getDefaultPrivateProvider(): PrivateAgentProvider {
    const row = this.database.prepare(`
      SELECT * FROM ai_providers
      ORDER BY is_default DESC, updated_at DESC
      LIMIT 1
    `).get() as unknown as ProviderRow | undefined
    if (!row) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '请先在设置中配置模型供应商',
        'Configure a model provider in Settings first.'
      ))
    }
    return this.privateProvider(row)
  }

  getPrivateProvider(id: string): PrivateAgentProvider {
    const row = this.providerRow(id)
    if (!row) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '模型供应商不存在',
        'The model provider does not exist.'
      ))
    }
    return this.privateProvider(row)
  }

  resolvePrivateProviderInput(input: SaveAgentProviderInput): PrivateAgentProvider {
    const language = this.getAppSettings().language
    const normalized = validateProviderInput(input, language)
    const existing = normalized.id ? this.providerRow(normalized.id) : undefined
    const apiKey = normalized.apiKey || (existing ? this.decryptKey(existing) : '')
    if (!apiKey) {
      throw new Error(storeText(language, '请求密钥不能为空', 'The API key is required.'))
    }
    const timestamp = now()
    return {
      id: normalized.id ?? randomUUID(),
      name: normalized.name,
      type: normalized.type,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      apiKey,
      isDefault: existing?.is_default === 1,
      connectionState: existing?.connection_state ?? 'untested',
      keyPresent: true,
      keyHint: this.keyHint(apiKey),
      createdAt: existing?.created_at ?? timestamp,
      updatedAt: timestamp
    }
  }

  resolveModelDiscoveryInput(input: DiscoverAgentModelsInput): PrivateModelDiscoveryInput {
    const language = this.getAppSettings().language
    const normalized = validateDiscoveryInput(input, language)
    const existing = normalized.id ? this.providerRow(normalized.id) : undefined
    const apiKey = normalized.apiKey || (existing ? this.decryptKey(existing) : '')
    if (!apiKey) {
      throw new Error(storeText(language, '请先填写请求密钥', 'Enter an API key first.'))
    }
    return {
      type: normalized.type,
      baseUrl: normalized.baseUrl,
      apiKey
    }
  }

  saveProvider(input: SaveAgentProviderInput): AgentProvider {
    const provider = this.resolvePrivateProviderInput(input)
    const existing = this.providerRow(provider.id)
    const connectionState = existing &&
      existing.type === provider.type &&
      existing.base_url === provider.baseUrl &&
      existing.model === provider.model &&
      this.decryptKey(existing) === provider.apiKey
      ? existing.connection_state
      : 'untested'
    const encrypted = this.encryptKey(provider.apiKey)
    const providerCount = Number(
      (this.database.prepare('SELECT COUNT(*) AS count FROM ai_providers').get() as { count: number }).count
    )
    const isDefault = provider.isDefault || providerCount === 0
    this.database.prepare(`
      INSERT INTO ai_providers (
        id, name, type, base_url, model,
        api_key_iv, api_key_tag, api_key_ciphertext,
        is_default, connection_state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        base_url = excluded.base_url,
        model = excluded.model,
        api_key_iv = excluded.api_key_iv,
        api_key_tag = excluded.api_key_tag,
        api_key_ciphertext = excluded.api_key_ciphertext,
        connection_state = excluded.connection_state,
        updated_at = excluded.updated_at
    `).run(
      provider.id,
      provider.name,
      provider.type,
      provider.baseUrl,
      provider.model,
      encrypted.iv,
      encrypted.tag,
      encrypted.ciphertext,
      isDefault ? 1 : 0,
      connectionState,
      provider.createdAt,
      provider.updatedAt
    )
    return this.publicProvider(this.providerRow(provider.id)!)
  }

  syncImportedProviders(inputs: ImportedProviderCandidate[]): number {
    let imported = 0
    for (const input of inputs) {
      try {
        const normalized = validateProviderInput(input, this.getAppSettings().language)
        const existing = this.providerRow(input.id)
        if (existing &&
          existing.name === normalized.name &&
          existing.type === normalized.type &&
          existing.base_url === normalized.baseUrl &&
          existing.model === normalized.model &&
          this.decryptKey(existing) === normalized.apiKey) {
          continue
        }
        if (!existing) {
          const duplicates = this.database.prepare(`
            SELECT * FROM ai_providers
            WHERE type = ? AND base_url = ? AND model = ?
          `).all(normalized.type, normalized.baseUrl, normalized.model) as unknown as ProviderRow[]
          if (duplicates.some((row) => this.decryptKey(row) === normalized.apiKey)) continue
        }
        this.saveProvider(normalized)
        imported += 1
      } catch {
        // One malformed external row must not block Memento startup or other imports.
      }
    }
    return imported
  }

  syncLocalImportedProviders(inputs: ImportedProviderCandidate[]): { imported: number; removed: number } {
    return this.syncManagedImportedProviders(inputs, 'local-config-')
  }

  syncCcSwitchImportedProviders(inputs: ImportedProviderCandidate[]): { imported: number; removed: number } {
    return this.syncManagedImportedProviders(inputs, 'cc-switch-')
  }

  private syncManagedImportedProviders(
    inputs: ImportedProviderCandidate[],
    idPrefix: 'local-config-' | 'cc-switch-'
  ): { imported: number; removed: number } {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const managedInputs = inputs.filter((provider) => provider.id.startsWith(idPrefix))
      const imported = this.syncImportedProviders(managedInputs)
      const retainedIds = new Set(
        managedInputs.map((provider) => provider.id)
      )
      const existing = this.database.prepare(`
        SELECT id, is_default FROM ai_providers
        WHERE id GLOB ?
      `).all(`${idPrefix}*`) as unknown as Array<{ id: string; is_default: number }>
      const removed = existing.filter((provider) => !retainedIds.has(provider.id))
      for (const provider of removed) {
        this.database.prepare('DELETE FROM ai_providers WHERE id = ?').run(provider.id)
      }
      if (removed.some((provider) => provider.is_default === 1)) {
        this.database.prepare('UPDATE ai_providers SET is_default = 0').run()
        this.database.prepare(`
          UPDATE ai_providers SET is_default = 1
          WHERE id = (
            SELECT id FROM ai_providers
            ORDER BY updated_at DESC
            LIMIT 1
          )
        `).run()
      }
      this.database.exec('COMMIT')
      return { imported, removed: removed.length }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  deleteProvider(id: string): void {
    const row = this.providerRow(id)
    if (!row) return
    if (row.is_default === 1) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '请先把另一个供应商设为默认模型',
        'Set another provider as the default model first.'
      ))
    }
    this.database.prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
  }

  setDefaultProvider(id: string): AgentProvider[] {
    if (!this.providerRow(id)) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '模型供应商不存在',
        'The model provider does not exist.'
      ))
    }
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('UPDATE ai_providers SET is_default = 0').run()
      this.database.prepare('UPDATE ai_providers SET is_default = 1, updated_at = ? WHERE id = ?')
        .run(now(), id)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    return this.listProviders()
  }

  markProviderConnection(id: string, state: AgentProviderConnectionState): void {
    this.database.prepare(`
      UPDATE ai_providers SET connection_state = ?, updated_at = ? WHERE id = ?
    `).run(state, now(), id)
  }

  createRun(
    prompt: string,
    provider: AgentProvider,
    language: AppLanguage = 'zh-CN',
    conversationId: string = randomUUID(),
    focus: AgentFocus[] = []
  ): AgentRunRecord {
    const timestamp = now()
    const run: AgentRunRecord = {
      id: randomUUID(),
      conversationId,
      language,
      prompt: prompt.trim(),
      status: 'preparing',
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
      response: null,
      presentation: null,
      focus,
      plan: [],
      results: [],
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.writeRun(run)
    return run
  }

  getRun(id: string): AgentRunRecord | null {
    const row = this.database.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as unknown as RunRow | undefined
    return row ? this.runFromRow(row) : null
  }

  listRuns(limit = 100): AgentRunRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(limit, 500))) as unknown as RunRow[]
    return rows.map((row) => this.runFromRow(row))
  }

  deleteRun(id: string): void {
    this.deleteRuns([id])
  }

  deleteRuns(ids: readonly string[]): void {
    const uniqueIds = [...new Set(ids)]
    if (
      uniqueIds.length === 0 ||
      uniqueIds.length > 500 ||
      uniqueIds.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    ) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '任务记录 ID 无效',
        'The task history ID is invalid.'
      ))
    }
    const remove = this.database.prepare('DELETE FROM agent_runs WHERE id = ?')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const id of uniqueIds) remove.run(id)
      this.database.exec('COMMIT')
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      throw error
    }
  }

  listConversationRuns(conversationId: string, limit = 12): AgentRunRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM agent_runs
      WHERE conversation_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(conversationId, Math.max(1, Math.min(limit, 30))) as unknown as RunRow[]
    return rows.map((row) => this.runFromRow(row)).reverse()
  }

  updateRun(
    id: string,
    input: Partial<Pick<AgentRunRecord, 'status' | 'response' | 'presentation' | 'focus' | 'plan' | 'results' | 'error'>>
  ): AgentRunRecord {
    const current = this.getRun(id)
    if (!current) {
      throw new Error(storeText(
        this.getAppSettings().language,
        'Agent 任务不存在',
        'The Agent task does not exist.'
      ))
    }
    const next: AgentRunRecord = {
      ...current,
      ...input,
      updatedAt: now()
    }
    this.writeRun(next)
    return next
  }

  logToolCall(runId: string, toolName: string, input: unknown, output: unknown): void {
    this.database.prepare(`
      INSERT INTO tool_calls (id, run_id, tool_name, input_json, output_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      runId,
      toolName.slice(0, 120),
      JSON.stringify(input ?? null),
      JSON.stringify(output ?? null),
      now()
    )
  }

  createMaintenanceRun(input: CreateMaintenanceRunInput): MaintenanceRunRecord {
    if (!input.operations.length || input.operations.length > 100) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '维护操作列表无效',
        'The maintenance operation list is invalid.'
      ))
    }
    const timestamp = now()
    const runId = randomUUID()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO maintenance_runs (
          id, source, scan_id, agent_run_id, title, status, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'running', ?, NULL)
      `).run(
        runId,
        input.source,
        input.scanId ?? null,
        input.agentRunId ?? null,
        input.title.slice(0, 240),
        timestamp
      )
      const insertOperation = this.database.prepare(`
        INSERT INTO maintenance_operations (
          id, run_id, operation_id, kind, title, status, reversible,
          estimated_bytes, actual_bytes, recovery_mode, recovery_ref,
          error_code, message, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, NULL, NULL, NULL, ?, NULL)
      `)
      for (const operation of input.operations) {
        insertOperation.run(
          randomUUID(),
          runId,
          operation.operationId.slice(0, 100),
          operation.kind.slice(0, 120),
          operation.title.slice(0, 240),
          operation.reversible ? 1 : 0,
          operation.estimatedBytes ?? null,
          operation.recoveryMode ?? 'none',
          timestamp
        )
      }
      this.database.exec('COMMIT')
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      throw error
    }
    return this.getMaintenanceRun(runId)!
  }

  completeMaintenanceOperation(
    operationRecordId: string,
    input: {
      status: Exclude<MaintenanceOperationStatus, 'pending'>
      actualBytes?: number | null
      recoveryRef?: string | null
      errorCode?: string | null
      message?: string | null
    }
  ): void {
    this.database.prepare(`
      UPDATE maintenance_operations
      SET status = ?, actual_bytes = ?, recovery_ref = ?, error_code = ?, message = ?, completed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(
      input.status,
      input.actualBytes ?? null,
      input.recoveryRef ?? null,
      input.errorCode ?? null,
      input.message?.slice(0, 1000) ?? null,
      now(),
      operationRecordId
    )
  }

  completeMaintenanceRun(runId: string): MaintenanceRunRecord {
    const counts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM maintenance_operations WHERE run_id = ?
    `).get(runId) as { completed: number; failed: number; pending: number }
    const status: MaintenanceRunRecord['status'] = counts.pending > 0
      ? 'running'
      : counts.completed > 0 && counts.failed > 0
        ? 'partial'
        : counts.completed > 0
          ? 'completed'
          : 'failed'
    this.database.prepare(`
      UPDATE maintenance_runs SET status = ?, completed_at = ? WHERE id = ?
    `).run(status, status === 'running' ? null : now(), runId)
    const run = this.getMaintenanceRun(runId)
    if (!run) throw new Error('Maintenance run does not exist')
    return run
  }

  getMaintenanceRun(id: string): MaintenanceRunRecord | null {
    const row = this.database.prepare(`SELECT * FROM maintenance_runs WHERE id = ?`).get(id) as unknown as MaintenanceRunRow | undefined
    return row ? this.maintenanceRunFromRow(row) : null
  }

  listMaintenanceRuns(limit = 200): MaintenanceRunRecord[] {
    const rows = this.database.prepare(`
      SELECT * FROM maintenance_runs ORDER BY created_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(limit, 500))) as unknown as MaintenanceRunRow[]
    return rows.map((row) => this.maintenanceRunFromRow(row))
  }

  deleteMaintenanceRuns(ids: readonly string[]): void {
    const uniqueIds = [...new Set(ids)]
    if (
      uniqueIds.length === 0 ||
      uniqueIds.length > 500 ||
      uniqueIds.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))
    ) {
      throw new Error(storeText(
        this.getAppSettings().language,
        '维护记录 ID 无效',
        'The maintenance history ID is invalid.'
      ))
    }
    const remove = this.database.prepare(`
      DELETE FROM maintenance_runs WHERE id = ? AND status != 'running'
    `)
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const id of uniqueIds) remove.run(id)
      this.database.exec('COMMIT')
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      throw error
    }
  }

  getMaintenanceRecovery(operationRecordId: string): {
    mode: MaintenanceOperationRecord['recoveryMode']
    reference: string
  } | null {
    const row = this.database.prepare(`
      SELECT recovery_mode, recovery_ref
      FROM maintenance_operations
      WHERE id = ? AND status = 'completed'
    `).get(operationRecordId) as { recovery_mode: MaintenanceOperationRecord['recoveryMode']; recovery_ref: string | null } | undefined
    return row?.recovery_ref ? { mode: row.recovery_mode, reference: row.recovery_ref } : null
  }

  private loadMasterKey(keyPath: string): Buffer {
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 })
    }
    const key = readFileSync(keyPath)
    if (key.length !== 32) throw new Error('Agent 本地加密密钥无效')
    return key
  }

  private migrate(): void {
    const versionRow = this.database.prepare('PRAGMA user_version').get() as { user_version: number }
    if (versionRow.user_version < 1) {
      this.database.exec(`
        BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS ai_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key_iv BLOB NOT NULL,
        api_key_tag BLOB NOT NULL,
        api_key_ciphertext BLOB NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        connection_state TEXT NOT NULL DEFAULT 'untested',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ai_providers_single_default
        ON ai_providers(is_default) WHERE is_default = 1;
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        model TEXT NOT NULL,
        response TEXT,
        plan_json TEXT NOT NULL DEFAULT '[]',
        results_json TEXT NOT NULL DEFAULT '[]',
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
        PRAGMA user_version = 1;
        COMMIT;
      `)
    }
    if (versionRow.user_version < 2) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE agent_runs ADD COLUMN conversation_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_runs ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-CN';
        ALTER TABLE agent_runs ADD COLUMN presentation_json TEXT NOT NULL DEFAULT 'null';
        ALTER TABLE agent_runs ADD COLUMN focus_json TEXT NOT NULL DEFAULT '[]';
        UPDATE agent_runs SET conversation_id = id WHERE conversation_id = '';
        CREATE INDEX IF NOT EXISTS agent_runs_conversation_created
          ON agent_runs(conversation_id, created_at);
        PRAGMA user_version = 2;
        COMMIT;
      `)
    }
    if (versionRow.user_version < 3) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        UPDATE ai_providers
        SET type = 'antigravity'
        WHERE type = 'google'
          AND (
            lower(base_url) LIKE '%/antigravity'
            OR lower(base_url) LIKE '%/antigravity/%'
          );
        PRAGMA user_version = 3;
        COMMIT;
      `)
    }
    if (versionRow.user_version < 4) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS maintenance_runs (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          scan_id TEXT,
          agent_run_id TEXT,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS maintenance_operations (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES maintenance_runs(id) ON DELETE CASCADE,
          operation_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          reversible INTEGER NOT NULL DEFAULT 0,
          estimated_bytes INTEGER,
          actual_bytes INTEGER,
          recovery_mode TEXT NOT NULL DEFAULT 'none',
          recovery_ref TEXT,
          error_code TEXT,
          message TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS maintenance_runs_created
          ON maintenance_runs(created_at DESC);
        CREATE INDEX IF NOT EXISTS maintenance_operations_run
          ON maintenance_operations(run_id, created_at);
        PRAGMA user_version = 4;
        COMMIT;
      `)
    }
  }

  private providerRow(id: string): ProviderRow | undefined {
    return this.database.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as unknown as ProviderRow | undefined
  }

  private recoverInterruptedMaintenanceRuns(): void {
    const timestamp = now()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        UPDATE maintenance_operations
        SET status = 'failed', error_code = 'operation.interrupted',
            message = 'Memento closed before the operation result was recorded', completed_at = ?
        WHERE status = 'pending'
      `).run(timestamp)
      this.database.prepare(`
        UPDATE maintenance_runs
        SET status = CASE
          WHEN EXISTS (
            SELECT 1 FROM maintenance_operations operation
            WHERE operation.run_id = maintenance_runs.id AND operation.status = 'completed'
          ) THEN 'partial'
          ELSE 'failed'
        END,
        completed_at = ?
        WHERE status = 'running'
      `).run(timestamp)
      this.database.exec('COMMIT')
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK')
      throw error
    }
  }

  private initializeAppSettings(legacyPath: string): void {
    const existing = this.database.prepare(`
      SELECT 1 AS present FROM app_settings WHERE key = 'general'
    `).get()
    if (existing) return
    let initial: AppSettings = { ...DEFAULT_APP_SETTINGS }
    if (existsSync(legacyPath)) {
      try {
        initial = normalizeAppSettings(JSON.parse(readFileSync(legacyPath, 'utf8')))
      } catch {
        initial = { ...DEFAULT_APP_SETTINGS }
      }
    }
    this.updateAppSettings(initial)
  }

  private publicProvider(row: ProviderRow): AgentProvider {
    const apiKey = this.decryptKey(row)
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      baseUrl: row.base_url,
      model: row.model,
      isDefault: row.is_default === 1,
      connectionState: row.connection_state,
      keyPresent: Boolean(apiKey),
      keyHint: this.keyHint(apiKey),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private privateProvider(row: ProviderRow): PrivateAgentProvider {
    return {
      ...this.publicProvider(row),
      apiKey: this.decryptKey(row)
    }
  }

  private encryptKey(apiKey: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv)
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
    return { iv, tag: cipher.getAuthTag(), ciphertext }
  }

  private decryptKey(row: ProviderRow): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(row.api_key_iv)
    )
    decipher.setAuthTag(Buffer.from(row.api_key_tag))
    return Buffer.concat([
      decipher.update(Buffer.from(row.api_key_ciphertext)),
      decipher.final()
    ]).toString('utf8')
  }

  private keyHint(apiKey: string): string | null {
    return apiKey ? `••••${apiKey.slice(-4)}` : null
  }

  private runFromRow(row: RunRow): AgentRunRecord {
    return {
      id: row.id,
      conversationId: row.conversation_id || row.id,
      language: row.language === 'en-US' ? 'en-US' : 'zh-CN',
      prompt: row.prompt,
      status: row.status,
      providerId: row.provider_id,
      providerName: row.provider_name,
      model: row.model,
      response: row.response,
      presentation: parseJson<AgentPresentation | null>(row.presentation_json, null),
      focus: parseJson<AgentFocus[]>(row.focus_json, []),
      plan: parseJson<AgentPlanItem[]>(row.plan_json, []),
      results: parseJson<ActionResult[]>(row.results_json, []),
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private maintenanceRunFromRow(row: MaintenanceRunRow): MaintenanceRunRecord {
    const operations = this.database.prepare(`
      SELECT * FROM maintenance_operations WHERE run_id = ? ORDER BY rowid
    `).all(row.id) as unknown as MaintenanceOperationRow[]
    return {
      id: row.id,
      source: row.source,
      scanId: row.scan_id,
      agentRunId: row.agent_run_id,
      title: row.title,
      status: row.status,
      operations: operations.map((operation) => ({
        id: operation.id,
        runId: operation.run_id,
        operationId: operation.operation_id,
        kind: operation.kind,
        title: operation.title,
        status: operation.status,
        reversible: operation.reversible === 1,
        estimatedBytes: operation.estimated_bytes,
        actualBytes: operation.actual_bytes,
        recoveryMode: operation.recovery_mode,
        recoveryAvailable: Boolean(operation.recovery_ref),
        errorCode: operation.error_code,
        message: operation.message,
        createdAt: operation.created_at,
        completedAt: operation.completed_at
      })),
      createdAt: row.created_at,
      completedAt: row.completed_at
    }
  }

  private writeRun(run: AgentRunRecord): void {
    this.database.prepare(`
      INSERT INTO agent_runs (
        id, conversation_id, language, prompt, status, provider_id, provider_name, model,
        response, presentation_json, focus_json, plan_json, results_json, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        response = excluded.response,
        presentation_json = excluded.presentation_json,
        focus_json = excluded.focus_json,
        plan_json = excluded.plan_json,
        results_json = excluded.results_json,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      run.id,
      run.conversationId,
      run.language,
      run.prompt,
      run.status,
      run.providerId,
      run.providerName,
      run.model,
      run.response,
      JSON.stringify(run.presentation),
      JSON.stringify(run.focus),
      JSON.stringify(run.plan),
      JSON.stringify(run.results),
      run.error,
      run.createdAt,
      run.updatedAt
    )
  }
}

export type { PrivateAgentProvider }

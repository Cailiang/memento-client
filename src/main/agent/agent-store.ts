import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type {
  AgentPlanItem,
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
  type UpdateAppSettingsInput
} from '../../shared/app-settings'
import type { ActionResult } from '../../shared/types'
import {
  normalizeProviderBaseUrl,
  type PrivateModelDiscoveryInput
} from './provider-config'

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
  prompt: string
  status: AgentRunStatus
  provider_id: string
  provider_name: string
  model: string
  response: string | null
  plan_json: string
  results_json: string
  error: string | null
  created_at: string
  updated_at: string
}

const PROVIDER_TYPES = new Set<AgentProvider['type']>([
  'openai-compatible',
  'openai',
  'anthropic',
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

function validateProviderInput(input: SaveAgentProviderInput): SaveAgentProviderInput {
  const id = typeof input.id === 'string' ? input.id.trim() : undefined
  if (id && id.length > 100) throw new Error('模型供应商 ID 无效')
  const name = input.name.trim().slice(0, 80)
  const baseUrl = input.baseUrl.trim().slice(0, 2048)
  const model = input.model.trim().slice(0, 200)
  if (!name || !baseUrl || !model || !PROVIDER_TYPES.has(input.type)) {
    throw new Error('供应商名称、接口类型、服务地址和模型不能为空')
  }
  return {
    id,
    name,
    type: input.type,
    baseUrl: normalizeProviderBaseUrl(input.type, baseUrl),
    model,
    apiKey: input.apiKey?.trim()
  }
}

function validateDiscoveryInput(input: DiscoverAgentModelsInput): Omit<PrivateModelDiscoveryInput, 'apiKey'> & { id?: string; apiKey?: string } {
  const id = typeof input.id === 'string' ? input.id.trim() : undefined
  if (id && id.length > 100) throw new Error('模型供应商 ID 无效')
  if (!PROVIDER_TYPES.has(input.type) || typeof input.baseUrl !== 'string' || !input.baseUrl.trim()) {
    throw new Error('请先填写有效的服务地址')
  }
  return {
    id,
    type: input.type,
    baseUrl: normalizeProviderBaseUrl(input.type, input.baseUrl.slice(0, 2048)),
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
    if (!row) throw new Error('请先在设置中配置模型供应商')
    return this.privateProvider(row)
  }

  getPrivateProvider(id: string): PrivateAgentProvider {
    const row = this.providerRow(id)
    if (!row) throw new Error('模型供应商不存在')
    return this.privateProvider(row)
  }

  resolvePrivateProviderInput(input: SaveAgentProviderInput): PrivateAgentProvider {
    const normalized = validateProviderInput(input)
    const existing = normalized.id ? this.providerRow(normalized.id) : undefined
    const apiKey = normalized.apiKey || (existing ? this.decryptKey(existing) : '')
    if (!apiKey) throw new Error('请求密钥不能为空')
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
    const normalized = validateDiscoveryInput(input)
    const existing = normalized.id ? this.providerRow(normalized.id) : undefined
    const apiKey = normalized.apiKey || (existing ? this.decryptKey(existing) : '')
    if (!apiKey) throw new Error('请先填写请求密钥')
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

  deleteProvider(id: string): void {
    const row = this.providerRow(id)
    if (!row) return
    if (row.is_default === 1) throw new Error('请先把另一个供应商设为默认模型')
    this.database.prepare('DELETE FROM ai_providers WHERE id = ?').run(id)
  }

  setDefaultProvider(id: string): AgentProvider[] {
    if (!this.providerRow(id)) throw new Error('模型供应商不存在')
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

  createRun(prompt: string, provider: AgentProvider): AgentRunRecord {
    const timestamp = now()
    const run: AgentRunRecord = {
      id: randomUUID(),
      prompt: prompt.trim(),
      status: 'preparing',
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
      response: null,
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

  updateRun(
    id: string,
    input: Partial<Pick<AgentRunRecord, 'status' | 'response' | 'plan' | 'results' | 'error'>>
  ): AgentRunRecord {
    const current = this.getRun(id)
    if (!current) throw new Error('Agent 任务不存在')
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
    if (versionRow.user_version >= 1) return
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

  private providerRow(id: string): ProviderRow | undefined {
    return this.database.prepare('SELECT * FROM ai_providers WHERE id = ?').get(id) as unknown as ProviderRow | undefined
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
      prompt: row.prompt,
      status: row.status,
      providerId: row.provider_id,
      providerName: row.provider_name,
      model: row.model,
      response: row.response,
      plan: parseJson<AgentPlanItem[]>(row.plan_json, []),
      results: parseJson<ActionResult[]>(row.results_json, []),
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private writeRun(run: AgentRunRecord): void {
    this.database.prepare(`
      INSERT INTO agent_runs (
        id, prompt, status, provider_id, provider_name, model,
        response, plan_json, results_json, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        response = excluded.response,
        plan_json = excluded.plan_json,
        results_json = excluded.results_json,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      run.id,
      run.prompt,
      run.status,
      run.providerId,
      run.providerName,
      run.model,
      run.response,
      JSON.stringify(run.plan),
      JSON.stringify(run.results),
      run.error,
      run.createdAt,
      run.updatedAt
    )
  }
}

export type { PrivateAgentProvider }

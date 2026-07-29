import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { AgentProviderType } from '../../shared/agent-types'

// Vite 5 does not yet recognize node:sqlite as a built-in during tests.
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

interface CcSwitchProviderRow {
  id: string
  app_type: 'claude' | 'codex' | 'gemini'
  name: string
  settings_config: string
  meta: string
  is_current: number
}

export interface CcSwitchProviderCandidate {
  id: string
  name: string
  type: AgentProviderType
  baseUrl: string
  model: string
  apiKey: string
  isCurrent: boolean
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(source: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = text(source[key])
    if (value) return value
  }
  return ''
}

function parseJson(value: string): JsonRecord {
  try {
    return record(JSON.parse(value))
  } catch {
    return {}
  }
}

function parseTomlConfig(value: unknown): JsonRecord {
  const source = text(value)
  if (!source) return {}
  try {
    return record(parseToml(source))
  } catch {
    return {}
  }
}

function providerTypeForFormat(
  format: string,
  fallback: AgentProviderType
): AgentProviderType {
  switch (format) {
    case 'anthropic': return 'anthropic'
    case 'gemini_native': return 'google'
    case 'openai_responses': return 'openai'
    case 'openai_chat': return 'openai-compatible'
    default: return fallback
  }
}

function deterministicProviderId(appType: string, sourceId: string): string {
  const digest = createHash('sha256')
    .update(`${appType}\0${sourceId}`)
    .digest('hex')
    .slice(0, 24)
  return `cc-switch-${appType}-${digest}`
}

function claudeCandidate(row: CcSwitchProviderRow): CcSwitchProviderCandidate | null {
  const settings = parseJson(row.settings_config)
  const environment = record(settings.env)
  const metadata = parseJson(row.meta)
  const apiKey = firstText(environment, ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY'])
  if (!apiKey) return null
  const type = providerTypeForFormat(text(metadata.apiFormat), 'anthropic')
  const baseUrl = firstText(environment, ['ANTHROPIC_BASE_URL']) || (
    type === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : type === 'anthropic'
        ? 'https://api.anthropic.com/v1'
        : 'https://api.openai.com/v1'
  )
  const model = firstText(environment, [
    'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL'
  ]) || text(settings.model) || 'claude-sonnet-4-20250514'
  return {
    id: deterministicProviderId(row.app_type, row.id),
    name: row.name,
    type,
    baseUrl,
    model,
    apiKey,
    isCurrent: row.is_current === 1
  }
}

function codexCandidate(row: CcSwitchProviderRow): CcSwitchProviderCandidate | null {
  const settings = parseJson(row.settings_config)
  const auth = record(settings.auth)
  const metadata = parseJson(row.meta)
  const config = parseTomlConfig(settings.config)
  const activeProviderId = text(config.model_provider)
  const activeProvider = record(record(config.model_providers)[activeProviderId])
  const apiKey = firstText(auth, ['OPENAI_API_KEY']) ||
    firstText(activeProvider, ['experimental_bearer_token']) ||
    firstText(config, ['experimental_bearer_token'])
  if (!apiKey) return null
  const baseUrl = firstText(activeProvider, ['base_url']) ||
    firstText(config, ['base_url']) ||
    'https://api.openai.com/v1'
  const format = text(metadata.apiFormat) || (
    text(activeProvider.wire_api) === 'responses' ? 'openai_responses' : 'openai_chat'
  )
  return {
    id: deterministicProviderId(row.app_type, row.id),
    name: row.name,
    type: providerTypeForFormat(format, 'openai'),
    baseUrl,
    model: firstText(config, ['model']) || 'gpt-4o',
    apiKey,
    isCurrent: row.is_current === 1
  }
}

function geminiCandidate(row: CcSwitchProviderRow): CcSwitchProviderCandidate | null {
  const settings = parseJson(row.settings_config)
  const environment = record(settings.env)
  const apiKey = firstText(environment, ['GEMINI_API_KEY', 'GOOGLE_API_KEY'])
  if (!apiKey) return null
  return {
    id: deterministicProviderId(row.app_type, row.id),
    name: row.name,
    type: 'google',
    baseUrl: firstText(environment, ['GOOGLE_GEMINI_BASE_URL']) ||
      'https://generativelanguage.googleapis.com/v1beta',
    model: firstText(environment, ['GEMINI_MODEL']) || text(settings.model) || 'gemini-2.5-pro',
    apiKey,
    isCurrent: row.is_current === 1
  }
}

function candidateFromRow(row: CcSwitchProviderRow): CcSwitchProviderCandidate | null {
  switch (row.app_type) {
    case 'claude': return claudeCandidate(row)
    case 'codex': return codexCandidate(row)
    case 'gemini': return geminiCandidate(row)
  }
}

function expandHomePath(value: string, homeDirectory: string): string {
  if (value === '~') return homeDirectory
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homeDirectory, value.slice(2))
  return value
}

export function findCcSwitchDatabase(
  homeDirectory: string,
  applicationSupportDirectory = path.join(homeDirectory, 'Library', 'Application Support')
): string | null {
  const storePath = path.join(applicationSupportDirectory, 'com.ccswitch.desktop', 'app_paths.json')
  try {
    const store = parseJson(readFileSync(storePath, 'utf8'))
    const override = text(store.app_config_dir_override)
    if (override) {
      const databasePath = path.join(expandHomePath(override, homeDirectory), 'cc-switch.db')
      if (existsSync(databasePath)) return databasePath
    }
  } catch {
    // Missing or malformed CC Switch store data falls back to its standard path.
  }
  const defaultPath = path.join(homeDirectory, '.cc-switch', 'cc-switch.db')
  return existsSync(defaultPath) ? defaultPath : null
}

export function readCcSwitchProviders(databasePath: string): CcSwitchProviderCandidate[] {
  if (!existsSync(databasePath)) return []
  let database: InstanceType<typeof DatabaseSync> | null = null
  try {
    database = new DatabaseSync(databasePath, { readOnly: true })
    const table = database.prepare(`
      SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'providers'
    `).get()
    if (!table) return []
    const rows = database.prepare(`
      SELECT id, app_type, name, settings_config, meta, is_current
      FROM providers
      WHERE app_type IN ('claude', 'codex', 'gemini')
      ORDER BY is_current DESC, app_type ASC, COALESCE(sort_index, 999999), name ASC
    `).all() as unknown as CcSwitchProviderRow[]
    return rows
      .map(candidateFromRow)
      .filter((item): item is CcSwitchProviderCandidate => item !== null)
  } catch {
    return []
  } finally {
    database?.close()
  }
}

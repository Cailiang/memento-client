import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type {
  AgentProviderModelsResult,
  AgentProviderType
} from '../../shared/agent-types'
import {
  deterministicImportedProviderId,
  type ImportedProviderCandidate
} from './provider-import'
import {
  discoverProviderModels,
  type PrivateModelDiscoveryInput
} from './provider-config'

type JsonRecord = Record<string, unknown>

export interface LocalAiProviderDiscovery {
  sourcesFound: number
  detected: number
  rejected: number
  candidates: ImportedProviderCandidate[]
}

type LocalAiModelDiscovery = (
  input: PrivateModelDiscoveryInput
) => Promise<Pick<AgentProviderModelsResult, 'models'>>

const LOCAL_AI_VALIDATION_TIMEOUT_MS = 8_000

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

function readJson(filePath: string): JsonRecord {
  try {
    return record(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return {}
  }
}

function readToml(filePath: string): JsonRecord {
  try {
    return record(parseToml(readFileSync(filePath, 'utf8')))
  } catch {
    return {}
  }
}

function readDotEnv(filePath: string): JsonRecord {
  try {
    const result: JsonRecord = {}
    for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      } else {
        value = value.replace(/\s+#.*$/, '').trim()
      }
      result[match[1]] = value
    }
    return result
  } catch {
    return {}
  }
}

function providerTypeForEndpoint(
  type: AgentProviderType,
  baseUrl: string
): AgentProviderType {
  return type === 'google' && /\/antigravity(?:\/|$)/i.test(baseUrl)
    ? 'antigravity'
    : type
}

function candidate(
  source: 'claude' | 'codex' | 'gemini' | 'grok',
  sourceId: string,
  input: Omit<ImportedProviderCandidate, 'id'>
): ImportedProviderCandidate | null {
  if (!input.name || !input.baseUrl || !input.model || !input.apiKey) return null
  try {
    const url = new URL(input.baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  } catch {
    return null
  }
  return {
    id: deterministicImportedProviderId(`local-config-${source}`, sourceId),
    ...input
  }
}

function claudeCandidate(homeDirectory: string): ImportedProviderCandidate | null {
  const settings = readJson(path.join(homeDirectory, '.claude', 'settings.json'))
  const environment = record(settings.env)
  return candidate('claude', 'settings', {
    name: 'Claude 本机配置',
    type: 'anthropic',
    baseUrl: firstText(environment, ['ANTHROPIC_BASE_URL']) || 'https://api.anthropic.com/v1',
    model: firstText(environment, [
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL'
    ]) || 'claude-opus-4-6',
    apiKey: firstText(environment, ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
  })
}

function codexCandidate(
  homeDirectory: string,
  environment: NodeJS.ProcessEnv
): ImportedProviderCandidate | null {
  const directory = path.join(homeDirectory, '.codex')
  const auth = readJson(path.join(directory, 'auth.json'))
  const config = readToml(path.join(directory, 'config.toml'))
  const providerId = text(config.model_provider) || 'openai'
  const provider = record(record(config.model_providers)[providerId])
  const environmentKey = firstText(provider, ['env_key'])
  const apiKey = firstText(auth, ['OPENAI_API_KEY']) ||
    (environmentKey ? text(environment[environmentKey]) : '') ||
    firstText(provider, ['experimental_bearer_token']) ||
    firstText(config, ['experimental_bearer_token'])
  const baseUrl = firstText(provider, ['base_url']) ||
    firstText(config, ['base_url']) ||
    'https://api.openai.com/v1'
  const wireApi = firstText(provider, ['wire_api'])
  const type: AgentProviderType = wireApi === 'responses' || providerId === 'openai' ||
    /^https:\/\/api\.openai\.com(?:\/|$)/i.test(baseUrl)
    ? 'openai'
    : 'openai-compatible'
  return candidate('codex', providerId, {
    name: providerId === 'openai' ? 'Codex · OpenAI' : `Codex · ${providerId}`,
    type,
    baseUrl,
    model: firstText(config, ['model']) || 'gpt-5.4',
    apiKey
  })
}

function geminiCandidate(homeDirectory: string): ImportedProviderCandidate | null {
  const environment = readDotEnv(path.join(homeDirectory, '.gemini', '.env'))
  const baseUrl = firstText(environment, ['GOOGLE_GEMINI_BASE_URL']) ||
    'https://generativelanguage.googleapis.com/v1beta'
  return candidate('gemini', 'environment', {
    name: 'Gemini 本机配置',
    type: providerTypeForEndpoint('google', baseUrl),
    baseUrl,
    model: firstText(environment, ['GEMINI_MODEL']) || 'gemini-2.5-pro',
    apiKey: firstText(environment, ['GEMINI_API_KEY', 'GOOGLE_API_KEY'])
  })
}

function grokCandidate(
  homeDirectory: string,
  environment: NodeJS.ProcessEnv
): ImportedProviderCandidate | null {
  const config = readToml(path.join(homeDirectory, '.grok', 'config.toml'))
  const configuredModels = record(config.model)
  const defaultModelId = firstText(record(config.models), ['default']) || Object.keys(configuredModels)[0] || ''
  const selected = record(configuredModels[defaultModelId])
  const environmentKey = firstText(selected, ['env_key'])
  return candidate('grok', defaultModelId || 'default', {
    name: firstText(selected, ['name']) || 'Grok 本机配置',
    type: 'openai-compatible',
    baseUrl: firstText(selected, ['base_url']),
    model: firstText(selected, ['model']),
    apiKey: environmentKey ? text(environment[environmentKey]) : ''
  })
}

export function discoverLocalAiProviders(
  homeDirectory: string,
  environment: NodeJS.ProcessEnv = process.env
): LocalAiProviderDiscovery {
  const sources = [
    {
      found: existsSync(path.join(homeDirectory, '.claude', 'settings.json')),
      read: (): ImportedProviderCandidate | null => claudeCandidate(homeDirectory)
    },
    {
      found: existsSync(path.join(homeDirectory, '.codex', 'auth.json')) ||
        existsSync(path.join(homeDirectory, '.codex', 'config.toml')),
      read: (): ImportedProviderCandidate | null => codexCandidate(homeDirectory, environment)
    },
    {
      found: existsSync(path.join(homeDirectory, '.gemini', '.env')) ||
        existsSync(path.join(homeDirectory, '.gemini', 'settings.json')),
      read: (): ImportedProviderCandidate | null => geminiCandidate(homeDirectory)
    },
    {
      found: existsSync(path.join(homeDirectory, '.grok', 'config.toml')) ||
        existsSync(path.join(homeDirectory, '.grok', 'auth.json')),
      read: (): ImportedProviderCandidate | null => grokCandidate(homeDirectory, environment)
    }
  ].filter((source) => source.found)
  const candidates = sources
    .map((source) => source.read())
    .filter((item): item is ImportedProviderCandidate => item !== null)
  return {
    sourcesFound: sources.length,
    detected: sources.length,
    rejected: sources.length - candidates.length,
    candidates
  }
}

export async function validateLocalAiProviderDiscovery(
  discovery: LocalAiProviderDiscovery,
  discoverModels: LocalAiModelDiscovery = (input) =>
    discoverProviderModels(input, fetch, LOCAL_AI_VALIDATION_TIMEOUT_MS)
): Promise<LocalAiProviderDiscovery> {
  const validated = await Promise.all(discovery.candidates.map(async (provider) => {
    try {
      const result = await discoverModels({
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey
      })
      return result.models.includes(provider.model) ? provider : null
    } catch {
      return null
    }
  }))
  const candidates = validated.filter(
    (provider): provider is ImportedProviderCandidate => provider !== null
  )
  return {
    ...discovery,
    rejected: discovery.detected - candidates.length,
    candidates
  }
}

export async function discoverUsableLocalAiProviders(
  homeDirectory: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<LocalAiProviderDiscovery> {
  return validateLocalAiProviderDiscovery(
    discoverLocalAiProviders(homeDirectory, environment)
  )
}

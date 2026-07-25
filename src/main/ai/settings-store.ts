import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AiMode,
  AiProviderId,
  PublicAiSettings,
  UpdateAiSettingsInput
} from '../../shared/ai-types'
import { AiError } from './errors'
import { LocalCredentialStore } from './credentials/local-store'

interface StoredSettings {
  schemaVersion: 1
  mode: AiMode
  model: string | null
  keyHint: string | null
}

const defaultSettings: StoredSettings = {
  schemaVersion: 1,
  mode: 'hosted',
  model: null,
  keyHint: null
}
const allowedModes = new Set<AiMode>(['disabled', 'local', 'byok', 'hosted'])

export function providerIdForMode(mode: AiMode): AiProviderId | null {
  if (mode === 'local') return 'ollama'
  if (mode === 'byok') return 'tczor-byok'
  if (mode === 'hosted') return 'memento-hosted'
  return null
}

function defaultModel(mode: AiMode): string | null {
  if (mode === 'local') return 'qwen2.5:7b'
  if (mode === 'byok') return 'grok-4.5'
  return null
}

function validateModel(model: string | undefined): string | undefined {
  if (model === undefined) return undefined
  const value = model.trim()
  if (!value || value.length > 100 || !/^[A-Za-z0-9._:/-]+$/.test(value)) {
    throw new AiError('AI_PROVIDER_NOT_CONFIGURED', '模型名称格式无效')
  }
  return value
}

export class AiSettingsStore {
  private readonly settingsPath: string

  constructor(
    userDataPath: string,
    private readonly credentials: LocalCredentialStore,
    private readonly gatewayUrl: string
  ) {
    this.settingsPath = path.join(userDataPath, 'ai-settings.json')
  }

  private async read(): Promise<StoredSettings> {
    try {
      const value = JSON.parse(await fs.readFile(this.settingsPath, 'utf8')) as Partial<StoredSettings>
      if (value.schemaVersion !== 1) return { ...defaultSettings }
      return {
        schemaVersion: 1,
        mode: value.mode && allowedModes.has(value.mode) ? value.mode : 'hosted',
        model: typeof value.model === 'string' ? value.model : null,
        keyHint: typeof value.keyHint === 'string' ? value.keyHint : null
      }
    } catch {
      return { ...defaultSettings }
    }
  }

  private async write(settings: StoredSettings): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true })
    const temporaryPath = `${this.settingsPath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(settings, null, 2), { mode: 0o600 })
    await fs.rename(temporaryPath, this.settingsPath)
  }

  async getPublic(): Promise<PublicAiSettings> {
    const settings = await this.read()
    return {
      mode: settings.mode,
      providerId: providerIdForMode(settings.mode),
      model: settings.model ?? defaultModel(settings.mode),
      allowRawConfig: false,
      showDataPreview: true,
      keyPresent: await this.credentials.has('byok-api-key'),
      keyHint: settings.keyHint,
      hostedGatewayUrl: this.gatewayUrl
    }
  }

  async update(input: UpdateAiSettingsInput): Promise<PublicAiSettings> {
    if (!input || typeof input !== 'object' || !allowedModes.has(input.mode)) {
      throw new AiError('AI_PROVIDER_NOT_CONFIGURED', 'AI 模式无效')
    }
    const current = await this.read()
    const model = validateModel(input.model)
    let keyHint = current.keyHint
    if (input.clearByokKey === true) {
      await this.credentials.delete('byok-api-key')
      keyHint = null
    }
    if (input.byokApiKey !== undefined) {
      const apiKey = input.byokApiKey.trim()
      if (apiKey.length < 12 || apiKey.length > 500) {
        throw new AiError('AI_PROVIDER_NOT_CONFIGURED', 'API Key 长度无效')
      }
      await this.credentials.set('byok-api-key', apiKey)
      keyHint = apiKey.slice(-4)
    }
    await this.write({
      schemaVersion: 1,
      mode: input.mode,
      model: model ?? (current.mode === input.mode ? current.model : defaultModel(input.mode)),
      keyHint
    })
    return this.getPublic()
  }
}

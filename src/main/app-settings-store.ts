import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_APP_SETTINGS,
  type AppLanguage,
  type AppSettings,
  type AppTheme,
  type UpdateAppSettingsInput
} from '../shared/app-settings'

const LANGUAGES = new Set<AppLanguage>(['zh-CN', 'en-US'])
const THEMES = new Set<AppTheme>([
  'porcelain',
  'graphite',
  'tiffany',
  'klein',
  'burgundy',
  'mars',
  'prussian',
  'midnight'
])

function normalize(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_APP_SETTINGS }
  const candidate = value as Partial<AppSettings>
  return {
    language: LANGUAGES.has(candidate.language as AppLanguage)
      ? (candidate.language as AppLanguage)
      : DEFAULT_APP_SETTINGS.language,
    theme: THEMES.has(candidate.theme as AppTheme)
      ? (candidate.theme as AppTheme)
      : DEFAULT_APP_SETTINGS.theme,
    launchAtLogin: candidate.launchAtLogin === true,
    closeToTray: candidate.closeToTray === true
  }
}

export class AppSettingsStore {
  private readonly filePath: string
  private current: AppSettings | null = null

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'app-settings.json')
  }

  async get(): Promise<AppSettings> {
    if (this.current) return { ...this.current }
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      this.current = normalize(JSON.parse(raw))
    } catch {
      this.current = { ...DEFAULT_APP_SETTINGS }
    }
    return { ...this.current }
  }

  async update(input: UpdateAppSettingsInput): Promise<AppSettings> {
    const current = await this.get()
    const next = normalize({ ...current, ...input })
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    this.current = next
    return { ...next }
  }
}

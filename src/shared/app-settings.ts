export type AppLanguage = 'zh-CN' | 'en-US'
export type AppTheme =
  | 'porcelain'
  | 'graphite'
  | 'tiffany'
  | 'klein'
  | 'burgundy'
  | 'mars'
  | 'prussian'
  | 'midnight'

export interface AppSettings {
  language: AppLanguage
  theme: AppTheme
  launchAtLogin: boolean
  closeToTray: boolean
  serviceWhitelist: string[]
  storageWhitelist: string[]
}

export type UpdateAppSettingsInput = Partial<AppSettings>

export interface MementoSettingsApi {
  getAppSettings: () => Promise<AppSettings>
  updateAppSettings: (input: UpdateAppSettingsInput) => Promise<AppSettings>
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'zh-CN',
  theme: 'porcelain',
  launchAtLogin: false,
  closeToTray: false,
  serviceWhitelist: [],
  storageWhitelist: []
}

function normalizeWhitelist(value: unknown, maximumLength: number): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= maximumLength)
  return [...new Set(normalized)].slice(0, 200)
}

export function normalizeServiceWhitelist(value: unknown): string[] {
  return normalizeWhitelist(value, 200)
}

export function normalizeStorageWhitelist(value: unknown): string[] {
  return normalizeWhitelist(value, 1024)
}

export function candidateWhitelistValue(candidate: {
  section: string
  name: string
  location?: string
}): string | null {
  if (candidate.section === 'services') return candidate.name
  if (candidate.section === 'storage') return candidate.location ?? candidate.name
  return null
}

export function isServiceWhitelisted(
  candidate: { section: string; name: string },
  serviceWhitelist: readonly string[]
): boolean {
  return candidate.section === 'services' && serviceWhitelist.includes(candidate.name)
}

export function isStorageWhitelisted(
  candidate: { section: string; name: string; location?: string },
  storageWhitelist: readonly string[]
): boolean {
  return candidate.section === 'storage' && storageWhitelist.includes(
    candidate.location ?? candidate.name
  )
}

export function isCandidateWhitelisted(
  candidate: { section: string; name: string; location?: string },
  serviceWhitelist: readonly string[],
  storageWhitelist: readonly string[]
): boolean {
  return isServiceWhitelisted(candidate, serviceWhitelist) ||
    isStorageWhitelisted(candidate, storageWhitelist)
}

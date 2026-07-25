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
  closeToTray: false
}

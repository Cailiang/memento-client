import { useState } from 'react'
import {
  Check,
  Languages,
  MonitorUp,
  Palette
} from 'lucide-react'
import type {
  AppLanguage,
  AppSettings,
  AppTheme,
  UpdateAppSettingsInput
} from '../../shared/app-settings'
import { useI18n } from './i18n'

const THEMES: Array<{
  id: AppTheme
  name: [string, string]
  detail: [string, string]
}> = [
  {
    id: 'porcelain',
    name: ['雾瓷朱红', 'Porcelain red'],
    detail: ['暖白、提香红与凡戴克棕', 'Warm white, Titian red, and Van Dyke brown']
  },
  {
    id: 'graphite',
    name: ['莱姆终端', 'Lime terminal'],
    detail: ['石墨底、莱姆绿与蒂芙尼青', 'Graphite, lime green, and Tiffany cyan']
  },
  {
    id: 'tiffany',
    name: ['蒂芙尼晨雾', 'Tiffany mist'],
    detail: ['水绿表面与勃艮第警示色', 'Aqua surfaces with burgundy warnings']
  },
  {
    id: 'klein',
    name: ['克莱因蓝图', 'Klein blueprint'],
    detail: ['冷白、克莱因蓝与莱姆绿', 'Cool white, Klein blue, and lime green']
  },
  {
    id: 'burgundy',
    name: ['勃艮第书房', 'Burgundy study'],
    detail: ['灰粉表面、酒红与马尔斯绿', 'Dusty rose, burgundy, and Mars green']
  },
  {
    id: 'mars',
    name: ['马尔斯工坊', 'Mars workshop'],
    detail: ['雾绿、提香红与暖灰', 'Mist green, Titian red, and warm gray']
  },
  {
    id: 'prussian',
    name: ['普鲁士夜航', 'Prussian night'],
    detail: ['普鲁士蓝、爱马仕橙与浅青', 'Prussian blue, Hermès orange, and pale cyan']
  },
  {
    id: 'midnight',
    name: ['午夜青珊', 'Midnight cyan'],
    detail: ['深灰、蒂芙尼蓝与中国红', 'Charcoal, Tiffany blue, and Chinese red']
  }
]

export function SettingsView({
  settings,
  onUpdate,
  onOpenAiSettings
}: {
  settings: AppSettings
  onUpdate: (input: UpdateAppSettingsInput) => Promise<void>
  onOpenAiSettings: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const update = async (key: string, input: UpdateAppSettingsInput): Promise<void> => {
    setBusyKey(key)
    setSaved(false)
    try {
      await onUpdate(input)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1800)
    } finally {
      setBusyKey(null)
    }
  }

  const languageOption = (language: AppLanguage, label: string): React.JSX.Element => (
    <button
      type="button"
      role="radio"
      aria-checked={settings.language === language}
      className={settings.language === language ? 'is-selected' : ''}
      onClick={() => void update('language', { language })}
      disabled={busyKey === 'language'}
    >
      {label}
    </button>
  )

  return (
    <div className="view settings-view">
      <div className="page-title-row settings-title-row">
        <div className="settings-heading">
          <h1>{text('设置', 'Settings')}</h1>
          <SettingsTabs active="general" onChange={(tab) => tab === 'ai' && onOpenAiSettings()} />
        </div>
        <div className="settings-title-status">
          <span className={`settings-saved ${saved ? 'is-visible' : ''}`}>
            <Check size={14} />{text('已保存', 'Saved')}
          </span>
        </div>
      </div>

      <section className="preference-section">
        <div className="preference-copy">
          <span className="preference-icon"><Languages size={18} /></span>
          <div><h2>{text('语言', 'Language')}</h2><p>{text('切换后重新生成当前扫描文案，AI 分析也使用同一语言。', 'The current scan copy is regenerated after switching, and AI analysis uses the same language.')}</p></div>
        </div>
        <div className="segmented-control" role="radiogroup" aria-label={text('语言', 'Language')}>
          {languageOption('zh-CN', '中文')}
          {languageOption('en-US', 'English')}
        </div>
      </section>

      <section className="preference-section">
        <div className="preference-copy">
          <span className="preference-icon"><MonitorUp size={18} /></span>
          <div><h2>{text('窗口行为', 'Window behavior')}</h2><p>{text('控制登录启动与关闭主窗口后的后台行为。', 'Control launch-at-login and what happens after the main window closes.')}</p></div>
        </div>
        <div className="toggle-list">
          <label className="toggle-row">
            <span><strong>{text('登录时启动', 'Launch at login')}</strong><small>{text('登录 macOS 后自动打开 Memento', 'Open Memento automatically after signing in to macOS')}</small></span>
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(event) => void update('launchAtLogin', { launchAtLogin: event.target.checked })}
              disabled={busyKey === 'launchAtLogin'}
            />
            <span className="toggle-track" aria-hidden="true"><span /></span>
          </label>
          <label className="toggle-row">
            <span><strong>{text('关闭后驻留菜单栏', 'Keep in menu bar after closing')}</strong><small>{text('关闭主窗口时隐藏 Dock 图标，可从菜单栏重新打开', 'Hide the Dock icon when closing the main window and reopen it from the menu bar')}</small></span>
            <input
              type="checkbox"
              checked={settings.closeToTray}
              onChange={(event) => void update('closeToTray', { closeToTray: event.target.checked })}
              disabled={busyKey === 'closeToTray'}
            />
            <span className="toggle-track" aria-hidden="true"><span /></span>
          </label>
        </div>
      </section>

      <section className="preference-section theme-preference-section">
        <div className="preference-copy">
          <span className="preference-icon"><Palette size={18} /></span>
          <div><h2>{text('外观', 'Appearance')}</h2><p>{text('选择界面配色，切换立即生效。', 'Choose an interface palette. Changes apply immediately.')}</p></div>
        </div>
        <div className="theme-options" role="radiogroup" aria-label={text('外观主题', 'Appearance theme')}>
          {THEMES.map((theme) => {
            const selected = settings.theme === theme.id
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`theme-option theme-preview-${theme.id} ${selected ? 'is-selected' : ''}`}
                key={theme.id}
                onClick={() => void update('theme', { theme: theme.id })}
                disabled={busyKey === 'theme'}
              >
                <span className="theme-swatches" aria-hidden="true">
                  <i /><i /><i />
                </span>
                <span className="theme-option-copy">
                  <strong>{text(theme.name[0], theme.name[1])}</strong>
                  <small>{text(theme.detail[0], theme.detail[1])}</small>
                </span>
                {selected && <Check className="theme-selected-icon" size={15} />}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function SettingsTabs({
  active,
  onChange
}: {
  active: 'general' | 'ai'
  onChange: (tab: 'general' | 'ai') => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <div className="settings-tabs" role="tablist" aria-label={text('设置分类', 'Settings categories')}>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'general'}
        className={active === 'general' ? 'is-active' : ''}
        onClick={() => onChange('general')}
      >
        {text('通用', 'General')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'ai'}
        className={active === 'ai' ? 'is-active' : ''}
        onClick={() => onChange('ai')}
      >
        AI
      </button>
    </div>
  )
}

import {
  Activity,
  AppWindow,
  Archive,
  Download,
  History,
  Monitor,
  Settings2,
  Sparkles,
  X
} from 'lucide-react'
import { useState } from 'react'
import type { AgentProvider } from '../../../shared/agent-types'
import type { AppUpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'

export type AgentViewKey = 'agent' | 'health' | 'apps' | 'history' | 'settings'

export function Shell({
  activeView,
  provider,
  healthCount,
  applicationCount,
  appVersion,
  updateState,
  hostname,
  osVersion,
  onNavigate,
  onOpenUpdate,
  children
}: {
  activeView: AgentViewKey
  provider: AgentProvider | null
  healthCount: number
  applicationCount: number
  appVersion: string
  updateState: AppUpdateState | null
  hostname: string
  osVersion: string
  onNavigate: (view: AgentViewKey) => void
  onOpenUpdate: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { text } = useI18n()
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)
  const navigation: Array<{
    id: AgentViewKey
    label: [string, string]
    icon: typeof Sparkles
    count?: number
  }> = [
    { id: 'agent', label: ['Agent', 'Agent'], icon: Sparkles },
    { id: 'health', label: ['电脑体检', 'Health'], icon: Activity, count: healthCount },
    { id: 'apps', label: ['应用管理', 'Applications'], icon: AppWindow, count: applicationCount },
    { id: 'history', label: ['任务记录', 'History'], icon: History },
    { id: 'settings', label: ['设置', 'Settings'], icon: Settings2 }
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Archive size={18} /></span>
          <div className="brand-copy">
            <strong>Memento</strong>
            <span className="brand-version">v{appVersion}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label={text('主要导航', 'Main navigation')}>
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-button ${activeView === item.id ? 'is-active' : ''}`}
                onClick={() => onNavigate(item.id)}
                title={text(...item.label)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{text(...item.label)}</span>
                {item.count !== undefined && item.count > 0 && <small className="nav-badge">{item.count}</small>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="provider-state">
            <span className={`status-dot ${provider?.connectionState === 'connected' ? '' : 'is-muted'}`} />
            <div>
              <strong>{provider ? `${provider.name} · ${provider.model}` : text('尚未配置模型', 'No model configured')}</strong>
              <small>{provider
                ? text(
                    `默认模型 · ${provider.connectionState === 'connected' ? '已连接' : '未测试'}`,
                    `Default · ${provider.connectionState === 'connected' ? 'Connected' : 'Not tested'}`
                  )
                : text('请前往设置', 'Open Settings')}</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="device-status">
            <span><Monitor size={15} /></span>
            <div>
              <strong>{hostname || text('这台 Mac', 'This Mac')}</strong>
              <small>{text(`macOS ${osVersion || '--'} · 本地 Agent`, `macOS ${osVersion || '--'} · Local Agent`)}</small>
            </div>
          </div>
        </header>
        <main className="page-stack">{children}</main>
      </div>
      {updateState?.updateAvailable && updateState.latestVersion &&
        dismissedUpdateVersion !== updateState.latestVersion && (
        <aside className="update-notice" role="status">
          <span><Download size={17} /></span>
          <div>
            <strong>{text(`发现新版本 v${updateState.latestVersion}`, `Memento v${updateState.latestVersion} is available`)}</strong>
            <small>{text('可前往发布页面下载安装', 'Open the release page to download and install it.')}</small>
          </div>
          <div className="update-notice-actions">
            <button type="button" className="secondary-button" onClick={onOpenUpdate}>{text('查看', 'View')}</button>
            <button type="button" className="icon-button" onClick={() => setDismissedUpdateVersion(updateState.latestVersion)} title={text('稍后提醒', 'Remind me later')} aria-label={text('稍后提醒', 'Remind me later')}><X size={15} /></button>
          </div>
        </aside>
      )}
    </div>
  )
}

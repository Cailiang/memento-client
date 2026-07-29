import {
  Activity,
  AppWindow,
  Archive,
  History,
  Monitor,
  ScanLine,
  Settings2,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react'
import type { AgentProvider } from '../../../shared/agent-types'
import { useI18n } from '../i18n'

export type AgentViewKey = 'agent' | 'health' | 'apps' | 'history' | 'settings'

export function Shell({
  activeView,
  provider,
  healthCount,
  applicationCount,
  appVersion,
  hostname,
  osVersion,
  scanBusy,
  onNavigate,
  onQuickScan,
  children
}: {
  activeView: AgentViewKey
  provider: AgentProvider | null
  healthCount: number
  applicationCount: number
  appVersion: string
  hostname: string
  osVersion: string
  scanBusy: boolean
  onNavigate: (view: AgentViewKey) => void
  onQuickScan: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { text } = useI18n()
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
            <span>Local Agent</span>
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
          <div className="topbar-actions">
            <span className="topbar-clock">{new Intl.DateTimeFormat('zh-CN', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }).format(new Date())}</span>
            <span className="topbar-version" title={text('当前版本', 'Current version')}>v{appVersion}</span>
            <button type="button" className="secondary-button" onClick={onQuickScan} disabled={scanBusy}>
              <ScanLine size={16} className={scanBusy ? 'spinner' : ''} />
              <span>{scanBusy ? text('体检中', 'Scanning') : text('快速体检', 'Quick scan')}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => onNavigate('settings')}
              title={text('设置', 'Settings')}
              aria-label={text('打开设置', 'Open settings')}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </header>
        <main className="page-stack">{children}</main>
      </div>
    </div>
  )
}

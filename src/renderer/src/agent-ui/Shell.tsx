import {
  AppWindow,
  Archive,
  HardDrive,
  History,
  LayoutDashboard,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { AgentProvider } from '../../../shared/agent-types'
import type { AppUpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'

export type AgentViewKey = 'overview' | 'health' | 'apps' | 'disk' | 'agent' | 'history' | 'settings'

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
  onInstallUpdate,
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
  onInstallUpdate: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { text } = useI18n()
  const navigation: Array<{
    id: AgentViewKey
    label: [string, string]
    icon: typeof Sparkles
    count?: number
  }> = [
    { id: 'overview', label: ['概览', 'Overview'], icon: LayoutDashboard },
    { id: 'health', label: ['清理', 'Cleanup'], icon: Trash2, count: healthCount },
    { id: 'apps', label: ['应用管理', 'Applications'], icon: AppWindow, count: applicationCount },
    { id: 'disk', label: ['磁盘分析', 'Disk analysis'], icon: HardDrive }
  ]
  const utilities: Array<{
    id: Extract<AgentViewKey, 'agent' | 'history' | 'settings'>
    label: [string, string]
    icon: typeof Sparkles
  }> = [
    { id: 'agent', label: ['AI 助手', 'AI assistant'], icon: Sparkles },
    { id: 'history', label: ['操作记录', 'Activity'], icon: History },
    { id: 'settings', label: ['设置', 'Settings'], icon: Settings2 }
  ]
  const showUpdateControl = updateState && [
    'available',
    'downloading',
    'downloaded',
    'installing'
  ].includes(updateState.phase)
  const updateReady = updateState?.phase === 'downloaded'
  const updateLabel = updateState?.phase === 'downloading'
    ? `${updateState.downloadPercent ?? 0}%`
    : updateState?.phase === 'downloaded'
      ? text('更新', 'Update')
      : updateState?.phase === 'installing'
        ? text('安装中', 'Installing')
        : text('准备中', 'Preparing')
  const updateTitle = updateReady
    ? text('安装新版本并重启 Memento', 'Install the update and restart Memento')
    : updateState?.phase === 'downloading'
      ? text(`正在后台下载新版本 ${updateState.downloadPercent ?? 0}%`, `Downloading the update in the background: ${updateState.downloadPercent ?? 0}%`)
      : updateState?.phase === 'installing'
        ? text('正在安装新版本', 'Installing the update')
        : text('正在准备后台下载', 'Preparing the background download')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Archive size={18} /></span>
          <div className="brand-copy">
            <strong>Memento</strong>
            <span className="brand-meta" role="status" aria-live="polite">
              <span className="brand-version">v{appVersion}</span>
              {showUpdateControl && (
                <button
                  type="button"
                  className="brand-update-button"
                  disabled={!updateReady}
                  onClick={onInstallUpdate}
                  title={updateTitle}
                  aria-label={updateTitle}
                >
                  {updateReady
                    ? <RefreshCw size={11} />
                    : <LoaderCircle className="spinner" size={11} />}
                  <span>{updateLabel}</span>
                </button>
              )}
            </span>
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
          <nav className="utility-nav" aria-label={text('辅助功能', 'Utilities')}>
            {utilities.map((item) => {
              const Icon = item.icon
              return <button key={item.id} type="button" className={`utility-button ${activeView === item.id ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)} title={text(...item.label)} aria-current={activeView === item.id ? 'page' : undefined}><Icon size={15} /><span>{text(...item.label)}</span></button>
            })}
          </nav>
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
              <small>{text(`macOS ${osVersion || '--'} · 本机状态`, `macOS ${osVersion || '--'} · Local Mac`)}</small>
            </div>
          </div>
          <nav className="topbar-tools" aria-label={text('辅助功能', 'Utilities')}>
            {utilities.map((item) => {
              const Icon = item.icon
              return <button key={item.id} type="button" className={`icon-button ${activeView === item.id ? 'is-active' : ''}`} onClick={() => onNavigate(item.id)} title={text(...item.label)} aria-label={text(...item.label)}><Icon size={15} /></button>
            })}
          </nav>
        </header>
        <main className="page-stack">{children}</main>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AppWindow,
  Archive,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  HardDrive,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Power,
  RadioTower,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  SquareTerminal,
  Trash2,
  X
} from 'lucide-react'
import {
  DEFAULT_APP_SETTINGS,
  type AppLanguage,
  type AppSettings,
  type UpdateAppSettingsInput
} from '../../shared/app-settings'
import type {
  ActionResult,
  CandidateAction,
  RiskLevel,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  ScanSection,
  TerminalFinding
} from '../../shared/types'
import { runDemoScan } from './demo'
import { AiAnalysisPanel } from './ai/AiAnalysisPanel'
import { AiSettingsView } from './ai/AiSettingsView'
import { I18nProvider, useI18n } from './i18n'
import { SettingsView } from './SettingsView'
import { applyCompletedCandidateActions, candidateOperations } from './candidate-actions'

type ViewKey = 'overview' | ScanSection | 'ai-settings' | 'settings'
type ScanPhase = 'idle' | 'scanning' | 'ready' | 'error'

interface SelectedOperation {
  id: string
  candidate: ScanCandidate
  action: CandidateAction
}

const NAV_ITEMS: Array<{
  key: ViewKey
  icon: typeof LayoutDashboard
}> = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'services', icon: RadioTower },
  { key: 'storage', icon: HardDrive },
  { key: 'applications', icon: AppWindow },
  { key: 'terminal', icon: SquareTerminal },
  { key: 'ai-settings', icon: BrainCircuit },
  { key: 'settings', icon: Settings2 }
]

function navLabel(key: ViewKey, language: AppLanguage): string {
  const english = language === 'en-US'
  const labels: Record<ViewKey, [string, string]> = {
    overview: ['概览', 'Overview'],
    services: ['后台服务', 'Services'],
    storage: ['存储空间', 'Storage'],
    applications: ['应用版本', 'Applications'],
    terminal: ['终端诊断', 'Terminal'],
    'ai-settings': ['AI 设置', 'AI settings'],
    settings: ['设置', 'Settings']
  }
  return labels[key][english ? 1 : 0]
}

function viewCopy(
  section: ScanSection,
  language: AppLanguage
): { title: string; description: string } {
  const copy: Record<ScanSection, [[string, string], [string, string]]> = {
    services: [
      ['后台服务', 'Services'],
      ['查看持续运行的服务和登录启动项，并逐项判断是否需要保留。', 'Review running services and login items, then decide which ones still need to run.']
    ],
    storage: [
      ['存储空间', 'Storage'],
      ['识别可重建缓存和大体积数据，重要数据只提供分析。', 'Find rebuildable caches and large data sets. Important data is analysis only.']
    ],
    applications: [
      ['应用版本', 'Applications'],
      ['检查重复版本和长期未使用的应用，保留文稿与偏好设置。', 'Review duplicate versions and apps that have not been used recently.']
    ],
    terminal: [
      ['终端诊断', 'Terminal diagnostics'],
      ['测量 shell 启动时间，并定位可能造成同步阻塞的配置。', 'Measure shell startup time and locate configuration that may block startup.']
    ]
  }
  const [title, description] = copy[section]
  const index = language === 'en-US' ? 1 : 0
  return { title: title[index], description: description[index] }
}

function formatBytes(bytes = 0): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${value >= 10 || unitIndex < 2 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function formatUptime(seconds: number, language: AppLanguage): string {
  const days = Math.floor(seconds / 86_400)
  if (days > 0) return language === 'en-US' ? `${days} days` : `${days} 天`
  const hours = Math.max(1, Math.floor(seconds / 3_600))
  return language === 'en-US' ? `${hours} hours` : `${hours} 小时`
}

function riskLabel(risk: RiskLevel, language: AppLanguage): string {
  if (risk === 'safe') return language === 'en-US' ? 'Low risk' : '低风险'
  if (risk === 'protected') return language === 'en-US' ? 'Protected' : '受保护'
  return language === 'en-US' ? 'Review' : '需确认'
}

function operationLabel(operation: CandidateAction, language: AppLanguage): string {
  const english = language === 'en-US'
  switch (operation.kind) {
    case 'stop-brew-service':
    case 'stop-launch-agent':
      return english ? 'Stop' : '停止'
    case 'trash-service-software':
      return english ? 'Uninstall & clean' : '卸载并清理'
    case 'trash-launch-agent-config':
      return english ? 'Remove' : '移除'
    case 'brew-cleanup':
      return english ? 'Clean up' : '清理'
    case 'trash':
      return english ? 'Move to Trash' : '移到废纸篓'
    default:
      return operation.label
  }
}

function selectedOperationId(candidate: ScanCandidate, selected: Set<string>): string | null {
  return candidateOperations(candidate).find((operation) => selected.has(operation.id))?.id ?? null
}

function sectionCount(result: ScanResult | null, section: ScanSection): number {
  if (!result) return 0
  if (section === 'terminal') {
    return result.terminal.findings.filter((item) => item.severity !== 'good').length
  }
  return result.candidates.filter((item) => item.section === section).length
}

function computeHealth(result: ScanResult): number {
  const servicePenalty = result.candidates.filter((item) => item.section === 'services').length * 3
  const applicationPenalty = result.candidates.filter(
    (item) => item.section === 'applications'
  ).length * 2
  const diskRatio = result.system.diskTotalBytes
    ? result.system.diskFreeBytes / result.system.diskTotalBytes
    : 1
  const diskPenalty = diskRatio < 0.08 ? 24 : diskRatio < 0.15 ? 12 : 0
  const shellPenalty =
    (result.terminal.startupMs ?? 0) > 700 ? 14 : (result.terminal.startupMs ?? 0) > 300 ? 6 : 0
  return Math.max(28, Math.min(98, 96 - servicePenalty - applicationPenalty - diskPenalty - shellPenalty))
}

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(window.memento ? null : DEFAULT_APP_SETTINGS)

  useEffect(() => {
    let active = true
    if (window.memento) {
      void window.memento.getAppSettings().then((value) => {
        if (active) setSettings(value)
      })
    }
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.lang = settings.language
  }, [settings])

  const updateSettings = async (input: UpdateAppSettingsInput): Promise<void> => {
    const next = window.memento
      ? await window.memento.updateAppSettings(input)
      : { ...(settings ?? DEFAULT_APP_SETTINGS), ...input }
    setSettings(next)
  }

  if (!settings) return <div className="app-bootstrap" aria-hidden="true" />

  return (
    <I18nProvider language={settings.language}>
      <AppContent settings={settings} onUpdateSettings={updateSettings} />
    </I18nProvider>
  )
}

function AppContent({
  settings,
  onUpdateSettings
}: {
  settings: AppSettings
  onUpdateSettings: (input: UpdateAppSettingsInput) => Promise<void>
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [view, setView] = useState<ViewKey>('overview')
  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [progress, setProgress] = useState<ScanProgress>({
    section: 'system',
    progress: 0,
    message: text('准备扫描', 'Preparing scan')
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [aiRequestedId, setAiRequestedId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [directReview, setDirectReview] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const startedRef = useRef(false)

  const scanNow = useCallback(async () => {
    setPhase('scanning')
    setError(null)
    setSelected(new Set())
    setFocusedId(null)
    try {
      const nextResult = window.memento
        ? await window.memento.scan(language)
        : await runDemoScan(setProgress, language)
      setResult(nextResult)
      setPhase('ready')
    } catch (scanError) {
      setPhase('error')
      setError(scanError instanceof Error ? scanError.message : text('扫描未完成', 'Scan did not complete'))
    }
  }, [language, text])

  useEffect(() => {
    let active = true
    if (window.memento) {
      void window.memento.getVersion().then((version) => {
        if (active) setAppVersion(version)
      })
    }
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.memento?.onScanProgress(setProgress)
    if (!startedRef.current) {
      startedRef.current = true
      void scanNow()
    }
    return unsubscribe
  }, [scanNow])

  const previousLanguage = useRef(language)
  useEffect(() => {
    if (previousLanguage.current === language) return
    previousLanguage.current = language
    void scanNow()
  }, [language, scanNow])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!confirmOpen) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !actionBusy) {
        setConfirmOpen(false)
        if (directReview) setSelected(new Set())
        setDirectReview(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [actionBusy, confirmOpen, directReview])

  const focused = result?.candidates.find((item) => item.id === focusedId) ?? null
  const selectedItems = useMemo<SelectedOperation[]>(
    () =>
      result?.candidates.flatMap((candidate) =>
        candidateOperations(candidate)
          .filter((action) => selected.has(action.id))
          .map((action) => ({ id: action.id, candidate, action }))
      ) ?? [],
    [result, selected]
  )
  const selectedBytes = selectedItems.reduce(
    (sum, item) => sum + (item.action.estimatedBytes ?? item.candidate.sizeBytes ?? 0),
    0
  )

  const toggleSelected = (id: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      const candidate = result?.candidates.find((item) =>
        candidateOperations(item).some((operation) => operation.id === id)
      )
      if (!candidate) return next

      const wasSelected = next.has(id)
      for (const operation of candidateOperations(candidate)) next.delete(operation.id)
      if (!wasSelected) next.add(id)
      return next
    })
  }

  const reviewDirectAction = (id: string): void => {
    setSelected(new Set([id]))
    setFocusedId(null)
    setDirectReview(true)
    setConfirmOpen(true)
  }

  const closeConfirmation = (): void => {
    setConfirmOpen(false)
    if (directReview) setSelected(new Set())
    setDirectReview(false)
  }

  const askAi = (id: string): void => {
    const candidate = result?.candidates.find((item) => item.id === id)
    if (candidate) setView(candidate.section)
    setFocusedId(id)
    setAiRequestedId(id)
  }

  const navigate = (nextView: ViewKey): void => {
    setView(nextView)
    setFocusedId(null)
    setAiRequestedId(null)
  }

  const executeActions = async (): Promise<void> => {
    if (!selectedItems.length) return
    setActionBusy(true)
    let actionResults: ActionResult[]
    try {
      actionResults = window.memento
        ? await window.memento.runActions(selectedItems.map((item) => item.id))
        : await new Promise((resolve) =>
            window.setTimeout(
              () =>
                resolve(
                  selectedItems.map((item) => ({ id: item.id, ok: true, message: text('操作完成', 'Action completed') }))
                ),
              850
            )
          )
      const successfulIds = new Set(actionResults.filter((item) => item.ok).map((item) => item.id))
      const failedCount = actionResults.length - successfulIds.size
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: applyCompletedCandidateActions(current.candidates, successfulIds, language)
            }
          : current
      )
      setSelected(new Set())
      setFocusedId(null)
      setConfirmOpen(false)
      setDirectReview(false)
      const keptStoppedService = selectedItems.some(
        (item) => successfulIds.has(item.id) && item.action.kind.startsWith('stop-')
      )
      setToast(
        failedCount
          ? text(`${successfulIds.size} 项已完成，${failedCount} 项失败，请重新扫描后查看`, `${successfulIds.size} completed and ${failedCount} failed. Scan again to refresh the results.`)
          : keptStoppedService
            ? text('服务已停止并保留在列表中；软件和数据没有删除', 'The service is stopped and remains in the list. Its software and data were not deleted.')
            : text(`${successfulIds.size} 项操作已完成`, `${successfulIds.size} actions completed`)
      )
    } catch (actionError) {
      setToast(actionError instanceof Error ? actionError.message : text('操作失败', 'Action failed'))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} result={result} appVersion={appVersion} onChange={navigate} />
      <div className="workspace">
        <Topbar
          result={result}
          phase={phase}
          isDemo={!window.memento}
          onScan={() => void scanNow()}
        />
        <main className="main-content">
          {view === 'settings' ? (
            <SettingsView settings={settings} onUpdate={onUpdateSettings} />
          ) : view === 'ai-settings' ? (
            <AiSettingsView />
          ) : phase === 'scanning' && !result ? (
            <ScanState progress={progress} />
          ) : phase === 'error' && !result ? (
            <ErrorState message={error ?? text('扫描未完成', 'Scan did not complete')} onRetry={() => void scanNow()} />
          ) : result ? (
            view === 'overview' ? (
              <Overview
                result={result}
                onNavigate={navigate}
                onFocus={(id) => {
                  const candidate = result.candidates.find((item) => item.id === id)
                  if (candidate) setView(candidate.section)
                  setFocusedId(id)
                }}
                onToggle={toggleSelected}
                onReviewAction={reviewDirectAction}
                onAskAi={askAi}
                selected={selected}
              />
            ) : view === 'terminal' ? (
              <TerminalView result={result} onOpenSettings={() => setView('ai-settings')} />
            ) : (
              <CandidateView
                section={view}
                result={result}
                selected={selected}
                focusedId={focusedId}
                onToggle={toggleSelected}
                onFocus={setFocusedId}
                onReviewAction={reviewDirectAction}
                onAskAi={askAi}
              />
            )
          ) : null}
        </main>
      </div>

      {focused && (
        <Inspector
          candidate={focused}
          result={result!}
          selectedOperationId={selectedOperationId(focused, selected)}
          autoPrepareAi={aiRequestedId === focused.id}
          onAiPrepared={() => setAiRequestedId(null)}
          onClose={() => {
            setFocusedId(null)
            setAiRequestedId(null)
          }}
          onToggle={toggleSelected}
          onReviewAction={reviewDirectAction}
          onOpenSettings={() => {
            setFocusedId(null)
            setView('ai-settings')
          }}
        />
      )}

      {selectedItems.length > 0 && !confirmOpen && (
        <ActionDock
          count={selectedItems.length}
          bytes={selectedBytes}
          onClear={() => setSelected(new Set())}
          onReview={() => {
            setDirectReview(false)
            setConfirmOpen(true)
          }}
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          items={selectedItems}
          busy={actionBusy}
          onClose={closeConfirmation}
          onConfirm={() => void executeActions()}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

function Sidebar({
  view,
  result,
  appVersion,
  onChange
}: {
  view: ViewKey
  result: ScanResult | null
  appVersion: string | null
  onChange: (view: ViewKey) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <Archive size={18} />
        </div>
        <div className="brand-copy">
          <span>Memento</span>
          <small>{appVersion ? `v${appVersion}` : text('开发预览', 'Development preview')}</small>
        </div>
      </div>
      <nav className="nav-list" aria-label={text('主要导航', 'Primary navigation')}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const label = navLabel(item.key, language)
          const count = item.key === 'overview' || item.key === 'ai-settings' || item.key === 'settings'
            ? 0
            : sectionCount(result, item.key)
          return (
            <button
              type="button"
              key={item.key}
              className={`nav-item ${view === item.key ? 'is-active' : ''}`}
              onClick={() => onChange(item.key)}
              title={label}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {count > 0 && <span className="nav-count">{count}</span>}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        <ShieldAlert size={16} />
        <p>{text('不会直接永久删除文件。高风险数据仅提供分析。', 'Files are never deleted permanently. High-risk data is analysis only.')}</p>
      </div>
    </aside>
  )
}

function Topbar({
  result,
  phase,
  isDemo,
  onScan
}: {
  result: ScanResult | null
  phase: ScanPhase
  isDemo: boolean
  onScan: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  return (
    <header className="topbar">
      <div className="device-meta">
        <strong>{result?.system.hostname ?? text('这台 Mac', 'This Mac')}</strong>
        <span>
          {result
            ? text(`macOS ${result.system.osVersion}，已运行 ${formatUptime(result.system.uptimeSeconds, language)}`, `macOS ${result.system.osVersion}, up for ${formatUptime(result.system.uptimeSeconds, language)}`)
            : text('正在建立系统快照', 'Building system snapshot')}
        </span>
      </div>
      <div className="topbar-actions">
        {isDemo && <span className="demo-label">{text('浏览器演示数据', 'Browser demo data')}</span>}
        {result && (
          <span className="last-scan">
            <Clock3 size={14} />
            {new Date(result.completedAt).toLocaleTimeString(language, {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        )}
        <button
          type="button"
          className="secondary-button scan-button"
          onClick={onScan}
          disabled={phase === 'scanning'}
        >
          <RefreshCw className={phase === 'scanning' ? 'spinning' : ''} size={16} />
          <span>{phase === 'scanning' ? text('扫描中', 'Scanning') : text('重新扫描', 'Scan again')}</span>
        </button>
      </div>
    </header>
  )
}

function ScanState({ progress }: { progress: ScanProgress }): React.JSX.Element {
  const { text } = useI18n()
  return (
    <section className="scan-state" aria-live="polite">
      <div className="scan-visual" aria-hidden="true">
        <Search size={28} />
        <span className="scan-orbit" />
      </div>
      <h1>{text('正在了解这台 Mac', 'Learning about this Mac')}</h1>
      <p>{progress.message}</p>
      <div className="scan-progress" aria-label={text(`扫描进度 ${progress.progress}%`, `Scan progress ${progress.progress}%`)}>
        <span style={{ transform: `scaleX(${progress.progress / 100})` }} />
      </div>
      <small>{progress.progress}%</small>
    </section>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  const { text } = useI18n()
  return (
    <section className="empty-state">
      <ShieldAlert size={28} />
      <h1>{text('扫描没有完成', 'Scan did not complete')}</h1>
      <p>{message}</p>
      <button type="button" className="primary-button" onClick={onRetry}>
        <RefreshCw size={16} />
        {text('重试', 'Retry')}
      </button>
    </section>
  )
}

function Overview({
  result,
  selected,
  onNavigate,
  onFocus,
  onToggle,
  onReviewAction,
  onAskAi
}: {
  result: ScanResult
  selected: Set<string>
  onNavigate: (view: ViewKey) => void
  onFocus: (id: string) => void
  onToggle: (id: string) => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const score = computeHealth(result)
  const actionable = result.candidates.filter((item) => candidateOperations(item).length > 0)
  const reclaimable = actionable.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const diskUsed = Math.max(0, result.system.diskTotalBytes - result.system.diskFreeBytes)
  const diskPercent = result.system.diskTotalBytes
    ? Math.round((diskUsed / result.system.diskTotalBytes) * 100)
    : 0
  const recommendations = [...actionable]
    .sort((a, b) => {
      if (a.risk === 'safe' && b.risk !== 'safe') return -1
      if (b.risk === 'safe' && a.risk !== 'safe') return 1
      return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0)
    })
    .slice(0, 5)
  const statusText = score >= 82 ? text('状态良好', 'In good shape') : score >= 65 ? text('建议整理', 'Worth reviewing') : text('需要处理', 'Needs attention')

  return (
    <div className="view overview-view">
      <div className="overview-heading">
        <div>
          <span className="section-kicker">{text('本次扫描', 'Current scan')}</span>
          <h1>{statusText}</h1>
          <p>
            {text(`找到 ${actionable.length} 项可操作建议，可释放约 ${formatBytes(reclaimable)}。`, `${actionable.length} actionable items found, with about ${formatBytes(reclaimable)} reclaimable.`)}
          </p>
        </div>
        <div className="health-score" aria-label={text(`系统健康评分 ${score}`, `System health score ${score}`)}>
          <div
            className="score-ring"
            style={{ '--score': `${score * 3.6}deg` } as React.CSSProperties}
          >
            <strong>{score}</strong>
            <span>/ 100</span>
          </div>
          <div>
            <strong>{text('系统状态', 'System status')}</strong>
            <span>{text('基于磁盘、服务与启动耗时', 'Based on disk, services, and startup time')}</span>
          </div>
        </div>
      </div>

      <section className="metric-strip" aria-label={text('系统摘要', 'System summary')}>
        <button type="button" onClick={() => onNavigate('storage')}>
          <HardDrive size={18} />
          <span>{text('磁盘已用', 'Disk used')}</span>
          <strong>{diskPercent}%</strong>
          <small>{text(`剩余 ${formatBytes(result.system.diskFreeBytes)}`, `${formatBytes(result.system.diskFreeBytes)} free`)}</small>
        </button>
        <button type="button" onClick={() => onNavigate('services')}>
          <RadioTower size={18} />
          <span>{text('后台服务', 'Background services')}</span>
          <strong>{sectionCount(result, 'services')}</strong>
          <small>{text('需要逐项确认', 'Review individually')}</small>
        </button>
        <button type="button" onClick={() => onNavigate('applications')}>
          <AppWindow size={18} />
          <span>{text('应用建议', 'Application findings')}</span>
          <strong>{sectionCount(result, 'applications')}</strong>
          <small>{text('重复或长期未用', 'Duplicate or unused')}</small>
        </button>
        <button type="button" onClick={() => onNavigate('terminal')}>
          <SquareTerminal size={18} />
          <span>{text('终端启动', 'Terminal startup')}</span>
          <strong>
            {result.terminal.startupMs === null ? text('未知', 'Unknown') : `${result.terminal.startupMs} ms`}
          </strong>
          <small>{text(`无配置基线 ${result.terminal.baselineMs ?? '未知'} ms`, `Clean baseline ${result.terminal.baselineMs ?? 'unknown'} ms`)}</small>
        </button>
      </section>

      <div className="overview-grid">
        <section className="recommendations">
          <div className="section-heading-row">
            <div>
              <h2>{text('优先建议', 'Priority findings')}</h2>
              <p>{text('低风险项目排在前面，所有操作都需要确认。', 'Lower-risk items appear first. Every action requires confirmation.')}</p>
            </div>
            <span>{text(`${recommendations.length} 项`, `${recommendations.length} items`)}</span>
          </div>
          {recommendations.length ? (
            <div className="candidate-list compact-list">
              {recommendations.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  selectedOperationId={selectedOperationId(candidate, selected)}
                  focused={false}
                  onToggle={onToggle}
                  onFocus={onFocus}
                  onReviewAction={onReviewAction}
                  onAskAi={onAskAi}
                />
              ))}
            </div>
          ) : (
            <InlineEmpty />
          )}
        </section>

        <aside className="diagnostic-summary">
          <div className="terminal-summary-icon">
            <SquareTerminal size={20} />
          </div>
          <h2>{text('终端启动分析', 'Terminal startup analysis')}</h2>
          <strong>
            {result.terminal.startupMs === null ? text('未完成计时', 'Timing unavailable') : `${result.terminal.startupMs} ms`}
          </strong>
          <p>
            {result.terminal.findings.find((item) => item.severity === 'slow')?.title ??
              text('没有发现明显的同步阻塞项', 'No obvious synchronous blocking item was found')}
          </p>
          <button type="button" className="text-button" onClick={() => onNavigate('terminal')}>
            {text('查看诊断', 'View diagnostics')}
            <ChevronRight size={15} />
          </button>
        </aside>
      </div>

      {result.warnings.length > 0 && (
        <div className="warning-band">
          <Info size={17} />
          <span>{result.warnings.join('；')}</span>
        </div>
      )}
    </div>
  )
}

function CandidateView({
  section,
  result,
  selected,
  focusedId,
  onToggle,
  onFocus,
  onReviewAction,
  onAskAi
}: {
  section: Exclude<ScanSection, 'terminal'>
  result: ScanResult
  selected: Set<string>
  focusedId: string | null
  onToggle: (id: string) => void
  onFocus: (id: string) => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const copy = viewCopy(section, language)
  const candidates = result.candidates.filter((item) => item.section === section)
  const actionable = candidates.filter((item) => candidateOperations(item).length > 0)
  const totalBytes = actionable.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const safeIds = actionable
    .filter((item) => item.risk === 'safe')
    .map((item) => candidateOperations(item)[0]?.id)
    .filter((id): id is string => Boolean(id))
  const allSafeSelected = safeIds.length > 0 && safeIds.every((id) => selected.has(id))

  const toggleSafe = (): void => {
    for (const id of safeIds) {
      if (allSafeSelected === selected.has(id)) onToggle(id)
    }
  }

  return (
    <div className="view candidate-view">
      <div className="page-title-row">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className="page-stat">
          <strong>{section === 'services' ? candidates.length : formatBytes(totalBytes)}</strong>
          <span>{section === 'services' ? text('个服务项目', 'service items') : text('可处理空间', 'reclaimable')}</span>
        </div>
      </div>

      {safeIds.length > 0 && (
        <div className="list-toolbar">
          <label className="select-all">
            <input type="checkbox" checked={allSafeSelected} onChange={toggleSafe} />
            <span>{text('选择全部低风险项目', 'Select all low-risk items')}</span>
          </label>
          <span>{text(`${candidates.length} 个扫描结果`, `${candidates.length} scan results`)}</span>
        </div>
      )}

      {candidates.length ? (
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              candidate={candidate}
              selectedOperationId={selectedOperationId(candidate, selected)}
              focused={focusedId === candidate.id}
              onToggle={onToggle}
              onFocus={onFocus}
              onReviewAction={onReviewAction}
              onAskAi={onAskAi}
            />
          ))}
        </div>
      ) : (
        <InlineEmpty />
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  selectedOperationId: activeOperationId,
  focused,
  onToggle,
  onFocus,
  onReviewAction,
  onAskAi
}: {
  candidate: ScanCandidate
  selectedOperationId: string | null
  focused: boolean
  onToggle: (id: string) => void
  onFocus: (id: string) => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const operations = candidateOperations(candidate)
  const primaryOperation = operations[0]
  const selectable = Boolean(primaryOperation)
  const selected = Boolean(activeOperationId)
  return (
    <div
      className={`candidate-row ${focused ? 'is-focused' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onFocus(candidate.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onFocus(candidate.id)
      }}
    >
      <label
        className={`row-checkbox ${!selectable ? 'is-disabled' : ''}`}
        onClick={(event) => event.stopPropagation()}
        title={selectable ? text('选择此项目', 'Select this item') : text('此项目仅供分析', 'This item is analysis only')}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={!selectable}
          onChange={() => {
            const operationId = activeOperationId ?? primaryOperation?.id
            if (operationId) onToggle(operationId)
          }}
        />
        <span aria-hidden="true">{selected && <Check size={13} strokeWidth={2.5} />}</span>
      </label>
      <div className={`candidate-icon icon-${candidate.section}`} aria-hidden="true">
        {candidate.section === 'services' ? (
          <Power size={17} />
        ) : candidate.section === 'storage' ? (
          <Archive size={17} />
        ) : (
          <AppWindow size={17} />
        )}
      </div>
      <div className="candidate-copy">
        <div className="candidate-title-line">
          <strong>{candidate.name}</strong>
          <span className={`risk-label risk-${candidate.risk}`}>{riskLabel(candidate.risk, language)}</span>
        </div>
        <span>{candidate.subtitle}</span>
      </div>
      <div className="candidate-meta">
        <strong>{candidate.sizeBytes ? formatBytes(candidate.sizeBytes) : candidate.status}</strong>
        <span>{candidate.ageDays !== undefined ? text(`${candidate.ageDays} 天`, `${candidate.ageDays} days`) : candidate.status}</span>
      </div>
      <div className="candidate-actions" aria-label={text('快捷操作', 'Quick actions')}>
        {(candidate.section === 'services' || candidate.section === 'storage') && (
          <button
            type="button"
            className="candidate-ai-action"
            onClick={(event) => {
              event.stopPropagation()
              onAskAi(candidate.id)
            }}
            title={text('不确定时询问 AI', 'Ask AI when you are unsure')}
          >
            <BrainCircuit size={14} />
            {text('问 AI', 'Ask AI')}
          </button>
        )}
        {operations.map((operation) => (
          <button
            type="button"
            className={operation.kind.includes('stop') ? 'candidate-direct-action' : 'candidate-direct-action is-destructive'}
            key={operation.id}
            onClick={(event) => {
              event.stopPropagation()
              onReviewAction(operation.id)
            }}
            title={operation.consequence}
          >
            {operation.kind.includes('stop') ? <Power size={14} /> : <Trash2 size={14} />}
            {operationLabel(operation, language)}
          </button>
        ))}
      </div>
      <ChevronRight className="row-chevron" size={16} />
    </div>
  )
}

function TerminalView({
  result,
  onOpenSettings
}: {
  result: ScanResult
  onOpenSettings: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const { terminal } = result
  const copy = viewCopy('terminal', language)
  const configCost =
    terminal.startupMs !== null && terminal.baselineMs !== null
      ? Math.max(0, terminal.startupMs - terminal.baselineMs)
      : null
  const grade =
    terminal.startupMs === null
      ? text('无法计时', 'Timing unavailable')
      : terminal.startupMs > 700
        ? text('启动偏慢', 'Slow startup')
        : terminal.startupMs > 300
          ? text('可以优化', 'Can be improved')
          : text('启动正常', 'Normal startup')

  return (
    <div className="view terminal-view">
      <div className="page-title-row">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <div className="page-stat">
          <strong>{terminal.startupMs === null ? text('未知', 'Unknown') : `${terminal.startupMs} ms`}</strong>
          <span>{grade}</span>
        </div>
      </div>

      <section className="timing-comparison">
        <div className="timing-label">
          <CircleGauge size={20} />
          <div>
            <h2>{text('启动耗时对比', 'Startup timing')}</h2>
            <p>{text('每项运行三次并取中位数，避免偶发波动。', 'Each measurement runs three times and uses the median to reduce noise.')}</p>
          </div>
        </div>
        <div className="timing-values">
          <div>
            <span>{text('无配置基线', 'Clean baseline')}</span>
            <strong>{terminal.baselineMs ?? text('未知', 'Unknown')}<small> ms</small></strong>
          </div>
          <div className="timing-plus">+</div>
          <div className={configCost !== null && configCost > 400 ? 'is-slow' : ''}>
            <span>{text('用户配置', 'User config')}</span>
            <strong>{configCost ?? text('未知', 'Unknown')}<small> ms</small></strong>
          </div>
          <div className="timing-equals">=</div>
          <div className={terminal.startupMs !== null && terminal.startupMs > 700 ? 'is-slow' : ''}>
            <span>{text('完整启动', 'Full startup')}</span>
            <strong>{terminal.startupMs ?? text('未知', 'Unknown')}<small> ms</small></strong>
          </div>
        </div>
      </section>

      <AiAnalysisPanel result={result} onOpenSettings={onOpenSettings} />

      <section className="finding-section">
        <div className="section-heading-row">
          <div>
            <h2>{text('诊断结果', 'Diagnostic findings')}</h2>
            <p>{text('只报告配置特征与位置，不读取或显示其中的密钥内容。', 'Only configuration patterns and locations are reported. Secret values are never read or shown.')}</p>
          </div>
          <span>{text(`${terminal.findings.length} 条`, `${terminal.findings.length} findings`)}</span>
        </div>
        <div className="finding-list">
          {terminal.findings.map((finding) => (
            <TerminalFindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      </section>
    </div>
  )
}

function TerminalFindingRow({ finding }: { finding: TerminalFinding }): React.JSX.Element {
  return (
    <div className="finding-row">
      <div className={`finding-status severity-${finding.severity}`} aria-hidden="true">
        {finding.severity === 'good' ? (
          <CheckCircle2 size={17} />
        ) : finding.severity === 'slow' ? (
          <Activity size={17} />
        ) : (
          <Info size={17} />
        )}
      </div>
      <div className="finding-copy">
        <div>
          <strong>{finding.title}</strong>
          {finding.source && <code>{finding.source}</code>}
        </div>
        <p>{finding.detail}</p>
        {finding.recommendation && <small>{finding.recommendation}</small>}
      </div>
      {finding.durationMs !== undefined && (
        <span className="finding-duration">{finding.durationMs} ms</span>
      )}
    </div>
  )
}

function InlineEmpty(): React.JSX.Element {
  const { text } = useI18n()
  return (
    <div className="inline-empty">
      <CheckCircle2 size={23} />
      <strong>{text('这里已经很干净', 'Nothing to clean up here')}</strong>
      <span>{text('本次扫描没有发现需要处理的项目。', 'This scan found no items that need attention.')}</span>
    </div>
  )
}

function Inspector({
  candidate,
  result,
  selectedOperationId: activeOperationId,
  autoPrepareAi,
  onAiPrepared,
  onClose,
  onToggle,
  onReviewAction,
  onOpenSettings
}: {
  candidate: ScanCandidate
  result: ScanResult
  selectedOperationId: string | null
  autoPrepareAi: boolean
  onAiPrepared: () => void
  onClose: () => void
  onToggle: (id: string) => void
  onReviewAction: (id: string) => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const operations = candidateOperations(candidate)
  return (
    <aside className="inspector" aria-label={text('项目详情', 'Item details')}>
      <div className="inspector-head">
        <span>{text('项目详情', 'Item details')}</span>
        <button type="button" className="icon-button" onClick={onClose} title={text('关闭详情', 'Close details')}>
          <X size={17} />
        </button>
      </div>
      <div className="inspector-body">
        <div className={`inspector-icon icon-${candidate.section}`}>
          {candidate.section === 'services' ? (
            <Power size={21} />
          ) : candidate.section === 'storage' ? (
            <Archive size={21} />
          ) : (
            <AppWindow size={21} />
          )}
        </div>
        <span className={`risk-label risk-${candidate.risk}`}>{riskLabel(candidate.risk, language)}</span>
        <h2>{candidate.name}</h2>
        <code>{candidate.subtitle}</code>
        <p>{candidate.description}</p>

        {(candidate.section === 'services' || candidate.section === 'storage') && (
          <AiAnalysisPanel
            result={result}
            candidate={candidate}
            compact
            autoPrepare={autoPrepareAi}
            onAutoPrepared={onAiPrepared}
            onOpenSettings={onOpenSettings}
          />
        )}

        <dl className="detail-list">
          {candidate.sizeBytes !== undefined && (
            <div>
              <dt>{text('空间占用', 'Space used')}</dt>
              <dd>{formatBytes(candidate.sizeBytes)}</dd>
            </div>
          )}
          <div>
            <dt>{text('当前状态', 'Current status')}</dt>
            <dd>{candidate.status}</dd>
          </div>
          <div>
            <dt>{text('可用操作', 'Available actions')}</dt>
            <dd>{operations.length || text('不适用', 'None')}</dd>
          </div>
        </dl>

        <div className="evidence-block">
          <strong>{text('判断依据', 'Evidence')}</strong>
          {candidate.evidence.map((item) => (
            <span key={item}>
              <Check size={14} />
              {item}
            </span>
          ))}
        </div>

      </div>
      <div className="inspector-action">
        {operations.length ? (
          <>
            <span className="inspector-action-label">{text('选择处理方式', 'Choose an action')}</span>
            {operations.map((operation, index) => {
              const isSelected = activeOperationId === operation.id
              return (
                <button
                  key={operation.id}
                  type="button"
                  className={index === 0 ? 'primary-button' : 'secondary-button'}
                  onClick={() => onReviewAction(operation.id)}
                >
                  {isSelected ? (
                    <Check size={16} />
                  ) : operation.kind.includes('stop') ? (
                    <Power size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {isSelected
                    ? text(`已选择：${operationLabel(operation, language)}`, `Selected: ${operationLabel(operation, language)}`)
                    : operationLabel(operation, language)}
                  {operation.requiresAdmin ? text('（需授权）', ' (authorization required)') : ''}
                </button>
              )
            })}
          </>
        ) : (
          <div className="protected-note">
            <ShieldAlert size={16} />
            <span>
              {candidate.section === 'services' && (candidate.status === '已停止' || candidate.status === 'Stopped')
                ? text('服务已停止，没有其他可用操作；软件和数据仍然保留。', 'The service is stopped with no other available actions. Its software and data remain.')
                : text('此项目包含重要数据，只提供分析。', 'This item contains important data and is analysis only.')}
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}

function ActionDock({
  count,
  bytes,
  onClear,
  onReview
}: {
  count: number
  bytes: number
  onClear: () => void
  onReview: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <div className="action-dock">
      <div>
        <strong>{text(`已选择 ${count} 项`, `${count} selected`)}</strong>
        <span>{bytes > 0 ? text(`预计处理 ${formatBytes(bytes)}`, `About ${formatBytes(bytes)} affected`) : text('将停止所选服务', 'Selected services will be stopped')}</span>
      </div>
      <button type="button" className="dock-clear" onClick={onClear} title={text('清除选择', 'Clear selection')}>
        <X size={17} />
      </button>
      <button type="button" className="primary-button" onClick={onReview}>
        {text('查看并确认', 'Review and confirm')}
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

function ConfirmDialog({
  items,
  busy,
  onClose,
  onConfirm
}: {
  items: SelectedOperation[]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const irreversible = items.some((item) => !item.action.reversible)
  const includesTrashCleanup = items.some(
    (item) =>
      item.action.kind === 'trash-service-software' ||
      item.action.kind === 'trash-launch-agent-config'
  )
  const requiresAdmin = items.some((item) => item.action.requiresAdmin)
  const onlyStops = items.every((item) => item.action.kind.includes('stop'))
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <span>{text('执行前确认', 'Confirm before running')}</span>
            <h2 id="confirm-title">{text(`将处理 ${items.length} 个项目`, `${items.length} items will be processed`)}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} title={text('关闭', 'Close')}>
            <X size={18} />
          </button>
        </div>
        <div className="dialog-items">
          {items.map((item) => (
            <div key={item.id}>
              <span className={`dialog-item-icon icon-${item.candidate.section}`}>
                {item.action.kind.includes('stop') ? <Power size={16} /> : <Trash2 size={16} />}
              </span>
              <div>
                <strong>{item.candidate.name} · {operationLabel(item.action, language)}</strong>
                <p>{item.action.consequence}</p>
              </div>
              <span>
                {item.action.estimatedBytes || item.candidate.sizeBytes
                  ? formatBytes(item.action.estimatedBytes ?? item.candidate.sizeBytes)
                  : item.action.kind.includes('stop')
                    ? text('停止', 'Stop')
                    : text('废纸篓', 'Trash')}
              </span>
            </div>
          ))}
        </div>
        <div className={`dialog-notice ${irreversible ? 'is-warning' : ''}`}>
          {irreversible ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>
            {irreversible
              ? text('部分 Homebrew 清理操作不能通过废纸篓撤销。', 'Some Homebrew cleanup actions cannot be restored from the Trash.')
              : requiresAdmin
                ? text('执行前 macOS 会请求管理员授权；取消授权不会移动任何文件。', 'macOS will request administrator authorization first. Cancelling it will not move any files.')
              : onlyStops
                ? text('只会停止所选服务并取消自动启动，不会删除应用、配置或用户数据；之后仍可重新启动。', 'Only the selected services will stop and automatic startup will be disabled. Apps, settings, and user data remain, and the services can be started again.')
              : includesTrashCleanup
                ? text('会先停止服务，再将扫描时确认的应用、启动项和精确匹配数据移到废纸篓。', 'The service will stop first, then the confirmed app, login item, and exact-match data will move to the Trash.')
                : text('文件会进入 macOS 废纸篓，停止的服务也可以重新启动。', 'Files will move to the macOS Trash, and stopped services can be started again.')}
          </span>
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            {text('取消', 'Cancel')}
          </button>
          <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>
            {busy ? <LoaderCircle className="spinning" size={16} /> : <Check size={16} />}
            {busy ? text('正在处理', 'Processing') : text('确认执行', 'Confirm')}
          </button>
        </div>
      </section>
    </div>
  )
}

export default App

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
  FolderX,
  FolderOpen,
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
  ShieldCheck,
  SquareTerminal,
  Trash2,
  X
} from 'lucide-react'
import {
  candidateWhitelistValue,
  DEFAULT_APP_SETTINGS,
  isCandidateWhitelisted,
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
import {
  AiAnalysisTaskProvider,
  aiAnalysisTaskKey,
  useAiAnalysisTask,
  useAiAnalysisTasks,
  visibleAiAnalysisTasks
} from './ai/AiAnalysisTasks'
import { AiSettingsView } from './ai/AiSettingsView'
import { I18nProvider, useI18n } from './i18n'
import { SettingsView } from './SettingsView'
import { WhitelistPanel } from './WhitelistView'
import {
  applyCompletedCandidateActions,
  candidateOperations,
  selectedCandidateOperations,
  type SelectedCandidateOperation
} from './candidate-actions'

type ViewKey = 'overview' | ScanSection | 'ai-settings' | 'settings'
type ScanPhase = 'idle' | 'scanning' | 'ready' | 'error'

interface AiActivityItem {
  key: string
  name: string
  status: 'running' | 'completed'
  view: Exclude<ViewKey, 'overview' | 'ai-settings' | 'settings'>
  candidateId?: string
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

function viewTitle(section: ScanSection, language: AppLanguage): string {
  const titles: Record<ScanSection, [string, string]> = {
    services: ['后台服务', 'Services'],
    storage: ['存储空间', 'Storage'],
    applications: ['应用版本', 'Applications'],
    terminal: ['终端诊断', 'Terminal diagnostics']
  }
  return titles[section][language === 'en-US' ? 1 : 0]
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
      return english ? 'Remove startup item' : '移除启动项'
    case 'trash-service-directory':
      return english ? 'Delete related directory' : '删除关联目录'
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
      <AiAnalysisTaskProvider>
        <AppContent settings={settings} onUpdateSettings={updateSettings} />
      </AiAnalysisTaskProvider>
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
  const [aiExpandedId, setAiExpandedId] = useState<string | null>(null)
  const [aiRequestedId, setAiRequestedId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [directReview, setDirectReview] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [dismissedAiTaskKeys, setDismissedAiTaskKeys] = useState<Set<string>>(() => new Set())
  const aiTasks = useAiAnalysisTasks()
  const previousAiTaskStatuses = useRef<Map<string, string>>(new Map())
  const startedRef = useRef(false)

  const scanNow = useCallback(async (whitelistOverride?: {
    serviceWhitelist?: readonly string[]
    storageWhitelist?: readonly string[]
  }) => {
    setPhase('scanning')
    setError(null)
    setSelected(new Set())
    try {
      const nextResult = window.memento
        ? await window.memento.scan(language)
        : await runDemoScan(setProgress, language)
      const serviceWhitelist = whitelistOverride?.serviceWhitelist ?? settings.serviceWhitelist
      const storageWhitelist = whitelistOverride?.storageWhitelist ?? settings.storageWhitelist
      setResult({
        ...nextResult,
        candidates: nextResult.candidates.filter(
          (candidate) => !isCandidateWhitelisted(
            candidate,
            serviceWhitelist,
            storageWhitelist
          )
        )
      })
      setPhase('ready')
    } catch (scanError) {
      setPhase('error')
      setError(scanError instanceof Error ? scanError.message : text('扫描未完成', 'Scan did not complete'))
    }
  }, [language, settings.serviceWhitelist, settings.storageWhitelist, text])

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
    setDismissedAiTaskKeys((current) => {
      let next = current
      for (const [key, task] of aiTasks) {
        if ((task.status === 'preparing' || task.status === 'analyzing') && current.has(key)) {
          if (next === current) next = new Set(current)
          next.delete(key)
        }
      }
      return next
    })

    for (const [key, task] of aiTasks) {
      if (task.status !== 'succeeded' || previousAiTaskStatuses.current.get(key) === 'succeeded') {
        continue
      }
      const candidate = result?.candidates.find(
        (item) => aiAnalysisTaskKey(result.scanId, item.id) === key
      )
      const name = candidate?.name ?? text('终端诊断', 'Terminal diagnostics')
      setToast(text(`AI 分析完成：${name}`, `AI analysis completed: ${name}`))
    }
    previousAiTaskStatuses.current = new Map(
      [...aiTasks].map(([key, task]) => [key, task.status])
    )
  }, [aiTasks, result, text])

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

  const aiActivityItems = useMemo<AiActivityItem[]>(() => {
    if (!result) return []
    const terminalKey = aiAnalysisTaskKey(result.scanId)
    const expandedKey = aiExpandedId
      ? aiAnalysisTaskKey(result.scanId, aiExpandedId)
      : null
    const items: AiActivityItem[] = []
    for (const [key, task] of visibleAiAnalysisTasks(aiTasks, dismissedAiTaskKeys)) {
      if (key === expandedKey) continue
      const status = task.status === 'succeeded' ? 'completed' : 'running'
      if (key === terminalKey) {
        items.push({
          key,
          name: text('终端诊断', 'Terminal diagnostics'),
          status,
          view: 'terminal'
        })
        continue
      }
      const candidate = result.candidates.find(
        (item) => aiAnalysisTaskKey(result.scanId, item.id) === key
      )
      if (candidate) {
        items.push({
          key,
          name: candidate.name,
          status,
          view: candidate.section,
          candidateId: candidate.id
        })
      }
    }
    return items
  }, [aiExpandedId, aiTasks, dismissedAiTaskKeys, result, text])
  const selectedItems = useMemo<SelectedCandidateOperation[]>(
    () => selectedCandidateOperations(result?.candidates ?? [], selected),
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
    if (result) {
      const key = aiAnalysisTaskKey(result.scanId, id)
      setDismissedAiTaskKeys((current) => new Set(current).add(key))
    }
    setAiExpandedId(id)
    setAiRequestedId(id)
  }

  const openAiActivity = (item: AiActivityItem): void => {
    if (item.status === 'completed') {
      setDismissedAiTaskKeys((current) => new Set(current).add(item.key))
    }
    setView(item.view)
    setAiExpandedId(item.candidateId ?? null)
  }

  const dismissAiActivity = (key: string): void => {
    setDismissedAiTaskKeys((current) => new Set(current).add(key))
  }

  const revealLocation = (id: string): void => {
    if (!window.memento) {
      setToast(text('请在桌面应用中打开此目录', 'Open this location from the desktop app'))
      return
    }
    void window.memento.revealCandidateLocation(id).catch((reason) => {
      setToast(reason instanceof Error ? reason.message : text('无法打开服务目录', 'Could not open the service location'))
    })
  }

  const whitelistCandidate = async (id: string): Promise<void> => {
    const candidate = result?.candidates.find(
      (item) => item.id === id && (item.section === 'services' || item.section === 'storage')
    )
    if (!candidate) return
    const value = candidateWhitelistValue(candidate)
    if (!value) return
    const currentWhitelist = candidate.section === 'services'
      ? settings.serviceWhitelist
      : settings.storageWhitelist
    if (currentWhitelist.includes(value)) return
    try {
      await onUpdateSettings(candidate.section === 'services'
        ? { serviceWhitelist: [...settings.serviceWhitelist, value] }
        : { storageWhitelist: [...settings.storageWhitelist, value] })
      setResult((current) => current
        ? { ...current, candidates: current.candidates.filter((item) => item.id !== id) }
        : current)
      setSelected((current) => {
        const next = new Set(current)
        for (const operation of candidateOperations(candidate)) next.delete(operation.id)
        return next
      })
      if (aiExpandedId === id) setAiExpandedId(null)
      setToast(text(`已将 ${candidate.name} 加入白名单`, `${candidate.name} was added to the whitelist`))
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : text('无法更新白名单', 'Could not update the whitelist'))
    }
  }

  const updateSettingsFromView = async (input: UpdateAppSettingsInput): Promise<void> => {
    await onUpdateSettings(input)
    if ('serviceWhitelist' in input || 'storageWhitelist' in input) {
      await scanNow({
        serviceWhitelist: input.serviceWhitelist ?? settings.serviceWhitelist,
        storageWhitelist: input.storageWhitelist ?? settings.storageWhitelist
      })
    }
  }

  const navigate = (nextView: ViewKey): void => {
    setView(nextView)
    setAiExpandedId(null)
    setAiRequestedId(null)
    setToast(null)
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
      const failures = actionResults.filter((item) => !item.ok)
      const failedCount = failures.length
      setResult((current) =>
        current
          ? {
              ...current,
              candidates: applyCompletedCandidateActions(current.candidates, successfulIds, language)
            }
          : current
      )
      setSelected(new Set())
      setConfirmOpen(false)
      setDirectReview(false)
      const keptStoppedService = selectedItems.some(
        (item) => successfulIds.has(item.id) && item.action.kind.startsWith('stop-')
      )
      const keptServiceDirectory = selectedItems.some(
        (item) =>
          successfulIds.has(item.id) &&
          item.action.kind === 'trash-launch-agent-config' &&
          candidateOperations(item.candidate).some(
            (operation) =>
              operation.id !== item.id &&
              (operation.kind === 'trash-service-directory' ||
                operation.kind === 'trash-service-software')
          )
      )
      setToast(
        failedCount
          ? failedCount === 1
            ? failures[0].message
            : text(`${successfulIds.size} 项已完成，${failedCount} 项失败：${failures[0].message}`, `${successfulIds.size} completed and ${failedCount} failed: ${failures[0].message}`)
          : keptServiceDirectory
            ? text('启动项已移除，程序目录仍然保留；可以继续选择删除关联目录', 'The startup item was removed and the program directory remains. You can still remove the related directory.')
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
            <SettingsView
              settings={settings}
              onUpdate={updateSettingsFromView}
              onOpenAiSettings={() => setView('ai-settings')}
            />
          ) : view === 'ai-settings' ? (
            <AiSettingsView onOpenGeneralSettings={() => setView('settings')} />
          ) : phase === 'scanning' && !result ? (
            <ScanState progress={progress} />
          ) : phase === 'error' && !result ? (
            <ErrorState message={error ?? text('扫描未完成', 'Scan did not complete')} onRetry={() => void scanNow()} />
          ) : result ? (
            view === 'overview' ? (
              <Overview
                result={result}
                onNavigate={navigate}
                onOpenCandidate={(id) => {
                  const candidate = result.candidates.find((item) => item.id === id)
                  if (candidate) setView(candidate.section)
                }}
                onToggle={toggleSelected}
                onReviewAction={reviewDirectAction}
                onAskAi={askAi}
                onRevealLocation={revealLocation}
                onWhitelist={(id) => void whitelistCandidate(id)}
                selected={selected}
              />
            ) : view === 'terminal' ? (
              <TerminalView result={result} onOpenSettings={() => setView('ai-settings')} />
            ) : (
              <CandidateView
                key={view}
                section={view}
                result={result}
                selected={selected}
                onToggle={toggleSelected}
                onClearSelection={() => setSelected(new Set())}
                onReviewAction={reviewDirectAction}
                onAskAi={askAi}
                onRevealLocation={revealLocation}
                onWhitelist={(id) => void whitelistCandidate(id)}
                settings={settings}
                onUpdateSettings={updateSettingsFromView}
                aiExpandedId={aiExpandedId}
                autoPrepareAiId={aiRequestedId}
                onAiPrepared={() => setAiRequestedId(null)}
                onCloseAi={() => {
                  setAiExpandedId(null)
                  setAiRequestedId(null)
                }}
                onOpenSettings={() => {
                  setAiExpandedId(null)
                  setView('ai-settings')
                }}
              />
            )
          ) : null}
        </main>
      </div>

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

      {aiActivityItems.length > 0 && (
        <AiActivityCenter
          items={aiActivityItems}
          hasActionDock={selectedItems.length > 0 && !confirmOpen}
          onOpen={openAiActivity}
          onDismiss={dismissAiActivity}
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
          const active = view === item.key || (item.key === 'settings' && view === 'ai-settings')
          return (
            <button
              type="button"
              key={item.key}
              className={`nav-item ${active ? 'is-active' : ''}`}
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
  onOpenCandidate,
  onToggle,
  onReviewAction,
  onAskAi,
  onRevealLocation,
  onWhitelist
}: {
  result: ScanResult
  selected: Set<string>
  onNavigate: (view: ViewKey) => void
  onOpenCandidate: (id: string) => void
  onToggle: (id: string) => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
  onRevealLocation: (id: string) => void
  onWhitelist: (id: string) => void
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
                  scanId={result.scanId}
                  candidate={candidate}
                  selectedOperationId={selectedOperationId(candidate, selected)}
                  onToggle={onToggle}
                  onOpen={onOpenCandidate}
                  onReviewAction={onReviewAction}
                  onAskAi={onAskAi}
                  onRevealLocation={onRevealLocation}
                  onWhitelist={onWhitelist}
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
  settings,
  selected,
  aiExpandedId,
  autoPrepareAiId,
  onToggle,
  onClearSelection,
  onReviewAction,
  onAskAi,
  onAiPrepared,
  onCloseAi,
  onOpenSettings,
  onRevealLocation,
  onWhitelist,
  onUpdateSettings
}: {
  section: Exclude<ScanSection, 'terminal'>
  result: ScanResult
  settings: AppSettings
  selected: Set<string>
  aiExpandedId: string | null
  autoPrepareAiId: string | null
  onToggle: (id: string) => void
  onClearSelection: () => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
  onAiPrepared: () => void
  onCloseAi: () => void
  onOpenSettings: () => void
  onRevealLocation: (id: string) => void
  onWhitelist: (id: string) => void
  onUpdateSettings: (input: UpdateAppSettingsInput) => Promise<void>
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [activeTab, setActiveTab] = useState<'results' | 'whitelist'>('results')
  const title = viewTitle(section, language)
  const candidates = result.candidates.filter((item) => item.section === section)
  const supportsWhitelist = section === 'services' || section === 'storage'
  const whitelistValues = section === 'services'
    ? settings.serviceWhitelist
    : section === 'storage'
      ? settings.storageWhitelist
      : []
  const showingWhitelist = supportsWhitelist && activeTab === 'whitelist'
  const actionable = candidates.filter((item) => candidateOperations(item).length > 0)
  const totalBytes = actionable.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const safeIds = section === 'services'
    ? []
    : actionable
        .filter((item) => item.risk === 'safe')
        .map((item) => candidateOperations(item)[0]?.id)
        .filter((id): id is string => Boolean(id))
  const allSafeSelected = safeIds.length > 0 && safeIds.every((id) => selected.has(id))

  const toggleSafe = (): void => {
    for (const id of safeIds) {
      if (allSafeSelected === selected.has(id)) onToggle(id)
    }
  }

  const selectTab = (tab: 'results' | 'whitelist'): void => {
    setActiveTab(tab)
    onClearSelection()
    onCloseAi()
  }

  return (
    <div className="view candidate-view">
      <header className="module-header">
        <h1>{title}</h1>
        {supportsWhitelist ? (
          <div className="module-tabs" role="tablist" aria-label={text(`${title}视图`, `${title} views`)}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'results'}
              className={activeTab === 'results' ? 'is-active' : ''}
              onClick={() => selectTab('results')}
            >
              {text('扫描结果', 'Results')}<span>{candidates.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'whitelist'}
              className={activeTab === 'whitelist' ? 'is-active' : ''}
              onClick={() => selectTab('whitelist')}
            >
              {text('白名单', 'Whitelist')}<span>{whitelistValues.length}</span>
            </button>
          </div>
        ) : (
          <div className="module-stat">
            <strong>{formatBytes(totalBytes)}</strong>
            <span>{text('可处理空间', 'reclaimable')}</span>
          </div>
        )}
      </header>

      {showingWhitelist ? (
        <WhitelistPanel
          kind={section as 'services' | 'storage'}
          values={whitelistValues}
          onUpdate={onUpdateSettings}
        />
      ) : (
        <>
          {safeIds.length > 0 && (
            <div className="list-toolbar">
              <label className="select-all">
                <input type="checkbox" checked={allSafeSelected} onChange={toggleSafe} />
                <span>{text('选择全部低风险项目', 'Select all low-risk items')}</span>
              </label>
            </div>
          )}

          {candidates.length ? (
            <div className="candidate-list">
              {candidates.map((candidate) => (
                <div className={`candidate-entry ${aiExpandedId === candidate.id ? 'has-ai' : ''}`} key={candidate.id}>
                  <CandidateRow
                    scanId={result.scanId}
                    candidate={candidate}
                    selectedOperationId={selectedOperationId(candidate, selected)}
                    aiExpanded={aiExpandedId === candidate.id}
                    onToggle={onToggle}
                    onReviewAction={onReviewAction}
                    onAskAi={(id) => aiExpandedId === id ? onCloseAi() : onAskAi(id)}
                    onRevealLocation={onRevealLocation}
                    onWhitelist={onWhitelist}
                  />
                  {aiExpandedId === candidate.id && (
                    <div className="candidate-ai-inline">
                      <AiAnalysisPanel
                        result={result}
                        candidate={candidate}
                        compact
                        autoPrepare={autoPrepareAiId === candidate.id}
                        onAutoPrepared={onAiPrepared}
                        onOpenSettings={onOpenSettings}
                        onClose={onCloseAi}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <InlineEmpty />
          )}
        </>
      )}
    </div>
  )
}

function CandidateRow({
  scanId,
  candidate,
  selectedOperationId: activeOperationId,
  aiExpanded = false,
  onToggle,
  onOpen,
  onReviewAction,
  onAskAi,
  onRevealLocation,
  onWhitelist
}: {
  scanId: string
  candidate: ScanCandidate
  selectedOperationId: string | null
  aiExpanded?: boolean
  onToggle: (id: string) => void
  onOpen?: (id: string) => void
  onReviewAction: (id: string) => void
  onAskAi: (id: string) => void
  onRevealLocation: (id: string) => void
  onWhitelist: (id: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const { state: aiState } = useAiAnalysisTask(aiAnalysisTaskKey(scanId, candidate.id))
  const operations = candidateOperations(candidate)
  const primaryOperation = operations[0]
  const selectable = Boolean(primaryOperation)
  const selected = Boolean(activeOperationId)
  const aiBusy = aiState.status === 'preparing' || aiState.status === 'analyzing'
  const aiReady = aiState.status === 'succeeded'
  const showSubtitle = candidate.subtitle.trim() !== candidate.location?.trim()
  return (
    <div
      className={`candidate-row ${onOpen ? 'is-link' : ''}`}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(candidate.id) : undefined}
      onKeyDown={onOpen ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(candidate.id)
        }
      } : undefined}
    >
      {candidate.section === 'services' ? (
        <span className="row-checkbox-placeholder" aria-hidden="true" />
      ) : (
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
      )}
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
        <p className="candidate-summary">
          {showSubtitle && <span>{candidate.subtitle}</span>}
          {candidate.description}
        </p>
        {candidate.location && (
          <button
            type="button"
            className="candidate-location-button"
            onClick={(event) => {
              event.stopPropagation()
              onRevealLocation(candidate.id)
            }}
            title={candidate.section === 'storage'
              ? text('在 Finder 中查看存储位置', 'Show storage location in Finder')
              : text('在 Finder 中打开服务目录', 'Open service location in Finder')}
          >
            <FolderOpen size={12} />
            <span>{candidate.location}</span>
          </button>
        )}
      </div>
      <div className="candidate-meta">
        <strong>{candidate.sizeBytes ? formatBytes(candidate.sizeBytes) : candidate.status}</strong>
        <span>{candidate.ageDays !== undefined ? text(`${candidate.ageDays} 天`, `${candidate.ageDays} days`) : candidate.status}</span>
      </div>
      <div className="candidate-actions" aria-label={text('快捷操作', 'Quick actions')}>
        {(candidate.section === 'services' || candidate.section === 'storage') && (
          <button
            type="button"
            className="candidate-whitelist-action"
            onClick={(event) => {
              event.stopPropagation()
              onWhitelist(candidate.id)
            }}
            title={text('加入白名单，后续扫描不再显示', 'Add to whitelist and hide from future scans')}
          >
            <ShieldCheck size={14} />
            {text('加入白名单', 'Whitelist')}
          </button>
        )}
        {(candidate.section === 'services' || candidate.section === 'storage') && (
          <button
            type="button"
            className="candidate-ai-action"
            aria-expanded={aiExpanded}
            onClick={(event) => {
              event.stopPropagation()
              onAskAi(candidate.id)
            }}
            title={text('不确定时询问 AI', 'Ask AI when you are unsure')}
          >
            {aiExpanded
              ? <X size={14} />
              : aiBusy
                ? <LoaderCircle className="spinning" size={14} />
                : aiReady
                  ? <Check size={14} />
                  : <BrainCircuit size={14} />}
            {aiExpanded
              ? aiReady
                ? text('收起结果', 'Hide result')
                : aiBusy
                  ? text('收起分析', 'Hide analysis')
                  : text('收起 AI', 'Hide AI')
              : aiBusy
                ? text('AI 分析中', 'AI analyzing')
                : aiReady
                  ? text('查看 AI 结果', 'View AI result')
                  : text('问 AI', 'Ask AI')}
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
            {operation.kind.includes('stop')
              ? <Power size={14} />
              : operation.kind === 'trash-service-directory'
                ? <FolderX size={14} />
                : <Trash2 size={14} />}
            {operationLabel(operation, language)}
          </button>
        ))}
      </div>
      {onOpen && <ChevronRight className="row-chevron" size={16} />}
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
  const title = viewTitle('terminal', language)
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
          <h1>{title}</h1>
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

function AiActivityCenter({
  items,
  hasActionDock,
  onOpen,
  onDismiss
}: {
  items: AiActivityItem[]
  hasActionDock: boolean
  onOpen: (item: AiActivityItem) => void
  onDismiss: (key: string) => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <section
      className={`ai-activity-center ${hasActionDock ? 'has-action-dock' : ''}`}
      aria-label={text('AI 分析任务', 'AI analysis tasks')}
      aria-live="polite"
    >
      <header>
        <div>
          <BrainCircuit size={15} />
          <strong>{text('AI 分析', 'AI analyses')}</strong>
        </div>
        <span>{text(`${items.length} 项`, `${items.length} ${items.length === 1 ? 'item' : 'items'}`)}</span>
      </header>
      <div className="ai-activity-list">
        {items.map((item) => (
          <div className={`ai-activity-item is-${item.status}`} key={item.key}>
            {item.status === 'running'
              ? <LoaderCircle className="spinning" size={16} />
              : <CheckCircle2 size={16} />}
            <div>
              <strong title={item.name}>{item.name}</strong>
              <span>
                {item.status === 'running'
                  ? text('正在分析', 'Analyzing')
                  : text('分析完成，可查看结果', 'Analysis complete')}
              </span>
            </div>
            <button type="button" className="secondary-button" onClick={() => onOpen(item)}>
              {text('查看', 'View')}<ChevronRight size={14} />
            </button>
            {item.status === 'completed' && (
              <button
                type="button"
                className="icon-button ai-activity-dismiss"
                onClick={() => onDismiss(item.key)}
                title={text('关闭此结果提示', 'Dismiss this result')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function ConfirmDialog({
  items,
  busy,
  onClose,
  onConfirm
}: {
  items: SelectedCandidateOperation[]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const irreversible = items.some((item) => !item.action.reversible)
  const includesSoftwareCleanup = items.some(
    (item) =>
      item.action.kind === 'trash-service-software' ||
      item.action.kind === 'trash-service-directory'
  )
  const includesDirectoryCleanup = items.some(
    (item) => item.action.kind === 'trash-service-directory'
  )
  const requiresAdmin = items.some((item) => item.action.requiresAdmin)
  const onlyStops = items.every((item) => item.action.kind.includes('stop'))
  const onlyStartupItems = items.every(
    (item) => item.action.kind === 'trash-launch-agent-config'
  )
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
                {item.action.kind.includes('stop')
                  ? <Power size={16} />
                  : item.action.kind === 'trash-service-directory'
                    ? <FolderX size={16} />
                    : <Trash2 size={16} />}
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
        <div className={`dialog-notice ${irreversible || includesDirectoryCleanup ? 'is-warning' : ''}`}>
          {irreversible || includesDirectoryCleanup ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>
            {irreversible
              ? text('部分 Homebrew 清理操作不能通过废纸篓撤销。', 'Some Homebrew cleanup actions cannot be restored from the Trash.')
              : includesDirectoryCleanup
                ? text('将删除整个关联目录，包括其中的源码、虚拟环境和数据。请先确认目录内容不再需要；项目会移到废纸篓。', 'The entire related directory, including source code, virtual environments, and data, will be removed. Confirm its contents are no longer needed; the directory will move to the Trash.')
              : onlyStartupItems
                ? requiresAdmin
                  ? text('macOS 会先请求管理员授权。只移除启动配置；程序目录和用户数据都会保留。', 'macOS will request administrator authorization first. Only the startup configuration is removed; the program directory and user data remain.')
                  : text('只移除启动配置；程序目录和用户数据都会保留。', 'Only the startup configuration is removed; the program directory and user data remain.')
              : requiresAdmin
                ? text('执行前 macOS 会请求管理员授权；取消授权不会移动任何文件。', 'macOS will request administrator authorization first. Cancelling it will not move any files.')
              : onlyStops
                ? text('只会停止所选服务并取消自动启动，不会删除应用、配置或用户数据；之后仍可重新启动。', 'Only the selected services will stop and automatic startup will be disabled. Apps, settings, and user data remain, and the services can be started again.')
              : includesSoftwareCleanup
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

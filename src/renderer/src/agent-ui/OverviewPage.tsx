import {
  Activity,
  AppWindow,
  ArrowDownUp,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  BrainCircuit,
  Copy,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  MoreHorizontal,
  Network,
  Pause,
  Power,
  Play,
  RefreshCw,
  Search,
  Skull,
  Zap
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { InstalledApplication, OverviewHealthIssue, OverviewMetrics } from '../../../shared/types'
import type { ApplicationFilter } from './ApplicationsPage'
import { useI18n } from '../i18n'
import { formatBytes, formatStorageBytes } from './utils'
import { ApplicationIcon } from './ApplicationsPage'

const HISTORY_LIMIT = 28

function boundedHistory(current: number[], value: number): number[] {
  return [...current, value].slice(-HISTORY_LIMIT)
}

function Sparkline({
  values,
  maximum = 100,
  secondary = false
}: {
  values: number[]
  maximum?: number
  secondary?: boolean
}): React.JSX.Element {
  const safeValues = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0]
  const ceiling = Math.max(maximum, ...safeValues, 1)
  const points = safeValues.map((value, index) => {
    const x = index / Math.max(1, safeValues.length - 1) * 100
    const y = 31 - Math.min(1, Math.max(0, value / ceiling)) * 27
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  return (
    <svg className={`overview-sparkline ${secondary ? 'is-secondary' : ''}`} viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  )
}

function BarHistory({ values }: { values: number[] }): React.JSX.Element {
  const safeValues = values.length ? values.slice(-10) : [0]
  return <div className="overview-bars" aria-hidden="true">{safeValues.map((value, index) => <i key={index} style={{ height: `${Math.max(8, Math.min(100, value))}%` }} />)}</div>
}

function HealthGauge({ value }: { value: number }): React.JSX.Element {
  const radius = 30
  const circumference = Math.PI * radius
  return (
    <svg className="overview-health-gauge" viewBox="0 0 76 46" role="img" aria-label={`${value}%`}>
      <path d="M 8 39 A 30 30 0 0 1 68 39" pathLength={circumference} className="gauge-track" />
      <path d="M 8 39 A 30 30 0 0 1 68 39" pathLength={circumference} className="gauge-value" strokeDasharray={`${circumference * value / 100} ${circumference}`} />
    </svg>
  )
}

function formatRate(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B/s`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB/s`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB/s`
}

function applicationForProcess(
  process: OverviewMetrics['processes'][number],
  applications: readonly InstalledApplication[]
): InstalledApplication | null {
  const command = process.command.trim()
  return applications.find((application) => (
    command === application.location || command.startsWith(`${application.location}/`)
  )) ?? null
}

function ProcessIcon({ process, application }: {
  process: OverviewMetrics['processes'][number]
  application: InstalledApplication | null
}): React.JSX.Element {
  const [source, setSource] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '120px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    if (!visible || application || !window.memento) return
    void window.memento.getProcessIcon(process.command).then((value) => {
      if (active) setSource(value)
    })
    return () => { active = false }
  }, [application, process.command, visible])

  return <div className="app-logo" ref={ref}>{application
    ? <ApplicationIcon application={application} />
    : source
      ? <img src={source} alt="" />
      : <span className="process-logo-fallback"><Activity size={13} /></span>}</div>
}

function healthIssueLabel(issue: OverviewHealthIssue, language: 'zh-CN' | 'en-US'): string {
  const labels: Record<OverviewHealthIssue, [string, string]> = {
    'cpu-high': ['CPU 持续高负载', 'High CPU load'],
    'memory-high': ['内存占用偏高', 'High memory usage'],
    'disk-low': ['磁盘空间不足', 'Low disk space'],
    'thermal-limited': ['系统正在限制性能', 'Performance is thermally limited'],
    'battery-service': ['电池健康度偏低', 'Battery service recommended'],
    'restart-recommended': ['运行时间较长', 'Long uptime']
  }
  return labels[issue][language === 'en-US' ? 1 : 0]
}

function OverviewSkeleton(): React.JSX.Element {
  return (
    <section className="page content-page overview-page is-active" aria-busy="true">
      <div className="overview-grid overview-skeleton-grid">
        {Array.from({ length: 8 }, (_, index) => <div className="overview-card overview-skeleton" key={index}><i /><i /><i /></div>)}
      </div>
      <div className="overview-process-panel overview-skeleton"><i /><i /><i /></div>
    </section>
  )
}

export function OverviewPage({
  metrics,
  busy,
  paused,
  error,
  applicationsLoading,
  applicationScanProgress,
  onRefresh,
  onPausedChange,
  onAskProcess,
  onCopyProcessName,
  onCopyProcessPid,
  onTerminateProcess,
  applications,
  onOpenApplications,
  onOpenDisk,
  onOpenSystemSettings,
  onOpenActivityMonitorNetwork
}: {
  metrics: OverviewMetrics | null
  busy: boolean
  paused: boolean
  error: string | null
  applicationsLoading: boolean
  applicationScanProgress: number | null
  onRefresh: () => void
  onPausedChange: (paused: boolean) => void
  onAskProcess: (process: OverviewMetrics['processes'][number]) => void
  onCopyProcessName: (name: string) => void
  onCopyProcessPid: (pid: number) => void
  onTerminateProcess: (process: OverviewMetrics['processes'][number], force: boolean) => void
  applications: readonly InstalledApplication[]
  onOpenApplications: (filter?: ApplicationFilter) => void
  onOpenDisk: () => void
  onOpenSystemSettings: (section: 'battery' | 'network') => void
  onOpenActivityMonitorNetwork: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [query, setQuery] = useState('')
  const [processSort, setProcessSort] = useState<'name' | 'cpu' | 'memory'>('cpu')
  const [processSortDirection, setProcessSortDirection] = useState<'asc' | 'desc'>('desc')
  const [processScope, setProcessScope] = useState<'all' | 'user' | 'system'>('all')
  const [openProcessMenu, setOpenProcessMenu] = useState<number | null>(null)
  const [processInteractionActive, setProcessInteractionActive] = useState(false)
  const [heldProcesses, setHeldProcesses] = useState<OverviewMetrics['processes']>([])
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [memoryHistory, setMemoryHistory] = useState<number[]>([])
  const [networkReceivedHistory, setNetworkReceivedHistory] = useState<number[]>([])
  const [networkSentHistory, setNetworkSentHistory] = useState<number[]>([])
  const processPanelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!metrics) return
    setCpuHistory((current) => boundedHistory(current, metrics.cpu.usagePercent))
    setGpuHistory((current) => boundedHistory(current, metrics.gpu.usagePercent ?? 0))
    setMemoryHistory((current) => boundedHistory(current, metrics.memory.usedPercent))
    setNetworkReceivedHistory((current) => boundedHistory(current, metrics.network.receivedBytesPerSecond))
    setNetworkSentHistory((current) => boundedHistory(current, metrics.network.sentBytesPerSecond))
  }, [metrics])

  useEffect(() => {
    if (!processInteractionActive) setHeldProcesses(metrics?.processes ?? [])
  }, [metrics?.processes, processInteractionActive])

  const processes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return [...(processInteractionActive ? heldProcesses : metrics?.processes ?? [])]
      .filter((process) => processScope === 'all' || (processScope === 'system' ? process.isSystem : !process.isSystem))
      .filter((process) => !normalized || `${process.name} ${process.command} ${process.pid}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => {
        const result = processSort === 'name'
          ? left.name.localeCompare(right.name, language)
          : processSort === 'cpu'
            ? right.cpuPercent - left.cpuPercent
            : right.memoryBytes - left.memoryBytes
        return processSortDirection === 'asc' ? -result : result
      })
  }, [heldProcesses, language, metrics?.processes, processInteractionActive, processScope, processSort, processSortDirection, query])

  const beginProcessInteraction = (): void => {
    setHeldProcesses(metrics?.processes ?? [])
    setProcessInteractionActive(true)
  }

  const endProcessInteraction = (): void => {
    setProcessInteractionActive(false)
    setOpenProcessMenu(null)
  }

  const closeProcessMenu = (): void => {
    setOpenProcessMenu(null)
    setProcessInteractionActive(false)
  }

  const chooseProcessSort = (sort: 'name' | 'cpu' | 'memory'): void => {
    if (sort === processSort) {
      setProcessSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setProcessSort(sort)
    setProcessSortDirection(sort === 'name' ? 'asc' : 'desc')
  }

  const focusProcessList = (sort: 'cpu' | 'memory'): void => {
    setProcessSort(sort)
    setProcessSortDirection('desc')
    setProcessScope('all')
    window.requestAnimationFrame(() => processPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const activateCard = (event: React.KeyboardEvent<HTMLElement>, action: () => void): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    action()
  }

  const confirmTerminate = (process: OverviewMetrics['processes'][number], force: boolean): void => {
    if (force && !window.confirm(text(
      `确定强制退出“${process.name}”（PID ${process.pid}）吗？未保存的数据可能丢失。`,
      `Force quit “${process.name}” (PID ${process.pid})? Unsaved data may be lost.`
    ))) return
    closeProcessMenu()
    onTerminateProcess(process, force)
  }

  if (!metrics && busy) return <OverviewSkeleton />
  if (!metrics) {
    return (
      <section className="page content-page overview-page is-active">
        <div className="overview-error-state"><Activity size={24} /><strong>{text('无法读取这台 Mac 的状态', 'Could not read this Mac')}</strong><span>{error ?? text('请重新尝试。', 'Try again.')}</span><button type="button" className="primary-button" onClick={onRefresh}><RefreshCw size={15} />{text('重新读取', 'Retry')}</button></div>
      </section>
    )
  }

  const healthStatus = {
    excellent: text('状态出色', 'Excellent'),
    good: text('状态良好', 'Good'),
    fair: text('值得留意', 'Needs review'),
    attention: text('需要处理', 'Needs attention')
  }[metrics.health.status]
  const healthSummary = metrics.health.issues.length
    ? metrics.health.issues.slice(0, 2).map((issue) => healthIssueLabel(issue, language)).join(' · ')
    : text('当前没有明显的资源压力', 'No significant resource pressure')
  const batteryIcon = metrics.battery.status === 'charging'
    ? BatteryCharging
    : (metrics.battery.percent ?? 0) >= 95 ? BatteryFull : BatteryMedium
  const BatteryIcon = batteryIcon
  const maxNetwork = Math.max(...networkReceivedHistory, ...networkSentHistory, 1024)
  const unusedApplications = applications.filter((application) => application.unused).length
  const updateableApplications = applications.filter((application) => application.updateAvailable).length
  const applicationProgress = applicationsLoading
    ? Math.min(96, Math.max(8, applicationScanProgress ?? 12))
    : 100

  return (
    <section className="page content-page overview-page is-active">
      <div className="overview-command-bar">
        <span>{text('实时状态', 'Live status')} · {paused ? text('已暂停', 'Paused') : text('每 2.5 秒更新', 'Updates every 2.5 seconds')}</span>
        <div>
          <button type="button" className="icon-button" onClick={() => onPausedChange(!paused)} title={paused ? text('继续更新', 'Resume updates') : text('暂停更新', 'Pause updates')} aria-label={paused ? text('继续更新', 'Resume updates') : text('暂停更新', 'Pause updates')}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
          <button type="button" className="icon-button" onClick={onRefresh} disabled={busy} title={text('立即刷新', 'Refresh now')} aria-label={text('立即刷新', 'Refresh now')}><RefreshCw className={busy ? 'spinner' : ''} size={15} /></button>
        </div>
      </div>

      {error && <div className="overview-inline-warning" role="status"><Activity size={14} /><span>{error}</span></div>}

      <div className="overview-grid">
        <article className={`overview-card overview-health-card status-${metrics.health.status}`}>
          <header><span><Gauge size={15} />{text('健康度', 'Health')}</span><small>{metrics.hardware.model}</small></header>
          <div className="overview-health-value"><div><strong>{metrics.health.score}</strong><span>{healthStatus}</span></div><HealthGauge value={metrics.health.score} /></div>
          <p>{healthSummary}</p>
          <footer><span>{metrics.hardware.cpuModel.replace(/\s+CPU.*$/, '')}</span><span>{formatBytes(metrics.memory.totalBytes)}</span><span>macOS {metrics.osVersion}</span></footer>
        </article>

        <article className="overview-card overview-card-link" role="button" tabIndex={0} onClick={() => focusProcessList('cpu')} onKeyDown={(event) => activateCard(event, () => focusProcessList('cpu'))} title={text('查看 CPU 占用最高的进程', 'View processes sorted by CPU usage')}>
          <header><span><Cpu size={15} />CPU</span><small>{metrics.hardware.logicalCores} {text('线程', 'threads')}</small></header>
          <div className="overview-metric-value"><strong>{Math.round(metrics.cpu.usagePercent)}</strong><em>%</em></div>
          <BarHistory values={cpuHistory} />
          <footer><span>{text('负载', 'Load')} {metrics.cpu.loadAverage.map((value) => value.toFixed(2)).join(' / ')}</span><span className="overview-card-link-label">{text('查看进程', 'View processes')}</span></footer>
        </article>

        <article className="overview-card">
          <header><span><Activity size={15} />GPU</span><small>{metrics.gpu.name ? text('图形处理器', 'Graphics') : text('不可用', 'Unavailable')}</small></header>
          <div className="overview-metric-value"><strong>{metrics.gpu.usagePercent === null ? '--' : Math.round(metrics.gpu.usagePercent)}</strong>{metrics.gpu.usagePercent !== null && <em>%</em>}</div>
          <Sparkline values={gpuHistory} />
          <footer><span>{metrics.gpu.name ?? text('macOS 未公开当前利用率', 'Utilization is not exposed by macOS')}</span></footer>
        </article>

        <article className="overview-card overview-card-link" role="button" tabIndex={0} onClick={() => focusProcessList('memory')} onKeyDown={(event) => activateCard(event, () => focusProcessList('memory'))} title={text('查看内存占用最高的进程', 'View processes sorted by memory usage')}>
          <header><span><MemoryStick size={15} />{text('内存', 'Memory')}</span><small>{text('可用', 'Available')} {formatBytes(metrics.memory.availableBytes)}</small></header>
          <div className="overview-metric-value"><strong>{Math.round(metrics.memory.usedPercent)}</strong><em>%</em></div>
          <Sparkline values={memoryHistory} />
          <footer><span>{formatBytes(metrics.memory.usedBytes)} / {formatBytes(metrics.memory.totalBytes)}</span><span className="overview-card-link-label">{text('查看进程', 'View processes')}</span></footer>
        </article>

        <article className="overview-card overview-card-link" role="button" tabIndex={0} onClick={() => onOpenSystemSettings('battery')} onKeyDown={(event) => activateCard(event, () => onOpenSystemSettings('battery'))} title={text('打开系统电池设置', 'Open battery settings')}>
          <header><span><BatteryIcon size={15} />{text('电池', 'Battery')}</span><small>{metrics.battery.available ? (metrics.battery.powerSource === 'ac' ? text('电源供电', 'AC power') : text('电池供电', 'On battery')) : text('未检测到', 'Not detected')}</small></header>
          <div className="overview-metric-value"><strong>{metrics.battery.percent ?? '--'}</strong>{metrics.battery.percent !== null && <em>%</em>}</div>
          <div className="overview-progress"><i style={{ width: `${metrics.battery.percent ?? 0}%` }} /></div>
          <footer><span>{metrics.battery.healthPercent !== null ? text(`健康度 ${Math.round(metrics.battery.healthPercent)}%`, `Health ${Math.round(metrics.battery.healthPercent)}%`) : text('健康度不可用', 'Health unavailable')}</span><span className="overview-card-link-label">{text('系统设置', 'System Settings')}</span></footer>
        </article>

        <article className="overview-card overview-card-link" role="button" tabIndex={0} onClick={onOpenDisk} onKeyDown={(event) => activateCard(event, onOpenDisk)} title={text('打开磁盘分析', 'Open disk analysis')}>
          <header><span><HardDrive size={15} />{text('磁盘', 'Disk')}</span><small>{formatStorageBytes(metrics.disk.totalBytes)}</small></header>
          <div className="overview-metric-value"><strong>{formatStorageBytes(metrics.disk.availableBytes)}</strong><em>{text('可用', 'available')}</em></div>
          <div className="overview-progress"><i style={{ width: `${metrics.disk.usedPercent}%` }} /></div>
          <footer><span>{text('含 macOS 可清除空间', 'Includes macOS purgeable space')}</span><span className="overview-card-link-label">{text('打开分析', 'Open analysis')}</span></footer>
        </article>

        <article className="overview-card overview-card-link" role="button" tabIndex={0} onClick={onOpenActivityMonitorNetwork} onKeyDown={(event) => activateCard(event, onOpenActivityMonitorNetwork)} title={text('打开活动监视器的网络面板', 'Open Activity Monitor Network')}>
          <header><span><Network size={15} />{text('网络', 'Network')}</span><small>{metrics.network.interfaceName ?? text('未连接', 'Offline')}</small></header>
          <div className="overview-network-values"><strong>↓ {formatRate(metrics.network.receivedBytesPerSecond)}</strong><span>↑ {formatRate(metrics.network.sentBytesPerSecond)}</span></div>
          <Sparkline values={networkReceivedHistory} maximum={maxNetwork} />
          <Sparkline values={networkSentHistory} maximum={maxNetwork} secondary />
          <footer><span>{text('当前接口', 'Interface')} · {metrics.network.interfaceName ?? '--'}</span><span className="overview-card-link-label">{text('活动监视器', 'Activity Monitor')}</span></footer>
        </article>

        <article className="overview-card overview-card-link overview-application-card" role="button" tabIndex={0} onClick={() => onOpenApplications()} onKeyDown={(event) => activateCard(event, () => onOpenApplications())} title={text('打开应用管理', 'Open Applications')}>
          <header><span><AppWindow size={15} />{text('应用分析', 'Application analysis')}</span><small>{text('点击查看', 'Open list')}</small></header>
          <div className="overview-application-total"><strong>{applicationsLoading ? '—' : applications.length}</strong><span>{applicationsLoading ? text('扫描中', 'Scanning') : text('已安装应用', 'installed apps')}</span></div>
          {applicationsLoading && <div className="overview-application-loading" role="progressbar" aria-label={text('应用扫描进度', 'Application scan progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={applicationProgress}><span style={{ width: `${applicationProgress}%` }} /></div>}
          <div className="overview-application-stats">
            <button type="button" className="overview-application-stat" onClick={(event) => { event.stopPropagation(); onOpenApplications('unused') }} disabled={applicationsLoading} title={text('查看不常用应用', 'View unused applications')}><strong>{applicationsLoading ? '—' : unusedApplications}</strong>{text('不常用', 'unused')}</button>
            <button type="button" className="overview-application-stat" onClick={(event) => { event.stopPropagation(); onOpenApplications('updates') }} disabled={applicationsLoading} title={text('查看需要更新的应用', 'View applications with updates')}><strong>{applicationsLoading ? '—' : updateableApplications}</strong>{text('需要更新', 'updates')}</button>
          </div>
          <footer><span>{text('点击数字可直接筛选', 'Click a number to filter')}</span><span className="overview-card-link-label">{text('应用管理', 'Applications')}</span></footer>
        </article>
      </div>

      <section
        ref={processPanelRef}
        className="overview-process-panel"
        onPointerEnter={beginProcessInteraction}
        onPointerLeave={endProcessInteraction}
        onFocusCapture={beginProcessInteraction}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) endProcessInteraction()
        }}
      >
        <header>
          <div className="overview-process-title"><div><strong>{text('进程列表', 'Processes')}</strong><span>{text(`${metrics.processes.length} 个进程样本`, `${metrics.processes.length} sampled processes`)}</span></div><div className="process-scope-filter" role="tablist" aria-label={text('进程类型', 'Process type')}>
            {(['all', 'user', 'system'] as const).map((scope) => <button key={scope} type="button" role="tab" aria-selected={processScope === scope} className={processScope === scope ? 'is-active' : ''} onClick={() => setProcessScope(scope)}>{scope === 'all' ? text('全部', 'All') : scope === 'user' ? text('用户', 'User') : text('系统', 'System')}</button>)}
          </div></div>
          <label className="search-field overview-process-search"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('搜索名称或 PID', 'Search name or PID')} aria-label={text('搜索进程', 'Search processes')} /></label>
        </header>
        <div className="overview-process-head">
          <button type="button" className={processSort === 'name' ? 'is-active' : ''} onClick={() => chooseProcessSort('name')} aria-sort={processSort === 'name' ? processSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>{text('进程', 'Process')}<ArrowDownUp size={11} /></button>
          <span>PID</span>
          <button type="button" className={processSort === 'cpu' ? 'is-active' : ''} onClick={() => chooseProcessSort('cpu')} aria-sort={processSort === 'cpu' ? processSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>CPU<ArrowDownUp size={11} /></button>
          <button type="button" className={processSort === 'memory' ? 'is-active' : ''} onClick={() => chooseProcessSort('memory')} aria-sort={processSort === 'memory' ? processSortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>{text('内存', 'Memory')}<ArrowDownUp size={11} /></button>
          <span aria-hidden="true" />
        </div>
        <div className="overview-process-list">
          {processes.length ? processes.map((process) => {
            const processApplication = applicationForProcess(process, applications)
            return <div className={`overview-process-row ${process.isSystem ? 'is-system' : 'is-user'}`} key={process.pid}>
              <span className="overview-process-name"><span className="process-logo"><ProcessIcon process={process} application={processApplication} /></span><strong>{process.name}</strong><small>{process.command} · <span className="process-scope-label">{process.isSystem ? text('系统进程', 'System process') : text('用户进程', 'User process')}</span></small></span>
              <span>{process.pid}</span>
              <span className={process.cpuPercent >= 80 ? 'is-hot' : ''}><i className="process-meter"><b style={{ width: `${Math.min(100, process.cpuPercent)}%` }} /></i><strong>{process.cpuPercent.toFixed(1)}%</strong></span>
              <span><strong>{formatBytes(process.memoryBytes)}</strong><small>{process.memoryPercent.toFixed(1)}%</small></span>
              <span className="overview-process-actions">
                <button type="button" className="icon-button process-menu-button" onClick={() => { beginProcessInteraction(); setOpenProcessMenu((current) => current === process.pid ? null : process.pid) }} title={text('进程操作', 'Process actions')} aria-label={text(`打开 ${process.name} 的操作`, `Open actions for ${process.name}`)} aria-expanded={openProcessMenu === process.pid}><MoreHorizontal size={15} /></button>
                {openProcessMenu === process.pid && <span className="process-action-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { closeProcessMenu(); onAskProcess(process) }}><BrainCircuit size={13} />{text('询问 AI', 'Ask AI')}</button>
                  <button type="button" role="menuitem" onClick={() => { closeProcessMenu(); onCopyProcessName(process.name) }}><Copy size={13} />{text('复制进程名称', 'Copy name')}</button>
                  <button type="button" role="menuitem" onClick={() => { closeProcessMenu(); onCopyProcessPid(process.pid) }}><Copy size={13} />{text('复制进程 PID', 'Copy PID')}</button>
                  {!process.isSystem && <>
                    <button type="button" role="menuitem" onClick={() => confirmTerminate(process, false)}><Power size={13} />{text('退出进程', 'Quit process')}</button>
                    <button type="button" role="menuitem" className="is-danger" onClick={() => confirmTerminate(process, true)}><Zap size={13} />{text('强制退出', 'Force quit')}</button>
                  </>}
                  {process.isSystem && <span className="process-action-note"><Skull size={12} />{text('系统进程不可退出', 'System process protected')}</span>}
                </span>}
              </span>
            </div>
          }) : <div className="overview-process-empty">{text('没有匹配的进程', 'No matching processes')}</div>}
        </div>
      </section>
    </section>
  )
}

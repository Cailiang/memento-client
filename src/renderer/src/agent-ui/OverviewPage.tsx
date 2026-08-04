import {
  Activity,
  BatteryCharging,
  BatteryFull,
  BatteryMedium,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Network,
  Pause,
  Play,
  RefreshCw,
  Search,
  ThermometerSun
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { OverviewHealthIssue, OverviewMetrics } from '../../../shared/types'
import { useI18n } from '../i18n'
import { formatBytes } from './utils'

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

function formatUptime(seconds: number, language: 'zh-CN' | 'en-US'): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor(seconds % 86_400 / 3_600)
  const minutes = Math.floor(seconds % 3_600 / 60)
  if (days) return language === 'en-US' ? `${days}d ${hours}h` : `${days} 天 ${hours} 小时`
  if (hours) return language === 'en-US' ? `${hours}h ${minutes}m` : `${hours} 小时 ${minutes} 分钟`
  return language === 'en-US' ? `${minutes}m` : `${minutes} 分钟`
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
  onRefresh,
  onPausedChange
}: {
  metrics: OverviewMetrics | null
  busy: boolean
  paused: boolean
  error: string | null
  onRefresh: () => void
  onPausedChange: (paused: boolean) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [query, setQuery] = useState('')
  const [processSort, setProcessSort] = useState<'cpu' | 'memory'>('cpu')
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [gpuHistory, setGpuHistory] = useState<number[]>([])
  const [memoryHistory, setMemoryHistory] = useState<number[]>([])
  const [networkReceivedHistory, setNetworkReceivedHistory] = useState<number[]>([])
  const [networkSentHistory, setNetworkSentHistory] = useState<number[]>([])

  useEffect(() => {
    if (!metrics) return
    setCpuHistory((current) => boundedHistory(current, metrics.cpu.usagePercent))
    setGpuHistory((current) => boundedHistory(current, metrics.gpu.usagePercent ?? 0))
    setMemoryHistory((current) => boundedHistory(current, metrics.memory.usedPercent))
    setNetworkReceivedHistory((current) => boundedHistory(current, metrics.network.receivedBytesPerSecond))
    setNetworkSentHistory((current) => boundedHistory(current, metrics.network.sentBytesPerSecond))
  }, [metrics])

  const processes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return [...(metrics?.processes ?? [])]
      .filter((process) => !normalized || `${process.name} ${process.command} ${process.pid}`.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => processSort === 'cpu'
        ? right.cpuPercent - left.cpuPercent
        : right.memoryBytes - left.memoryBytes)
  }, [metrics?.processes, processSort, query])

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

        <article className="overview-card">
          <header><span><Cpu size={15} />CPU</span><small>{metrics.hardware.logicalCores} {text('线程', 'threads')}</small></header>
          <div className="overview-metric-value"><strong>{Math.round(metrics.cpu.usagePercent)}</strong><em>%</em></div>
          <BarHistory values={cpuHistory} />
          <footer><span>{text('负载', 'Load')} {metrics.cpu.loadAverage.map((value) => value.toFixed(2)).join(' / ')}</span></footer>
        </article>

        <article className="overview-card">
          <header><span><Activity size={15} />GPU</span><small>{metrics.gpu.name ? text('图形处理器', 'Graphics') : text('不可用', 'Unavailable')}</small></header>
          <div className="overview-metric-value"><strong>{metrics.gpu.usagePercent === null ? '--' : Math.round(metrics.gpu.usagePercent)}</strong>{metrics.gpu.usagePercent !== null && <em>%</em>}</div>
          <Sparkline values={gpuHistory} />
          <footer><span>{metrics.gpu.name ?? text('macOS 未公开当前利用率', 'Utilization is not exposed by macOS')}</span></footer>
        </article>

        <article className="overview-card">
          <header><span><MemoryStick size={15} />{text('内存', 'Memory')}</span><small>{text('可用', 'Available')} {formatBytes(metrics.memory.availableBytes)}</small></header>
          <div className="overview-metric-value"><strong>{Math.round(metrics.memory.usedPercent)}</strong><em>%</em></div>
          <Sparkline values={memoryHistory} />
          <footer><span>{formatBytes(metrics.memory.usedBytes)} / {formatBytes(metrics.memory.totalBytes)}</span></footer>
        </article>

        <article className="overview-card">
          <header><span><BatteryIcon size={15} />{text('电池', 'Battery')}</span><small>{metrics.battery.available ? (metrics.battery.powerSource === 'ac' ? text('电源供电', 'AC power') : text('电池供电', 'On battery')) : text('未检测到', 'Not detected')}</small></header>
          <div className="overview-metric-value"><strong>{metrics.battery.percent ?? '--'}</strong>{metrics.battery.percent !== null && <em>%</em>}</div>
          <div className="overview-progress"><i style={{ width: `${metrics.battery.percent ?? 0}%` }} /></div>
          <footer><span>{metrics.battery.healthPercent !== null ? text(`健康度 ${Math.round(metrics.battery.healthPercent)}%`, `Health ${Math.round(metrics.battery.healthPercent)}%`) : text('健康度不可用', 'Health unavailable')}</span>{metrics.battery.cycleCount !== null && <span>{metrics.battery.cycleCount} {text('次循环', 'cycles')}</span>}</footer>
        </article>

        <article className="overview-card">
          <header><span><HardDrive size={15} />{text('磁盘', 'Disk')}</span><small>{formatBytes(metrics.disk.totalBytes)}</small></header>
          <div className="overview-metric-value"><strong>{formatBytes(metrics.disk.freeBytes)}</strong><em>{text('可用', 'free')}</em></div>
          <div className="overview-progress"><i style={{ width: `${metrics.disk.usedPercent}%` }} /></div>
          <footer><span>{text('已用', 'Used')} {formatBytes(metrics.disk.usedBytes)} · {Math.round(metrics.disk.usedPercent)}%</span></footer>
        </article>

        <article className="overview-card">
          <header><span><Network size={15} />{text('网络', 'Network')}</span><small>{metrics.network.interfaceName ?? text('未连接', 'Offline')}</small></header>
          <div className="overview-network-values"><strong>↓ {formatRate(metrics.network.receivedBytesPerSecond)}</strong><span>↑ {formatRate(metrics.network.sentBytesPerSecond)}</span></div>
          <Sparkline values={networkReceivedHistory} maximum={maxNetwork} />
          <Sparkline values={networkSentHistory} maximum={maxNetwork} secondary />
          <footer><span>{text('当前接口', 'Interface')} · {metrics.network.interfaceName ?? '--'}</span></footer>
        </article>

        <article className="overview-card">
          <header><span><ThermometerSun size={15} />{text('性能状态', 'Performance')}</span><small>{metrics.thermal.state === 'limited' ? text('受限', 'Limited') : metrics.thermal.state === 'normal' ? text('正常', 'Normal') : text('不可用', 'Unavailable')}</small></header>
          <div className="overview-metric-value"><strong>{metrics.thermal.cpuSpeedLimitPercent ?? '--'}</strong>{metrics.thermal.cpuSpeedLimitPercent !== null && <em>%</em>}</div>
          <div className="overview-progress"><i style={{ width: `${metrics.thermal.cpuSpeedLimitPercent ?? 0}%` }} /></div>
          <footer><span>{text('已运行', 'Uptime')} {formatUptime(metrics.uptimeSeconds, language)}</span><span>{metrics.thermal.availableCpus ?? metrics.hardware.logicalCores} {text('线程可用', 'threads available')}</span></footer>
        </article>
      </div>

      <section className="overview-process-panel">
        <header>
          <div><strong>{text('高占用进程', 'Top processes')}</strong><span>{text(`${metrics.processes.length} 个进程样本`, `${metrics.processes.length} sampled processes`)}</span></div>
          <label className="search-field overview-process-search"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('搜索名称或 PID', 'Search name or PID')} aria-label={text('搜索进程', 'Search processes')} /></label>
        </header>
        <div className="overview-process-head"><span>{text('进程', 'Process')}</span><span>PID</span><button type="button" className={processSort === 'cpu' ? 'is-active' : ''} onClick={() => setProcessSort('cpu')}>CPU</button><button type="button" className={processSort === 'memory' ? 'is-active' : ''} onClick={() => setProcessSort('memory')}>{text('内存', 'Memory')}</button></div>
        <div className="overview-process-list">
          {processes.length ? processes.map((process) => (
            <div className="overview-process-row" key={process.pid}>
              <span className="overview-process-name"><i><Activity size={13} /></i><strong>{process.name}</strong><small>{process.command}</small></span>
              <span>{process.pid}</span>
              <span className={process.cpuPercent >= 80 ? 'is-hot' : ''}><i className="process-meter"><b style={{ width: `${Math.min(100, process.cpuPercent)}%` }} /></i><strong>{process.cpuPercent.toFixed(1)}%</strong></span>
              <span><strong>{formatBytes(process.memoryBytes)}</strong><small>{process.memoryPercent.toFixed(1)}%</small></span>
            </div>
          )) : <div className="overview-process-empty">{text('没有匹配的进程', 'No matching processes')}</div>}
        </div>
      </section>
    </section>
  )
}

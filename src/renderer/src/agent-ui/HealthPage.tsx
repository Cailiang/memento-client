import {
  Activity,
  Archive,
  Box,
  Ellipsis,
  EyeOff,
  Hammer,
  LoaderCircle,
  Package,
  RadioTower,
  RefreshCw,
  Route,
  Sparkles,
  Timer
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type { CandidateOperation, ScanCandidate, ScanProgress, ScanResult } from '../../../shared/types'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime } from './utils'

type HealthTab = 'storage' | 'services' | 'terminal'

function operations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ id: candidate.id, ...candidate.action }] : []
}

function candidatePrompt(candidate: ScanCandidate): string {
  const operation = operations(candidate)[0]
  return operation
    ? `检查 ${candidate.name}，说明影响，并把“${operation.label}”加入需要我确认的处理计划`
    : `深入分析 ${candidate.name}，告诉我是否需要处理`
}

function CandidateRow({
  candidate,
  onAgentPrompt,
  onIgnore
}: {
  candidate: ScanCandidate
  onAgentPrompt: (prompt: string) => void
  onIgnore: (candidate: ScanCandidate) => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const operation = operations(candidate)[0]
  const Icon = candidate.section === 'services'
    ? RadioTower
    : candidate.name.toLowerCase().includes('xcode')
      ? Hammer
      : candidate.name.toLowerCase().includes('cache') || candidate.name.includes('缓存')
        ? Package
        : Box

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  return (
    <div className="data-row">
      <span className="row-icon"><Icon size={16} /></span>
      <div className="row-main"><strong>{candidate.name}</strong><small>{candidate.description}</small></div>
      <div className="row-meta"><strong>{candidate.sizeBytes ? formatBytes(candidate.sizeBytes) : candidate.status}</strong><small>{candidate.ageDays !== undefined ? text(`${candidate.ageDays} 天`, `${candidate.ageDays} days`) : candidate.subtitle}</small></div>
      <div className="row-meta"><strong>{candidate.risk === 'safe' ? text('可安全处理', 'Safe to handle') : candidate.risk === 'protected' ? text('仅分析', 'Analysis only') : text('需要确认', 'Needs review')}</strong><small>{operation ? operation.consequence : candidate.status}</small></div>
      <div className="row-actions">
        <button type="button" className={operation ? 'secondary-button' : 'quiet-button'} onClick={() => onAgentPrompt(candidatePrompt(candidate))}>
          {operation ? text('处理', 'Handle') : text('问 Agent', 'Ask Agent')}
        </button>
        <div className="row-menu" ref={menuRef}>
          <button type="button" className="icon-button" onClick={() => setMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={menuOpen} title={text('更多操作', 'More actions')} aria-label={text(`${candidate.name}的更多操作`, `More actions for ${candidate.name}`)}>
            <Ellipsis size={16} />
          </button>
          {menuOpen && (
            <div className="row-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onIgnore(candidate) }}>
                <EyeOff size={14} />{text('忽略此项', 'Ignore item')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function HealthPage({
  result,
  settings,
  scanBusy,
  progress,
  initialTab,
  onScan,
  onAgentPrompt,
  onIgnore,
  onManageIgnored
}: {
  result: ScanResult | null
  settings: AppSettings
  scanBusy: boolean
  progress: ScanProgress | null
  initialTab?: HealthTab
  onScan: () => void
  onAgentPrompt: (prompt: string) => void
  onIgnore: (candidate: ScanCandidate) => void
  onManageIgnored: (kind: 'storage' | 'services') => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [tab, setTab] = useState<HealthTab>(initialTab ?? 'storage')
  const storage = result?.candidates.filter((item) => item.section === 'storage') ?? []
  const services = result?.candidates.filter((item) => item.section === 'services') ?? []
  const reclaimable = storage.reduce((sum, item) => sum + (operations(item).length ? item.sizeBytes ?? 0 : 0), 0)
  const terminalFindings = result?.terminal.findings ?? []
  const terminalFixes = terminalFindings.filter((item) => item.fix)
  const score = Math.max(45, 100 - storage.length * 2 - services.filter((item) => operations(item).length).length * 3 - terminalFixes.length * 2)
  const findingCount = storage.length + services.filter((item) => operations(item).length).length + terminalFixes.length

  return (
    <section className="page content-page is-active">
      <div className="page-command-bar">
        <span className="page-command-summary">{result
          ? text(`最后检查于 ${formatDateTime(result.completedAt, language)}，${findingCount} 项内容值得处理。`, `Last checked ${formatDateTime(result.completedAt, language)}. ${findingCount} items need attention.`)
          : text('尚未完成体检', 'No health scan yet')}</span>
        <div className="page-command-actions">
          <button type="button" className="secondary-button" onClick={() => onAgentPrompt(text('全面检查电脑状态并准备处理计划', 'Inspect the computer and prepare a plan'))}>
            <Sparkles size={16} />{text('交给 Agent', 'Ask Agent')}
          </button>
          <button type="button" className="primary-button" onClick={onScan} disabled={scanBusy}>
            {scanBusy ? <LoaderCircle className="spinner" size={16} /> : <RefreshCw size={16} />}
            {scanBusy ? text('体检中', 'Scanning') : text('重新体检', 'Scan again')}
          </button>
        </div>
      </div>

      {scanBusy && progress && (
        <div className="scan-status" role="status" aria-live="polite">
          <Activity size={15} className="spinner" />
          <span>{progress.message}</span>
          <strong>{progress.progress}%</strong>
        </div>
      )}

      <div className="health-band">
        <div className="health-score"><strong>{score}</strong><span>{score >= 85 ? text('设备状态良好', 'Device is healthy') : text('建议完成处理', 'Action recommended')}</span></div>
        <div className="health-metric"><span>{text('可释放空间', 'Reclaimable')}</span><strong>{formatBytes(reclaimable)}</strong><small>{text(`${storage.length} 个建议项目`, `${storage.length} findings`)}</small></div>
        <div className="health-metric"><span>{text('后台服务', 'Services')}</span><strong>{services.length}</strong><small>{text(`${services.filter((item) => operations(item).length).length} 个可处理`, `${services.filter((item) => operations(item).length).length} actionable`)}</small></div>
        <div className="health-metric"><span>{text('终端启动', 'Terminal startup')}</span><strong>{result?.terminal.startupMs === null || result?.terminal.startupMs === undefined ? '--' : `${result.terminal.startupMs} ms`}</strong><small>{text(`${terminalFixes.length} 项可以自动优化`, `${terminalFixes.length} automatic fixes`)}</small></div>
      </div>

      <div className="health-tabs" role="tablist" aria-label={text('体检模块', 'Health modules')}>
        {([
          ['storage', text('存储空间', 'Storage')],
          ['services', text('后台服务', 'Services')],
          ['terminal', text('终端诊断', 'Terminal')]
        ] as Array<[HealthTab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`health-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'storage' && (
        <div className="health-panel is-active">
          <div className="section-toolbar"><strong>{text('可处理内容', 'Actionable items')}</strong><button type="button" className="ignored-count-button" onClick={() => onManageIgnored('storage')}><EyeOff size={14} />{text(`已忽略 ${settings.storageWhitelist.length} 项`, `${settings.storageWhitelist.length} ignored`)}</button></div>
          <div className="data-list">{storage.length ? storage.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onAgentPrompt={onAgentPrompt} onIgnore={onIgnore} />) : <div className="module-empty">{text('没有发现需要处理的存储项目', 'No storage findings')}</div>}</div>
        </div>
      )}

      {tab === 'services' && (
        <div className="health-panel is-active">
          <div className="section-toolbar"><strong>{text('常驻与启动项', 'Background and startup items')}</strong><button type="button" className="ignored-count-button" onClick={() => onManageIgnored('services')}><EyeOff size={14} />{text(`已忽略 ${settings.serviceWhitelist.length} 项`, `${settings.serviceWhitelist.length} ignored`)}</button></div>
          <div className="data-list">{services.length ? services.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onAgentPrompt={onAgentPrompt} onIgnore={onIgnore} />) : <div className="module-empty">{text('没有发现异常后台服务', 'No service findings')}</div>}</div>
        </div>
      )}

      {tab === 'terminal' && (
        <div className="health-panel is-active">
          <div className="section-toolbar"><strong>{text('启动性能', 'Startup performance')}</strong><span>{text(`当前 shell：${result?.terminal.shell ?? '--'}`, `Current shell: ${result?.terminal.shell ?? '--'}`)}</span></div>
          <div className="data-list">
            {terminalFindings.map((finding) => (
              <div className="data-row" key={finding.id}>
                <span className="row-icon">{finding.fix ? <Route size={16} /> : <Timer size={16} />}</span>
                <div className="row-main"><strong>{finding.title}</strong><small>{finding.detail}</small></div>
                <div className="row-meta"><strong>{finding.durationMs !== undefined ? `${finding.durationMs} ms` : finding.severity}</strong><small>{finding.source ?? result?.terminal.shell}</small></div>
                <div className="row-meta"><strong>{finding.fix ? text('可自动优化', 'Automatic fix') : text('需要分析', 'Needs analysis')}</strong><small>{finding.fix ? text('支持撤销', 'Undo supported') : text('不自动修改', 'No automatic changes')}</small></div>
                <div className="row-actions"><button type="button" className="secondary-button" onClick={() => onAgentPrompt(finding.fix ? `检查“${finding.title}”并把可撤销修复加入处理计划` : `深入分析“${finding.title}”并告诉我怎样优化`)}>{finding.fix ? text('处理', 'Handle') : text('问 Agent', 'Ask Agent')}</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

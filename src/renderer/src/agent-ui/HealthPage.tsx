import {
  Activity,
  Box,
  Bolt,
  ChevronRight,
  Ellipsis,
  EyeOff,
  FolderOpen,
  Hammer,
  LoaderCircle,
  Package,
  Play,
  RadioTower,
  RefreshCw,
  Route,
  Sparkles,
  Timer
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type {
  CandidateOperation,
  DiskUsageProgress,
  DiskUsageScanResult,
  ScanCandidate,
  ScanProgress,
  ScanResult
} from '../../../shared/types'
import {
  isActionableFinding,
  isHealthSignal,
  isReviewClue,
  isSafeCleanup,
  summarizeFindingTrust
} from '../../../shared/finding-trust'
import { selectHealthReviewTarget } from '../health-review'
import { useI18n } from '../i18n'
import { DiskUsageBrowser } from './DiskUsageBrowser'
import { formatBytes, formatDateTime } from './utils'

export type HealthTab = 'storage' | 'services' | 'terminal'
export type StorageMode = 'safe' | 'clues' | 'browser'

export interface HealthAgentOrigin {
  tab: HealthTab
  itemId?: string
  scrollTop: number
}

export interface PageRestoreTarget {
  token: number
  itemId?: string
  scrollTop: number
}

function operations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ id: candidate.id, ...candidate.action }] : []
}

function CandidateRow({
  candidate,
  onAgentPrompt,
  onDirectAction,
  onIgnore,
  onReveal
}: {
  candidate: ScanCandidate
  onAgentPrompt: (prompt: string, itemId: string) => void
  onDirectAction: (candidate: ScanCandidate, operation: CandidateOperation) => void
  onIgnore: (candidate: ScanCandidate) => void
  onReveal: (candidate: ScanCandidate) => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const operationCount = operations(candidate).length
  const confidenceLabel = candidate.confidence === 'verified'
    ? text('已验证', 'Verified')
    : candidate.confidence === 'strong'
      ? text('强证据', 'Strong evidence')
      : text('弱线索', 'Weak clue')
  const estimateLabel = candidate.estimateQuality === 'exact'
    ? text('精确测量', 'Exact measurement')
    : candidate.estimateQuality === 'approximate'
      ? text('近似估算', 'Approximate estimate')
      : text('未估算', 'No estimate')
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
    <div className="data-row" data-focus-id={candidate.id} tabIndex={-1}>
      <span className="row-icon"><Icon size={16} /></span>
      <div className="row-main"><strong>{candidate.name}<span className={`finding-confidence ${candidate.confidence}`}>{confidenceLabel}</span></strong><small>{candidate.description}</small>{candidate.location && <button type="button" className="candidate-location" title={candidate.location} onClick={() => onReveal(candidate)}><FolderOpen size={12} /><span>{candidate.location}</span></button>}</div>
      <div className="row-meta"><strong>{candidate.sizeBytes ? formatBytes(candidate.sizeBytes) : candidate.status}</strong><small>{candidate.ageDays !== undefined ? text(`${candidate.ageDays} 天`, `${candidate.ageDays} days`) : candidate.subtitle}</small></div>
      <div className="row-meta"><strong>{operationCount ? text(`${operationCount} 个可选操作`, `${operationCount} available ${operationCount === 1 ? 'action' : 'actions'}`) : text('仅提供分析', 'Analysis only')}</strong><small>{estimateLabel}</small></div>
      <div className="row-actions">
        <button type="button" className="secondary-button" onClick={() => onAgentPrompt(operationCount
          ? text(
              `分析“${candidate.name}”。第一句话直接说明它是什么软件或服务、属于哪家公司以及主要用途；结合关联应用、后台服务、配置文件名、软件包收据和 shell 引用说明本机状态，并区分本机确认、明确签名和未确认推断；再说明影响、风险并比较全部 ${operationCount} 个可选操作。不要直接执行或默认选择操作，等我明确选择后再加入确认计划。`,
              `Analyze "${candidate.name}". In the first sentence, directly identify the software or service, its vendor, and its main purpose. Use related apps, background services, configuration names, package receipts, and shell references to explain its local state, distinguishing locally confirmed evidence, exact signatures, and unconfirmed inference. Then explain impact and risks and compare all ${operationCount} available actions. Do not execute or select an action until I explicitly choose one.`
            )
          : text(
              `分析“${candidate.name}”。第一句话直接说明它是什么软件或服务、属于哪家公司以及主要用途；结合关联应用、后台服务、配置文件名、软件包收据和 shell 引用说明本机状态，并区分本机确认、明确签名和未确认推断；再说明影响和是否需要关注，不要修改系统。`,
              `Analyze "${candidate.name}". In the first sentence, directly identify the software or service, its vendor, and its main purpose. Use related apps, background services, configuration names, package receipts, and shell references to explain its local state, distinguishing locally confirmed evidence, exact signatures, and unconfirmed inference. Then explain impact and whether it needs attention without changing the system.`
            ), candidate.id)}>
          <Sparkles size={14} />{text('AI 分析', 'AI analysis')}
        </button>
        <div className="row-menu" ref={menuRef}>
          <button type="button" className={operationCount ? 'secondary-button direct-action-button' : 'icon-button'} onClick={() => setMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={menuOpen} title={text('直接操作', 'Direct actions')} aria-label={text(`${candidate.name}的直接操作`, `Direct actions for ${candidate.name}`)}>
            {operationCount ? <><Bolt size={14} />{text('直接操作', 'Direct')}</> : <Ellipsis size={16} />}
          </button>
          {menuOpen && (
            <div className="row-menu-popover" role="menu">
              {operations(candidate).map((operation) => <button type="button" role="menuitem" key={operation.id} title={operation.consequence} onClick={() => { setMenuOpen(false); onDirectAction(candidate, operation) }}><Play size={14} />{operation.label}</button>)}
              {operationCount > 0 && <span className="row-menu-divider" />}
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
  tab,
  storageMode,
  diskUsage,
  diskUsageProgress,
  diskUsageBusy,
  diskUsageError,
  restoreTarget,
  onRestoreComplete,
  onScan,
  onTabChange,
  onStorageModeChange,
  onDiskUsageScan,
  onDiskUsageCancel,
  onRevealDiskUsageNode,
  onTrashDiskUsageNode,
  onAskDiskUsageNode,
  onRevealCandidate,
  onAgentPrompt,
  onDirectAction,
  onDirectTerminalFix,
  onOptimizeTerminal,
  onIgnore,
  onManageIgnored
}: {
  result: ScanResult | null
  settings: AppSettings
  scanBusy: boolean
  progress: ScanProgress | null
  tab: HealthTab
  storageMode: StorageMode
  diskUsage: DiskUsageScanResult | null
  diskUsageProgress: DiskUsageProgress | null
  diskUsageBusy: boolean
  diskUsageError: string | null
  restoreTarget: PageRestoreTarget | null
  onRestoreComplete: () => void
  onScan: () => void
  onTabChange: (tab: HealthTab) => void
  onStorageModeChange: (mode: StorageMode) => void
  onDiskUsageScan: () => void
  onDiskUsageCancel: () => void
  onRevealDiskUsageNode: (id: string) => void
  onTrashDiskUsageNode: (node: import('../../../shared/types').DiskUsageNode) => void
  onAskDiskUsageNode: (node: import('../../../shared/types').DiskUsageNode, origin: HealthAgentOrigin) => void
  onRevealCandidate: (candidate: ScanCandidate) => void
  onAgentPrompt: (prompt: string, origin: HealthAgentOrigin) => void
  onDirectAction: (candidate: ScanCandidate, operation: CandidateOperation) => void
  onDirectTerminalFix: (finding: ScanResult['terminal']['findings'][number]) => void
  onOptimizeTerminal: (findings: ScanResult['terminal']['findings']) => void
  onIgnore: (candidate: ScanCandidate) => void
  onManageIgnored: (kind: 'storage' | 'services') => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const pageRef = useRef<HTMLElement>(null)
  const [serviceCategory, setServiceCategory] = useState<string>('all')
  const storage = result?.candidates.filter((item) => item.section === 'storage') ?? []
  const services = result?.candidates.filter((item) => item.section === 'services') ?? []
  const trust = summarizeFindingTrust([...storage, ...services])
  const safeStorage = storage.filter(isSafeCleanup)
  const actionableStorage = storage.filter(isActionableFinding)
  const trustedStorage = [...safeStorage, ...actionableStorage]
  const storageClues = storage.filter(isReviewClue)
  const serviceCategories = ([
    ['orphaned', text('残留启动项', 'Orphaned startup items')],
    ['failed', text('启动异常', 'Startup failures')],
    ['high-cpu', text('CPU 占用异常', 'High CPU')],
    ['high-memory', text('内存占用异常', 'High memory')],
    ['long-running', text('长期运行', 'Long-running')],
    ['stale', text('长期未使用', 'Stale items')],
    ['other', text('其他启动项', 'Other startup items')]
  ] as const).map(([kind, label]) => ({
    kind,
    label,
    items: services.filter((service) => kind === 'other'
      ? !(service.serviceAnomalies?.length)
      : service.serviceAnomalies?.includes(kind))
  })).filter((group) => group.items.length > 0)
  const visibleServices = serviceCategory === 'all'
    ? services
    : services.filter((service) => serviceCategory === 'other'
      ? !(service.serviceAnomalies?.length)
      : service.serviceAnomalies?.includes(serviceCategory as NonNullable<ScanCandidate['serviceAnomalies']>[number]))
  const terminalFindings = result?.terminal.findings ?? []
  const terminalFixes = terminalFindings.filter((item) => item.fix)
  const actionableServices = services.filter(isActionableFinding)
  const serviceHealthSignals = services.filter(isHealthSignal)
  const slowTerminalFindings = terminalFindings.filter((item) => item.severity === 'slow')
  const diskFreeRatio = result?.system.diskTotalBytes
    ? result.system.diskFreeBytes / result.system.diskTotalBytes
    : 1
  const diskPenalty = diskFreeRatio < 0.1 ? 25 : diskFreeRatio < 0.2 ? 10 : 0
  const score = Math.max(45, 100 - diskPenalty - serviceHealthSignals.length * 5 - slowTerminalFindings.length * 5)
  const actionableCount = trust.actionable.length + terminalFixes.length
  const findingCount = trustedStorage.length + actionableServices.length + terminalFixes.length
  const reviewTarget = selectHealthReviewTarget({
    storage: trustedStorage.length,
    services: actionableServices.length,
    terminal: terminalFixes.length
  })
  const reviewTargetLabel = reviewTarget.tab === 'storage'
    ? text('存储空间', 'Storage')
    : reviewTarget.tab === 'services'
      ? text('后台服务', 'Services')
      : text('终端诊断', 'Terminal')

  useEffect(() => {
    if (!restoreTarget || !pageRef.current) return
    const page = pageRef.current
    const frame = window.requestAnimationFrame(() => {
      page.scrollTop = restoreTarget.scrollTop
      const target = restoreTarget.itemId
        ? [...page.querySelectorAll<HTMLElement>('[data-focus-id]')].find((item) => item.dataset.focusId === restoreTarget.itemId)
        : null
      if (target) {
        target.scrollIntoView({ block: 'center' })
        target.focus({ preventScroll: true })
        target.classList.add('is-returned')
        window.setTimeout(() => target.classList.remove('is-returned'), 1400)
      }
      onRestoreComplete()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [onRestoreComplete, restoreTarget])

  const askAgent = (prompt: string, itemId?: string): void => onAgentPrompt(prompt, {
    tab,
    itemId,
    scrollTop: pageRef.current?.scrollTop ?? 0
  })

  const reviewFindings = (): void => {
    if (reviewTarget.tab === 'storage') {
      onStorageModeChange('safe')
    } else if (reviewTarget.tab === 'services') {
      setServiceCategory('all')
    }
    onTabChange(reviewTarget.tab)
  }

  return (
    <section ref={pageRef} className="page content-page is-active">
      <div className="page-command-bar">
        <span className="page-command-summary">{result
          ? text(
              `最后检查于 ${formatDateTime(result.completedAt, language)} · 用时 ${result.timings.find((item) => item.section === 'total')?.durationMs ?? 0} ms`,
              `Last checked ${formatDateTime(result.completedAt, language)} · ${result.timings.find((item) => item.section === 'total')?.durationMs ?? 0} ms`
            )
          : text('尚未完成体检', 'No health scan yet')}</span>
        <div className="page-command-actions">
          <button type="button" className="secondary-button" onClick={() => askAgent(text('全面检查电脑状态并准备处理计划', 'Inspect the computer and prepare a plan'))}>
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

      {!scanBusy && result && result.diagnostics.length > 0 && (
        <div className="scan-status is-warning" role="status">
          <Activity size={15} />
          <span>{text(`有 ${result.diagnostics.length} 个扫描模块未完整完成`, `${result.diagnostics.length} scan modules did not complete`)}</span>
          <strong>{result.diagnostics[0].code}</strong>
        </div>
      )}

      <div className="health-band">
        <button
          type="button"
          className="health-score"
          onClick={reviewFindings}
          disabled={!result || findingCount === 0}
          title={text(`打开待确认项最多的模块：${reviewTargetLabel}`, `Open the module with the most findings: ${reviewTargetLabel}`)}
        >
          <small className="health-score-label">{text('系统状态', 'System status')}</small>
          <strong>{score}</strong>
          <span>{findingCount > 0
            ? <>{text(`先查看${reviewTargetLabel} ${reviewTarget.count} 项`, `Review ${reviewTarget.count} in ${reviewTargetLabel}`)}<ChevronRight size={12} /></>
            : text('没有待处理项目', 'No pending findings')}</span>
        </button>
        <div className="health-metric"><span>{text('安全可释放空间', 'Safely reclaimable')}</span><strong>{formatBytes(trust.trustedReclaimableBytes)}</strong><small>{text(`${safeStorage.length} 个已验证项目`, `${safeStorage.length} verified findings`)}</small></div>
        <div className="health-metric"><span>{text('可行动问题', 'Actionable findings')}</span><strong>{actionableCount}</strong><small>{text(`${trust.healthSignalCount + slowTerminalFindings.length} 项影响系统状态`, `${trust.healthSignalCount + slowTerminalFindings.length} affect system status`)}</small></div>
        <div className="health-metric"><span>{text('审查线索', 'Review clues')}</span><strong>{storageClues.length}</strong><small>{text('不影响健康分和空间估算', 'Excluded from health and reclaimable space')}</small></div>
      </div>

      <div className="health-tabs" role="tablist" aria-label={text('体检模块', 'Health modules')}>
        {([
          ['storage', text('存储空间', 'Storage')],
          ['services', text('后台服务', 'Services')],
          ['terminal', text('终端诊断', 'Terminal')]
        ] as Array<[HealthTab, string]>).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`health-tab ${tab === id ? 'is-active' : ''}`} onClick={() => onTabChange(id)}>{label}</button>
        ))}
      </div>

      {tab === 'storage' && (
        <div className="health-panel is-active">
          <div className="storage-mode-toolbar">
            <div className="storage-mode-tabs" role="tablist" aria-label={text('存储空间视图', 'Storage view')}>
              <button type="button" role="tab" aria-selected={storageMode === 'safe'} className={`storage-mode-tab ${storageMode === 'safe' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('safe')}>{text('可信建议', 'Trusted findings')} <span>{trustedStorage.length}</span></button>
              <button type="button" role="tab" aria-selected={storageMode === 'clues'} className={`storage-mode-tab ${storageMode === 'clues' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('clues')}>{text('审查线索', 'Review clues')} <span>{storageClues.length}</span></button>
              <button type="button" role="tab" aria-selected={storageMode === 'browser'} className={`storage-mode-tab ${storageMode === 'browser' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('browser')}>{text('磁盘浏览', 'Disk browser')}</button>
            </div>
            <span>{storageMode === 'safe'
              ? text(`${safeStorage.length} 项可安全清理，${actionableStorage.length} 项有明确证据`, `${safeStorage.length} safe cleanups and ${actionableStorage.length} evidence-backed findings`)
              : storageMode === 'clues'
                ? text('弱证据项目不会影响健康状态或可释放空间', 'Weak evidence does not affect health or reclaimable space')
              : diskUsage
                ? text(`${diskUsage.retainedEntries.toLocaleString()} 个大目录和文件`, `${diskUsage.retainedEntries.toLocaleString()} large folders and files`)
                : text('主数据卷', 'Main data volume')}</span>
          </div>
          {storageMode !== 'browser' ? (
            <>
              <div className="section-toolbar"><strong>{storageMode === 'safe' ? text('可信空间建议', 'Trusted storage findings') : text('需要确认归属的线索', 'Ownership clues to review')}</strong><button type="button" className="ignored-count-button" onClick={() => onManageIgnored('storage')}><EyeOff size={14} />{text(`已忽略 ${settings.storageWhitelist.length} 项`, `${settings.storageWhitelist.length} ignored`)}</button></div>
              <div className="data-list">{(storageMode === 'safe' ? trustedStorage : storageClues).length ? (storageMode === 'safe' ? trustedStorage : storageClues).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onAgentPrompt={askAgent} onDirectAction={onDirectAction} onIgnore={onIgnore} onReveal={onRevealCandidate} />) : <div className="module-empty">{storageMode === 'safe' ? text('没有发现可信的存储建议', 'No trusted storage findings') : text('没有需要确认的弱线索', 'No weak clues to review')}</div>}</div>
            </>
          ) : (
            <DiskUsageBrowser result={diskUsage} progress={diskUsageProgress} busy={diskUsageBusy} error={diskUsageError} onScan={onDiskUsageScan} onCancel={onDiskUsageCancel} onReveal={onRevealDiskUsageNode} onAskAI={(node) => onAskDiskUsageNode(node, { tab: 'storage', itemId: node.id, scrollTop: pageRef.current?.scrollTop ?? 0 })} onRequestTrash={onTrashDiskUsageNode} />
          )}
        </div>
      )}

      {tab === 'services' && (
        <div className="health-panel is-active">
          <div className="service-mode-toolbar"><div className="service-mode-tabs" role="tablist" aria-label={text('后台服务分类', 'Service categories')}><button type="button" role="tab" aria-selected={serviceCategory === 'all'} className={`service-mode-tab ${serviceCategory === 'all' ? 'is-active' : ''}`} onClick={() => setServiceCategory('all')}>{text('全部', 'All')} <span>{services.length}</span></button>{serviceCategories.map((category) => <button type="button" role="tab" aria-selected={serviceCategory === category.kind} className={`service-mode-tab ${serviceCategory === category.kind ? 'is-active' : ''}`} key={category.kind} onClick={() => setServiceCategory(category.kind)}>{category.label} <span>{category.items.length}</span></button>)}</div><button type="button" className="ignored-count-button" onClick={() => onManageIgnored('services')}><EyeOff size={14} />{text(`已忽略 ${settings.serviceWhitelist.length} 项`, `${settings.serviceWhitelist.length} ignored`)}</button></div>
          <div className="data-list">{visibleServices.length ? visibleServices.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onAgentPrompt={askAgent} onDirectAction={onDirectAction} onIgnore={onIgnore} onReveal={onRevealCandidate} />) : <div className="module-empty">{text('此分类没有后台服务', 'No services in this category')}</div>}</div>
        </div>
      )}

      {tab === 'terminal' && (
        <div className="health-panel is-active">
          <div className="section-toolbar terminal-toolbar"><div><strong>{text('启动性能', 'Startup performance')}</strong><span>{text(`当前 shell：${result?.terminal.shell ?? '--'}`, `Current shell: ${result?.terminal.shell ?? '--'}`)}</span></div>{terminalFixes.length > 0 && <button type="button" className="primary-button" onClick={() => onOptimizeTerminal(terminalFindings)} disabled={scanBusy}><Bolt size={14} />{text(`一键优化 ${terminalFixes.length} 项`, `Optimize ${terminalFixes.length} items`)}</button>}</div>
          <div className="data-list">
            {terminalFindings.map((finding) => (
              <div className="data-row" key={finding.id} data-focus-id={finding.id} tabIndex={-1}>
                <span className="row-icon">{finding.fix ? <Route size={16} /> : <Timer size={16} />}</span>
                <div className="row-main"><strong>{finding.title}</strong><small>{finding.detail}</small></div>
                <div className="row-meta"><strong>{finding.durationMs !== undefined ? `${finding.durationMs} ms` : finding.severity}</strong><small>{finding.source ?? result?.terminal.shell}</small></div>
                <div className="row-meta"><strong>{finding.fix ? text('1 个可选操作', '1 available action') : text('仅提供分析', 'Analysis only')}</strong><small>{finding.fix ? text('可直接执行或先分析', 'Run directly or analyze first') : text('不会修改系统', 'No system changes')}</small></div>
                <div className="row-actions">{finding.fix && <button type="button" className="primary-button direct-action-button" onClick={() => onDirectTerminalFix(finding)}><Bolt size={14} />{text('直接优化', 'Optimize')}</button>}<button type="button" className="secondary-button" onClick={() => askAgent(finding.fix
                  ? text(`分析“${finding.title}”，说明性能影响和可撤销优化方案；不要直接修改，等我确认后再加入计划。`, `Analyze "${finding.title}", explain the performance impact and reversible fix, and wait for my confirmation before adding it to a plan.`)
                  : text(`深入分析“${finding.title}”并告诉我怎样优化；不要修改系统。`, `Analyze "${finding.title}" and explain how to optimize it without changing the system.`), finding.id)}><Sparkles size={14} />{text('AI 分析', 'AI analysis')}</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

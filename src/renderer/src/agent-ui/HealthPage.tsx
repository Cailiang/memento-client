import {
  AppWindow,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  EyeOff,
  FileWarning,
  FolderOpen,
  Globe2,
  HardDrive,
  ListFilter,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Trash2,
  Wrench
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type {
  CandidateOperation,
  CleanupCategory,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  TerminalFinding
} from '../../../shared/types'
import {
  isActionableFinding,
  isReviewClue,
  isSafeCleanup
} from '../../../shared/finding-trust'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime } from './utils'

export type HealthTab = 'storage' | 'services' | 'terminal'
export type StorageMode = 'safe' | 'review'
export type CleanupCategoryFilter = CleanupCategory | 'all' | 'services' | 'terminal'

export interface HealthAgentOrigin {
  tab: HealthTab
  category?: CleanupCategoryFilter
  itemId?: string
  scrollTop: number
}

export interface PageRestoreTarget {
  token: number
  category?: CleanupCategoryFilter
  itemId?: string
  scrollTop: number
}

export interface CleanupSelection {
  candidate: ScanCandidate
  operation: CandidateOperation
}

function operations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ id: candidate.id, ...candidate.action }] : []
}

function categoryForCandidate(candidate: ScanCandidate): CleanupCategory {
  if (candidate.cleanupCategory) return candidate.cleanupCategory
  const source = `${candidate.name} ${candidate.subtitle} ${candidate.location ?? ''}`
  if (/xcode|homebrew|npm|pnpm|yarn|gradle|cocoapods|cargo|rust|python|pip|maven|android|developer/i.test(source)) return 'developer'
  if (/safari|chrome|chromium|firefox|edge|brave|arc|browser|浏览器/i.test(source)) return 'browsers'
  if (/log|diagnostic|report|日志|诊断|报告/i.test(source)) return 'logs'
  if (/simulator|device support|firmware|模拟器|设备/i.test(source)) return 'devices'
  return 'applications'
}

function CleanupRow({
  candidate,
  selected,
  selectable,
  onToggle,
  onAgentPrompt,
  onDirectAction,
  onIgnore,
  onReveal
}: {
  candidate: ScanCandidate
  selected: boolean
  selectable: boolean
  onToggle: () => void
  onAgentPrompt: (candidate: ScanCandidate) => void
  onDirectAction: (candidate: ScanCandidate, operation: CandidateOperation) => void
  onIgnore: (candidate: ScanCandidate) => void
  onReveal: (candidate: ScanCandidate) => void
}): React.JSX.Element {
  const { text } = useI18n()
  const operation = operations(candidate)[0]
  const weak = isReviewClue(candidate)
  const status = weak
    ? text('规则外线索', 'Outside rules')
    : candidate.risk === 'safe'
      ? text('安全清理', 'Safe cleanup')
      : text('需要确认', 'Review first')

  return (
    <article className={`cleanup-row ${selected ? 'is-selected' : ''}`} data-focus-id={candidate.id} tabIndex={-1}>
      <label className={`cleanup-check ${!selectable ? 'is-disabled' : ''}`}>
        <input type="checkbox" checked={selected} disabled={!selectable} onChange={onToggle} aria-label={text(`选择 ${candidate.name}`, `Select ${candidate.name}`)} />
        <span>{selected && <Check size={13} />}</span>
      </label>
      <span className="cleanup-item-icon">{categoryForCandidate(candidate) === 'developer' ? <Code2 size={17} /> : categoryForCandidate(candidate) === 'browsers' ? <Globe2 size={17} /> : <AppWindow size={17} />}</span>
      <div className="cleanup-item-copy">
        <div className="cleanup-item-title"><strong>{candidate.name}</strong><span className={`cleanup-trust ${weak ? 'is-clue' : candidate.risk}`}>{status}</span></div>
        <p>{candidate.description}</p>
        {candidate.location && <button type="button" className="candidate-location" title={candidate.location} onClick={() => onReveal(candidate)}><FolderOpen size={12} /><span>{candidate.location}</span></button>}
      </div>
      <div className="cleanup-item-size"><strong>{candidate.sizeBytes ? formatBytes(candidate.sizeBytes) : '--'}</strong><small>{candidate.ageDays !== undefined ? text(`${candidate.ageDays} 天前更新`, `Updated ${candidate.ageDays} days ago`) : candidate.subtitle}</small></div>
      <div className="cleanup-row-actions">
        <button type="button" className="icon-button" onClick={() => onAgentPrompt(candidate)} title={text('让 AI 解释此项', 'Ask AI to explain')} aria-label={text(`让 AI 解释 ${candidate.name}`, `Ask AI to explain ${candidate.name}`)}><Sparkles size={15} /></button>
        <button type="button" className="icon-button" onClick={() => onIgnore(candidate)} title={text('忽略此项', 'Ignore item')} aria-label={text(`忽略 ${candidate.name}`, `Ignore ${candidate.name}`)}><EyeOff size={15} /></button>
        {operation && <button type="button" className={`icon-button cleanup-single-action ${weak ? 'is-review' : ''}`} onClick={() => onDirectAction(candidate, operation)} title={operation.label} aria-label={`${operation.label}: ${candidate.name}`}><Trash2 size={15} /></button>}
      </div>
    </article>
  )
}

function TerminalCleanupRow({
  finding,
  selected,
  onToggle,
  onAgentPrompt,
  onDirectAction
}: {
  finding: TerminalFinding
  selected: boolean
  onToggle: () => void
  onAgentPrompt: (finding: TerminalFinding) => void
  onDirectAction: (finding: TerminalFinding) => void
}): React.JSX.Element {
  const { text } = useI18n()
  const actionable = Boolean(finding.fix)
  const status = finding.fix
    ? finding.severity === 'slow' ? text('建议优化', 'Optimization suggested') : text('可优化', 'Optimizable')
    : finding.severity === 'good' ? text('正常', 'Healthy') : text('仅供分析', 'Analysis only')

  return (
    <article className={`cleanup-row terminal-cleanup-row ${selected ? 'is-selected' : ''}`} data-focus-id={finding.id} tabIndex={-1}>
      <label className={`cleanup-check ${!actionable ? 'is-disabled' : ''}`}>
        <input type="checkbox" checked={selected} disabled={!actionable} onChange={onToggle} aria-label={text(`选择 ${finding.title}`, `Select ${finding.title}`)} />
        <span>{selected && <Check size={13} />}</span>
      </label>
      <span className="cleanup-item-icon"><SquareTerminal size={17} /></span>
      <div className="cleanup-item-copy">
        <div className="cleanup-item-title"><strong>{finding.title}</strong><span className={`cleanup-trust ${finding.fix ? 'review' : 'is-clue'}`}>{status}</span></div>
        <p>{finding.detail}</p>
        {finding.source && <span className="candidate-location terminal-finding-source"><SquareTerminal size={12} /><span>{finding.source}</span></span>}
      </div>
      <div className="cleanup-item-size"><strong>--</strong><small>{finding.recommendation ?? text('命令行启动诊断', 'Terminal startup diagnostic')}</small></div>
      <div className="cleanup-row-actions">
        <button type="button" className="icon-button" onClick={() => onAgentPrompt(finding)} title={text('让 AI 解释此项', 'Ask AI to explain')} aria-label={text(`让 AI 解释 ${finding.title}`, `Ask AI to explain ${finding.title}`)}><Sparkles size={15} /></button>
        {finding.fix && <button type="button" className="icon-button cleanup-single-action is-review" onClick={() => onDirectAction(finding)} title={finding.fix.label} aria-label={`${finding.fix.label}: ${finding.title}`}><Wrench size={15} /></button>}
      </div>
    </article>
  )
}

export function HealthPage({
  result,
  settings,
  scanBusy,
  progress,
  storageMode,
  restoreTarget,
  onRestoreComplete,
  onScan,
  onStorageModeChange,
  onRevealCandidate,
  onAgentPrompt,
  onDirectAction,
  onDirectActions,
  selectedIds,
  onSelectedIdsChange,
  onDirectTerminalFixes,
  onIgnore,
  onManageIgnored,
  standaloneTerminal = false
}: {
  result: ScanResult | null
  settings: AppSettings
  scanBusy: boolean
  progress: ScanProgress | null
  storageMode: StorageMode
  restoreTarget: PageRestoreTarget | null
  onRestoreComplete: () => void
  onScan: () => void
  onStorageModeChange: (mode: StorageMode) => void
  onRevealCandidate: (candidate: ScanCandidate) => void
  onAgentPrompt: (prompt: string, origin: HealthAgentOrigin) => void
  onDirectAction: (candidate: ScanCandidate, operation: CandidateOperation) => void
  onDirectActions: (selections: CleanupSelection[]) => void
  selectedIds: ReadonlySet<string>
  onSelectedIdsChange: (ids: Set<string>) => void
  onDirectTerminalFixes: (findings: TerminalFinding[]) => void
  onIgnore: (candidate: ScanCandidate) => void
  onManageIgnored: (kind: 'storage' | 'services') => void
  standaloneTerminal?: boolean
}): React.JSX.Element {
  const { language, text } = useI18n()
  const pageRef = useRef<HTMLElement>(null)
  const [category, setCategory] = useState<CleanupCategoryFilter>(standaloneTerminal ? 'terminal' : restoreTarget?.category ?? 'all')
  const storage = useMemo(
    () => result?.candidates.filter((item) => item.section === 'storage') ?? [],
    [result]
  )
  const serviceItems = useMemo(
    () => result?.candidates.filter((item) => item.section === 'services') ?? [],
    [result]
  )
  const terminalItems = result?.terminal.findings ?? []
  const allCandidateItems = useMemo(() => [...storage, ...serviceItems], [serviceItems, storage])
  const safeItems = useMemo(() => storage.filter(isSafeCleanup), [storage])
  const reviewItems = useMemo(() => allCandidateItems.filter((item) => isActionableFinding(item) || isReviewClue(item)), [allCandidateItems])
  const reviewSelectable = useMemo(() => reviewItems.filter((item) => operations(item).length > 0), [reviewItems])
  const modeItems = storageMode === 'safe' ? safeItems : reviewItems
  const visibleItems = category === 'all'
    ? modeItems
    : category === 'services'
      ? serviceItems
      : category === 'terminal'
        ? []
        : modeItems.filter((item) => categoryForCandidate(item) === category)
  const serviceSelectable = serviceItems.filter((item) => operations(item).length > 0)
  const selectableItems = storageMode === 'safe' ? [...safeItems, ...serviceSelectable] : reviewSelectable
  const visibleSelectable = visibleItems.filter((item) => selectableItems.some((selectable) => selectable.id === item.id))
  const selectedItems = [...new Map(selectableItems.map((item) => [item.id, item])).values()].filter((item) => selectedIds.has(item.id))
  const selectedSelections = selectedItems.flatMap((candidate) => {
    const operation = operations(candidate)[0]
    return operation ? [{ candidate, operation }] : []
  })
  const terminalSelectable = terminalItems.filter((finding) => Boolean(finding.fix))
  const selectedTerminalFindings = terminalSelectable.filter((finding) => selectedIds.has(finding.id))
  const selectedBytes = selectedItems.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const trustedBytes = safeItems.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((item) => selectedIds.has(item.id))
  const allTerminalSelected = terminalSelectable.length > 0 && terminalSelectable.every((finding) => selectedIds.has(finding.id))
  const selectedCount = category === 'terminal' ? selectedTerminalFindings.length : selectedItems.length
  const exactRuleCount = allCandidateItems.filter((item) => item.confidence !== 'weak').length

  const categories: Array<{
    id: CleanupCategoryFilter
    label: string
    icon: typeof HardDrive
  }> = standaloneTerminal ? [
    { id: 'terminal', label: text('命令行启动优化', 'Terminal startup'), icon: SquareTerminal }
  ] : [
    { id: 'all', label: text('全部项目', 'All items'), icon: ListFilter },
    { id: 'system', label: text('系统与临时文件', 'System and temporary'), icon: HardDrive },
    { id: 'applications', label: text('应用缓存', 'Application caches'), icon: Boxes },
    { id: 'browsers', label: text('浏览器缓存', 'Browser caches'), icon: Globe2 },
    { id: 'developer', label: text('开发者缓存', 'Developer caches'), icon: Code2 },
    { id: 'logs', label: text('日志与诊断', 'Logs and diagnostics'), icon: FileWarning },
    { id: 'devices', label: text('设备与模拟器', 'Devices and simulators'), icon: Smartphone },
    { id: 'services', label: text('后台服务', 'Background services'), icon: RadioTower }
  ]

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

  const toggleCandidate = (id: string): void => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedIdsChange(next)
  }

  const toggleVisible = (): void => {
    const next = new Set(selectedIds)
    for (const item of visibleSelectable) {
      if (allVisibleSelected) next.delete(item.id)
      else next.add(item.id)
    }
    onSelectedIdsChange(next)
  }

  const toggleVisibleTerminal = (): void => {
    const next = new Set(selectedIds)
    for (const finding of terminalSelectable) {
      if (allTerminalSelected) next.delete(finding.id)
      else next.add(finding.id)
    }
    onSelectedIdsChange(next)
  }

  const askAgent = (candidate: ScanCandidate): void => onAgentPrompt(text(
    `解释清理项“${candidate.name}”。说明它由哪个应用或系统组件生成、规则为什么只匹配当前路径、清理后会重新生成什么；区分确定事实与推断，不要直接执行。`,
    `Explain the cleanup item "${candidate.name}". Identify the app or system component that creates it, why the rule matches only this path, and what will be rebuilt after cleanup. Separate verified facts from inference and do not execute it.`
  ), {
    tab: 'storage',
    category,
    itemId: candidate.id,
    scrollTop: pageRef.current?.scrollTop ?? 0
  })

  const askTerminalAgent = (finding: TerminalFinding): void => onAgentPrompt(text(
    `解释命令行启动项“${finding.title}”。说明它如何影响终端启动、哪些内容是确定事实、哪些只是推断，不要直接修改配置。`,
    `Explain the terminal startup finding "${finding.title}". Describe how it affects shell startup, separate verified facts from inference, and do not modify the configuration.`
  ), {
    tab: 'terminal',
    category: 'terminal',
    itemId: finding.id,
    scrollTop: pageRef.current?.scrollTop ?? 0
  })

  return (
    <section ref={pageRef} className="page content-page cleanup-page is-active">
      <div className="page-command-bar cleanup-command-bar">
        <div>
          <h1>{standaloneTerminal ? text('命令行启动优化', 'Terminal startup') : text('清理', 'Cleanup')}</h1>
          <span className="page-command-summary">{result
            ? text(
                standaloneTerminal
                  ? `最后检查 ${formatDateTime(result.completedAt, language)} · ${terminalSelectable.length} 项可优化`
                  : `最后扫描 ${formatDateTime(result.completedAt, language)} · ${exactRuleCount} 项确定性结果`,
                standaloneTerminal
                  ? `Last checked ${formatDateTime(result.completedAt, language)} · ${terminalSelectable.length} optimizations available`
                  : `Last scanned ${formatDateTime(result.completedAt, language)} · ${exactRuleCount} deterministic findings`
              )
            : text(
                standaloneTerminal ? '检查 shell 启动配置和 PATH，找出可以安全优化的启动项' : '运行本机规则扫描，查找可以稳定重建的缓存与临时文件',
                standaloneTerminal ? 'Inspect shell startup configuration and PATH for safe optimizations' : 'Run local rules to find caches and temporary files that can be reliably rebuilt'
              )}</span>
        </div>
        <button type="button" className="secondary-button cleanup-scan-button" onClick={onScan} disabled={scanBusy}>
          {scanBusy ? <LoaderCircle className="spinner" size={16} /> : <RefreshCw size={16} />}
          {scanBusy ? text('扫描中', 'Scanning') : text('重新扫描', 'Scan again')}
        </button>
      </div>

      {scanBusy && progress && (
        <div className="cleanup-scan-progress" role="status" aria-live="polite">
          <span><LoaderCircle className="spinner" size={15} />{progress.message}</span>
          <div><i style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress.progress)) / 100})` }} /></div>
          <strong>{progress.progress}%</strong>
        </div>
      )}

      <div className="cleanup-summary-band">
        {standaloneTerminal ? <>
          <div className="cleanup-reclaimable">
            <span>{text('可优化启动项', 'Optimizable startup items')}</span>
            <strong>{terminalSelectable.length}</strong>
            <small><ShieldCheck size={13} />{text('修改前会自动备份 shell 配置', 'Shell configuration is backed up before changes')}</small>
          </div>
          <div className="cleanup-summary-stat"><span>{text('当前选择', 'Selected')}</span><strong>{selectedCount}</strong><small>{text('项启动优化', 'startup items')}</small></div>
          <div className="cleanup-summary-stat"><span>{text('检查结果', 'Findings')}</span><strong>{terminalItems.length}</strong><small>{text(`${terminalSelectable.length} 项可执行`, `${terminalSelectable.length} actionable`)}</small></div>
        </> : <>
          <div className="cleanup-reclaimable">
            <span>{text('安全可释放', 'Safe to reclaim')}</span>
            <strong>{formatBytes(trustedBytes)}</strong>
            <small><ShieldCheck size={13} />{text(`${safeItems.length} 项通过内置规则和路径测量`, `${safeItems.length} items passed built-in rules and path measurement`)}</small>
          </div>
          <div className="cleanup-summary-stat"><span>{text('当前选择', 'Selected')}</span><strong>{formatBytes(selectedBytes)}</strong><small>{text(`${selectedCount} 项`, `${selectedCount} items`)}</small></div>
          <div className="cleanup-summary-stat"><span>{text('需要确认', 'Review first')}</span><strong>{reviewItems.length}</strong><small>{text(`${reviewSelectable.length} 项可操作 · ${reviewItems.length - reviewSelectable.length} 条仅供参考`, `${reviewSelectable.length} actionable · ${reviewItems.length - reviewSelectable.length} reference-only clues`)}</small></div>
        </>}
      </div>

      <div className={`cleanup-workspace ${standaloneTerminal ? 'is-standalone' : ''}`}>
        {!standaloneTerminal && <aside className="cleanup-categories" aria-label={text('清理类别', 'Cleanup categories')}>
          {categories.map((item) => {
            const Icon = item.icon
            const categoryItems = item.id === 'services'
              ? serviceItems
              : item.id === 'terminal'
                ? terminalItems
                : item.id === 'all'
                  ? modeItems
                  : modeItems.filter((candidate) => categoryForCandidate(candidate) === item.id)
            const categoryBytes = item.id === 'terminal'
              ? 0
              : categoryItems.reduce((sum, candidate) => sum + ('sizeBytes' in candidate ? candidate.sizeBytes ?? 0 : 0), 0)
            return <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)} aria-current={category === item.id ? 'true' : undefined}><Icon size={16} /><span><strong>{item.label}</strong><small>{categoryItems.length ? `${categoryItems.length} · ${formatBytes(categoryBytes)}` : text('无项目', 'No items')}</small></span><ChevronRight size={14} /></button>
          })}
        </aside>}

        <div className="cleanup-results">
          <div className="cleanup-results-toolbar">
            {!standaloneTerminal && <div className="storage-mode-tabs" role="tablist" aria-label={text('清理可信等级', 'Cleanup trust level')}>
              <button type="button" role="tab" aria-selected={storageMode === 'safe'} className={`storage-mode-tab ${storageMode === 'safe' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('safe')}>{text('安全清理', 'Safe cleanup')} <span>{safeItems.length}</span></button>
              <button type="button" role="tab" aria-selected={storageMode === 'review'} className={`storage-mode-tab ${storageMode === 'review' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('review')}>{text('需要确认', 'Review first')} <span>{reviewItems.length}</span></button>
            </div>}
            <div className="cleanup-toolbar-actions">
              {!standaloneTerminal && category !== 'terminal' && <button type="button" className="quiet-button" onClick={() => onManageIgnored(category === 'services' ? 'services' : 'storage')}><EyeOff size={14} />{category === 'services' ? text(`已忽略 ${settings.serviceWhitelist.length}`, `${settings.serviceWhitelist.length} ignored`) : text(`已忽略 ${settings.storageWhitelist.length}`, `${settings.storageWhitelist.length} ignored`)}</button>}
              {category === 'terminal'
                ? terminalSelectable.length > 0 && <button type="button" className="quiet-button" onClick={toggleVisibleTerminal}>{allTerminalSelected ? text('取消全选', 'Deselect all') : text('全选当前类别', 'Select category')}</button>
                : visibleSelectable.length > 0 && <button type="button" className="quiet-button" onClick={toggleVisible}>{allVisibleSelected ? text('取消全选', 'Deselect all') : text('全选当前类别', 'Select category')}</button>}
            </div>
          </div>

          <div className="cleanup-list">
            {category === 'terminal' ? terminalItems.length ? terminalItems.map((finding) => (
              <TerminalCleanupRow
                key={finding.id}
                finding={finding}
                selected={selectedIds.has(finding.id)}
                onToggle={() => toggleCandidate(finding.id)}
                onAgentPrompt={askTerminalAgent}
                onDirectAction={(item) => onDirectTerminalFixes([item])}
              />
            )) : <div className="cleanup-empty"><ShieldCheck size={24} /><strong>{text('没有命令行启动项诊断', 'No terminal startup findings')}</strong><span>{text('重新扫描后，会按照当前 shell 配置和 PATH 结果展示。', 'Scan again to inspect the current shell configuration and PATH.')}</span></div> : visibleItems.length ? visibleItems.map((candidate) => (
              <CleanupRow
                key={candidate.id}
                candidate={candidate}
                selected={selectedIds.has(candidate.id)}
                selectable={selectableItems.some((item) => item.id === candidate.id)}
                onToggle={() => toggleCandidate(candidate.id)}
                onAgentPrompt={askAgent}
                onDirectAction={onDirectAction}
                onIgnore={onIgnore}
                onReveal={onRevealCandidate}
              />
            )) : <div className="cleanup-empty"><ShieldCheck size={24} /><strong>{category === 'services' ? text('没有检测到后台服务', 'No background services found') : storageMode === 'safe' ? text('当前类别没有可安全清理的项目', 'No safe cleanup items in this category') : text('当前类别没有需要确认的项目', 'No review items in this category')}</strong><span>{text('重新扫描后，结果会按照内置规则自动归类。', 'Results are categorized by built-in rules after each scan.')}</span></div>}
          </div>
        </div>
      </div>

      <footer className="cleanup-selection-bar">
        <div><strong>{selectedCount ? text(`已选择 ${selectedCount} 项`, `${selectedCount} selected`) : text('未选择清理项', 'No cleanup items selected')}</strong><span>{selectedCount ? text(`预计释放 ${formatBytes(selectedBytes)}`, `Estimated ${formatBytes(selectedBytes)}`) : text('勾选经过验证的项目后再执行', 'Select verified items before cleanup')}</span></div>
        <button type="button" className="primary-button" disabled={!(category === 'terminal' ? selectedTerminalFindings.length : selectedSelections.length) || scanBusy} onClick={() => category === 'terminal' ? onDirectTerminalFixes(selectedTerminalFindings) : onDirectActions(selectedSelections)}>{category === 'terminal' ? <Wrench size={16} /> : <Trash2 size={16} />}{category === 'terminal' ? text('优化所选启动项', 'Optimize selected') : storageMode === 'safe' ? text('清理所选项目', 'Clean selected') : text('确认并清理', 'Review and clean')}</button>
      </footer>
    </section>
  )
}

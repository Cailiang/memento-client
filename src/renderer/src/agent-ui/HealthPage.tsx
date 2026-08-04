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
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type {
  CandidateOperation,
  CleanupCategory,
  ScanCandidate,
  ScanProgress,
  ScanResult
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
type CleanupCategoryFilter = CleanupCategory | 'all'

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
        {operation && !weak && <button type="button" className="icon-button cleanup-single-action" onClick={() => onDirectAction(candidate, operation)} title={operation.label} aria-label={`${operation.label}: ${candidate.name}`}><Trash2 size={15} /></button>}
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
  onIgnore,
  onManageIgnored
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
  onIgnore: (candidate: ScanCandidate) => void
  onManageIgnored: (kind: 'storage') => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const pageRef = useRef<HTMLElement>(null)
  const [category, setCategory] = useState<CleanupCategoryFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const storage = useMemo(
    () => result?.candidates.filter((item) => item.section === 'storage') ?? [],
    [result]
  )
  const safeItems = useMemo(() => storage.filter(isSafeCleanup), [storage])
  const reviewItems = useMemo(() => storage.filter((item) => isActionableFinding(item) || isReviewClue(item)), [storage])
  const reviewActionable = useMemo(() => reviewItems.filter(isActionableFinding), [reviewItems])
  const modeItems = storageMode === 'safe' ? safeItems : reviewItems
  const visibleItems = category === 'all'
    ? modeItems
    : modeItems.filter((item) => categoryForCandidate(item) === category)
  const selectableItems = storageMode === 'safe' ? safeItems : reviewActionable
  const visibleSelectable = visibleItems.filter((item) => selectableItems.some((selectable) => selectable.id === item.id))
  const selectedItems = selectableItems.filter((item) => selectedIds.has(item.id))
  const selectedSelections = selectedItems.flatMap((candidate) => {
    const operation = operations(candidate)[0]
    return operation ? [{ candidate, operation }] : []
  })
  const selectedBytes = selectedItems.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const trustedBytes = safeItems.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((item) => selectedIds.has(item.id))
  const exactRuleCount = storage.filter((item) => item.confidence !== 'weak').length

  const categories: Array<{
    id: CleanupCategoryFilter
    label: string
    icon: typeof HardDrive
  }> = [
    { id: 'all', label: text('全部项目', 'All items'), icon: ListFilter },
    { id: 'system', label: text('系统与临时文件', 'System and temporary'), icon: HardDrive },
    { id: 'applications', label: text('应用缓存', 'Application caches'), icon: Boxes },
    { id: 'browsers', label: text('浏览器缓存', 'Browser caches'), icon: Globe2 },
    { id: 'developer', label: text('开发者缓存', 'Developer caches'), icon: Code2 },
    { id: 'logs', label: text('日志与诊断', 'Logs and diagnostics'), icon: FileWarning },
    { id: 'devices', label: text('设备与模拟器', 'Devices and simulators'), icon: Smartphone }
  ]

  useEffect(() => {
    setSelectedIds(new Set(safeItems.map((item) => item.id)))
  }, [result?.scanId])

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

  const toggleCandidate = (id: string): void => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleVisible = (): void => setSelectedIds((current) => {
    const next = new Set(current)
    for (const item of visibleSelectable) {
      if (allVisibleSelected) next.delete(item.id)
      else next.add(item.id)
    }
    return next
  })

  const askAgent = (candidate: ScanCandidate): void => onAgentPrompt(text(
    `解释清理项“${candidate.name}”。说明它由哪个应用或系统组件生成、规则为什么只匹配当前路径、清理后会重新生成什么；区分确定事实与推断，不要直接执行。`,
    `Explain the cleanup item "${candidate.name}". Identify the app or system component that creates it, why the rule matches only this path, and what will be rebuilt after cleanup. Separate verified facts from inference and do not execute it.`
  ), {
    tab: 'storage',
    itemId: candidate.id,
    scrollTop: pageRef.current?.scrollTop ?? 0
  })

  return (
    <section ref={pageRef} className="page content-page cleanup-page is-active">
      <div className="page-command-bar cleanup-command-bar">
        <div>
          <h1>{text('清理', 'Cleanup')}</h1>
          <span className="page-command-summary">{result
            ? text(
                `最后扫描 ${formatDateTime(result.completedAt, language)} · ${exactRuleCount} 项确定性结果`,
                `Last scanned ${formatDateTime(result.completedAt, language)} · ${exactRuleCount} deterministic findings`
              )
            : text('运行本机规则扫描，查找可以稳定重建的缓存与临时文件', 'Run local rules to find caches and temporary files that can be reliably rebuilt')}</span>
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
        <div className="cleanup-reclaimable">
          <span>{text('安全可释放', 'Safe to reclaim')}</span>
          <strong>{formatBytes(trustedBytes)}</strong>
          <small><ShieldCheck size={13} />{text(`${safeItems.length} 项通过内置规则和路径测量`, `${safeItems.length} items passed built-in rules and path measurement`)}</small>
        </div>
        <div className="cleanup-summary-stat"><span>{text('当前选择', 'Selected')}</span><strong>{formatBytes(selectedBytes)}</strong><small>{text(`${selectedItems.length} 项`, `${selectedItems.length} items`)}</small></div>
        <div className="cleanup-summary-stat"><span>{text('需要确认', 'Review first')}</span><strong>{reviewItems.length}</strong><small>{text(`${reviewActionable.length} 项可操作 · ${reviewItems.length - reviewActionable.length} 条规则外线索`, `${reviewActionable.length} actionable · ${reviewItems.length - reviewActionable.length} outside-rule clues`)}</small></div>
      </div>

      <div className="cleanup-workspace">
        <aside className="cleanup-categories" aria-label={text('清理类别', 'Cleanup categories')}>
          {categories.map((item) => {
            const Icon = item.icon
            const categoryItems = item.id === 'all' ? modeItems : modeItems.filter((candidate) => categoryForCandidate(candidate) === item.id)
            const categoryBytes = categoryItems.reduce((sum, candidate) => sum + (candidate.sizeBytes ?? 0), 0)
            return <button key={item.id} type="button" className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)} aria-current={category === item.id ? 'true' : undefined}><Icon size={16} /><span><strong>{item.label}</strong><small>{categoryItems.length ? `${categoryItems.length} · ${formatBytes(categoryBytes)}` : text('无项目', 'No items')}</small></span><ChevronRight size={14} /></button>
          })}
        </aside>

        <div className="cleanup-results">
          <div className="cleanup-results-toolbar">
            <div className="storage-mode-tabs" role="tablist" aria-label={text('清理可信等级', 'Cleanup trust level')}>
              <button type="button" role="tab" aria-selected={storageMode === 'safe'} className={`storage-mode-tab ${storageMode === 'safe' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('safe')}>{text('安全清理', 'Safe cleanup')} <span>{safeItems.length}</span></button>
              <button type="button" role="tab" aria-selected={storageMode === 'review'} className={`storage-mode-tab ${storageMode === 'review' ? 'is-active' : ''}`} onClick={() => onStorageModeChange('review')}>{text('需要确认', 'Review first')} <span>{reviewItems.length}</span></button>
            </div>
            <div className="cleanup-toolbar-actions">
              <button type="button" className="quiet-button" onClick={() => onManageIgnored('storage')}><EyeOff size={14} />{text(`已忽略 ${settings.storageWhitelist.length}`, `${settings.storageWhitelist.length} ignored`)}</button>
              {visibleSelectable.length > 0 && <button type="button" className="quiet-button" onClick={toggleVisible}>{allVisibleSelected ? text('取消全选', 'Deselect all') : text('全选当前类别', 'Select category')}</button>}
            </div>
          </div>

          <div className="cleanup-list">
            {visibleItems.length ? visibleItems.map((candidate) => (
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
            )) : <div className="cleanup-empty"><ShieldCheck size={24} /><strong>{storageMode === 'safe' ? text('当前类别没有可安全清理的项目', 'No safe cleanup items in this category') : text('当前类别没有需要确认的项目', 'No review items in this category')}</strong><span>{text('重新扫描后，结果会按照内置规则自动归类。', 'Results are categorized by built-in rules after each scan.')}</span></div>}
          </div>
        </div>
      </div>

      <footer className="cleanup-selection-bar">
        <div><strong>{selectedItems.length ? text(`已选择 ${selectedItems.length} 项`, `${selectedItems.length} selected`) : text('未选择清理项', 'No cleanup items selected')}</strong><span>{selectedItems.length ? text(`预计释放 ${formatBytes(selectedBytes)}`, `Estimated ${formatBytes(selectedBytes)}`) : text('勾选经过验证的项目后再执行', 'Select verified items before cleanup')}</span></div>
        <button type="button" className="primary-button" disabled={!selectedSelections.length || scanBusy} onClick={() => onDirectActions(selectedSelections)}><Trash2 size={16} />{storageMode === 'safe' ? text('清理所选项目', 'Clean selected') : text('确认并清理', 'Review and clean')}</button>
      </footer>
    </section>
  )
}

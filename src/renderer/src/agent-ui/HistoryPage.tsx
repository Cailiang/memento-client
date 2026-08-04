import { ChevronRight, FolderOpen, History, Search, Trash2, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import type { MaintenanceRunRecord } from '../../../shared/maintenance-types'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime, runStatusLabel } from './utils'

type HistoryMode = 'maintenance' | 'agent'

function maintenanceSourceLabel(source: MaintenanceRunRecord['source'], language: 'zh-CN' | 'en-US'): string {
  const labels: Record<MaintenanceRunRecord['source'], [string, string]> = {
    direct: ['直接操作', 'Direct'],
    agent: ['Agent 计划', 'Agent plan'],
    'disk-browser': ['磁盘浏览', 'Disk browser'],
    terminal: ['终端优化', 'Terminal'],
    undo: ['恢复操作', 'Restore']
  }
  return language === 'en-US' ? labels[source][1] : labels[source][0]
}

function maintenanceStatusLabel(status: MaintenanceRunRecord['status'], language: 'zh-CN' | 'en-US'): string {
  const labels: Record<MaintenanceRunRecord['status'], [string, string]> = {
    running: ['执行中', 'Running'],
    completed: ['已完成', 'Completed'],
    partial: ['部分完成', 'Partial'],
    failed: ['失败', 'Failed']
  }
  return language === 'en-US' ? labels[status][1] : labels[status][0]
}

export function HistoryPage({
  runs,
  maintenanceRuns,
  onOpenRun,
  onDeleteRuns,
  onDeleteMaintenanceRuns,
  onRevealRecovery
}: {
  runs: AgentRunRecord[]
  maintenanceRuns: MaintenanceRunRecord[]
  onOpenRun: (run: AgentRunRecord) => void
  onDeleteRuns: (runs: AgentRunRecord[]) => void
  onDeleteMaintenanceRuns: (runs: MaintenanceRunRecord[]) => void
  onRevealRecovery: (operationRecordId: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [mode, setMode] = useState<HistoryMode>('maintenance')
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const normalized = query.trim().toLocaleLowerCase()
  const filteredAgentRuns = useMemo(() => runs.filter((run) => !normalized || [
    run.prompt,
    run.providerName,
    run.model,
    runStatusLabel(run.status, language),
    run.response ?? '',
    run.error ?? ''
  ].some((value) => value.toLocaleLowerCase().includes(normalized))), [language, normalized, runs])
  const filteredMaintenanceRuns = useMemo(() => maintenanceRuns.filter((run) => !normalized || [
    run.title,
    maintenanceSourceLabel(run.source, language),
    maintenanceStatusLabel(run.status, language),
    ...run.operations.flatMap((operation) => [
      operation.title,
      operation.kind,
      operation.errorCode ?? '',
      operation.message ?? ''
    ])
  ].some((value) => value.toLocaleLowerCase().includes(normalized))), [language, maintenanceRuns, normalized])
  const visibleIds = mode === 'agent'
    ? filteredAgentRuns.filter((run) => !['preparing', 'analyzing', 'plan-ready', 'executing', 'verifying'].includes(run.status)).map((run) => run.id)
    : filteredMaintenanceRuns.filter((run) => run.status !== 'running').map((run) => run.id)
  const allFilteredSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const someFilteredSelected = visibleIds.some((id) => selectedIds.has(id))
  const selectedAgentRuns = filteredAgentRuns.filter((run) => selectedIds.has(run.id))
  const selectedMaintenanceRuns = filteredMaintenanceRuns.filter((run) => selectedIds.has(run.id))

  useEffect(() => {
    setSelectedIds(new Set())
    setQuery('')
  }, [mode])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected
  }, [allFilteredSelected, someFilteredSelected])

  const toggleSelected = (id: string): void => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAll = (): void => setSelectedIds((current) => {
    const next = new Set(current)
    if (allFilteredSelected) visibleIds.forEach((id) => next.delete(id))
    else visibleIds.forEach((id) => next.add(id))
    return next
  })

  const selectedCount = mode === 'agent' ? selectedAgentRuns.length : selectedMaintenanceRuns.length
  const total = mode === 'agent' ? runs.length : maintenanceRuns.length
  const filteredCount = mode === 'agent' ? filteredAgentRuns.length : filteredMaintenanceRuns.length

  return (
    <section className="page content-page is-active">
      <div className="page-command-bar">
        <div className="history-mode-tabs" role="tablist" aria-label={text('记录类型', 'History type')}>
          <button type="button" role="tab" aria-selected={mode === 'maintenance'} className={mode === 'maintenance' ? 'is-active' : ''} onClick={() => setMode('maintenance')}>{text('维护账本', 'Maintenance')} <span>{maintenanceRuns.length}</span></button>
          <button type="button" role="tab" aria-selected={mode === 'agent'} className={mode === 'agent' ? 'is-active' : ''} onClick={() => setMode('agent')}>{text('Agent 对话', 'Agent')} <span>{runs.length}</span></button>
        </div>
        <div className="history-command-actions">
          {selectedCount > 0 && <button type="button" className="danger-button history-bulk-delete" onClick={() => mode === 'agent' ? onDeleteRuns(selectedAgentRuns) : onDeleteMaintenanceRuns(selectedMaintenanceRuns)}><Trash2 size={14} />{text(`删除所选（${selectedCount}）`, `Delete selected (${selectedCount})`)}</button>}
          <label className="search-field history-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('搜索标题、操作或状态', 'Search titles, operations, or status')} aria-label={text('搜索历史记录', 'Search history')} /></label>
        </div>
      </div>

      {filteredCount > 0 ? (
        <div className="history-table">
          <div className="history-head">
            <label className="history-check"><input ref={selectAllRef} type="checkbox" checked={allFilteredSelected} disabled={!visibleIds.length} onChange={toggleAll} aria-label={text('全选当前记录', 'Select all filtered history')} /></label>
            <span>{text('任务', 'Task')}</span><span>{text('状态', 'Status')}</span><span>{text('时间', 'Time')}</span><span>{text('结果', 'Result')}</span><span />
          </div>
          {mode === 'agent' ? filteredAgentRuns.map((run) => {
            const deletable = !['preparing', 'analyzing', 'plan-ready', 'executing', 'verifying'].includes(run.status)
            const reclaimed = run.plan.reduce((sum, item) => sum + item.estimatedBytes, 0)
            return (
              <div className="history-entry" key={run.id}>
                <label className="history-check history-row-check"><input type="checkbox" checked={selectedIds.has(run.id)} disabled={!deletable} onChange={() => toggleSelected(run.id)} aria-label={text(`选择“${run.prompt}”`, `Select "${run.prompt}"`)} /></label>
                <button type="button" className="history-row" onClick={() => onOpenRun(run)}>
                  <span className="history-title"><strong>{run.prompt}</strong><small>{text(`${run.plan.length} 个计划步骤 · ${run.providerName} ${run.model}`, `${run.plan.length} plan steps · ${run.providerName} ${run.model}`)}</small></span>
                  <span><span className={`risk-label ${run.status === 'completed' ? 'safe' : run.status === 'failed' ? 'danger' : 'review'}`}>{runStatusLabel(run.status, language)}</span></span>
                  <span>{formatDateTime(run.createdAt, language)}</span>
                  <span>{run.results.length ? text(`${run.results.filter((item) => item.ok).length} 项完成`, `${run.results.filter((item) => item.ok).length} completed`) : reclaimed ? formatBytes(reclaimed) : text('只读分析', 'Read-only')}</span>
                  <span><ChevronRight size={15} /></span>
                </button>
                <button type="button" className="icon-button history-delete" disabled={!deletable} onClick={() => onDeleteRuns([run])} title={text('删除记录', 'Delete history')} aria-label={text(`删除“${run.prompt}”记录`, `Delete history for "${run.prompt}"`)}><Trash2 size={14} /></button>
              </div>
            )
          }) : filteredMaintenanceRuns.map((run) => {
            const completed = run.operations.filter((operation) => operation.status === 'completed')
            const recovery = completed.find((operation) => operation.recoveryAvailable)
            const estimatedBytes = completed.reduce((sum, operation) => sum + (operation.estimatedBytes ?? 0), 0)
            return (
              <div className="history-entry" key={run.id}>
                <label className="history-check history-row-check"><input type="checkbox" checked={selectedIds.has(run.id)} disabled={run.status === 'running'} onChange={() => toggleSelected(run.id)} aria-label={text(`选择“${run.title}”`, `Select "${run.title}"`)} /></label>
                <div className="history-row maintenance-history-row">
                  <span className="history-title"><strong>{run.title}</strong><small>{maintenanceSourceLabel(run.source, language)} · {run.operations.map((operation) => operation.title).join('；')}</small></span>
                  <span><span className={`risk-label ${run.status === 'completed' ? 'safe' : run.status === 'failed' ? 'danger' : 'review'}`}>{maintenanceStatusLabel(run.status, language)}</span></span>
                  <span>{formatDateTime(run.createdAt, language)}</span>
                  <span>{estimatedBytes ? formatBytes(estimatedBytes) : text(`${completed.length}/${run.operations.length} 项完成`, `${completed.length}/${run.operations.length} completed`)}</span>
                  <span>{recovery && <button type="button" className="icon-button history-recovery" onClick={() => onRevealRecovery(recovery.id)} title={recovery.recoveryMode === 'trash' ? text('打开废纸篓', 'Open Trash') : text('显示配置备份', 'Show configuration backup')} aria-label={recovery.recoveryMode === 'trash' ? text('打开废纸篓', 'Open Trash') : text('显示配置备份', 'Show configuration backup')}><FolderOpen size={14} /></button>}</span>
                </div>
                <button type="button" className="icon-button history-delete" disabled={run.status === 'running'} onClick={() => onDeleteMaintenanceRuns([run])} title={text('删除审计记录', 'Delete audit record')} aria-label={text(`删除“${run.title}”记录`, `Delete history for "${run.title}"`)}><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="history-empty">{query.trim() ? <Search size={20} /> : mode === 'agent' ? <History size={20} /> : <Wrench size={20} />}<strong>{query.trim() ? text('没有匹配的记录', 'No matching records') : mode === 'agent' ? text('还没有 Agent 对话', 'No Agent history yet') : text('还没有维护记录', 'No maintenance history yet')}</strong><span>{query.trim() ? text(`当前共 ${total} 条记录`, `${total} total records`) : mode === 'agent' ? text('在 Agent 页面开始第一个任务。', 'Start the first task from Agent.') : text('完成直接清理、终端优化或 Agent 计划后会显示在这里。', 'Direct cleanup, terminal fixes, and Agent plans appear here.')}</span></div>
      )}
    </section>
  )
}

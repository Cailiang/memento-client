import { ChevronRight, History, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime, runStatusLabel } from './utils'

export function HistoryPage({
  runs,
  onOpenRun,
  onDeleteRuns
}: {
  runs: AgentRunRecord[]
  onOpenRun: (run: AgentRunRecord) => void
  onDeleteRuns: (runs: AgentRunRecord[]) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const filteredRuns = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return runs
    return runs.filter((run) => [
      run.prompt,
      run.providerName,
      run.model,
      runStatusLabel(run.status, language),
      run.response ?? '',
      run.error ?? ''
    ].some((value) => value.toLocaleLowerCase().includes(normalized)))
  }, [language, query, runs])
  const deletableRuns = useMemo(() => filteredRuns.filter((run) => ![
    'preparing', 'analyzing', 'plan-ready', 'executing', 'verifying'
  ].includes(run.status)), [filteredRuns])
  const selectedRuns = filteredRuns.filter((run) => selectedIds.has(run.id))
  const allFilteredSelected = deletableRuns.length > 0 && deletableRuns.every((run) => selectedIds.has(run.id))
  const someFilteredSelected = deletableRuns.some((run) => selectedIds.has(run.id))

  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((id) => runs.some((run) => run.id === id))))
  }, [runs])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected
    }
  }, [allFilteredSelected, someFilteredSelected])

  return (
    <section className="page content-page is-active">
      <div className="page-command-bar">
        <span className="page-command-summary">{query.trim()
          ? text(`找到 ${filteredRuns.length} 条，共 ${runs.length} 条任务记录`, `${filteredRuns.length} of ${runs.length} task records`)
          : text(`共 ${runs.length} 条本机任务记录`, `${runs.length} local task records`)}</span>
        <div className="history-command-actions">
          {selectedRuns.length > 0 && <button type="button" className="danger-button history-bulk-delete" onClick={() => onDeleteRuns(selectedRuns)}><Trash2 size={14} />{text(`删除所选（${selectedRuns.length}）`, `Delete selected (${selectedRuns.length})`)}</button>}
          <label className="search-field history-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('搜索任务、模型或状态', 'Search tasks, models, or status')} aria-label={text('搜索任务记录', 'Search task history')} /></label>
        </div>
      </div>

      {filteredRuns.length ? (
        <div className="history-table">
          <div className="history-head">
            <label className="history-check"><input ref={selectAllRef} type="checkbox" checked={allFilteredSelected} disabled={!deletableRuns.length} onChange={() => setSelectedIds((current) => {
              const next = new Set(current)
              if (allFilteredSelected) deletableRuns.forEach((run) => next.delete(run.id))
              else deletableRuns.forEach((run) => next.add(run.id))
              return next
            })} aria-label={text('全选当前任务记录', 'Select all filtered task history')} /></label>
            <span>{text('任务', 'Task')}</span><span>{text('状态', 'Status')}</span><span>{text('时间', 'Time')}</span><span>{text('结果', 'Result')}</span><span />
          </div>
          {filteredRuns.map((run) => {
            const reclaimed = run.plan.reduce((sum, item) => sum + item.estimatedBytes, 0)
            return (
              <div className="history-entry" key={run.id}>
                <label className="history-check history-row-check"><input type="checkbox" checked={selectedIds.has(run.id)} disabled={!deletableRuns.includes(run)} onChange={() => setSelectedIds((current) => {
                  const next = new Set(current)
                  if (next.has(run.id)) next.delete(run.id)
                  else next.add(run.id)
                  return next
                })} aria-label={text(`选择“${run.prompt}”`, `Select "${run.prompt}"`)} /></label>
                <button type="button" className="history-row" onClick={() => onOpenRun(run)}>
                  <span className="history-title"><strong>{run.prompt}</strong><small>{text(`${run.plan.length} 个计划步骤 · ${run.providerName} ${run.model}`, `${run.plan.length} plan steps · ${run.providerName} ${run.model}`)}</small></span>
                  <span><span className={`risk-label ${run.status === 'completed' ? 'safe' : run.status === 'failed' ? 'danger' : 'review'}`}>{runStatusLabel(run.status, language)}</span></span>
                  <span>{formatDateTime(run.createdAt, language)}</span>
                  <span>{run.results.length
                    ? text(`${run.results.filter((item) => item.ok).length} 项完成`, `${run.results.filter((item) => item.ok).length} completed`)
                    : reclaimed
                      ? formatBytes(reclaimed)
                      : text('只读分析', 'Read-only')}</span>
                  <span><ChevronRight size={15} /></span>
                </button>
                <button type="button" className="icon-button history-delete" disabled={!deletableRuns.includes(run)} onClick={() => onDeleteRuns([run])} title={text('删除记录', 'Delete history')} aria-label={text(`删除“${run.prompt}”记录`, `Delete history for "${run.prompt}"`)}>
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="history-empty">{query.trim() ? <Search size={20} /> : <History size={20} />}<strong>{query.trim() ? text('没有匹配的任务', 'No matching tasks') : text('还没有任务记录', 'No task history yet')}</strong><span>{query.trim() ? text('尝试搜索任务内容、模型名称或状态。', 'Try a task, model, or status.') : text('在 Agent 页面开始第一个任务。', 'Start the first task from Agent.')}</span></div>
      )}
    </section>
  )
}

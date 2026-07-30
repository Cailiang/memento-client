import { ChevronRight, History, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime, runStatusLabel } from './utils'

export function HistoryPage({
  runs,
  onOpenRun,
  onDeleteRun
}: {
  runs: AgentRunRecord[]
  onOpenRun: (run: AgentRunRecord) => void
  onDeleteRun: (run: AgentRunRecord) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [query, setQuery] = useState('')
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

  return (
    <section className="page content-page is-active">
      <div className="page-command-bar">
        <span className="page-command-summary">{query.trim()
          ? text(`找到 ${filteredRuns.length} 条，共 ${runs.length} 条任务记录`, `${filteredRuns.length} of ${runs.length} task records`)
          : text(`共 ${runs.length} 条本机任务记录`, `${runs.length} local task records`)}</span>
        <label className="search-field history-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text('搜索任务、模型或状态', 'Search tasks, models, or status')} aria-label={text('搜索任务记录', 'Search task history')} /></label>
      </div>

      {filteredRuns.length ? (
        <div className="history-table">
          <div className="history-head"><span>{text('任务', 'Task')}</span><span>{text('状态', 'Status')}</span><span>{text('时间', 'Time')}</span><span>{text('结果', 'Result')}</span><span /></div>
          {filteredRuns.map((run) => {
            const reclaimed = run.plan.reduce((sum, item) => sum + item.estimatedBytes, 0)
            return (
              <div className="history-entry" key={run.id}>
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
                <button type="button" className="icon-button history-delete" onClick={() => onDeleteRun(run)} title={text('删除记录', 'Delete history')} aria-label={text(`删除“${run.prompt}”记录`, `Delete history for "${run.prompt}"`)}>
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

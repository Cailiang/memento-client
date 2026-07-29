import { ChevronRight, Download, History, Trash2 } from 'lucide-react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import { useI18n } from '../i18n'
import { formatBytes, formatDateTime, runStatusLabel } from './utils'

export function HistoryPage({
  runs,
  onOpenRun,
  onDeleteRun,
  onToast
}: {
  runs: AgentRunRecord[]
  onOpenRun: (run: AgentRunRecord) => void
  onDeleteRun: (run: AgentRunRecord) => void
  onToast: (message: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()

  const exportRuns = (): void => {
    const source = JSON.stringify(runs, null, 2)
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `memento-agent-history-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    onToast(text('已导出任务记录', 'Task history exported'))
  }

  return (
    <section className="page content-page is-active">
      <header className="page-heading">
        <div><h1>{text('任务记录', 'Task history')}</h1><p>{text('每次分析、工具调用和执行结果都会保存在本机。', 'Analyses, tool calls, and results are stored locally.')}</p></div>
        <div className="page-heading-actions"><button type="button" className="secondary-button" onClick={exportRuns} disabled={!runs.length}><Download size={16} />{text('导出', 'Export')}</button></div>
      </header>

      {runs.length ? (
        <div className="history-table">
          <div className="history-head"><span>{text('任务', 'Task')}</span><span>{text('状态', 'Status')}</span><span>{text('时间', 'Time')}</span><span>{text('结果', 'Result')}</span><span /></div>
          {runs.map((run) => {
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
        <div className="history-empty"><History size={20} /><strong>{text('还没有任务记录', 'No task history yet')}</strong><span>{text('在 Agent 页面开始第一个任务。', 'Start the first task from Agent.')}</span></div>
      )}
    </section>
  )
}

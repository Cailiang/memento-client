import {
  ArrowLeft,
  ArrowUp,
  Check,
  CircleCheck,
  Clock3,
  HardDrive,
  ListChecks,
  LoaderCircle,
  Play,
  RadioTower,
  Sparkles,
  SquarePen,
  SquareTerminal,
  UserRound,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import type { ScanResult } from '../../../shared/types'
import { useI18n } from '../i18n'
import { AgentMarkdown } from './AgentMarkdown'
import { AgentResults } from './AgentResults'
import { formatBytes, runStatusLabel } from './utils'

const QUICK_ACTIONS: Array<{
  icon: typeof HardDrive
  title: [string, string]
  detail: [string, string]
  prompt: [string, string]
}> = [
  {
    icon: HardDrive,
    title: ['释放磁盘空间', 'Free disk space'],
    detail: ['检查缓存、旧文件和应用占用', 'Inspect caches, old files, and applications'],
    prompt: ['帮我深度检查磁盘空间，找出可以安全清理的内容', 'Inspect disk usage and find content that can be cleaned safely']
  },
  {
    icon: RadioTower,
    title: ['检查后台服务', 'Check services'],
    detail: ['定位异常启动项和常驻进程', 'Find unusual startup items and processes'],
    prompt: ['检查最近拖慢电脑的后台服务，并给出处理计划', 'Inspect background services that may slow this computer and prepare a plan']
  },
  {
    icon: SquareTerminal,
    title: ['优化终端启动', 'Optimize terminal'],
    detail: ['分析配置耗时并准备可撤销修复', 'Analyze startup cost and prepare reversible fixes'],
    prompt: ['检查终端启动速度并自动修复可以安全处理的问题', 'Inspect terminal startup and prepare safe automatic fixes']
  }
]

function runIsBusy(run: AgentRunRecord | null): boolean {
  return Boolean(run && ['preparing', 'analyzing', 'plan-ready', 'executing', 'verifying'].includes(run.status))
}

function AgentProgress({
  run,
  statusMessage
}: {
  run: AgentRunRecord
  statusMessage: string
}): React.JSX.Element {
  const { text } = useI18n()
  const phase = run.status === 'preparing'
    ? 0
    : run.status === 'analyzing'
      ? 1
      : run.status === 'executing'
        ? 2
        : 3
  const ranges: Record<AgentRunRecord['status'], [number, number]> = {
    preparing: [8, 20],
    analyzing: [22, 87],
    'plan-ready': [88, 94],
    'awaiting-confirmation': [100, 100],
    executing: [12, 80],
    verifying: [82, 96],
    completed: [100, 100],
    cancelled: [100, 100],
    failed: [100, 100]
  }
  const [progress, setProgress] = useState(ranges[run.status][0])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    const [start, cap] = ranges[run.status]
    setProgress(start)
    setElapsedSeconds(0)
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1)
      setProgress((current) => Math.min(cap, current + Math.max(0.35, (cap - current) * 0.035)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [run.id, run.status])

  const roundedProgress = Math.round(progress)
  const stages = [
    text('读取', 'Read'),
    text('分析', 'Analyze'),
    text('核对', 'Review'),
    text('整理', 'Compose')
  ]
  return (
    <div className="activity-block agent-progress" role="status" aria-live="polite">
      <div className="agent-progress-head">
        <span className="agent-progress-mark"><Sparkles size={16} /></span>
        <span className="agent-progress-copy"><strong>{statusMessage || runStatusLabel(run.status, run.language)}</strong><small>{elapsedSeconds < 2 ? text('Agent 正在建立分析上下文', 'Agent is building analysis context') : text(`已用 ${elapsedSeconds} 秒`, `${elapsedSeconds}s elapsed`)}</small></span>
        <span className="agent-progress-value">{roundedProgress}%</span>
      </div>
      <div className="agent-progress-track" role="progressbar" aria-label={text('Agent 分析进度', 'Agent analysis progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roundedProgress}><span style={{ width: `${roundedProgress}%` }} /></div>
      <div className="agent-progress-stages">{stages.map((stage, index) => <span className={index <= phase ? 'is-active' : ''} key={stage}><i />{stage}</span>)}</div>
    </div>
  )
}

export function AgentPage({
  scan,
  run,
  conversationRuns,
  statusMessage,
  selectedPlanIds,
  providerConfigured,
  addingOperationId,
  openingApplicationId,
  returnLabel,
  onSubmit,
  onNewTask,
  onOpenHistory,
  onOpenSettings,
  onReturn,
  onOpenApplication,
  onAddPlanItem,
  onTogglePlanItem,
  onExecutePlan,
  onDiscardPlan
}: {
  scan: ScanResult | null
  run: AgentRunRecord | null
  conversationRuns: AgentRunRecord[]
  statusMessage: string
  selectedPlanIds: Set<string>
  providerConfigured: boolean
  addingOperationId: string | null
  openingApplicationId: string | null
  returnLabel: string | null
  onSubmit: (prompt: string) => void
  onNewTask: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onReturn: () => void
  onOpenApplication: (id: string) => void
  onAddPlanItem: (id: string) => void
  onTogglePlanItem: (id: string) => void
  onExecutePlan: () => void
  onDiscardPlan: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [input, setInput] = useState('')
  const conversationRef = useRef<HTMLDivElement>(null)
  const busy = runIsBusy(run)
  const waitingConfirmation = run?.status === 'awaiting-confirmation'
  const selectedItems = run?.plan.filter((item) => selectedPlanIds.has(item.id)) ?? []
  const selectedBytes = selectedItems.reduce((sum, item) => sum + item.estimatedBytes, 0)
  const activePlannedIds = new Set(run?.plan.map((item) => item.id) ?? [])
  const completedPlanIds = new Set(run?.results.filter((result) => result.ok).map((result) => result.id) ?? [])

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [conversationRuns.length, run?.status, run?.updatedAt, statusMessage])

  const submit = (): void => {
    const prompt = input.trim()
    if (!prompt || busy) return
    if (!providerConfigured) {
      onOpenSettings()
      return
    }
    setInput('')
    onSubmit(prompt)
  }

  return (
    <section className="page agent-page is-active">
      <div className="agent-main">
        <header className="agent-heading">
          <div>
            <h1>{text('今天想处理什么？', 'What would you like to handle?')}</h1>
            <p>{text(
              'Agent 可以检查问题、准备计划，并在确认后完成处理。',
              'Agent can inspect issues, prepare a plan, and act after confirmation.'
            )}</p>
          </div>
          <div className="session-menu">
            {returnLabel && <button type="button" className="secondary-button return-origin-button" onClick={onReturn}><ArrowLeft size={15} />{text(`返回${returnLabel}`, `Back to ${returnLabel}`)}</button>}
            <button type="button" className="icon-button" onClick={onNewTask} disabled={busy} title={text('新任务', 'New task')} aria-label={text('新任务', 'New task')}>
              <SquarePen size={16} />
            </button>
            <button type="button" className="icon-button" onClick={onOpenHistory} title={text('任务记录', 'History')} aria-label={text('任务记录', 'History')}>
              <Clock3 size={16} />
            </button>
          </div>
        </header>

        <div className="conversation" ref={conversationRef} aria-live="polite">
          <div className="message assistant">
            <span className="message-avatar"><Sparkles size={16} /></span>
            <div className="message-body">
              <p><strong>{text('设备已经准备好。', 'The device is ready.')}</strong> {scan
                ? text(
                    `最近一次体检发现 ${scan.candidates.length} 项内容，你可以继续深度检查或直接管理应用。`,
                    `The latest scan found ${scan.candidates.length} items. You can inspect further or manage applications.`
                  )
                : text('正在准备第一次电脑体检。', 'Preparing the first health scan.')}</p>
            </div>
          </div>

          {!conversationRuns.length && (
            <div className="quick-actions">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button key={action.title[0]} type="button" className="quick-action" onClick={() => onSubmit(text(...action.prompt))} disabled={!providerConfigured}>
                    <span><Icon size={16} /></span>
                    <span><strong>{text(...action.title)}</strong><small>{text(...action.detail)}</small></span>
                  </button>
                )
              })}
            </div>
          )}

          {conversationRuns.map((conversationRun) => {
            const isActive = conversationRun.id === run?.id
            const runBusy = isActive && busy
            const runBytes = conversationRun.plan.reduce((sum, item) => sum + item.estimatedBytes, 0)
            return (
              <div className="conversation-turn" key={conversationRun.id}>
                <div className="message user">
                  <div className="message-body"><p>{conversationRun.prompt}</p></div>
                  <span className="message-avatar"><UserRound size={15} /></span>
                </div>
                <div className="message assistant">
                  <span className="message-avatar"><Sparkles size={16} /></span>
                  <div className="message-body">
                    {runBusy && <AgentProgress run={conversationRun} statusMessage={statusMessage} />}
                    {(conversationRun.status === 'failed' || conversationRun.status === 'cancelled') && (
                      <div className="activity-block">
                        <div className="activity-row is-done">
                          <span className="activity-icon">{conversationRun.status === 'failed' ? <X size={13} /> : <CircleCheck size={13} />}</span>
                          <span>{isActive && statusMessage ? statusMessage : runStatusLabel(conversationRun.status, language)}</span>
                          <small>{runStatusLabel(conversationRun.status, language)}</small>
                        </div>
                      </div>
                    )}
                    {(conversationRun.presentation?.summary || conversationRun.response) && (
                      <AgentMarkdown>{conversationRun.presentation?.summary ?? conversationRun.response ?? ''}</AgentMarkdown>
                    )}
                    {conversationRun.presentation && (
                      <AgentResults
                        presentation={conversationRun.presentation}
                        plannedIds={activePlannedIds}
                        addingOperationId={isActive ? addingOperationId : null}
                        openingApplicationId={openingApplicationId}
                        onOpenApplication={onOpenApplication}
                        onAddPlanItem={onAddPlanItem}
                      />
                    )}
                    {conversationRun.error && <p role="alert" className="error-copy">{conversationRun.error}</p>}
                    {conversationRun.status === 'completed' && conversationRun.results.length > 0 && (
                      <div className="result-summary">
                        <div><strong>{conversationRun.results.filter((item) => item.ok).length}</strong><span>{text('已完成', 'Completed')}</span></div>
                        <div><strong>{conversationRun.results.filter((item) => !item.ok).length}</strong><span>{text('未完成', 'Failed')}</span></div>
                        <div><strong>{formatBytes(runBytes)}</strong><span>{text('计划处理空间', 'Planned space')}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); submit() }}>
            <textarea
              rows={1}
              aria-label={text('输入任务', 'Enter task')}
              placeholder={providerConfigured
                ? text('描述你想检查或处理的问题', 'Describe what you want to inspect or handle')
                : text('请先在设置中配置模型供应商', 'Configure a model provider in Settings first')}
              value={input}
              disabled={busy}
              onChange={(event) => {
                setInput(event.target.value)
                event.currentTarget.style.height = 'auto'
                event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 112)}px`
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            <button type="submit" className="send-button" title={text('发送', 'Send')} aria-label={text('发送', 'Send')} disabled={!input.trim() || busy}>
              {busy ? <LoaderCircle className="spinner" size={17} /> : <ArrowUp size={17} />}
            </button>
          </form>
        </div>
      </div>

      <aside className="agent-rail" aria-label={text('当前任务', 'Current task')}>
        <div className="rail-header">
          <h2>{text('当前任务', 'Current task')}</h2>
          <span className="state-label">{run ? runStatusLabel(run.status, language) : text('等待任务', 'Waiting')}</span>
        </div>

        {!run?.plan.length ? (
          <div className="rail-empty">
            <div>
              <span><ListChecks size={18} /></span>
              <strong>{text('暂无执行计划', 'No execution plan')}</strong>
              <small>{text('在诊断结果中直接加入操作，或让 Agent 准备计划。', 'Add an action from a result or ask the Agent to prepare a plan.')}</small>
            </div>
          </div>
        ) : (
          <div className="plan-panel is-visible">
            <div className="plan-summary">
              <div><strong>{selectedBytes ? formatBytes(selectedBytes) : `${selectedItems.length}`}</strong><span>{selectedBytes ? text('预计处理空间', 'Estimated space') : text('待处理操作', 'Pending actions')}</span></div>
              <span className="risk-label review">{text(
                `包含 ${selectedItems.filter((item) => item.risk === 'review').length} 项确认`,
                `${selectedItems.filter((item) => item.risk === 'review').length} review items`
              )}</span>
            </div>
            <div className="plan-steps">
              {run.plan.map((item) => (
                <div className="plan-step" key={item.id}>
                  <label className="plan-check" title={text('选择此步骤', 'Select this step')}>
                    <input type="checkbox" checked={selectedPlanIds.has(item.id)} onChange={() => onTogglePlanItem(item.id)} disabled={!waitingConfirmation || completedPlanIds.has(item.id)} />
                    <span>{(selectedPlanIds.has(item.id) || completedPlanIds.has(item.id)) && <Check size={12} />}</span>
                  </label>
                  <div className="plan-step-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>
                  <div className="plan-step-meta"><strong>{item.estimatedBytes ? formatBytes(item.estimatedBytes) : text('操作', 'Action')}</strong><small>{completedPlanIds.has(item.id) ? text('已完成', 'Completed') : item.risk === 'review' ? text('需确认', 'Review') : text('待执行', 'Pending')}</small></div>
                </div>
              ))}
            </div>
            {waitingConfirmation && (
              <div className="plan-actions">
                <button type="button" className="primary-button" onClick={onExecutePlan} disabled={!selectedPlanIds.size}>
                  <Play size={15} />{text('确认并执行', 'Confirm and run')}
                </button>
                <button type="button" className="icon-button" onClick={onDiscardPlan} title={text('放弃计划', 'Discard plan')} aria-label={text('放弃计划', 'Discard plan')}>
                  <X size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </section>
  )
}

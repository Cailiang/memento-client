import {
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

export function AgentPage({
  scan,
  run,
  statusMessage,
  selectedPlanIds,
  providerConfigured,
  onSubmit,
  onNewTask,
  onOpenHistory,
  onOpenSettings,
  onTogglePlanItem,
  onExecutePlan,
  onDiscardPlan
}: {
  scan: ScanResult | null
  run: AgentRunRecord | null
  statusMessage: string
  selectedPlanIds: Set<string>
  providerConfigured: boolean
  onSubmit: (prompt: string) => void
  onNewTask: () => void
  onOpenHistory: () => void
  onOpenSettings: () => void
  onTogglePlanItem: (id: string) => void
  onExecutePlan: () => void
  onDiscardPlan: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)
  const busy = runIsBusy(run)
  const waitingConfirmation = run?.status === 'awaiting-confirmation'
  const selectedItems = run?.plan.filter((item) => selectedPlanIds.has(item.id)) ?? []
  const selectedBytes = selectedItems.reduce((sum, item) => sum + item.estimatedBytes, 0)

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }, [run?.status, run?.response, statusMessage])

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

          {!run && (
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

          {run && (
            <>
              <div className="message user">
                <div className="message-body"><p>{run.prompt}</p></div>
                <span className="message-avatar"><UserRound size={15} /></span>
              </div>
              <div className="message assistant">
                <span className="message-avatar"><Sparkles size={16} /></span>
                <div className="message-body">
                  {(busy || run.status === 'failed' || run.status === 'cancelled') && (
                    <div className="activity-block">
                      <div className={`activity-row ${busy ? 'is-running' : 'is-done'}`}>
                        <span className="activity-icon">{busy ? <LoaderCircle className="spinner" size={13} /> : <CircleCheck size={13} />}</span>
                        <span>{statusMessage || runStatusLabel(run.status, language)}</span>
                        <small>{runStatusLabel(run.status, language)}</small>
                      </div>
                    </div>
                  )}
                  {run.response && <p>{run.response}</p>}
                  {run.error && <p role="alert" className="error-copy">{run.error}</p>}
                  {run.status === 'completed' && run.results.length > 0 && (
                    <div className="result-summary">
                      <div><strong>{run.results.filter((item) => item.ok).length}</strong><span>{text('已完成', 'Completed')}</span></div>
                      <div><strong>{run.results.filter((item) => !item.ok).length}</strong><span>{text('未完成', 'Failed')}</span></div>
                      <div><strong>{formatBytes(selectedBytes)}</strong><span>{text('计划处理空间', 'Planned space')}</span></div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={(event) => { event.preventDefault(); submit() }}>
            <textarea
              ref={textareaRef}
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
              <small>{text('Agent 完成检查后，处理步骤会出现在这里。', 'Steps will appear here after inspection.')}</small>
            </div>
          </div>
        ) : (
          <div className="plan-panel is-visible">
            <div className="plan-summary">
              <div><strong>{formatBytes(selectedBytes)}</strong><span>{text('预计处理空间', 'Estimated space')}</span></div>
              <span className="risk-label review">{text(
                `包含 ${selectedItems.filter((item) => item.risk === 'review').length} 项确认`,
                `${selectedItems.filter((item) => item.risk === 'review').length} review items`
              )}</span>
            </div>
            <div className="plan-steps">
              {run.plan.map((item) => (
                <div className="plan-step" key={item.id}>
                  <label className="plan-check" title={text('选择此步骤', 'Select this step')}>
                    <input type="checkbox" checked={selectedPlanIds.has(item.id)} onChange={() => onTogglePlanItem(item.id)} disabled={!waitingConfirmation} />
                    <span>{selectedPlanIds.has(item.id) && <Check size={12} />}</span>
                  </label>
                  <div className="plan-step-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>
                  <div className="plan-step-meta"><strong>{item.estimatedBytes ? formatBytes(item.estimatedBytes) : text('操作', 'Action')}</strong><small>{item.risk === 'review' ? text('需确认', 'Review') : text('待执行', 'Pending')}</small></div>
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

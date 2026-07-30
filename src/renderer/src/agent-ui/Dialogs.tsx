import {
  Archive,
  AppWindow,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  Play,
  RadioTower,
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentRunRecord } from '../../../shared/agent-types'
import {
  applicationWhitelistValue,
  candidateWhitelistValue
} from '../../../shared/app-settings'
import type { DiskUsageNode, InstalledApplication, ScanCandidate } from '../../../shared/types'
import { useI18n } from '../i18n'
import { ApplicationIcon } from './ApplicationsPage'
import { formatBytes } from './utils'

function DialogFrame({
  title,
  description,
  wide = false,
  busy = false,
  onClose,
  children,
  actions
}: {
  title: string
  description: string
  wide?: boolean
  busy?: boolean
  onClose: () => void
  children?: React.ReactNode
  actions: React.ReactNode
}): React.JSX.Element {
  const { text } = useI18n()
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useRef(`dialog-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [busy, onClose])

  return (
    <div className="dialog-backdrop is-open" role="presentation" onMouseDown={() => !busy && onClose()}>
      <section ref={dialogRef} className={`dialog ${wide ? 'ignored-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId.current} onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header"><div><h2 id={titleId.current}>{title}</h2><p>{description}</p></div><button type="button" className="icon-button" onClick={onClose} disabled={busy} title={text('关闭', 'Close')} aria-label={text('关闭', 'Close')}><X size={16} /></button></header>
        {children}
        <footer className="dialog-actions">{actions}</footer>
      </section>
    </div>
  )
}

export interface DirectActionRequest {
  id: string
  kind: 'action' | 'terminal-fix'
  subject: string
  label: string
  consequence: string
  reversible: boolean
  estimatedBytes: number
}

export type ExecutionPhase = 'executing' | 'verifying' | 'completed' | 'failed'

export function DirectActionConfirmDialog({
  action,
  onClose,
  onConfirm
}: {
  action: DirectActionRequest
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <DialogFrame
      title={text(`直接执行“${action.label}”？`, `Run "${action.label}" directly?`)}
      description={text('不会经过 AI 分析；只执行下面这项已注册操作，完成后自动复检。', 'AI analysis is skipped. Only this registered action runs, followed by automatic verification.')}
      onClose={onClose}
      actions={<><button type="button" className="secondary-button" onClick={onClose}>{text('取消', 'Cancel')}</button><button type="button" className={action.reversible ? 'primary-button' : 'danger-button'} onClick={onConfirm}><Play size={15} />{text('确认并执行', 'Confirm and run')}</button></>}
    >
      <div className="dialog-body">
        <div className="confirm-row">
          <span>{action.reversible ? <ShieldCheck size={13} /> : <CircleAlert size={13} />}</span>
          <div><strong>{action.subject}</strong><small>{action.consequence}</small></div>
          <span className={`risk-label ${action.reversible ? 'safe' : 'review'}`}>{action.estimatedBytes ? formatBytes(action.estimatedBytes) : text('操作', 'Action')}</span>
        </div>
      </div>
    </DialogFrame>
  )
}

export function ExecutionProgressDialog({
  phase,
  progress,
  itemCount,
  completedCount,
  detail,
  onClose
}: {
  phase: ExecutionPhase
  progress: number
  itemCount: number
  completedCount: number
  detail: string
  onClose: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const finished = phase === 'completed' || phase === 'failed'
  const progressValue = Math.max(0, Math.min(100, Math.round(progress)))
  const title = phase === 'executing'
    ? text('正在执行已确认的操作', 'Running confirmed actions')
    : phase === 'verifying'
      ? text('正在重新体检', 'Verifying results')
      : phase === 'completed'
        ? text('处理完成', 'Actions completed')
        : text('部分操作未完成', 'Some actions did not complete')
  const stage = phase === 'executing'
    ? text('执行操作', 'Running actions')
    : phase === 'verifying'
      ? text('验证结果', 'Verifying')
      : phase === 'completed'
        ? text('复检通过', 'Verified')
        : text('需要查看', 'Review needed')
  return (
    <DialogFrame
      title={title}
      description={detail}
      busy={!finished}
      onClose={onClose}
      actions={<button type="button" className="secondary-button" onClick={onClose} disabled={!finished}>{text('完成', 'Done')}</button>}
    >
      <div className={`execution-stage is-${phase}`} role="status" aria-live="polite">
        <div className="cleanup-visual" aria-hidden="true">
          {!finished && <><i className="cleanup-file" /><i className="cleanup-file" /><i className="cleanup-file" /></>}
          <span className="cleanup-bin">{phase === 'completed' ? <CheckCircle2 size={27} /> : phase === 'failed' ? <CircleAlert size={27} /> : <Trash2 size={25} />}</span>
        </div>
        <div className="execution-copy"><strong>{stage}</strong><small>{phase === 'executing'
          ? text(`正在处理 ${itemCount} 项操作，请不要退出应用。`, `Running ${itemCount} ${itemCount === 1 ? 'action' : 'actions'}. Keep Memento open.`)
          : phase === 'verifying'
            ? text('正在重新扫描相关项目，确认操作已经生效。', 'Scanning the affected items to confirm the changes.')
            : detail}</small></div>
        <div className="execution-progress-head"><span>{stage}</span><strong>{progressValue}%</strong></div>
        <div className="execution-progress-track" role="progressbar" aria-label={text('处理进度', 'Action progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}><span style={{ width: `${progressValue}%` }} /></div>
        <div className="execution-steps"><span className="is-active">{text('执行', 'Run')}</span><span className={phase !== 'executing' ? 'is-active' : ''}>{text('复检', 'Verify')}</span><span className={finished ? 'is-active' : ''}>{text('完成', 'Done')}</span></div>
        {finished && <div className="execution-result"><strong>{completedCount} / {itemCount}</strong><span>{text('项操作完成', 'actions completed')}</span></div>}
      </div>
    </DialogFrame>
  )
}

export function UninstallDialog({
  application,
  busy,
  onClose,
  onConfirm
}: {
  application: InstalledApplication
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return <DialogFrame title={text(`卸载 ${application.name}`, `Uninstall ${application.name}`)} description={busy ? text('Memento 正在将应用移到废纸篓，请稍候。', 'Memento is moving the application to Trash. Please wait.') : text('应用本体将移到废纸篓，文稿、设置和其他应用数据会保留。', 'The application bundle will move to Trash. Documents, settings, and app data are kept.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在卸载', 'Uninstalling') : text('移到废纸篓', 'Move to Trash')}</button></>}>
    {busy && <div className="uninstall-progress" role="status" aria-live="polite"><span className="uninstall-progress-mark"><Trash2 size={20} /></span><div><strong>{text('正在卸载应用', 'Uninstalling application')}</strong><small>{text('操作完成后，此应用会自动从列表中移除。', 'The app will disappear from the list when the operation completes.')}</small></div></div>}
  </DialogFrame>
}

export function DiskUsageTrashDialog({
  node,
  busy,
  onClose,
  onConfirm
}: {
  node: DiskUsageNode
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const itemType = node.kind === 'directory' ? text('目录', 'Folder') : text('文件', 'File')
  return (
    <DialogFrame
      title={text(`将“${node.name}”移到废纸篓？`, `Move "${node.name}" to Trash?`)}
      description={node.kind === 'directory'
        ? text('整个目录及其中所有内容都会移到废纸篓。此操作不使用永久删除，但请先确认路径。', 'The entire folder and all of its contents will move to Trash. This is not a permanent deletion, but verify the path first.')
        : text('文件会移到废纸篓，不会直接永久删除。', 'The file will move to Trash and will not be deleted permanently.')}
      busy={busy}
      onClose={onClose}
      actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在移动', 'Moving') : text('移到废纸篓', 'Move to Trash')}</button></>}
    >
      <div className="dialog-body"><div className="confirm-row"><span><Trash2 size={13} /></span><div><strong>{node.location}</strong><small>{itemType} · {formatBytes(node.sizeBytes)}</small></div><span className="risk-label review">{text('需确认', 'Review')}</span></div></div>
    </DialogFrame>
  )
}

export function IgnoreConfirmDialog({
  candidate,
  busy,
  onClose,
  onConfirm
}: {
  candidate: ScanCandidate
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const storage = candidate.section === 'storage'
  const identity = candidateWhitelistValue(candidate) ?? candidate.name
  return (
    <DialogFrame title={text(`忽略 ${candidate.name}？`, `Ignore ${candidate.name}?`)} description={storage ? text('以后不会清理此项目，也不再计入可释放空间。', 'This item will not be cleaned or counted as reclaimable space.') : text('不会停止或移除该服务，后续体检和 Agent 都会跳过它。', 'The service is not changed. Future scans and Agent skip it.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <EyeOff size={15} />}{text('确认忽略', 'Ignore item')}</button></>}>
      <div className="dialog-body"><div className="confirm-row"><span><EyeOff size={13} /></span><div><strong>{candidate.name}</strong><small>{identity}</small></div><span className="risk-label safe">{text('可恢复', 'Restorable')}</span></div></div>
    </DialogFrame>
  )
}

export function ApplicationIgnoreConfirmDialog({
  application,
  busy,
  onClose,
  onConfirm
}: {
  application: InstalledApplication
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const identity = applicationWhitelistValue(application)
  return (
    <DialogFrame title={text(`忽略 ${application.name}？`, `Ignore ${application.name}?`)} description={text('不会卸载此应用，后续应用管理、体检建议和 Agent 都会跳过它。', 'The app is not uninstalled. Application Management, health recommendations, and Agent will skip it.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <EyeOff size={15} />}{text('确认忽略', 'Ignore application')}</button></>}>
      <div className="dialog-body"><div className="confirm-row"><span><AppWindow size={13} /></span><div><strong>{application.name}</strong><small>{identity}</small></div><span className="risk-label safe">{text('可恢复', 'Restorable')}</span></div></div>
    </DialogFrame>
  )
}

export function DeleteHistoryDialog({
  run,
  busy,
  onClose,
  onConfirm
}: {
  run: AgentRunRecord
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <DialogFrame title={text('删除任务记录？', 'Delete task history?')} description={text('这会删除本机保存的对话、分析结果和工具调用记录，无法恢复。', 'This permanently deletes the locally stored conversation, analysis results, and tool-call records.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在删除', 'Deleting') : text('删除记录', 'Delete history')}</button></>}>
      <div className="dialog-body"><div className="confirm-row"><span><Archive size={13} /></span><div><strong>{run.prompt}</strong><small>{text('只删除历史数据，不会撤销已经完成的操作', 'Completed system changes are not undone')}</small></div><span className="risk-label review">{text('不可恢复', 'Permanent')}</span></div></div>
    </DialogFrame>
  )
}

export function IgnoredItemsDialog({
  initialKind,
  serviceValues,
  storageValues,
  applicationValues,
  ignoredApplications,
  busyValue,
  onRestore,
  onClose
}: {
  initialKind: 'storage' | 'services' | 'applications'
  serviceValues: string[]
  storageValues: string[]
  applicationValues: string[]
  ignoredApplications: InstalledApplication[]
  busyValue: string | null
  onRestore: (kind: 'services' | 'storage' | 'applications', value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [kind, setKind] = useState<'storage' | 'services' | 'applications'>(initialKind)
  const [search, setSearch] = useState('')
  const values = kind === 'storage' ? storageValues : kind === 'services' ? serviceValues : applicationValues
  const applicationByValue = useMemo(() => new Map(
    ignoredApplications.map((application) => [applicationWhitelistValue(application), application])
  ), [ignoredApplications])
  const filteredValues = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return values
    return values.filter((value) => {
      const application = kind === 'applications' ? applicationByValue.get(value) : undefined
      return [value, application?.name, application?.bundleId, application?.location]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    })
  }, [applicationByValue, kind, search, values])
  const selectKind = (next: typeof kind): void => {
    setKind(next)
    setSearch('')
  }
  return (
    <DialogFrame wide title={text('忽略列表', 'Ignored items')} description={text('这些项目不会出现在体检建议中，Agent 也无法处理。', 'These items stay out of health recommendations and cannot be changed by Agent.')} busy={busyValue !== null} onClose={onClose} actions={<button type="button" className="secondary-button" onClick={onClose} disabled={busyValue !== null}>{text('完成', 'Done')}</button>}>
      <div className="ignored-tabs" role="tablist" aria-label={text('忽略项目类型', 'Ignored item type')}><button type="button" role="tab" aria-selected={kind === 'storage'} className={`ignored-tab ${kind === 'storage' ? 'is-active' : ''}`} onClick={() => selectKind('storage')}>{text('存储空间', 'Storage')} <span>{storageValues.length}</span></button><button type="button" role="tab" aria-selected={kind === 'services'} className={`ignored-tab ${kind === 'services' ? 'is-active' : ''}`} onClick={() => selectKind('services')}>{text('后台服务', 'Services')} <span>{serviceValues.length}</span></button><button type="button" role="tab" aria-selected={kind === 'applications'} className={`ignored-tab ${kind === 'applications' ? 'is-active' : ''}`} onClick={() => selectKind('applications')}>{text('应用', 'Applications')} <span>{applicationValues.length}</span></button></div>
      <label className="ignored-search search-field">
        <Search size={15} />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={kind === 'applications' ? text('搜索应用名称、Bundle ID 或路径', 'Search app name, Bundle ID, or path') : text('搜索名称或路径', 'Search name or path')} aria-label={text('搜索忽略项目', 'Search ignored items')} />
      </label>
      <div className="ignored-list">
        {filteredValues.length ? filteredValues.map((value) => {
          const application = kind === 'applications' ? applicationByValue.get(value) : undefined
          const name = kind === 'storage'
            ? value.split('/').filter(Boolean).at(-1) ?? value
            : application?.name ?? (kind === 'applications' ? value.split('.').at(-1) ?? value : value)
          const detail = application
            ? [application.bundleId, application.location].filter(Boolean).join(' · ')
            : value
          return <div className="ignored-row" key={value}>{application ? <ApplicationIcon application={application} /> : <span>{kind === 'storage' ? <Archive size={14} /> : kind === 'services' ? <RadioTower size={14} /> : <AppWindow size={14} />}</span>}<div><strong>{name}</strong><small>{detail}</small></div><button type="button" className="quiet-button" onClick={() => onRestore(kind, value)} disabled={busyValue !== null}>{busyValue === value ? <LoaderCircle className="spinner" size={14} /> : <Eye size={14} />}{text('恢复检测', 'Restore')}</button></div>
        }) : <div className="ignored-empty"><div>{search ? <Search size={18} /> : <CheckCircle2 size={18} />}<span>{search ? text('没有匹配的忽略项目', 'No ignored items match') : kind === 'storage' ? text('没有忽略的存储项目', 'No ignored storage') : kind === 'services' ? text('没有忽略的后台服务', 'No ignored services') : text('没有忽略的应用', 'No ignored applications')}</span></div></div>}
      </div>
    </DialogFrame>
  )
}

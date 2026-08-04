import {
  Archive,
  AppWindow,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Play,
  RadioTower,
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentProvider, AgentRunRecord } from '../../../shared/agent-types'
import type { MaintenanceRunRecord } from '../../../shared/maintenance-types'
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
  candidateId?: string
  candidateIds?: string[]
  ids?: string[]
  kind: 'action' | 'terminal-fix'
  verificationMode: 'local' | 'scan'
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
  const itemCount = action.ids?.length ?? 1
  return (
    <DialogFrame
      title={itemCount > 1
        ? text(`确认清理 ${itemCount} 项？`, `Clean ${itemCount} items?`)
        : text(`直接执行“${action.label}”？`, `Run "${action.label}" directly?`)}
      description={action.verificationMode === 'local'
        ? text('不会经过 AI 分析；只执行当前扫描已经注册并再次通过路径校验的操作，完成后更新列表。', 'AI analysis is skipped. Only actions registered by the current scan and validated again will run, followed by a list update.')
        : text('不会经过 AI 分析；只执行下面这项已注册操作，完成后自动复检。', 'AI analysis is skipped. Only this registered action runs, followed by automatic verification.')}
      onClose={onClose}
      actions={<><button type="button" className="secondary-button" onClick={onClose}>{text('取消', 'Cancel')}</button><button type="button" className={action.reversible ? 'primary-button' : 'danger-button'} onClick={onConfirm}><Play size={15} />{text('确认并执行', 'Confirm and run')}</button></>}
    >
      <div className="dialog-body">
        <div className="confirm-row">
          <span>{action.reversible ? <ShieldCheck size={13} /> : <CircleAlert size={13} />}</span>
          <div><strong>{action.subject}</strong><small>{action.consequence}</small></div>
          <span className={`risk-label ${action.reversible ? 'safe' : 'review'}`}>{action.estimatedBytes ? formatBytes(action.estimatedBytes) : action.ids && action.ids.length > 1 ? text(`${action.ids.length} 项`, `${action.ids.length} items`) : text('操作', 'Action')}</span>
        </div>
      </div>
    </DialogFrame>
  )
}

export function ExecutionProgressDialog({
  phase,
  verificationMode,
  progress,
  itemCount,
  completedCount,
  detail,
  onClose
}: {
  phase: ExecutionPhase
  verificationMode: 'local' | 'scan'
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
      ? verificationMode === 'local'
        ? text('正在更新存储列表', 'Updating storage list')
        : text('正在重新体检', 'Verifying results')
      : phase === 'completed'
        ? text('处理完成', 'Actions completed')
        : text('部分操作未完成', 'Some actions did not complete')
  const stage = phase === 'executing'
    ? text('执行操作', 'Running actions')
    : phase === 'verifying'
      ? verificationMode === 'local'
        ? text('更新列表', 'Updating list')
        : text('验证结果', 'Verifying')
      : phase === 'completed'
        ? text('复检通过', 'Verified')
        : text('需要查看', 'Review needed')
  const stageIndex = phase === 'executing' ? 0 : phase === 'verifying' ? 1 : 2
  const StatusIcon = phase === 'executing'
    ? verificationMode === 'local' ? Trash2 : Play
    : phase === 'verifying'
      ? verificationMode === 'local' ? Archive : Search
      : phase === 'completed'
        ? CheckCircle2
        : CircleAlert
  const stages = [
    { label: text('执行', 'Run'), icon: verificationMode === 'local' ? Trash2 : Play },
    { label: verificationMode === 'local' ? text('更新', 'Update') : text('复检', 'Verify'), icon: verificationMode === 'local' ? Archive : Search },
    { label: text('完成', 'Done'), icon: CheckCircle2 }
  ]
  return (
    <DialogFrame
      title={title}
      description={detail}
      busy={!finished}
      onClose={onClose}
      actions={<button type="button" className="secondary-button" onClick={onClose} disabled={!finished}>{text('完成', 'Done')}</button>}
    >
      <div className={`execution-stage is-${phase} is-${verificationMode}`} role="status" aria-live="polite">
        <div className="execution-overview">
          <span className="execution-status-mark" aria-hidden="true"><StatusIcon size={22} /></span>
          <div className="execution-copy">
            <small>{text('当前阶段', 'Current stage')}</small>
            <strong>{stage}</strong>
            <span>{phase === 'executing'
              ? text(`正在处理 ${itemCount} 项已确认操作`, `Running ${itemCount} confirmed ${itemCount === 1 ? 'action' : 'actions'}`)
              : phase === 'verifying'
                ? verificationMode === 'local'
                  ? text('正在确认删除结果并更新当前列表', 'Confirming the deletion and updating the current list')
                  : text('正在核对操作结果与设备状态', 'Checking action results and device state')
                : detail}</span>
          </div>
          <strong className="execution-progress-value">{progressValue}%</strong>
        </div>
        <div className="execution-progress-track" role="progressbar" aria-label={text('处理进度', 'Action progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
          <span style={{ width: `${progressValue}%` }}><i /></span>
        </div>
        <ol className="execution-pipeline">
          {stages.map((item, index) => {
            const Icon = item.icon
            const state = phase === 'completed'
              ? 'complete'
              : phase === 'failed' && index === 2
                ? 'failed'
                : index < stageIndex
                  ? 'complete'
                  : index === stageIndex
                    ? 'active'
                    : 'pending'
            return (
              <li className={`is-${state}`} key={item.label}>
                <span className="execution-phase-icon">{state === 'complete' ? <CheckCircle2 size={16} /> : <Icon size={16} />}</span>
                <span><strong>{item.label}</strong><small>{state === 'complete'
                  ? text('已完成', 'Complete')
                  : state === 'active'
                    ? text('进行中', 'In progress')
                    : state === 'failed'
                      ? text('未完成', 'Incomplete')
                      : text('等待', 'Waiting')}</small></span>
              </li>
            )
          })}
        </ol>
        {finished && <div className="execution-result"><span>{phase === 'completed' ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}</span><strong>{completedCount} / {itemCount}</strong><small>{text('项操作完成', 'actions completed')}</small></div>}
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
  runs,
  busy,
  onClose,
  onConfirm
}: {
  runs: AgentRunRecord[]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const multiple = runs.length > 1
  return (
    <DialogFrame title={text(multiple ? `删除 ${runs.length} 条任务记录？` : '删除任务记录？', multiple ? `Delete ${runs.length} task records?` : 'Delete task history?')} description={text('这会删除本机保存的对话、分析结果和工具调用记录，无法恢复。', 'This permanently deletes the locally stored conversation, analysis results, and tool-call records.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在删除', 'Deleting') : text(multiple ? '全部删除' : '删除记录', multiple ? 'Delete all' : 'Delete history')}</button></>}>
      <div className="dialog-body"><div className="confirm-row"><span><Archive size={13} /></span><div><strong>{multiple ? text(`${runs.length} 条所选记录`, `${runs.length} selected records`) : runs[0]?.prompt}</strong><small>{text('只删除历史数据，不会撤销已经完成的操作', 'Completed system changes are not undone')}</small></div><span className="risk-label review">{text('不可恢复', 'Permanent')}</span></div></div>
    </DialogFrame>
  )
}

export function DeleteMaintenanceHistoryDialog({
  runs,
  busy,
  onClose,
  onConfirm
}: {
  runs: MaintenanceRunRecord[]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const multiple = runs.length > 1
  return (
    <DialogFrame title={text(multiple ? `删除 ${runs.length} 条维护记录？` : '删除维护记录？', multiple ? `Delete ${runs.length} maintenance records?` : 'Delete maintenance history?')} description={text('只会删除本机审计记录，不会删除废纸篓项目、终端备份，也不会撤销已完成的系统操作。', 'Only local audit records are deleted. Trash items, terminal backups, and completed system changes are not affected.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在删除', 'Deleting') : text('删除记录', 'Delete history')}</button></>}>
      <div className="dialog-body"><div className="confirm-row"><span><Archive size={13} /></span><div><strong>{multiple ? text(`${runs.length} 条所选记录`, `${runs.length} selected records`) : runs[0]?.title}</strong><small>{text('文件系统目标和恢复材料都会保留', 'File-system targets and recovery materials remain')}</small></div><span className="risk-label review">{text('仅删记录', 'Records only')}</span></div></div>
    </DialogFrame>
  )
}

export function DeleteProviderDialog({
  provider,
  busy,
  onClose,
  onConfirm
}: {
  provider: AgentProvider
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <DialogFrame
      title={text(`删除“${provider.name}”配置？`, `Delete “${provider.name}”?`)}
      description={text(
        '将从 Memento 删除该供应商、加密密钥和连接状态。不会修改 Claude、Codex、Gemini、Grok 或 CC Switch 中的原始配置。',
        'This removes the provider, encrypted key, and connection state from Memento. Original Claude, Codex, Gemini, Grok, and CC Switch configurations are not changed.'
      )}
      busy={busy}
      onClose={onClose}
      actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{busy ? text('正在删除', 'Deleting') : text('删除配置', 'Delete configuration')}</button></>}
    >
      <div className="dialog-body"><div className="confirm-row"><span><KeyRound size={13} /></span><div><strong>{provider.name}</strong><small>{text(`${provider.model} · 密钥、模型设置和连接状态`, `${provider.model} · key, model settings, and connection state`)}</small></div><span className="risk-label review">{text('不可恢复', 'Permanent')}</span></div></div>
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

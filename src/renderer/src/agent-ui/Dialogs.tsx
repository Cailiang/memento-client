import {
  Archive,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Play,
  RadioTower,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentPlanItem } from '../../../shared/agent-types'
import { candidateWhitelistValue } from '../../../shared/app-settings'
import type { InstalledApplication, ScanCandidate } from '../../../shared/types'
import { useI18n } from '../i18n'
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

export function PlanConfirmDialog({
  items,
  busy,
  onClose,
  onConfirm
}: {
  items: AgentPlanItem[]
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  return (
    <DialogFrame title={text('确认处理计划', 'Confirm plan')} description={text('只执行下面选中的操作，完成后会重新体检并验证结果。', 'Only the selected operations will run. Memento will scan again to verify results.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('返回检查', 'Go back')}</button><button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Play size={15} />}{busy ? text('正在执行', 'Executing') : text('开始执行', 'Run plan')}</button></>}>
      <div className="dialog-body">
        {items.map((item) => <div className="confirm-row" key={item.id}><span>{item.kind === 'terminal-fix' ? <RadioTower size={13} /> : <Archive size={13} />}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><span className={`risk-label ${item.risk}`}>{item.estimatedBytes ? formatBytes(item.estimatedBytes) : text('操作', 'Action')}</span></div>)}
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
  return <DialogFrame title={text(`卸载 ${application.name}`, `Uninstall ${application.name}`)} description={text('应用本体将移到废纸篓，文稿、设置和其他应用数据会保留。', 'The application bundle will move to Trash. Documents, settings, and app data are kept.')} busy={busy} onClose={onClose} actions={<><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{text('取消', 'Cancel')}</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}{text('移到废纸篓', 'Move to Trash')}</button></>} />
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

export function IgnoredItemsDialog({
  initialKind,
  serviceValues,
  storageValues,
  busyValue,
  onRestore,
  onClose
}: {
  initialKind: 'storage' | 'services'
  serviceValues: string[]
  storageValues: string[]
  busyValue: string | null
  onRestore: (kind: 'services' | 'storage', value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [kind, setKind] = useState<'storage' | 'services'>(initialKind)
  const values = kind === 'storage' ? storageValues : serviceValues
  return (
    <DialogFrame wide title={text('忽略列表', 'Ignored items')} description={text('这些项目不会出现在体检建议中，Agent 也无法处理。', 'These items stay out of health recommendations and cannot be changed by Agent.')} busy={busyValue !== null} onClose={onClose} actions={<button type="button" className="secondary-button" onClick={onClose} disabled={busyValue !== null}>{text('完成', 'Done')}</button>}>
      <div className="ignored-tabs" role="tablist" aria-label={text('忽略项目类型', 'Ignored item type')}><button type="button" role="tab" aria-selected={kind === 'storage'} className={`ignored-tab ${kind === 'storage' ? 'is-active' : ''}`} onClick={() => setKind('storage')}>{text('存储空间', 'Storage')} <span>{storageValues.length}</span></button><button type="button" role="tab" aria-selected={kind === 'services'} className={`ignored-tab ${kind === 'services' ? 'is-active' : ''}`} onClick={() => setKind('services')}>{text('后台服务', 'Services')} <span>{serviceValues.length}</span></button></div>
      <div className="ignored-list">
        {values.length ? values.map((value) => <div className="ignored-row" key={value}><span>{kind === 'storage' ? <Archive size={14} /> : <RadioTower size={14} />}</span><div><strong>{kind === 'storage' ? value.split('/').filter(Boolean).at(-1) ?? value : value}</strong><small>{value}</small></div><button type="button" className="quiet-button" onClick={() => onRestore(kind, value)} disabled={busyValue !== null}>{busyValue === value ? <LoaderCircle className="spinner" size={14} /> : <Eye size={14} />}{text('恢复检测', 'Restore')}</button></div>) : <div className="ignored-empty"><div><CheckCircle2 size={18} /><span>{kind === 'storage' ? text('没有忽略的存储项目', 'No ignored storage') : text('没有忽略的后台服务', 'No ignored services')}</span></div></div>}
      </div>
    </DialogFrame>
  )
}

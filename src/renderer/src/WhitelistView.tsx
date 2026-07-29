import {
  Archive,
  CheckCircle2,
  Eye,
  LoaderCircle,
  RadioTower,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UpdateAppSettingsInput } from '../../shared/app-settings'
import { useI18n } from './i18n'

type IgnoreKind = 'services' | 'storage'

function ignoredItemName(value: string, kind: IgnoreKind): string {
  if (kind === 'services') return value
  const parts = value.split('/').filter(Boolean)
  return parts.at(-1) ?? value
}

export function IgnoredItemsDialog({
  initialKind,
  serviceValues,
  storageValues,
  onUpdate,
  onClose
}: {
  initialKind: IgnoreKind
  serviceValues: string[]
  storageValues: string[]
  onUpdate: (input: UpdateAppSettingsInput) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [kind, setKind] = useState<IgnoreKind>(initialKind)
  const [busyValue, setBusyValue] = useState<string | null>(null)
  const values = kind === 'services' ? serviceValues : storageValues

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && busyValue === null) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busyValue, onClose])

  const restore = async (value: string): Promise<void> => {
    setBusyValue(value)
    try {
      await onUpdate(kind === 'services'
        ? { serviceWhitelist: serviceValues.filter((item) => item !== value) }
        : { storageWhitelist: storageValues.filter((item) => item !== value) })
    } finally {
      setBusyValue(null)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => busyValue === null && onClose()}
    >
      <section
        className="confirm-dialog ignored-items-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ignored-items-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <span>{text('电脑体检与 Agent', 'Health checks and Agent')}</span>
            <h2 id="ignored-items-title">{text('忽略列表', 'Ignored items')}</h2>
            <p>{text('这些项目不会出现在体检建议中，Agent 也无法处理。', 'These items stay out of health recommendations and cannot be changed by Agent.')}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={busyValue !== null}
            title={text('关闭', 'Close')}
            aria-label={text('关闭忽略列表', 'Close ignored items')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="ignored-items-tabs" role="tablist" aria-label={text('忽略项目类型', 'Ignored item type')}>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'storage'}
            className={kind === 'storage' ? 'is-active' : ''}
            onClick={() => setKind('storage')}
            autoFocus={initialKind === 'storage'}
          >
            {text('存储空间', 'Storage')}<span>{storageValues.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'services'}
            className={kind === 'services' ? 'is-active' : ''}
            onClick={() => setKind('services')}
            autoFocus={initialKind === 'services'}
          >
            {text('后台服务', 'Services')}<span>{serviceValues.length}</span>
          </button>
        </div>

        {values.length > 0 ? (
          <div className="ignored-items-list">
            {values.map((value) => (
              <div className="ignored-item-row" key={value}>
                <span className={`ignored-item-icon icon-${kind}`} aria-hidden="true">
                  {kind === 'storage' ? <Archive size={15} /> : <RadioTower size={15} />}
                </span>
                <div>
                  <strong title={ignoredItemName(value, kind)}>{ignoredItemName(value, kind)}</strong>
                  <code title={value}>{value}</code>
                </div>
                <button
                  type="button"
                  className="ignored-item-restore"
                  onClick={() => void restore(value)}
                  disabled={busyValue !== null}
                  title={text('移出忽略列表并恢复检测', 'Remove from ignored items and restore detection')}
                >
                  {busyValue === value
                    ? <LoaderCircle className="spinning" size={14} />
                    : <Eye size={14} />}
                  {text('恢复检测', 'Restore')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="ignored-items-empty">
            <CheckCircle2 size={18} />
            <span>{kind === 'services'
              ? text('没有忽略的后台服务', 'No ignored services')
              : text('没有忽略的存储项目', 'No ignored storage items')}</span>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busyValue !== null}>
            {text('完成', 'Done')}
          </button>
        </div>
      </section>
    </div>
  )
}

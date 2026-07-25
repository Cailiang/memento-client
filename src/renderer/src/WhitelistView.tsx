import { CheckCircle2, Eye, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { UpdateAppSettingsInput } from '../../shared/app-settings'
import { useI18n } from './i18n'

export function WhitelistPanel({
  kind,
  values,
  onUpdate
}: {
  kind: 'services' | 'storage'
  values: string[]
  onUpdate: (input: UpdateAppSettingsInput) => Promise<void>
}): React.JSX.Element {
  const { text } = useI18n()
  const [busyValue, setBusyValue] = useState<string | null>(null)

  const restore = async (value: string): Promise<void> => {
    setBusyValue(value)
    try {
      await onUpdate(kind === 'services'
        ? { serviceWhitelist: values.filter((item) => item !== value) }
        : { storageWhitelist: values.filter((item) => item !== value) })
    } finally {
      setBusyValue(null)
    }
  }

  if (!values.length) {
    return (
      <div className="whitelist-empty">
        <CheckCircle2 size={18} />
        <span>{kind === 'services'
          ? text('还没有隐藏的服务', 'No hidden services')
          : text('还没有隐藏的存储项目', 'No hidden storage items')}</span>
      </div>
    )
  }

  return (
    <div className="whitelist-control">
      {values.map((value) => (
        <div className="whitelist-row" key={value}>
          <code title={value}>{value}</code>
          <button
            type="button"
            className="whitelist-restore"
            onClick={() => void restore(value)}
            disabled={busyValue !== null}
            title={text('移出白名单并恢复到扫描结果', 'Remove from whitelist and restore to results')}
          >
            {busyValue === value
              ? <LoaderCircle className="spinning" size={14} />
              : <Eye size={14} />}
            {text('恢复显示', 'Restore')}
          </button>
        </div>
      ))}
    </div>
  )
}

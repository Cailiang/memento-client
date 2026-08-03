import {
  Check,
  ChevronRight,
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  ListFilter,
  LoaderCircle,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  ScanSearch,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentProvider,
  AgentProviderModelsResult,
  AgentProviderTestResult,
  CcSwitchImportResult,
  DiscoverAgentModelsInput,
  LocalAiImportResult,
  SaveAgentProviderInput
} from '../../../shared/agent-types'
import type { AppLanguage, AppSettings, AppTheme, UpdateAppSettingsInput } from '../../../shared/app-settings'
import type { AppUpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { DeleteProviderDialog } from './Dialogs'

const PROVIDER_LABELS: Record<AgentProvider['type'], [string, string]> = {
  'openai-compatible': ['OpenAI 兼容接口', 'OpenAI-compatible'],
  openai: ['OpenAI', 'OpenAI'],
  anthropic: ['Anthropic', 'Anthropic'],
  antigravity: ['Antigravity', 'Antigravity'],
  google: ['Google Gemini', 'Google Gemini']
}

type ProviderPresetId = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'grok' | 'antigravity' | 'custom'

interface ProviderPreset {
  id: ProviderPresetId
  label: [string, string]
  type: AgentProvider['type']
  baseUrl: string
  recommendedModel: string
}

const PROVIDER_CATALOG: ProviderPreset[] = [
  { id: 'deepseek', label: ['DeepSeek', 'DeepSeek'], type: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', recommendedModel: 'deepseek-chat' },
  { id: 'openai', label: ['OpenAI', 'OpenAI'], type: 'openai', baseUrl: 'https://api.openai.com/v1', recommendedModel: 'gpt-5.4' },
  { id: 'anthropic', label: ['Anthropic', 'Anthropic'], type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', recommendedModel: 'claude-opus-4-6' },
  { id: 'google', label: ['Google Gemini', 'Google Gemini'], type: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', recommendedModel: 'gemini-3.1-pro-preview' },
  { id: 'grok', label: ['Grok / xAI', 'Grok / xAI'], type: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', recommendedModel: 'grok-4-1-fast-reasoning' },
  { id: 'antigravity', label: ['Antigravity', 'Antigravity'], type: 'antigravity', baseUrl: 'https://code.tczor.cn/antigravity/v1beta', recommendedModel: 'gemini-3.1-pro-high' },
  { id: 'custom', label: ['自定义 OpenAI 兼容接口', 'Custom OpenAI-compatible API'], type: 'openai-compatible', baseUrl: '', recommendedModel: '' }
]

const PROVIDER_PRESETS = new Map(PROVIDER_CATALOG.map((preset) => [preset.id, preset]))

function normalizedUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function inferProviderPreset(provider: Pick<AgentProvider, 'type' | 'baseUrl'>): ProviderPresetId {
  return PROVIDER_CATALOG.find((preset) => (
    preset.id !== 'custom' &&
    preset.type === provider.type &&
    normalizedUrl(preset.baseUrl) === normalizedUrl(provider.baseUrl)
  ))?.id ?? 'custom'
}

function providerSource(id: string): [string, string] | null {
  if (id.startsWith('cc-switch-')) return ['CC Switch', 'CC Switch']
  if (id.startsWith('local-config-claude-')) return ['Claude', 'Claude']
  if (id.startsWith('local-config-codex-')) return ['Codex', 'Codex']
  if (id.startsWith('local-config-gemini-')) return ['Gemini', 'Gemini']
  if (id.startsWith('local-config-grok-')) return ['Grok', 'Grok']
  return null
}

const THEMES: Array<{ id: AppTheme; label: [string, string] }> = [
  { id: 'porcelain', label: ['雾瓷朱红', 'Porcelain red'] },
  { id: 'graphite', label: ['莱姆终端', 'Lime terminal'] },
  { id: 'tiffany', label: ['蒂芙尼晨雾', 'Tiffany mist'] },
  { id: 'klein', label: ['克莱因蓝图', 'Klein blueprint'] },
  { id: 'burgundy', label: ['勃艮第书房', 'Burgundy study'] },
  { id: 'mars', label: ['马尔斯工坊', 'Mars workshop'] },
  { id: 'prussian', label: ['普鲁士夜航', 'Prussian night'] },
  { id: 'midnight', label: ['午夜青珊', 'Midnight cyan'] }
]

function blankProvider(): SaveAgentProviderInput {
  const preset = PROVIDER_PRESETS.get('deepseek')!
  return {
    name: preset.label[0],
    type: preset.type,
    baseUrl: preset.baseUrl,
    model: preset.recommendedModel,
    apiKey: ''
  }
}

export function SettingsPage({
  settings,
  providers,
  appVersion,
  updateState,
  onUpdateSettings,
  onDiscoverModels,
  onSaveProvider,
  onTestProvider,
  onDeleteProvider,
  onSetDefaultProvider,
  onImportLocalAi,
  onImportCcSwitch,
  onCheckUpdates,
  onManageIgnored,
  onToast
}: {
  settings: AppSettings
  providers: AgentProvider[]
  appVersion: string
  updateState: AppUpdateState | null
  onUpdateSettings: (input: UpdateAppSettingsInput) => Promise<void>
  onDiscoverModels: (input: DiscoverAgentModelsInput) => Promise<AgentProviderModelsResult>
  onSaveProvider: (input: SaveAgentProviderInput) => Promise<AgentProvider>
  onTestProvider: (input: SaveAgentProviderInput) => Promise<AgentProviderTestResult>
  onDeleteProvider: (id: string) => Promise<void>
  onSetDefaultProvider: (id: string) => Promise<void>
  onImportLocalAi: () => Promise<LocalAiImportResult>
  onImportCcSwitch: () => Promise<CcSwitchImportResult>
  onCheckUpdates: () => Promise<void>
  onManageIgnored: () => void
  onToast: (message: string) => void
}): React.JSX.Element {
  const { text } = useI18n()
  const [selectedId, setSelectedId] = useState<string | 'new'>(() => providers[0]?.id ?? 'new')
  const selected = useMemo(() => providers.find((provider) => provider.id === selectedId) ?? null, [providers, selectedId])
  const [draft, setDraft] = useState<SaveAgentProviderInput>(blankProvider)
  const [presetId, setPresetId] = useState<ProviderPresetId>('deepseek')
  const [secretVisible, setSecretVisible] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | 'default' | null>(null)
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [modelMessage, setModelMessage] = useState<string | null>(null)
  const [manualModel, setManualModel] = useState(false)
  const [localImportBusy, setLocalImportBusy] = useState(false)
  const [ccSwitchBusy, setCcSwitchBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AgentProvider | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const discoverySequence = useRef(0)

  useEffect(() => {
    if (!selected) {
      if (selectedId !== 'new' && providers.length) setSelectedId(providers[0].id)
      return
    }
    setDraft({
      id: selected.id,
      name: selected.name,
      type: selected.type,
      baseUrl: selected.baseUrl,
      model: selected.model,
      apiKey: ''
    })
    setPresetId(inferProviderPreset(selected))
    setConnectionMessage(null)
    setConnectionOk(null)
    setAvailableModels([])
    setModelState('idle')
    setModelMessage(null)
    setManualModel(false)
  }, [providers, selected, selectedId])

  const discoverModels = useCallback(async (input: DiscoverAgentModelsInput): Promise<void> => {
    const sequence = ++discoverySequence.current
    setModelState('loading')
    setModelMessage(text('正在获取模型列表', 'Fetching available models'))
    try {
      const result = await onDiscoverModels(input)
      if (sequence !== discoverySequence.current) return
      setAvailableModels(result.models)
      setModelState('ready')
      setModelMessage(text(
        result.excludedModelCount
          ? `已获取 ${result.models.length} 个 Agent 可用模型，过滤 ${result.excludedModelCount} 个不兼容模型`
          : `已从 ${result.resolvedBaseUrl} 获取 ${result.models.length} 个模型`,
        result.excludedModelCount
          ? `${result.models.length} Agent models found; ${result.excludedModelCount} incompatible models filtered out`
          : `${result.models.length} models found at ${result.resolvedBaseUrl}`
      ))
    } catch (error) {
      if (sequence !== discoverySequence.current) return
      setAvailableModels([])
      setModelState('error')
      setModelMessage(error instanceof Error ? error.message : text('无法获取模型列表', 'Could not fetch models'))
    }
  }, [onDiscoverModels, text])

  const storedKeyAvailable = Boolean(selected && selected.id === draft.id && selected.keyPresent)
  const discoveryReady = Boolean(draft.baseUrl.trim() && (draft.apiKey?.trim() || storedKeyAvailable))

  useEffect(() => {
    if (!discoveryReady) {
      discoverySequence.current += 1
      setAvailableModels([])
      setModelState('idle')
      setModelMessage(text('填写服务地址和请求密钥后自动获取', 'Enter the base URL and API key to fetch models'))
      return
    }
    const timeout = window.setTimeout(() => {
      void discoverModels({
        id: draft.id,
        type: draft.type,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey
      })
    }, 750)
    return () => {
      window.clearTimeout(timeout)
      discoverySequence.current += 1
    }
  }, [
    discoverModels,
    discoveryReady,
    draft.apiKey,
    draft.baseUrl,
    draft.id,
    draft.type,
    text
  ])

  const selectNew = (): void => {
    setSelectedId('new')
    setDraft(blankProvider())
    setPresetId('deepseek')
    setConnectionMessage(null)
    setConnectionOk(null)
    setAvailableModels([])
    setModelState('idle')
    setModelMessage(null)
    setManualModel(false)
    setSecretVisible(false)
  }

  const selectPreset = (nextId: ProviderPresetId): void => {
    const next = PROVIDER_PRESETS.get(nextId)!
    setPresetId(nextId)
    setDraft((current) => ({
      ...current,
      name: text(...next.label),
      type: next.type,
      baseUrl: next.baseUrl,
      model: next.recommendedModel || current.model
    }))
    setAvailableModels([])
    setModelState('idle')
    setModelMessage(null)
    setManualModel(false)
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      const saved = await onSaveProvider(draft)
      setSelectedId(saved.id)
      onToast(text('供应商配置已加密保存', 'Provider saved with encrypted credentials'))
    } catch {
      // App owns the user-facing error toast.
    } finally {
      setBusy(null)
    }
  }

  const testConnection = async (): Promise<void> => {
    setBusy('test')
    setConnectionMessage(text(
      `正在验证 ${draft.model} 的工具调用`,
      `Testing tool calling with ${draft.model}`
    ))
    setConnectionOk(null)
    try {
      const result = await onTestProvider(draft)
      setConnectionMessage(result.message)
      setConnectionOk(result.ok)
      onToast(result.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : text('连接测试失败', 'Connection test failed')
      setConnectionMessage(message)
      setConnectionOk(false)
    } finally {
      setBusy(null)
    }
  }

  const updateSettings = (input: UpdateAppSettingsInput): void => {
    void onUpdateSettings(input).catch((error) => {
      onToast(error instanceof Error ? error.message : text('无法更新设置', 'Could not update settings'))
    })
  }

  const importCcSwitch = async (): Promise<void> => {
    setCcSwitchBusy(true)
    try {
      await onImportCcSwitch()
    } catch {
      // App owns the user-facing error toast.
    } finally {
      setCcSwitchBusy(false)
    }
  }

  const importLocalAi = async (): Promise<void> => {
    setLocalImportBusy(true)
    try {
      await onImportLocalAi()
    } catch {
      // App owns the user-facing error toast.
    } finally {
      setLocalImportBusy(false)
    }
  }

  const deleteProvider = async (): Promise<void> => {
    if (!pendingDelete) return
    const removed = pendingDelete
    setBusy('delete')
    try {
      await onDeleteProvider(removed.id)
      setPendingDelete(null)
      setSelectedId(providers.find((item) => item.id !== removed.id)?.id ?? 'new')
    } catch {
      // App owns the user-facing error toast.
    } finally {
      setBusy(null)
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setUpdateBusy(true)
    try {
      await onCheckUpdates()
    } finally {
      setUpdateBusy(false)
    }
  }

  const connectionLabel = busy === 'test'
    ? text('测试中', 'Testing')
    : connectionOk === true
      ? text('已连接', 'Connected')
      : connectionOk === false
        ? text('测试失败', 'Test failed')
        : selected?.connectionState === 'connected'
          ? text('已连接', 'Connected')
          : selected?.connectionState === 'failed'
            ? text('测试失败', 'Test failed')
            : text('未测试', 'Not tested')
  const connectionClass = connectionOk === true || (!connectionMessage && selected?.connectionState === 'connected')
    ? 'safe'
    : connectionOk === false || (!connectionMessage && selected?.connectionState === 'failed')
      ? 'review'
      : ''
  const updateDescription = updateBusy || updateState?.phase === 'checking'
    ? text('正在检查新版本…', 'Checking for updates…')
    : updateState?.phase === 'available' && updateState.latestVersion
      ? text(`发现 v${updateState.latestVersion}，正在准备后台下载`, `Memento v${updateState.latestVersion} was found. Preparing the background download.`)
      : updateState?.phase === 'downloading' && updateState.latestVersion
        ? text(`发现 v${updateState.latestVersion}，正在后台下载 ${updateState.downloadPercent ?? 0}%`, `Downloading Memento v${updateState.latestVersion} in the background: ${updateState.downloadPercent ?? 0}%`)
        : updateState?.phase === 'downloaded' && updateState.latestVersion
          ? text(`v${updateState.latestVersion} 已下载，点击版本号旁的更新按钮安装`, `Memento v${updateState.latestVersion} is ready. Use the update button beside the version to install it.`)
          : updateState?.phase === 'installing'
            ? text('正在安装新版本，Memento 即将重启', 'Installing the update. Memento will restart shortly.')
            : updateState?.phase === 'error'
              ? updateState.error ?? text('检查更新失败，请稍后重试', 'Could not check for updates. Try again later.')
              : updateState?.phase === 'unsupported'
                ? text('当前安装包不支持应用内自动更新', 'This package does not support in-app updates.')
                : updateState?.checkedAt
                  ? text('已是最新版本', 'Memento is up to date.')
                  : text('等待首次自动检查', 'Waiting for the first automatic check')
  const updateCheckDisabled = updateBusy || Boolean(updateState && [
    'checking',
    'available',
    'downloading',
    'downloaded',
    'installing'
  ].includes(updateState.phase))
  const activePreset = PROVIDER_PRESETS.get(presetId)!
  const selectableModels = [...new Set([draft.model, ...availableModels])].filter(Boolean)
  const defaultProviderNote = selected?.isDefault
    ? text(
        `Agent 新任务将使用 ${draft.name || selected.name} · ${draft.model}。`,
        `New Agent tasks use ${draft.name || selected.name} · ${draft.model}.`
      )
    : selected
      ? text(
          `设为默认后，Agent 新任务将使用 ${draft.name || selected.name} · ${draft.model}。`,
          `After making this the default, new Agent tasks use ${draft.name || selected.name} · ${draft.model}.`
        )
      : text('保存后可将这个配置设为默认供应商。', 'Save this configuration before making it the default.')

  return (
    <section className="page content-page is-active">
      <div className="settings-layout">
        <section className="settings-section provider-settings-section">
          <div className="settings-label">
            <h2>{text('模型供应商', 'Model providers')}</h2>
            <p>{text('自动读取本机已经配置好的 Claude、Codex、Gemini 和 Grok；无效配置不会加入列表。CC Switch 仅在你选择导入时读取。', 'Read configured Claude, Codex, Gemini, and Grok credentials from this Mac. Invalid configurations are filtered out. CC Switch is read only when you choose to import it.')}</p>
            <div className="provider-import-actions">
              <button type="button" className="secondary-button" disabled={localImportBusy || ccSwitchBusy} onClick={() => void importLocalAi()}>{localImportBusy ? <LoaderCircle className="spinner" size={14} /> : <ScanSearch size={14} />}{localImportBusy ? text('正在扫描', 'Scanning') : text('扫描本机 AI 配置', 'Scan local AI configurations')}</button>
              <button type="button" className="quiet-button" disabled={localImportBusy || ccSwitchBusy} onClick={() => void importCcSwitch()}>{ccSwitchBusy ? <LoaderCircle className="spinner" size={14} /> : <Download size={14} />}{ccSwitchBusy ? text('正在导入', 'Importing') : text('导入 CC Switch', 'Import CC Switch')}</button>
            </div>
          </div>
          <div className="provider-manager">
            <aside className="provider-list-pane" aria-label={text('已配置供应商', 'Configured providers')}>
              <div className="provider-list-header"><span>{text(`${providers.length} 个配置`, `${providers.length} configured`)}</span><button type="button" className="icon-button" onClick={selectNew} title={text('添加供应商', 'Add provider')} aria-label={text('添加供应商', 'Add provider')}><Plus size={15} /></button></div>
              <div className="provider-list">
                {providers.map((provider) => (
                  <button key={provider.id} type="button" className={`provider-item ${selectedId === provider.id ? 'is-active' : ''}`} onClick={() => setSelectedId(provider.id)} aria-pressed={selectedId === provider.id}>
                    <span className="provider-mark">{provider.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                    <span><strong>{provider.name}</strong><small>{provider.model}{providerSource(provider.id) ? ` · ${text(...providerSource(provider.id)!)}` : ''}</small></span>
                    {provider.isDefault && <span className="default-chip">{text('默认', 'Default')}</span>}
                  </button>
                ))}
                {selectedId === 'new' && <button type="button" className="provider-item is-active"><span className="provider-mark">+</span><span><strong>{text('新供应商', 'New provider')}</strong><small>{text('尚未保存', 'Not saved')}</small></span></button>}
              </div>
            </aside>

            <div className="provider-editor">
              <div className="provider-editor-header">
                <div><strong>{draft.name || text('新供应商', 'New provider')}</strong><small>{text(...activePreset.label)}{selected && providerSource(selected.id) ? ` · ${text(...providerSource(selected.id)!)}` : ''}</small></div>
                <span className={`risk-label ${connectionClass}`}>{connectionLabel}</span>
              </div>
              <form className="provider-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
                {connectionOk === false && connectionMessage && <div className="provider-error-panel" role="alert"><strong>{text('连接测试失败', 'Connection test failed')}</strong><p>{connectionMessage}</p></div>}
                {modelState === 'error' && modelMessage && <div className="provider-error-panel" role="alert"><strong>{text('模型列表获取失败', 'Could not fetch models')}</strong><p>{modelMessage}</p></div>}
                <div className="field"><label htmlFor="provider-preset">{text('供应商', 'Provider')}</label><select id="provider-preset" value={presetId} onChange={(event) => selectPreset(event.target.value as ProviderPresetId)}>{PROVIDER_CATALOG.map((preset) => <option key={preset.id} value={preset.id}>{preset.id === 'custom' && presetId === 'custom' && draft.type !== 'openai-compatible' ? text('已导入 / 自定义配置', 'Imported / custom configuration') : text(...preset.label)}</option>)}</select></div>
                <div className="field"><label htmlFor="provider-name">{text('配置名称', 'Configuration name')}</label><input id="provider-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoComplete="off" /></div>
                <div className="field is-wide"><label htmlFor="provider-key">{text('请求密钥', 'API key')}</label><div className="secret-field"><input id="provider-key" type={secretVisible ? 'text' : 'password'} value={draft.apiKey ?? ''} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={selected?.keyHint ?? 'sk-...'} autoComplete="new-password" /><button type="button" onClick={() => setSecretVisible((value) => !value)} title={text('显示或隐藏密钥', 'Show or hide key')} aria-label={text('显示或隐藏密钥', 'Show or hide key')}>{secretVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
                <div className="recommended-model"><span><strong>{text('Memento 推荐模型', 'Memento recommended model')}</strong><small>{text('随应用版本更新；已保存的配置不会被静默切换', 'Updated with Memento; saved configurations are never switched silently')}</small></span><code>{activePreset.recommendedModel || draft.model || text('手动选择', 'Choose manually')}</code></div>
                <details className="provider-advanced">
                  <summary><ChevronRight size={14} />{text('高级设置', 'Advanced settings')}</summary>
                  <div className="provider-advanced-grid">
                    {presetId === 'custom' && <div className="field is-wide"><label htmlFor="provider-url">{text('服务地址', 'Base URL')}</label><input id="provider-url" type="url" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" /></div>}
                    <div className="field is-wide model-field"><label htmlFor="provider-model">{text('模型', 'Model')}</label><div className="model-picker">
                      {manualModel ? <input id="provider-model" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="model-name" autoComplete="off" /> : <select id="provider-model" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} disabled={modelState === 'loading'}>{selectableModels.length ? selectableModels.map((model) => <option key={model} value={model}>{model}</option>) : <option value="">{modelState === 'loading' ? text('正在获取模型…', 'Fetching models…') : text('等待获取模型', 'Waiting for models')}</option>}</select>}
                      <button type="button" className="icon-button" onClick={() => void discoverModels({ id: draft.id, type: draft.type, baseUrl: draft.baseUrl, apiKey: draft.apiKey })} disabled={!discoveryReady || modelState === 'loading'} title={text('重新获取模型', 'Refresh models')} aria-label={text('重新获取模型', 'Refresh models')}><RefreshCw className={modelState === 'loading' ? 'spinner' : ''} size={14} /></button>
                    </div><div className={`field-help ${modelState === 'error' ? 'is-error' : ''}`} role="status">{modelState === 'loading' && <LoaderCircle className="spinner" size={11} />}<span>{modelState === 'error' ? text('获取失败，完整信息见上方', 'Fetch failed. See the full error above.') : modelMessage}</span><button type="button" onClick={() => setManualModel((value) => !value)}>{manualModel ? text('使用模型列表', 'Use model list') : text('手动填写模型 ID', 'Enter model ID')}</button></div></div>
                    <p className="provider-advanced-note">{presetId === 'custom' ? text(`接口协议由导入配置或供应商类型自动确定：${text(...PROVIDER_LABELS[draft.type])}。`, `The API protocol is determined automatically from the imported configuration or provider: ${text(...PROVIDER_LABELS[draft.type])}.`) : text(`官方服务地址由 Memento 管理：${activePreset.baseUrl}`, `Memento manages the official endpoint: ${activePreset.baseUrl}`)}</p>
                  </div>
                </details>
                <p className="default-provider-note">{defaultProviderNote}</p>
                <div className="provider-form-actions">
                  <div>
                    <button type="button" className="quiet-button" disabled={!selected || selected.isDefault || busy !== null} onClick={() => { if (!selected) return; setBusy('default'); void onSetDefaultProvider(selected.id).catch(() => undefined).finally(() => setBusy(null)) }}><CircleCheck size={15} />{selected?.isDefault ? text('当前默认供应商', 'Current default provider') : text('设为默认供应商', 'Set as default provider')}</button>
                    <button type="button" className="danger-button" disabled={!selected || selected.isDefault || busy !== null} onClick={() => selected && setPendingDelete(selected)} title={selected?.isDefault ? text('请先将另一个供应商设为默认', 'Make another provider the default first') : undefined}><Trash2 size={15} />{text('删除配置', 'Delete configuration')}</button>
                  </div>
                  <div>
                    <button type="button" className="secondary-button" onClick={() => void testConnection()} disabled={busy !== null || modelState === 'loading' || !draft.model.trim()}>{busy === 'test' ? <LoaderCircle className="spinner" size={15} /> : <PlugZap size={15} />}{busy === 'test' ? text('测试中', 'Testing') : text('测试连接', 'Test connection')}</button>
                    <button type="submit" className="primary-button" disabled={busy !== null || modelState === 'loading' || !draft.model.trim()}>{busy === 'save' ? <LoaderCircle className="spinner" size={15} /> : <Save size={15} />}{text('保存配置', 'Save configuration')}</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-label"><h2>{text('软件更新', 'Software update')}</h2><p>{text('Memento 每小时自动检查新版本，并在后台完成下载。', 'Memento checks hourly and downloads new versions in the background.')}</p></div>
          <div className="setting-row software-update-row"><span className="update-status-copy"><strong>{text(`当前版本 v${appVersion}`, `Current version v${appVersion}`)}</strong><small role={updateState?.phase === 'error' ? 'alert' : 'status'} aria-live={updateState?.phase === 'error' ? 'assertive' : 'polite'}>{updateDescription}</small></span><button type="button" className="secondary-button update-check-button" disabled={updateCheckDisabled} onClick={() => void checkUpdates()}>{updateBusy || updateState?.phase === 'checking' ? <LoaderCircle className="spinner" size={14} /> : <RefreshCw size={14} />}{updateBusy || updateState?.phase === 'checking' ? text('检查中', 'Checking') : text('立即检查', 'Check now')}</button></div>
        </section>

        <section className="settings-section">
          <div className="settings-label"><h2>{text('窗口行为', 'Window behavior')}</h2><p>{text('控制启动和关闭窗口后的行为。', 'Control launch and close behavior.')}</p></div>
          <div>
            <label className="setting-row"><span><strong>{text('登录时启动', 'Launch at login')}</strong><small>{text('登录 macOS 后自动打开 Memento', 'Open Memento after signing in')}</small></span><span className="switch"><input type="checkbox" checked={settings.launchAtLogin} onChange={(event) => updateSettings({ launchAtLogin: event.target.checked })} /><span /></span></label>
            <label className="setting-row"><span><strong>{text('关闭后驻留菜单栏', 'Keep in menu bar')}</strong><small>{text('关闭主窗口后仍可从菜单栏打开', 'Reopen after closing the main window')}</small></span><span className="switch"><input type="checkbox" checked={settings.closeToTray} onChange={(event) => updateSettings({ closeToTray: event.target.checked })} /><span /></span></label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-label"><h2>{text('忽略列表', 'Ignored items')}</h2><p>{text('电脑体检和 Agent 都不会处理这些项目。', 'Health checks and Agent skip these items.')}</p></div>
          <div className="ignored-setting-summary"><div><strong>{text(`已忽略 ${settings.storageWhitelist.length + settings.serviceWhitelist.length + settings.applicationWhitelist.length} 项`, `${settings.storageWhitelist.length + settings.serviceWhitelist.length + settings.applicationWhitelist.length} ignored`)}</strong><small>{text(`存储空间 ${settings.storageWhitelist.length} 项 · 后台服务 ${settings.serviceWhitelist.length} 项 · 应用 ${settings.applicationWhitelist.length} 项`, `${settings.storageWhitelist.length} storage · ${settings.serviceWhitelist.length} services · ${settings.applicationWhitelist.length} applications`)}</small></div><button type="button" className="secondary-button" onClick={onManageIgnored}><ListFilter size={15} />{text('管理', 'Manage')}</button></div>
        </section>

        <section className="settings-section">
          <div className="settings-label"><h2>{text('外观', 'Appearance')}</h2><p>{text('选择界面配色，切换立即生效。', 'Choose a color palette.')}</p></div>
          <div className="theme-options" role="radiogroup" aria-label={text('外观', 'Appearance')}>
            {THEMES.map((theme) => <button key={theme.id} type="button" role="radio" aria-checked={settings.theme === theme.id} className={`theme-option theme-${theme.id} ${settings.theme === theme.id ? 'is-selected' : ''}`} onClick={() => updateSettings({ theme: theme.id })}><span className="theme-swatches"><i /><i /><i /></span><strong>{text(...theme.label)}</strong><Check size={14} /></button>)}
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-label"><h2>{text('语言', 'Language')}</h2><p>{text('应用界面和 Agent 回复使用同一语言。', 'The app and Agent use the same language.')}</p></div>
          <div className="setting-row"><span><strong>{text('界面语言', 'Interface language')}</strong><small>{text('更改后立即生效', 'Applies immediately')}</small></span><select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value as AppLanguage })}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></div>
        </section>
      </div>
      {pendingDelete && <DeleteProviderDialog provider={pendingDelete} busy={busy === 'delete'} onClose={() => busy !== 'delete' && setPendingDelete(null)} onConfirm={() => void deleteProvider()} />}
    </section>
  )
}

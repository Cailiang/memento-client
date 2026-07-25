import { useEffect, useState } from 'react'
import {
  Check,
  Cloud,
  Cpu,
  Info,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  RefreshCw,
  Server,
  Unplug
} from 'lucide-react'
import type {
  AiMode,
  HostedSessionState,
  MementoAiApi,
  ProviderHealth,
  PublicAiError,
  PublicAiSettings
} from '../../../shared/ai-types'
import { demoAiApi } from './demo-ai'
import { useI18n } from '../i18n'
import { parseLocalizedAiError } from './error-copy'

const MODE_COPY: Array<{
  mode: Exclude<AiMode, 'disabled'>
  title: [string, string]
  detail: [string, string]
  icon: typeof Cpu
}> = [
  { mode: 'hosted', title: ['Memento Server', 'Memento Server'], detail: ['默认连接本机 Gateway', 'Connect to the local Gateway by default'], icon: Server },
  { mode: 'local', title: ['本地 Ollama', 'Local Ollama'], detail: ['报告不会离开这台 Mac', 'Reports never leave this Mac'], icon: Cpu },
  { mode: 'byok', title: ['自己的 API Key', 'Your API Key'], detail: ['直连 TCZOR Responses API', 'Connect directly to the TCZOR Responses API'], icon: KeyRound }
]

function parseAiError(error: unknown, english: boolean): PublicAiError {
  return parseLocalizedAiError(error, english, ['AI 设置暂时不可用', 'AI settings are temporarily unavailable'])
}

function modeLabel(mode: AiMode, english: boolean): string {
  if (mode === 'hosted') return 'Memento Server'
  if (mode === 'local') return english ? 'Local Ollama' : '本地 Ollama'
  if (mode === 'byok') return english ? 'Your API Key' : '自己的 API Key'
  return english ? 'Disabled' : '已关闭'
}

export function AiSettingsView(): React.JSX.Element {
  const { language, text } = useI18n()
  const english = language === 'en-US'
  const api: MementoAiApi = window.memento ?? demoAiApi
  const [settings, setSettings] = useState<PublicAiSettings | null>(null)
  const [selectedMode, setSelectedMode] = useState<Exclude<AiMode, 'disabled'>>('hosted')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [session, setSession] = useState<HostedSessionState | null>(null)
  const [health, setHealth] = useState<ProviderHealth | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<PublicAiError | null>(null)

  const refreshSession = async (): Promise<void> => {
    setSession(await api.getHostedSession())
  }

  useEffect(() => {
    let active = true
    void api.getAiSettings().then(async (value) => {
      if (!active) return
      setSettings(value)
      if (value.mode !== 'disabled') setSelectedMode(value.mode)
      setModel(value.model ?? '')
      if (value.mode === 'hosted') {
        const nextSession = await api.getHostedSession()
        if (active) setSession(nextSession)
      }
    }).catch((reason) => {
      if (active) setError(parseAiError(reason, english))
    })
    return () => {
      active = false
    }
  }, [api, english])

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.updateAiSettings({
        mode: selectedMode,
        model: selectedMode === 'hosted' ? undefined : model,
        byokApiKey: selectedMode === 'byok' && apiKey.trim() ? apiKey.trim() : undefined
      })
      setSettings(next)
      setModel(next.model ?? '')
      setApiKey('')
      if (selectedMode === 'hosted') {
        const login = await api.startHostedLogin()
        setMessage(login.message)
        await refreshSession()
      } else {
        setSession(null)
        setMessage(text('AI 配置已保存', 'AI settings saved'))
      }
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setBusy(false)
    }
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const login = await api.startHostedLogin()
      setMessage(login.message)
      await refreshSession()
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setBusy(false)
    }
  }

  const test = async (): Promise<void> => {
    if (!settings?.providerId) return
    setTesting(true)
    setError(null)
    try {
      setHealth(await api.testAiProvider(settings.providerId))
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setTesting(false)
    }
  }

  const disable = async (): Promise<void> => {
    setBusy(true)
    try {
      setSettings(await api.updateAiSettings({ mode: 'disabled' }))
      setMessage(text('AI 已关闭，本地扫描和清理不受影响', 'AI is disabled. Local scanning and cleanup are unaffected.'))
      setHealth(null)
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    setBusy(true)
    try {
      setSettings(await api.updateAiSettings({ mode: 'disabled', clearByokKey: true }))
      setApiKey('')
      setMessage(text('API Key 已从安全存储移除', 'The API Key was removed from secure storage'))
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.logoutHosted()
      setSession({ authenticated: false })
      setMessage(text('已断开 Memento Server 会话', 'Memento Server session disconnected'))
    } catch (reason) {
      setError(parseAiError(reason, english))
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return <div className="view ai-settings-view"><div className="ai-settings-loading" /></div>
  }

  const connected = settings.mode === 'hosted' ? Boolean(session?.authenticated) : Boolean(health?.available)

  return (
    <div className="view ai-settings-view">
      <div className="page-title-row">
        <div>
          <h1>{text('AI 设置', 'AI settings')}</h1>
          <p>{text('统一管理模型连接、账号和密钥。分析入口只会出现在具体诊断项目中。', 'Manage model connections, accounts, and keys. Analysis is available from individual diagnostic items.')}</p>
        </div>
        <div className={`connection-stat ${connected ? 'is-connected' : ''}`}>
          {connected ? <Check size={17} /> : <Unplug size={17} />}
          <div><strong>{connected ? text('已连接', 'Connected') : text('未连接', 'Not connected')}</strong><span>{modeLabel(settings.mode, english)}</span></div>
        </div>
      </div>

      <section className="ai-default-band">
        <Server size={19} />
        <div>
          <strong>{text('调试默认配置', 'Default development configuration')}</strong>
          <span>{text('客户端默认使用本机 Memento Server，并在开发登录开启时自动建立会话。', 'The client uses the local Memento Server by default and automatically creates a session when development login is enabled.')}</span>
        </div>
        <code>{settings.hostedGatewayUrl || text('未配置 Gateway', 'Gateway not configured')}</code>
      </section>

      <section className="ai-settings-section">
        <div className="settings-section-copy">
          <h2>{text('运行方式', 'Connection mode')}</h2>
          <p>{text('切换后只影响后续 AI 请求，不会改变本地扫描结论或已选择的操作。', 'Changing mode only affects future AI requests. Local scan findings and selected actions remain unchanged.')}</p>
        </div>
        <div className="settings-section-control">
          <div className="ai-mode-grid" role="radiogroup" aria-label={text('AI 运行方式', 'AI connection mode')}>
            {MODE_COPY.map((option) => {
              const Icon = option.icon
              const selected = selectedMode === option.mode
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={option.mode}
                  className={`ai-mode-option ${selected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedMode(option.mode)
                    setHealth(null)
                    setModel(option.mode === 'local' ? 'qwen2.5:7b' : option.mode === 'byok' ? 'grok-4.5' : '')
                  }}
                >
                  <Icon size={18} />
                  <strong>{text(option.title[0], option.title[1])}</strong>
                  <span>{text(option.detail[0], option.detail[1])}</span>
                  {selected && <Check className="ai-mode-check" size={15} />}
                </button>
              )
            })}
          </div>

          {selectedMode !== 'hosted' && (
            <div className="ai-config-form settings-config-form">
              <label>
                <span>{text('模型', 'Model')}</span>
                <input value={model} onChange={(event) => setModel(event.target.value)} autoComplete="off" />
              </label>
              {selectedMode === 'byok' && (
                <label>
                  <span>API Key</span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={settings.keyPresent ? text(`已保存，末四位 ${settings.keyHint}`, `Saved, ending in ${settings.keyHint}`) : text('输入新的 API Key', 'Enter a new API Key')}
                    autoComplete="off"
                  />
                  <small>{text('密钥由 macOS 安全存储加密，Renderer 无法读取。', 'The key is encrypted in macOS secure storage and cannot be read by the renderer.')}</small>
                </label>
              )}
            </div>
          )}

          <div className="settings-actions">
            {settings.mode === 'hosted' && session?.authenticated && (
              <button type="button" className="secondary-button" onClick={() => void logout()} disabled={busy}>
                <LogIn size={15} />{text('断开会话', 'Disconnect')}
              </button>
            )}
            {settings.keyPresent && (
              <button type="button" className="secondary-button" onClick={() => void clearKey()} disabled={busy}>
                <KeyRound size={15} />{text('移除密钥', 'Remove key')}
              </button>
            )}
            {settings.mode !== 'disabled' && (
              <button type="button" className="secondary-button" onClick={() => void disable()} disabled={busy}>
                <LockKeyhole size={15} />{text('关闭 AI', 'Disable AI')}
              </button>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => void save()}
              disabled={busy || (selectedMode !== 'hosted' && !model) || (selectedMode === 'byok' && !apiKey && !settings.keyPresent)}
            >
              {busy ? <LoaderCircle className="spinning" size={16} /> : selectedMode === 'hosted' ? <Cloud size={16} /> : <Check size={16} />}
              {busy ? text('正在连接', 'Connecting') : selectedMode === 'hosted' ? text('保存并连接', 'Save and connect') : text('保存设置', 'Save settings')}
            </button>
          </div>
        </div>
      </section>

      <section className="ai-settings-section">
        <div className="settings-section-copy">
          <h2>{text('连接状态', 'Connection status')}</h2>
          <p>{text('连接测试只验证当前 Provider，不会上传扫描报告，也不会消耗一次分析额度。', 'The connection test only checks the current provider. It does not upload a scan report or use analysis quota.')}</p>
        </div>
        <div className="settings-section-control connection-control">
          <div className="connection-row">
            <div>
              <span>{text('当前 Provider', 'Current provider')}</span>
              <strong>{modeLabel(settings.mode, english)}{settings.model ? ` / ${settings.model}` : ''}</strong>
            </div>
            <div>
              {settings.mode === 'hosted' && !session?.authenticated && (
                <button type="button" className="secondary-button" onClick={() => void connect()} disabled={busy}>
                  <LogIn size={15} />{text('连接服务器', 'Connect server')}
                </button>
              )}
              <button type="button" className="secondary-button" onClick={() => void test()} disabled={testing || !settings.providerId}>
                {testing ? <LoaderCircle className="spinning" size={15} /> : <RefreshCw size={15} />}
                {text('测试连接', 'Test connection')}
              </button>
            </div>
          </div>
          {session?.authenticated && (
            <div className="quota-row">
              <span>{text('开发会话', 'Development session')}</span>
              <strong>{text(`今日剩余 ${session.dailyRemaining ?? 0} 次`, `${session.dailyRemaining ?? 0} remaining today`)}</strong>
              <strong>{text(`本月剩余 ${session.monthlyRemaining ?? 0} 次`, `${session.monthlyRemaining ?? 0} remaining this month`)}</strong>
            </div>
          )}
          {health && <div className={`ai-inline-message ${health.available ? 'is-success' : 'is-error'}`}><Info size={15} /><span>{health.available ? text('连接测试通过', 'Connection test passed') : text('连接测试失败', 'Connection test failed')}</span></div>}
          {message && <div className="ai-inline-message is-success"><Info size={15} /><span>{message}</span></div>}
          {error && <div className="ai-inline-message is-error" role="alert"><Info size={15} /><span>{error.message}</span></div>}
        </div>
      </section>
    </div>
  )
}

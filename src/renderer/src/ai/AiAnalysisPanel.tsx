import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrainCircuit,
  Check,
  ChevronDown,
  Database,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Square
} from 'lucide-react'
import type {
  AiDataPreview,
  AiTerminalAnalysis,
  HostedSessionState,
  MementoAiApi,
  PublicAiError,
  PublicAiSettings
} from '../../../shared/ai-types'
import type { ScanCandidate, ScanResult } from '../../../shared/types'
import { demoAiApi } from './demo-ai'
import { useI18n } from '../i18n'
import { parseLocalizedAiError } from './error-copy'

type PanelState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'preview'; preview: AiDataPreview }
  | { status: 'analyzing'; preview: AiDataPreview }
  | { status: 'succeeded'; analysis: AiTerminalAnalysis }
  | { status: 'failed'; error: PublicAiError }

function providerLabel(settings: PublicAiSettings, english: boolean): string {
  if (settings.mode === 'local') return english ? 'Local Ollama' : '本地 Ollama'
  if (settings.mode === 'byok') return english ? 'Your API Key' : '自己的 API Key'
  if (settings.mode === 'hosted') return 'Memento Server'
  return english ? 'Disabled' : '未启用'
}

function riskLabel(risk: AiTerminalAnalysis['suggestions'][number]['risk'], english: boolean): string {
  if (risk === 'behavior-change') return english ? 'May change behavior' : '可能改变行为'
  if (risk === 'review') return english ? 'Review recommended' : '建议审阅'
  return english ? 'Explanation only' : '仅解释'
}

function parseAiError(error: unknown, english: boolean): PublicAiError {
  return parseLocalizedAiError(error, english, ['AI 分析暂时不可用', 'AI analysis is temporarily unavailable'])
}

function contextCopy(candidate: ScanCandidate | undefined, english: boolean): {
  title: string
  description: string
  idle: string
  analyzing: string
} {
  if (candidate?.section === 'services') {
    return english ? {
      title: 'AI service analysis',
      description: 'Identify its purpose and assess the impact of stopping or removing it.',
      idle: 'Analyze this background service',
      analyzing: 'Analyzing background service'
    } : {
      title: 'AI 服务分析',
      description: '识别用途并评估停止或移除的影响。',
      idle: '分析这个后台服务',
      analyzing: '正在分析后台服务'
    }
  }
  if (candidate?.section === 'storage') {
    return english ? {
      title: 'AI storage analysis',
      description: 'Assess its purpose, whether it can be rebuilt, and the impact of cleanup.',
      idle: 'Analyze this storage item',
      analyzing: 'Analyzing storage item'
    } : {
      title: 'AI 存储分析',
      description: '判断内容用途、可重建性和清理影响。',
      idle: '分析这个存储项目',
      analyzing: '正在分析存储项目'
    }
  }
  return english ? {
    title: 'In-depth AI analysis',
    description: 'Explain the redacted terminal diagnostic report.',
    idle: 'Prepare terminal analysis',
    analyzing: 'Analyzing terminal diagnostics'
  } : {
    title: 'AI 深度分析',
    description: '解释脱敏后的终端诊断报告。',
    idle: '准备终端分析',
    analyzing: '正在分析终端诊断'
  }
}

export function AiAnalysisPanel({
  result,
  candidate,
  compact = false,
  autoPrepare = false,
  onAutoPrepared,
  onOpenSettings
}: {
  result: ScanResult
  candidate?: ScanCandidate
  compact?: boolean
  autoPrepare?: boolean
  onAutoPrepared?: () => void
  onOpenSettings: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const english = language === 'en-US'
  const api: MementoAiApi = window.memento ?? demoAiApi
  const [settings, setSettings] = useState<PublicAiSettings | null>(null)
  const [hostedSession, setHostedSession] = useState<HostedSessionState | null>(null)
  const [state, setState] = useState<PanelState>({ status: 'idle' })
  const autoPrepareHandled = useRef(false)
  const copy = contextCopy(candidate, english)
  const evidenceNames = useMemo(
    () => candidate
      ? new Map([['candidate', candidate.name]])
      : new Map(result.terminal.findings.map((finding) => [finding.id, finding.title])),
    [candidate, result.terminal.findings]
  )

  useEffect(() => {
    setState({ status: 'idle' })
    autoPrepareHandled.current = false
  }, [candidate?.id, result.scanId])

  useEffect(() => {
    let active = true
    void api.getAiSettings().then(async (value) => {
      if (!active) return
      setSettings(value)
      if (value.mode === 'hosted') {
        const session = await api.getHostedSession()
        if (active) setHostedSession(session)
      } else {
        setHostedSession(null)
      }
    }).catch((error) => {
      if (active) setState({ status: 'failed', error: parseAiError(error, english) })
    })
    return () => {
      active = false
    }
  }, [api, english])

  const prepare = async (): Promise<void> => {
    setState({ status: 'preparing' })
    try {
      const preview = candidate
        ? await api.prepareCandidateAnalysis({ scanId: result.scanId, candidateId: candidate.id })
        : await api.prepareTerminalAnalysis(result.scanId)
      setState({ status: 'preview', preview })
    } catch (error) {
      setState({ status: 'failed', error: parseAiError(error, english) })
    }
  }

  const analyze = async (preview: AiDataPreview): Promise<void> => {
    setState({ status: 'analyzing', preview })
    try {
      const analysis = candidate
        ? await api.analyzeCandidate({ previewId: preview.previewId, providerId: preview.providerId })
        : await api.analyzeTerminal({ previewId: preview.previewId, providerId: preview.providerId })
      setState({ status: 'succeeded', analysis })
    } catch (error) {
      const publicError = parseAiError(error, english)
      if (publicError.code === 'AI_CANCELLED') setState({ status: 'idle' })
      else setState({ status: 'failed', error: publicError })
    }
  }

  const cancel = async (previewId: string): Promise<void> => {
    await api.cancelAnalysis(previewId)
    setState({ status: 'idle' })
  }

  useEffect(() => {
    if (!autoPrepare || autoPrepareHandled.current || !settings) return
    if (settings.mode === 'disabled') return
    if (settings.mode === 'hosted' && !hostedSession?.authenticated) return
    autoPrepareHandled.current = true
    onAutoPrepared?.()
    void prepare()
  }, [autoPrepare, hostedSession, onAutoPrepared, settings])

  if (!settings) {
    return (
      <section className={`ai-panel ai-panel-loading ${compact ? 'is-compact' : ''}`} aria-label={copy.title}>
        <div className="ai-skeleton-line" />
        <div className="ai-skeleton-line is-short" />
      </section>
    )
  }

  const needsConnection = settings.mode === 'hosted' && hostedSession && !hostedSession.authenticated
  const unavailable = settings.mode === 'disabled' || needsConnection

  return (
    <section className={`ai-panel ${compact ? 'is-compact' : ''}`} aria-label={copy.title}>
      <div className="ai-panel-header">
        <div className="ai-title-group">
          <span className="ai-title-icon" aria-hidden="true"><BrainCircuit size={19} /></span>
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onOpenSettings} title={text('打开 AI 设置', 'Open AI settings')}>
          <Settings2 size={17} />
        </button>
      </div>

      {unavailable ? (
        <div className="ai-connect-state">
          <LockKeyhole size={18} />
          <div>
            <strong>{settings.mode === 'disabled' ? text('AI 已关闭', 'AI is disabled') : text('Memento Server 尚未连接', 'Memento Server is not connected')}</strong>
            <span>{text('在 AI 设置中完成连接后再分析。', 'Connect from AI settings before starting analysis.')}</span>
          </div>
          <button type="button" className="secondary-button" onClick={onOpenSettings}>
            <Settings2 size={15} />{text('打开设置', 'Open settings')}
          </button>
        </div>
      ) : (
        <div className="ai-workspace">
          <div className="ai-context-strip">
            <div><span>{providerLabel(settings, english)}</span><strong>{settings.model ?? text('服务端管理模型', 'Server-managed model')}</strong></div>
            {settings.mode === 'hosted' && hostedSession?.authenticated && (
              <span>{text(`今日剩余 ${hostedSession.dailyRemaining ?? 0} 次`, `${hostedSession.dailyRemaining ?? 0} remaining today`)}</span>
            )}
          </div>

          {state.status === 'idle' && (
            <div className="ai-start-state">
              <div>
                <ShieldCheck size={18} />
                <span>{candidate ? text('不发送完整路径、文件内容或本机操作目标。', 'Full paths, file contents, and local action targets are not sent.') : text('不发送配置原文、环境变量值、主机名或用户目录。', 'Raw configuration, environment values, hostnames, and user directories are not sent.')}</span>
              </div>
              <button type="button" className="primary-button" onClick={() => void prepare()}>
                <BrainCircuit size={16} />{copy.idle}
              </button>
            </div>
          )}

          {state.status === 'preparing' && (
            <div className="ai-progress-state" role="status">
              <LoaderCircle className="spinning" size={20} />
              <div><strong>{text('正在生成脱敏报告', 'Preparing redacted report')}</strong><span>{text('只使用当前扫描的白名单字段。', 'Only allowlisted fields from the current scan are used.')}</span></div>
            </div>
          )}

          {state.status === 'preview' && (
            <div className="ai-preview">
              <div className="ai-preview-summary">
                <div><Database size={17} /><span>{text('记录', 'Records')}</span><strong>{state.preview.summary.recordCount}</strong></div>
                <div><LockKeyhole size={17} /><span>{text('原始内容', 'Raw content')}</span><strong>{text('不包含', 'Excluded')}</strong></div>
                <div><Send size={17} /><span>{text('预估输入', 'Estimated input')}</span><strong>{state.preview.summary.approximateInputTokens} tokens</strong></div>
              </div>
              <details>
                <summary><ChevronDown size={15} />{text('查看将发送的 JSON', 'View JSON to be sent')}</summary>
                <pre>{JSON.stringify(state.preview.payload, null, 2)}</pre>
              </details>
              <div className="ai-consent">
                <p>{text(`确认后发送到 ${providerLabel(settings, english)}。`, `After confirmation, this will be sent to ${providerLabel(settings, english)}.`)}</p>
                <div>
                  <button type="button" className="secondary-button" onClick={() => setState({ status: 'idle' })}>{text('取消', 'Cancel')}</button>
                  <button type="button" className="primary-button" onClick={() => void analyze(state.preview)}>
                    <Send size={16} />{text('确认并分析', 'Confirm and analyze')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {state.status === 'analyzing' && (
            <div className="ai-progress-state" role="status">
              <LoaderCircle className="spinning" size={20} />
              <div><strong>{copy.analyzing}</strong><span>{text('AI 不会修改规则结论或可执行操作。', 'AI cannot change rule-based findings or executable actions.')}</span></div>
              <button type="button" className="secondary-button" onClick={() => void cancel(state.preview.previewId)}>
                <Square size={13} fill="currentColor" />{text('停止', 'Stop')}
              </button>
            </div>
          )}

          {state.status === 'failed' && (
            <div className="ai-error-state" role="alert">
              <Info size={18} />
              <div><strong>{text('分析未完成', 'Analysis did not complete')}</strong><span>{state.error.message}</span></div>
              <button type="button" className="secondary-button" onClick={() => setState({ status: 'idle' })}>
                <RefreshCw size={15} />{text('重试', 'Retry')}
              </button>
            </div>
          )}

          {state.status === 'succeeded' && (
            <AiResult
              analysis={state.analysis}
              candidate={candidate}
              evidenceNames={evidenceNames}
              onReset={() => setState({ status: 'idle' })}
            />
          )}
        </div>
      )}
    </section>
  )
}

function AiResult({
  analysis,
  candidate,
  evidenceNames,
  onReset
}: {
  analysis: AiTerminalAnalysis
  candidate?: ScanCandidate
  evidenceNames: Map<string, string>
  onReset: () => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const english = language === 'en-US'

  if (candidate) {
    const impact = analysis.suggestions[0]?.explanation ?? text(
      '现有信息不足以判断处理后的影响，请暂时保留并核对所属软件。',
      'There is not enough information to assess the impact. Keep it for now and verify which software owns it.'
    )
    const impactLabel = candidate.section === 'services'
      ? text('能不能停止或删除', 'Can I stop or remove it?')
      : text('能不能清理', 'Can I clean it up?')
    return (
      <div className="ai-result ai-candidate-result">
        <div className="ai-answer-list">
          <article>
            <span>{text('它是什么', 'What is it?')}</span>
            <p>{analysis.summary.diagnosis}</p>
          </article>
          <article>
            <span>{impactLabel}</span>
            <p>{impact}</p>
          </article>
        </div>
        <div className="ai-result-footer">
          <small>{analysis.provider.id} / {analysis.provider.model}</small>
          <button type="button" className="text-button" onClick={onReset}>
            <RefreshCw size={14} />{text('重新分析', 'Analyze again')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-result">
      <div className="ai-diagnosis">
        <span className={`ai-priority priority-${analysis.summary.expectedPriority}`}>
          {analysis.summary.expectedPriority === 'high' ? text('优先处理', 'High priority') : analysis.summary.expectedPriority === 'medium' ? text('建议关注', 'Worth attention') : text('优先级较低', 'Low priority')}
        </span>
        <h3>{analysis.summary.diagnosis}</h3>
        <small>{analysis.provider.id} / {analysis.provider.model}</small>
      </div>
      <div className="ai-suggestion-list">
        {analysis.suggestions.length ? analysis.suggestions.map((suggestion) => (
          <article className="ai-suggestion" key={suggestion.id}>
            <div className="ai-suggestion-head">
              <div><strong>{suggestion.title}</strong><span>{riskLabel(suggestion.risk, english)}</span></div>
              <small>{text(`${Math.round(suggestion.confidence * 100)}% 置信度`, `${Math.round(suggestion.confidence * 100)}% confidence`)}</small>
            </div>
            <p>{suggestion.explanation}</p>
            {suggestion.evidenceFindingIds.length > 0 && (
              <div className="ai-evidence-links">
                <span>{text('依据', 'Evidence')}</span>
                {suggestion.evidenceFindingIds.map((id) => <code key={id}>{evidenceNames.get(id) ?? id}</code>)}
              </div>
            )}
            {suggestion.action.steps && suggestion.action.steps.length > 0 && (
              <ol>{suggestion.action.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            )}
          </article>
        )) : <div className="ai-no-suggestions"><Check size={17} /><span>{text('没有需要补充的 AI 建议。', 'AI found no additional suggestions.')}</span></div>}
      </div>
      {analysis.limitations.length > 0 && (
        <div className="ai-limitations"><Info size={16} /><div><strong>{text('分析局限', 'Limitations')}</strong>{analysis.limitations.map((item) => <span key={item}>{item}</span>)}</div></div>
      )}
      <button type="button" className="text-button ai-run-again" onClick={onReset}>
        <RefreshCw size={14} />{text('重新分析', 'Analyze again')}
      </button>
    </div>
  )
}

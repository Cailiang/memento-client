import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentPresentation,
  AgentProviderModelsResult,
  AgentPlanItem,
  AgentProvider,
  AgentProviderTestResult,
  AgentRunEvent,
  AgentRunRecord,
  DiscoverAgentModelsInput,
  SaveAgentProviderInput
} from '../../shared/agent-types'
import {
  candidateWhitelistValue,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type UpdateAppSettingsInput
} from '../../shared/app-settings'
import type { InstalledApplication, ScanCandidate, ScanProgress, ScanResult } from '../../shared/types'
import { AgentPage } from './agent-ui/AgentPage'
import { ApplicationsPage } from './agent-ui/ApplicationsPage'
import {
  IgnoreConfirmDialog,
  IgnoredItemsDialog,
  PlanConfirmDialog,
  UninstallDialog
} from './agent-ui/Dialogs'
import { HealthPage } from './agent-ui/HealthPage'
import { HistoryPage } from './agent-ui/HistoryPage'
import { SettingsPage } from './agent-ui/SettingsPage'
import { type AgentViewKey, Shell } from './agent-ui/Shell'
import { demoResult } from './demo'
import { I18nProvider } from './i18n'

const DEMO_PROVIDER: AgentProvider = {
  id: 'demo-provider',
  name: 'DeepSeek',
  type: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  isDefault: true,
  connectionState: 'connected',
  keyPresent: true,
  keyHint: '••••demo',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

function demoOperationCopy(
  kind: string,
  language: AppSettings['language'],
  fallbackLabel: string,
  fallbackConsequence: string
): { label: string; consequence: string } {
  if (language !== 'en-US') return { label: fallbackLabel, consequence: fallbackConsequence }
  if (kind.startsWith('stop-')) {
    return { label: 'Stop service', consequence: 'Stop the registered background service.' }
  }
  if (kind === 'trash') {
    return { label: 'Move to Trash', consequence: 'Move the registered item to the Trash.' }
  }
  if (kind === 'brew-cleanup') {
    return { label: 'Clean old versions', consequence: 'Remove old versions registered by Homebrew.' }
  }
  return { label: 'Clean permanently', consequence: 'Remove the registered rebuildable content.' }
}

function demoPlan(
  scan: ScanResult,
  language: AppSettings['language'] = 'zh-CN'
): AgentPlanItem[] {
  const items: AgentPlanItem[] = []
  for (const candidate of scan.candidates) {
    const operation = candidate.operations?.[0] ?? (candidate.action ? { id: candidate.id, ...candidate.action } : null)
    if (!operation || items.length >= 3) continue
    const copy = demoOperationCopy(
      operation.kind,
      language,
      operation.label,
      operation.consequence
    )
    items.push({
      id: operation.id,
      kind: 'action',
      actionKind: operation.kind,
      title: copy.label,
      detail: `${candidate.name} · ${copy.consequence}`,
      estimatedBytes: operation.estimatedBytes ?? candidate.sizeBytes ?? 0,
      risk: candidate.risk === 'safe' && operation.reversible ? 'safe' : 'review',
      reversible: operation.reversible
    })
  }
  return items
}

function demoPresentation(
  scan: ScanResult,
  prompt: string,
  language: AppSettings['language']
): AgentPresentation {
  const applicationTask = /应用|app|残留|unused/i.test(prompt)
  const serviceTask = /服务|service|启动项|process/i.test(prompt)
  if (applicationTask) {
    const applications = scan.applications.filter((item) => item.unused).slice(0, 6).map((item) => ({
      kind: 'applications' as const,
      id: item.id,
      name: item.name,
      version: item.version,
      location: item.location,
      sizeBytes: item.sizeBytes,
      lastUsedAt: item.lastUsedAt,
      unused: item.unused,
      operation: item.action ? {
        id: item.action.id,
        label: language === 'en-US' ? 'Uninstall' : item.action.label,
        consequence: language === 'en-US'
          ? 'Move the application bundle to the Trash after confirmation.'
          : item.action.consequence,
        reversible: item.action.reversible,
        estimatedBytes: item.action.estimatedBytes ?? item.sizeBytes
      } : null
    }))
    return {
      summary: language === 'en-US'
        ? 'I found applications that have not been used for three months. You can open one to review it or add its uninstall action to the confirmation plan.'
        : '我找到了超过 3 个月未使用的应用。你可以先打开核对，或把卸载操作加入右侧确认计划。',
      sections: [{
        kind: 'applications',
        title: language === 'en-US' ? 'Unused applications' : '长期未使用的应用',
        items: applications
      }]
    }
  }
  const candidates = scan.candidates
    .filter((item) => item.section === (serviceTask ? 'services' : 'storage'))
    .slice(0, 8)
    .map((item) => ({
      kind: item.section as 'services' | 'storage',
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
      description: item.description,
      status: item.status,
      risk: item.risk,
      sizeBytes: item.sizeBytes ?? 0,
      location: item.location ?? null,
      evidence: item.evidence,
      operations: (item.operations ?? (item.action ? [{ id: item.id, ...item.action }] : [])).map((operation) => ({
        ...demoOperationCopy(
          operation.kind,
          language,
          operation.label,
          operation.consequence
        ),
        id: operation.id,
        reversible: operation.reversible,
        estimatedBytes: operation.estimatedBytes ?? item.sizeBytes ?? 0
      }))
    }))
  const kind = serviceTask ? 'services' : 'storage'
  return {
    summary: language === 'en-US'
      ? 'Inspection complete. Review the relevant items below and add only the actions you want to the confirmation plan.'
      : '检查完成。请核对下面的相关项目，只把需要处理的操作加入确认计划。',
    sections: [{
      kind,
      title: serviceTask
        ? language === 'en-US' ? 'Background services' : '后台服务'
        : language === 'en-US' ? 'Reclaimable storage' : '可清理的存储空间',
      items: candidates
    }]
  }
}

function demoPlanItemFromPresentation(
  run: AgentRunRecord,
  operationId: string
): AgentPlanItem | null {
  for (const section of run.presentation?.sections ?? []) {
    for (const item of section.items) {
      const operations = item.kind === 'terminal' || item.kind === 'applications'
        ? item.operation ? [item.operation] : []
        : item.operations
      const operation = operations.find((candidate) => candidate.id === operationId)
      if (!operation) continue
      const name = item.kind === 'terminal' ? item.title : item.name
      const risk = item.kind === 'terminal'
        ? 'safe'
        : item.kind === 'applications'
          ? 'review'
          : item.risk === 'safe' && operation.reversible ? 'safe' : 'review'
      return {
        id: operation.id,
        kind: item.kind === 'terminal' ? 'terminal-fix' : 'action',
        actionKind: item.kind === 'terminal' ? 'terminal-fix' : 'action',
        title: operation.label,
        detail: `${name} · ${operation.consequence}`,
        estimatedBytes: operation.estimatedBytes,
        risk,
        reversible: operation.reversible
      }
    }
  }
  return null
}

function AppContent({ onLanguageChange }: { onLanguageChange: (language: AppSettings['language']) => void }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [providers, setProviders] = useState<AgentProvider[]>([])
  const [runs, setRuns] = useState<AgentRunRecord[]>([])
  const [result, setResult] = useState<ScanResult | null>(null)
  const [view, setView] = useState<AgentViewKey>('agent')
  const [scanBusy, setScanBusy] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [activeRun, setActiveRun] = useState<AgentRunRecord | null>(null)
  const [runStatusMessage, setRunStatusMessage] = useState('')
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  const [pendingUninstall, setPendingUninstall] = useState<InstalledApplication | null>(null)
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [removingApplicationId, setRemovingApplicationId] = useState<string | null>(null)
  const [pendingIgnore, setPendingIgnore] = useState<ScanCandidate | null>(null)
  const [ignoreBusy, setIgnoreBusy] = useState(false)
  const [ignoredManagerOpen, setIgnoredManagerOpen] = useState(false)
  const [ignoredManagerKind, setIgnoredManagerKind] = useState<'storage' | 'services'>('storage')
  const [restoreBusyValue, setRestoreBusyValue] = useState<string | null>(null)
  const [openingApplicationId, setOpeningApplicationId] = useState<string | null>(null)
  const [addingOperationId, setAddingOperationId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const started = useRef(false)
  const activeRunId = useRef<string | null>(null)
  const appText = (chinese: string, english: string): string => (
    settings.language === 'en-US' ? english : chinese
  )

  const defaultProvider = useMemo(
    () => providers.find((provider) => provider.isDefault) ?? providers[0] ?? null,
    [providers]
  )

  useEffect(() => {
    activeRunId.current = activeRun?.id ?? null
  }, [activeRun?.id])

  const refreshProviders = useCallback(async (): Promise<AgentProvider[]> => {
    const next = window.memento ? await window.memento.listAgentProviders() : [DEMO_PROVIDER]
    setProviders(next)
    return next
  }, [])

  const refreshRuns = useCallback(async (): Promise<void> => {
    setRuns(window.memento ? await window.memento.listAgentRuns() : [])
  }, [])

  const scanNow = useCallback(async (languageOverride?: AppSettings['language']): Promise<ScanResult | null> => {
    if (scanBusy) return null
    setScanBusy(true)
    try {
      const language = languageOverride ?? settings.language
      const next = window.memento ? await window.memento.scan(language) : demoResult
      setResult(next)
      return next
    } catch (error) {
      setToast(error instanceof Error
        ? error.message
        : (languageOverride ?? settings.language) === 'en-US' ? 'Computer health scan failed.' : '电脑体检失败')
      return null
    } finally {
      setScanBusy(false)
    }
  }, [scanBusy, settings.language])

  useEffect(() => {
    const unsubscribeProgress = window.memento?.onScanProgress(setProgress)
    const unsubscribeAgent = window.memento?.onAgentRunEvent((event: AgentRunEvent) => {
      if (event.type === 'status') {
        if (event.runId === activeRunId.current) {
          setActiveRun((current) => current ? { ...current, status: event.status } : current)
          setRuns((current) => current.map((run) => (
            run.id === event.runId ? { ...run, status: event.status } : run
          )))
          setRunStatusMessage(event.message)
        }
        return
      }
      setRuns((current) => [event.run, ...current.filter((run) => run.id !== event.run.id)])
      if (event.run.id === activeRunId.current) {
        setActiveRun(event.run)
        setRunStatusMessage(event.type === 'failed'
          ? event.run.error ?? (event.run.language === 'en-US' ? 'Task failed' : '任务失败')
          : '')
        setSelectedPlanIds(new Set(event.run.plan.map((item) => item.id)))
      }
    })
    return () => {
      unsubscribeProgress?.()
      unsubscribeAgent?.()
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const initialSettings = window.memento
          ? await window.memento.getAppSettings()
          : DEFAULT_APP_SETTINGS
        setSettings(initialSettings)
        onLanguageChange(initialSettings.language)
        document.documentElement.dataset.theme = initialSettings.theme
        await Promise.all([refreshProviders(), refreshRuns()])
        setScanBusy(true)
        const initialResult = window.memento
          ? await window.memento.scan(initialSettings.language)
          : demoResult
        setResult(initialResult)
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Memento 初始化失败')
      } finally {
        setScanBusy(false)
      }
    })()
  }, [onLanguageChange, refreshProviders, refreshRuns])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const updateSettings = async (input: UpdateAppSettingsInput): Promise<void> => {
    const previousLanguage = settings.language
    const next = window.memento
      ? await window.memento.updateAppSettings(input)
      : { ...settings, ...input }
    setSettings(next)
    onLanguageChange(next.language)
    document.documentElement.dataset.theme = next.theme
    if (next.language !== previousLanguage) {
      setResult(null)
      await scanNow(next.language)
    }
  }

  const startAgentRun = (prompt: string): void => {
    const uiText = (chinese: string, english: string): string => (
      settings.language === 'en-US' ? english : chinese
    )
    if (!result) {
      setToast(uiText('请先完成一次电脑体检', 'Complete a computer health scan first.'))
      return
    }
    if (!defaultProvider) {
      setView('settings')
      setToast(uiText('请先配置模型供应商', 'Configure a model provider first.'))
      return
    }
    setView('agent')
    setRunStatusMessage(uiText('正在准备设备信息', 'Preparing device information'))
    setSelectedPlanIds(new Set())

    if (!window.memento) {
      const timestamp = new Date().toISOString()
      const run: AgentRunRecord = {
        id: crypto.randomUUID(),
        conversationId: activeRun?.conversationId ?? crypto.randomUUID(),
        language: settings.language,
        prompt,
        status: 'analyzing',
        providerId: defaultProvider.id,
        providerName: defaultProvider.name,
        model: defaultProvider.model,
        response: null,
        presentation: null,
        focus: [],
        plan: [],
        results: [],
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      setActiveRun(run)
      activeRunId.current = run.id
      window.setTimeout(() => {
        const plan = demoPlan(result, settings.language)
        const presentation = demoPresentation(result, prompt, settings.language)
        const completed = {
          ...run,
          status: 'awaiting-confirmation' as const,
          response: presentation.summary,
          presentation,
          plan,
          updatedAt: new Date().toISOString()
        }
        setActiveRun(completed)
        setRuns((current) => [completed, ...current])
        setSelectedPlanIds(new Set(plan.map((item) => item.id)))
        setRunStatusMessage(uiText('处理计划已经准备好', 'The action plan is ready'))
      }, 900)
      return
    }

    void window.memento.startAgentRun({
      prompt,
      conversationId: activeRun?.conversationId
    }).then((run) => {
      activeRunId.current = run.id
      setActiveRun(run)
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
    }).catch((error) => setToast(error instanceof Error
      ? error.message
      : uiText('无法启动 Agent', 'Could not start the Agent.')))
  }

  const executePlan = async (): Promise<void> => {
    if (!activeRun || !selectedPlanIds.size) return
    setPlanBusy(true)
    try {
      if (!window.memento) {
        const completed: AgentRunRecord = {
          ...activeRun,
          status: 'completed',
          results: [...selectedPlanIds].map((id) => ({
            id,
            ok: true,
            message: settings.language === 'en-US' ? 'Operation completed' : '操作完成'
          })),
          updatedAt: new Date().toISOString()
        }
        setActiveRun(completed)
        setRuns((current) => [completed, ...current.filter((run) => run.id !== completed.id)])
        setPlanDialogOpen(false)
        setToast(settings.language === 'en-US'
          ? 'The plan completed and the computer was scanned again.'
          : '计划执行完成并已重新体检')
        return
      }
      const executed = await window.memento.executeAgentPlan({
        runId: activeRun.id,
        itemIds: [...selectedPlanIds]
      })
      setActiveRun(executed.run)
      setResult(executed.scan)
      setRuns((current) => [executed.run, ...current.filter((run) => run.id !== executed.run.id)])
      setPlanDialogOpen(false)
      setToast(executed.run.error ?? (settings.language === 'en-US'
        ? 'The plan completed and the computer was scanned again.'
        : '计划执行完成并已重新体检'))
    } catch (error) {
      setToast(error instanceof Error
        ? error.message
        : settings.language === 'en-US' ? 'The action plan failed.' : '处理计划执行失败')
    } finally {
      setPlanBusy(false)
    }
  }

  const discardPlan = (): void => {
    if (!activeRun) return
    if (window.memento) void window.memento.cancelAgentRun(activeRun.id)
    const cancelled: AgentRunRecord = {
      ...activeRun,
      status: 'cancelled',
      plan: [],
      error: null,
      updatedAt: new Date().toISOString()
    }
    setActiveRun(cancelled)
    setRuns((current) => [cancelled, ...current.filter((run) => run.id !== cancelled.id)])
    setSelectedPlanIds(new Set())
    setRunStatusMessage(settings.language === 'en-US' ? 'Plan cancelled' : '计划已取消')
  }

  const addAgentPlanItem = async (id: string): Promise<void> => {
    if (!activeRun || addingOperationId) return
    setAddingOperationId(id)
    try {
      let updated: AgentRunRecord
      if (window.memento) {
        updated = await window.memento.addAgentPlanItems({
          runId: activeRun.id,
          itemIds: [id]
        })
      } else {
        const item = demoPlanItemFromPresentation(activeRun, id) ??
          (result ? demoPlan(result, settings.language).find((candidate) => candidate.id === id) : null)
        if (!item) throw new Error(settings.language === 'en-US' ? 'The action is no longer available.' : '操作已经失效')
        updated = {
          ...activeRun,
          status: 'awaiting-confirmation',
          plan: [...new Map([...activeRun.plan, item].map((planItem) => [planItem.id, planItem])).values()],
          updatedAt: new Date().toISOString()
        }
      }
      setActiveRun(updated)
      setRuns((current) => [updated, ...current.filter((run) => run.id !== updated.id)])
      setSelectedPlanIds(new Set(updated.plan.map((item) => item.id)))
      setRunStatusMessage(settings.language === 'en-US' ? 'Added to the confirmation plan' : '已加入确认计划')
    } catch (error) {
      setToast(error instanceof Error
        ? error.message
        : settings.language === 'en-US' ? 'Could not add the action to the plan.' : '无法加入处理计划')
    } finally {
      setAddingOperationId(null)
    }
  }

  const openIgnoredManager = (kind: 'storage' | 'services' = 'storage'): void => {
    setIgnoredManagerKind(kind)
    setIgnoredManagerOpen(true)
  }

  const confirmIgnore = async (): Promise<void> => {
    if (!pendingIgnore) return
    const value = candidateWhitelistValue(pendingIgnore)
    if (!value) return
    setIgnoreBusy(true)
    try {
      const nextInput = pendingIgnore.section === 'services'
        ? { serviceWhitelist: [...settings.serviceWhitelist, value] }
        : { storageWhitelist: [...settings.storageWhitelist, value] }
      await updateSettings(nextInput)
      setResult((current) => current
        ? { ...current, candidates: current.candidates.filter((candidate) => candidate.id !== pendingIgnore.id) }
        : current)
      setToast(appText(
        `${pendingIgnore.name} 已加入忽略列表`,
        `${pendingIgnore.name} was added to Ignored items.`
      ))
      setPendingIgnore(null)
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法更新忽略列表', 'Could not update Ignored items.'))
    } finally {
      setIgnoreBusy(false)
    }
  }

  const restoreIgnored = async (kind: 'services' | 'storage', value: string): Promise<void> => {
    setRestoreBusyValue(value)
    try {
      await updateSettings(kind === 'services'
        ? { serviceWhitelist: settings.serviceWhitelist.filter((item) => item !== value) }
        : { storageWhitelist: settings.storageWhitelist.filter((item) => item !== value) })
      await scanNow()
      setToast(appText('已恢复检测', 'Detection restored.'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法恢复检测', 'Could not restore detection.'))
    } finally {
      setRestoreBusyValue(null)
    }
  }

  const openApplication = async (application: InstalledApplication): Promise<void> => {
    setOpeningApplicationId(application.id)
    try {
      if (window.memento) await window.memento.openApplication(application.id)
      setToast(appText(`已打开 ${application.name}`, `Opened ${application.name}.`))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法打开应用', 'Could not open the application.'))
    } finally {
      setOpeningApplicationId(null)
    }
  }

  const uninstallApplication = async (): Promise<void> => {
    if (!pendingUninstall?.action) return
    const application = pendingUninstall
    const actionId = pendingUninstall.action.id
    setUninstallBusy(true)
    try {
      const results = window.memento
        ? await window.memento.runActions([actionId])
        : await new Promise<Array<{ id: string; ok: boolean; message: string }>>((resolve) => {
            window.setTimeout(() => resolve([{
              id: actionId,
              ok: true,
              message: appText('操作完成', 'Operation completed')
            }]), 650)
          })
      const failure = results.find((item) => !item.ok)
      if (failure) throw new Error(failure.message)
      setRemovingApplicationId(application.id)
      setPendingUninstall(null)
      setToast(appText(
        `${application.name} 已移到废纸篓`,
        `${application.name} was moved to the Trash.`
      ))
      const exitDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 420
      await new Promise<void>((resolve) => window.setTimeout(resolve, exitDuration))
      setResult((current) => current ? {
        ...current,
        applications: current.applications.filter((item) => item.id !== application.id)
      } : current)
      setRemovingApplicationId(null)
      if (window.memento) void scanNow()
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法卸载应用', 'Could not uninstall the application.'))
    } finally {
      setUninstallBusy(false)
    }
  }

  const discoverProviderModels = useCallback(async (
    input: DiscoverAgentModelsInput
  ): Promise<AgentProviderModelsResult> => {
    if (window.memento) return window.memento.discoverAgentProviderModels(input)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 520))
    const models = input.type === 'anthropic'
      ? ['claude-3-7-sonnet-latest', 'claude-sonnet-4-5']
      : input.type === 'google'
        ? ['gemini-2.5-flash', 'gemini-2.5-pro']
        : ['deepseek-chat', 'deepseek-reasoner', 'gpt-4.1-mini']
    const suffix = input.type === 'google' ? '/v1beta' : '/v1'
    const parsed = new URL(input.baseUrl)
    const resolvedBaseUrl = parsed.pathname === '/'
      ? `${parsed.origin}${suffix}`
      : input.baseUrl.replace(/\/+$/, '')
    return { models, resolvedBaseUrl, excludedModelCount: 0 }
  }, [])

  const saveProvider = async (input: SaveAgentProviderInput): Promise<AgentProvider> => {
    try {
      if (!window.memento) {
        const timestamp = new Date().toISOString()
        const existing = providers.find((provider) => provider.id === input.id)
        const provider: AgentProvider = {
          ...DEMO_PROVIDER,
          ...input,
          id: input.id ?? crypto.randomUUID(),
          isDefault: existing?.isDefault ?? providers.length === 0,
          connectionState: 'untested',
          keyPresent: true,
          keyHint: input.apiKey ? `••••${input.apiKey.slice(-4)}` : DEMO_PROVIDER.keyHint,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        setProviders((current) => [
          provider,
          ...current.filter((item) => item.id !== provider.id)
        ])
        return provider
      }
      const provider = await window.memento.saveAgentProvider(input)
      await refreshProviders()
      return provider
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法保存供应商', 'Could not save the provider.'))
      throw error
    }
  }

  const testProvider = async (input: SaveAgentProviderInput): Promise<AgentProviderTestResult> => {
    try {
      const tested = window.memento
        ? await window.memento.testAgentProvider(input)
        : {
            ok: true,
            message: appText('连接成功，模型支持工具调用', 'Connected. The model supports tool calling.'),
            toolCalling: true,
            testedAt: new Date().toISOString()
          }
      if (window.memento) await refreshProviders()
      return tested
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('连接测试失败', 'Connection test failed.'))
      throw error
    }
  }

  const deleteProvider = async (id: string): Promise<void> => {
    try {
      if (window.memento) await window.memento.deleteAgentProvider(id)
      setProviders((current) => current.filter((provider) => provider.id !== id))
      setToast(appText('供应商配置已删除', 'Provider configuration deleted.'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法删除供应商', 'Could not delete the provider.'))
      throw error
    }
  }

  const setDefaultProvider = async (id: string): Promise<void> => {
    try {
      const next = window.memento
        ? await window.memento.setDefaultAgentProvider(id)
        : providers.map((provider) => ({ ...provider, isDefault: provider.id === id }))
      setProviders(next)
      setToast(appText('默认模型已更新', 'Default model updated.'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法更新默认模型', 'Could not update the default model.'))
      throw error
    }
  }

  const healthCount = result
    ? result.candidates.filter((candidate) => candidate.section === 'storage' || candidate.section === 'services').length + result.terminal.findings.filter((finding) => finding.fix).length
    : 0
  const selectedPlan = activeRun?.plan.filter((item) => selectedPlanIds.has(item.id)) ?? []
  const conversationRuns = useMemo(() => {
    if (!activeRun) return []
    const byId = new Map(
      runs
        .filter((run) => run.conversationId === activeRun.conversationId)
        .map((run) => [run.id, run])
    )
    byId.set(activeRun.id, activeRun)
    return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }, [activeRun, runs])

  const openAgentApplication = (id: string): void => {
    const application = result?.applications.find((item) => item.id === id)
    if (!application) {
      setToast(settings.language === 'en-US'
        ? 'The application is no longer available. Scan again.'
        : '应用已经不存在，请重新体检')
      return
    }
    void openApplication(application)
  }

  return (
    <Shell
      activeView={view}
      provider={defaultProvider}
      healthCount={healthCount}
      applicationCount={result?.applications.length ?? 0}
      hostname={result?.system.hostname ?? ''}
      osVersion={result?.system.osVersion ?? ''}
      scanBusy={scanBusy}
      onNavigate={setView}
      onQuickScan={() => { setView('health'); void scanNow() }}
    >
      {view === 'agent' && <AgentPage scan={result} run={activeRun} conversationRuns={conversationRuns} statusMessage={runStatusMessage} selectedPlanIds={selectedPlanIds} providerConfigured={Boolean(defaultProvider)} addingOperationId={addingOperationId} openingApplicationId={openingApplicationId} onSubmit={startAgentRun} onNewTask={() => { setActiveRun(null); activeRunId.current = null; setSelectedPlanIds(new Set()); setRunStatusMessage('') }} onOpenHistory={() => setView('history')} onOpenSettings={() => setView('settings')} onOpenApplication={openAgentApplication} onAddPlanItem={(id) => void addAgentPlanItem(id)} onTogglePlanItem={(id) => setSelectedPlanIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onExecutePlan={() => setPlanDialogOpen(true)} onDiscardPlan={discardPlan} />}
      {view === 'health' && <HealthPage result={result} settings={settings} scanBusy={scanBusy} progress={progress} onScan={() => void scanNow()} onAgentPrompt={startAgentRun} onIgnore={setPendingIgnore} onManageIgnored={openIgnoredManager} />}
      {view === 'apps' && <ApplicationsPage applications={result?.applications ?? []} openingId={openingApplicationId} removingId={removingApplicationId} onOpen={(application) => void openApplication(application)} onUninstall={setPendingUninstall} onAgentPrompt={startAgentRun} />}
      {view === 'history' && <HistoryPage runs={runs} onOpenRun={(run) => { setActiveRun(run); activeRunId.current = run.id; setSelectedPlanIds(new Set(run.plan.map((item) => item.id))); setView('agent') }} onToast={setToast} />}
      {view === 'settings' && <SettingsPage settings={settings} providers={providers} onUpdateSettings={updateSettings} onDiscoverModels={discoverProviderModels} onSaveProvider={saveProvider} onTestProvider={testProvider} onDeleteProvider={deleteProvider} onSetDefaultProvider={setDefaultProvider} onManageIgnored={() => openIgnoredManager()} onToast={setToast} />}

      {planDialogOpen && <PlanConfirmDialog items={selectedPlan} busy={planBusy} onClose={() => setPlanDialogOpen(false)} onConfirm={() => void executePlan()} />}
      {pendingUninstall && <UninstallDialog application={pendingUninstall} busy={uninstallBusy} onClose={() => setPendingUninstall(null)} onConfirm={() => void uninstallApplication()} />}
      {pendingIgnore && <IgnoreConfirmDialog candidate={pendingIgnore} busy={ignoreBusy} onClose={() => setPendingIgnore(null)} onConfirm={() => void confirmIgnore()} />}
      {ignoredManagerOpen && <IgnoredItemsDialog initialKind={ignoredManagerKind} serviceValues={settings.serviceWhitelist} storageValues={settings.storageWhitelist} busyValue={restoreBusyValue} onRestore={(kind, value) => void restoreIgnored(kind, value)} onClose={() => setIgnoredManagerOpen(false)} />}
      {toast && <div className="toast is-visible" role="status"><CheckCircle2 size={16} /><span>{toast}</span></div>}
    </Shell>
  )
}

export default function App(): React.JSX.Element {
  const [language, setLanguage] = useState(DEFAULT_APP_SETTINGS.language)
  return <I18nProvider language={language}><AppContent onLanguageChange={setLanguage} /></I18nProvider>
}

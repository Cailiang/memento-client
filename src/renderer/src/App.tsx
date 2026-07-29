import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
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

function demoPlan(scan: ScanResult): AgentPlanItem[] {
  const items: AgentPlanItem[] = []
  for (const candidate of scan.candidates) {
    const operation = candidate.operations?.[0] ?? (candidate.action ? { id: candidate.id, ...candidate.action } : null)
    if (!operation || items.length >= 3) continue
    items.push({
      id: operation.id,
      kind: 'action',
      actionKind: operation.kind,
      title: operation.label,
      detail: `${candidate.name} · ${operation.consequence}`,
      estimatedBytes: operation.estimatedBytes ?? candidate.sizeBytes ?? 0,
      risk: candidate.risk === 'safe' && operation.reversible ? 'safe' : 'review',
      reversible: operation.reversible
    })
  }
  return items
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
  const [toast, setToast] = useState<string | null>(null)
  const started = useRef(false)
  const activeRunId = useRef<string | null>(null)

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

  const scanNow = useCallback(async (): Promise<ScanResult | null> => {
    if (scanBusy) return null
    setScanBusy(true)
    try {
      const next = window.memento ? await window.memento.scan(settings.language) : demoResult
      setResult(next)
      return next
    } catch (error) {
      setToast(error instanceof Error ? error.message : '电脑体检失败')
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
          setRunStatusMessage(event.message)
        }
        return
      }
      setRuns((current) => [event.run, ...current.filter((run) => run.id !== event.run.id)])
      if (event.run.id === activeRunId.current) {
        setActiveRun(event.run)
        setRunStatusMessage(event.type === 'failed' ? event.run.error ?? '任务失败' : '')
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
    const next = window.memento
      ? await window.memento.updateAppSettings(input)
      : { ...settings, ...input }
    setSettings(next)
    onLanguageChange(next.language)
    document.documentElement.dataset.theme = next.theme
  }

  const startAgentRun = (prompt: string): void => {
    if (!result) {
      setToast('请先完成一次电脑体检')
      return
    }
    if (!defaultProvider) {
      setView('settings')
      setToast('请先配置模型供应商')
      return
    }
    setView('agent')
    setRunStatusMessage('正在准备设备信息')
    setSelectedPlanIds(new Set())

    if (!window.memento) {
      const timestamp = new Date().toISOString()
      const run: AgentRunRecord = {
        id: crypto.randomUUID(),
        prompt,
        status: 'analyzing',
        providerId: defaultProvider.id,
        providerName: defaultProvider.name,
        model: defaultProvider.model,
        response: null,
        plan: [],
        results: [],
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      setActiveRun(run)
      activeRunId.current = run.id
      window.setTimeout(() => {
        const plan = demoPlan(result)
        const completed = {
          ...run,
          status: 'awaiting-confirmation' as const,
          response: '检查完成。我找到了可以由 Memento 直接处理的项目，并准备了下面的计划。执行前你可以取消任意步骤。',
          plan,
          updatedAt: new Date().toISOString()
        }
        setActiveRun(completed)
        setRuns((current) => [completed, ...current])
        setSelectedPlanIds(new Set(plan.map((item) => item.id)))
        setRunStatusMessage('处理计划已经准备好')
      }, 900)
      return
    }

    void window.memento.startAgentRun(prompt).then((run) => {
      activeRunId.current = run.id
      setActiveRun(run)
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
    }).catch((error) => setToast(error instanceof Error ? error.message : '无法启动 Agent'))
  }

  const executePlan = async (): Promise<void> => {
    if (!activeRun || !selectedPlanIds.size) return
    setPlanBusy(true)
    try {
      if (!window.memento) {
        const completed: AgentRunRecord = {
          ...activeRun,
          status: 'completed',
          results: [...selectedPlanIds].map((id) => ({ id, ok: true, message: '操作完成' })),
          updatedAt: new Date().toISOString()
        }
        setActiveRun(completed)
        setRuns((current) => [completed, ...current.filter((run) => run.id !== completed.id)])
        setPlanDialogOpen(false)
        setToast('计划执行完成并已重新体检')
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
      setToast(executed.run.error ?? '计划执行完成并已重新体检')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '处理计划执行失败')
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
    setRunStatusMessage('计划已取消')
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
      setToast(`${pendingIgnore.name} 已加入忽略列表`)
      setPendingIgnore(null)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法更新忽略列表')
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
      setToast('已恢复检测')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法恢复检测')
    } finally {
      setRestoreBusyValue(null)
    }
  }

  const openApplication = async (application: InstalledApplication): Promise<void> => {
    setOpeningApplicationId(application.id)
    try {
      if (window.memento) await window.memento.openApplication(application.id)
      setToast(`已打开 ${application.name}`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法打开应用')
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
              message: '操作完成'
            }]), 650)
          })
      const failure = results.find((item) => !item.ok)
      if (failure) throw new Error(failure.message)
      setRemovingApplicationId(application.id)
      setPendingUninstall(null)
      setToast(`${application.name} 已移到废纸篓`)
      const exitDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 420
      await new Promise<void>((resolve) => window.setTimeout(resolve, exitDuration))
      setResult((current) => current ? {
        ...current,
        applications: current.applications.filter((item) => item.id !== application.id)
      } : current)
      setRemovingApplicationId(null)
      if (window.memento) void scanNow()
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法卸载应用')
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
      setToast(error instanceof Error ? error.message : '无法保存供应商')
      throw error
    }
  }

  const testProvider = async (input: SaveAgentProviderInput): Promise<AgentProviderTestResult> => {
    try {
      const tested = window.memento
        ? await window.memento.testAgentProvider(input)
        : { ok: true, message: '连接成功，模型支持工具调用', toolCalling: true, testedAt: new Date().toISOString() }
      if (window.memento) await refreshProviders()
      return tested
    } catch (error) {
      setToast(error instanceof Error ? error.message : '连接测试失败')
      throw error
    }
  }

  const deleteProvider = async (id: string): Promise<void> => {
    try {
      if (window.memento) await window.memento.deleteAgentProvider(id)
      setProviders((current) => current.filter((provider) => provider.id !== id))
      setToast('供应商配置已删除')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法删除供应商')
      throw error
    }
  }

  const setDefaultProvider = async (id: string): Promise<void> => {
    try {
      const next = window.memento
        ? await window.memento.setDefaultAgentProvider(id)
        : providers.map((provider) => ({ ...provider, isDefault: provider.id === id }))
      setProviders(next)
      setToast('默认模型已更新')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法更新默认模型')
      throw error
    }
  }

  const healthCount = result
    ? result.candidates.filter((candidate) => candidate.section === 'storage' || candidate.section === 'services').length + result.terminal.findings.filter((finding) => finding.fix).length
    : 0
  const selectedPlan = activeRun?.plan.filter((item) => selectedPlanIds.has(item.id)) ?? []

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
      {view === 'agent' && <AgentPage scan={result} run={activeRun} statusMessage={runStatusMessage} selectedPlanIds={selectedPlanIds} providerConfigured={Boolean(defaultProvider)} onSubmit={startAgentRun} onNewTask={() => { setActiveRun(null); activeRunId.current = null; setSelectedPlanIds(new Set()); setRunStatusMessage('') }} onOpenHistory={() => setView('history')} onOpenSettings={() => setView('settings')} onTogglePlanItem={(id) => setSelectedPlanIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onExecutePlan={() => setPlanDialogOpen(true)} onDiscardPlan={discardPlan} />}
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

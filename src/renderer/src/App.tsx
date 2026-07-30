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
  CcSwitchImportResult,
  DiscoverAgentModelsInput,
  SaveAgentProviderInput
} from '../../shared/agent-types'
import {
  candidateWhitelistValue,
  applicationWhitelistValue,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type UpdateAppSettingsInput
} from '../../shared/app-settings'
import type {
  AppUpdateState,
  CandidateOperation,
  DiskUsageProgress,
  DiskUsageScanResult,
  InstalledApplication,
  ScanCandidate,
  ScanProgress,
  ScanResult,
  TerminalFinding
} from '../../shared/types'
import { AgentPage } from './agent-ui/AgentPage'
import { ApplicationsPage } from './agent-ui/ApplicationsPage'
import {
  ApplicationIgnoreConfirmDialog,
  DeleteHistoryDialog,
  DirectActionConfirmDialog,
  type DirectActionRequest,
  type ExecutionPhase,
  ExecutionProgressDialog,
  IgnoreConfirmDialog,
  IgnoredItemsDialog,
  UninstallDialog
} from './agent-ui/Dialogs'
import { HealthPage, type HealthAgentOrigin, type HealthTab, type PageRestoreTarget, type StorageMode } from './agent-ui/HealthPage'
import { HistoryPage } from './agent-ui/HistoryPage'
import { SettingsPage } from './agent-ui/SettingsPage'
import { type AgentViewKey, Shell } from './agent-ui/Shell'
import { localizedDemoDiskUsageResult, localizedDemoResult } from './demo'
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
  if (kind === 'trash' || kind === 'trash-large-file') {
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
    const normalizedPrompt = prompt.toLocaleLowerCase()
    const directApplication = scan.applications.find((item) => (
      normalizedPrompt.includes(item.name.toLocaleLowerCase()) ||
      Boolean(item.bundleId && normalizedPrompt.includes(item.bundleId.toLocaleLowerCase()))
    ))
    const applications = (directApplication
      ? [directApplication]
      : scan.applications.filter((item) => item.unused).slice(0, 6)).map((item) => ({
      kind: 'applications' as const,
      id: item.id,
      name: item.name,
      version: item.version,
      bundleId: item.bundleId,
      location: item.location,
      scope: item.scope,
      protectedReason: item.protectedReason,
      backgroundOnly: item.backgroundOnly,
      executable: item.executable,
      urlSchemes: item.urlSchemes,
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
        ? directApplication
          ? `I found the exact application ${directApplication.name}. Its verified local metadata and available actions are shown below.`
          : 'I found applications that have not been used for three months. You can open one to review it or add its uninstall action to the confirmation plan.'
        : directApplication
          ? `已定位到 ${directApplication.name}，下面展示它经过核对的本机信息和可用操作。`
          : '我找到了超过 3 个月未使用的应用。你可以先打开核对，或把卸载操作加入右侧确认计划。',
      sections: [{
        kind: 'applications',
        title: directApplication
          ? language === 'en-US' ? 'Application analysis' : '应用分析'
          : language === 'en-US' ? 'Unused applications' : '长期未使用的应用',
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

type AgentOrigin =
  | { view: 'health'; tab: HealthTab; itemId?: string; scrollTop: number }
  | { view: 'apps'; itemId?: string; scrollTop: number }

interface RestoreTarget extends PageRestoreTarget {
  view: AgentOrigin['view']
}

interface ExecutionState {
  phase: ExecutionPhase
  itemCount: number
  completedCount: number
  detail: string
  progress: number
  itemIds: string[]
  runId?: string
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
  })
}

function AppContent({ onLanguageChange }: { onLanguageChange: (language: AppSettings['language']) => void }): React.JSX.Element {
  const [appVersion, setAppVersion] = useState(__MEMENTO_VERSION__)
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [providers, setProviders] = useState<AgentProvider[]>([])
  const [runs, setRuns] = useState<AgentRunRecord[]>([])
  const [result, setResult] = useState<ScanResult | null>(null)
  const [view, setView] = useState<AgentViewKey>('agent')
  const [scanBusy, setScanBusy] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [activeRun, setActiveRun] = useState<AgentRunRecord | null>(null)
  const [workspaceRunIds, setWorkspaceRunIds] = useState<string[]>([])
  const [runStatusMessage, setRunStatusMessage] = useState('')
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set())
  const [healthTab, setHealthTab] = useState<HealthTab>('storage')
  const [storageMode, setStorageMode] = useState<StorageMode>('recommendations')
  const [diskUsage, setDiskUsage] = useState<DiskUsageScanResult | null>(null)
  const [diskUsageProgress, setDiskUsageProgress] = useState<DiskUsageProgress | null>(null)
  const [diskUsageBusy, setDiskUsageBusy] = useState(false)
  const [diskUsageError, setDiskUsageError] = useState<string | null>(null)
  const [agentOrigin, setAgentOrigin] = useState<AgentOrigin | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)
  const [pendingDirectAction, setPendingDirectAction] = useState<DirectActionRequest | null>(null)
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null)
  const [pendingUninstall, setPendingUninstall] = useState<InstalledApplication | null>(null)
  const [uninstallBusy, setUninstallBusy] = useState(false)
  const [removingApplicationId, setRemovingApplicationId] = useState<string | null>(null)
  const [pendingIgnore, setPendingIgnore] = useState<ScanCandidate | null>(null)
  const [pendingApplicationIgnore, setPendingApplicationIgnore] = useState<InstalledApplication | null>(null)
  const [ignoreBusy, setIgnoreBusy] = useState(false)
  const [ignoredManagerOpen, setIgnoredManagerOpen] = useState(false)
  const [ignoredManagerKind, setIgnoredManagerKind] = useState<'storage' | 'services' | 'applications'>('storage')
  const [restoreBusyValue, setRestoreBusyValue] = useState<string | null>(null)
  const [openingApplicationId, setOpeningApplicationId] = useState<string | null>(null)
  const [addingOperationId, setAddingOperationId] = useState<string | null>(null)
  const [pendingHistoryDelete, setPendingHistoryDelete] = useState<AgentRunRecord | null>(null)
  const [historyDeleteBusy, setHistoryDeleteBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const started = useRef(false)
  const activeRunId = useRef<string | null>(null)
  const latestAgentStartToken = useRef(0)
  const diskUsageCancelRequested = useRef(false)
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
      const next = window.memento ? await window.memento.scan(language) : localizedDemoResult(language)
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
    const unsubscribeProgress = window.memento?.onScanProgress((scanProgress) => {
      setProgress(scanProgress)
      setExecutionState((current) => current?.phase === 'verifying'
        ? {
            ...current,
            progress: Math.min(96, 44 + Math.round(scanProgress.progress * 0.52)),
            detail: scanProgress.message
          }
        : current)
    })
    const unsubscribeDiskUsage = window.memento?.onDiskUsageProgress(setDiskUsageProgress)
    const unsubscribeUpdate = window.memento?.onUpdateState(setUpdateState)
    const unsubscribeAgent = window.memento?.onAgentRunEvent((event: AgentRunEvent) => {
      if (event.type === 'status') {
        if (event.runId === activeRunId.current) {
          setActiveRun((current) => current ? { ...current, status: event.status } : current)
          setRuns((current) => current.map((run) => (
            run.id === event.runId ? { ...run, status: event.status } : run
          )))
          setRunStatusMessage(event.message)
        }
        setExecutionState((current) => current?.runId === event.runId
          ? {
              ...current,
              phase: event.status === 'verifying' ? 'verifying' : 'executing',
              detail: event.message,
              progress: event.status === 'verifying'
                ? Math.max(current.progress, 44)
                : Math.max(current.progress, 16)
            }
          : current)
        return
      }
      setRuns((current) => [event.run, ...current.filter((run) => run.id !== event.run.id)])
      if (event.run.id === activeRunId.current) {
        setActiveRun(event.run)
        setRunStatusMessage(event.type === 'failed'
          ? event.run.error ?? (event.run.language === 'en-US' ? 'Task failed' : '任务失败')
          : '')
        setSelectedPlanIds(new Set())
      }
      setExecutionState((current) => current?.runId === event.run.id
        ? {
            ...current,
            phase: event.type === 'failed' ? 'failed' : 'completed',
            completedCount: event.run.results.filter((item) => (
              item.ok && current.itemIds.includes(item.id)
            )).length,
            progress: 100,
            detail: event.run.error ?? (event.run.language === 'en-US'
              ? 'Verification finished.'
              : '复检已经完成。')
          }
        : current)
    })
    return () => {
      unsubscribeProgress?.()
      unsubscribeDiskUsage?.()
      unsubscribeUpdate?.()
      unsubscribeAgent?.()
    }
  }, [])

  const scanDiskUsage = useCallback(async (): Promise<void> => {
    if (diskUsageBusy) return
    diskUsageCancelRequested.current = false
    setDiskUsageBusy(true)
    setDiskUsageError(null)
    setDiskUsageProgress({
      phase: 'scanning',
      scannedEntries: 0,
      retainedEntries: 0,
      inaccessibleEntries: 0,
      currentLocation: '/',
      elapsedMs: 0,
      message: settings.language === 'en-US' ? 'Scanning the disk asynchronously' : '正在异步扫描磁盘'
    })
    try {
      const next = window.memento
        ? await window.memento.scanDiskUsage()
        : await new Promise<DiskUsageScanResult>((resolve) => window.setTimeout(
            () => resolve(localizedDemoDiskUsageResult(settings.language)),
            720
          ))
      setDiskUsage(next)
      setDiskUsageProgress(null)
    } catch (error) {
      if (!diskUsageCancelRequested.current) {
        setDiskUsageError(error instanceof Error
          ? error.message
          : settings.language === 'en-US' ? 'Disk scan failed.' : '磁盘扫描失败')
      }
    } finally {
      setDiskUsageBusy(false)
      diskUsageCancelRequested.current = false
    }
  }, [diskUsageBusy, settings.language])

  const cancelDiskUsageScan = (): void => {
    if (!diskUsageBusy) return
    diskUsageCancelRequested.current = true
    void window.memento?.cancelDiskUsageScan()
  }

  const changeStorageMode = (mode: StorageMode): void => {
    setStorageMode(mode)
    if (mode === 'browser' && !diskUsage && !diskUsageBusy) void scanDiskUsage()
  }

  const revealDiskUsageNode = (id: string): void => {
    if (!window.memento) {
      setToast(appText('已在 Finder 中显示', 'Shown in Finder'))
      return
    }
    void window.memento.revealDiskUsageNode(id).catch((error) => {
      setToast(error instanceof Error ? error.message : appText('无法显示磁盘项目', 'Could not reveal the disk item.'))
    })
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        const [initialSettings, initialVersion, initialUpdateState] = await Promise.all([
          window.memento ? window.memento.getAppSettings() : Promise.resolve(DEFAULT_APP_SETTINGS),
          window.memento ? window.memento.getVersion() : Promise.resolve(__MEMENTO_VERSION__),
          window.memento ? window.memento.getUpdateState() : Promise.resolve(null)
        ])
        setAppVersion(initialVersion)
        setUpdateState(initialUpdateState)
        setSettings(initialSettings)
        onLanguageChange(initialSettings.language)
        document.documentElement.dataset.theme = initialSettings.theme
        await Promise.all([refreshProviders(), refreshRuns()])
        setScanBusy(true)
        const initialResult = window.memento
          ? await window.memento.scan(initialSettings.language)
          : localizedDemoResult(initialSettings.language)
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

  const startAgentRun = (prompt: string, options: { isolated?: boolean; origin?: AgentOrigin } = {}): void => {
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
    if (options.origin) setAgentOrigin(options.origin)
    const startToken = latestAgentStartToken.current + 1
    latestAgentStartToken.current = startToken
    setView('agent')
    setRunStatusMessage(uiText('正在准备设备信息', 'Preparing device information'))
    setSelectedPlanIds(new Set())

    if (!window.memento) {
      const timestamp = new Date().toISOString()
      const run: AgentRunRecord = {
        id: crypto.randomUUID(),
        conversationId: options.isolated ? crypto.randomUUID() : activeRun?.conversationId ?? crypto.randomUUID(),
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
      setWorkspaceRunIds((current) => [...current.filter((id) => id !== run.id), run.id].slice(-8))
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
        setRuns((current) => [completed, ...current])
        if (latestAgentStartToken.current === startToken) {
          setActiveRun(completed)
          activeRunId.current = completed.id
          setSelectedPlanIds(new Set(plan.map((item) => item.id)))
          setRunStatusMessage(uiText('处理计划已经准备好', 'The action plan is ready'))
        }
      }, 900)
      return
    }

    void window.memento.startAgentRun({
      prompt,
      conversationId: options.isolated ? undefined : activeRun?.conversationId
    }).then((run) => {
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)])
      setWorkspaceRunIds((current) => [...current.filter((id) => id !== run.id), run.id].slice(-8))
      if (latestAgentStartToken.current === startToken) {
        activeRunId.current = run.id
        setActiveRun(run)
      }
    }).catch((error) => setToast(error instanceof Error
      ? error.message
      : uiText('无法启动 Agent', 'Could not start the Agent.')))
  }

  const executePlan = async (): Promise<void> => {
    if (!activeRun || !selectedPlanIds.size) return
    if (scanBusy) {
      setToast(appText('请等待当前体检完成后再执行', 'Wait for the current scan to finish before running actions.'))
      return
    }
    const runId = activeRun.id
    const itemIds = [...selectedPlanIds]
    const itemCount = itemIds.length
    setExecutionState({
      phase: 'executing',
      itemCount,
      completedCount: 0,
      progress: 8,
      itemIds,
      detail: settings.language === 'en-US'
        ? 'Running the actions you confirmed.'
        : '正在执行你已经确认的操作。',
      runId
    })
    await waitForNextPaint()
    try {
      if (!window.memento) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 520))
        setExecutionState((current) => current?.runId === runId ? {
          ...current,
          phase: 'verifying',
          progress: 44,
          detail: settings.language === 'en-US'
            ? 'Scanning again to verify the results.'
            : '正在重新体检并验证结果。'
        } : current)
        await new Promise<void>((resolve) => window.setTimeout(resolve, 520))
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
        setSelectedPlanIds(new Set())
        setExecutionState({
          phase: 'completed',
          itemCount,
          completedCount: itemCount,
          progress: 100,
          itemIds,
          detail: settings.language === 'en-US'
            ? 'The actions completed and verification passed.'
            : '操作已经完成，复检结果正常。',
          runId
        })
        setToast(settings.language === 'en-US'
          ? 'The plan completed and the computer was scanned again.'
          : '计划执行完成并已重新体检')
        return
      }
      const executed = await window.memento.executeAgentPlan({
        runId: activeRun.id,
        itemIds
      })
      setActiveRun(executed.run)
      setResult(executed.scan)
      setRuns((current) => [executed.run, ...current.filter((run) => run.id !== executed.run.id)])
      const selectedResults = executed.run.results.filter((item) => itemIds.includes(item.id))
      setExecutionState({
        phase: selectedResults.some((item) => !item.ok) ? 'failed' : 'completed',
        itemCount,
        completedCount: selectedResults.filter((item) => item.ok).length,
        progress: 100,
        itemIds,
        detail: executed.run.error ?? (settings.language === 'en-US'
          ? 'The actions completed and verification passed.'
          : '操作已经完成，复检结果正常。'),
        runId
      })
      setToast(executed.run.error ?? (settings.language === 'en-US'
        ? 'The plan completed and the computer was scanned again.'
        : '计划执行完成并已重新体检'))
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : settings.language === 'en-US' ? 'The action plan failed.' : '处理计划执行失败'
      setExecutionState((current) => current?.runId === runId ? {
        ...current,
        phase: 'failed',
        progress: 100,
        detail: message
      } : current)
      setToast(message)
    }
  }

  const requestDirectAction = (candidate: ScanCandidate, operation: CandidateOperation): void => {
    if (scanBusy) {
      setToast(appText('请等待当前体检完成后再操作', 'Wait for the current scan to finish before running an action.'))
      return
    }
    setPendingDirectAction({
      id: operation.id,
      kind: 'action',
      subject: candidate.name,
      label: operation.label,
      consequence: operation.consequence,
      reversible: operation.reversible,
      estimatedBytes: operation.estimatedBytes ?? candidate.sizeBytes ?? 0
    })
  }

  const requestDirectTerminalFix = (finding: TerminalFinding): void => {
    if (!finding.fix) return
    if (scanBusy) {
      setToast(appText('请等待当前体检完成后再操作', 'Wait for the current scan to finish before running an action.'))
      return
    }
    setPendingDirectAction({
      id: finding.fix.id,
      kind: 'terminal-fix',
      subject: finding.title,
      label: finding.fix.label,
      consequence: finding.fix.consequence,
      reversible: true,
      estimatedBytes: 0
    })
  }

  const executeDirectAction = async (): Promise<void> => {
    if (!pendingDirectAction) return
    const action = pendingDirectAction
    setPendingDirectAction(null)
    setExecutionState({
      phase: 'executing',
      itemCount: 1,
      completedCount: 0,
      progress: 8,
      itemIds: [action.id],
      detail: appText(`正在执行“${action.label}”。`, `Running "${action.label}".`)
    })
    await waitForNextPaint()
    try {
      const results = window.memento
        ? action.kind === 'terminal-fix'
          ? (await window.memento.runTerminalFixes([action.id])).results
          : await window.memento.runActions([action.id])
        : await new Promise<Array<{ id: string; ok: boolean; message: string }>>((resolve) => {
            window.setTimeout(() => resolve([{
              id: action.id,
              ok: true,
              message: appText('操作完成', 'Action completed')
            }]), 520)
          })
      const completedCount = results.filter((item) => item.ok).length
      setExecutionState({
        phase: 'verifying',
        itemCount: 1,
        completedCount,
        progress: 44,
        itemIds: [action.id],
        detail: appText('正在重新体检并验证结果。', 'Scanning again to verify the result.')
      })
      setScanBusy(true)
      const verified = window.memento
        ? await window.memento.scan(settings.language)
        : await new Promise<ScanResult>((resolve) => window.setTimeout(() => resolve(localizedDemoResult(settings.language)), 520))
      setResult(verified)
      const failure = results.find((item) => !item.ok)
      setExecutionState({
        phase: failure ? 'failed' : 'completed',
        itemCount: 1,
        completedCount,
        progress: 100,
        itemIds: [action.id],
        detail: failure?.message ?? appText(
          `“${action.label}”已完成，复检结果正常。`,
          `"${action.label}" completed and verification passed.`
        )
      })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : appText('操作或复检未能完成', 'The action or verification did not complete.')
      setExecutionState({
        phase: 'failed',
        itemCount: 1,
        completedCount: 0,
        progress: 100,
        itemIds: [action.id],
        detail: message
      })
      setToast(message)
    } finally {
      setScanBusy(false)
    }
  }

  const returnToAgentOrigin = (): void => {
    if (!agentOrigin) return
    if (agentOrigin.view === 'health') setHealthTab(agentOrigin.tab)
    setRestoreTarget({
      view: agentOrigin.view,
      itemId: agentOrigin.itemId,
      scrollTop: agentOrigin.scrollTop,
      token: Date.now()
    })
    setView(agentOrigin.view)
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
    const wasFinished = ['completed', 'failed', 'cancelled'].includes(activeRun.status)
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
      const completedIds = new Set(updated.results.filter((item) => item.ok).map((item) => item.id))
      setSelectedPlanIds(wasFinished
        ? new Set([id])
        : new Set(updated.plan.filter((item) => !completedIds.has(item.id)).map((item) => item.id)))
      setRunStatusMessage(settings.language === 'en-US' ? 'Added to the confirmation plan' : '已加入确认计划')
    } catch (error) {
      setToast(error instanceof Error
        ? error.message
        : settings.language === 'en-US' ? 'Could not add the action to the plan.' : '无法加入处理计划')
    } finally {
      setAddingOperationId(null)
    }
  }

  const openIgnoredManager = (kind: 'storage' | 'services' | 'applications' = 'storage'): void => {
    setIgnoredManagerKind(kind)
    setIgnoredManagerOpen(true)
  }

  const confirmApplicationIgnore = async (): Promise<void> => {
    if (!pendingApplicationIgnore) return
    const application = pendingApplicationIgnore
    const value = applicationWhitelistValue(application)
    setIgnoreBusy(true)
    try {
      await updateSettings({
        applicationWhitelist: [...settings.applicationWhitelist, value]
      })
      setResult((current) => current ? {
        ...current,
        applications: current.applications.filter((item) => item.id !== application.id),
        ignoredApplications: [
          ...current.ignoredApplications.filter((item) => item.id !== application.id),
          { ...application, action: undefined }
        ],
        candidates: current.candidates.filter((candidate) => !(
          candidate.section === 'applications' &&
          (candidate.operations ?? []).some((operation) => operation.id === application.action?.id)
        ))
      } : current)
      setToast(appText(
        `${application.name} 已加入忽略列表`,
        `${application.name} was added to Ignored items.`
      ))
      setPendingApplicationIgnore(null)
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法更新忽略列表', 'Could not update Ignored items.'))
    } finally {
      setIgnoreBusy(false)
    }
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

  const restoreIgnored = async (kind: 'services' | 'storage' | 'applications', value: string): Promise<void> => {
    setRestoreBusyValue(value)
    try {
      await updateSettings(kind === 'services'
        ? { serviceWhitelist: settings.serviceWhitelist.filter((item) => item !== value) }
        : kind === 'storage'
          ? { storageWhitelist: settings.storageWhitelist.filter((item) => item !== value) }
          : { applicationWhitelist: settings.applicationWhitelist.filter((item) => item !== value) })
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

  const deleteHistoryRun = async (): Promise<void> => {
    if (!pendingHistoryDelete) return
    const run = pendingHistoryDelete
    setHistoryDeleteBusy(true)
    try {
      if (window.memento) await window.memento.deleteAgentRun(run.id)
      setRuns((current) => current.filter((item) => item.id !== run.id))
      setWorkspaceRunIds((current) => current.filter((id) => id !== run.id))
      if (activeRun?.id === run.id) {
        setActiveRun(null)
        activeRunId.current = null
        setSelectedPlanIds(new Set())
        setRunStatusMessage('')
      }
      setPendingHistoryDelete(null)
      setToast(appText('任务记录已删除', 'Task history deleted.'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法删除任务记录', 'Could not delete task history.'))
    } finally {
      setHistoryDeleteBusy(false)
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

  const importCcSwitchProviders = async (): Promise<CcSwitchImportResult> => {
    try {
      const imported = window.memento
        ? await window.memento.importCcSwitchProviders()
        : { databaseFound: true, detected: 1, imported: 1 }
      await refreshProviders()
      setToast(!imported.databaseFound
        ? appText('没有找到本地 CC Switch 配置', 'No local CC Switch configuration was found.')
        : imported.detected === 0
          ? appText('CC Switch 中没有可导入的有效配置', 'CC Switch has no usable configuration to import.')
          : appText(
              `已读取 ${imported.detected} 个配置，新增或更新 ${imported.imported} 个`,
              `${imported.detected} configurations read; ${imported.imported} added or updated.`
            ))
      return imported
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法导入 CC Switch', 'Could not import CC Switch.'))
      throw error
    }
  }

  const checkForUpdates = async (): Promise<void> => {
    try {
      const next = window.memento
        ? await window.memento.checkForUpdates()
        : {
            currentVersion: appVersion,
            latestVersion: null,
            updateAvailable: false,
            releaseUrl: null,
            checkedAt: new Date().toISOString(),
            error: null
          }
      setUpdateState(next)
      setToast(next.error
        ? appText('检查更新失败，请稍后重试', 'Could not check for updates. Try again later.')
        : next.updateAvailable && next.latestVersion
          ? appText(`发现新版本 v${next.latestVersion}`, `Memento v${next.latestVersion} is available.`)
          : appText('当前已是最新版本', 'Memento is up to date.'))
    } catch (error) {
      setToast(error instanceof Error ? error.message : appText('无法检查更新', 'Could not check for updates.'))
    }
  }

  const openUpdatePage = (): void => {
    void window.memento?.openUpdatePage().catch((error) => {
      setToast(error instanceof Error ? error.message : appText('无法打开版本页面', 'Could not open the release page.'))
    })
  }

  const healthCount = result
    ? result.candidates.filter((candidate) => candidate.section === 'storage' || candidate.section === 'services').length + result.terminal.findings.filter((finding) => finding.fix).length
    : 0
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
  const workspaceRuns = useMemo(() => {
    const byId = new Map(runs.map((run) => [run.id, run]))
    if (activeRun) byId.set(activeRun.id, activeRun)
    return workspaceRunIds
      .map((id) => byId.get(id))
      .filter((run): run is AgentRunRecord => Boolean(run))
  }, [activeRun, runs, workspaceRunIds])

  const selectWorkspaceRun = (run: AgentRunRecord): void => {
    setActiveRun(run)
    activeRunId.current = run.id
    const completedIds = new Set(run.results.filter((item) => item.ok).map((item) => item.id))
    setSelectedPlanIds(new Set(run.plan
      .filter((item) => !completedIds.has(item.id))
      .map((item) => item.id)))
    setRunStatusMessage('')
    setView('agent')
  }
  const agentOriginLabel = agentOrigin?.view === 'apps'
    ? appText('应用管理', 'Applications')
    : agentOrigin?.view === 'health'
      ? agentOrigin.tab === 'services'
        ? appText('后台服务', 'Services')
        : agentOrigin.tab === 'terminal'
          ? appText('终端诊断', 'Terminal')
          : appText('存储空间', 'Storage')
      : null

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
      appVersion={appVersion}
      updateState={updateState}
      hostname={result?.system.hostname ?? ''}
      osVersion={result?.system.osVersion ?? ''}
      onNavigate={setView}
      onOpenUpdate={openUpdatePage}
    >
      {view === 'agent' && <AgentPage scan={result} run={activeRun} conversationRuns={conversationRuns} workspaceRuns={workspaceRuns} statusMessage={runStatusMessage} selectedPlanIds={selectedPlanIds} providerConfigured={Boolean(defaultProvider)} addingOperationId={addingOperationId} openingApplicationId={openingApplicationId} returnLabel={agentOriginLabel} onSubmit={startAgentRun} onSelectWorkspaceRun={selectWorkspaceRun} onNewTask={() => { setActiveRun(null); activeRunId.current = null; setSelectedPlanIds(new Set()); setRunStatusMessage(''); setAgentOrigin(null) }} onOpenHistory={() => setView('history')} onOpenSettings={() => setView('settings')} onReturn={returnToAgentOrigin} onOpenApplication={openAgentApplication} onAddPlanItem={(id) => void addAgentPlanItem(id)} onTogglePlanItem={(id) => setSelectedPlanIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onExecutePlan={() => void executePlan()} onDiscardPlan={discardPlan} />}
      {view === 'health' && <HealthPage result={result} settings={settings} scanBusy={scanBusy} progress={progress} tab={healthTab} storageMode={storageMode} diskUsage={diskUsage} diskUsageProgress={diskUsageProgress} diskUsageBusy={diskUsageBusy} diskUsageError={diskUsageError} restoreTarget={restoreTarget?.view === 'health' ? restoreTarget : null} onRestoreComplete={() => setRestoreTarget(null)} onScan={() => void scanNow()} onTabChange={setHealthTab} onStorageModeChange={changeStorageMode} onDiskUsageScan={() => void scanDiskUsage()} onDiskUsageCancel={cancelDiskUsageScan} onRevealDiskUsageNode={revealDiskUsageNode} onAgentPrompt={(prompt, origin: HealthAgentOrigin) => startAgentRun(prompt, { origin: { view: 'health', ...origin } })} onDirectAction={requestDirectAction} onDirectTerminalFix={requestDirectTerminalFix} onIgnore={setPendingIgnore} onManageIgnored={openIgnoredManager} />}
      {view === 'apps' && <ApplicationsPage applications={result?.applications ?? []} openingId={openingApplicationId} removingId={removingApplicationId} restoreTarget={restoreTarget?.view === 'apps' ? restoreTarget : null} onRestoreComplete={() => setRestoreTarget(null)} ignoredCount={settings.applicationWhitelist.length} onOpen={(application) => void openApplication(application)} onUninstall={setPendingUninstall} onIgnore={setPendingApplicationIgnore} onManageIgnored={() => openIgnoredManager('applications')} onAgentPrompt={(prompt, origin) => startAgentRun(prompt, { isolated: true, origin: { view: 'apps', ...origin } })} />}
      {view === 'history' && <HistoryPage runs={runs} onOpenRun={(run) => { setActiveRun(run); activeRunId.current = run.id; setSelectedPlanIds(new Set()); setView('agent') }} onDeleteRun={setPendingHistoryDelete} />}
      {view === 'settings' && <SettingsPage settings={settings} providers={providers} appVersion={appVersion} updateState={updateState} onUpdateSettings={updateSettings} onDiscoverModels={discoverProviderModels} onSaveProvider={saveProvider} onTestProvider={testProvider} onDeleteProvider={deleteProvider} onSetDefaultProvider={setDefaultProvider} onImportCcSwitch={importCcSwitchProviders} onCheckUpdates={checkForUpdates} onManageIgnored={() => openIgnoredManager()} onToast={setToast} />}

      {pendingDirectAction && <DirectActionConfirmDialog action={pendingDirectAction} onClose={() => setPendingDirectAction(null)} onConfirm={() => void executeDirectAction()} />}
      {executionState && <ExecutionProgressDialog phase={executionState.phase} progress={executionState.progress} itemCount={executionState.itemCount} completedCount={executionState.completedCount} detail={executionState.detail} onClose={() => setExecutionState(null)} />}
      {pendingUninstall && <UninstallDialog application={pendingUninstall} busy={uninstallBusy} onClose={() => setPendingUninstall(null)} onConfirm={() => void uninstallApplication()} />}
      {pendingIgnore && <IgnoreConfirmDialog candidate={pendingIgnore} busy={ignoreBusy} onClose={() => setPendingIgnore(null)} onConfirm={() => void confirmIgnore()} />}
      {pendingApplicationIgnore && <ApplicationIgnoreConfirmDialog application={pendingApplicationIgnore} busy={ignoreBusy} onClose={() => setPendingApplicationIgnore(null)} onConfirm={() => void confirmApplicationIgnore()} />}
      {ignoredManagerOpen && <IgnoredItemsDialog initialKind={ignoredManagerKind} serviceValues={settings.serviceWhitelist} storageValues={settings.storageWhitelist} applicationValues={settings.applicationWhitelist} ignoredApplications={result?.ignoredApplications ?? []} busyValue={restoreBusyValue} onRestore={(kind, value) => void restoreIgnored(kind, value)} onClose={() => setIgnoredManagerOpen(false)} />}
      {pendingHistoryDelete && <DeleteHistoryDialog run={pendingHistoryDelete} busy={historyDeleteBusy} onClose={() => setPendingHistoryDelete(null)} onConfirm={() => void deleteHistoryRun()} />}
      {toast && <div className="toast is-visible" role="status"><CheckCircle2 size={16} /><span>{toast}</span></div>}
    </Shell>
  )
}

export default function App(): React.JSX.Element {
  const [language, setLanguage] = useState(DEFAULT_APP_SETTINGS.language)
  return <I18nProvider language={language}><AppContent onLanguageChange={setLanguage} /></I18nProvider>
}

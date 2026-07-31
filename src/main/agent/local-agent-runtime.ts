import { randomUUID } from 'node:crypto'
import { stepCountIs, tool, ToolLoopAgent } from 'ai'
import { z } from 'zod'
import type { AppLanguage } from '../../shared/app-settings'
import type {
  AddAgentPlanItemsInput,
  AgentFocus,
  AgentPlanItem,
  AgentPresentation,
  AgentResultItem,
  AgentResultKind,
  AgentResultOperation,
  AgentResultSection,
  AgentRunEvent,
  AgentRunRecord,
  StartAgentRunInput
} from '../../shared/agent-types'
import type {
  CandidateOperation,
  InstalledApplication,
  ScanCandidate,
  ScanResult,
  TerminalFinding
} from '../../shared/types'
import { AgentStore, type PrivateAgentProvider } from './agent-store'
import { createProviderModel, providerErrorMessage } from './provider-factory'

type EmitAgentEvent = (event: AgentRunEvent) => void

const RESULT_KINDS: AgentResultKind[] = ['services', 'storage', 'applications', 'terminal']

function t(language: AppLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

function candidateOperations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ id: candidate.id, ...candidate.action }] : []
}

function resultOperation(
  operation: CandidateOperation,
  estimatedBytes = 0
): AgentResultOperation {
  return {
    id: operation.id,
    label: operation.label,
    consequence: operation.consequence,
    reversible: operation.reversible,
    estimatedBytes: operation.estimatedBytes ?? estimatedBytes
  }
}

export function availablePlanItems(
  scan: ScanResult,
  language: AppLanguage = 'zh-CN'
): AgentPlanItem[] {
  const items: AgentPlanItem[] = []
  for (const candidate of scan.candidates) {
    for (const operation of candidateOperations(candidate)) {
      items.push({
        id: operation.id,
        kind: 'action',
        actionKind: operation.kind,
        title: operation.label || candidate.name,
        detail: `${candidate.name} · ${operation.consequence}`,
        estimatedBytes: operation.estimatedBytes ?? candidate.sizeBytes ?? 0,
        risk: candidate.risk === 'safe' && operation.reversible ? 'safe' : 'review',
        reversible: operation.reversible
      })
    }
  }
  for (const application of scan.applications) {
    if (!application.action) continue
    items.push({
      id: application.action.id,
      kind: 'action',
      actionKind: application.action.kind,
      title: t(language, `卸载 ${application.name}`, `Uninstall ${application.name}`),
      detail: t(
        language,
        `把 ${application.name} 应用本体移到废纸篓`,
        `Move the ${application.name} app bundle to the Trash`
      ),
      estimatedBytes: application.sizeBytes,
      risk: 'review',
      reversible: application.action.reversible
    })
  }
  for (const finding of scan.terminal.findings) {
    if (!finding.fix) continue
    items.push({
      id: finding.fix.id,
      kind: 'terminal-fix',
      actionKind: 'terminal-fix',
      title: finding.fix.label,
      detail: finding.fix.consequence,
      estimatedBytes: 0,
      risk: 'safe',
      reversible: true
    })
  }
  return items
}

function candidateResult(candidate: ScanCandidate): AgentResultItem {
  return {
    kind: candidate.section === 'services' ? 'services' : 'storage',
    id: candidate.id,
    name: candidate.name,
    subtitle: candidate.subtitle,
    description: candidate.description,
    status: candidate.status,
    risk: candidate.risk,
    sizeBytes: candidate.sizeBytes ?? 0,
    location: candidate.location ?? null,
    evidence: candidate.evidence.slice(0, 6),
    serviceAnomalies: candidate.serviceAnomalies,
    serviceMetrics: candidate.serviceMetrics,
    operations: candidateOperations(candidate).map((operation) => (
      resultOperation(operation, candidate.sizeBytes)
    ))
  }
}

function applicationResult(application: InstalledApplication): AgentResultItem {
  return {
    kind: 'applications',
    id: application.id,
    name: application.name,
    version: application.version,
    bundleId: application.bundleId,
    location: application.location,
    scope: application.scope,
    protectedReason: application.protectedReason,
    backgroundOnly: application.backgroundOnly,
    executable: application.executable,
    urlSchemes: application.urlSchemes,
    sizeBytes: application.sizeBytes,
    lastUsedAt: application.lastUsedAt,
    unused: application.unused,
    operation: application.action
      ? resultOperation(application.action, application.sizeBytes)
      : null
  }
}

function terminalResult(finding: TerminalFinding): AgentResultItem {
  return {
    kind: 'terminal',
    id: finding.id,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    durationMs: finding.durationMs ?? null,
    source: finding.source ?? null,
    recommendation: finding.recommendation ?? null,
    operation: finding.fix
      ? {
          id: finding.fix.id,
          label: finding.fix.label,
          consequence: finding.fix.consequence,
          reversible: true,
          estimatedBytes: 0
        }
      : null
  }
}

function resultRegistry(scan: ScanResult): Map<string, AgentResultItem> {
  const items: AgentResultItem[] = [
    ...scan.candidates.map(candidateResult),
    ...scan.applications.map(applicationResult),
    ...scan.terminal.findings.map(terminalResult)
  ]
  return new Map(items.map((item) => [item.id, item]))
}

function itemName(item: AgentResultItem): string {
  return item.kind === 'terminal' ? item.title : item.name
}

function focusForItems(items: AgentResultItem[]): AgentFocus[] {
  const seen = new Set<string>()
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, 8)
    .map((item) => ({ kind: item.kind, id: item.id, name: itemName(item) }))
}

export function inferPromptFocus(prompt: string, scan: ScanResult): AgentFocus[] {
  const query = prompt.toLocaleLowerCase()
  const matches: AgentResultItem[] = []
  for (const item of resultRegistry(scan).values()) {
    const searchable = [item.id, itemName(item)]
    if (item.kind === 'applications') {
      searchable.push(item.location)
      if (item.bundleId) searchable.push(item.bundleId)
    }
    if (searchable.some((value) => value.length >= 4 && query.includes(value.toLocaleLowerCase()))) {
      matches.push(item)
    }
  }
  return focusForItems(matches)
}

function compactCandidate(candidate: ScanCandidate): Record<string, unknown> {
  return {
    id: candidate.id,
    section: candidate.section,
    name: candidate.name,
    subtitle: candidate.subtitle,
    description: candidate.description,
    location: candidate.location,
    sizeBytes: candidate.sizeBytes ?? 0,
    ageDays: candidate.ageDays,
    risk: candidate.risk,
    status: candidate.status,
    serviceAnomalies: candidate.serviceAnomalies,
    serviceMetrics: candidate.serviceMetrics,
    evidence: candidate.evidence.slice(0, 6),
    operations: candidateOperations(candidate).map((operation) => ({
      id: operation.id,
      label: operation.label,
      consequence: operation.consequence,
      reversible: operation.reversible,
      estimatedBytes: operation.estimatedBytes ?? candidate.sizeBytes ?? 0
    }))
  }
}

function compactApplication(application: InstalledApplication): Record<string, unknown> {
  return {
    id: application.id,
    name: application.name,
    bundleId: application.bundleId,
    version: application.version,
    location: application.location,
    scope: application.scope,
    protectedReason: application.protectedReason,
    backgroundOnly: application.backgroundOnly,
    executable: application.executable,
    urlSchemes: application.urlSchemes,
    sizeBytes: application.sizeBytes,
    lastUsedAt: application.lastUsedAt,
    unusedForThreeMonths: application.unused,
    operationId: application.action?.id
  }
}

function compactFinding(finding: TerminalFinding): Record<string, unknown> {
  return {
    id: finding.id,
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    durationMs: finding.durationMs,
    source: finding.source,
    recommendation: finding.recommendation,
    fix: finding.fix
  }
}

function sectionTitle(kind: AgentResultKind, language: AppLanguage): string {
  const labels: Record<AgentResultKind, [string, string]> = {
    services: ['后台服务', 'Background services'],
    storage: ['存储空间', 'Storage'],
    applications: ['应用管理', 'Applications'],
    terminal: ['终端诊断', 'Terminal diagnostics']
  }
  return labels[kind][language === 'en-US' ? 1 : 0]
}

function presentationFromReferences(
  summary: string,
  requestedSections: Array<{ kind: AgentResultKind; title?: string; itemIds: string[] }>,
  registry: Map<string, AgentResultItem>,
  language: AppLanguage
): { presentation: AgentPresentation; focus: AgentFocus[] } {
  const selectedItems: AgentResultItem[] = []
  const sections: AgentResultSection[] = []
  for (const requested of requestedSections) {
    const items = requested.itemIds
      .map((id) => registry.get(id))
      .filter((item): item is AgentResultItem => Boolean(item && item.kind === requested.kind))
      .slice(0, 24)
    if (!items.length) continue
    selectedItems.push(...items)
    sections.push({
      kind: requested.kind,
      title: requested.title?.trim().slice(0, 100) || sectionTitle(requested.kind, language),
      items
    })
  }
  return {
    presentation: { summary: summary.trim().slice(0, 1200), sections },
    focus: focusForItems(selectedItems)
  }
}

function fallbackPresentation(
  summary: string,
  inspectedKinds: Set<AgentResultKind>,
  directFocus: AgentFocus[],
  registry: Map<string, AgentResultItem>,
  language: AppLanguage
): { presentation: AgentPresentation; focus: AgentFocus[] } | null {
  const focusedItems = directFocus
    .map((focus) => registry.get(focus.id))
    .filter((item): item is AgentResultItem => Boolean(item))
  const sections: Array<{ kind: AgentResultKind; itemIds: string[] }> = []
  if (focusedItems.length) {
    for (const kind of RESULT_KINDS) {
      const itemIds = focusedItems.filter((item) => item.kind === kind).map((item) => item.id)
      if (itemIds.length) sections.push({ kind, itemIds })
    }
  } else {
    for (const kind of inspectedKinds) {
      let items = [...registry.values()].filter((item) => item.kind === kind)
      if (kind === 'applications') {
        items = items.filter((item) => item.kind === 'applications' && item.unused)
      } else if (kind === 'terminal') {
        items = items.filter((item) => item.kind === 'terminal' && item.severity !== 'good')
      }
      sections.push({ kind, itemIds: items.slice(0, 12).map((item) => item.id) })
    }
  }
  if (!sections.length) return null
  return presentationFromReferences(summary, sections, registry, language)
}

export function compactConversationContext(runs: AgentRunRecord[]): Array<Record<string, unknown>> {
  return runs.slice(-8).map((run) => ({
    userRequest: run.prompt,
    outcome: (run.presentation?.summary ?? run.response ?? '').slice(0, 600),
    focus: run.focus,
    pendingPlan: run.status === 'awaiting-confirmation'
      ? run.plan.map((item) => ({
          operationId: item.id,
          title: item.title,
          detail: item.detail
        }))
      : [],
    status: run.status
  }))
}

export function resolveContextualFocus(
  prompt: string,
  directFocus: AgentFocus[],
  priorRuns: AgentRunRecord[]
): AgentFocus[] {
  if (directFocus.length) return directFocus
  const followsFocusedReference = /(?:这个|这个服务|这个应用|该项|该服务|它|上述|this\s+(?:service|app|item)|that\s+(?:service|app|item)|\bit\b)/i
    .test(prompt)
  if (!followsFocusedReference) return []
  return [...priorRuns].reverse().find((run) => run.focus.length)?.focus ?? []
}

export class LocalAgentRuntime {
  private readonly controllers = new Map<string, AbortController>()

  constructor(private readonly store: AgentStore) {}

  start(
    input: StartAgentRunInput,
    scan: ScanResult,
    language: AppLanguage,
    emit: EmitAgentEvent
  ): AgentRunRecord {
    const cleanPrompt = typeof input?.prompt === 'string' ? input.prompt.trim().slice(0, 4000) : ''
    if (!cleanPrompt) {
      throw new Error(t(language, '请输入要检查或处理的问题', 'Describe what you want to inspect or handle.'))
    }
    const requestedConversationId = typeof input.conversationId === 'string' &&
      /^[a-zA-Z0-9-]{1,100}$/.test(input.conversationId)
      ? input.conversationId
      : null
    const conversationId = requestedConversationId ?? randomUUID()
    const provider = this.store.getDefaultPrivateProvider()
    const directFocus = inferPromptFocus(cleanPrompt, scan)
    const run = this.store.createRun(cleanPrompt, provider, language, conversationId, directFocus)
    const controller = new AbortController()
    this.controllers.set(run.id, controller)
    void this.execute(run, scan, provider, controller, emit)
    return run
  }

  cancel(runId: string): void {
    const controller = this.controllers.get(runId)
    if (controller) {
      controller.abort()
      return
    }
    const run = this.store.getRun(runId)
    if (run && ['plan-ready', 'awaiting-confirmation'].includes(run.status)) {
      this.store.updateRun(runId, {
        status: 'cancelled',
        plan: [],
        error: null
      })
    }
  }

  addPlanItems(input: AddAgentPlanItemsInput, scan: ScanResult): AgentRunRecord {
    const run = this.store.getRun(typeof input?.runId === 'string' ? input.runId : '')
    if (!run) {
      throw new Error(t(
        this.store.getAppSettings().language,
        'Agent 任务不存在',
        'The Agent task does not exist.'
      ))
    }
    if (!Array.isArray(input.itemIds) || input.itemIds.length === 0 || input.itemIds.length > 100) {
      throw new Error(t(run.language, '处理计划包含无效操作', 'The action plan contains invalid operations.'))
    }
    const available = new Map(availablePlanItems(scan, run.language).map((item) => [item.id, item]))
    const uniqueIds = [...new Set(input.itemIds)]
    const additions = uniqueIds
      .map((id) => available.get(id))
      .filter((item): item is AgentPlanItem => Boolean(item))
    if (additions.length !== uniqueIds.length) {
      throw new Error(t(run.language, '操作已经失效，请重新体检', 'An operation is stale. Scan again.'))
    }
    const merged = new Map(run.plan.map((item) => [item.id, item]))
    additions.forEach((item) => merged.set(item.id, item))
    return this.store.updateRun(run.id, {
      status: 'awaiting-confirmation',
      plan: [...merged.values()],
      error: null
    })
  }

  private async execute(
    initialRun: AgentRunRecord,
    scan: ScanResult,
    provider: PrivateAgentProvider,
    controller: AbortController,
    emit: EmitAgentEvent
  ): Promise<void> {
    const language = initialRun.language
    const allPlanItems = availablePlanItems(scan, language)
    const planItemMap = new Map(allPlanItems.map((item) => [item.id, item]))
    const registry = resultRegistry(scan)
    const priorRuns = this.store.listConversationRuns(initialRun.conversationId)
      .filter((run) => run.id !== initialRun.id)
    const conversationContext = compactConversationContext(priorRuns)
    const latestFocus = [...priorRuns].reverse().find((run) => run.focus.length)?.focus ?? []
    const contextualFocus = resolveContextualFocus(initialRun.prompt, initialRun.focus, priorRuns)
    const contextualFocusIds = new Set(contextualFocus.map((focus) => focus.id))
    const inspectedKinds = new Set<AgentResultKind>()
    let proposedPlan: AgentPlanItem[] = []
    let presented: AgentPresentation | null = null
    let presentedFocus: AgentFocus[] = initialRun.focus

    const setStatus = (status: AgentRunRecord['status'], chinese: string, english: string): void => {
      const message = t(language, chinese, english)
      this.store.updateRun(initialRun.id, { status })
      emit({ type: 'status', runId: initialRun.id, status, message })
    }

    const recordTool = <T>(name: string, input: unknown, output: T): T => {
      this.store.logToolCall(initialRun.id, name, input, output)
      return output
    }

    try {
      setStatus('analyzing', '正在分析设备状态', 'Analyzing device status')
      const tools = {
        inspect_device: tool({
          description: 'Read the current device health summary before making recommendations.',
          inputSchema: z.object({}),
          execute: async (input) => recordTool('inspect_device', input, {
            hostname: scan.system.hostname,
            osVersion: scan.system.osVersion,
            diskTotalBytes: scan.system.diskTotalBytes,
            diskFreeBytes: scan.system.diskFreeBytes,
            storageFindingCount: scan.candidates.filter((item) => item.section === 'storage').length,
            serviceFindingCount: scan.candidates.filter((item) => item.section === 'services').length,
            applicationCount: scan.applications.length,
            terminalStartupMs: scan.terminal.startupMs,
            warnings: scan.warnings
          })
        }),
        inspect_storage: tool({
          description: 'List storage findings, stable item IDs, and registered operation IDs.',
          inputSchema: z.object({}),
          execute: async (input) => {
            inspectedKinds.add('storage')
            setStatus('analyzing', '正在检查存储空间', 'Inspecting storage')
            return recordTool(
              'inspect_storage',
              input,
              scan.candidates
                .filter((item) => item.section === 'storage')
                .filter((item) => !contextualFocusIds.size || contextualFocusIds.has(item.id))
                .map(compactCandidate)
            )
          }
        }),
        inspect_background_services: tool({
          description: 'List background-service findings, stable item IDs, impact, and registered operation IDs.',
          inputSchema: z.object({}),
          execute: async (input) => {
            inspectedKinds.add('services')
            setStatus('analyzing', '正在检查后台服务', 'Inspecting background services')
            return recordTool(
              'inspect_background_services',
              input,
              scan.candidates
                .filter((item) => item.section === 'services')
                .filter((item) => !contextualFocusIds.size || contextualFocusIds.has(item.id))
                .map(compactCandidate)
            )
          }
        }),
        inspect_applications: tool({
          description: 'List manageable applications with stable IDs, usage dates, sizes, and uninstall IDs.',
          inputSchema: z.object({}),
          execute: async (input) => {
            inspectedKinds.add('applications')
            setStatus('analyzing', '正在检查应用使用情况', 'Inspecting application usage')
            return recordTool(
              'inspect_applications',
              input,
              scan.applications
                .filter((item) => !contextualFocusIds.size || contextualFocusIds.has(item.id))
                .slice(0, 160)
                .map(compactApplication)
            )
          }
        }),
        inspect_terminal: tool({
          description: 'Read terminal measurements, stable finding IDs, and deterministic reversible fixes.',
          inputSchema: z.object({}),
          execute: async (input) => {
            inspectedKinds.add('terminal')
            setStatus('analyzing', '正在检查终端启动', 'Inspecting terminal startup')
            return recordTool('inspect_terminal', input, {
              shell: scan.terminal.shell,
              baselineMs: scan.terminal.baselineMs,
              startupMs: scan.terminal.startupMs,
              findings: scan.terminal.findings
                .filter((item) => !contextualFocusIds.size || contextualFocusIds.has(item.id))
                .map(compactFinding)
            })
          }
        }),
        present_results: tool({
          description: 'Build the trusted interactive result UI. Use only stable item IDs returned by inspection tools.',
          inputSchema: z.object({
            summary: z.string().max(1200),
            sections: z.array(z.object({
              kind: z.enum(RESULT_KINDS),
              title: z.string().max(100).optional(),
              itemIds: z.array(z.string()).max(24)
            })).max(8)
          }),
          execute: async (input) => {
            const resolved = presentationFromReferences(
              input.summary,
              input.sections,
              registry,
              language
            )
            presented = resolved.presentation
            presentedFocus = resolved.focus
            return recordTool('present_results', input, {
              acceptedSections: resolved.presentation.sections.map((section) => ({
                kind: section.kind,
                itemIds: section.items.map((item) => item.id)
              })),
              rejectedItemCount: input.sections.reduce((count, section) => (
                count + section.itemIds.filter((id) => {
                  const item = registry.get(id)
                  return !item || item.kind !== section.kind
                }).length
              ), 0)
            })
          }
        }),
        prepare_action_plan: tool({
          description: 'Prepare executable Memento operations for user confirmation. Never invent IDs.',
          inputSchema: z.object({
            operationIds: z.array(z.string()).max(100),
            rationale: z.string().max(1000)
          }),
          execute: async (input) => {
            const uniqueIds = [...new Set(input.operationIds)]
            proposedPlan = uniqueIds
              .map((id) => planItemMap.get(id))
              .filter((item): item is AgentPlanItem => Boolean(item))
            setStatus('plan-ready', '处理计划已经准备好', 'The action plan is ready')
            return recordTool('prepare_action_plan', input, {
              acceptedOperationIds: proposedPlan.map((item) => item.id),
              rejectedOperationIds: uniqueIds.filter((id) => !planItemMap.has(id)),
              requiresUserConfirmation: true
            })
          }
        })
      }

      const languageInstruction = language === 'en-US'
        ? 'Write every user-visible summary, title, explanation, and plan rationale in English, even when the user writes in another language.'
        : 'Write every user-visible summary, title, explanation, and plan rationale in Simplified Chinese.'
      const context = JSON.stringify({
        recentTurns: conversationContext,
        latestFocusedEntities: latestFocus,
        currentPromptDirectMatches: initialRun.focus
      })
      const agent = new ToolLoopAgent({
        id: 'memento-local-agent',
        model: createProviderModel(provider),
        instructions: [
          'You are Memento, the product-integrated local computer maintenance agent.',
          languageInstruction,
          'Use inspection tools before making claims about this computer.',
          'When analyzing one specific storage item or background service, begin the user-visible summary by directly naming the owning product or vendor and stating what it does. Prefer scanner evidence and exact paths. If ownership is not established, say that it is unknown instead of guessing.',
          'The conversation context below is authoritative for follow-up references.',
          'When the user says this service, this app, it, that item, or an equivalent pronoun, resolve it to the latest focused entity. If there is exactly one matching focused entity, never ask which entity and never list unrelated entities.',
          'Memento has native Application Management, Storage, Background Services, and Terminal Diagnostics modules.',
          'After inspection, call present_results exactly once with the most relevant stable item IDs so Memento can render compact interactive controls. Do not output HTML, Markdown tables, shell commands, or a wall of text.',
          'Only operations returned by inspection tools are real and executable.',
          'When the user asks to change, stop, remove, uninstall, fix, or clean something, call prepare_action_plan with exact operation IDs.',
          'Never claim an operation was executed. Execution only happens after user confirmation in Memento.',
          'Do not give manual steps when a registered Memento operation exists.',
          `Conversation context: ${context}`
        ].join('\n'),
        tools,
        stopWhen: stepCountIs(12),
        maxOutputTokens: 1400,
        temperature: 0.1
      })

      const result = await agent.generate({
        prompt: initialRun.prompt,
        abortSignal: controller.signal,
        timeout: 120_000
      })
      const fallbackSummary = result.text.trim() || t(language, '检查已经完成。', 'Inspection complete.')
      if (!presented) {
        const fallback = fallbackPresentation(
          fallbackSummary,
          inspectedKinds,
          contextualFocus,
          registry,
          language
        )
        if (fallback) {
          presented = fallback.presentation
          presentedFocus = fallback.focus
        }
      }
      const status = proposedPlan.length > 0 ? 'awaiting-confirmation' : 'completed'
      const completed = this.store.updateRun(initialRun.id, {
        status,
        response: presented?.summary || fallbackSummary,
        presentation: presented,
        focus: presentedFocus,
        plan: proposedPlan,
        error: null
      })
      emit({ type: 'completed', run: completed })
    } catch (error) {
      const cancelled = controller.signal.aborted
      const failed = this.store.updateRun(initialRun.id, {
        status: cancelled ? 'cancelled' : 'failed',
        error: cancelled
          ? t(language, '任务已取消', 'Task cancelled')
          : providerErrorMessage(error, provider.apiKey, language)
      })
      emit({ type: 'failed', run: failed })
    } finally {
      this.controllers.delete(initialRun.id)
    }
  }
}

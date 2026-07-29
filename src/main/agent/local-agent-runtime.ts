import { stepCountIs, tool, ToolLoopAgent } from 'ai'
import { z } from 'zod'
import type {
  AgentPlanItem,
  AgentRunEvent,
  AgentRunRecord
} from '../../shared/agent-types'
import type {
  CandidateOperation,
  InstalledApplication,
  ScanCandidate,
  ScanResult,
  TerminalFinding
} from '../../shared/types'
import { AgentStore } from './agent-store'
import { createProviderModel, providerErrorMessage } from './provider-factory'

type EmitAgentEvent = (event: AgentRunEvent) => void

function candidateOperations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ id: candidate.id, ...candidate.action }] : []
}

function availablePlanItems(scan: ScanResult): AgentPlanItem[] {
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
      title: `卸载 ${application.name}`,
      detail: `把 ${application.name} 应用本体移到废纸篓`,
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

function compactCandidate(candidate: ScanCandidate): Record<string, unknown> {
  return {
    name: candidate.name,
    description: candidate.description,
    sizeBytes: candidate.sizeBytes ?? 0,
    ageDays: candidate.ageDays,
    risk: candidate.risk,
    status: candidate.status,
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
    name: application.name,
    version: application.version,
    sizeBytes: application.sizeBytes,
    lastUsedAt: application.lastUsedAt,
    unusedForThreeMonths: application.unused,
    operationId: application.action?.id
  }
}

function compactFinding(finding: TerminalFinding): Record<string, unknown> {
  return {
    title: finding.title,
    detail: finding.detail,
    severity: finding.severity,
    durationMs: finding.durationMs,
    source: finding.source,
    recommendation: finding.recommendation,
    fix: finding.fix
  }
}

export class LocalAgentRuntime {
  private readonly controllers = new Map<string, AbortController>()

  constructor(private readonly store: AgentStore) {}

  start(prompt: string, scan: ScanResult, emit: EmitAgentEvent): AgentRunRecord {
    const cleanPrompt = prompt.trim().slice(0, 4000)
    if (!cleanPrompt) throw new Error('请输入要检查或处理的问题')
    const provider = this.store.getDefaultPrivateProvider()
    const run = this.store.createRun(cleanPrompt, provider)
    const controller = new AbortController()
    this.controllers.set(run.id, controller)
    void this.execute(run, scan, controller, emit)
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

  private async execute(
    initialRun: AgentRunRecord,
    scan: ScanResult,
    controller: AbortController,
    emit: EmitAgentEvent
  ): Promise<void> {
    const provider = this.store.getPrivateProvider(initialRun.providerId)
    const allPlanItems = availablePlanItems(scan)
    const planItemMap = new Map(allPlanItems.map((item) => [item.id, item]))
    let proposedPlan: AgentPlanItem[] = []

    const setStatus = (status: AgentRunRecord['status'], message: string): void => {
      this.store.updateRun(initialRun.id, { status })
      emit({ type: 'status', runId: initialRun.id, status, message })
    }

    const recordTool = <T>(name: string, input: unknown, output: T): T => {
      this.store.logToolCall(initialRun.id, name, input, output)
      return output
    }

    try {
      setStatus('analyzing', '正在分析设备状态')
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
          description: 'List storage findings and the operation IDs that Memento has safely registered.',
          inputSchema: z.object({}),
          execute: async (input) => {
            setStatus('analyzing', '正在检查存储空间')
            return recordTool(
              'inspect_storage',
              input,
              scan.candidates.filter((item) => item.section === 'storage').map(compactCandidate)
            )
          }
        }),
        inspect_background_services: tool({
          description: 'List background-service findings and their registered operation IDs.',
          inputSchema: z.object({}),
          execute: async (input) => {
            setStatus('analyzing', '正在检查后台服务')
            return recordTool(
              'inspect_background_services',
              input,
              scan.candidates.filter((item) => item.section === 'services').map(compactCandidate)
            )
          }
        }),
        inspect_applications: tool({
          description: 'List manageable applications, usage dates, sizes, and uninstall operation IDs.',
          inputSchema: z.object({}),
          execute: async (input) => {
            setStatus('analyzing', '正在检查应用使用情况')
            return recordTool(
              'inspect_applications',
              input,
              scan.applications.slice(0, 120).map(compactApplication)
            )
          }
        }),
        inspect_terminal: tool({
          description: 'Read terminal startup measurements and deterministic, reversible fixes.',
          inputSchema: z.object({}),
          execute: async (input) => {
            setStatus('analyzing', '正在检查终端启动')
            return recordTool('inspect_terminal', input, {
              shell: scan.terminal.shell,
              baselineMs: scan.terminal.baselineMs,
              startupMs: scan.terminal.startupMs,
              findings: scan.terminal.findings.map(compactFinding)
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
            setStatus('plan-ready', '处理计划已经准备好')
            return recordTool('prepare_action_plan', input, {
              acceptedOperationIds: proposedPlan.map((item) => item.id),
              rejectedOperationIds: uniqueIds.filter((id) => !planItemMap.has(id)),
              requiresUserConfirmation: true
            })
          }
        })
      }

      const agent = new ToolLoopAgent({
        id: 'memento-local-agent',
        model: createProviderModel(provider),
        instructions: [
          'You are Memento, a local computer maintenance agent.',
          'Answer in the same language as the user.',
          'Use inspection tools before making claims about the computer.',
          'Only operations returned by inspection tools are real and executable.',
          'When the user asks to change or clean something, call prepare_action_plan with exact operation IDs.',
          'Never claim an operation was executed. Execution only happens after the user confirms in the app.',
          'Do not output shell commands or manual steps when a registered Memento operation exists.',
          'Keep the final response concise and explain what was found and what needs confirmation.'
        ].join('\n'),
        tools,
        stopWhen: stepCountIs(10),
        maxOutputTokens: 1200,
        temperature: 0.2
      })

      const result = await agent.generate({
        prompt: initialRun.prompt,
        abortSignal: controller.signal,
        timeout: 120_000
      })
      const status = proposedPlan.length > 0 ? 'awaiting-confirmation' : 'completed'
      const completed = this.store.updateRun(initialRun.id, {
        status,
        response: result.text.trim() || '检查已经完成。',
        plan: proposedPlan,
        error: null
      })
      emit({ type: 'completed', run: completed })
    } catch (error) {
      const cancelled = controller.signal.aborted
      const failed = this.store.updateRun(initialRun.id, {
        status: cancelled ? 'cancelled' : 'failed',
        error: cancelled
          ? '任务已取消'
          : providerErrorMessage(error, provider.apiKey)
      })
      emit({ type: 'failed', run: failed })
    } finally {
      this.controllers.delete(initialRun.id)
    }
  }
}

export { availablePlanItems }

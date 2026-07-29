import type {
  AgentPlanItem,
  AgentRunRecord,
  ExecuteAgentPlanInput
} from '../../shared/agent-types'

export function selectExecutablePlanItems(
  run: AgentRunRecord | null,
  input: ExecuteAgentPlanInput | null | undefined
): { run: AgentRunRecord; items: AgentPlanItem[] } {
  if (!run || run.status !== 'awaiting-confirmation') {
    throw new Error('处理计划已经失效，请重新分析')
  }
  if (
    !input ||
    input.runId !== run.id ||
    !Array.isArray(input.itemIds) ||
    input.itemIds.length > 100 ||
    input.itemIds.some((id) => typeof id !== 'string' || !id || id.length > 100)
  ) {
    throw new Error('处理计划包含无效操作')
  }
  const requestedIds = [...new Set(input.itemIds)]
  const allowedIds = new Set(run.plan.map((item) => item.id))
  if (!requestedIds.length || requestedIds.some((id) => !allowedIds.has(id))) {
    throw new Error('处理计划包含无效操作')
  }
  return {
    run,
    items: run.plan.filter((item) => requestedIds.includes(item.id))
  }
}

import type {
  AgentPlanItem,
  AgentRunRecord,
  ExecuteAgentPlanInput
} from '../../shared/agent-types'
import type { AppLanguage } from '../../shared/app-settings'

export function selectExecutablePlanItems(
  run: AgentRunRecord | null,
  input: ExecuteAgentPlanInput | null | undefined,
  language: AppLanguage = 'zh-CN'
): { run: AgentRunRecord; items: AgentPlanItem[] } {
  const english = (run?.language ?? language) === 'en-US'
  if (!run || run.status !== 'awaiting-confirmation') {
    throw new Error(english
      ? 'The action plan is no longer valid. Run the analysis again.'
      : '处理计划已经失效，请重新分析')
  }
  if (
    !input ||
    input.runId !== run.id ||
    !Array.isArray(input.itemIds) ||
    input.itemIds.length > 100 ||
    input.itemIds.some((id) => typeof id !== 'string' || !id || id.length > 100)
  ) {
    throw new Error(english ? 'The action plan contains invalid operations.' : '处理计划包含无效操作')
  }
  const requestedIds = [...new Set(input.itemIds)]
  const allowedIds = new Set(run.plan.map((item) => item.id))
  if (!requestedIds.length || requestedIds.some((id) => !allowedIds.has(id))) {
    throw new Error(english ? 'The action plan contains invalid operations.' : '处理计划包含无效操作')
  }
  const completedIds = new Set(run.results.filter((result) => result.ok).map((result) => result.id))
  if (requestedIds.some((id) => completedIds.has(id))) {
    throw new Error(english
      ? 'A completed operation cannot be run again.'
      : '已完成的操作不能重复执行')
  }
  return {
    run,
    items: run.plan.filter((item) => requestedIds.includes(item.id))
  }
}

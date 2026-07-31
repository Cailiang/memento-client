import type { AgentRunRecord } from '../../shared/agent-types'

export const MAX_WORKSPACE_CONVERSATIONS = 8

export function appendWorkspaceConversation(
  conversationIds: readonly string[],
  conversationId: string,
  limit = MAX_WORKSPACE_CONVERSATIONS
): string[] {
  return [...conversationIds.filter((id) => id !== conversationId), conversationId]
    .slice(-Math.max(1, limit))
}

export function latestWorkspaceConversationRuns(
  runs: readonly AgentRunRecord[],
  activeRun: AgentRunRecord | null,
  conversationIds: readonly string[]
): AgentRunRecord[] {
  const latestByConversation = new Map<string, AgentRunRecord>()
  for (const run of activeRun ? [...runs, activeRun] : runs) {
    const existing = latestByConversation.get(run.conversationId)
    if (!existing || existing.createdAt < run.createdAt || (
      existing.createdAt === run.createdAt && existing.updatedAt < run.updatedAt
    )) {
      latestByConversation.set(run.conversationId, run)
    }
  }
  return conversationIds
    .map((conversationId) => latestByConversation.get(conversationId))
    .filter((run): run is AgentRunRecord => Boolean(run))
}

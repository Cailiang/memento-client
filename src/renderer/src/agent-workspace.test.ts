import { describe, expect, it } from 'vitest'
import type { AgentRunRecord } from '../../shared/agent-types'
import {
  appendWorkspaceConversation,
  latestWorkspaceConversationRuns
} from './agent-workspace'

function run(
  id: string,
  conversationId: string,
  createdAt: string,
  prompt = id
): AgentRunRecord {
  return {
    id,
    conversationId,
    language: 'zh-CN',
    prompt,
    status: 'completed',
    providerId: 'provider',
    providerName: 'Provider',
    model: 'model',
    response: null,
    presentation: null,
    focus: [],
    plan: [],
    results: [],
    error: null,
    createdAt,
    updatedAt: createdAt
  }
}

describe('Agent workspace conversations', () => {
  it('keeps follow-up turns in one workspace slot', () => {
    const first = run('run-a1', 'conversation-a', '2026-07-31T00:00:00.000Z', '检查存储')
    const followUp = run('run-a2', 'conversation-a', '2026-07-31T00:01:00.000Z', '这是什么')
    const separate = run('run-b1', 'conversation-b', '2026-07-31T00:02:00.000Z', '检查服务')

    expect(latestWorkspaceConversationRuns(
      [separate, followUp, first],
      followUp,
      ['conversation-a', 'conversation-b']
    ).map((item) => item.id)).toEqual(['run-a2', 'run-b1'])
  })

  it('moves an existing conversation to the active end without duplicating it', () => {
    expect(appendWorkspaceConversation(
      ['conversation-a', 'conversation-b'],
      'conversation-a'
    )).toEqual(['conversation-b', 'conversation-a'])
  })
})

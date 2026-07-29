import { describe, expect, it } from 'vitest'
import type { AgentPlanItem, AgentRunRecord } from '../../shared/agent-types'
import { selectExecutablePlanItems } from './plan-validation'

const PLAN: AgentPlanItem[] = [
  {
    id: 'storage:cache',
    kind: 'action',
    actionKind: 'delete-storage',
    title: '清理缓存',
    detail: '删除可重建缓存',
    estimatedBytes: 1024,
    risk: 'safe',
    reversible: true
  },
  {
    id: 'terminal:zshrc',
    kind: 'terminal-fix',
    actionKind: 'terminal-fix',
    title: '优化终端',
    detail: '延迟加载版本管理器',
    estimatedBytes: 0,
    risk: 'safe',
    reversible: true
  }
]

function run(status: AgentRunRecord['status'] = 'awaiting-confirmation'): AgentRunRecord {
  return {
    id: 'run-1',
    conversationId: 'conversation-1',
    language: 'zh-CN',
    prompt: '清理电脑',
    status,
    providerId: 'provider-1',
    providerName: 'Provider',
    model: 'model',
    response: '已准备计划',
    presentation: null,
    focus: [],
    plan: PLAN,
    results: [],
    error: null,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z'
  }
}

describe('Agent plan validation', () => {
  it('returns only explicitly confirmed registered plan items', () => {
    const selected = selectExecutablePlanItems(run(), {
      runId: 'run-1',
      itemIds: ['terminal:zshrc', 'terminal:zshrc']
    })
    expect(selected.items.map((item) => item.id)).toEqual(['terminal:zshrc'])
  })

  it('rejects invented, empty, mismatched, and expired plans', () => {
    expect(() => selectExecutablePlanItems(run(), {
      runId: 'run-1',
      itemIds: ['invented-action']
    })).toThrow('处理计划包含无效操作')
    expect(() => selectExecutablePlanItems(run(), {
      runId: 'run-1',
      itemIds: []
    })).toThrow('处理计划包含无效操作')
    expect(() => selectExecutablePlanItems(run(), {
      runId: 'other-run',
      itemIds: ['storage:cache']
    })).toThrow('处理计划包含无效操作')
    expect(() => selectExecutablePlanItems(run('completed'), {
      runId: 'run-1',
      itemIds: ['storage:cache']
    })).toThrow('处理计划已经失效')
  })

  it('returns plan validation errors in the run language', () => {
    expect(() => selectExecutablePlanItems({ ...run(), language: 'en-US' }, {
      runId: 'run-1',
      itemIds: ['invented-action']
    })).toThrow('The action plan contains invalid operations.')
  })
})

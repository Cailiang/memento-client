import { describe, expect, it } from 'vitest'
import { validateAnalysisOutput } from './validate-output'

describe('validateAnalysisOutput', () => {
  it('drops unknown evidence and clamps untrusted values', () => {
    const result = validateAnalysisOutput(
      {
        summary: { diagnosis: '配置层耗时较高', expectedPriority: 'high' },
        suggestions: [{
          title: '延迟加载 NVM',
          explanation: '根据本地 finding 检查初始化位置。',
          evidenceFindingIds: ['known', 'invented'],
          confidence: 4,
          risk: 'behavior-change',
          action: { kind: 'show-manual-steps', steps: ['先备份配置'] },
          unknown: true
        }],
        limitations: ['没有逐行耗时数据']
      },
      new Set(['known']),
      { requestId: 'request-1', providerId: 'mock', model: 'mock-model' }
    )
    expect(result.suggestions[0].evidenceFindingIds).toEqual(['known'])
    expect(result.suggestions[0].confidence).toBe(1)
    expect(result).not.toHaveProperty('unknown')
  })

  it('rejects executable fields', () => {
    expect(() =>
      validateAnalysisOutput(
        { summary: 'bad', suggestions: [{ command: 'rm something' }] },
        new Set(),
        { requestId: 'request-1', providerId: 'mock', model: 'mock-model' }
      )
    ).toThrow('不允许')
  })

  it('enforces the concise candidate result contract', () => {
    const result = validateAnalysisOutput(
      {
        summary: { diagnosis: '这是一个后台同步服务。' },
        suggestions: [
          {
            title: '处理影响',
            explanation: '停止后同步会暂停。',
            action: { kind: 'show-manual-steps', steps: ['执行命令'] }
          },
          { title: '多余建议', explanation: '不应显示。' }
        ],
        limitations: ['局限一', '局限二']
      },
      new Set(['candidate']),
      { requestId: 'request-2', providerId: 'mock', model: 'mock-model', candidate: true }
    )
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].action).toEqual({ kind: 'explain-only', steps: undefined })
    expect(result.limitations).toEqual(['局限一'])
  })
})

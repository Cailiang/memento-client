import { describe, expect, it } from 'vitest'
import type { AiTerminalAnalysis } from '../../../shared/ai-types'
import {
  updateAiAnalysisTasks,
  visibleAiAnalysisTasks,
  type AiAnalysisTaskState
} from './AiAnalysisTasks'

describe('AI analysis task storage', () => {
  it('keeps task state for each item while the user browses another item', () => {
    const first = updateAiAnalysisTasks(new Map(), 'scan:service-a', { status: 'preparing' })
    const second = updateAiAnalysisTasks(first, 'scan:service-b', {
      status: 'failed',
      error: { code: 'AI_RATE_LIMITED', message: 'Busy', retryable: true }
    })

    expect(second.get('scan:service-a')?.status).toBe('preparing')
    expect(second.get('scan:service-b')?.status).toBe('failed')
  })

  it('removes only the task that is reset', () => {
    const tasks = new Map<string, AiAnalysisTaskState>([
      ['scan:service-a', { status: 'preparing' }],
      ['scan:service-b', { status: 'preparing' }]
    ])
    const next = updateAiAnalysisTasks(tasks, 'scan:service-a', { status: 'idle' })

    expect(next.has('scan:service-a')).toBe(false)
    expect(next.has('scan:service-b')).toBe(true)
  })

  it('keeps completed results visible until the user dismisses them', () => {
    const analysis = { summary: 'done', suggestions: [] } as unknown as AiTerminalAnalysis
    const tasks = new Map<string, AiAnalysisTaskState>([
      ['scan:service-running', { status: 'analyzing', preview: {} as never }],
      ['scan:service-older', { status: 'succeeded', analysis, completedAt: 10 }],
      ['scan:service-newer', { status: 'succeeded', analysis, completedAt: 20 }]
    ])

    expect(visibleAiAnalysisTasks(tasks, new Set()).map(([key]) => key)).toEqual([
      'scan:service-newer',
      'scan:service-older',
      'scan:service-running'
    ])
    expect(visibleAiAnalysisTasks(tasks, new Set(['scan:service-newer'])).map(([key]) => key)).toEqual([
      'scan:service-older',
      'scan:service-running'
    ])
  })
})

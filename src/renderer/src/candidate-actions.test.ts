import { describe, expect, it } from 'vitest'
import type { ScanCandidate } from '../../shared/types'
import { applyCompletedCandidateActions } from './candidate-actions'

const service: ScanCandidate = {
  id: 'service',
  section: 'services',
  name: 'Example',
  subtitle: 'Background service',
  description: 'Running',
  risk: 'review',
  status: 'Running',
  evidence: [],
  operations: [
    {
      id: 'stop',
      kind: 'stop-launch-agent',
      label: 'Stop service only',
      consequence: 'Stops the service.',
      reversible: true
    },
    {
      id: 'remove',
      kind: 'trash-service-software',
      label: 'Uninstall',
      consequence: 'Moves the app to the Trash.',
      reversible: true
    }
  ]
}

describe('applyCompletedCandidateActions', () => {
  it('keeps a stopped service and its remaining uninstall action', () => {
    const result = applyCompletedCandidateActions([service], new Set(['stop']), 'zh-CN')
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('已停止')
    expect(result[0].operations?.map((operation) => operation.id)).toEqual(['remove'])
  })

  it('keeps a stop-only service visible without repeating the completed action', () => {
    const stopOnly = { ...service, operations: undefined, action: service.operations?.[0] }
    const result = applyCompletedCandidateActions([stopOnly], new Set(['service']), 'en-US')
    expect(result[0].status).toBe('Stopped')
    expect(result[0].action).toBeUndefined()
    expect(result[0].operations).toEqual([])
  })

  it('removes a candidate after its uninstall action completes', () => {
    expect(applyCompletedCandidateActions([service], new Set(['remove']), 'zh-CN')).toEqual([])
  })
})

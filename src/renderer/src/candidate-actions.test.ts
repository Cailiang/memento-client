import { describe, expect, it } from 'vitest'
import type { ScanCandidate } from '../../shared/types'
import { applyCompletedCandidateActions, selectedCandidateOperations } from './candidate-actions'

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

  it('runs a shared cleanup operation once and removes every service in its group', () => {
    const sibling = { ...service, id: 'service-2', name: 'Example helper' }
    const selected = selectedCandidateOperations([service, sibling], new Set(['remove']))

    expect(selected).toHaveLength(1)
    expect(applyCompletedCandidateActions([service, sibling], new Set(['remove']), 'zh-CN')).toEqual([])
  })

  it('removes only the service whose individual startup item was removed', () => {
    const first = {
      ...service,
      operations: [{
        id: 'remove-startup-a',
        kind: 'trash-launch-agent-config' as const,
        label: 'Remove startup item',
        consequence: 'Keep the directory.',
        reversible: true
      }]
    }
    const second = {
      ...service,
      id: 'service-2',
      operations: [{
        id: 'remove-startup-b',
        kind: 'trash-launch-agent-config' as const,
        label: 'Remove startup item',
        consequence: 'Keep the directory.',
        reversible: true
      }]
    }

    expect(applyCompletedCandidateActions([first, second], new Set(['remove-startup-a']), 'en-US'))
      .toEqual([second])
  })

  it('keeps directory cleanup available after removing the startup item', () => {
    const serviceWithDirectory = {
      ...service,
      operations: [
        {
          id: 'remove-startup',
          kind: 'trash-launch-agent-config' as const,
          label: 'Remove startup item',
          consequence: 'Keep the directory.',
          reversible: true
        },
        {
          id: 'remove-directory',
          kind: 'trash-service-directory' as const,
          label: 'Delete related directory',
          consequence: 'Move the directory to the Trash.',
          reversible: true
        }
      ]
    }

    const result = applyCompletedCandidateActions(
      [serviceWithDirectory],
      new Set(['remove-startup']),
      'zh-CN'
    )

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('已移除启动项')
    expect(result[0].operations?.map((operation) => operation.id)).toEqual(['remove-directory'])
  })
})

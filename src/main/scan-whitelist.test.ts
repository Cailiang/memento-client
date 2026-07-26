import { describe, expect, it } from 'vitest'
import type { ScanCandidate, ScanResult } from '../shared/types'
import { applyScanWhitelist } from './scan-whitelist'
import type { RegisteredAction, ScanBundle } from './scanner'

function resultWith(candidates: ScanCandidate[]): ScanResult {
  return {
    scanId: 'scan',
    startedAt: '2026-07-25T00:00:00Z',
    completedAt: '2026-07-25T00:00:01Z',
    system: {
      hostname: 'Mac', osVersion: '15.0', diskTotalBytes: 1, diskFreeBytes: 1,
      memoryTotalBytes: 1, memoryUsedBytes: 0, uptimeSeconds: 1
    },
    candidates,
    applications: [],
    terminal: {
      shell: '/bin/zsh', baselineMs: 1, startupMs: 1, sampleCount: 1,
      findings: [], configFiles: []
    },
    warnings: []
  }
}

describe('applyScanWhitelist', () => {
  it('hides matching services and storage items and expires their local capabilities', () => {
    const service: ScanCandidate = {
      id: 'service-id', section: 'services', name: 'com.example.worker', subtitle: 'service',
      description: 'service', risk: 'review', status: 'Loaded', evidence: [],
      operations: [{
        id: 'operation-id', kind: 'stop-launch-agent', label: 'Stop', consequence: 'Stops',
        reversible: true
      }]
    }
    const storage: ScanCandidate = {
      id: 'storage-id', section: 'storage', name: 'com.example.worker', subtitle: 'storage',
      description: 'storage', risk: 'safe', status: 'Reclaimable', evidence: [],
      location: '~/Library/Caches/com.example.worker',
      action: {
        kind: 'delete-storage', label: 'Clean permanently', consequence: 'Deletes it', reversible: false
      }
    }
    const actions = new Map<string, RegisteredAction>([
      ['operation-id', { kind: 'stop-launch-agent', target: '/tmp/worker.plist' }],
      ['storage-id', { kind: 'delete-storage', target: '/tmp/com.example.worker' }]
    ])
    const bundle: ScanBundle = {
      result: resultWith([service, storage]),
      actions,
      terminalFixes: new Map(),
      revealTargets: new Map([
        ['service-id', '/tmp/worker'],
        ['storage-id', '/tmp/com.example.worker']
      ])
    }

    const filtered = applyScanWhitelist(
      bundle,
      ['com.example.worker'],
      ['~/Library/Caches/com.example.worker']
    )

    expect(filtered.result.candidates).toEqual([])
    expect(filtered.actions.has('operation-id')).toBe(false)
    expect(filtered.actions.has('storage-id')).toBe(false)
    expect(filtered.revealTargets.has('service-id')).toBe(false)
    expect(filtered.revealTargets.has('storage-id')).toBe(false)
  })
})

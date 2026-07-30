import { describe, expect, it } from 'vitest'
import type { ScanResult } from '../shared/types'
import type { ScanBundle } from './scanner'
import { reconcileScanCapabilities } from './scan-capability-reconciliation'

function result(actionId: string, terminalFixId: string): ScanResult {
  return {
    scanId: 'scan',
    startedAt: '',
    completedAt: '',
    system: {
      hostname: 'Mac', osVersion: '15', diskTotalBytes: 100, diskFreeBytes: 50,
      memoryTotalBytes: 100, memoryUsedBytes: 50, uptimeSeconds: 1
    },
    candidates: [{
      id: 'candidate', section: 'storage', name: 'Cache', subtitle: '', description: '',
      risk: 'safe', status: 'Reclaimable', evidence: [],
      operations: [{
        id: actionId, kind: 'delete-storage', label: 'Clean', consequence: 'Delete cache',
        reversible: false
      }]
    }],
    applications: [],
    ignoredApplications: [],
    terminal: {
      shell: '/bin/zsh', baselineMs: 10, startupMs: 20, sampleCount: 3,
      configFiles: [],
      findings: [{
        id: terminalFixId, code: 'path_duplicate_entries', title: 'PATH', detail: 'Duplicate',
        severity: 'notice', fix: { id: terminalFixId, label: 'Fix', consequence: 'Back up first' }
      }]
    },
    warnings: []
  }
}

function bundle(actionId: string, terminalFixId: string, target = '/Users/test/Library/Caches/AI'): ScanBundle {
  return {
    result: result(actionId, terminalFixId),
    actions: new Map([[actionId, { kind: 'delete-storage', target }]]),
    revealTargets: new Map([['candidate', target]]),
    terminalFixes: new Map([[terminalFixId, {
      kind: 'dedupe-path', target: '/Users/test/.zshrc', expectedHash: 'same-hash'
    }]])
  }
}

describe('scan capability reconciliation', () => {
  it('preserves observed operation IDs across verification scans', () => {
    const reconciled = reconcileScanCapabilities({
      actions: bundle('old-action', 'old-terminal').actions,
      terminalFixes: bundle('old-action', 'old-terminal').terminalFixes
    }, bundle('new-action', 'new-terminal'))

    expect(reconciled.result.candidates[0].operations?.[0].id).toBe('old-action')
    expect(reconciled.actions.has('old-action')).toBe(true)
    expect(reconciled.result.terminal.findings[0].fix?.id).toBe('old-terminal')
    expect(reconciled.terminalFixes.has('old-terminal')).toBe(true)
  })

  it('does not preserve an ID when the registered target changed', () => {
    const previous = bundle('old-action', 'old-terminal')
    const reconciled = reconcileScanCapabilities({
      actions: previous.actions,
      terminalFixes: previous.terminalFixes
    }, bundle('new-action', 'new-terminal', '/Users/test/Library/Caches/Other'))

    expect(reconciled.result.candidates[0].operations?.[0].id).toBe('new-action')
    expect(reconciled.actions.has('old-action')).toBe(false)
  })
})

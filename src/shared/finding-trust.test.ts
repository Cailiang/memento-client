import { describe, expect, it } from 'vitest'
import type { ScanCandidate } from './types'
import {
  inferFindingTrust,
  isHealthSignal,
  summarizeFindingTrust
} from './finding-trust'

function candidate(overrides: Partial<ScanCandidate>): ScanCandidate {
  return {
    id: 'candidate',
    section: 'storage',
    name: 'Cache',
    subtitle: 'Cache',
    description: 'Cache',
    risk: 'safe',
    status: 'Reclaimable',
    evidence: [],
    confidence: 'verified',
    reasonCodes: ['allowlisted-rebuildable-path'],
    estimateQuality: 'exact',
    sizeBytes: 1024,
    action: {
      kind: 'delete-storage',
      label: 'Clean',
      consequence: 'Rebuilt later',
      reversible: false
    },
    ...overrides
  }
}

describe('finding trust policy', () => {
  it('keeps weak identity guesses out of reclaimable space and health signals', () => {
    const clue = candidate({
      id: 'clue',
      risk: 'review',
      confidence: 'weak',
      reasonCodes: ['unmatched-local-identity', 'age-only-signal'],
      action: {
        kind: 'trash-home-artifact',
        label: 'Trash',
        consequence: 'Review first',
        reversible: true
      },
      sizeBytes: 80 * 1024
    })
    const summary = summarizeFindingTrust([candidate({ sizeBytes: 40 * 1024 }), clue])
    expect(summary.safeCleanup).toHaveLength(1)
    expect(summary.clues).toEqual([clue])
    expect(summary.trustedReclaimableBytes).toBe(40 * 1024)
    expect(summary.healthSignalCount).toBe(0)
  })

  it('treats only anomalous services as health signals', () => {
    const normal = candidate({
      section: 'services',
      risk: 'review',
      confidence: 'verified',
      estimateQuality: 'unknown',
      sizeBytes: undefined,
      serviceAnomalies: []
    })
    const anomalous = candidate({
      ...normal,
      id: 'failed-service',
      confidence: 'strong',
      serviceAnomalies: ['failed']
    })
    expect(isHealthSignal(normal)).toBe(false)
    expect(isHealthSignal(anomalous)).toBe(true)
  })

  it('infers stable metadata from registered action semantics', () => {
    expect(inferFindingTrust(candidate({}))).toEqual({
      confidence: 'verified',
      reasonCodes: ['allowlisted-rebuildable-path', 'measured-local-target'],
      estimateQuality: 'exact'
    })
    expect(inferFindingTrust(candidate({
      risk: 'review',
      action: {
        kind: 'trash-home-artifact',
        label: 'Trash',
        consequence: 'Review first',
        reversible: true
      }
    }))).toMatchObject({
      confidence: 'weak',
      reasonCodes: expect.arrayContaining(['unmatched-local-identity', 'age-only-signal'])
    })
  })
})

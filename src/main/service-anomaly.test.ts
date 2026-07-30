import { describe, expect, it } from 'vitest'
import { classifyServiceAnomalies } from './scanner'

describe('service anomaly classification', () => {
  it('separates orphaned, failed, resource-heavy, and long-running services', () => {
    expect(classifyServiceAnomalies({
      loaded: true,
      programMissing: true,
      failed: true,
      metrics: {
        cpuPercent: 20,
        memoryBytes: 1024 * 1024 * 1024,
        runningSeconds: 30 * 24 * 60 * 60
      }
    })).toEqual(['orphaned', 'failed', 'resource', 'long-running'])
  })

  it('marks only old stopped configurations as stale', () => {
    expect(classifyServiceAnomalies({ loaded: false, ageDays: 180 })).toEqual(['stale'])
    expect(classifyServiceAnomalies({ loaded: true, ageDays: 400 })).toEqual([])
    expect(classifyServiceAnomalies({ loaded: false, ageDays: 30 })).toEqual([])
  })
})

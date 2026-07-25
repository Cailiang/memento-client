import { describe, expect, it } from 'vitest'
import type { ScanResult } from '../../shared/types'
import { normalizeTerminalReport } from './normalize-terminal'

const scan: ScanResult = {
  scanId: 'scan-1',
  startedAt: '2026-07-24T00:00:00.000Z',
  completedAt: '2026-07-24T00:00:01.000Z',
  system: {
    hostname: 'secret-hostname',
    osVersion: '15.5',
    diskTotalBytes: 1,
    diskFreeBytes: 1,
    memoryTotalBytes: 1,
    memoryUsedBytes: 1,
    uptimeSeconds: 1
  },
  candidates: [],
  terminal: {
    shell: '/bin/zsh',
    baselineMs: 20,
    startupMs: 420,
    sampleCount: 3,
    configFiles: [{ logicalPath: '~/.zshrc', exists: true, lineCount: 80, sizeBytes: 1200 }],
    findings: [{
      id: 'finding-1',
      code: 'nvm_eager_load',
      title: 'display only',
      detail: 'do not upload this text',
      severity: 'notice',
      source: '~/.zshrc:42',
      attributes: { line: 42, ignored: ['gh', 'p_MementoCanarySecret123456789012345'].join('') }
    }]
  },
  warnings: ['private warning']
}

describe('normalizeTerminalReport', () => {
  it('builds an allowlisted report without local identifiers or display copy', () => {
    const report = normalizeTerminalReport(scan)
    const serialized = JSON.stringify(report)
    expect(report.shell.configCostMs).toBe(400)
    expect(report.findings[0].source).toEqual({
      kind: 'shell-config',
      logicalPath: '~/.zshrc',
      line: 42
    })
    expect(report.findings[0].attributes).toEqual({ line: 42 })
    expect(serialized).not.toContain('secret-hostname')
    expect(serialized).not.toContain('do not upload')
    expect(serialized).not.toContain('MementoCanarySecret')
    expect(serialized).not.toContain('/Users/')
  })
})

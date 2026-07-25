import { describe, expect, it } from 'vitest'
import type { ScanCandidate, ScanResult } from '../../shared/types'
import { normalizeCandidateReport } from './normalize-candidate'

const baseResult: ScanResult = {
  scanId: 'scan-1',
  startedAt: '2026-07-24T00:00:00Z',
  completedAt: '2026-07-24T00:00:01Z',
  system: {
    hostname: 'private-host',
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
    baselineMs: 10,
    startupMs: 20,
    sampleCount: 3,
    findings: [],
    configFiles: []
  },
  warnings: []
}

describe('normalizeCandidateReport', () => {
  it('keeps service identity but excludes local paths and raw evidence', () => {
    const candidate: ScanCandidate = {
      id: 'local-random-id',
      section: 'services',
      name: 'com.example.sync.agent',
      subtitle: '示例同步 · 用户登录启动项',
      description: 'local display copy',
      risk: 'review',
      status: '已加载',
      evidence: [
        '配置：/Users/private/Library/LaunchAgents/com.example.sync.agent.plist',
        '程序：/Applications/Example.app/Contents/MacOS/agent',
        'Bundle ID：com.example.sync',
        '关联应用：/Applications/Example.app'
      ],
      action: {
        kind: 'stop-launch-agent',
        label: '仅停止',
        consequence: 'display only',
        reversible: true
      }
    }
    const report = normalizeCandidateReport(baseResult, candidate)
    const serialized = JSON.stringify(report)

    expect(report.analysisKind).toBe('service')
    expect(report.candidate.name).toBe('com.example.sync.agent')
    expect(report.candidate.facts.bundleId).toBe('com.example.sync')
    expect(report.candidate.id).toBe('candidate')
    expect(serialized).not.toContain('/Users/')
    expect(serialized).not.toContain('/Applications/')
    expect(serialized).not.toContain('local display copy')
  })

  it('classifies protected virtual disks as analysis-only', () => {
    const candidate: ScanCandidate = {
      id: 'docker-data',
      section: 'storage',
      name: 'Docker 虚拟磁盘',
      subtitle: '~/Library/Containers/com.docker.docker/Data/Docker.raw',
      description: '包含镜像、容器和卷。',
      sizeBytes: 20 * 1024 ** 3,
      risk: 'protected',
      status: '仅分析',
      evidence: ['本机路径：/Users/private/Library/Containers/com.docker.docker']
    }
    const report = normalizeCandidateReport(baseResult, candidate)

    expect(report.analysisKind).toBe('storage')
    expect(report.candidate.category).toBe('virtual-disk')
    expect(report.candidate.status).toBe('analysis-only')
    expect(report.candidate.facts.containsProtectedData).toBe(true)
  })
})

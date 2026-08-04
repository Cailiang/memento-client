import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentFocus } from '../../shared/agent-types'
import type { ScanResult } from '../../shared/types'
import {
  artifactEvidenceConfidence,
  inspectLocalArtifactEvidence,
  relatedScanEvidence
} from './local-evidence'

const TRUST = {
  confidence: 'strong' as const,
  reasonCodes: ['registered-local-operation'] as ScanResult['candidates'][number]['reasonCodes'],
  estimateQuality: 'unknown' as const
}

function scan(): ScanResult {
  return {
    scanId: 'scan', startedAt: '', completedAt: '',
    system: {
      hostname: 'Mac', osVersion: '15.0', diskTotalBytes: 1, diskFreeBytes: 1,
      memoryTotalBytes: 1, memoryUsedBytes: 0, uptimeSeconds: 1
    },
    candidates: [{
      ...TRUST,
      id: 'hidden-cisco', section: 'storage', name: '.cisco', subtitle: 'Hidden Home item',
      description: 'Unmatched item', location: '~/.cisco', risk: 'review', status: 'Review', evidence: []
    }, {
      ...TRUST,
      id: 'service-cisco', section: 'services', name: 'com.cisco.anyconnect.vpnagentd',
      subtitle: 'Launch daemon', description: 'Loaded service', location: '/opt/cisco/anyconnect',
      risk: 'review', status: 'Loaded', evidence: []
    }, {
      ...TRUST,
      id: 'other-cache', section: 'storage', name: 'Unrelated cache', subtitle: 'Cache',
      description: 'Cache', location: '~/Library/Caches/example', risk: 'safe', status: 'Safe', evidence: []
    }],
    applications: [{
      id: 'cisco-app', name: 'Cisco Secure Client', version: '5',
      bundleId: 'com.cisco.secureclient.gui', location: '/Applications/Cisco Secure Client.app',
      sizeBytes: 1, lastUsedAt: null, scope: 'shared', unused: false
    }],
    ignoredApplications: [],
    terminal: {
      shell: '/bin/zsh', baselineMs: 1, startupMs: 1, sampleCount: 1, configFiles: [],
      findings: [{
        id: 'terminal-postgresql', code: 'stale_environment_path',
        title: 'POSTGRESQL_HOME points to a missing directory',
        detail: '/usr/local/Cellar/postgresql/12.3_2 no longer exists',
        severity: 'notice', attributes: { variable: 'POSTGRESQL_HOME', product: 'postgresql' }
      }]
    },
    timings: [], diagnostics: [], warnings: []
  }
}

describe('local artifact evidence', () => {
  it('correlates a focused artifact across scan modules without a vendor table', () => {
    const focus: AgentFocus[] = [{ kind: 'storage', id: 'hidden-cisco', name: '.cisco' }]
    const related = relatedScanEvidence(scan(), focus)
    expect(related.identityTokens).toContain('cisco')
    expect(related.storage.map((item) => item.id)).toEqual(['hidden-cisco'])
    expect(related.services.map((item) => item.id)).toEqual(['service-cisco'])
    expect(related.applications.map((item) => item.id)).toEqual(['cisco-app'])
    expect(related.terminal).toEqual([])
    expect(related.matchedTokens).toEqual(['cisco'])
  })

  it('correlates a stale environment variable with a focused service', () => {
    const value = scan()
    value.candidates[0] = {
      ...TRUST,
      id: 'service-postgresql', section: 'services', name: 'homebrew.mxcl.postgresql@14',
      subtitle: 'Launch agent', description: 'PostgreSQL 14', location: '/opt/homebrew/opt/postgresql@14',
      risk: 'review', status: 'Loaded', evidence: []
    }
    const related = relatedScanEvidence(value, [{
      kind: 'services', id: 'service-postgresql', name: 'homebrew.mxcl.postgresql@14'
    }])
    expect(related.identityTokens).toContain('postgresql')
    expect(related.terminal.map((item) => item.id)).toEqual(['terminal-postgresql'])
  })

  it('collects shallow path evidence and redacts shell secrets', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-evidence-'))
    try {
      await fs.mkdir(path.join(home, '.antigravity', 'extensions'), { recursive: true })
      await fs.mkdir(path.join(home, '.antigravity', 'antigravity', 'bin'), { recursive: true })
      await fs.mkdir(path.join(home, 'Library', 'Preferences'), { recursive: true })
      await fs.writeFile(path.join(home, 'Library', 'Preferences', 'com.google.antigravity.plist'), '')
      await fs.writeFile(path.join(home, '.zshrc'), [
        'export ANTIGRAVITY_API_KEY="do-not-leak"',
        'export PATH="$HOME/.antigravity/antigravity/bin:$PATH"'
      ].join('\n'))

      const evidence = await inspectLocalArtifactEvidence(
        ['antigravity'],
        ['~/.antigravity'],
        { home, systemRoots: [], packageReceipts: ['com.google.antigravity.ide'] }
      )

      expect(evidence.inspectedTargets[0].children.map((item) => item.path))
        .toEqual(['antigravity', 'extensions'])
      expect(evidence.matchingPaths).toEqual([expect.objectContaining({
        path: '~/Library/Preferences/com.google.antigravity.plist',
        matchedToken: 'antigravity'
      })])
      expect(evidence.shellReferences).toHaveLength(2)
      expect(evidence.shellReferences[0].text).toContain('[REDACTED]')
      expect(JSON.stringify(evidence)).not.toContain('do-not-leak')
      expect(evidence.packageReceipts).toEqual(['com.google.antigravity.ide'])
      expect(artifactEvidenceConfidence({
        identityTokens: ['antigravity'], storage: [], services: [], applications: [], terminal: [], matchedTokens: []
      }, evidence)).toMatchObject({ level: 'confirmed-local' })
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })
})

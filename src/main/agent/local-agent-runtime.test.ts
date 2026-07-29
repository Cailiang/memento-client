import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentPlanItem } from '../../shared/agent-types'
import type { ScanResult } from '../../shared/types'
import { AgentStore } from './agent-store'
import { availablePlanItems, LocalAgentRuntime } from './local-agent-runtime'

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'memento-agent-runtime-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('LocalAgentRuntime boundaries', () => {
  it('maps only registered scan, application, and terminal operations into plans', () => {
    const scan: ScanResult = {
      scanId: 'scan-1',
      startedAt: '2026-07-29T00:00:00.000Z',
      completedAt: '2026-07-29T00:00:01.000Z',
      system: {
        hostname: 'Mac', osVersion: '15.0', diskTotalBytes: 100, diskFreeBytes: 50,
        memoryTotalBytes: 100, memoryUsedBytes: 50, uptimeSeconds: 100
      },
      candidates: [{
        id: 'candidate-1', section: 'storage', name: 'Cache', subtitle: '', description: '',
        risk: 'safe', status: 'safe', evidence: [], sizeBytes: 2048,
        action: { kind: 'trash', label: 'Clean', consequence: 'Move to Trash', reversible: true }
      }],
      applications: [{
        id: 'app-1', name: 'Editor', version: '1', bundleId: 'com.example.editor',
        location: '/Applications/Editor.app', sizeBytes: 4096, lastUsedAt: null,
        scope: 'shared', unused: false,
        action: { id: 'app-action', kind: 'trash', label: 'Uninstall', consequence: 'Move to Trash', reversible: true }
      }],
      terminal: {
        shell: '/bin/zsh', baselineMs: 40, startupMs: 80, sampleCount: 3,
        configFiles: [],
        findings: [{
          id: 'terminal-1', code: 'path_duplicate_entries', title: 'PATH', detail: 'Duplicate',
          severity: 'notice', fix: { id: 'terminal-fix', label: 'Fix PATH', consequence: 'Back up and fix' }
        }]
      },
      warnings: []
    }
    expect(availablePlanItems(scan).map((item) => item.id)).toEqual([
      'candidate-1', 'app-action', 'terminal-fix'
    ])
  })

  it('persists cancellation and clears a plan that was waiting for confirmation', () => {
    const store = new AgentStore(temporaryDirectory())
    const provider = store.saveProvider({
      name: 'Provider', type: 'openai-compatible', baseUrl: 'https://models.example.com/v1',
      model: 'model', apiKey: 'secret'
    })
    const run = store.createRun('清理缓存', provider)
    const plan: AgentPlanItem[] = [{
      id: 'action-1', kind: 'action', actionKind: 'trash', title: 'Clean', detail: 'Trash cache',
      estimatedBytes: 1024, risk: 'safe', reversible: true
    }]
    store.updateRun(run.id, { status: 'awaiting-confirmation', plan })
    new LocalAgentRuntime(store).cancel(run.id)
    expect(store.getRun(run.id)).toMatchObject({ status: 'cancelled', plan: [], error: null })
    store.close()
  })
})

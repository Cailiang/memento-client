import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentPlanItem } from '../../shared/agent-types'
import type { ScanResult } from '../../shared/types'
import { AgentStore } from './agent-store'
import {
  availablePlanItems,
  compactConversationContext,
  inferPromptFocus,
  LocalAgentRuntime,
  resolveContextualFocus
} from './local-agent-runtime'

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
      ignoredApplications: [],
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
    expect(inferPromptFocus('分析 com.example.editor 是否可以卸载', scan)).toEqual([{
      kind: 'applications', id: 'app-1', name: 'Editor'
    }])
  })

  it('keeps the exact service focus and pending plan in follow-up context', () => {
    const scan: ScanResult = {
      scanId: 'scan-service', startedAt: '', completedAt: '',
      system: {
        hostname: 'Mac', osVersion: '15.0', diskTotalBytes: 100, diskFreeBytes: 50,
        memoryTotalBytes: 100, memoryUsedBytes: 50, uptimeSeconds: 100
      },
      candidates: [{
        id: 'service-cisco', section: 'services',
        name: 'com.cisco.anyconnect.aciseposture', subtitle: 'Launch agent',
        description: 'Cisco posture assessment', risk: 'review', status: 'Loaded', evidence: [],
        operations: [{
          id: 'stop-cisco', kind: 'stop-launch-agent', label: 'Stop service only',
          consequence: 'Stops posture checks', reversible: true
        }, {
          id: 'remove-cisco', kind: 'trash-service-software', label: 'Stop and remove',
          consequence: 'Moves registered Cisco components to Trash', reversible: true
        }]
      }],
      applications: [],
      ignoredApplications: [],
      terminal: { shell: '/bin/zsh', baselineMs: 20, startupMs: 30, sampleCount: 3, configFiles: [], findings: [] },
      warnings: []
    }
    const focus = inferPromptFocus(
      '检查 com.cisco.anyconnect.aciseposture，说明影响，并把仅停止服务加入计划',
      scan
    )
    expect(focus).toEqual([{
      kind: 'services', id: 'service-cisco', name: 'com.cisco.anyconnect.aciseposture'
    }])

    const store = new AgentStore(temporaryDirectory())
    const provider = store.saveProvider({
      name: 'Provider', type: 'openai-compatible', baseUrl: 'https://models.example.com/v1',
      model: 'model', apiKey: 'secret'
    })
    const first = store.createRun('Inspect Cisco', provider, 'en-US', 'conversation-cisco', focus)
    const waiting = store.updateRun(first.id, {
      status: 'awaiting-confirmation',
      response: 'Cisco posture assessment is focused.',
      plan: availablePlanItems(scan, 'en-US').filter((item) => item.id === 'stop-cisco')
    })
    expect(compactConversationContext([waiting])).toEqual([expect.objectContaining({
      focus,
      pendingPlan: [expect.objectContaining({ operationId: 'stop-cisco' })]
    })])
    expect(resolveContextualFocus(
      '我需要把这个服务停掉并删除和它相关的信息',
      [],
      [waiting]
    )).toEqual(focus)
    expect(store.listConversationRuns('conversation-cisco')).toEqual([waiting])

    const runtime = new LocalAgentRuntime(store)
    expect(runtime.addPlanItems({ runId: first.id, itemIds: ['remove-cisco'] }, scan))
      .toMatchObject({ status: 'awaiting-confirmation', plan: [{ id: 'stop-cisco' }, { id: 'remove-cisco' }] })
    expect(() => runtime.addPlanItems({ runId: first.id, itemIds: ['invented'] }, scan))
      .toThrow('stale')
    store.close()
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

  it('keeps completed results while allowing another observed action to be added', () => {
    const store = new AgentStore(temporaryDirectory())
    const provider = store.saveProvider({
      name: 'Provider', type: 'openai-compatible', baseUrl: 'https://models.example.com/v1',
      model: 'model', apiKey: 'secret'
    })
    const scan: ScanResult = {
      scanId: 'scan-actions', startedAt: '', completedAt: '',
      system: {
        hostname: 'Mac', osVersion: '15.0', diskTotalBytes: 100, diskFreeBytes: 50,
        memoryTotalBytes: 100, memoryUsedBytes: 50, uptimeSeconds: 100
      },
      candidates: [{
        id: 'cache', section: 'storage', name: 'Caches', subtitle: '', description: '',
        risk: 'safe', status: 'Reclaimable', evidence: [],
        operations: [
          { id: 'cache-one', kind: 'delete-storage', label: 'Clean one', consequence: 'Delete one', reversible: false },
          { id: 'cache-two', kind: 'delete-storage', label: 'Clean two', consequence: 'Delete two', reversible: false }
        ]
      }],
      applications: [], ignoredApplications: [],
      terminal: { shell: '/bin/zsh', baselineMs: 20, startupMs: 30, sampleCount: 3, configFiles: [], findings: [] },
      warnings: []
    }
    const run = store.createRun('Clean caches', provider)
    store.updateRun(run.id, {
      status: 'completed',
      plan: availablePlanItems(scan).filter((item) => item.id === 'cache-one'),
      results: [{ id: 'cache-one', ok: true, message: 'Done' }]
    })

    const updated = new LocalAgentRuntime(store).addPlanItems({
      runId: run.id,
      itemIds: ['cache-two']
    }, scan)
    expect(updated).toMatchObject({
      status: 'awaiting-confirmation',
      plan: [{ id: 'cache-one' }, { id: 'cache-two' }],
      results: [{ id: 'cache-one', ok: true }]
    })
    store.close()
  })
})

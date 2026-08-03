import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AgentProvider } from '../../shared/agent-types'
import { AgentStore } from './agent-store'

const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'memento-agent-store-'))
  temporaryDirectories.push(directory)
  return directory
}

function providerInput(name: string, key: string): {
  name: string
  type: 'openai-compatible'
  baseUrl: string
  model: string
  apiKey: string
} {
  return {
    name,
    type: 'openai-compatible',
    baseUrl: 'https://models.example.com/v1/',
    model: 'agent-model',
    apiKey: key
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('AgentStore', () => {
  it('encrypts provider keys and keeps the master key outside SQLite', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    const saved = store.saveProvider(providerInput('本地模型', 'secret-key-123456'))
    expect(saved.keyHint).toBe('••••3456')
    expect(store.getPrivateProvider(saved.id).apiKey).toBe('secret-key-123456')

    const database = new DatabaseSync(path.join(directory, 'memento.sqlite'))
    const row = database.prepare(`
      SELECT api_key_iv, api_key_tag, api_key_ciphertext FROM ai_providers WHERE id = ?
    `).get(saved.id) as {
      api_key_iv: Uint8Array
      api_key_tag: Uint8Array
      api_key_ciphertext: Uint8Array
    }
    expect(row.api_key_iv.byteLength).toBe(12)
    expect(row.api_key_tag.byteLength).toBe(16)
    expect(Buffer.from(row.api_key_ciphertext).toString('utf8')).not.toContain('secret-key')
    database.close()
    expect(statSync(path.join(directory, 'agent-master.key')).mode & 0o777).toBe(0o600)
    expect(readFileSync(path.join(directory, 'agent-master.key'))).toHaveLength(32)
    expect(store.resolveModelDiscoveryInput({
      id: saved.id,
      type: 'openai-compatible',
      baseUrl: 'https://code.tczor.cn'
    })).toEqual({
      type: 'openai-compatible',
      baseUrl: 'https://code.tczor.cn/v1',
      apiKey: 'secret-key-123456'
    })
    store.close()
  })

  it('supports multiple providers, one default, and stable connection state', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    const first = store.saveProvider(providerInput('供应商一', 'first-secret'))
    const second = store.saveProvider(providerInput('供应商二', 'second-secret'))
    expect(first.isDefault).toBe(true)
    expect(second.isDefault).toBe(false)

    store.markProviderConnection(first.id, 'connected')
    const renamed = store.saveProvider({
      ...providerInput('供应商一（重命名）', ''),
      id: first.id,
      apiKey: undefined
    })
    expect(renamed.connectionState).toBe('connected')

    store.setDefaultProvider(second.id)
    const providers = store.listProviders()
    expect(providers.find((provider) => provider.id === second.id)?.isDefault).toBe(true)
    expect(providers.filter((provider) => provider.isDefault)).toHaveLength(1)
    expect(() => store.deleteProvider(second.id)).toThrow('另一个供应商')
    store.deleteProvider(first.id)
    expect(store.listProviders().map((provider: AgentProvider) => provider.id)).toEqual([second.id])
    store.close()
  })

  it('migrates existing Antigravity Gemini proxies to the dedicated provider type', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    const saved = store.saveProvider({
      name: 'Antigravity proxy',
      type: 'google',
      baseUrl: 'https://code.tczor.cn/antigravity',
      model: 'gemini-3.1-pro-high',
      apiKey: 'antigravity-secret'
    })
    store.close()

    const database = new DatabaseSync(path.join(directory, 'memento.sqlite'))
    database.prepare('UPDATE ai_providers SET type = ? WHERE id = ?').run('google', saved.id)
    database.exec('PRAGMA user_version = 2')
    database.close()

    const migrated = new AgentStore(directory)
    expect(migrated.listProviders()[0]).toMatchObject({
      type: 'antigravity',
      baseUrl: 'https://code.tczor.cn/antigravity/v1beta'
    })
    migrated.close()
  })

  it('imports external providers idempotently and de-duplicates matching manual providers', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    store.saveProvider(providerInput('Existing provider', 'same-secret'))
    const imported = store.syncImportedProviders([
      {
        id: 'cc-switch-claude-source',
        name: 'Duplicate external provider',
        type: 'openai-compatible',
        baseUrl: 'https://models.example.com/v1',
        model: 'agent-model',
        apiKey: 'same-secret'
      },
      {
        id: 'cc-switch-codex-source',
        name: 'CC Switch provider',
        type: 'openai',
        baseUrl: 'https://codex.example.com',
        model: 'gpt-test',
        apiKey: 'external-secret'
      }
    ])
    expect(imported).toBe(1)
    expect(store.listProviders()).toHaveLength(2)
    expect(store.getPrivateProvider('cc-switch-codex-source').apiKey).toBe('external-secret')
    expect(store.syncImportedProviders([{
      id: 'cc-switch-codex-source',
      name: 'CC Switch provider',
      type: 'openai',
      baseUrl: 'https://codex.example.com',
      model: 'gpt-test',
      apiKey: 'external-secret'
    }])).toBe(0)
    store.close()
  })

  it('removes rejected local imports and promotes a remaining provider when needed', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    const claude = {
      id: 'local-config-claude-source',
      name: 'Claude local',
      type: 'anthropic' as const,
      baseUrl: 'https://claude.example.com',
      model: 'claude-test',
      apiKey: 'claude-secret'
    }
    const gemini = {
      id: 'local-config-gemini-source',
      name: 'Gemini local',
      type: 'google' as const,
      baseUrl: 'https://gemini.example.com',
      model: 'gemini-test',
      apiKey: 'gemini-secret'
    }

    expect(store.syncLocalImportedProviders([claude, gemini])).toEqual({ imported: 2, removed: 0 })
    expect(store.listProviders().find((provider) => provider.id === claude.id)?.isDefault).toBe(true)

    expect(store.syncLocalImportedProviders([gemini])).toEqual({ imported: 0, removed: 1 })
    expect(store.listProviders()).toEqual([
      expect.objectContaining({ id: gemini.id, isDefault: true })
    ])
    store.close()
  })

  it('removes invalid or deleted CC Switch imports and keeps a remaining default', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    const claude = {
      id: 'cc-switch-claude-source',
      name: 'Claude relay',
      type: 'anthropic' as const,
      baseUrl: 'https://claude.example.com',
      model: 'claude-test',
      apiKey: 'claude-secret'
    }
    const gemini = {
      id: 'cc-switch-gemini-source',
      name: 'Gemini relay',
      type: 'google' as const,
      baseUrl: 'https://gemini.example.com',
      model: 'gemini-test',
      apiKey: 'gemini-secret'
    }

    expect(store.syncCcSwitchImportedProviders([claude, gemini])).toEqual({
      imported: 2,
      removed: 0
    })
    expect(store.listProviders().find((provider) => provider.id === claude.id)?.isDefault).toBe(true)

    expect(store.syncCcSwitchImportedProviders([gemini])).toEqual({ imported: 0, removed: 1 })
    expect(store.listProviders()).toEqual([
      expect.objectContaining({ id: gemini.id, isDefault: true })
    ])

    store.saveProvider(providerInput('Manual provider', 'manual-secret'))
    expect(store.syncCcSwitchImportedProviders([])).toEqual({ imported: 0, removed: 1 })
    expect(store.listProviders()).toEqual([
      expect.objectContaining({ name: 'Manual provider', isDefault: true })
    ])
    store.close()
  })

  it('persists completion of the one-time local AI configuration import', () => {
    const directory = temporaryDirectory()
    const store = new AgentStore(directory)
    expect(store.hasCompletedLocalAiConfigImport()).toBe(false)
    store.markLocalAiConfigImportCompleted()
    expect(store.hasCompletedLocalAiConfigImport()).toBe(true)
    store.close()

    const reopened = new AgentStore(directory)
    expect(reopened.hasCompletedLocalAiConfigImport()).toBe(true)
    reopened.close()
  })

  it('migrates legacy settings and persists runs in SQLite', () => {
    const directory = temporaryDirectory()
    writeFileSync(path.join(directory, 'app-settings.json'), JSON.stringify({
      language: 'en-US',
      theme: 'graphite',
      launchAtLogin: true,
      storageWhitelist: ['/tmp/cache']
    }))
    const store = new AgentStore(directory)
    expect(store.getAppSettings()).toMatchObject({
      language: 'en-US',
      theme: 'graphite',
      launchAtLogin: true,
      storageWhitelist: ['/tmp/cache']
    })
    const provider = store.saveProvider(providerInput('Provider', 'history-secret'))
    const created = store.createRun('检查存储空间', provider)
    const completed = store.updateRun(created.id, {
      status: 'completed',
      response: '没有需要处理的内容'
    })
    store.logToolCall(created.id, 'inspect_storage', {}, [])
    expect(store.listRuns()).toEqual([completed])
    store.deleteRun(created.id)
    expect(store.listRuns()).toEqual([])

    const database = new DatabaseSync(path.join(directory, 'memento.sqlite'))
    expect(database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM tool_calls').get()).toEqual({ count: 0 })
    database.close()
    store.close()
  })

  it('deletes multiple runs in one transaction', () => {
    const store = new AgentStore(temporaryDirectory())
    const provider = store.saveProvider(providerInput('Provider', 'batch-secret'))
    const first = store.createRun('First task', provider)
    const second = store.createRun('Second task', provider)
    const retained = store.createRun('Retained task', provider)
    store.logToolCall(first.id, 'inspect_device', {}, { ok: true })

    store.deleteRuns([first.id, second.id, first.id])

    expect(store.getRun(first.id)).toBeNull()
    expect(store.getRun(second.id)).toBeNull()
    expect(store.getRun(retained.id)).not.toBeNull()
    expect(() => store.deleteRuns([])).toThrow()
    store.close()
  })
})

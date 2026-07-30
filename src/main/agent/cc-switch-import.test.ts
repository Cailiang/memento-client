import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findCcSwitchDatabase, readCcSwitchProviders } from './cc-switch-import'

const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'memento-cc-switch-'))
  temporaryDirectories.push(directory)
  return directory
}

function createCcSwitchDatabase(databasePath: string): InstanceType<typeof DatabaseSync> {
  mkdirSync(path.dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec(`
    CREATE TABLE providers (
      id TEXT NOT NULL,
      app_type TEXT NOT NULL,
      name TEXT NOT NULL,
      settings_config TEXT NOT NULL,
      meta TEXT NOT NULL DEFAULT '{}',
      is_current INTEGER NOT NULL DEFAULT 0,
      sort_index INTEGER,
      PRIMARY KEY (id, app_type)
    )
  `)
  return database
}

function insertProvider(
  database: InstanceType<typeof DatabaseSync>,
  input: {
    id: string
    appType: string
    name: string
    settings: Record<string, unknown>
    meta?: Record<string, unknown>
    current?: boolean
  }
): void {
  database.prepare(`
    INSERT INTO providers (id, app_type, name, settings_config, meta, is_current)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.appType,
    input.name,
    JSON.stringify(input.settings),
    JSON.stringify(input.meta ?? {}),
    input.current ? 1 : 0
  )
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('CC Switch provider import', () => {
  it('reads Claude, Codex, and Gemini credentials without importing empty placeholders', () => {
    const root = temporaryDirectory()
    const databasePath = path.join(root, '.cc-switch', 'cc-switch.db')
    const database = createCcSwitchDatabase(databasePath)
    insertProvider(database, {
      id: 'claude-one',
      appType: 'claude',
      name: 'Claude Relay',
      current: true,
      settings: {
        env: {
          ANTHROPIC_BASE_URL: 'https://claude.example.com',
          ANTHROPIC_AUTH_TOKEN: 'claude-test-key',
          ANTHROPIC_MODEL: 'claude-test-model'
        }
      },
      meta: { apiFormat: 'anthropic' }
    })
    insertProvider(database, {
      id: 'codex-one',
      appType: 'codex',
      name: 'Codex Relay',
      settings: {
        auth: {},
        config: [
          'model_provider = "custom"',
          'model = "gpt-test"',
          '',
          '[model_providers.custom]',
          'base_url = "https://openai.example.com/v1"',
          'wire_api = "responses"',
          'experimental_bearer_token = "codex-test-key"'
        ].join('\n')
      },
      meta: { apiFormat: 'openai_responses' }
    })
    insertProvider(database, {
      id: 'gemini-one',
      appType: 'gemini',
      name: 'Gemini Relay',
      settings: {
        env: {
          GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.com',
          GEMINI_API_KEY: 'gemini-test-key',
          GEMINI_MODEL: 'gemini-test-model'
        }
      }
    })
    insertProvider(database, {
      id: 'gemini-antigravity',
      appType: 'gemini',
      name: 'Antigravity Relay',
      settings: {
        env: {
          GOOGLE_GEMINI_BASE_URL: 'https://code.tczor.cn/antigravity',
          GEMINI_API_KEY: 'antigravity-test-key',
          GEMINI_MODEL: 'gemini-3.1-pro-high'
        }
      }
    })
    insertProvider(database, {
      id: 'official-empty',
      appType: 'claude',
      name: 'Claude Official',
      settings: { env: {} }
    })
    database.close()

    const providers = readCcSwitchProviders(databasePath)
    expect(providers).toHaveLength(4)
    expect(providers.map(({ apiKey: _apiKey, ...provider }) => provider)).toEqual([
      expect.objectContaining({
        name: 'Claude Relay',
        type: 'anthropic',
        baseUrl: 'https://claude.example.com',
        model: 'claude-test-model',
        isCurrent: true
      }),
      expect.objectContaining({
        name: 'Codex Relay',
        type: 'openai',
        baseUrl: 'https://openai.example.com/v1',
        model: 'gpt-test'
      }),
      expect.objectContaining({
        name: 'Antigravity Relay',
        type: 'antigravity',
        baseUrl: 'https://code.tczor.cn/antigravity',
        model: 'gemini-3.1-pro-high'
      }),
      expect.objectContaining({
        name: 'Gemini Relay',
        type: 'google',
        baseUrl: 'https://gemini.example.com',
        model: 'gemini-test-model'
      })
    ])
    expect(providers.map((provider) => provider.id)).toEqual([
      expect.stringMatching(/^cc-switch-claude-/),
      expect.stringMatching(/^cc-switch-codex-/),
      expect.stringMatching(/^cc-switch-gemini-/),
      expect.stringMatching(/^cc-switch-gemini-/)
    ])
    expect(providers.map((provider) => provider.apiKey)).toEqual([
      'claude-test-key',
      'codex-test-key',
      'antigravity-test-key',
      'gemini-test-key'
    ])
  })

  it('honors the CC Switch custom configuration directory and falls back to the default', () => {
    const home = temporaryDirectory()
    const appSupport = path.join(home, 'Library', 'Application Support')
    const customDatabase = path.join(home, 'Custom CC Switch', 'cc-switch.db')
    createCcSwitchDatabase(customDatabase).close()
    mkdirSync(path.join(appSupport, 'com.ccswitch.desktop'), { recursive: true })
    writeFileSync(
      path.join(appSupport, 'com.ccswitch.desktop', 'app_paths.json'),
      JSON.stringify({ app_config_dir_override: '~/Custom CC Switch' })
    )
    expect(findCcSwitchDatabase(home, appSupport)).toBe(customDatabase)

    writeFileSync(path.join(appSupport, 'com.ccswitch.desktop', 'app_paths.json'), '{}')
    const defaultDatabase = path.join(home, '.cc-switch', 'cc-switch.db')
    createCcSwitchDatabase(defaultDatabase).close()
    expect(findCcSwitchDatabase(home, appSupport)).toBe(defaultDatabase)
  })
})

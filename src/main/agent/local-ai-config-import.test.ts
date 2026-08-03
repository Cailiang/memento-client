import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discoverLocalAiProviders,
  validateLocalAiProviderDiscovery
} from './local-ai-config-import'

const temporaryDirectories: string[] = []

function temporaryHome(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'memento-local-ai-'))
  temporaryDirectories.push(directory)
  return directory
}

function writeFixture(home: string, relativePath: string, contents: string): void {
  const target = path.join(home, relativePath)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, contents)
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('local AI provider discovery', () => {
  it('discovers complete Claude, Codex, Gemini, and Grok API configurations', () => {
    const home = temporaryHome()
    writeFixture(home, '.claude/settings.json', JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'claude-test-key',
        ANTHROPIC_BASE_URL: 'https://claude.example.com',
        ANTHROPIC_MODEL: 'claude-test-model'
      }
    }))
    writeFixture(home, '.codex/auth.json', JSON.stringify({ OPENAI_API_KEY: 'codex-test-key' }))
    writeFixture(home, '.codex/config.toml', [
      'model_provider = "relay"',
      'model = "gpt-test"',
      '',
      '[model_providers.relay]',
      'base_url = "https://codex.example.com/v1"',
      'wire_api = "responses"'
    ].join('\n'))
    writeFixture(home, '.gemini/.env', [
      'GEMINI_API_KEY="gemini-test-key"',
      'GOOGLE_GEMINI_BASE_URL=https://gemini.example.com',
      'GEMINI_MODEL=gemini-test-model # selected model'
    ].join('\n'))
    writeFixture(home, '.grok/config.toml', [
      '[models]',
      'default = "relay"',
      '',
      '[model.relay]',
      'name = "Grok Relay"',
      'api_backend = "openai"',
      'base_url = "https://grok.example.com/v1"',
      'env_key = "GROK_RELAY_KEY"',
      'model = "grok-test-model"'
    ].join('\n'))

    const result = discoverLocalAiProviders(home, { GROK_RELAY_KEY: 'grok-test-key' })

    expect(result).toMatchObject({ sourcesFound: 4, detected: 4, rejected: 0 })
    expect(result.candidates.map(({ apiKey: _apiKey, ...provider }) => provider)).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^local-config-claude-/),
        type: 'anthropic',
        baseUrl: 'https://claude.example.com',
        model: 'claude-test-model'
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^local-config-codex-/),
        type: 'openai',
        baseUrl: 'https://codex.example.com/v1',
        model: 'gpt-test'
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^local-config-gemini-/),
        type: 'google',
        baseUrl: 'https://gemini.example.com',
        model: 'gemini-test-model'
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^local-config-grok-/),
        type: 'openai-compatible',
        baseUrl: 'https://grok.example.com/v1',
        model: 'grok-test-model'
      })
    ])
    expect(result.candidates.map((provider) => provider.apiKey)).toEqual([
      'claude-test-key',
      'codex-test-key',
      'gemini-test-key',
      'grok-test-key'
    ])
  })

  it('filters malformed, incomplete, and OAuth-only configurations', () => {
    const home = temporaryHome()
    writeFixture(home, '.claude/settings.json', '{broken')
    writeFixture(home, '.codex/auth.json', JSON.stringify({
      tokens: { access_token: 'chatgpt-oauth-token' }
    }))
    writeFixture(home, '.gemini/settings.json', JSON.stringify({ selectedAuthType: 'oauth-personal' }))
    writeFixture(home, '.grok/auth.json', JSON.stringify({ access_token: 'grok-session-token' }))

    const result = discoverLocalAiProviders(home, {})

    expect(result).toEqual({
      sourcesFound: 4,
      detected: 4,
      rejected: 4,
      candidates: []
    })
  })

  it('reads a Codex provider key from its configured environment variable', () => {
    const home = temporaryHome()
    writeFixture(home, '.codex/config.toml', [
      'model_provider = "private"',
      'model = "agent-model"',
      '',
      '[model_providers.private]',
      'base_url = "https://models.example.com"',
      'env_key = "PRIVATE_MODEL_KEY"'
    ].join('\n'))

    const result = discoverLocalAiProviders(home, { PRIVATE_MODEL_KEY: 'private-secret' })

    expect(result.rejected).toBe(0)
    expect(result.candidates[0]).toMatchObject({
      type: 'openai-compatible',
      apiKey: 'private-secret',
      model: 'agent-model'
    })
  })

  it('keeps only candidates whose credentials, endpoint, and configured model validate', async () => {
    const home = temporaryHome()
    writeFixture(home, '.claude/settings.json', JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'invalid-claude-key',
        ANTHROPIC_BASE_URL: 'https://claude.example.com',
        ANTHROPIC_MODEL: 'claude-test-model'
      }
    }))
    writeFixture(home, '.codex/auth.json', JSON.stringify({ OPENAI_API_KEY: 'codex-test-key' }))
    writeFixture(home, '.codex/config.toml', [
      'model = "gpt-test"',
      '',
      '[model_providers.openai]',
      'base_url = "https://api.openai.com/v1"'
    ].join('\n'))
    writeFixture(home, '.gemini/.env', [
      'GEMINI_API_KEY=gemini-test-key',
      'GEMINI_MODEL=gemini-missing-model'
    ].join('\n'))
    const discoverModels = vi.fn(async (input: { type: string }) => {
      if (input.type === 'anthropic') throw new Error('HTTP 401')
      if (input.type === 'google') return { models: ['gemini-available-model'] }
      return { models: ['gpt-test'] }
    })

    const result = await validateLocalAiProviderDiscovery(
      discoverLocalAiProviders(home),
      discoverModels
    )

    expect(result).toMatchObject({ sourcesFound: 3, detected: 3, rejected: 2 })
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ type: 'openai', model: 'gpt-test' })
    expect(discoverModels).toHaveBeenCalledTimes(3)
  })
})

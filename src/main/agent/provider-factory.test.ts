import { describe, expect, it } from 'vitest'
import type { PrivateAgentProvider } from './agent-store'
import { createProviderModel, providerErrorMessage } from './provider-factory'

function provider(type: PrivateAgentProvider['type']): PrivateAgentProvider {
  return {
    id: type,
    name: type,
    type,
    baseUrl: 'https://models.example.com/v1',
    model: 'test-model',
    apiKey: 'secret-provider-key',
    isDefault: true,
    connectionState: 'untested',
    keyPresent: true,
    keyHint: '••••-key',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z'
  }
}

describe('Agent provider factory', () => {
  it.each(['openai-compatible', 'openai', 'anthropic', 'google'] as const)(
    'creates a %s language model without making a request',
    (type) => {
      const model = createProviderModel(provider(type))
      if (typeof model === 'string') throw new Error('Expected a configured language model')
      expect(model.modelId).toBe('test-model')
    }
  )

  it('removes API keys and bearer credentials from provider errors', () => {
    const message = providerErrorMessage(
      new Error('request failed for secret-provider-key with Bearer reflected-token'),
      'secret-provider-key'
    )
    expect(message).toBe('request failed for [REDACTED] with Bearer [REDACTED]')
  })

  it('turns SDK timeout errors into an actionable message', () => {
    expect(providerErrorMessage(new Error('request timed out after 20000ms'), 'secret'))
      .toBe('连接模型超时，请检查服务地址、模型名称和网络后重试')
  })
})

import { describe, expect, it } from 'vitest'
import type { PrivateAgentProvider } from './agent-store'
import {
  createProviderModel,
  PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  PROVIDER_TEST_TIMEOUT,
  providerErrorMessage,
  providerTestReasoning,
  providerTestToolChoice
} from './provider-factory'

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
      .toBe('模型响应超时，请稍后重试或选择响应更快的模型')
  })

  it('localizes provider timeouts for English Agent interactions', () => {
    expect(providerErrorMessage(new Error('request timed out'), 'secret', 'en-US'))
      .toBe('The model response timed out. Try again later or choose a faster model.')
  })

  it('allows slower reasoning models to complete a two-step tool probe', () => {
    expect(PROVIDER_TEST_TIMEOUT).toEqual({ totalMs: 60_000, stepMs: 45_000 })
    expect(PROVIDER_TEST_MAX_OUTPUT_TOKENS).toBe(2_048)
    expect(providerTestToolChoice(0)).toBe('required')
    expect(providerTestToolChoice(1)).toBe('none')
    expect(providerTestReasoning('google')).toBe('none')
    expect(providerTestReasoning('anthropic')).toBeUndefined()
  })
})

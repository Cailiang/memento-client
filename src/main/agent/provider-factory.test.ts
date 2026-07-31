import { describe, expect, it, vi } from 'vitest'
import type { PrivateAgentProvider } from './agent-store'
import {
  createProviderModel,
  PROVIDER_TEST_MAX_OUTPUT_TOKENS,
  PROVIDER_TEST_TIMEOUT,
  providerErrorMessage,
  providerTestReasoning,
  providerTestToolChoice,
  testProviderConnection
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
  it.each(['openai-compatible', 'openai', 'anthropic', 'antigravity', 'google'] as const)(
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
    expect(providerTestToolChoice('google', 0)).toBe('required')
    expect(providerTestToolChoice('antigravity', 0)).toBe('auto')
    expect(providerTestToolChoice('antigravity', 1)).toBe('none')
    expect(providerTestReasoning({ type: 'google', model: 'gemini-3.1-pro-high' })).toBe('low')
    expect(providerTestReasoning({ type: 'antigravity', model: 'gemini-3.1-pro-high' })).toBe('low')
    expect(providerTestReasoning({ type: 'google', model: 'gemini-2.5-pro' })).toBeUndefined()
    expect(providerTestReasoning({ type: 'anthropic', model: 'claude-opus-4-6' })).toBeUndefined()
  })

  it('sends Antigravity a strict VALIDATED probe and continues with its tool result', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchProvider = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body')
      requestBodies.push(JSON.parse(init.body) as Record<string, unknown>)
      const parts = requestBodies.length === 1
        ? [{ functionCall: { name: 'connection_probe', args: { acknowledgement: 'ready' } } }]
        : [{ text: 'OK' }]
      return new Response(JSON.stringify({
        candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })

    try {
      const result = await testProviderConnection({
        ...provider('antigravity'),
        baseUrl: 'https://models.example.com/antigravity/v1beta',
        model: 'gemini-3.1-pro-high'
      })

      expect(result.toolCalling).toBe(true)
      expect(requestBodies).toHaveLength(2)
      expect(requestBodies[0]).toMatchObject({
        toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } },
        tools: [{ functionDeclarations: [{ name: 'connection_probe' }] }]
      })
      expect(requestBodies[1]).toMatchObject({
        toolConfig: { functionCallingConfig: { mode: 'NONE' } }
      })
      const followUpContents = requestBodies[1].contents as Array<{
        parts?: Array<Record<string, unknown>>
      }>
      expect(followUpContents.some((content) =>
        content.parts?.some((part) => 'functionResponse' in part)
      )).toBe(true)
    } finally {
      fetchProvider.mockRestore()
    }
  })
})

import { describe, expect, it, vi } from 'vitest'
import {
  discoverProviderModels,
  normalizeProviderBaseUrl,
  type PrivateModelDiscoveryInput
} from './provider-config'

function discoveryInput(
  type: PrivateModelDiscoveryInput['type'] = 'openai-compatible'
): PrivateModelDiscoveryInput {
  return {
    type,
    baseUrl: 'https://code.tczor.cn',
    apiKey: 'secret-model-key'
  }
}

describe('model provider configuration', () => {
  it('normalizes root and full OpenAI-compatible endpoints to a v1 API base', () => {
    expect(normalizeProviderBaseUrl('openai-compatible', 'https://code.tczor.cn'))
      .toBe('https://code.tczor.cn/v1')
    expect(normalizeProviderBaseUrl('openai-compatible', 'https://code.tczor.cn/v1/'))
      .toBe('https://code.tczor.cn/v1')
    expect(normalizeProviderBaseUrl('openai-compatible', 'https://code.tczor.cn/v1/responses'))
      .toBe('https://code.tczor.cn/v1')
    expect(normalizeProviderBaseUrl('google', 'https://generativelanguage.googleapis.com'))
      .toBe('https://generativelanguage.googleapis.com/v1beta')
  })

  it('fetches, deduplicates, and naturally sorts OpenAI-compatible models', async () => {
    const fetchProvider = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: 'model-10' }, { id: 'model-2' }, { id: 'model-2' }, { id: '' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await discoverProviderModels(discoveryInput(), fetchProvider)

    expect(result).toEqual({
      models: ['model-2', 'model-10'],
      resolvedBaseUrl: 'https://code.tczor.cn/v1',
      excludedModelCount: 0
    })
    const [url, request] = fetchProvider.mock.calls[0]
    expect(String(url)).toBe('https://code.tczor.cn/v1/models')
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer secret-model-key' })
  })

  it('uses the Google models route and strips resource prefixes', async () => {
    const fetchProvider = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      models: [{ name: 'models/gemini-2.5-pro' }, { name: 'models/gemini-2.5-flash' }]
    }), { status: 200 }))
    const result = await discoverProviderModels(discoveryInput('google'), fetchProvider)

    expect(result.models).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
    expect(String(fetchProvider.mock.calls[0][0])).toBe(
      'https://code.tczor.cn/v1beta/models?key=secret-model-key'
    )
  })

  it('filters models that cannot run the text and tool-calling Agent', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'gpt-5.4', type: 'model' },
        { id: 'gpt-5.3-codex-spark', type: 'model' },
        { id: 'gpt-4o-audio-preview', type: 'model' },
        { id: 'gpt-4o-realtime-preview', type: 'model' },
        { id: 'gpt-image-1', type: 'model' },
        { id: 'codex-auto-review', type: 'model' }
      ]
    }), { status: 200 }))

    const result = await discoverProviderModels(discoveryInput('openai'), fetchProvider)

    expect(result.models).toEqual(['gpt-5.3-codex-spark', 'gpt-5.4'])
    expect(result.excludedModelCount).toBe(4)
  })

  it('uses provider capability metadata when it is available', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'chat-model', supported_endpoint_types: ['chat/completions'] },
        { id: 'image-model-custom-name', supported_endpoint_types: ['images/generations'] }
      ]
    }), { status: 200 }))

    const result = await discoverProviderModels(discoveryInput(), fetchProvider)

    expect(result.models).toEqual(['chat-model'])
    expect(result.excludedModelCount).toBe(1)
  })

  it('returns a clear error when model discovery times out', async () => {
    const fetchProvider = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    )
    await expect(discoverProviderModels(discoveryInput(), fetchProvider, 5))
      .rejects.toThrow('获取模型列表超时')
  })

  it('keeps the failed endpoint and server response visible for troubleshooting', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'Unknown antigravity route' }
    }), { status: 404 }))
    await expect(discoverProviderModels({
      ...discoveryInput(),
      baseUrl: 'https://code.tczor.cn/antigravity'
    }, fetchProvider)).rejects.toThrow(
      '请求地址：https://code.tczor.cn/antigravity/models。服务响应：Unknown antigravity route'
    )
  })
})

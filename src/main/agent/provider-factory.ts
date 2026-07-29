import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { stepCountIs, tool, ToolLoopAgent, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { AgentProviderTestResult } from '../../shared/agent-types'
import type { PrivateAgentProvider } from './agent-store'
import { normalizeProviderBaseUrl } from './provider-config'

export function createProviderModel(provider: PrivateAgentProvider): LanguageModel {
  const baseURL = normalizeProviderBaseUrl(provider.type, provider.baseUrl)
  switch (provider.type) {
    case 'openai':
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL
      })(provider.model)
    case 'anthropic':
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL
      })(provider.model)
    case 'google':
      return createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL
      })(provider.model)
    case 'openai-compatible':
      return createOpenAICompatible({
        name: provider.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'custom',
        apiKey: provider.apiKey,
        baseURL
      })(provider.model)
  }
}

export async function testProviderConnection(
  provider: PrivateAgentProvider,
  signal?: AbortSignal
): Promise<AgentProviderTestResult> {
  let toolCalled = false
  const probe = tool({
    description: 'Required connection probe. Call this tool exactly once.',
    inputSchema: z.object({
      acknowledgement: z.string().describe('A short acknowledgement')
    }),
    execute: async ({ acknowledgement }) => {
      toolCalled = true
      return { ok: true, acknowledgement }
    }
  })
  const agent = new ToolLoopAgent({
    id: 'memento-provider-test',
    model: createProviderModel(provider),
    instructions: 'You are a connection tester. Call connection_probe once, then answer with OK.',
    tools: { connection_probe: probe },
    toolChoice: 'required',
    stopWhen: stepCountIs(2),
    maxOutputTokens: 64,
    temperature: 0
  })
  await agent.generate({
    prompt: 'Verify that tool calling works.',
    abortSignal: signal,
    timeout: 20_000
  })
  if (!toolCalled) throw new Error('模型可以响应，但没有完成工具调用测试')
  return {
    ok: true,
    message: '连接成功，模型支持工具调用',
    toolCalling: true,
    testedAt: new Date().toISOString()
  }
}

export function providerErrorMessage(error: unknown, apiKey: string): string {
  const source = error instanceof Error ? error.message : '模型供应商请求失败'
  const withoutKey = apiKey ? source.split(apiKey).join('[REDACTED]') : source
  const sanitized = withoutKey.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  if (/timed?\s*out|timeout|aborted due to timeout/i.test(sanitized)) {
    return '连接模型超时，请检查服务地址、模型名称和网络后重试'
  }
  return sanitized
}

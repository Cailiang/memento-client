import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { stepCountIs, tool, ToolLoopAgent, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { AppLanguage } from '../../shared/app-settings'
import type { AgentProviderTestResult } from '../../shared/agent-types'
import type { PrivateAgentProvider } from './agent-store'
import { isOfficialGoogleApiUrl, normalizeProviderBaseUrl } from './provider-config'

export const PROVIDER_TEST_TIMEOUT = {
  totalMs: 60_000,
  stepMs: 45_000
} as const

export function providerTestToolChoice(stepNumber: number): 'required' | 'none' {
  return stepNumber === 0 ? 'required' : 'none'
}

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
        baseURL,
        headers: isOfficialGoogleApiUrl(baseURL)
          ? undefined
          : {
              'x-goog-api-key': undefined,
              Authorization: `Bearer ${provider.apiKey}`
            }
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
  signal?: AbortSignal,
  language: AppLanguage = 'zh-CN'
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
    prepareStep: ({ stepNumber }) => ({
      toolChoice: providerTestToolChoice(stepNumber)
    }),
    stopWhen: stepCountIs(2),
    maxOutputTokens: 64,
    temperature: 0
  })
  await agent.generate({
    prompt: 'Verify that tool calling works.',
    abortSignal: signal,
    timeout: PROVIDER_TEST_TIMEOUT
  })
  if (!toolCalled) {
    throw new Error(language === 'en-US'
      ? 'The model responded but did not complete the tool-calling test.'
      : '模型可以响应，但没有完成工具调用测试')
  }
  return {
    ok: true,
    message: language === 'en-US'
      ? 'Connected. The model supports tool calling.'
      : '连接成功，模型支持工具调用',
    toolCalling: true,
    testedAt: new Date().toISOString()
  }
}

export function providerErrorMessage(
  error: unknown,
  apiKey: string,
  language: AppLanguage = 'zh-CN'
): string {
  const source = error instanceof Error
    ? error.message
    : language === 'en-US' ? 'The model provider request failed.' : '模型供应商请求失败'
  const withoutKey = apiKey ? source.split(apiKey).join('[REDACTED]') : source
  const sanitized = withoutKey.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  if (/timed?\s*out|timeout|aborted due to timeout|超时/i.test(sanitized)) {
    return language === 'en-US'
      ? 'The model response timed out. Try again later or choose a faster model.'
      : '模型响应超时，请稍后重试或选择响应更快的模型'
  }
  if (language === 'en-US') {
    const translations: Array<[string, string]> = [
      ['服务地址格式无效', 'The service URL is invalid.'],
      ['服务地址只支持 HTTP 或 HTTPS', 'The service URL must use HTTP or HTTPS.'],
      ['服务地址不能包含用户名或密码', 'The service URL cannot contain a username or password.'],
      ['模型列表接口返回了无法识别的数据', 'The model-list endpoint returned unrecognized data.'],
      ['服务已连接，但没有返回可用模型', 'Connected to the service, but it returned no available models.'],
      ['模型可以响应，但没有完成工具调用测试', 'The model responded but did not complete the tool-calling test.']
    ]
    const translated = translations.find(([chinese]) => sanitized.includes(chinese))
    if (translated) return translated[1]
  }
  return sanitized
}

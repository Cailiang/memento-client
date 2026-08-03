import { describe, expect, it, vi } from 'vitest'
import type { ImportedProviderCandidate } from './provider-import'
import { validateImportedProviderCandidates } from './provider-import'

function importedProvider(
  id: string,
  model: string,
  apiKey: string
): ImportedProviderCandidate {
  return {
    id,
    name: id,
    type: 'openai-compatible',
    baseUrl: `https://${id}.example.com/v1`,
    model,
    apiKey
  }
}

describe('imported provider validation', () => {
  it('keeps only candidates with valid access and the exact configured model', async () => {
    const unauthorized = importedProvider('unauthorized', 'agent-model', 'unauthorized-key')
    const unavailableModel = importedProvider('missing-model', 'missing-model', 'valid-key')
    const usable = importedProvider('usable', 'agent-model', 'usable-key')
    const discoverModels = vi.fn(async (input: { baseUrl: string }) => {
      if (input.baseUrl.includes('unauthorized')) throw new Error('HTTP 401')
      if (input.baseUrl.includes('missing-model')) return { models: ['another-model'] }
      return { models: ['agent-model'] }
    })

    const result = await validateImportedProviderCandidates(
      [unauthorized, unavailableModel, usable],
      discoverModels
    )

    expect(result.rejected).toBe(2)
    expect(result.candidates.map((provider) => provider.id)).toEqual(['usable'])
    expect(discoverModels).toHaveBeenCalledTimes(3)
  })
})

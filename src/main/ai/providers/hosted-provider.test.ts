import { describe, expect, it } from 'vitest'
import type { NormalizedCandidateReport } from '../../../shared/ai-types'
import type { HostedAuth } from '../auth/hosted-auth'
import { HostedProvider } from './hosted-provider'

const report: NormalizedCandidateReport = {
  schemaVersion: 1,
  reportId: 'candidate-report',
  generatedAt: '2026-07-26T00:00:00Z',
  analysisKind: 'storage',
  platform: { os: 'macos', osMajorVersion: 15, architecture: 'x64' },
  candidate: {
    id: 'candidate',
    name: 'npm cache',
    category: 'cache',
    ruleRisk: 'safe',
    status: 'reclaimable',
    availableActions: [{ kind: 'delete-storage', reversible: false }],
    facts: { locallyActionable: true }
  },
  privacy: {
    rawPathsIncluded: false,
    rawContentIncluded: false,
    redactionVersion: 'memento-redactor-v1',
    removedFieldCount: 1
  }
}

describe('HostedProvider gateway errors', () => {
  it('reports a candidate protocol mismatch instead of provider unavailability', async () => {
    const auth = {
      authorizedFetch: async () => new Response(
        JSON.stringify({ error: { code: 'AI_INVALID_INPUT' } }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    } as unknown as HostedAuth
    const provider = new HostedProvider(auth, '0.6.16')

    await expect(provider.analyzeCandidate(report, {
      requestId: 'request-1',
      locale: 'zh-CN',
      maxOutputTokens: 4_000
    })).rejects.toMatchObject({ code: 'AI_INVALID_INPUT' })
  })
})

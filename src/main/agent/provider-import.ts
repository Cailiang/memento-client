import { createHash } from 'node:crypto'
import type {
  AgentProviderModelsResult,
  AgentProviderType
} from '../../shared/agent-types'
import {
  discoverProviderModels,
  type PrivateModelDiscoveryInput
} from './provider-config'

export interface ImportedProviderCandidate {
  id: string
  name: string
  type: AgentProviderType
  baseUrl: string
  model: string
  apiKey: string
}

export interface ImportedProviderValidation {
  candidates: ImportedProviderCandidate[]
  rejected: number
}

export type ImportedProviderModelDiscovery = (
  input: PrivateModelDiscoveryInput
) => Promise<Pick<AgentProviderModelsResult, 'models'>>

const IMPORTED_PROVIDER_VALIDATION_TIMEOUT_MS = 8_000

export function deterministicImportedProviderId(source: string, sourceId: string): string {
  const digest = createHash('sha256')
    .update(`${source}\0${sourceId}`)
    .digest('hex')
    .slice(0, 24)
  return `${source}-${digest}`
}

export async function validateImportedProviderCandidates(
  candidates: ImportedProviderCandidate[],
  discoverModels: ImportedProviderModelDiscovery = (input) =>
    discoverProviderModels(input, fetch, IMPORTED_PROVIDER_VALIDATION_TIMEOUT_MS)
): Promise<ImportedProviderValidation> {
  const validateCandidate = async (
    provider: ImportedProviderCandidate
  ): Promise<ImportedProviderCandidate | null> => {
    try {
      const result = await discoverModels({
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey
      })
      return result.models.includes(provider.model) ? provider : null
    } catch {
      return null
    }
  }
  const validated = await Promise.all(candidates.map(validateCandidate))
  const accepted = validated.filter(
    (provider): provider is ImportedProviderCandidate => provider !== null
  )
  return {
    candidates: accepted,
    rejected: candidates.length - accepted.length
  }
}

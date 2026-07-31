import { createHash } from 'node:crypto'
import type { AgentProviderType } from '../../shared/agent-types'

export interface ImportedProviderCandidate {
  id: string
  name: string
  type: AgentProviderType
  baseUrl: string
  model: string
  apiKey: string
}

export function deterministicImportedProviderId(source: string, sourceId: string): string {
  const digest = createHash('sha256')
    .update(`${source}\0${sourceId}`)
    .digest('hex')
    .slice(0, 24)
  return `${source}-${digest}`
}

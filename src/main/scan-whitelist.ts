import { isCandidateWhitelisted } from '../shared/app-settings'
import type { ScanBundle } from './scanner'

export function applyScanWhitelist(
  bundle: ScanBundle,
  serviceWhitelist: readonly string[],
  storageWhitelist: readonly string[]
): ScanBundle {
  const hidden = bundle.result.candidates.filter((candidate) =>
    isCandidateWhitelisted(candidate, serviceWhitelist, storageWhitelist)
  )
  if (!hidden.length) return bundle

  const actions = new Map(bundle.actions)
  const revealTargets = new Map(bundle.revealTargets)
  for (const candidate of hidden) {
    actions.delete(candidate.id)
    revealTargets.delete(candidate.id)
    for (const operation of candidate.operations ?? []) actions.delete(operation.id)
  }

  return {
    actions,
    revealTargets,
    terminalFixes: bundle.terminalFixes,
    result: {
      ...bundle.result,
      candidates: bundle.result.candidates.filter(
        (candidate) => !isCandidateWhitelisted(candidate, serviceWhitelist, storageWhitelist)
      )
    }
  }
}

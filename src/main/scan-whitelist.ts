import {
  isApplicationWhitelisted,
  isCandidateWhitelisted
} from '../shared/app-settings'
import type { ScanBundle } from './scanner'

export function applyScanWhitelist(
  bundle: ScanBundle,
  serviceWhitelist: readonly string[],
  storageWhitelist: readonly string[],
  applicationWhitelist: readonly string[] = []
): ScanBundle {
  const allApplications = [...new Map([
    ...bundle.result.applications,
    ...bundle.result.ignoredApplications
  ].map((application) => [application.id, application])).values()]
  const hiddenApplications = allApplications.filter((application) =>
    isApplicationWhitelisted(application, applicationWhitelist)
  )
  const hiddenApplicationIds = new Set(hiddenApplications.map((application) => application.id))
  const hiddenOperationIds = new Set(
    hiddenApplications.flatMap((application) => application.action ? [application.action.id] : [])
  )
  const hiddenCandidates = bundle.result.candidates.filter((candidate) =>
    isCandidateWhitelisted(candidate, serviceWhitelist, storageWhitelist) ||
    (candidate.section === 'applications' && (candidate.operations ?? []).some(
      (operation) => hiddenOperationIds.has(operation.id)
    ))
  )
  if (!hiddenCandidates.length && !hiddenApplications.length) return bundle

  const actions = new Map(bundle.actions)
  const revealTargets = new Map(bundle.revealTargets)
  for (const application of hiddenApplications) {
    revealTargets.delete(application.id)
    if (application.action) actions.delete(application.action.id)
  }
  for (const candidate of hiddenCandidates) {
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
        (candidate) => !hiddenCandidates.includes(candidate)
      ),
      applications: bundle.result.applications.filter(
        (application) => !hiddenApplicationIds.has(application.id)
      ),
      ignoredApplications: hiddenApplications.map((application) => ({
        ...application,
        action: undefined
      }))
    }
  }
}

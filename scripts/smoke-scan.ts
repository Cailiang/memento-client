import os from 'node:os'
import { existsSync } from 'node:fs'
import { runFullScan } from '../src/main/scanner'

const started = Date.now()
const bundle = await runFullScan((progress) => {
  process.stdout.write(`[${String(progress.progress).padStart(3)}%] ${progress.message}\n`)
})

const bySection = bundle.result.candidates.reduce<Record<string, number>>((counts, candidate) => {
  counts[candidate.section] = (counts[candidate.section] ?? 0) + 1
  return counts
}, {})
const serviceCleanup = bundle.result.candidates
  .filter((candidate) =>
    candidate.operations?.some(
      (operation) =>
        operation.kind === 'trash-service-software' ||
        operation.kind === 'trash-launch-agent-config' ||
        operation.kind === 'trash-service-directory'
    )
  )
  .map((candidate) => ({
    name: candidate.name,
    subtitle: candidate.subtitle,
    status: candidate.status,
    operations: candidate.operations?.map((operation) => ({
      id: operation.id,
      kind: operation.kind,
      label: operation.label
    })) ?? []
  }))
const serviceLocations = bundle.result.candidates
  .filter((candidate) => candidate.section === 'services' && candidate.location)
  .map((candidate) => ({
    name: candidate.name,
    location: candidate.location,
    revealTargetRegistered: bundle.revealTargets.has(candidate.id)
  }))
const applicationInventoryWithoutLocation = bundle.result.applications.find(
  (application) => !bundle.revealTargets.has(application.id)
)
if (applicationInventoryWithoutLocation) {
  throw new Error(`application location is not revealable: ${applicationInventoryWithoutLocation.name}`)
}
const removableSystemApplication = bundle.result.applications.find(
  (application) => application.scope === 'system' && application.action
)
if (removableSystemApplication) {
  throw new Error(`system application is removable: ${removableSystemApplication.name}`)
}

const duplicateStartupRemoval = bundle.result.candidates.find(
  (candidate) =>
    candidate.section === 'services' &&
    (candidate.operations?.filter(
      (operation) => operation.kind === 'trash-launch-agent-config'
    ).length ?? 0) > 1
)
if (duplicateStartupRemoval) {
  throw new Error(`duplicate startup removal actions: ${duplicateStartupRemoval.name}`)
}

const storageWithoutLocation = bundle.result.candidates.find(
  (candidate) =>
    candidate.section === 'storage' &&
    (!candidate.location || !bundle.revealTargets.has(candidate.id))
)
if (storageWithoutLocation) {
  throw new Error(`storage location is not revealable: ${storageWithoutLocation.name}`)
}
const hiddenHomeItems = bundle.result.candidates.filter(
  (candidate) => candidate.section === 'storage' && candidate.action?.kind === 'trash-home-artifact'
)
const unsafeHiddenHomeItem = hiddenHomeItems.find((candidate) =>
  candidate.risk !== 'review' || !candidate.action?.reversible || !candidate.location?.startsWith('~/')
)
if (unsafeHiddenHomeItem) {
  throw new Error(`hidden Home item is not review-only and reversible: ${unsafeHiddenHomeItem.name}`)
}
const installedIpatool = ['/opt/homebrew/bin/ipatool', '/usr/local/bin/ipatool']
  .some((target) => existsSync(target))
const suggestedIpatoolConfig = hiddenHomeItems.find((candidate) => candidate.location === '~/.ipatool')
if (installedIpatool && suggestedIpatoolConfig) {
  throw new Error('installed ipatool command was reported as hidden leftover data')
}
const personalFileFinding = bundle.result.candidates.find((candidate) =>
  candidate.section === 'storage' &&
  /^~\/(?:Downloads|Desktop|Movies)\//.test(candidate.location ?? '')
)
if (personalFileFinding) {
  throw new Error(`personal file was reported as a Storage cleanup finding: ${personalFileFinding.location}`)
}

const expectedLocations = new Map([
  ['homebrew.mxcl.php@7.4', '/usr/local/opt/php@7.4'],
  ['pinecms', `${os.homedir()}/src/go/apps/cms/pinecms`]
])
for (const [name, expectedLocation] of expectedLocations) {
  const candidate = bundle.result.candidates.find((item) => item.name === name)
  if (candidate?.location === '/usr/local/var') {
    throw new Error(`generic working directory used for ${name}: ${candidate.location}`)
  }
  if (candidate && existsSync(expectedLocation) && candidate.location !== expectedLocation) {
    throw new Error(
      `unexpected service location for ${name}: ${candidate.location ?? 'missing'}`
    )
  }
}

process.stdout.write(
  `${JSON.stringify(
    {
      elapsedMs: Date.now() - started,
      candidates: bySection,
      actionable: bundle.actions.size,
      applications: {
        installed: bundle.result.applications.length,
        removable: bundle.result.applications.filter((application) => application.action).length,
        unused: bundle.result.applications.filter((application) => application.unused).length,
        system: bundle.result.applications.filter((application) => application.scope === 'system').length
      },
      serviceCleanup,
      serviceLocations,
      storageLocations: bundle.result.candidates.filter(
        (candidate) => candidate.section === 'storage' && candidate.location
      ).length,
      permanentStorageActions: bundle.result.candidates.filter(
        (candidate) => candidate.section === 'storage' && (
          candidate.action?.kind === 'delete-storage' ||
          candidate.action?.kind === 'delete-storage-group'
        )
      ).length,
      aiCacheGroups: bundle.result.candidates
        .filter((candidate) => candidate.section === 'storage' && candidate.action?.kind === 'delete-storage-group')
        .map((candidate) => ({ name: candidate.name, sizeBytes: candidate.sizeBytes ?? 0 })),
      personalFileFindings: 0,
      hiddenHomeItems: {
        count: hiddenHomeItems.length,
        totalBytes: hiddenHomeItems.reduce((sum, candidate) => sum + (candidate.sizeBytes ?? 0), 0),
        sample: hiddenHomeItems.slice(0, 8).map((candidate) => ({
          name: candidate.name,
          location: candidate.location,
          sizeBytes: candidate.sizeBytes ?? 0,
          reversible: candidate.action?.reversible ?? false
        }))
      },
      terminal: {
        baselineMs: bundle.result.terminal.baselineMs,
        startupMs: bundle.result.terminal.startupMs,
        findings: bundle.result.terminal.findings.length,
        automaticFixes: bundle.terminalFixes.size,
        findingDetails: bundle.result.terminal.findings.map((finding) => ({
          code: finding.code,
          title: finding.title,
          source: finding.source,
          automatic: Boolean(finding.fix)
        }))
      },
      warnings: bundle.result.warnings
    },
    null,
    2
  )}\n`
)

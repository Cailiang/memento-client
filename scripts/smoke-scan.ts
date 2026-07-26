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
      serviceCleanup,
      serviceLocations,
      storageLocations: bundle.result.candidates.filter(
        (candidate) => candidate.section === 'storage' && candidate.location
      ).length,
      permanentStorageActions: bundle.result.candidates.filter(
        (candidate) => candidate.section === 'storage' && candidate.action?.kind === 'delete-storage'
      ).length,
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

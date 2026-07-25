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
        operation.kind === 'trash-launch-agent-config'
    )
  )
  .map((candidate) => ({
    name: candidate.name,
    subtitle: candidate.subtitle,
    operations: candidate.operations?.map((operation) => operation.label) ?? []
  }))

process.stdout.write(
  `${JSON.stringify(
    {
      elapsedMs: Date.now() - started,
      candidates: bySection,
      actionable: bundle.actions.size,
      serviceCleanup,
      terminal: {
        baselineMs: bundle.result.terminal.baselineMs,
        startupMs: bundle.result.terminal.startupMs,
        findings: bundle.result.terminal.findings.length
      },
      warnings: bundle.result.warnings
    },
    null,
    2
  )}\n`
)

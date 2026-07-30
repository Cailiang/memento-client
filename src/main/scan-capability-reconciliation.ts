import type { ScanBundle, RegisteredAction } from './scanner'
import type { RegisteredTerminalFix } from './terminal-fixes'

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).sort().join(',')}]`
  }
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return `{${Object.keys(source).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalValue(source[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function capabilityReplacements<T>(
  previous: ReadonlyMap<string, T>,
  next: ReadonlyMap<string, T>
): Map<string, string> {
  const previousIds = new Map<string, string[]>()
  for (const [id, capability] of previous) {
    const fingerprint = canonicalValue(capability)
    previousIds.set(fingerprint, [...(previousIds.get(fingerprint) ?? []), id])
  }

  const replacements = new Map<string, string>()
  for (const [id, capability] of next) {
    const available = previousIds.get(canonicalValue(capability))
    const previousId = available?.shift()
    if (previousId) replacements.set(id, previousId)
  }
  return replacements
}

function remapCapabilities<T>(
  capabilities: ReadonlyMap<string, T>,
  replacements: ReadonlyMap<string, string>
): Map<string, T> {
  return new Map([...capabilities].map(([id, capability]) => [
    replacements.get(id) ?? id,
    capability
  ]))
}

export function reconcileScanCapabilities(
  previous: {
    actions: ReadonlyMap<string, RegisteredAction>
    terminalFixes: ReadonlyMap<string, RegisteredTerminalFix>
  },
  next: ScanBundle
): ScanBundle {
  const actionIds = capabilityReplacements(previous.actions, next.actions)
  const terminalFixIds = capabilityReplacements(previous.terminalFixes, next.terminalFixes)
  const actionId = (id: string): string => actionIds.get(id) ?? id

  return {
    ...next,
    actions: remapCapabilities(next.actions, actionIds),
    terminalFixes: remapCapabilities(next.terminalFixes, terminalFixIds),
    revealTargets: new Map([...next.revealTargets].map(([id, target]) => [
      actionId(id),
      target
    ])),
    result: {
      ...next.result,
      candidates: next.result.candidates.map((candidate) => ({
        ...candidate,
        id: candidate.action && next.actions.has(candidate.id)
          ? actionId(candidate.id)
          : candidate.id,
        operations: candidate.operations?.map((operation) => ({
          ...operation,
          id: actionId(operation.id)
        }))
      })),
      applications: next.result.applications.map((application) => ({
        ...application,
        action: application.action
          ? { ...application.action, id: actionId(application.action.id) }
          : undefined
      })),
      terminal: {
        ...next.result.terminal,
        findings: next.result.terminal.findings.map((finding) => {
          if (!finding.fix) return finding
          const id = terminalFixIds.get(finding.fix.id) ?? finding.fix.id
          return {
            ...finding,
            id: finding.id === finding.fix.id ? id : finding.id,
            fix: { ...finding.fix, id }
          }
        })
      }
    }
  }
}

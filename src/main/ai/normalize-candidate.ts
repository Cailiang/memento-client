import { randomUUID } from 'node:crypto'
import type {
  AiCandidateAnalysisKind,
  NormalizedCandidateReport
} from '../../shared/ai-types'
import type { ScanCandidate, ScanResult } from '../../shared/types'
import { REDACTION_VERSION, redactText } from './redact'

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:@+-]{1,200}$/

function candidateCategory(
  candidate: ScanCandidate
): NormalizedCandidateReport['candidate']['category'] {
  const searchable = `${candidate.name} ${candidate.subtitle}`.toLowerCase()
  if (candidate.section === 'services') {
    if (searchable.includes('homebrew')) return 'homebrew-service'
    if (searchable.includes('launchagent') || searchable.includes('启动项')) return 'launch-agent'
    return 'background-service'
  }
  if (searchable.includes('deriveddata') || searchable.includes('构建')) return 'build-artifact'
  if (searchable.includes('docker') && searchable.includes('磁盘')) return 'virtual-disk'
  if (searchable.includes('缓存') || searchable.includes('cache')) return 'cache'
  if (candidate.risk === 'protected') return 'application-data'
  return 'storage-other'
}

function candidateStatus(
  candidate: ScanCandidate
): NormalizedCandidateReport['candidate']['status'] {
  const value = candidate.status.toLowerCase()
  if (candidate.section === 'services') {
    if (value.includes('pid') || value.includes('运行')) return 'running'
    if (value.includes('加载') || value.includes('loaded')) return 'loaded'
    return 'unknown'
  }
  if (candidate.risk === 'protected' || candidateOperations(candidate).length === 0) {
    return 'analysis-only'
  }
  return 'reclaimable'
}

function candidateOperations(candidate: ScanCandidate) {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ ...candidate.action, id: candidate.id }] : []
}

function safeName(candidate: ScanCandidate): { value: string; removed: number } {
  const redacted = redactText(candidate.name)
  const value = redacted.value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200)
  if (!value || /(?:^|\s)(?:~\/|\/Users\/|\/Applications\/)/.test(value)) {
    return { value: '未命名扫描项', removed: redacted.removedFieldCount + 1 }
  }
  return { value, removed: redacted.removedFieldCount }
}

function safeBundleID(candidate: ScanCandidate): string | null {
  for (const evidence of candidate.evidence) {
    const match = evidence.match(/Bundle ID[：:]\s*([A-Za-z0-9._:@+-]+)/i)
    if (match?.[1] && SAFE_IDENTIFIER.test(match[1])) return match[1]
  }
  return SAFE_IDENTIFIER.test(candidate.name) && candidate.name.includes('.') ? candidate.name : null
}

function buildFacts(candidate: ScanCandidate): Record<string, string | number | boolean> {
  const operations = candidateOperations(candidate)
  const facts: Record<string, string | number | boolean> = {
    locallyActionable: operations.length > 0,
    reversibleActionsOnly: operations.length > 0 && operations.every((item) => item.reversible)
  }
  if (candidate.section === 'services') {
    facts.hasStopAction = operations.some((item) => item.kind.includes('stop'))
    facts.hasRemovalAction = operations.some((item) => item.kind.includes('trash'))
    facts.hasAssociatedApplication = candidate.evidence.some((item) => item.includes('关联应用'))
    const bundleID = safeBundleID(candidate)
    if (bundleID) facts.bundleId = bundleID
    const matchedData = candidate.evidence
      .map((item) => item.match(/检测到\s*(\d+)\s*项/))
      .find((item) => item?.[1])
    if (matchedData?.[1]) facts.exactMatchedDataItems = Number.parseInt(matchedData[1], 10)
  } else {
    facts.locallyClassifiedAsRebuildable =
      candidate.description.includes('重新生成') ||
      candidate.description.includes('重新下载') ||
      candidateCategory(candidate) === 'cache' ||
      candidateCategory(candidate) === 'build-artifact'
    facts.containsProtectedData = candidate.risk === 'protected'
  }
  return facts
}

export function normalizeCandidateReport(
  result: ScanResult,
  candidate: ScanCandidate
): NormalizedCandidateReport {
  if (candidate.section !== 'services' && candidate.section !== 'storage') {
    throw new Error('Only service and storage candidates support AI analysis')
  }
  const name = safeName(candidate)
  const architecture = process.arch === 'arm64' || process.arch === 'x64' ? process.arch : 'unknown'
  const osMajorVersion = Number.parseInt(result.system.osVersion.split('.')[0] ?? '', 10)
  const kind: AiCandidateAnalysisKind = candidate.section === 'services' ? 'service' : 'storage'
  const operations = candidateOperations(candidate).slice(0, 8)

  return {
    schemaVersion: 1,
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    analysisKind: kind,
    platform: {
      os: 'macos',
      osMajorVersion: Number.isFinite(osMajorVersion) ? osMajorVersion : 0,
      architecture
    },
    candidate: {
      id: 'candidate',
      name: name.value,
      category: candidateCategory(candidate),
      ruleRisk: candidate.risk,
      status: candidateStatus(candidate),
      sizeBytes: candidate.sizeBytes,
      ageDays: candidate.ageDays,
      availableActions: operations.map((item) => ({
        kind: item.kind,
        reversible: item.reversible
      })),
      facts: buildFacts(candidate)
    },
    privacy: {
      rawPathsIncluded: false,
      rawContentIncluded: false,
      redactionVersion: REDACTION_VERSION,
      removedFieldCount: candidate.evidence.length + 3 + name.removed
    }
  }
}

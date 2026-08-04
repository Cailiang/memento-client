import type {
  EstimateQuality,
  FindingConfidence,
  FindingReasonCode,
  ScanCandidate
} from './types'

type CandidateTrustInput = Pick<
  ScanCandidate,
  'section' | 'risk' | 'sizeBytes' | 'action' | 'operations' | 'serviceAnomalies'
>

export interface FindingTrustMetadata {
  confidence: FindingConfidence
  reasonCodes: readonly FindingReasonCode[]
  estimateQuality: EstimateQuality
}

export interface FindingTrustSummary {
  safeCleanup: ScanCandidate[]
  actionable: ScanCandidate[]
  clues: ScanCandidate[]
  trustedReclaimableBytes: number
  healthSignalCount: number
}

function actionKinds(candidate: CandidateTrustInput): string[] {
  const operations = candidate.operations?.map((operation) => operation.kind) ?? []
  return [...new Set([...(candidate.action ? [candidate.action.kind] : []), ...operations])]
}

export function inferFindingTrust(candidate: CandidateTrustInput): FindingTrustMetadata {
  const kinds = actionKinds(candidate)
  if (kinds.includes('trash-home-artifact')) {
    return {
      confidence: 'weak',
      reasonCodes: ['unmatched-local-identity', 'age-only-signal', 'measured-local-target'],
      estimateQuality: candidate.sizeBytes === undefined ? 'unknown' : 'exact'
    }
  }

  if (candidate.section === 'services') {
    const anomalies = candidate.serviceAnomalies ?? []
    return {
      confidence: anomalies.length ? 'strong' : 'verified',
      reasonCodes: [
        'managed-service',
        ...(anomalies.includes('orphaned') ? ['service-orphaned' as const] : []),
        ...(anomalies.length ? ['service-runtime-anomaly' as const] : []),
        ...(kinds.length ? ['registered-local-operation' as const] : [])
      ],
      estimateQuality: 'unknown'
    }
  }

  if (candidate.section === 'applications') {
    return {
      confidence: 'strong',
      reasonCodes: [
        ...(candidate.serviceAnomalies?.includes('stale')
          ? ['stale-last-used-date' as const]
          : []),
        'registered-local-operation'
      ],
      estimateQuality: candidate.sizeBytes === undefined ? 'unknown' : 'approximate'
    }
  }

  if (candidate.risk === 'safe' && kinds.length) {
    return {
      confidence: 'verified',
      reasonCodes: [
        ...(kinds.includes('brew-cleanup') ? ['homebrew-cleanup-preview' as const] : []),
        'allowlisted-rebuildable-path',
        'measured-local-target'
      ],
      estimateQuality: candidate.sizeBytes === undefined ? 'unknown' : 'exact'
    }
  }

  return {
    confidence: kinds.length ? 'strong' : 'weak',
    reasonCodes: [
      ...(kinds.some((kind) => kind === 'delete-storage')
        ? ['reviewable-application-log' as const]
        : []),
      ...(kinds.length ? ['registered-local-operation' as const] : []),
      ...(candidate.sizeBytes !== undefined ? ['measured-local-target' as const] : [])
    ],
    estimateQuality: candidate.sizeBytes === undefined ? 'unknown' : 'exact'
  }
}

function hasOperation(candidate: ScanCandidate): boolean {
  return Boolean(candidate.operations?.length || candidate.action)
}

export function isSafeCleanup(candidate: ScanCandidate): boolean {
  return candidate.confidence === 'verified' &&
    candidate.risk === 'safe' &&
    candidate.estimateQuality !== 'unknown' &&
    hasOperation(candidate)
}

export function isReviewClue(candidate: ScanCandidate): boolean {
  return candidate.confidence === 'weak'
}

export function isActionableFinding(candidate: ScanCandidate): boolean {
  return !isSafeCleanup(candidate) && !isReviewClue(candidate) && hasOperation(candidate)
}

export function isHealthSignal(candidate: ScanCandidate): boolean {
  return candidate.section === 'services' && Boolean(candidate.serviceAnomalies?.length)
}

export function summarizeFindingTrust(candidates: readonly ScanCandidate[]): FindingTrustSummary {
  const safeCleanup = candidates.filter(isSafeCleanup)
  const actionable = candidates.filter(isActionableFinding)
  const clues = candidates.filter(isReviewClue)
  return {
    safeCleanup,
    actionable,
    clues,
    trustedReclaimableBytes: safeCleanup.reduce(
      (sum, candidate) => sum + (candidate.sizeBytes ?? 0),
      0
    ),
    healthSignalCount: candidates.filter(isHealthSignal).length
  }
}

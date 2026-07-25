import type { AppLanguage } from '../../shared/app-settings'
import type { CandidateOperation, ScanCandidate } from '../../shared/types'

export function candidateOperations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ ...candidate.action, id: candidate.id }] : []
}

export function applyCompletedCandidateActions(
  candidates: ScanCandidate[],
  completedIds: ReadonlySet<string>,
  language: AppLanguage
): ScanCandidate[] {
  return candidates.flatMap((candidate) => {
    const operations = candidateOperations(candidate)
    const completed = operations.filter((operation) => completedIds.has(operation.id))
    if (!completed.length) return [candidate]

    const removed = completed.some((operation) => !operation.kind.startsWith('stop-'))
    if (removed) return []

    const remaining = operations.filter((operation) => !completedIds.has(operation.id))
    const evidence = language === 'en-US'
      ? 'Stopped in this session; the software and its data remain.'
      : '已在本次操作中停止，软件和数据仍然保留。'
    return [{
      ...candidate,
      status: language === 'en-US' ? 'Stopped' : '已停止',
      description: language === 'en-US'
        ? 'The service is stopped. You can still remove the related software if that option is available.'
        : '服务已停止。如果提供了卸载选项，你仍可以继续删除相关软件。',
      evidence: candidate.evidence.includes(evidence)
        ? candidate.evidence
        : [...candidate.evidence, evidence],
      action: undefined,
      operations: remaining
    }]
  })
}

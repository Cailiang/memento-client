import type { AppLanguage } from '../../shared/app-settings'
import type { CandidateOperation, ScanCandidate } from '../../shared/types'

export interface SelectedCandidateOperation {
  id: string
  candidate: ScanCandidate
  action: CandidateOperation
}

export function candidateOperations(candidate: ScanCandidate): CandidateOperation[] {
  if (candidate.operations?.length) return candidate.operations
  return candidate.action ? [{ ...candidate.action, id: candidate.id }] : []
}

export function selectedCandidateOperations(
  candidates: ScanCandidate[],
  selected: ReadonlySet<string>
): SelectedCandidateOperation[] {
  const unique = new Map<string, SelectedCandidateOperation>()
  for (const candidate of candidates) {
    for (const action of candidateOperations(candidate)) {
      if (selected.has(action.id) && !unique.has(action.id)) {
        unique.set(action.id, { id: action.id, candidate, action })
      }
    }
  }
  return [...unique.values()]
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

    const removedSoftwareOrDirectory = completed.some(
      (operation) =>
        operation.kind === 'trash-service-software' ||
        operation.kind === 'trash-service-directory' ||
        operation.kind === 'delete-storage' ||
        operation.kind === 'delete-storage-group' ||
        operation.kind === 'trash-home-artifact' ||
        operation.kind === 'trash'
    )
    if (removedSoftwareOrDirectory) return []

    const startupItemRemoved = completed.some(
      (operation) => operation.kind === 'trash-launch-agent-config'
    )
    const remaining = operations.filter(
      (operation) =>
        !completedIds.has(operation.id) &&
        (!startupItemRemoved || !operation.kind.startsWith('stop-'))
    )
    if (startupItemRemoved && !remaining.length) return []

    const evidence = startupItemRemoved
      ? language === 'en-US'
        ? 'The startup item was removed in this session; the program directory and user data remain.'
        : '已在本次操作中移除启动项，程序目录和用户数据仍然保留。'
      : language === 'en-US'
        ? 'Stopped in this session; the software and its data remain.'
        : '已在本次操作中停止，软件和数据仍然保留。'
    return [{
      ...candidate,
      status: startupItemRemoved
        ? language === 'en-US' ? 'Startup item removed' : '已移除启动项'
        : language === 'en-US' ? 'Stopped' : '已停止',
      description: startupItemRemoved
        ? language === 'en-US'
          ? 'The startup item is gone, but the program directory and user data remain. You can still remove the related directory if that option is available.'
          : '启动项已移除，但程序目录和用户数据仍然保留。如果提供了目录删除选项，可以继续处理。'
        : language === 'en-US'
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

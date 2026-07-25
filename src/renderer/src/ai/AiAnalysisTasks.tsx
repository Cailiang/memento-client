import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { AiDataPreview, AiTerminalAnalysis, PublicAiError } from '../../../shared/ai-types'

export type AiAnalysisTaskState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'analyzing'; preview: AiDataPreview }
  | { status: 'succeeded'; analysis: AiTerminalAnalysis; completedAt: number }
  | { status: 'failed'; error: PublicAiError }

interface AiAnalysisTasksValue {
  tasks: ReadonlyMap<string, AiAnalysisTaskState>
  setTaskState: (key: string, state: AiAnalysisTaskState) => void
}

const AiAnalysisTasksContext = createContext<AiAnalysisTasksValue | null>(null)
const idleState: AiAnalysisTaskState = { status: 'idle' }

export function updateAiAnalysisTasks(
  current: ReadonlyMap<string, AiAnalysisTaskState>,
  key: string,
  state: AiAnalysisTaskState
): Map<string, AiAnalysisTaskState> {
  const next = new Map(current)
  if (state.status === 'idle') next.delete(key)
  else next.set(key, state)
  return next
}

export function aiAnalysisTaskKey(scanId: string, candidateId?: string): string {
  return `${scanId}:${candidateId ?? 'terminal'}`
}

export function visibleAiAnalysisTasks(
  tasks: ReadonlyMap<string, AiAnalysisTaskState>,
  dismissed: ReadonlySet<string>
): Array<[string, AiAnalysisTaskState]> {
  return [...tasks]
    .filter(([key, task]) =>
      task.status === 'preparing' ||
      task.status === 'analyzing' ||
      (task.status === 'succeeded' && !dismissed.has(key))
    )
    .sort(([, left], [, right]) => {
      if (left.status === 'succeeded' && right.status === 'succeeded') {
        return right.completedAt - left.completedAt
      }
      if (left.status === 'succeeded') return -1
      if (right.status === 'succeeded') return 1
      return 0
    })
}

export function AiAnalysisTaskProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [tasks, setTasks] = useState<Map<string, AiAnalysisTaskState>>(() => new Map())
  const setTaskState = useCallback((key: string, state: AiAnalysisTaskState): void => {
    setTasks((current) => updateAiAnalysisTasks(current, key, state))
  }, [])
  const value = useMemo(() => ({ tasks, setTaskState }), [setTaskState, tasks])

  return (
    <AiAnalysisTasksContext.Provider value={value}>
      {children}
    </AiAnalysisTasksContext.Provider>
  )
}

export function useAiAnalysisTask(key: string): {
  state: AiAnalysisTaskState
  setState: (state: AiAnalysisTaskState) => void
} {
  const context = useContext(AiAnalysisTasksContext)
  if (!context) throw new Error('useAiAnalysisTask must be used inside AiAnalysisTaskProvider')
  const setState = useCallback(
    (state: AiAnalysisTaskState): void => context.setTaskState(key, state),
    [context, key]
  )
  return { state: context.tasks.get(key) ?? idleState, setState }
}

export function useAiAnalysisTasks(): ReadonlyMap<string, AiAnalysisTaskState> {
  const context = useContext(AiAnalysisTasksContext)
  if (!context) throw new Error('useAiAnalysisTasks must be used inside AiAnalysisTaskProvider')
  return context.tasks
}

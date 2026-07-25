import { randomUUID } from 'node:crypto'
import type { AiSuggestionRisk, AiTerminalAnalysis } from '../../shared/ai-types'
import { AiError } from './errors'

const forbiddenKeys = /^(?:execute|delete|path|command|shellCommand|script)$/i

function assertNoForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.test(key)) {
      throw new AiError('AI_INVALID_OUTPUT', '模型返回了不允许的操作字段')
    }
    assertNoForbiddenKeys(nested)
  }
}

function text(value: unknown, maxLength: number, fallback = ''): string {
  return (typeof value === 'string' ? value : fallback).trim().slice(0, maxLength)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function validateAnalysisOutput(
  raw: unknown,
  validEvidenceIds: ReadonlySet<string>,
  context: { requestId: string; providerId: string; model: string; candidate?: boolean }
): AiTerminalAnalysis {
  assertNoForbiddenKeys(raw)
  const root = record(raw)
  const summary = record(root.summary)
  const diagnosis = text(summary.diagnosis ?? root.summary, 1200)
  if (!diagnosis) throw new AiError('AI_INVALID_OUTPUT', '模型没有返回有效诊断')
  const priorityValue = summary.expectedPriority ?? root.priority
  const expectedPriority =
    priorityValue === 'low' || priorityValue === 'high' ? priorityValue : 'medium'
  const suggestionsValue = Array.isArray(root.suggestions)
    ? root.suggestions.slice(0, context.candidate ? 1 : 8)
    : []
  const suggestions = suggestionsValue
    .map((value) => {
      const suggestion = record(value)
      const actionValue = record(suggestion.action)
      const evidence = suggestion.evidenceFindingIds ?? suggestion.evidenceIds
      const evidenceFindingIds = Array.isArray(evidence)
        ? [...new Set(evidence.map(String).filter((id) => validEvidenceIds.has(id)))].slice(0, 8)
        : []
      const confidenceValue = Number(suggestion.confidence)
      const confidence = Number.isFinite(confidenceValue)
        ? Math.max(0, Math.min(1, confidenceValue))
        : 0.5
      const riskValue = suggestion.risk
      const risk: AiSuggestionRisk =
        riskValue === 'review' || riskValue === 'behavior-change' ? riskValue : 'informational'
      const kind: 'explain-only' | 'show-manual-steps' =
        !context.candidate && actionValue.kind === 'show-manual-steps'
          ? 'show-manual-steps'
          : 'explain-only'
      const steps = Array.isArray(actionValue.steps)
        ? actionValue.steps.map((step) => text(step, 500)).filter(Boolean).slice(0, 8)
        : undefined
      return {
        id: text(suggestion.id, 100) || randomUUID(),
        title: text(suggestion.title, 200),
        explanation: text(suggestion.explanation, 1600),
        evidenceFindingIds,
        confidence,
        risk,
        action: { kind, steps: kind === 'show-manual-steps' ? steps : undefined }
      }
    })
    .filter((suggestion) => suggestion.title && suggestion.explanation)

  const limitations = Array.isArray(root.limitations)
    ? root.limitations.map((item) => text(item, 500)).filter(Boolean).slice(0, context.candidate ? 1 : 8)
    : []

  return {
    schemaVersion: 1,
    requestId: context.requestId,
    generatedAt: new Date().toISOString(),
    provider: { id: context.providerId, model: context.model },
    summary: { diagnosis, expectedPriority },
    suggestions,
    limitations
  }
}

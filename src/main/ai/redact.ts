const REDACTION_VERSION = 'memento-redactor-v1'

const patterns: Array<{ type: string; expression: RegExp }> = [
  { type: 'private-key', expression: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi },
  { type: 'api-token', expression: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,})\b/g },
  { type: 'bearer-token', expression: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { type: 'credential-url', expression: /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/gi },
  { type: 'secret-value', expression: /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)\s*=\s*[^\s"']+/g }
]

export interface RedactionResult {
  value: string
  removedFieldCount: number
}

export function redactText(input: string): RedactionResult {
  let value = input
  let removedFieldCount = 0
  for (const pattern of patterns) {
    value = value.replace(pattern.expression, () => {
      removedFieldCount += 1
      return `[REDACTED:${pattern.type}]`
    })
  }

  value = value.replace(/\b[A-Za-z0-9+/=_-]{48,}\b/g, (candidate) => {
    const uniqueRatio = new Set(candidate).size / candidate.length
    if (uniqueRatio < 0.28) return candidate
    removedFieldCount += 1
    return '[REDACTED:high-entropy]'
  })
  return { value, removedFieldCount }
}

export function assertNoKnownSecret(input: string): void {
  const result = redactText(input)
  if (result.removedFieldCount > 0) {
    throw new Error('AI payload still contains secret-like content')
  }
}

export { REDACTION_VERSION }

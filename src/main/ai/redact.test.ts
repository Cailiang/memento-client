import { describe, expect, it } from 'vitest'
import { redactText } from './redact'

describe('redactText', () => {
  it('removes canary credentials without returning the original value', () => {
    const canary = ['gh', 'p_MementoCanarySecret123456789012345'].join('')
    const result = redactText(`Authorization: Bearer ${canary}\nGITHUB_TOKEN=${canary}`)
    expect(result.removedFieldCount).toBeGreaterThan(0)
    expect(result.value).not.toContain(canary)
    expect(result.value).toContain('[REDACTED:')
  })

  it('redacts credentials embedded in URLs', () => {
    const result = redactText('https://memento-user:super-secret@example.com/resource')
    expect(result.value).toBe('[REDACTED:credential-url]')
  })
})

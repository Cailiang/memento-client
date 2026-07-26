import { describe, expect, it } from 'vitest'
import { APPLICATION_UNUSED_DAYS, isApplicationUnused } from './scanner'

describe('application cleanup threshold', () => {
  const now = new Date('2026-07-26T00:00:00Z').getTime()

  it('includes applications unused for at least three months', () => {
    expect(APPLICATION_UNUSED_DAYS).toBe(90)
    expect(isApplicationUnused(new Date('2026-04-27T00:00:00Z'), now)).toBe(true)
  })

  it('keeps recent applications and unknown usage out of cleanup suggestions', () => {
    expect(isApplicationUnused(new Date('2026-04-28T00:00:00Z'), now)).toBe(false)
    expect(isApplicationUnused(null, now)).toBe(false)
  })
})

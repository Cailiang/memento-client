import { afterEach, describe, expect, it, vi } from 'vitest'
import { relativeDate } from './utils'

describe('relative application dates', () => {
  afterEach(() => vi.useRealTimers())

  it('uses compact day, week, month, and year units', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T00:00:00Z'))
    expect(relativeDate('2026-09-27T00:00:00Z', 'zh-CN')).toBe('2 天前')
    expect(relativeDate('2026-09-15T00:00:00Z', 'zh-CN')).toBe('2 周前')
    expect(relativeDate('2026-02-15T00:00:00Z', 'zh-CN')).toBe('7 个月前')
    expect(relativeDate('2024-09-29T00:00:00Z', 'zh-CN')).toBe('2 年前')
    expect(relativeDate('2026-02-15T00:00:00Z', 'en-US')).toBe('7 months ago')
  })
})

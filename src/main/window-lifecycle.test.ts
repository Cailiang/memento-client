import { describe, expect, it } from 'vitest'
import { shouldKeepWindowInTray } from './window-lifecycle'

describe('window lifecycle', () => {
  it('keeps an ordinary close in the tray when enabled', () => {
    expect(shouldKeepWindowInTray(false, true)).toBe(true)
  })

  it('allows updater shutdown to close the window even when tray mode is enabled', () => {
    expect(shouldKeepWindowInTray(true, true)).toBe(false)
  })
})

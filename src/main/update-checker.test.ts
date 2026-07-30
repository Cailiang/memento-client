import { describe, expect, it, vi } from 'vitest'
import { fetchUpdateState, isNewerVersion } from './update-checker'

describe('update checker', () => {
  it('compares normalized release versions', () => {
    expect(isNewerVersion('v0.6.31', '0.6.30')).toBe(true)
    expect(isNewerVersion('0.6.30', '0.6.30')).toBe(false)
    expect(isNewerVersion('0.6.29', '0.6.30')).toBe(false)
    expect(isNewerVersion('not-a-version', '0.6.30')).toBe(false)
  })

  it('accepts a valid stable GitHub release', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v0.7.0',
      html_url: 'https://github.com/Cailiang/memento-client/releases/tag/v0.7.0',
      draft: false,
      prerelease: false
    }), { status: 200 }))
    const state = await fetchUpdateState('0.6.31', fetchProvider)
    expect(state.updateAvailable).toBe(true)
    expect(state.latestVersion).toBe('0.7.0')
    expect(state.error).toBeNull()
  })

  it('does not expose an untrusted release URL', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v9.0.0',
      html_url: 'https://example.com/download',
      draft: false,
      prerelease: false
    }), { status: 200 }))
    const state = await fetchUpdateState('0.6.31', fetchProvider)
    expect(state.updateAvailable).toBe(false)
    expect(state.releaseUrl).toBeNull()
    expect(state.error).toContain('无效')
  })
})

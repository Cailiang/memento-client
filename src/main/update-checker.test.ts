import { describe, expect, it, vi } from 'vitest'
import {
  createUpdateState,
  fetchLatestReleaseVersion,
  isMissingUpdateManifestError,
  isNewerVersion,
  reduceUpdateState
} from './update-checker'

describe('update checker', () => {
  it('compares normalized release versions', () => {
    expect(isNewerVersion('v0.6.57', '0.6.56')).toBe(true)
    expect(isNewerVersion('0.6.56', '0.6.56')).toBe(false)
    expect(isNewerVersion('0.6.54', '0.6.56')).toBe(false)
    expect(isNewerVersion('not-a-version', '0.6.56')).toBe(false)
  })

  it('reads the latest stable release version before invoking the native updater', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'v0.6.54',
      draft: false,
      prerelease: false
    }), { status: 200 }))

    await expect(fetchLatestReleaseVersion('0.6.56', fetchProvider)).resolves.toBe('0.6.54')
    expect(fetchProvider).toHaveBeenCalledWith(
      'https://api.github.com/repos/Cailiang/memento-client/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'Memento/0.6.56' })
      })
    )
  })

  it('rejects invalid release metadata and recognizes missing updater manifests', async () => {
    const fetchProvider = vi.fn(async () => new Response(JSON.stringify({
      tag_name: 'next',
      draft: false,
      prerelease: false
    }), { status: 200 }))

    await expect(fetchLatestReleaseVersion('0.6.56', fetchProvider)).rejects.toThrow('invalid stable release metadata')
    expect(isMissingUpdateManifestError(new Error(
      'Cannot find latest-mac.yml in the latest release artifacts: HttpError: 404'
    ))).toBe(true)
    expect(isMissingUpdateManifestError(new Error(
      'Cannot find latest.yml in the latest release artifacts: HttpError: 404'
    ))).toBe(true)
    expect(isMissingUpdateManifestError(new Error('socket hang up'))).toBe(false)
  })

  it('tracks an available update through background download and installation', () => {
    let state = createUpdateState('0.6.54')
    state = reduceUpdateState(state, { type: 'checking' })
    state = reduceUpdateState(state, {
      type: 'available',
      version: '0.6.55',
      checkedAt: '2026-07-31T10:00:00.000Z'
    })
    state = reduceUpdateState(state, { type: 'progress', percent: 42.4 })
    expect(state).toMatchObject({
      phase: 'downloading',
      latestVersion: '0.6.55',
      updateAvailable: true,
      downloadPercent: 42,
      error: null
    })

    state = reduceUpdateState(state, { type: 'downloaded', version: '0.6.55' })
    expect(state.phase).toBe('downloaded')
    expect(state.downloadPercent).toBe(100)

    state = reduceUpdateState(state, { type: 'installing' })
    expect(state.phase).toBe('installing')
  })

  it('clamps invalid progress values', () => {
    const state = createUpdateState('0.6.54')
    expect(reduceUpdateState(state, { type: 'progress', percent: -4 }).downloadPercent).toBe(0)
    expect(reduceUpdateState(state, { type: 'progress', percent: 142 }).downloadPercent).toBe(100)
    expect(reduceUpdateState(state, { type: 'progress', percent: Number.NaN }).downloadPercent).toBe(0)
  })

  it('records up-to-date, unsupported, and error states', () => {
    const current = createUpdateState('0.6.54')
    const upToDate = reduceUpdateState(current, {
      type: 'not-available',
      version: '0.6.54',
      checkedAt: '2026-07-31T10:00:00.000Z'
    })
    expect(upToDate).toMatchObject({ phase: 'up-to-date', updateAvailable: false })

    const unsupported = reduceUpdateState(current, { type: 'unsupported' })
    expect(unsupported.phase).toBe('unsupported')

    const state = reduceUpdateState(current, {
      type: 'error',
      message: 'network unavailable',
      checkedAt: '2026-07-31T10:00:00.000Z'
    })
    expect(state.phase).toBe('error')
    expect(state.updateAvailable).toBe(false)
    expect(state.error).toBe('network unavailable')
  })
})

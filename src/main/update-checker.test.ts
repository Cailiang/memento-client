import { describe, expect, it } from 'vitest'
import { createUpdateState, reduceUpdateState } from './update-checker'

describe('update checker', () => {
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

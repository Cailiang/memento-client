import type { AppUpdateState } from '../shared/types'

export type AppUpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; checkedAt?: string }
  | { type: 'not-available'; version: string; checkedAt?: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'installing' }
  | { type: 'error'; message: string; checkedAt?: string }
  | { type: 'unsupported' }

export function createUpdateState(currentVersion: string): AppUpdateState {
  return {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    phase: 'idle',
    downloadPercent: null,
    checkedAt: null,
    error: null
  }
}

function boundedPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, Math.round(percent)))
}

export function reduceUpdateState(
  state: AppUpdateState,
  event: AppUpdateEvent
): AppUpdateState {
  switch (event.type) {
    case 'checking':
      return {
        ...state,
        phase: 'checking',
        downloadPercent: null,
        error: null
      }
    case 'available':
      return {
        ...state,
        latestVersion: event.version,
        updateAvailable: true,
        phase: 'available',
        downloadPercent: 0,
        checkedAt: event.checkedAt ?? new Date().toISOString(),
        error: null
      }
    case 'not-available':
      return {
        ...state,
        latestVersion: event.version,
        updateAvailable: false,
        phase: 'up-to-date',
        downloadPercent: null,
        checkedAt: event.checkedAt ?? new Date().toISOString(),
        error: null
      }
    case 'progress':
      return {
        ...state,
        updateAvailable: true,
        phase: 'downloading',
        downloadPercent: boundedPercent(event.percent),
        error: null
      }
    case 'downloaded':
      return {
        ...state,
        latestVersion: event.version,
        updateAvailable: true,
        phase: 'downloaded',
        downloadPercent: 100,
        error: null
      }
    case 'installing':
      return {
        ...state,
        phase: 'installing',
        error: null
      }
    case 'error':
      return {
        ...state,
        phase: 'error',
        downloadPercent: null,
        checkedAt: event.checkedAt ?? new Date().toISOString(),
        error: event.message
      }
    case 'unsupported':
      return {
        ...state,
        updateAvailable: false,
        phase: 'unsupported',
        downloadPercent: null,
        error: null
      }
  }
}

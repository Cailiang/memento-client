import type { AppUpdateState } from '../shared/types'

const LATEST_RELEASE_ENDPOINT = 'https://api.github.com/repos/Cailiang/memento-client/releases/latest'

interface GitHubRelease {
  tag_name?: unknown
  draft?: unknown
  prerelease?: unknown
}

type FetchProvider = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

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

function versionParts(value: string): number[] | null {
  const normalized = value.trim().replace(/^v/i, '').split('-')[0]
  if (!/^\d+(?:\.\d+){0,3}$/.test(normalized)) return null
  return normalized.split('.').map(Number)
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = versionParts(latest)
  const currentParts = versionParts(current)
  if (!latestParts || !currentParts) return false
  const length = Math.max(latestParts.length, currentParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

export function isMissingUpdateManifestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cannot find latest(?:-[^\s]*)?\.yml/i.test(message) ||
    (/latest(?:-(?:mac|linux|linux-arm64))?\.yml/i.test(message) && /\b404\b/.test(message))
}

export async function fetchLatestReleaseVersion(
  currentVersion: string,
  fetchProvider: FetchProvider = fetch,
  timeoutMs = 10_000
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchProvider(LATEST_RELEASE_ENDPOINT, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Memento/${currentVersion}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}`)
    const release = await response.json() as GitHubRelease
    const latestVersion = typeof release.tag_name === 'string'
      ? release.tag_name.trim().replace(/^v/i, '')
      : ''
    if (!versionParts(latestVersion) || release.draft === true || release.prerelease === true) {
      throw new Error('GitHub Releases returned invalid stable release metadata')
    }
    return latestVersion
  } finally {
    clearTimeout(timeout)
  }
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

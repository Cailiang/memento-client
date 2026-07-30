import type { AppUpdateState } from '../shared/types'

const LATEST_RELEASE_ENDPOINT = 'https://api.github.com/repos/Cailiang/memento-client/releases/latest'
const RELEASE_URL_PREFIX = 'https://github.com/Cailiang/memento-client/releases/'

interface GitHubRelease {
  tag_name?: unknown
  html_url?: unknown
  draft?: unknown
  prerelease?: unknown
}

type FetchProvider = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

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

function safeReleaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(RELEASE_URL_PREFIX)) return null
  return value
}

export async function fetchUpdateState(
  currentVersion: string,
  fetchProvider: FetchProvider = fetch,
  timeoutMs = 10_000
): Promise<AppUpdateState> {
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
    const releaseUrl = safeReleaseUrl(release.html_url)
    if (!latestVersion || !releaseUrl || release.draft === true || release.prerelease === true) {
      throw new Error('GitHub Releases 返回了无效的最新版本信息')
    }
    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      releaseUrl,
      checkedAt: new Date().toISOString(),
      error: null
    }
  } catch (error) {
    const message = controller.signal.aborted
      ? '检查更新超时，请稍后重试'
      : error instanceof Error ? error.message : '无法检查更新'
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt: new Date().toISOString(),
      error: message
    }
  } finally {
    clearTimeout(timeout)
  }
}

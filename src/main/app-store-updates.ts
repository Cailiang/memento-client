import type { ApplicationUpdateMode } from '../shared/types'

export interface StoreApplication {
  bundleId: string | null
  version: string
  appStoreReceipt: boolean
}

export interface StoreUpdate {
  source: 'mac-app-store'
  token: string
  latestVersion: string
  mode: ApplicationUpdateMode
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined
}

export function isApplicationVersionNewer(latest: string, current: string): boolean {
  const parts = (value: string): number[] => value.replace(/^v/i, '').match(/\d+/g)?.map(Number) ?? []
  const left = parts(latest)
  const right = parts(current)
  if (!left.length || !right.length) return false
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) > (right[index] ?? 0)
  }
  return false
}

export function appStoreUpdatesFromLookup(
  payload: unknown,
  applications: readonly StoreApplication[],
  canInstall: boolean,
  macOSVersion?: string
): Map<string, StoreUpdate> {
  const updates = new Map<string, StoreUpdate>()
  if (!payload || typeof payload !== 'object' || !('results' in payload) || !Array.isArray(payload.results)) return updates
  for (const item of payload.results) {
    if (recordValue(item, 'kind') !== 'mac-software') continue
    const bundleId = recordValue(item, 'bundleId')
    const version = recordValue(item, 'version')
    const trackId = recordValue(item, 'trackId')
    if (typeof bundleId !== 'string' || typeof version !== 'string' || !/^\d+(?:\.\d+)*$/.test(version)) continue
    if (typeof trackId !== 'number' || !Number.isSafeInteger(trackId) || trackId <= 0) continue
    const identity = bundleId.toLowerCase()
    const installed = applications.find((application) => application.appStoreReceipt && application.bundleId?.toLowerCase() === identity)
    if (!installed || !isApplicationVersionNewer(version, installed.version)) continue
    const minimumOsVersion = recordValue(item, 'minimumOsVersion')
    if (macOSVersion && typeof minimumOsVersion === 'string' && isApplicationVersionNewer(minimumOsVersion, macOSVersion)) continue
    updates.set(identity, {
      source: 'mac-app-store',
      token: String(trackId),
      latestVersion: version,
      mode: canInstall ? 'direct' : 'external'
    })
  }
  return updates
}

/** Query only receipt-backed apps, in batches; no names, paths, or usage history leave the machine. */
export async function lookupAppStoreUpdates(
  applications: readonly StoreApplication[],
  options: { country: string; canInstall: boolean; macOSVersion?: string; fetcher?: typeof fetch }
): Promise<Map<string, StoreUpdate>> {
  const eligible = applications.filter((application) => application.appStoreReceipt && application.bundleId)
  let missing = [...new Set(eligible.map((application) => application.bundleId!))]
  const updates = new Map<string, StoreUpdate>()
  const fetcher = options.fetcher ?? fetch
  // A small number of batched requests stays below Apple's lookup rate limit.
  const countries = [...new Set([options.country, options.country === 'cn' ? 'us' : 'cn'])]
  const deadline = AbortSignal.timeout(10_000)
  for (const country of countries) {
    const found = new Set<string>()
    for (let offset = 0; offset < missing.length; offset += 40) {
      const identities = missing.slice(offset, offset + 40)
      const url = new URL('https://itunes.apple.com/lookup')
      url.search = new URLSearchParams({ bundleId: identities.join(','), entity: 'macSoftware', country, limit: '200' }).toString()
      try {
        const response = await fetcher(url, { signal: deadline, headers: { accept: 'application/json' } })
        if (!response.ok) continue
        const payload: unknown = await response.json()
        for (const [id, update] of appStoreUpdatesFromLookup(payload, eligible, options.canInstall, options.macOSVersion)) updates.set(id, update)
        if (payload && typeof payload === 'object' && 'results' in payload && Array.isArray(payload.results)) {
          for (const item of payload.results) {
            const identity = recordValue(item, 'bundleId')
            if (recordValue(item, 'kind') === 'mac-software' && typeof identity === 'string') found.add(identity.toLowerCase())
          }
        }
      } catch {
        // An unavailable store must not prevent local application inventory from completing.
      }
      if (deadline.aborted) return updates
    }
    missing = missing.filter((identity) => !found.has(identity.toLowerCase()))
    if (!missing.length) break
  }
  return updates
}

export function appStoreUpdateUrl(token: string): string {
  if (!/^\d+$/.test(token)) throw new Error('Invalid App Store application ID')
  return `macappstore://itunes.apple.com/app/id${token}`
}

import { describe, expect, it, vi } from 'vitest'
import { appStoreUpdateUrl, appStoreUpdatesFromLookup, lookupAppStoreUpdates } from './app-store-updates'

const dingtalk = { bundleId: '5ZSL2CJU2T.com.dingtalk.mac', version: '8.3.5', appStoreReceipt: true }
const storeItem = { kind: 'mac-software', bundleId: dingtalk.bundleId, version: '9.0.1', trackId: 1435447041, minimumOsVersion: '11.0' }

describe('App Store update discovery without mas', () => {
  it('detects DingTalk 8.3.5 → 9.0.1 and opens App Store when no installer is available', () => {
    const updates = appStoreUpdatesFromLookup({ results: [storeItem] }, [dingtalk], false, '15.7')
    expect(updates.get(dingtalk.bundleId.toLowerCase())).toEqual({ source: 'mac-app-store', token: '1435447041', latestVersion: '9.0.1', mode: 'external' })
    expect(appStoreUpdateUrl('1435447041')).toBe('macappstore://itunes.apple.com/app/id1435447041')
    expect(() => appStoreUpdateUrl('1435447041?redirect=https://example.test')).toThrow()
  })

  it('marks updates as direct when mas can install them', () => {
    expect([...appStoreUpdatesFromLookup({ results: [storeItem] }, [dingtalk], true).values()][0]?.mode).toBe('direct')
  })

  it('rejects iOS versions, wrong identities, website editions, and incompatible releases', () => {
    for (const item of [
      { ...storeItem, kind: 'software' },
      { ...storeItem, bundleId: 'com.other.app' },
      { ...storeItem, trackId: 'invalid' },
      { ...storeItem, minimumOsVersion: '26.0' },
      { ...storeItem, version: '8.3.5' },
      { ...storeItem, version: '8.3.4' }
    ]) expect(appStoreUpdatesFromLookup({ results: [item] }, [dingtalk], false, '15.7').size).toBe(0)
    expect(appStoreUpdatesFromLookup({ results: [storeItem] }, [{ ...dingtalk, appStoreReceipt: false }], false).size).toBe(0)
    expect(appStoreUpdatesFromLookup(null, [dingtalk], false).size).toBe(0)
  })

  it('batches receipt-backed identities and falls back only for missing storefront entries', async () => {
    const second = { ...dingtalk, bundleId: 'com.example.other' }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [storeItem] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ ...storeItem, bundleId: second.bundleId, trackId: 123 }] })))
    const updates = await lookupAppStoreUpdates([dingtalk, second, { ...second, bundleId: 'com.private.app', appStoreReceipt: false }], { country: 'cn', canInstall: false, fetcher })
    expect(updates.size).toBe(2)
    const firstUrl = new URL(String(fetcher.mock.calls[0][0]))
    expect(firstUrl.origin).toBe('https://itunes.apple.com')
    expect(firstUrl.searchParams.get('bundleId')).toBe(`${dingtalk.bundleId},${second.bundleId}`)
    expect(firstUrl.searchParams.get('entity')).toBe('macSoftware')
    const fallbackUrl = new URL(String(fetcher.mock.calls[1][0]))
    expect(fallbackUrl.searchParams.get('country')).toBe('us')
    expect(fallbackUrl.searchParams.get('bundleId')).toBe(second.bundleId)
  })

  it('keeps inventory usable when lookup fails or there are no App Store applications', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    expect((await lookupAppStoreUpdates([], { country: 'cn', canInstall: false, fetcher })).size).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await lookupAppStoreUpdates([dingtalk], { country: 'cn', canInstall: false, fetcher })).size).toBe(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import {
  APPLICATION_UNUSED_DAYS,
  applicationPlistCapabilities,
  applicationNamePlistPaths,
  applicationScope,
  discoverSparkleUpdate,
  duckDuckGoReleaseUpdateFromPayload,
  homebrewCaskUpdatesFromJson,
  isApplicationUnused,
  parseApplicationLastUsedDate,
  plistApplicationName,
  selectApplicationUpdate,
  sparkleUpdateItemsFromFeed,
  sparkleVersionFromFeed
} from './scanner'

describe('application cleanup threshold', () => {
  const now = new Date('2026-07-26T00:00:00Z').getTime()

  it('includes applications unused for at least three months', () => {
    expect(APPLICATION_UNUSED_DAYS).toBe(90)
    expect(isApplicationUnused(new Date('2026-04-27T00:00:00Z'), now)).toBe(true)
  })

  it('keeps recent applications and unknown usage out of cleanup suggestions', () => {
    expect(isApplicationUnused(new Date('2026-04-28T00:00:00Z'), now)).toBe(false)
    expect(isApplicationUnused(null, now)).toBe(false)
  })

  it('uses Spotlight last-used metadata first and the app bundle mtime as Mole-compatible fallback', () => {
    const now = new Date('2026-09-29T00:00:00Z').getTime()
    const fallback = new Date('2026-02-01T00:00:00Z')
    expect(parseApplicationLastUsedDate('2026-08-20 12:00:00 +0000', fallback, now)?.toISOString())
      .toBe('2026-08-20T12:00:00.000Z')
    expect(parseApplicationLastUsedDate(null, fallback, now)).toBe(fallback)
    expect(parseApplicationLastUsedDate('(null)', fallback, now)).toBe(fallback)
    expect(parseApplicationLastUsedDate('not-a-date', fallback, now)).toBe(fallback)
    expect(parseApplicationLastUsedDate('2000-01-01 00:00:00 +0000', fallback, now)).toBe(fallback)
    expect(parseApplicationLastUsedDate('2027-01-01 00:00:00 +0000', fallback, now)).toBe(fallback)
  })

  it('classifies user, shared, and protected system application roots', () => {
    expect(applicationScope(path.join(os.homedir(), 'Applications', 'Example.app'))).toBe('user')
    expect(applicationScope('/Applications/Example.app')).toBe('shared')
    expect(applicationScope('/System/Applications/Safari.app')).toBe('system')
  })

  it('prefers official Simplified Chinese bundle-name resources', () => {
    const target = '/Applications/Lark.app'
    expect(applicationNamePlistPaths(target, 'zh-CN')).toEqual([
      path.join(target, 'Contents', 'Resources', 'zh-Hans.lproj', 'InfoPlist.strings'),
      path.join(target, 'Contents', 'Resources', 'zh_CN.lproj', 'InfoPlist.strings'),
      path.join(target, 'Contents', 'Resources', 'zh.lproj', 'InfoPlist.strings'),
      path.join(target, 'Contents', 'Resources', 'InfoPlist.strings'),
      path.join(target, 'Contents', 'Info.plist')
    ])
    expect(plistApplicationName({ CFBundleDisplayName: '飞书', CFBundleName: 'Lark' })).toBe('飞书')
  })

  it('falls back from unresolved display names to the official bundle name', () => {
    expect(plistApplicationName({ CFBundleDisplayName: '$(PRODUCT_NAME)', CFBundleName: 'Visual Studio Code' }))
      .toBe('Visual Studio Code')
    expect(plistApplicationName({ CFBundleName: '' })).toBeNull()
  })

  it('extracts background helper and URL-handler capabilities for Agent analysis', () => {
    expect(applicationPlistCapabilities({
      CFBundleExecutable: 'claude',
      LSBackgroundOnly: true,
      CFBundleURLTypes: [{ CFBundleURLSchemes: ['claude-cli', 'claude-cli'] }]
    })).toEqual({
      backgroundOnly: true,
      executable: 'claude',
      urlSchemes: ['claude-cli'],
      sparkleFeedUrl: null
    })
  })

  it('selects the newest Sparkle appcast version', () => {
    expect(sparkleVersionFromFeed(`<?xml version="1.0"?><rss><channel>
      <item><sparkle:version>4.2.0</sparkle:version></item>
      <item sparkle:shortVersionString="4.4.0"></item>
    </channel></rss>`)).toBe('4.4.0')
  })

  it('extracts Sparkle package URLs from enclosure metadata', () => {
    expect(sparkleUpdateItemsFromFeed(`<rss><channel><item>
      <enclosure url="https://updates.example.test/Memento%204.5.0.dmg" sparkle:shortVersionString="4.5.0" />
    </item></channel></rss>`)).toEqual([{
      version: '4.5.0',
      downloadUrl: 'https://updates.example.test/Memento%204.5.0.dmg'
    }])
  })

  it('uses Sparkle marketing versions while retaining DuckDuckGo build numbers for comparison', () => {
    expect(sparkleUpdateItemsFromFeed(`<rss><channel><item>
      <sparkle:shortVersionString>1.210.0</sparkle:shortVersionString>
      <sparkle:version>821</sparkle:version>
    </item></channel></rss>`)).toEqual([{ version: '1.210.0', downloadUrl: null }])
  })

  it('falls back to DuckDuckGo GitHub releases when its appcast CDN is unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('appcast timeout'))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { tag_name: '1.210.0-821+macos', draft: false },
        { tag_name: '7.240.0-6+ios', draft: false }
      ])))
    const update = await discoverSparkleUpdate({
      bundleId: 'com.duckduckgo.mobile.ios',
      sparkleFeedUrl: 'https://staticcdn.duckduckgo.com/macos-desktop-browser/appcast2.xml',
      version: '1.186.1',
      buildVersion: '680'
    }, fetcher)
    expect(update).toEqual({
      source: 'sparkle',
      token: 'https://staticcdn.duckduckgo.com/macos-desktop-browser/appcast2.xml',
      latestVersion: '1.210.0',
      mode: 'external'
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not report a DuckDuckGo release older than the installed marketing/build version', () => {
    expect(duckDuckGoReleaseUpdateFromPayload([
      { tag_name: '1.210.0-819+macos', draft: false }
    ], '1.210.0', '820', 'https://updates.example.test/appcast.xml')).toBeNull()
  })

  it('uses a Sparkle feed when a receipt-backed app has no valid macOS App Store update', () => {
    const sparkle = {
      source: 'sparkle' as const,
      token: 'https://updates.example.test/appcast.xml',
      latestVersion: '1.209.0',
      mode: 'external' as const
    }
    const macAppStore = {
      source: 'mac-app-store' as const,
      token: '663592361',
      latestVersion: '1.210.0',
      mode: 'external' as const
    }
    expect(selectApplicationUpdate(undefined, null, sparkle)).toEqual(sparkle)
    expect(selectApplicationUpdate(undefined, macAppStore, sparkle)).toEqual(macAppStore)
  })

  it('parses current and legacy Homebrew cask update fields and ignores pinned entries', () => {
    expect(homebrewCaskUpdatesFromJson({ casks: [
      { name: 'dingtalk', installed_versions: ['8.3.5'], current_version: '9.0.1' },
      { token: 'legacy-app', version: '2.0.0' },
      { name: 'pinned-app', current_version: '9.0.0', pinned: true },
      { name: 'invalid token with spaces', current_version: '9.0.0' }
    ] })).toEqual([
      { token: 'dingtalk', name: 'dingtalk', latestVersion: '9.0.1' },
      { token: 'legacy-app', name: 'legacy-app', latestVersion: '2.0.0' }
    ])
  })
})

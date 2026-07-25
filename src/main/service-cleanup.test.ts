import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildBundleDataCandidates,
  findContainingAppBundle,
  isAllowedServiceCleanupTarget
} from './service-cleanup'

const home = '/Users/test'

describe('service cleanup target discovery', () => {
  it('finds the containing application from a launch-agent executable', () => {
    expect(
      findContainingAppBundle('/Applications/SunloginClient.app/Contents/MacOS/SunloginClient')
    ).toBe('/Applications/SunloginClient.app')
    expect(findContainingAppBundle('/opt/vendor/bin/helper')).toBeNull()
    expect(findContainingAppBundle('relative/Example.app/Contents/MacOS/helper')).toBeNull()
  })

  it('builds exact Bundle ID data candidates and rejects unsafe identifiers', () => {
    expect(buildBundleDataCandidates(home, 'com.example.Editor')).toContain(
      path.join(home, 'Library', 'Preferences', 'com.example.Editor.plist')
    )
    expect(buildBundleDataCandidates(home, '../Preferences')).toEqual([])
  })

  it('allows only application, user data, and user LaunchAgent targets', () => {
    expect(isAllowedServiceCleanupTarget('/Applications/Example.app', home)).toBe(true)
    expect(
      isAllowedServiceCleanupTarget(
        path.join(home, 'Library', 'Containers', 'com.example.Editor'),
        home
      )
    ).toBe(true)
    expect(
      isAllowedServiceCleanupTarget(
        path.join(home, 'Library', 'LaunchAgents', 'com.example.Editor.plist'),
        home
      )
    ).toBe(true)
    expect(
      isAllowedServiceCleanupTarget('/Library/LaunchAgents/com.example.Editor.plist', home)
    ).toBe(true)
    expect(isAllowedServiceCleanupTarget('/Library/LaunchDaemons/com.example.root.plist', home)).toBe(
      false
    )
    expect(isAllowedServiceCleanupTarget(path.join(home, 'Documents'), home)).toBe(false)
  })
})

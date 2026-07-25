import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildBundleDataCandidates,
  findContainingAppBundle,
  findHomebrewPackageRoot,
  findOwnedServiceDataRoot,
  findServiceLocation,
  findUserServiceDirectory,
  isAllowedServiceCleanupTarget,
  isAllowedUserSelectedServiceDirectory
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

  it('uses an exact service working directory only when it owns the executable', () => {
    const dataRoot = path.join(home, 'Library', 'Application Support', 'ShadowsocksX-NG')
    expect(
      findOwnedServiceDataRoot(home, path.join(dataRoot, 'ss-local', 'ss-local'), `${dataRoot}/`)
    ).toBe(dataRoot)
    expect(findOwnedServiceDataRoot(home, '/usr/local/bin/helper', dataRoot)).toBeNull()
    expect(
      findOwnedServiceDataRoot(
        home,
        path.join(home, 'Documents', 'helper'),
        path.join(home, 'Documents')
      )
    ).toBeNull()
  })

  it('allows an explicitly selected project directory without allowing broad user roots', () => {
    expect(
      isAllowedUserSelectedServiceDirectory(path.join(home, 'src', 'ExampleService'), home)
    ).toBe(true)
    expect(
      isAllowedUserSelectedServiceDirectory(path.join(home, 'Documents', 'ExampleService'), home)
    ).toBe(true)
    expect(isAllowedUserSelectedServiceDirectory(path.join(home, 'Documents'), home)).toBe(false)
    expect(isAllowedUserSelectedServiceDirectory(path.join(home, 'Library', 'Caches'), home)).toBe(false)
    expect(isAllowedUserSelectedServiceDirectory(home, home)).toBe(false)
    expect(isAllowedUserSelectedServiceDirectory('/Users/other/ExampleService', home)).toBe(false)
  })

  it('uses a specific executable directory instead of a broad working directory', () => {
    const pinecms = path.join(home, 'src', 'go', 'apps', 'cms', 'pinecms', 'pinecms')
    expect(findUserServiceDirectory(home, pinecms, '/usr/local/var')).toBe(
      path.dirname(pinecms)
    )
    expect(findServiceLocation(home, pinecms, '/usr/local/var', null)).toBe(
      path.dirname(pinecms)
    )
  })

  it('shows the Homebrew formula directory for Homebrew executables', () => {
    const program = '/usr/local/opt/php@7.4/sbin/php-fpm'
    expect(findHomebrewPackageRoot(program)).toBe('/usr/local/opt/php@7.4')
    expect(findServiceLocation(home, program, '/usr/local/var', null)).toBe(
      '/usr/local/opt/php@7.4'
    )
  })

  it('keeps an explicit user project working directory for an external interpreter', () => {
    const project = path.join(home, 'src', 'ExampleService')
    expect(findUserServiceDirectory(home, '/usr/bin/python3', project)).toBe(project)
    expect(findServiceLocation(home, '/usr/bin/python3', project, null)).toBe(project)
  })

  it('does not present broad system folders as a service location', () => {
    expect(findServiceLocation(home, '/usr/local/var/pinecms', '/usr/local/var', null)).toBeNull()
    expect(findServiceLocation(home, '/usr/bin/python3', '/usr/local/var', null)).toBeNull()
    expect(findServiceLocation(home, '/opt/homebrew/bin/helper', '/opt/homebrew/var', null)).toBeNull()
    expect(findServiceLocation(home, '/Library/Frameworks/helper', null, null)).toBeNull()
  })
})

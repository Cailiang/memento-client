import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import {
  APPLICATION_UNUSED_DAYS,
  applicationPlistCapabilities,
  applicationNamePlistPaths,
  applicationScope,
  isApplicationUnused,
  plistApplicationName
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
      urlSchemes: ['claude-cli']
    })
  })
})

import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cleanupCategoryForTarget,
  cleanupRuleForTarget,
  dynamicCleanupTargetKind,
  isAllowedCleanupTarget,
  resolveCleanupRules
} from './cleanup-rules'

const home = '/Users/test'

describe('cleanup rule registry', () => {
  it('resolves deterministic rule targets and their presentation category', () => {
    const rules = resolveCleanupRules(home)
    const xcode = path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData')
    const safari = path.join(home, 'Library', 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Caches')

    expect(rules.length).toBeGreaterThan(20)
    expect(cleanupRuleForTarget(xcode, home)).toMatchObject({
      id: 'xcode-derived-data',
      category: 'developer'
    })
    expect(cleanupCategoryForTarget(safari, home)).toBe('browsers')
    expect(isAllowedCleanupTarget(safari, home)).toBe(true)
  })

  it('keeps protected rule targets and arbitrary application data outside execution', () => {
    expect(isAllowedCleanupTarget(
      path.join(home, 'Library', 'Developer', 'Xcode', 'Archives'),
      home
    )).toBe(false)
    expect(isAllowedCleanupTarget(
      path.join(home, 'Library', 'Application Support', 'Example', 'Documents'),
      home
    )).toBe(false)
    expect(isAllowedCleanupTarget(path.join(home, 'Library', 'Containers'), home)).toBe(false)
  })

  it('accepts only narrow third-party sandbox and group cache structures', () => {
    const sandboxCache = path.join(home, 'Library', 'Containers', 'com.example.Editor', 'Data', 'Library', 'Caches')
    const sandboxTemp = path.join(home, 'Library', 'Containers', 'com.example.Editor', 'Data', 'tmp')
    const sandboxDocuments = path.join(home, 'Library', 'Containers', 'com.example.Editor', 'Data', 'Documents')
    const groupCache = path.join(home, 'Library', 'Group Containers', 'TEAMID.com.example.Editor', 'Library', 'Caches')

    expect(dynamicCleanupTargetKind(sandboxCache, home)).toBe('sandbox-cache')
    expect(dynamicCleanupTargetKind(sandboxTemp, home)).toBe('sandbox-cache')
    expect(dynamicCleanupTargetKind(groupCache, home)).toBe('group-cache')
    expect(dynamicCleanupTargetKind(sandboxDocuments, home)).toBeNull()
  })

  it('protects Apple and credential-related dynamic containers', () => {
    expect(dynamicCleanupTargetKind(
      path.join(home, 'Library', 'Containers', 'com.apple.mail', 'Data', 'Library', 'Caches'),
      home
    )).toBeNull()
    expect(dynamicCleanupTargetKind(
      path.join(home, 'Library', 'Group Containers', 'TEAMID.com.1password.shared', 'Library', 'Caches'),
      home
    )).toBeNull()
    expect(dynamicCleanupTargetKind(
      path.join(home, 'Library', 'Containers', 'com.example\ncache', 'Data', 'tmp'),
      home
    )).toBeNull()
  })
})

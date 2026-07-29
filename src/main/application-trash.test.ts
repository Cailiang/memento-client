import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applicationTrashDestination,
  isAllowedApplicationTrashTarget,
  isPermissionError
} from './application-trash'

describe('application trash fallback', () => {
  it('allows only application bundles outside nested or protected system apps', () => {
    const home = '/Users/test'
    expect(isAllowedApplicationTrashTarget('/Applications/Example.app', home)).toBe(true)
    expect(isAllowedApplicationTrashTarget('/Applications/Tools/Example.app', home)).toBe(true)
    expect(isAllowedApplicationTrashTarget('/Users/test/Applications/Example.app', home)).toBe(true)
    expect(isAllowedApplicationTrashTarget('/System/Applications/Safari.app', home)).toBe(false)
    expect(isAllowedApplicationTrashTarget('/Applications/Xcode.app/Contents/Helper.app', home)).toBe(false)
    expect(isAllowedApplicationTrashTarget('/Applications/Example', home)).toBe(false)
  })

  it('uses a Finder-style numbered name when Trash already contains the app', () => {
    const occupied = new Set(['/Users/test/.Trash/Example.app'])
    expect(applicationTrashDestination(
      '/Applications/Example.app',
      '/Users/test/.Trash',
      (target) => occupied.has(target)
    )).toBe('/Users/test/.Trash/Example 2.app')
  })

  it('recognizes only filesystem permission failures as admin fallback candidates', () => {
    expect(isPermissionError(Object.assign(new Error('denied'), { code: 'EPERM' }))).toBe(true)
    expect(isPermissionError(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(true)
    expect(isPermissionError(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(false)
  })

  it('uses the current macOS home shape without allowing the Trash directory itself', () => {
    const home = os.homedir()
    expect(isAllowedApplicationTrashTarget(path.join(home, 'Applications', 'Example.app'), home)).toBe(true)
    expect(isAllowedApplicationTrashTarget(path.join(home, '.Trash', 'Example.app'), home)).toBe(false)
  })
})

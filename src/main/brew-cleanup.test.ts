import { describe, expect, it } from 'vitest'
import { brewCleanupVersionTargets, isSafeBrewVersion } from './brew-cleanup'

describe('Homebrew cleanup dry-run parsing', () => {
  const formulaRoot = '/usr/local/Cellar/openexr'
  const versions = ['3.3.2', '3.3.5_1', '3.4.4_1']

  it('returns only installed keg directories Homebrew says it will remove', () => {
    const output = [
      'Would remove: /usr/local/Cellar/openexr/3.3.2 (210 files, 5.8MB)',
      'Would remove: /usr/local/Cellar/openexr/3.3.5_1 (210 files, 4.4MB)',
      'Would remove: /Users/test/Library/Caches/Homebrew/openexr--3.3.2.tar.gz (12MB)'
    ].join('\n')

    expect(brewCleanupVersionTargets(output, formulaRoot, versions)).toEqual([
      '3.3.2',
      '3.3.5_1'
    ])
  })

  it('returns no versions when Homebrew skips an outdated formula', () => {
    const output = 'Warning: Skipping openexr: most recent version 3.4.13_1 not installed'
    expect(brewCleanupVersionTargets(output, formulaRoot, versions)).toEqual([])
  })

  it('does not match similarly prefixed versions or paths outside the formula', () => {
    const output = [
      'Would remove: /usr/local/Cellar/openexr/3.3.20 (210 files, 5.8MB)',
      'Would remove: /tmp/openexr/3.3.2 (210 files, 5.8MB)'
    ].join('\n')
    expect(brewCleanupVersionTargets(output, formulaRoot, versions)).toEqual([])
  })
})

describe('Homebrew keg version validation', () => {
  it('accepts version directory names and rejects path traversal', () => {
    expect(isSafeBrewVersion('3.4.4_1')).toBe(true)
    expect(isSafeBrewVersion('../openexr')).toBe(false)
    expect(isSafeBrewVersion('3.4/4')).toBe(false)
    expect(isSafeBrewVersion('')).toBe(false)
  })
})

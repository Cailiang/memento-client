import { describe, expect, it } from 'vitest'
import {
  parseDiskFree,
  parseDuKilobytes,
  parseLaunchctlEntries,
  parseLaunchctlLabels,
  parseMetadataValue
} from './parsers'

describe('macOS command parsers', () => {
  it('reads total and available bytes from df output', () => {
    const output = [
      'Filesystem 1024-blocks Used Available Capacity Mounted on',
      '/dev/disk3s1s1 482797652 22118400 198557320 11% /'
    ].join('\n')
    expect(parseDiskFree(output)).toEqual({
      totalBytes: 482797652 * 1024,
      freeBytes: 198557320 * 1024
    })
  })

  it('reads du output containing a path with spaces', () => {
    expect(parseDuKilobytes('1536\t/Users/test/Library/Application Support')).toBe(1536 * 1024)
  })

  it('handles quoted and null Spotlight metadata', () => {
    const output = [
      'kMDItemCFBundleIdentifier = "com.example.Editor"',
      'kMDItemLastUsedDate = (null)',
      'kMDItemVersion = "2.14.3"'
    ].join('\n')
    expect(parseMetadataValue(output, 'kMDItemCFBundleIdentifier')).toBe('com.example.Editor')
    expect(parseMetadataValue(output, 'kMDItemLastUsedDate')).toBeNull()
    expect(parseMetadataValue(output, 'kMDItemVersion')).toBe('2.14.3')
  })

  it('extracts loaded labels from launchctl list', () => {
    const output = ['PID Status Label', '214 0 homebrew.mxcl.redis', '- 0 com.example.agent'].join(
      '\n'
    )
    expect([...parseLaunchctlLabels(output)]).toEqual([
      'homebrew.mxcl.redis',
      'com.example.agent'
    ])
    expect([...parseLaunchctlEntries(output)]).toEqual([
      ['homebrew.mxcl.redis', 214],
      ['com.example.agent', null]
    ])
  })
})

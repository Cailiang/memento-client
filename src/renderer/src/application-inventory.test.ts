import { describe, expect, it } from 'vitest'
import type { InstalledApplication } from '../../shared/types'
import { filterAndSortApplications } from './App'

function application(
  name: string,
  overrides: Partial<InstalledApplication> = {}
): InstalledApplication {
  return {
    id: name,
    name,
    version: '1.0',
    bundleId: `com.example.${name.toLowerCase()}`,
    location: `/Applications/${name}.app`,
    sizeBytes: 100,
    lastUsedAt: '2026-07-20T00:00:00.000Z',
    scope: 'shared',
    unused: false,
    action: {
      id: `remove-${name}`,
      kind: 'trash',
      label: 'Uninstall',
      consequence: 'Moves to Trash',
      reversible: true
    },
    ...overrides
  }
}

describe('application inventory controls', () => {
  const applications = [
    application('Recent', { lastUsedAt: '2026-07-25T00:00:00.000Z', sizeBytes: 200 }),
    application('Old', { lastUsedAt: '2025-01-01T00:00:00.000Z', unused: true, sizeBytes: 500 }),
    application('Unknown', { lastUsedAt: null, action: undefined }),
    application('Safari', {
      bundleId: 'com.apple.Safari',
      location: '/System/Applications/Safari.app',
      scope: 'system',
      action: undefined,
      protectedReason: 'macOS system application'
    })
  ]

  it('searches application identity and location', () => {
    expect(filterAndSortApplications(applications, 'apple.safari', 'all', 'name').map((item) => item.name))
      .toEqual(['Safari'])
    expect(filterAndSortApplications(applications, '/Applications/Old', 'all', 'name').map((item) => item.name))
      .toEqual(['Old'])
  })

  it('filters removable, unused, and system applications without treating unknown dates as unused', () => {
    expect(filterAndSortApplications(applications, '', 'removable', 'name').map((item) => item.name))
      .toEqual(['Old', 'Recent'])
    expect(filterAndSortApplications(applications, '', 'unused', 'name').map((item) => item.name))
      .toEqual(['Old'])
    expect(filterAndSortApplications(applications, '', 'system', 'name').map((item) => item.name))
      .toEqual(['Safari'])
  })

  it('sorts by oldest usage and keeps unknown dates at the end', () => {
    expect(filterAndSortApplications(applications, '', 'all', 'last-used-oldest').map((item) => item.name))
      .toEqual(['Old', 'Safari', 'Recent', 'Unknown'])
    expect(filterAndSortApplications(applications, '', 'all', 'size').map((item) => item.name))
      .toEqual(['Old', 'Recent', 'Unknown', 'Safari'])
  })
})

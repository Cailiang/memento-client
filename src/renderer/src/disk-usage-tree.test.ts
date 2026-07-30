import { describe, expect, it } from 'vitest'
import type { DiskUsageNode, DiskUsageScanResult } from '../../shared/types'
import { withoutDiskUsageNode } from './disk-usage-tree'

function node(
  id: string,
  children: DiskUsageNode[] = [],
  childCount = children.length
): DiskUsageNode {
  return {
    id,
    name: id,
    location: `/${id}`,
    sizeBytes: 100,
    kind: 'directory',
    childCount,
    omittedChildCount: Math.max(0, childCount - children.length),
    omittedSizeBytes: 0,
    children
  }
}

function scan(root: DiskUsageNode): DiskUsageScanResult {
  return {
    scanId: 'scan-one',
    root,
    scannedEntries: 8,
    retainedEntries: 8,
    inaccessibleEntries: 0,
    minimumDisplayBytes: 5,
    startedAt: '2026-07-30T00:00:00.000Z',
    completedAt: '2026-07-30T00:01:00.000Z'
  }
}

describe('disk usage tree updates', () => {
  it('removes a nested visible node without mutating the scanned tree', () => {
    const report = node('anyconnect')
    const diagnostics = node('DiagnosticReports', [report], 3)
    const original = scan(node('root', [node('Library', [diagnostics])]))

    const updated = withoutDiskUsageNode(original, report.id)

    expect(updated).not.toBe(original)
    expect(updated.root.children[0].children[0]).toMatchObject({
      id: 'DiagnosticReports',
      childCount: 2,
      children: []
    })
    expect(original.root.children[0].children[0].children).toEqual([report])
  })

  it('keeps the original result for unknown or protected root IDs', () => {
    const original = scan(node('root', [node('Library')]))

    expect(withoutDiskUsageNode(original, 'missing')).toBe(original)
    expect(withoutDiskUsageNode(original, 'root')).toBe(original)
  })
})

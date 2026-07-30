import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDiskUsageTree,
  DiskUsageScanner,
  parseDiskUsageLine
} from './disk-usage-scanner'

describe('disk usage scanner', () => {
  it('keeps only meaningful entries inside the selected volume', () => {
    expect(parseDiskUsageLine('8192\t/volume/Users/fangcl/.codex', '/volume'))
      .toMatchObject({ target: '/volume/Users/fangcl/.codex', sizeBytes: 8 * 1024 * 1024 })
    expect(parseDiskUsageLine('1024\t/volume/Users/fangcl/small', '/volume')).toBeNull()
    expect(parseDiskUsageLine('8192\t/private/outside', '/volume')).toBeNull()
    expect(parseDiskUsageLine('not-a-size\t/volume/Users', '/volume')).toBeNull()
  })

  it('builds a descending hierarchy and registers only visible nodes', () => {
    const { root, targets } = buildDiskUsageTree([
      { target: '/volume', sizeBytes: 100, kind: 'directory' },
      { target: '/volume/Users', sizeBytes: 80, kind: 'directory' },
      { target: '/volume/Applications', sizeBytes: 20, kind: 'directory' },
      { target: '/volume/Users/fangcl', sizeBytes: 75, kind: 'directory' },
      { target: '/volume/Users/fangcl/archive.dmg', sizeBytes: 40, kind: 'file' }
    ], '/volume', 'Macintosh HD')

    expect(root).toMatchObject({ name: 'Macintosh HD', location: '/', childCount: 2 })
    expect(root.children.map((node) => node.name)).toEqual(['Users', 'Applications'])
    expect(root.children[0].children[0].children[0]).toMatchObject({
      name: 'archive.dmg',
      location: '/Users/fangcl/archive.dmg',
      kind: 'file'
    })
    expect(targets.get(root.children[0].children[0].children[0].id))
      .toBe('/volume/Users/fangcl/archive.dmg')
  })

  it('caps unusually wide folders and reports the omitted aggregate', () => {
    const children = Array.from({ length: 205 }, (_, index) => ({
      target: `/volume/item-${index}`,
      sizeBytes: 1_000 - index,
      kind: 'file' as const
    }))
    const { root, targets } = buildDiskUsageTree([
      { target: '/volume', sizeBytes: 200_000, kind: 'directory' },
      ...children
    ], '/volume', 'Disk')

    expect(root.children).toHaveLength(200)
    expect(root.childCount).toBe(205)
    expect(root.omittedChildCount).toBe(5)
    expect(root.omittedSizeBytes).toBe(800 + 799 + 798 + 797 + 796)
    expect(targets.size).toBe(201)
  })

  it('scans a real directory asynchronously with the system disk utility', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-disk-usage-'))
    try {
      const directory = path.join(root, 'Downloads')
      const largeFile = path.join(directory, 'archive.dmg')
      await fs.mkdir(directory)
      await fs.writeFile(largeFile, Buffer.alloc(6 * 1024 * 1024))
      const progress: number[] = []

      const bundle = await new DiskUsageScanner().scan('en-US', (event) => {
        progress.push(event.scannedEntries)
      }, root)

      expect(bundle.result.scannedEntries).toBeGreaterThan(0)
      expect(bundle.result.root.children[0]).toMatchObject({ name: 'Downloads' })
      expect(bundle.result.root.children[0].children[0]).toMatchObject({
        name: 'archive.dmg',
        kind: 'file'
      })
      expect(progress.length).toBeGreaterThan(0)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

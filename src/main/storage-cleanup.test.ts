import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteStorageTarget, isAllowedStorageCleanupTarget } from './storage-cleanup'

describe('storage cleanup', () => {
  it('permanently removes a scanned application cache', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-'))
    try {
      const target = path.join(home, 'Library', 'Caches', 'com.example.cache')
      await fs.mkdir(target, { recursive: true })
      await fs.writeFile(path.join(target, 'cache.bin'), 'cache')

      expect(isAllowedStorageCleanupTarget(target, home)).toBe(true)
      await deleteStorageTarget(target, home)
      await expect(fs.lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('rejects broad directories and symbolic links', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-'))
    try {
      const cacheRoot = path.join(home, 'Library', 'Caches')
      const target = path.join(cacheRoot, 'linked-cache')
      await fs.mkdir(cacheRoot, { recursive: true })
      await fs.symlink(os.tmpdir(), target)

      expect(isAllowedStorageCleanupTarget(cacheRoot, home)).toBe(false)
      await expect(deleteStorageTarget(target, home)).rejects.toThrow('Symbolic links')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('rejects targets reached through a linked parent directory', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-home-'))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-outside-'))
    try {
      const outsideCache = path.join(outside, 'Caches', 'com.example.cache')
      await fs.mkdir(outsideCache, { recursive: true })
      await fs.writeFile(path.join(outsideCache, 'cache.bin'), 'preserved')
      await fs.symlink(outside, path.join(home, 'Library'))
      const linkedTarget = path.join(home, 'Library', 'Caches', 'com.example.cache')

      expect(isAllowedStorageCleanupTarget(linkedTarget, home)).toBe(true)
      await expect(deleteStorageTarget(linkedTarget, home)).rejects.toThrow(
        'resolved storage target'
      )
      expect(await fs.readFile(path.join(outsideCache, 'cache.bin'), 'utf8')).toBe('preserved')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

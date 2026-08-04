import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deleteStorageTarget,
  deleteStorageTargets,
  isAllowedStorageCleanupTarget
} from './storage-cleanup'

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

  it('removes only the allowlisted cache folders in an AI client group', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-ai-'))
    try {
      const cache = path.join(home, 'Library', 'Application Support', 'Claude', 'Cache')
      const settings = path.join(home, 'Library', 'Application Support', 'Claude', 'config.json')
      await fs.mkdir(cache, { recursive: true })
      await fs.writeFile(path.join(cache, 'cache.bin'), 'cache')
      await fs.writeFile(settings, 'settings')

      expect(isAllowedStorageCleanupTarget(cache, home)).toBe(true)
      await deleteStorageTargets([cache], home)
      await expect(fs.lstat(cache)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(fs.readFile(settings, 'utf8')).resolves.toBe('settings')
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
        'Symbolic links in storage target ancestors'
      )
      expect(await fs.readFile(path.join(outsideCache, 'cache.bin'), 'utf8')).toBe('preserved')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('removes only a validated sandbox cache and preserves sibling app data', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-storage-container-'))
    try {
      const data = path.join(home, 'Library', 'Containers', 'com.example.Editor', 'Data')
      const cache = path.join(data, 'Library', 'Caches')
      const document = path.join(data, 'Documents', 'draft.txt')
      await fs.mkdir(cache, { recursive: true })
      await fs.mkdir(path.dirname(document), { recursive: true })
      await fs.writeFile(path.join(cache, 'cache.bin'), 'cache')
      await fs.writeFile(document, 'preserved')

      expect(isAllowedStorageCleanupTarget(cache, home)).toBe(true)
      expect(isAllowedStorageCleanupTarget(data, home)).toBe(false)
      await deleteStorageTarget(cache, home)

      await expect(fs.lstat(cache)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(fs.readFile(document, 'utf8')).resolves.toBe('preserved')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('rejects protected Apple and credential container caches', () => {
    const apple = path.join('/Users/test', 'Library', 'Containers', 'com.apple.mail', 'Data', 'Library', 'Caches')
    const credentials = path.join('/Users/test', 'Library', 'Group Containers', 'TEAMID.com.1password.shared', 'Library', 'Caches')

    expect(isAllowedStorageCleanupTarget(apple, '/Users/test')).toBe(false)
    expect(isAllowedStorageCleanupTarget(credentials, '/Users/test')).toBe(false)
  })
})

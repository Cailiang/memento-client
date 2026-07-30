import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  isAllowedLargeFileCleanupTarget,
  validateLargeFileCleanupTarget
} from './large-file-cleanup'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { recursive: true, force: true })
  )))
})

describe('large-file cleanup validation', () => {
  it('accepts an unchanged regular file under Downloads', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-large-file-'))
    temporaryDirectories.push(home)
    const target = path.join(home, 'Downloads', 'archive.dmg')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, 'installer')
    const stats = await fs.stat(target)

    expect(isAllowedLargeFileCleanupTarget(target, home)).toBe(true)
    await expect(validateLargeFileCleanupTarget(target, stats.size, stats.mtimeMs, home)).resolves.toBeUndefined()
  })

  it('rejects files outside managed folders and files changed after scanning', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-large-file-'))
    temporaryDirectories.push(home)
    const target = path.join(home, 'Documents', 'database.bin')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, 'data')
    expect(isAllowedLargeFileCleanupTarget(target, home)).toBe(false)

    const download = path.join(home, 'Downloads', 'archive.zip')
    await fs.mkdir(path.dirname(download), { recursive: true })
    await fs.writeFile(download, 'changed')
    const stats = await fs.stat(download)
    await expect(validateLargeFileCleanupTarget(download, stats.size + 1, stats.mtimeMs, home))
      .rejects.toThrow('changed after the scan')
  })
})

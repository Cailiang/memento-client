import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isAllowedCleanupTarget } from './cleanup-rules'

export function isAllowedStorageCleanupTarget(
  target: string,
  home = os.homedir()
): boolean {
  if (!path.isAbsolute(target)) return false
  const resolvedTarget = path.resolve(target)
  const resolvedHome = path.resolve(home)
  return isAllowedCleanupTarget(resolvedTarget, resolvedHome)
}

async function assertNoSymlinkedAncestors(target: string, home: string): Promise<void> {
  const relative = path.relative(home, target)
  const parts = relative.split(path.sep)
  let current = home
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part)
    const stats = await fs.lstat(current)
    if (stats.isSymbolicLink()) {
      throw new Error('Symbolic links in storage target ancestors cannot be cleaned automatically.')
    }
  }
}

export async function deleteStorageTargets(
  targets: readonly string[],
  home = os.homedir()
): Promise<void> {
  if (!targets.length || targets.some((target) => !isAllowedStorageCleanupTarget(target, home))) {
    throw new Error('A storage target is outside the cleanup allowlist.')
  }
  for (const target of targets) {
    try {
      await deleteStorageTarget(target, home)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

export async function deleteStorageTarget(
  target: string,
  home = os.homedir()
): Promise<void> {
  if (!isAllowedStorageCleanupTarget(target, home)) {
    throw new Error('The storage target is outside the cleanup allowlist.')
  }

  const stats = await fs.lstat(target)
  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic links cannot be cleaned automatically.')
  }
  await assertNoSymlinkedAncestors(path.resolve(target), path.resolve(home))
  const [realTarget, realHome] = await Promise.all([
    fs.realpath(target),
    fs.realpath(home)
  ])
  if (!isAllowedStorageCleanupTarget(realTarget, realHome)) {
    throw new Error('The resolved storage target is outside the cleanup allowlist.')
  }

  await fs.rm(target, {
    recursive: stats.isDirectory(),
    force: false,
    maxRetries: 2,
    retryDelay: 100
  })

  try {
    await fs.lstat(target)
    throw new Error('The storage target still exists after cleanup.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

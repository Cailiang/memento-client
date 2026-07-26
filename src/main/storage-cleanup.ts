import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXACT_STORAGE_PATHS = [
  ['Library', 'Developer', 'Xcode', 'DerivedData'],
  ['Library', 'Developer', 'Xcode', 'iOS DeviceSupport'],
  ['.npm', '_cacache'],
  ['Library', 'pnpm', 'store'],
  ['.gradle', 'caches']
] as const

export function isAllowedStorageCleanupTarget(
  target: string,
  home = os.homedir()
): boolean {
  if (!path.isAbsolute(target)) return false
  const resolvedTarget = path.resolve(target)
  const resolvedHome = path.resolve(home)
  if (EXACT_STORAGE_PATHS.some((parts) =>
    resolvedTarget === path.join(resolvedHome, ...parts)
  )) return true

  const cacheRoot = path.join(resolvedHome, 'Library', 'Caches')
  return path.dirname(resolvedTarget) === cacheRoot &&
    path.basename(resolvedTarget).length > 0 &&
    !path.basename(resolvedTarget).startsWith('com.apple.')
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

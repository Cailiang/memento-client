import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LARGE_FILE_ROOTS = ['Downloads', 'Desktop', 'Movies'] as const

export function isAllowedLargeFileCleanupTarget(
  target: string,
  home = os.homedir()
): boolean {
  if (!path.isAbsolute(target)) return false
  const resolvedTarget = path.resolve(target)
  const resolvedHome = path.resolve(home)
  return LARGE_FILE_ROOTS.some((directory) => {
    const root = path.join(resolvedHome, directory)
    return resolvedTarget.startsWith(`${root}${path.sep}`)
  })
}

export async function validateLargeFileCleanupTarget(
  target: string,
  expectedSizeBytes: number,
  expectedModifiedAtMs: number,
  home = os.homedir()
): Promise<void> {
  if (!isAllowedLargeFileCleanupTarget(target, home)) {
    throw new Error('The large-file target is outside the cleanup allowlist.')
  }
  const stats = await fs.lstat(target)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('The large-file target is not a regular file.')
  }
  const [realTarget, realHome] = await Promise.all([fs.realpath(target), fs.realpath(home)])
  if (!isAllowedLargeFileCleanupTarget(realTarget, realHome)) {
    throw new Error('The resolved large-file target is outside the cleanup allowlist.')
  }
  if (stats.size !== expectedSizeBytes || Math.round(stats.mtimeMs) !== Math.round(expectedModifiedAtMs)) {
    throw new Error('The large file changed after the scan.')
  }
}

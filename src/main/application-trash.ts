import { existsSync } from 'node:fs'
import path from 'node:path'

type ExistsProvider = (target: string) => boolean

export function isAllowedApplicationTrashTarget(target: string, home: string): boolean {
  const resolvedTarget = path.resolve(target)
  const roots = ['/Applications', path.join(home, 'Applications')]
  return roots.some((root) => {
    const relative = path.relative(root, resolvedTarget)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false
    const segments = relative.split(path.sep)
    return segments.at(-1)?.toLowerCase().endsWith('.app') === true &&
      segments.slice(0, -1).every((segment) => !segment.toLowerCase().endsWith('.app'))
  })
}

export function applicationTrashDestination(
  target: string,
  trashDirectory: string,
  existsProvider: ExistsProvider = existsSync
): string {
  return trashDestination(target, trashDirectory, existsProvider)
}

export function trashDestination(
  target: string,
  trashDirectory: string,
  existsProvider: ExistsProvider = existsSync
): string {
  const basename = path.basename(target)
  const extension = path.extname(basename)
  const stem = extension ? basename.slice(0, -extension.length) : basename
  let destination = path.join(trashDirectory, basename)
  for (let copy = 2; existsProvider(destination); copy += 1) {
    destination = path.join(trashDirectory, `${stem} ${copy}${extension}`)
  }
  return destination
}

export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'EACCES' || error.code === 'EPERM'
}

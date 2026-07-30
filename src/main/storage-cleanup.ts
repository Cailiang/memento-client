import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EXACT_STORAGE_PATHS = [
  ['Library', 'Developer', 'Xcode', 'DerivedData'],
  ['Library', 'Developer', 'Xcode', 'iOS DeviceSupport'],
  ['Library', 'Developer', 'CoreSimulator', 'Caches'],
  ['.npm', '_cacache'],
  ['Library', 'pnpm', 'store'],
  ['.gradle', 'caches'],
  ['Library', 'Caches', 'Codex'],
  ['Library', 'Caches', 'com.openai.codex'],
  ['Library', 'Caches', 'claude-cli-nodejs'],
  ['Library', 'Caches', 'com.anthropic.claudefordesktop'],
  ['Library', 'Caches', 'com.google.antigravity'],
  ['Library', 'Caches', 'com.google.antigravity-ide'],
  ['Library', 'Caches', 'ai.x.grok'],
  ['Library', 'Caches', 'com.xai.grok'],
  ['Library', 'Application Support', 'Claude', 'Cache'],
  ['Library', 'Application Support', 'Claude', 'Code Cache'],
  ['Library', 'Application Support', 'Claude', 'GPUCache'],
  ['Library', 'Application Support', 'Claude', 'Service Worker', 'CacheStorage'],
  ['Library', 'Application Support', 'Claude', 'Shared Dictionary', 'cache'],
  ['Library', 'Application Support', 'Codex', 'Default', 'Cache'],
  ['Library', 'Application Support', 'Codex', 'Default', 'Code Cache'],
  ['Library', 'Application Support', 'Codex', 'Default', 'GPUCache'],
  ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'Cache'],
  ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'Code Cache'],
  ['Library', 'Application Support', 'Codex', 'codex-browser-app', 'GPUCache'],
  ['Library', 'Application Support', 'Codex', 'GPUPersistentCache', 'GPUCache'],
  ['Library', 'Application Support', 'Antigravity', 'Cache'],
  ['Library', 'Application Support', 'Antigravity', 'CachedData'],
  ['Library', 'Application Support', 'Antigravity', 'Code Cache'],
  ['Library', 'Application Support', 'Antigravity', 'GPUCache'],
  ['Library', 'Application Support', 'Antigravity', 'Service Worker', 'CacheStorage'],
  ['Library', 'Application Support', 'Antigravity', 'Shared Dictionary', 'cache'],
  ['Library', 'Application Support', 'Antigravity IDE', 'Cache'],
  ['Library', 'Application Support', 'Antigravity IDE', 'CachedData'],
  ['Library', 'Application Support', 'Antigravity IDE', 'Code Cache'],
  ['Library', 'Application Support', 'Antigravity IDE', 'GPUCache'],
  ['Library', 'Application Support', 'Antigravity IDE', 'Service Worker', 'CacheStorage'],
  ['Library', 'Application Support', 'Antigravity IDE', 'Shared Dictionary', 'cache'],
  ['Library', 'Application Support', 'Grok', 'Cache'],
  ['Library', 'Application Support', 'Grok', 'Code Cache'],
  ['Library', 'Application Support', 'Grok', 'GPUCache'],
  ['Library', 'Application Support', 'Grok', 'Service Worker', 'CacheStorage'],
  ['.claude', 'cache'],
  ['.codex', 'log'],
  ['.codex', 'tmp']
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
  const logRoot = path.join(resolvedHome, 'Library', 'Logs')
  const parent = path.dirname(resolvedTarget)
  return (parent === cacheRoot || parent === logRoot) &&
    path.basename(resolvedTarget).length > 0 &&
    !path.basename(resolvedTarget).startsWith('com.apple.')
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

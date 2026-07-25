import path from 'node:path'

const USER_LIBRARY_DATA_ROOTS = [
  'Application Support',
  'Application Scripts',
  'Caches',
  'Containers',
  'HTTPStorages',
  'Logs',
  'Preferences',
  'Saved Application State',
  'WebKit'
] as const

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function findContainingAppBundle(executable: string): string | null {
  if (!path.isAbsolute(executable)) return null
  const segments = path.normalize(executable).split(path.sep)
  const appIndex = segments.findIndex((segment) => segment.toLowerCase().endsWith('.app'))
  if (appIndex < 1) return null
  return path.join(path.sep, ...segments.slice(1, appIndex + 1))
}

export function buildBundleDataCandidates(home: string, bundleId: string): string[] {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$/.test(bundleId) || bundleId.includes('..')) {
    return []
  }

  const library = path.join(home, 'Library')
  return [
    path.join(library, 'Application Support', bundleId),
    path.join(library, 'Application Scripts', bundleId),
    path.join(library, 'Caches', bundleId),
    path.join(library, 'Containers', bundleId),
    path.join(library, 'HTTPStorages', bundleId),
    path.join(library, 'Logs', bundleId),
    path.join(library, 'Preferences', `${bundleId}.plist`),
    path.join(library, 'Saved Application State', `${bundleId}.savedState`),
    path.join(library, 'WebKit', bundleId)
  ]
}

export function isAllowedServiceCleanupTarget(target: string, home: string): boolean {
  if (!path.isAbsolute(target)) return false
  const normalized = path.normalize(target)
  if (normalized !== target) return false

  const userLaunchAgents = path.join(home, 'Library', 'LaunchAgents')
  if (isWithin(userLaunchAgents, normalized) && normalized.endsWith('.plist')) return true
  if (isWithin('/Library/LaunchAgents', normalized) && normalized.endsWith('.plist')) return true

  const userApplications = path.join(home, 'Applications')
  if (isWithin(userApplications, normalized) && normalized.endsWith('.app')) return true
  if (isWithin('/Applications', normalized) && normalized.endsWith('.app')) return true

  const userLibrary = path.join(home, 'Library')
  return USER_LIBRARY_DATA_ROOTS.some((root) =>
    isWithin(path.join(userLibrary, root), normalized)
  )
}

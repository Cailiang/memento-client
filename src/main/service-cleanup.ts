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

const BLOCKED_USER_DIRECTORY_ROOTS = new Set(['.Trash', 'Applications', 'Library'])
const GENERIC_SERVICE_LOCATIONS = new Set([
  '/',
  '/bin',
  '/Library',
  '/Library/Application Support',
  '/Library/Frameworks',
  '/Library/PrivilegedHelperTools',
  '/opt',
  '/opt/homebrew',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/opt/homebrew/var',
  '/private',
  '/private/var',
  '/sbin',
  '/usr',
  '/usr/bin',
  '/usr/local',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/local/var',
  '/usr/sbin',
  '/var'
])

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export function findOwnedServiceDataRoot(
  home: string,
  program: string | null,
  workingDirectory: string | null
): string | null {
  if (!program || !workingDirectory || !path.isAbsolute(program) || !path.isAbsolute(workingDirectory)) {
    return null
  }
  const normalizedProgram = path.resolve(program)
  const normalizedDirectory = path.resolve(workingDirectory)
  if (!isAllowedServiceCleanupTarget(normalizedDirectory, home)) return null
  return isWithin(normalizedDirectory, normalizedProgram) ? normalizedDirectory : null
}

export function findContainingAppBundle(executable: string): string | null {
  if (!path.isAbsolute(executable)) return null
  const segments = path.normalize(executable).split(path.sep)
  const appIndex = segments.findIndex((segment) => segment.toLowerCase().endsWith('.app'))
  if (appIndex < 1) return null
  return path.join(path.sep, ...segments.slice(1, appIndex + 1))
}

export function findHomebrewPackageRoot(program: string | null): string | null {
  if (!program || !path.isAbsolute(program)) return null
  const normalizedProgram = path.resolve(program)
  for (const root of ['/opt/homebrew/opt', '/usr/local/opt']) {
    if (!isWithin(root, normalizedProgram)) continue
    const formula = path.relative(root, normalizedProgram).split(path.sep)[0]
    if (formula) return path.join(root, formula)
  }
  return null
}

export function findUserServiceDirectory(
  home: string,
  program: string | null,
  workingDirectory: string | null
): string | null {
  if (
    workingDirectory &&
    path.isAbsolute(workingDirectory) &&
    isAllowedUserSelectedServiceDirectory(path.resolve(workingDirectory), home)
  ) {
    return path.resolve(workingDirectory)
  }
  if (!program || !path.isAbsolute(program)) return null
  const programDirectory = path.dirname(path.resolve(program))
  return isAllowedUserSelectedServiceDirectory(programDirectory, home)
    ? programDirectory
    : null
}

export function findServiceLocation(
  home: string,
  program: string | null,
  workingDirectory: string | null,
  appPath: string | null
): string | null {
  if (appPath) return appPath
  const userDirectory = findUserServiceDirectory(home, program, workingDirectory)
  if (userDirectory) return userDirectory
  const homebrewRoot = findHomebrewPackageRoot(program)
  if (homebrewRoot) return homebrewRoot
  if (program && path.isAbsolute(program)) {
    const programDirectory = path.dirname(path.resolve(program))
    if (!GENERIC_SERVICE_LOCATIONS.has(programDirectory)) return programDirectory
  }
  if (workingDirectory && path.isAbsolute(workingDirectory)) {
    const normalizedWorkingDirectory = path.resolve(workingDirectory)
    if (!GENERIC_SERVICE_LOCATIONS.has(normalizedWorkingDirectory)) {
      return normalizedWorkingDirectory
    }
  }
  return null
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

export function isAllowedUserSelectedServiceDirectory(target: string, home: string): boolean {
  if (!path.isAbsolute(target)) return false
  const normalizedHome = path.resolve(home)
  const normalizedTarget = path.normalize(target)
  if (normalizedTarget !== target || !isWithin(normalizedHome, normalizedTarget)) return false

  const segments = path.relative(normalizedHome, normalizedTarget).split(path.sep)
  if (segments.length < 2 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return false
  }
  return !segments[0].startsWith('.') && !BLOCKED_USER_DIRECTORY_ROOTS.has(segments[0])
}

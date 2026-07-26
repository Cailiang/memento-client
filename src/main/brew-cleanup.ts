import path from 'node:path'

const DRY_RUN_PREFIX = 'Would remove: '

export function brewCleanupVersionTargets(
  output: string,
  formulaRoot: string,
  installedVersions: readonly string[]
): string[] {
  const dryRunTargets = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith(DRY_RUN_PREFIX))
    .map((line) => line.slice(DRY_RUN_PREFIX.length))

  return installedVersions.filter((version) => {
    const versionRoot = path.join(formulaRoot, version)
    return dryRunTargets.some(
      (target) => target === versionRoot || target.startsWith(`${versionRoot} `)
    )
  })
}

export function isSafeBrewVersion(version: string): boolean {
  return version.length > 0 && version !== '.' && version !== '..' && path.basename(version) === version
}

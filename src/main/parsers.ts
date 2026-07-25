export function parseDiskFree(output: string): { totalBytes: number; freeBytes: number } {
  const columns = output.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? []
  const totalKilobytes = Number.parseInt(columns[1] ?? '0', 10)
  const freeKilobytes = Number.parseInt(columns[3] ?? '0', 10)
  return {
    totalBytes: Number.isFinite(totalKilobytes) ? totalKilobytes * 1024 : 0,
    freeBytes: Number.isFinite(freeKilobytes) ? freeKilobytes * 1024 : 0
  }
}

export function parseDuKilobytes(output: string): number {
  const value = Number.parseInt(output.trim().split(/\s+/)[0] ?? '0', 10)
  return Number.isFinite(value) ? value * 1024 : 0
}

export function parseMetadataValue(output: string, key: string): string | null {
  const match = output.match(new RegExp(`${key}\\s*=\\s*(?:\"([^\"]*)\"|([^\\n]+))`))
  const value = (match?.[1] ?? match?.[2] ?? '').trim()
  return !value || value === '(null)' ? null : value
}

export function parseLaunchctlLabels(output: string): Set<string> {
  return new Set(
    output
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/).at(-1))
      .filter((label): label is string => Boolean(label))
  )
}

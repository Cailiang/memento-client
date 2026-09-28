export function parseDiskFree(output: string): { totalBytes: number; freeBytes: number } {
  const columns = output.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? []
  const totalKilobytes = Number.parseInt(columns[1] ?? '0', 10)
  const freeKilobytes = Number.parseInt(columns[3] ?? '0', 10)
  return {
    totalBytes: Number.isFinite(totalKilobytes) ? totalKilobytes * 1024 : 0,
    freeBytes: Number.isFinite(freeKilobytes) ? freeKilobytes * 1024 : 0
  }
}

export function parseMacVolumeCapacity(output: string): {
  totalBytes: number
  freeBytes: number
  availableBytes: number
} | null {
  try {
    const parsed = JSON.parse(output.trim()) as {
      totalBytes?: unknown
      freeBytes?: unknown
      availableBytes?: unknown
    }
    const totalBytes = typeof parsed.totalBytes === 'number' ? parsed.totalBytes : 0
    const freeBytes = typeof parsed.freeBytes === 'number' ? parsed.freeBytes : 0
    const availableBytes = typeof parsed.availableBytes === 'number' ? parsed.availableBytes : 0
    if (![totalBytes, freeBytes, availableBytes].every((value) => Number.isFinite(value) && value >= 0)) return null
    if (totalBytes <= 0 || availableBytes <= 0) return null
    return { totalBytes, freeBytes, availableBytes: Math.min(totalBytes, availableBytes) }
  } catch {
    return null
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
  return new Set(parseLaunchctlEntries(output).keys())
}

export function parseLaunchctlEntries(output: string): Map<string, number | null> {
  return new Map(output
    .split('\n')
    .slice(1)
    .map((line): [string, number | null] | null => {
      const columns = line.trim().split(/\s+/)
      const label = columns.at(-1)
      if (!label) return null
      const pid = Number.parseInt(columns[0] ?? '', 10)
      return [label, Number.isFinite(pid) ? pid : null]
    })
    .filter((entry): entry is [string, number | null] => entry !== null))
}

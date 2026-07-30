import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { AppLanguage } from '../shared/app-settings'
import type {
  DiskUsageNode,
  DiskUsageNodeKind,
  DiskUsageProgress,
  DiskUsageScanResult
} from '../shared/types'

export const MINIMUM_DISK_USAGE_BYTES = 5 * 1024 * 1024
const MAX_VISIBLE_CHILDREN = 200
const MAX_RETAINED_ENTRIES = 100_000

interface DiskUsageEntry {
  target: string
  sizeBytes: number
  kind?: DiskUsageNodeKind
}

interface MutableDiskUsageNode extends DiskUsageNode {
  target: string
  children: MutableDiskUsageNode[]
}

export interface DiskUsageScanBundle {
  result: DiskUsageScanResult
  targets: Map<string, string>
}

function t(language: AppLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

export function diskUsageScanRoot(): string {
  const dataVolume = '/System/Volumes/Data'
  return existsSync(dataVolume) ? dataVolume : path.parse(os.homedir()).root
}

export function withoutDiskUsageTargets(
  targets: ReadonlyMap<string, string>,
  removedTarget: string
): Map<string, string> {
  const normalizedTarget = path.resolve(removedTarget)
  const descendantPrefix = `${normalizedTarget}${path.sep}`
  return new Map([...targets].filter(([, target]) => {
    const normalized = path.resolve(target)
    return normalized !== normalizedTarget && !normalized.startsWith(descendantPrefix)
  }))
}

export function parseDiskUsageLine(
  line: string,
  root: string,
  minimumBytes = MINIMUM_DISK_USAGE_BYTES
): DiskUsageEntry | null {
  const separator = line.indexOf('\t')
  if (separator <= 0) return null
  const blocks = Number(line.slice(0, separator).trim())
  const rawTarget = line.slice(separator + 1)
  if (!Number.isFinite(blocks) || blocks < 0 || !path.isAbsolute(rawTarget)) return null
  const target = path.resolve(rawTarget)
  const resolvedRoot = path.resolve(root)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) return null
  const sizeBytes = blocks * 1024
  if (target !== resolvedRoot && sizeBytes < minimumBytes) return null
  return { target, sizeBytes }
}

export async function validateDiskUsageTrashTarget(
  target: string,
  root: string,
  home = os.homedir()
): Promise<string> {
  if (!path.isAbsolute(target) || !path.isAbsolute(root)) {
    throw new Error('Disk usage trash target must be absolute')
  }
  const normalizedTarget = path.resolve(target)
  const normalizedRoot = path.resolve(root)
  const stats = await lstat(normalizedTarget)
  if (stats.isSymbolicLink()) throw new Error('Disk usage trash target cannot be a symbolic link')
  const [realTarget, realRoot, realHome] = await Promise.all([
    realpath(normalizedTarget),
    realpath(normalizedRoot),
    realpath(home).catch(() => path.resolve(home))
  ])
  if (
    realTarget === realRoot ||
    path.dirname(realTarget) === realRoot ||
    realTarget === realHome ||
    !realTarget.startsWith(`${realRoot}${path.sep}`)
  ) {
    throw new Error('Disk usage trash target is outside the scanned volume')
  }
  return realTarget
}

function displayLocation(target: string, root: string): string {
  if (target === root) return '/'
  const relative = path.relative(root, target)
  return `/${relative.split(path.sep).join('/')}`
}

function nodeName(target: string, root: string, rootName: string): string {
  return target === root ? rootName : path.basename(target)
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

async function identifyEntryKinds(
  entries: DiskUsageEntry[]
): Promise<Array<DiskUsageEntry & { kind: DiskUsageNodeKind }>> {
  const inspected = await mapLimit(entries, 24, async (entry) => {
    try {
      const stats = await lstat(entry.target)
      if (stats.isSymbolicLink()) return null
      return {
        ...entry,
        kind: stats.isDirectory() ? 'directory' as const : 'file' as const
      }
    } catch {
      return null
    }
  })
  return inspected.filter((entry): entry is DiskUsageEntry & { kind: DiskUsageNodeKind } => (
    entry !== null
  ))
}

export function buildDiskUsageTree(
  entries: Array<DiskUsageEntry & { kind: DiskUsageNodeKind }>,
  root: string,
  rootName: string
): { root: DiskUsageNode; targets: Map<string, string> } {
  const resolvedRoot = path.resolve(root)
  const ordered = [...entries]
    .filter((entry) => entry.target === resolvedRoot || entry.target.startsWith(`${resolvedRoot}${path.sep}`))
    .sort((left, right) => left.target.split(path.sep).length - right.target.split(path.sep).length)
  const rootEntry = ordered.find((entry) => entry.target === resolvedRoot) ?? {
    target: resolvedRoot,
    sizeBytes: 0,
    kind: 'directory' as const
  }
  const nodes = new Map<string, MutableDiskUsageNode>()
  const makeNode = (entry: DiskUsageEntry & { kind: DiskUsageNodeKind }): MutableDiskUsageNode => ({
    id: randomUUID(),
    name: nodeName(entry.target, resolvedRoot, rootName),
    location: displayLocation(entry.target, resolvedRoot),
    sizeBytes: entry.sizeBytes,
    kind: entry.kind,
    childCount: 0,
    omittedChildCount: 0,
    omittedSizeBytes: 0,
    children: [],
    target: entry.target
  })
  nodes.set(resolvedRoot, makeNode(rootEntry))

  for (const entry of ordered) {
    if (entry.target === resolvedRoot) continue
    const node = makeNode(entry)
    nodes.set(entry.target, node)
    let parentTarget = path.dirname(entry.target)
    while (parentTarget !== resolvedRoot && !nodes.has(parentTarget)) {
      const next = path.dirname(parentTarget)
      if (next === parentTarget) break
      parentTarget = next
    }
    const parent = nodes.get(parentTarget) ?? nodes.get(resolvedRoot)!
    parent.kind = 'directory'
    parent.children.push(node)
  }

  const targets = new Map<string, string>()
  const finalize = (node: MutableDiskUsageNode): DiskUsageNode => {
    const children = node.children
      .sort((left, right) => right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name))
    const visible = children.slice(0, MAX_VISIBLE_CHILDREN)
    const omitted = children.slice(MAX_VISIBLE_CHILDREN)
    const result: DiskUsageNode = {
      id: node.id,
      name: node.name,
      location: node.location,
      sizeBytes: node.sizeBytes || children.reduce((sum, child) => sum + child.sizeBytes, 0),
      kind: node.kind,
      childCount: children.length,
      omittedChildCount: omitted.length,
      omittedSizeBytes: omitted.reduce((sum, child) => sum + child.sizeBytes, 0),
      children: visible.map(finalize)
    }
    targets.set(result.id, node.target)
    return result
  }
  return { root: finalize(nodes.get(resolvedRoot)!), targets }
}

export class DiskUsageScanner {
  private child: ChildProcess | null = null
  private cancelled = false

  cancel(): void {
    this.cancelled = true
    this.child?.kill('SIGTERM')
  }

  async scan(
    language: AppLanguage,
    onProgress: (progress: DiskUsageProgress) => void,
    root = diskUsageScanRoot()
  ): Promise<DiskUsageScanBundle> {
    if (this.child) throw new Error(t(language, '磁盘扫描已经在进行中', 'A disk scan is already running.'))
    this.cancelled = false
    const scanId = randomUUID()
    const startedAt = new Date()
    const entries = new Map<string, DiskUsageEntry>()
    let scannedEntries = 0
    let inaccessibleEntries = 0
    let currentTarget = root
    let lastProgressAt = 0

    const emitProgress = (phase: DiskUsageProgress['phase']): void => {
      const now = Date.now()
      if (phase === 'scanning' && now - lastProgressAt < 220) return
      lastProgressAt = now
      onProgress({
        phase,
        scannedEntries,
        retainedEntries: entries.size,
        inaccessibleEntries,
        currentLocation: displayLocation(currentTarget, root),
        elapsedMs: now - startedAt.getTime(),
        message: phase === 'organizing'
          ? t(language, '正在整理磁盘层级', 'Organizing the disk hierarchy')
          : t(language, '正在异步扫描磁盘', 'Scanning the disk asynchronously')
      })
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/du', ['-akx', root], {
        env: { ...process.env, BLOCKSIZE: '1024' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child
      const outputDecoder = new StringDecoder('utf8')
      const errorDecoder = new StringDecoder('utf8')
      let outputBuffer = ''
      let errorBuffer = ''

      const readOutputLine = (line: string): void => {
        scannedEntries += 1
        const separator = line.indexOf('\t')
        if (separator > 0) currentTarget = line.slice(separator + 1) || currentTarget
        const entry = parseDiskUsageLine(line, root)
        if (entry && entries.size < MAX_RETAINED_ENTRIES) entries.set(entry.target, entry)
        emitProgress('scanning')
      }
      const readErrorLine = (line: string): void => {
        if (line.trim()) inaccessibleEntries += 1
      }
      const drain = (buffer: string, reader: (line: string) => void): string => {
        const lines = buffer.split('\n')
        const remainder = lines.pop() ?? ''
        lines.forEach(reader)
        return remainder
      }

      child.stdout.on('data', (chunk: Buffer) => {
        outputBuffer += outputDecoder.write(chunk)
        outputBuffer = drain(outputBuffer, readOutputLine)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        errorBuffer += errorDecoder.write(chunk)
        errorBuffer = drain(errorBuffer, readErrorLine)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        outputBuffer += outputDecoder.end()
        errorBuffer += errorDecoder.end()
        if (outputBuffer) readOutputLine(outputBuffer)
        if (errorBuffer) readErrorLine(errorBuffer)
        this.child = null
        if (this.cancelled) {
          reject(new Error(t(language, '磁盘扫描已取消', 'The disk scan was cancelled.')))
          return
        }
        if (code !== 0 && !entries.size) {
          reject(new Error(t(language, '无法读取磁盘目录', 'Could not read the disk directory.')))
          return
        }
        resolve()
      })
    })

    emitProgress('organizing')
    const identified = await identifyEntryKinds([...entries.values()])
    if (this.cancelled) throw new Error(t(language, '磁盘扫描已取消', 'The disk scan was cancelled.'))
    const rootName = t(language, 'Macintosh HD', 'Macintosh HD')
    const tree = buildDiskUsageTree(identified, root, rootName)
    return {
      result: {
        scanId,
        root: tree.root,
        scannedEntries,
        retainedEntries: identified.length,
        inaccessibleEntries,
        minimumDisplayBytes: MINIMUM_DISK_USAGE_BYTES,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString()
      },
      targets: tree.targets
    }
  }
}

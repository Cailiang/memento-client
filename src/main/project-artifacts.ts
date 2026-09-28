import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_ROOT_NAMES = [
  'Projects',
  'GitHub',
  'Developer',
  'Code',
  'dev',
  'src',
  'workspace',
  'work',
  'Documents',
  'Desktop'
] as const

const PROJECT_MARKERS = new Set([
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
  'pubspec.yaml',
  'mix.exs',
  'Makefile'
])

const ARTIFACT_LABELS = new Map<string, { zh: string; en: string }>([
  ['node_modules', { zh: 'Node.js 依赖目录', en: 'Node.js dependencies' }],
  ['target', { zh: 'Rust/Java 构建目录', en: 'Rust/Java build output' }],
  ['.build', { zh: 'Swift 构建目录', en: 'Swift build output' }],
  ['build', { zh: '项目构建目录', en: 'Project build output' }],
  ['dist', { zh: '项目发布目录', en: 'Project distribution output' }],
  ['out', { zh: '项目输出目录', en: 'Project output directory' }],
  ['.next', { zh: 'Next.js 构建缓存', en: 'Next.js build cache' }],
  ['.nuxt', { zh: 'Nuxt 构建缓存', en: 'Nuxt build cache' }],
  ['.turbo', { zh: 'Turborepo 缓存', en: 'Turborepo cache' }],
  ['.parcel-cache', { zh: 'Parcel 构建缓存', en: 'Parcel build cache' }],
  ['coverage', { zh: '测试覆盖率产物', en: 'Test coverage output' }],
  ['.dart_tool', { zh: 'Dart 工具缓存', en: 'Dart tool cache' }],
  ['DerivedData', { zh: '项目 DerivedData', en: 'Project DerivedData' }]
])

const MAX_SCAN_DEPTH = 5
const MAX_PROJECT_ROOTS = 160
const DAY_MS = 86_400_000

export interface ProjectArtifact {
  target: string
  projectRoot: string
  projectName: string
  artifactName: string
  label: { zh: string; en: string }
  modifiedAt: Date
  modifiedAtMs: number
  kind: 'directory'
}

function isWithin(parent: string, target: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(target))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isProjectMarker(entry: Dirent): boolean {
  return entry.name === '.git' || PROJECT_MARKERS.has(entry.name)
}

function isProtectedEntryName(name: string): boolean {
  return name === '.git' ||
    /^id_(rsa|ecdsa|ed25519)$/i.test(name) ||
    /\.(pem|key|p12|pfx|mobileprovision)$/i.test(name)
}

async function readEntries(target: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(target, { withFileTypes: true })
  } catch {
    return []
  }
}

async function hasProtectedArtifactEntries(target: string, depth = 0): Promise<boolean> {
  const entries = await readEntries(target)
  if (entries.some((entry) => isProtectedEntryName(entry.name))) return true
  if (depth >= 2) return false
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (await hasProtectedArtifactEntries(path.join(target, entry.name), depth + 1)) return true
  }
  return false
}

function projectRoots(home: string): string[] {
  const resolvedHome = path.resolve(home)
  return PROJECT_ROOT_NAMES.map((name) => path.join(resolvedHome, name))
}

async function discoverFromRoot(
  root: string,
  results: ProjectArtifact[],
  seenRoots: Set<string>,
  depth: number,
  now: number
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH || seenRoots.size >= MAX_PROJECT_ROOTS) return
  let realRoot: string
  try {
    const stats = await fs.lstat(root)
    if (!stats.isDirectory() || stats.isSymbolicLink()) return
    realRoot = await fs.realpath(root)
  } catch {
    return
  }
  if (seenRoots.has(realRoot)) return
  seenRoots.add(realRoot)

  const entries = await readEntries(realRoot)
  const isProject = entries.some(isProjectMarker)
  if (isProject) {
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !ARTIFACT_LABELS.has(entry.name)) continue
      const target = path.join(realRoot, entry.name)
      if (await hasProtectedArtifactEntries(target)) continue
      try {
        const stats = await fs.lstat(target)
        if (stats.isSymbolicLink() || !stats.isDirectory()) continue
        if (now - stats.mtimeMs < 0) continue
        const label = ARTIFACT_LABELS.get(entry.name)
        if (!label) continue
        results.push({
          target,
          projectRoot: realRoot,
          projectName: path.basename(realRoot),
          artifactName: entry.name,
          label,
          modifiedAt: stats.mtime,
          modifiedAtMs: stats.mtimeMs,
          kind: 'directory'
        })
      } catch {
        // A build output can disappear while the scan is running.
      }
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === '.git' || ARTIFACT_LABELS.has(entry.name)) continue
    await discoverFromRoot(path.join(realRoot, entry.name), results, seenRoots, depth + 1, now)
    if (seenRoots.size >= MAX_PROJECT_ROOTS) return
  }
}

export async function discoverProjectArtifacts(
  home = os.homedir(),
  now = Date.now()
): Promise<ProjectArtifact[]> {
  const results: ProjectArtifact[] = []
  const seenRoots = new Set<string>()
  for (const root of projectRoots(home)) {
    await discoverFromRoot(root, results, seenRoots, 0, now)
    if (seenRoots.size >= MAX_PROJECT_ROOTS) break
  }
  return results
}

export function isAllowedProjectArtifactTarget(
  target: string,
  projectRoot: string,
  home = os.homedir()
): boolean {
  if (!path.isAbsolute(target) || !path.isAbsolute(projectRoot)) return false
  if (!isWithin(home, projectRoot) || !isWithin(projectRoot, target)) return false
  if (path.dirname(path.resolve(target)) !== path.resolve(projectRoot)) return false
  return ARTIFACT_LABELS.has(path.basename(target))
}

export async function validateProjectArtifactCleanupTarget(
  target: string,
  projectRoot: string,
  expectedModifiedAtMs: number,
  expectedKind: ProjectArtifact['kind'],
  home = os.homedir()
): Promise<string> {
  if (!isAllowedProjectArtifactTarget(target, projectRoot, home)) {
    throw new Error('The project artifact is outside the cleanup allowlist.')
  }
  const rootStats = await fs.lstat(projectRoot)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('The project root changed before cleanup.')
  }
  const rootEntries = await readEntries(projectRoot)
  if (!rootEntries.some(isProjectMarker)) {
    throw new Error('The project root is no longer recognized.')
  }
  const stats = await fs.lstat(target)
  if (stats.isSymbolicLink() || (expectedKind === 'directory' && !stats.isDirectory())) {
    throw new Error('The project artifact changed type after the scan.')
  }
  if (Math.round(stats.mtimeMs) !== Math.round(expectedModifiedAtMs)) {
    throw new Error('The project artifact changed after the scan. Scan again.')
  }
  if (await hasProtectedArtifactEntries(target)) {
    throw new Error('The project artifact contains protected key material.')
  }
  return fs.realpath(target)
}

export function projectArtifactAgeDays(artifact: ProjectArtifact, now = Date.now()): number {
  return Math.max(0, Math.floor((now - artifact.modifiedAtMs) / DAY_MS))
}

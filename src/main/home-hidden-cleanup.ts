import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { InstalledApplication } from '../shared/types'

const PROTECTED_HOME_NAMES = new Set([
  '.CFUserTextEncoding',
  '.DS_Store',
  '.Trash',
  '.aws',
  '.azure',
  '.bash_history',
  '.bash_profile',
  '.bashrc',
  '.bun',
  '.cache',
  '.cargo',
  '.copilot',
  '.cocoapods',
  '.composer',
  '.conda',
  '.config',
  '.cups',
  '.dartServer',
  '.git',
  '.git-credentials',
  '.gitconfig',
  '.gitignore_global',
  '.gnupg',
  '.gradle',
  '.inputrc',
  '.ipython',
  '.ipynb_checkpoints',
  '.ivy2',
  '.jupyter',
  '.kube',
  '.lesshst',
  '.local',
  '.m2',
  '.memento',
  '.gem',
  '.mysql_history',
  '.netrc',
  '.node_repl_history',
  '.npm',
  '.npmrc',
  '.nvm',
  '.oh-my-zsh',
  '.openjfx',
  '.profile',
  '.pub-cache',
  '.pyenv',
  '.python_history',
  '.rbenv',
  '.rediscli_history',
  '.rustup',
  '.sbt',
  '.ssh',
  '.sqlite_history',
  '.subversion',
  '.swt',
  '.terraform.d',
  '.tool-versions',
  '.vim',
  '.viminfo',
  '.vimrc',
  '.wget-hsts',
  '.yarn',
  '.z',
  '.agents',
  '.ips',
  '.matplotlib',
  '.lanternsecrets',
  '.skiko',
  '.uiautomator2',
  '.vue-templates',
  '.zcompdump',
  '.zlogin',
  '.zprofile',
  '.zsh_history',
  '.zsh_sessions',
  '.zshenv',
  '.zshrc'
])

const PROTECTED_HOME_PREFIXES = [
  '.zcompdump-'
]

const PROTECTED_CONTAINER_NAMES = new Set([
  'aws',
  'fish',
  'gcloud',
  'gh',
  'githubcopilot',
  'git',
  'gnupg',
  'kube',
  'chromedevtoolsmcp',
  'nvim',
  'pip',
  'shell',
  'ssh',
  'zsh'
])

const GENERIC_IDENTITY_PARTS = new Set([
  'agent',
  'app',
  'application',
  'client',
  'com',
  'desktop',
  'helper',
  'io',
  'launcher',
  'net',
  'org'
])

const MANAGED_CONTAINERS = [
  { parts: ['.config'], source: 'config' as const },
  { parts: ['.cache'], source: 'cache' as const },
  { parts: ['.local', 'share'], source: 'local-share' as const }
]

export const HIDDEN_HOME_MINIMUM_AGE_DAYS = 30
const DAY_MS = 86_400_000

export type HiddenHomeArtifactSource = 'home' | 'config' | 'cache' | 'local-share'

export interface HiddenHomeArtifact {
  target: string
  name: string
  source: HiddenHomeArtifactSource
  modifiedAt: Date
  modifiedAtMs: number
  kind: 'directory' | 'file'
}

export interface HiddenArtifactProduct {
  name: { zh: string; en: string }
  description: { zh: string; en: string }
}

const KNOWN_HIDDEN_ARTIFACT_PRODUCTS: Record<string, HiddenArtifactProduct> = {
  lingma: {
    name: { zh: '阿里云「通义灵码」', en: 'Alibaba Cloud Tongyi Lingma' },
    description: {
      zh: '这是阿里云「通义灵码」智能编码助手使用的用户配置目录。即使没有检测到独立应用，它仍可能由 IDE 插件或命令行工具使用。',
      en: 'This is a user configuration directory for Alibaba Cloud Tongyi Lingma, an AI coding assistant. An IDE extension or command-line tool may still use it even when no standalone application is detected.'
    }
  }
}

type ApplicationIdentity = Pick<
  InstalledApplication,
  'name' | 'bundleId' | 'executable' | 'urlSchemes'
>

function identityParts(value: string): string[] {
  const normalized = value.normalize('NFKD').toLowerCase()
  const compact = normalized.replace(/[^a-z0-9]/g, '')
  const parts = normalized
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3 && !GENERIC_IDENTITY_PARTS.has(part))
  return compact.length >= 3 ? [compact, ...parts] : parts
}

export function hiddenArtifactIdentity(name: string): string {
  return name.replace(/^\.+/, '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function knownHiddenArtifactProduct(name: string): HiddenArtifactProduct | null {
  return KNOWN_HIDDEN_ARTIFACT_PRODUCTS[hiddenArtifactIdentity(name)] ?? null
}

export function installedApplicationIdentityTokens(
  applications: readonly ApplicationIdentity[]
): Set<string> {
  const tokens = new Set<string>()
  for (const application of applications) {
    for (const value of [
      application.name,
      application.bundleId ?? '',
      application.executable ?? '',
      ...(application.urlSchemes ?? [])
    ]) {
      for (const token of identityParts(value)) tokens.add(token)
    }
  }
  return tokens
}

export function commandSearchRoots(
  home = os.homedir(),
  pathValue = process.env.PATH ?? ''
): string[] {
  return [...new Set([
    ...pathValue.split(path.delimiter),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    path.join(home, 'bin'),
    path.join(home, '.local', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.pub-cache', 'bin'),
    path.join(home, '.bun', 'bin')
  ].filter((root) => path.isAbsolute(root)).map((root) => path.resolve(root)))]
}

export async function installedCommandIdentityTokens(
  searchRoots: readonly string[]
): Promise<Set<string>> {
  const roots = [...new Set(searchRoots.filter((root) => path.isAbsolute(root)).map((root) => (
    path.resolve(root)
  )))]
  const entriesByRoot = await Promise.all(roots.map((root) => readEntries(root)))
  const tokens = new Set<string>()
  for (const entries of entriesByRoot) {
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      const token = hiddenArtifactIdentity(entry.name)
      if (token) tokens.add(token)
    }
  }
  return tokens
}

function managedRootForTarget(target: string, home: string): {
  root: string
  source: HiddenHomeArtifactSource
} | null {
  const resolvedTarget = path.resolve(target)
  const resolvedHome = path.resolve(home)
  if (
    path.dirname(resolvedTarget) === resolvedHome &&
    path.basename(resolvedTarget).startsWith('.')
  ) {
    return { root: resolvedHome, source: 'home' }
  }
  for (const container of MANAGED_CONTAINERS) {
    const root = path.join(resolvedHome, ...container.parts)
    if (path.dirname(resolvedTarget) === root) return { root, source: container.source }
  }
  return null
}

function isProtectedArtifactName(name: string, source: HiddenHomeArtifactSource): boolean {
  if (!name || name === '.' || name === '..') return true
  if (source === 'home') {
    return PROTECTED_HOME_NAMES.has(name) ||
      PROTECTED_HOME_PREFIXES.some((prefix) => name.startsWith(prefix))
  }
  const identity = hiddenArtifactIdentity(name)
  return !identity || PROTECTED_CONTAINER_NAMES.has(identity)
}

function matchesInstalledIdentity(
  identity: string,
  installedIdentities: ReadonlySet<string>
): boolean {
  if (installedIdentities.has(identity)) return true
  if (identity.length < 5) return false
  return [...installedIdentities].some((installed) =>
    installed.length >= 5 &&
    (installed.includes(identity) || identity.includes(installed))
  )
}

export function isAllowedHiddenHomeArtifactTarget(
  target: string,
  home = os.homedir()
): boolean {
  if (!path.isAbsolute(target)) return false
  const managed = managedRootForTarget(target, home)
  return Boolean(managed) && !isProtectedArtifactName(path.basename(target), managed!.source)
}

async function readEntries(root: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
}

export async function discoverHiddenHomeArtifacts(
  installedIdentities: ReadonlySet<string>,
  home = os.homedir(),
  now = Date.now()
): Promise<HiddenHomeArtifact[]> {
  const roots = [
    { root: home, source: 'home' as const },
    ...MANAGED_CONTAINERS.map((container) => ({
      root: path.join(home, ...container.parts),
      source: container.source
    }))
  ]
  const rootEntries = await Promise.all(roots.map(async ({ root, source }) => ({
    root,
    source,
    entries: await readEntries(root)
  })))
  const discovered: HiddenHomeArtifact[] = []

  for (const { root, source, entries } of rootEntries) {
    for (const entry of entries) {
      if (source === 'home' && !entry.name.startsWith('.')) continue
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue
      const target = path.join(root, entry.name)
      if (!isAllowedHiddenHomeArtifactTarget(target, home)) continue
      const identity = hiddenArtifactIdentity(entry.name)
      if (matchesInstalledIdentity(identity, installedIdentities)) continue
      try {
        const stats = await fs.lstat(target)
        if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) continue
        if (now - stats.mtimeMs < HIDDEN_HOME_MINIMUM_AGE_DAYS * DAY_MS) continue
        discovered.push({
          target,
          name: entry.name,
          source,
          modifiedAt: stats.mtime,
          modifiedAtMs: stats.mtimeMs,
          kind: stats.isDirectory() ? 'directory' : 'file'
        })
      } catch {
        // A hidden item can disappear while the scan is running.
      }
    }
  }
  return discovered
}

export async function validateHiddenHomeArtifactCleanupTarget(
  target: string,
  expectedModifiedAtMs: number,
  expectedKind: HiddenHomeArtifact['kind'],
  home = os.homedir()
): Promise<string> {
  if (!isAllowedHiddenHomeArtifactTarget(target, home)) {
    throw new Error('The hidden Home item is outside the cleanup allowlist.')
  }
  const stats = await fs.lstat(target)
  if (
    stats.isSymbolicLink() ||
    (expectedKind === 'directory' ? !stats.isDirectory() : !stats.isFile())
  ) {
    throw new Error('The hidden Home item changed type after the scan.')
  }
  if (Math.round(stats.mtimeMs) !== Math.round(expectedModifiedAtMs)) {
    throw new Error('The hidden Home item changed after the scan.')
  }
  const managed = managedRootForTarget(target, home)
  if (!managed) throw new Error('The hidden Home item is outside the cleanup allowlist.')
  const [realTarget, realRoot] = await Promise.all([
    fs.realpath(target),
    fs.realpath(managed.root)
  ])
  if (
    path.dirname(realTarget) !== realRoot ||
    !isAllowedHiddenHomeArtifactTarget(realTarget, await fs.realpath(home))
  ) {
    throw new Error('The resolved hidden Home item is outside the cleanup allowlist.')
  }
  return realTarget
}

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { AgentFocus } from '../../shared/agent-types'
import type { InstalledApplication, ScanCandidate, ScanResult } from '../../shared/types'

const execFileAsync = promisify(execFile)

const GENERIC_IDENTITY_TOKENS = new Set([
  'application',
  'applications',
  'background',
  'cache',
  'caches',
  'client',
  'config',
  'configuration',
  'data',
  'desktop',
  'directory',
  'file',
  'files',
  'helper',
  'hidden',
  'home',
  'item',
  'items',
  'launchagent',
  'launchdaemon',
  'library',
  'local',
  'preferences',
  'rebuildable',
  'service',
  'services',
  'support',
  'user'
])

const SHELL_CONFIG_NAMES = [
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  '.bashrc',
  '.bash_profile',
  '.profile'
]

export type ArtifactEvidenceConfidence =
  | 'confirmed-local'
  | 'strong-signature'
  | 'unconfirmed'

export interface RelatedScanEvidence {
  identityTokens: string[]
  storage: ScanCandidate[]
  services: ScanCandidate[]
  applications: InstalledApplication[]
  matchedTokens: string[]
}

export interface LocalPathEvidence {
  path: string
  kind: 'directory' | 'file'
  matchedToken?: string
}

export interface ShellReferenceEvidence {
  path: string
  line: number
  text: string
  matchedToken: string
}

export interface LocalArtifactEvidence {
  inspectedTargets: Array<{
    path: string
    children: LocalPathEvidence[]
  }>
  matchingPaths: LocalPathEvidence[]
  shellReferences: ShellReferenceEvidence[]
  packageReceipts: string[]
}

export interface LocalEvidenceOptions {
  home?: string
  systemRoots?: string[]
  packageReceipts?: string[]
}

function normalizedTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GENERIC_IDENTITY_TOKENS.has(token))
}

function itemIdentityValues(item: ScanCandidate | InstalledApplication): string[] {
  if ('section' in item) {
    return [item.name, item.subtitle, item.location ?? '']
  }
  return [
    item.name,
    item.bundleId ?? '',
    item.executable ?? '',
    item.location,
    ...(item.urlSchemes ?? [])
  ]
}

function itemTokens(item: ScanCandidate | InstalledApplication): Set<string> {
  return new Set(itemIdentityValues(item).flatMap(normalizedTokens))
}

function focusedItems(scan: ScanResult, focus: readonly AgentFocus[]): Array<ScanCandidate | InstalledApplication> {
  const focusIds = new Set(focus.map((item) => item.id))
  return [
    ...scan.candidates.filter((item) => focusIds.has(item.id)),
    ...scan.applications.filter((item) => focusIds.has(item.id))
  ]
}

export function relatedScanEvidence(
  scan: ScanResult,
  focus: readonly AgentFocus[]
): RelatedScanEvidence {
  const focused = focusedItems(scan, focus)
  const focusedIds = new Set(focused.map((item) => item.id))
  const identityTokens = [...new Set(focused.flatMap((item) => (
    itemIdentityValues(item).flatMap(normalizedTokens)
  )))].slice(0, 12)
  const tokenSet = new Set(identityTokens)
  const matchedTokens = new Set<string>()
  const related = (item: ScanCandidate | InstalledApplication): boolean => {
    if (focusedIds.has(item.id)) return true
    const matches = [...itemTokens(item)].filter((token) => tokenSet.has(token))
    matches.forEach((token) => matchedTokens.add(token))
    return matches.length > 0
  }

  return {
    identityTokens,
    storage: scan.candidates.filter((item) => item.section === 'storage' && related(item)),
    services: scan.candidates.filter((item) => item.section === 'services' && related(item)),
    applications: scan.applications.filter(related),
    matchedTokens: [...matchedTokens]
  }
}

function displayPath(target: string, home: string): string {
  return target === home ? '~' : target.startsWith(`${home}${path.sep}`)
    ? `~${target.slice(home.length)}`
    : target
}

function resolveDisplayPath(target: string, home: string): string | null {
  if (target === '~') return home
  if (target.startsWith(`~${path.sep}`)) return path.join(home, target.slice(2))
  return path.isAbsolute(target) ? path.resolve(target) : null
}

function matchingToken(value: string, tokens: readonly string[]): string | undefined {
  const normalized = value.normalize('NFKD').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
  return tokens.find((token) => normalized.includes(token))
}

async function directoryEntries(target: string): Promise<LocalPathEvidence[]> {
  try {
    const entries = await fs.readdir(target, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .slice(0, 40)
      .map((entry) => ({
        path: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file'
      }))
  } catch {
    return []
  }
}

async function matchingDirectoryEntries(
  root: string,
  tokens: readonly string[],
  home: string
): Promise<LocalPathEvidence[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.flatMap((entry): LocalPathEvidence[] => {
      if (!entry.isDirectory() && !entry.isFile()) return []
      const token = matchingToken(entry.name, tokens)
      return token ? [{
        path: displayPath(path.join(root, entry.name), home),
        kind: entry.isDirectory() ? 'directory' : 'file',
        matchedToken: token
      }] : []
    })
  } catch {
    return []
  }
}

function sanitizeShellReference(value: string): string {
  return value
    .trim()
    .replace(
      /((?:api[_-]?key|access[_-]?key|token|secret|password|credential)s?\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s;]+)/gi,
      '$1[REDACTED]'
    )
    .slice(0, 320)
}

async function shellReferences(
  home: string,
  tokens: readonly string[]
): Promise<ShellReferenceEvidence[]> {
  const references: ShellReferenceEvidence[] = []
  for (const name of SHELL_CONFIG_NAMES) {
    const target = path.join(home, name)
    try {
      const stats = await fs.stat(target)
      if (!stats.isFile() || stats.size > 512 * 1024) continue
      const lines = (await fs.readFile(target, 'utf8')).split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        const token = matchingToken(lines[index], tokens)
        if (!token) continue
        references.push({
          path: displayPath(target, home),
          line: index + 1,
          text: sanitizeShellReference(lines[index]),
          matchedToken: token
        })
        if (references.length >= 16) return references
      }
    } catch {
      // Missing and unreadable shell files are normal.
    }
  }
  return references
}

async function installedPackageReceipts(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('/usr/sbin/pkgutil', ['--pkgs'], {
      timeout: 5_000,
      maxBuffer: 2 * 1024 * 1024
    })
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

export async function inspectLocalArtifactEvidence(
  identityTokens: readonly string[],
  targetLocations: readonly string[],
  options: LocalEvidenceOptions = {}
): Promise<LocalArtifactEvidence> {
  const home = path.resolve(options.home ?? os.homedir())
  const tokens = [...new Set(identityTokens.filter((token) => (
    /^[a-z0-9]{4,40}$/.test(token) && !GENERIC_IDENTITY_TOKENS.has(token)
  )))].slice(0, 12)
  if (!tokens.length) {
    return { inspectedTargets: [], matchingPaths: [], shellReferences: [], packageReceipts: [] }
  }

  const inspectedTargets: LocalArtifactEvidence['inspectedTargets'] = []
  for (const location of targetLocations.slice(0, 4)) {
    const target = resolveDisplayPath(location, home)
    if (!target || !target.startsWith(`${home}${path.sep}`)) continue
    try {
      const stats = await fs.lstat(target)
      if (!stats.isDirectory() || stats.isSymbolicLink()) continue
      inspectedTargets.push({
        path: displayPath(target, home),
        children: await directoryEntries(target)
      })
    } catch {
      // The scan result can become stale before Agent analysis starts.
    }
  }

  const homeRoots = [
    ['Library', 'Application Support'],
    ['Library', 'Caches'],
    ['Library', 'Preferences'],
    ['Library', 'Preferences', 'ByHost'],
    ['Library', 'HTTPStorages'],
    ['Library', 'Logs'],
    ['Library', 'LaunchAgents'],
    ['Library', 'Saved Application State'],
    ['Library', 'Containers'],
    ['Library', 'Group Containers']
  ].map((parts) => path.join(home, ...parts))
  const systemRoots = options.systemRoots ?? [
    '/Library/Application Support',
    '/Library/Preferences',
    '/Library/LaunchAgents',
    '/Library/LaunchDaemons'
  ]
  const matchingPaths = (await Promise.all(
    [...homeRoots, ...systemRoots].map((root) => matchingDirectoryEntries(root, tokens, home))
  )).flat().slice(0, 40)
  const receipts = options.packageReceipts ?? await installedPackageReceipts()

  return {
    inspectedTargets,
    matchingPaths,
    shellReferences: await shellReferences(home, tokens),
    packageReceipts: receipts.filter((receipt) => matchingToken(receipt, tokens)).slice(0, 24)
  }
}

export function artifactEvidenceConfidence(
  related: RelatedScanEvidence,
  local: LocalArtifactEvidence
): { level: ArtifactEvidenceConfidence; reasons: string[] } {
  const reasons: string[] = []
  if (related.services.length) reasons.push('matching scanned background service')
  if (related.applications.length) reasons.push('matching installed application')
  if (related.storage.length > 1) reasons.push('matching storage finding')
  if (local.matchingPaths.length) reasons.push('matching allowlisted filesystem path')
  if (local.shellReferences.length) reasons.push('matching shell configuration reference')
  if (local.packageReceipts.length) reasons.push('matching installed package receipt')
  if (reasons.length >= 2) return { level: 'confirmed-local', reasons }
  if (reasons.length === 1 || local.inspectedTargets.some((item) => item.children.length)) {
    return { level: 'strong-signature', reasons }
  }
  return { level: 'unconfirmed', reasons }
}

import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ALLOWED_CONFIG_FILES = new Set(['.zshenv', '.zprofile', '.zshrc', '.zlogin'])

export type RegisteredTerminalFix =
  | {
      kind: 'comment-lines'
      target: string
      expectedHash: string
      lineNumbers: number[]
    }
  | {
      kind: 'dedupe-path'
      target: string
      expectedHash: string
    }
  | {
      kind: 'prune-path'
      target: string
      expectedHash: string
    }

export interface TerminalFixBackup {
  target: string
  backup: string
  optimizedHash: string
}

export function terminalContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function isAllowedTerminalConfig(target: string, home = os.homedir()): boolean {
  const resolvedTarget = path.resolve(target)
  const resolvedHome = path.resolve(home)
  return path.dirname(resolvedTarget) === resolvedHome &&
    ALLOWED_CONFIG_FILES.has(path.basename(resolvedTarget))
}

async function writeAtomically(target: string, content: string, mode: number): Promise<void> {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.memento-${randomUUID()}.tmp`
  )
  try {
    await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode })
    await fs.rename(temporary, target)
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function validateZshSyntax(content: string): Promise<void> {
  if (process.platform !== 'darwin') return
  try {
    await execFileAsync('/bin/zsh', ['-n', '-c', content], {
      timeout: 5_000,
      maxBuffer: 256 * 1024
    })
  } catch {
    throw new Error('The optimized shell configuration did not pass syntax validation.')
  }
}

export async function applyTerminalFixGroup(
  fixes: readonly RegisteredTerminalFix[],
  home = os.homedir(),
  now = new Date()
): Promise<TerminalFixBackup> {
  if (!fixes.length) throw new Error('No terminal fixes were selected.')
  const target = fixes[0].target
  const expectedHash = fixes[0].expectedHash
  if (!isAllowedTerminalConfig(target, home) || fixes.some((fix) =>
    fix.target !== target || fix.expectedHash !== expectedHash
  )) {
    throw new Error('The terminal fix target did not pass local validation.')
  }

  const [content, stats] = await Promise.all([
    fs.readFile(target, 'utf8'),
    fs.lstat(target)
  ])
  if (stats.isSymbolicLink()) {
    throw new Error('Symbolic shell configuration files cannot be optimized automatically.')
  }
  if (terminalContentHash(content) !== expectedHash) {
    throw new Error('The shell configuration changed after the scan. Scan again.')
  }

  const lines = content.split('\n')
  const commentLines = new Set<number>()
  let dedupePath = false
  let prunePath = false
  for (const fix of fixes) {
    if (fix.kind === 'dedupe-path') {
      dedupePath = true
      continue
    }
    if (fix.kind === 'prune-path') {
      prunePath = true
      continue
    }
    for (const lineNumber of fix.lineNumbers) {
      if (!Number.isInteger(lineNumber) || lineNumber < 0 || lineNumber >= lines.length) {
        throw new Error('A terminal fix line is no longer valid. Scan again.')
      }
      commentLines.add(lineNumber)
    }
  }

  for (const lineNumber of commentLines) {
    const line = lines[lineNumber]
    const indentation = line.match(/^\s*/)?.[0] ?? ''
    lines[lineNumber] = `${indentation}# Memento disabled during startup optimization: ${line.slice(indentation.length)}`
  }
  if (dedupePath && !lines.some((line) => line.trim() === 'typeset -U path PATH')) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push('# Memento keeps PATH entries unique.', 'typeset -U path PATH', '')
  }
  if (prunePath && !lines.some((line) => line.trim() === '# Memento removes PATH entries that no longer exist.')) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(
      '# Memento removes PATH entries that no longer exist.',
      'typeset -a memento_valid_path_entries=()',
      'for memento_path_entry in "${path[@]}"; do',
      '  [[ -d "$memento_path_entry" ]] && memento_valid_path_entries+=("$memento_path_entry")',
      'done',
      'path=("${memento_valid_path_entries[@]}")',
      'unset memento_valid_path_entries memento_path_entry',
      ''
    )
  }

  const optimized = lines.join('\n')
  if (optimized === content) throw new Error('The selected terminal fixes are already applied.')
  await validateZshSyntax(optimized)

  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const backup = `${target}.memento-backup-${stamp}-${randomUUID().slice(0, 8)}`
  await fs.copyFile(target, backup, constants.COPYFILE_EXCL)
  await fs.chmod(backup, stats.mode)
  await writeAtomically(target, optimized, stats.mode)

  return {
    target,
    backup,
    optimizedHash: terminalContentHash(optimized)
  }
}

export async function restoreTerminalBackup(
  backup: TerminalFixBackup,
  home = os.homedir()
): Promise<void> {
  if (!isAllowedTerminalConfig(backup.target, home) ||
    path.dirname(backup.backup) !== path.dirname(backup.target)) {
    throw new Error('The terminal backup did not pass local validation.')
  }

  const [current, original, targetStats, backupStats] = await Promise.all([
    fs.readFile(backup.target, 'utf8'),
    fs.readFile(backup.backup, 'utf8'),
    fs.lstat(backup.target),
    fs.lstat(backup.backup)
  ])
  if (targetStats.isSymbolicLink() || backupStats.isSymbolicLink()) {
    throw new Error('Symbolic shell configuration files cannot be restored automatically.')
  }
  if (terminalContentHash(current) !== backup.optimizedHash) {
    throw new Error('The shell configuration changed after optimization and was not overwritten.')
  }
  await writeAtomically(backup.target, original, backupStats.mode)
}

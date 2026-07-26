import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyTerminalFixGroup,
  restoreTerminalBackup,
  terminalContentHash,
  type RegisteredTerminalFix
} from './terminal-fixes'

describe('terminal fixes', () => {
  it('backs up, optimizes, and restores a zsh configuration', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-terminal-'))
    try {
      const target = path.join(home, '.zshrc')
      const original = [
        'export EDITOR=vim',
        'source "$NVM_DIR/nvm.sh"',
        'export PATH="/tools:$PATH"',
        ''
      ].join('\n')
      await fs.writeFile(target, original, { mode: 0o600 })
      const expectedHash = terminalContentHash(original)
      const fixes: RegisteredTerminalFix[] = [
        { kind: 'comment-lines', target, expectedHash, lineNumbers: [1] },
        { kind: 'dedupe-path', target, expectedHash },
        { kind: 'prune-path', target, expectedHash }
      ]

      const backup = await applyTerminalFixGroup(
        fixes,
        home,
        new Date('2026-07-26T00:00:00Z')
      )
      const optimized = await fs.readFile(target, 'utf8')
      expect(await fs.readFile(backup.backup, 'utf8')).toBe(original)
      expect(optimized).toContain('# Memento disabled during startup optimization: source')
      expect(optimized).toContain('typeset -U path PATH')
      expect(optimized).toContain('Memento removes PATH entries that no longer exist.')
      expect(optimized).toContain('[[ -d "$memento_path_entry" ]]')

      await restoreTerminalBackup(backup, home)
      expect(await fs.readFile(target, 'utf8')).toBe(original)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('refuses to overwrite a configuration changed after scanning', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-terminal-'))
    try {
      const target = path.join(home, '.zprofile')
      await fs.writeFile(target, 'pyenv init -\n')
      const fix: RegisteredTerminalFix = {
        kind: 'comment-lines',
        target,
        expectedHash: terminalContentHash('older content\n'),
        lineNumbers: [0]
      }
      await expect(applyTerminalFixGroup([fix], home)).rejects.toThrow(
        'changed after the scan'
      )
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('refuses to restore over changes made after optimization', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-terminal-'))
    try {
      const target = path.join(home, '.zshrc')
      const original = 'source "$NVM_DIR/nvm.sh"\n'
      await fs.writeFile(target, original)
      const backup = await applyTerminalFixGroup([{
        kind: 'comment-lines',
        target,
        expectedHash: terminalContentHash(original),
        lineNumbers: [0]
      }], home)
      await fs.appendFile(target, '# changed after optimization\n')

      await expect(restoreTerminalBackup(backup, home)).rejects.toThrow(
        'changed after optimization'
      )
      expect(await fs.readFile(target, 'utf8')).toContain('changed after optimization')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it.runIf(process.platform === 'darwin')('rejects optimized content with invalid zsh syntax', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-terminal-'))
    try {
      const target = path.join(home, '.zshrc')
      const original = 'source "$NVM_DIR/nvm.sh"\nif then\n'
      await fs.writeFile(target, original)

      await expect(applyTerminalFixGroup([{
        kind: 'comment-lines',
        target,
        expectedHash: terminalContentHash(original),
        lineNumbers: [0]
      }], home)).rejects.toThrow('syntax validation')
      expect(await fs.readFile(target, 'utf8')).toBe(original)
      expect((await fs.readdir(home)).some((name) => name.includes('memento-backup'))).toBe(false)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })
})

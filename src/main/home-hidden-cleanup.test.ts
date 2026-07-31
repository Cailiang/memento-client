import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  commandSearchRoots,
  discoverHiddenHomeArtifacts,
  installedApplicationIdentityTokens,
  installedCommandIdentityTokens,
  isAllowedHiddenHomeArtifactTarget,
  knownHiddenArtifactProduct,
  validateHiddenHomeArtifactCleanupTarget
} from './home-hidden-cleanup'

describe('hidden Home cleanup', () => {
  it('identifies known configuration directories without guessing from an installed app', () => {
    expect(knownHiddenArtifactProduct('.lingma')).toEqual({
      name: { zh: '阿里云「通义灵码」', en: 'Alibaba Cloud Tongyi Lingma' },
      description: expect.objectContaining({
        zh: expect.stringContaining('智能编码助手'),
        en: expect.stringContaining('AI coding assistant')
      })
    })
    expect(knownHiddenArtifactProduct('.unrecognized-tool')).toBeNull()
  })

  it('finds unmatched app data while protecting credentials, shell files, and container roots', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-hidden-home-'))
    try {
      const paths = [
        '.anyconnect',
        '.cursor',
        '.ipatool',
        '.ssh',
        '.oh-my-zsh',
        '.zcompdump-test-5.9',
        '.config/old-client',
        '.config/git',
        '.config/github-copilot',
        '.cache/retired-cache',
        '.local/share/retired-data'
      ]
      await Promise.all(paths.map((target) => fs.mkdir(path.join(home, target), { recursive: true })))
      const binRoot = path.join(home, '.local', 'bin')
      const ipatool = path.join(binRoot, 'ipatool')
      await fs.mkdir(binRoot, { recursive: true })
      await fs.writeFile(ipatool, '#!/bin/sh\n')
      await fs.chmod(ipatool, 0o755)
      const identities = installedApplicationIdentityTokens([{
        name: 'Cursor',
        bundleId: 'com.todesktop.230313mzl4w4u92',
        executable: 'Cursor',
        urlSchemes: ['cursor']
      }])
      const commandIdentities = await installedCommandIdentityTokens([binRoot])
      for (const identity of commandIdentities) identities.add(identity)

      expect(commandIdentities.has('ipatool')).toBe(true)
      expect(commandSearchRoots(home, binRoot)).toContain(binRoot)

      await expect(discoverHiddenHomeArtifacts(identities, home)).resolves.toEqual([])

      const artifacts = await discoverHiddenHomeArtifacts(
        identities,
        home,
        Date.now() + 31 * 24 * 60 * 60 * 1_000
      )

      expect(artifacts.map((artifact) => path.relative(home, artifact.target)).sort()).toEqual([
        '.anyconnect',
        '.cache/retired-cache',
        '.config/old-client',
        '.local/share/retired-data'
      ])
      expect(isAllowedHiddenHomeArtifactTarget(path.join(home, '.config'), home)).toBe(false)
      expect(isAllowedHiddenHomeArtifactTarget(path.join(home, '.ssh'), home)).toBe(false)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('rejects linked, protected, nested, and changed targets before cleanup', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-hidden-home-'))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-hidden-outside-'))
    try {
      const target = path.join(home, '.anyconnect')
      const nested = path.join(target, 'settings.json')
      const link = path.join(home, '.linked-app')
      await fs.mkdir(target)
      await fs.writeFile(nested, '{}')
      await fs.symlink(outside, link)
      const stats = await fs.lstat(target)

      await expect(validateHiddenHomeArtifactCleanupTarget(
        target,
        stats.mtimeMs,
        'directory',
        home
      )).resolves.toBe(await fs.realpath(target))
      expect(isAllowedHiddenHomeArtifactTarget(nested, home)).toBe(false)
      await expect(validateHiddenHomeArtifactCleanupTarget(
        link,
        (await fs.lstat(link)).mtimeMs,
        'directory',
        home
      )).rejects.toThrow('changed type')
      await fs.utimes(target, new Date(), new Date(stats.mtimeMs + 10_000))
      await expect(validateHiddenHomeArtifactCleanupTarget(
        target,
        stats.mtimeMs,
        'directory',
        home
      )).rejects.toThrow('changed after the scan')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

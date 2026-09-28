import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  discoverProjectArtifacts,
  isAllowedProjectArtifactTarget,
  validateProjectArtifactCleanupTarget
} from './project-artifacts'

describe('project artifact cleanup', () => {
  it('finds rebuildable project directories and skips protected outputs', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-project-artifacts-'))
    try {
      const project = path.join(home, 'Projects', 'sample-app')
      await fs.mkdir(path.join(project, 'node_modules'), { recursive: true })
      await fs.mkdir(path.join(project, 'dist'), { recursive: true })
      await fs.mkdir(path.join(project, 'target'), { recursive: true })
      await fs.mkdir(path.join(project, 'build'), { recursive: true })
      await fs.writeFile(path.join(project, 'package.json'), '{}\n')
      await fs.writeFile(path.join(project, 'target', 'release.pem'), 'secret')

      const artifacts = await discoverProjectArtifacts(home)
      const realProject = await fs.realpath(project)
      expect(artifacts.map((item) => item.artifactName).sort()).toEqual(['build', 'dist', 'node_modules'])
      expect(artifacts.every((item) => item.projectRoot === realProject)).toBe(true)
      expect(isAllowedProjectArtifactTarget(path.join(project, 'dist'), project, home)).toBe(true)
      expect(isAllowedProjectArtifactTarget(path.join(project, 'dist', 'nested'), project, home)).toBe(false)
      expect(isAllowedProjectArtifactTarget(path.join(home, 'dist'), project, home)).toBe(false)
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })

  it('rejects changed, protected, and unrecognized targets before moving them', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-project-artifacts-'))
    try {
      const project = path.join(home, 'Code', 'sample-app')
      const target = path.join(project, 'dist')
      await fs.mkdir(target, { recursive: true })
      await fs.writeFile(path.join(project, 'package.json'), '{}\n')
      const stats = await fs.lstat(target)

      await expect(validateProjectArtifactCleanupTarget(target, project, stats.mtimeMs, 'directory', home))
        .resolves.toBe(await fs.realpath(target))

      await fs.writeFile(path.join(target, 'deploy.key'), 'secret')
      const protectedStats = await fs.lstat(target)
      await expect(validateProjectArtifactCleanupTarget(target, project, protectedStats.mtimeMs, 'directory', home))
        .rejects.toThrow('protected key material')

      await fs.rm(path.join(target, 'deploy.key'))
      await fs.utimes(target, new Date(), new Date(stats.mtimeMs + 10_000))
      await expect(validateProjectArtifactCleanupTarget(target, project, stats.mtimeMs, 'directory', home))
        .rejects.toThrow('changed after the scan')
    } finally {
      await fs.rm(home, { recursive: true, force: true })
    }
  })
})

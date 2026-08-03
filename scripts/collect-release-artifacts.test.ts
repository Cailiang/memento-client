import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { dump, load } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { collectReleaseArtifacts } from './collect-release-artifacts'

const version = '0.6.55'
let temporaryDirectory: string | null = null

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
  temporaryDirectory = null
})

async function addArtifact(root: string, runner: string, name: string, contents = name): Promise<void> {
  const directory = path.join(root, runner, 'release')
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, name), contents)
}

function manifest(files: string[]): string {
  return dump({
    version,
    files: files.map((url) => ({
      url,
      sha512: createHash('sha512').update(url).digest('base64'),
      size: url.length
    })),
    path: files[0],
    sha512: createHash('sha512').update(files[0]).digest('base64'),
    releaseDate: '2026-07-31T10:00:00.000Z'
  })
}

async function createFixture(root: string): Promise<void> {
  const installers = [
    ['macos-x64', `Memento-${version}-x64.dmg`],
    ['macos-arm64', `Memento-${version}-arm64.dmg`],
    ['windows-x64', `Memento-${version}-x64.exe`],
    ['windows-arm64', `Memento-${version}-arm64.exe`],
    ['linux-x64', `Memento-${version}-x86_64.AppImage`],
    ['linux-arm64', `Memento-${version}-arm64.AppImage`],
    ['linux-x64', `Memento-${version}-amd64.deb`],
    ['linux-arm64', `Memento-${version}-arm64.deb`]
  ]
  for (const [runner, name] of installers) await addArtifact(root, runner, name)
  for (const [runner, name] of [
    ['macos-x64', `Memento-${version}-x64.zip`],
    ['macos-x64', `Memento-${version}-x64.zip.blockmap`],
    ['macos-arm64', `Memento-${version}-arm64.zip`],
    ['macos-arm64', `Memento-${version}-arm64.zip.blockmap`],
    ['windows-x64', `Memento-${version}-x64.exe.blockmap`],
    ['windows-arm64', `Memento-${version}-arm64.exe.blockmap`]
  ]) await addArtifact(root, runner, name)

  await addArtifact(root, 'macos-x64', 'latest-mac.yml', manifest([
    `Memento-${version}-x64.zip`,
    `Memento-${version}-x64.dmg`
  ]))
  await addArtifact(root, 'macos-arm64', 'latest-mac.yml', manifest([
    `Memento-${version}-arm64.zip`,
    `Memento-${version}-arm64.dmg`
  ]))
  await addArtifact(root, 'windows-x64', 'latest.yml', manifest([`Memento-${version}-x64.exe`]))
  await addArtifact(root, 'windows-arm64', 'latest.yml', manifest([`Memento-${version}-arm64.exe`]))
  await addArtifact(root, 'linux-x64', 'latest-linux.yml', manifest([
    `Memento-${version}-x86_64.AppImage`,
    `Memento-${version}-amd64.deb`
  ]))
  await addArtifact(root, 'linux-arm64', 'latest-linux-arm64.yml', manifest([
    `Memento-${version}-arm64.AppImage`,
    `Memento-${version}-arm64.deb`
  ]))
}

describe('release artifact collector', () => {
  it('collects installers and updater payloads with merged architecture metadata', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'memento-release-test-'))
    const artifacts = path.join(temporaryDirectory, 'artifacts')
    const output = path.join(temporaryDirectory, 'dist')
    await createFixture(artifacts)

    await collectReleaseArtifacts(artifacts, output, version)

    expect(await readdir(output)).toHaveLength(19)
    const macManifest = load(await readFile(path.join(output, 'latest-mac.yml'), 'utf8')) as {
      files: Array<{ url: string }>
    }
    expect(macManifest.files.map((file) => file.url)).toEqual([
      `Memento-${version}-x64.zip`,
      `Memento-${version}-arm64.zip`
    ])
    const linuxManifest = load(await readFile(path.join(output, 'latest-linux.yml'), 'utf8')) as {
      files: Array<{ url: string; sha512: string }>
      path: string
    }
    expect(linuxManifest.files.map((file) => file.url)).toEqual([
      `Memento-${version}-x64.AppImage`,
      `Memento-${version}-x64.deb`
    ])
    expect(linuxManifest.path).toBe(`Memento-${version}-x64.AppImage`)
    for (const file of linuxManifest.files) {
      expect(file.sha512).toBe(
        createHash('sha512').update(await readFile(path.join(output, file.url))).digest('base64')
      )
    }
    const outputNames = await readdir(output)
    expect(outputNames).toContain(`Memento-${version}-x64.AppImage`)
    expect(outputNames).toContain(`Memento-${version}-x64.deb`)
    expect(outputNames).not.toContain(`Memento-${version}-x86_64.AppImage`)
    expect(outputNames).not.toContain(`Memento-${version}-amd64.deb`)
    const checksums = (await readFile(path.join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n')
    expect(checksums).toHaveLength(8)
    expect(checksums.every((line) => !line.includes('.zip') && !line.includes('.blockmap'))).toBe(true)
    expect(checksums.some((line) => line.endsWith(`Memento-${version}-x64.AppImage`))).toBe(true)
    expect(checksums.some((line) => line.endsWith(`Memento-${version}-x64.deb`))).toBe(true)
  })

  it('rejects a missing updater payload', async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'memento-release-test-'))
    const artifacts = path.join(temporaryDirectory, 'artifacts')
    const output = path.join(temporaryDirectory, 'dist')
    await createFixture(artifacts)
    await rm(path.join(artifacts, 'macos-arm64', 'release', `Memento-${version}-arm64.zip`))

    await expect(collectReleaseArtifacts(artifacts, output, version)).rejects.toThrow(
      `Expected exactly one Memento-${version}-arm64.zip`
    )
  })
})

import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump, load } from 'js-yaml'

interface UpdateFile {
  url: string
  sha512: string
  size?: number
}

interface UpdateManifest {
  version: string
  files: UpdateFile[]
  path?: string
  sha512?: string
  releaseDate?: string
  [key: string]: unknown
}

interface ArtifactSource {
  runner: string
  name: string
  outputName?: string
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(target) : [target]
  }))
  return nested.flat()
}

async function findArtifact(artifactsDirectory: string, source: ArtifactSource): Promise<string> {
  const runnerDirectory = path.join(artifactsDirectory, source.runner)
  const matches = (await filesBelow(runnerDirectory)).filter((file) => path.basename(file) === source.name)
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${source.name} in ${source.runner}, found ${matches.length}`)
  }
  return matches[0]
}

function parseManifest(contents: string, source: string, version: string): UpdateManifest {
  const parsed = load(contents)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${source} is not an update manifest`)
  }
  const manifest = parsed as Partial<UpdateManifest>
  if (manifest.version !== version || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`${source} does not describe Memento ${version}`)
  }
  for (const file of manifest.files) {
    if (!file || typeof file.url !== 'string' || typeof file.sha512 !== 'string') {
      throw new Error(`${source} contains an invalid update file entry`)
    }
  }
  return manifest as UpdateManifest
}

async function readManifest(
  artifactsDirectory: string,
  source: ArtifactSource,
  version: string
): Promise<UpdateManifest> {
  const file = await findArtifact(artifactsDirectory, source)
  return parseManifest(await readFile(file, 'utf8'), `${source.runner}/${source.name}`, version)
}

function selectFiles(manifest: UpdateManifest, expectedNames: string[]): UpdateFile[] {
  return expectedNames.map((name) => {
    const matches = manifest.files.filter((file) => file.url === name)
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${name} update entry, found ${matches.length}`)
    }
    return matches[0]
  })
}

function mergedManifest(
  first: UpdateManifest,
  second: UpdateManifest,
  expectedNames: string[]
): UpdateManifest {
  const firstFiles = selectFiles(first, [expectedNames[0]])
  const secondFiles = selectFiles(second, [expectedNames[1]])
  const files = [...firstFiles, ...secondFiles]
  return {
    ...first,
    files,
    path: files[0].url,
    sha512: files[0].sha512
  }
}

function renamedManifestFiles(
  manifest: UpdateManifest,
  renames: Record<string, string>
): UpdateManifest {
  const renamed = {
    ...manifest,
    files: manifest.files.map((file) => ({
      ...file,
      url: renames[file.url] ?? file.url
    }))
  }
  if (manifest.path) renamed.path = renames[manifest.path] ?? manifest.path
  return renamed
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

export async function collectReleaseArtifacts(
  artifactsDirectory: string,
  outputDirectory: string,
  version: string
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  if ((await readdir(outputDirectory)).length !== 0) {
    throw new Error(`Release output directory must be empty: ${outputDirectory}`)
  }

  const installers: ArtifactSource[] = [
    { runner: 'macos-x64', name: `Memento-${version}-x64.dmg` },
    { runner: 'macos-arm64', name: `Memento-${version}-arm64.dmg` },
    { runner: 'windows-x64', name: `Memento-${version}-x64.exe` },
    { runner: 'windows-arm64', name: `Memento-${version}-arm64.exe` },
    {
      runner: 'linux-x64',
      name: `Memento-${version}-x86_64.AppImage`,
      outputName: `Memento-${version}-x64.AppImage`
    },
    { runner: 'linux-arm64', name: `Memento-${version}-arm64.AppImage` },
    {
      runner: 'linux-x64',
      name: `Memento-${version}-amd64.deb`,
      outputName: `Memento-${version}-x64.deb`
    },
    { runner: 'linux-arm64', name: `Memento-${version}-arm64.deb` }
  ]
  const updaterPayloads: ArtifactSource[] = [
    { runner: 'macos-x64', name: `Memento-${version}-x64.zip` },
    { runner: 'macos-x64', name: `Memento-${version}-x64.zip.blockmap` },
    { runner: 'macos-arm64', name: `Memento-${version}-arm64.zip` },
    { runner: 'macos-arm64', name: `Memento-${version}-arm64.zip.blockmap` },
    { runner: 'windows-x64', name: `Memento-${version}-x64.exe.blockmap` },
    { runner: 'windows-arm64', name: `Memento-${version}-arm64.exe.blockmap` }
  ]

  for (const source of [...installers, ...updaterPayloads]) {
    await copyFile(
      await findArtifact(artifactsDirectory, source),
      path.join(outputDirectory, source.outputName ?? source.name)
    )
  }

  const macX64 = await readManifest(
    artifactsDirectory,
    { runner: 'macos-x64', name: 'latest-mac.yml' },
    version
  )
  const macArm64 = await readManifest(
    artifactsDirectory,
    { runner: 'macos-arm64', name: 'latest-mac.yml' },
    version
  )
  const windowsX64 = await readManifest(
    artifactsDirectory,
    { runner: 'windows-x64', name: 'latest.yml' },
    version
  )
  const windowsArm64 = await readManifest(
    artifactsDirectory,
    { runner: 'windows-arm64', name: 'latest.yml' },
    version
  )
  const macNames = [`Memento-${version}-x64.zip`, `Memento-${version}-arm64.zip`]
  const windowsNames = [`Memento-${version}-x64.exe`, `Memento-${version}-arm64.exe`]

  await writeFile(
    path.join(outputDirectory, 'latest-mac.yml'),
    dump(mergedManifest(macX64, macArm64, macNames), { lineWidth: -1, noRefs: true })
  )
  await writeFile(
    path.join(outputDirectory, 'latest.yml'),
    dump(mergedManifest(windowsX64, windowsArm64, windowsNames), { lineWidth: -1, noRefs: true })
  )

  for (const source of [
    {
      runner: 'linux-x64',
      name: 'latest-linux.yml',
      inputAppImage: `Memento-${version}-x86_64.AppImage`,
      outputAppImage: `Memento-${version}-x64.AppImage`,
      renames: {
        [`Memento-${version}-x86_64.AppImage`]: `Memento-${version}-x64.AppImage`,
        [`Memento-${version}-amd64.deb`]: `Memento-${version}-x64.deb`
      }
    },
    {
      runner: 'linux-arm64',
      name: 'latest-linux-arm64.yml',
      inputAppImage: `Memento-${version}-arm64.AppImage`,
      outputAppImage: `Memento-${version}-arm64.AppImage`,
      renames: {}
    }
  ]) {
    const manifest = await readManifest(artifactsDirectory, source, version)
    selectFiles(manifest, [source.inputAppImage])
    const publishedManifest = renamedManifestFiles(manifest, source.renames)
    selectFiles(publishedManifest, [source.outputAppImage])
    await writeFile(
      path.join(outputDirectory, source.name),
      dump(publishedManifest, { lineWidth: -1, noRefs: true })
    )
  }

  const checksumLines: string[] = []
  for (const source of [...installers].sort((a, b) =>
    (a.outputName ?? a.name).localeCompare(b.outputName ?? b.name)
  )) {
    const outputName = source.outputName ?? source.name
    const outputFile = path.join(outputDirectory, outputName)
    checksumLines.push(`${await sha256(outputFile)}  ${outputName}`)
  }
  await writeFile(path.join(outputDirectory, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`)

  const outputNames = await readdir(outputDirectory)
  if (outputNames.length !== 19 || checksumLines.length !== 8) {
    throw new Error(`Expected 19 release assets and 8 installer checksums, found ${outputNames.length} and ${checksumLines.length}`)
  }
}

async function main(): Promise<void> {
  const projectDirectory = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const packageJson = JSON.parse(await readFile(path.join(projectDirectory, 'package.json'), 'utf8')) as { version: string }
  const artifactsDirectory = path.resolve(process.argv[2] ?? path.join(projectDirectory, 'artifacts'))
  const outputDirectory = path.resolve(process.argv[3] ?? path.join(projectDirectory, 'dist'))
  await collectReleaseArtifacts(artifactsDirectory, outputDirectory, packageJson.version)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface SparkleInstallInput {
  target: string
  downloadUrl: string
  expectedVersion?: string | null
}

interface MountedImage {
  mountRoot: string
  mountPoint: string | null
}

async function bundleValue(target: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(target, 'Contents', 'Info.plist')], { maxBuffer: 64 * 1024 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function signingTeamIdentifier(target: string): Promise<string | null> {
  try {
    const result = await execFileAsync('/usr/bin/codesign', ['-dv', '--verbose=4', target], { maxBuffer: 256 * 1024 })
    const output = `${result.stdout}\n${result.stderr}`
    return output.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

async function findApplicationBundle(root: string, depth = 3): Promise<string | null> {
  if (depth < 0) return null
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true }) as unknown as import('node:fs').Dirent[]
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(root, entry.name)
    if (entry.name.endsWith('.app')) return candidate
    const nested = await findApplicationBundle(candidate, depth - 1)
    if (nested) return nested
  }
  return null
}

async function downloadSparkleArchive(downloadUrl: string, target: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(downloadUrl)
  } catch {
    throw new Error('Sparkle 更新地址无效')
  }
  if (parsed.protocol !== 'https:') throw new Error('Sparkle 更新必须使用 HTTPS')
  const extension = path.extname(parsed.pathname).toLowerCase()
  if (!['.dmg', '.zip', '.tar', '.gz', '.tgz', '.xz'].includes(extension)) {
    throw new Error('Sparkle 更新包格式不受支持')
  }
  const archive = path.join(target, `update${extension}`)
  await execFileAsync('/usr/bin/curl', [
    '--fail',
    '--location',
    '--retry', '2',
    '--connect-timeout', '15',
    '--max-time', '900',
    '--output', archive,
    downloadUrl
  ], { timeout: 15 * 60_000, maxBuffer: 256 * 1024 })
  const stats = await fs.stat(archive)
  if (!stats.isFile() || stats.size < 1024) throw new Error('Sparkle 更新包为空或不完整')
  return archive
}

async function extractSparkleArchive(archive: string, root: string): Promise<MountedImage | null> {
  const lower = archive.toLowerCase()
  if (lower.endsWith('.dmg')) {
    const mountRoot = path.join(root, 'mount')
    await fs.mkdir(mountRoot)
    await execFileAsync('/usr/bin/hdiutil', ['attach', archive, '-nobrowse', '-readonly', '-mountroot', mountRoot, '-plist'], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
    return { mountRoot, mountPoint: null }
  }
  const extractRoot = path.join(root, 'extract')
  await fs.mkdir(extractRoot)
  if (lower.endsWith('.zip')) {
    await execFileAsync('/usr/bin/ditto', ['-x', '-k', archive, extractRoot], { timeout: 120_000, maxBuffer: 256 * 1024 })
  } else {
    await execFileAsync('/usr/bin/tar', ['-xf', archive, '-C', extractRoot], { timeout: 120_000, maxBuffer: 256 * 1024 })
  }
  return { mountRoot: extractRoot, mountPoint: null }
}

async function unmountImage(image: MountedImage): Promise<void> {
  if (!image.mountRoot.endsWith('/mount')) return
  const entries = await fs.readdir(image.mountRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    await execFileAsync('/usr/bin/hdiutil', ['detach', path.join(image.mountRoot, entry.name), '-force'], { timeout: 30_000, maxBuffer: 256 * 1024 }).catch(() => undefined)
  }
}

async function copyApplication(source: string, destination: string): Promise<void> {
  await execFileAsync('/usr/bin/ditto', ['--rsrc', '--extattr', '--acl', source, destination], { timeout: 180_000, maxBuffer: 256 * 1024 })
}

async function installApplication(source: string, target: string): Promise<void> {
  const parent = path.dirname(target)
  const basename = path.basename(target, '.app')
  const incoming = path.join(parent, `.${basename}.memento-update.app`)
  const backup = path.join(parent, `.${basename}.memento-backup.app`)
  await fs.rm(incoming, { recursive: true, force: true })
  await fs.rm(backup, { recursive: true, force: true })
  await copyApplication(source, incoming)
  try {
    await fs.rename(target, backup)
    await fs.rename(incoming, target)
  } catch (error) {
    await fs.rm(incoming, { recursive: true, force: true }).catch(() => undefined)
    if (!(await fs.stat(target).catch(() => null))) {
      await fs.rename(backup, target).catch(() => undefined)
    }
    throw error
  }
  await fs.rm(backup, { recursive: true, force: true })
}

export async function installSparkleUpdate({ target, downloadUrl, expectedVersion }: SparkleInstallInput): Promise<void> {
  const bundleId = await bundleValue(target, 'CFBundleIdentifier')
  const currentTeam = await signingTeamIdentifier(target)
  if (!bundleId || !currentTeam) throw new Error('无法验证当前应用身份，已停止更新')
  const parent = path.dirname(target)
  if (!['/Applications', path.join(os.homedir(), 'Applications')].includes(parent)) {
    throw new Error('应用不在受支持的安装目录中')
  }

  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'memento-sparkle-update-'))
  let mounted: MountedImage | null = null
  try {
    const archive = await downloadSparkleArchive(downloadUrl, workspace)
    mounted = await extractSparkleArchive(archive, workspace)
    if (!mounted) throw new Error('无法读取 Sparkle 更新包')
    const staged = await findApplicationBundle(mounted.mountRoot)
    if (!staged) throw new Error('更新包中没有找到应用')
    const stagedBundleId = await bundleValue(staged, 'CFBundleIdentifier')
    if (stagedBundleId !== bundleId) throw new Error('更新包与当前应用身份不匹配')
    if (expectedVersion) {
      const stagedVersion = await bundleValue(staged, 'CFBundleShortVersionString')
      if (stagedVersion && stagedVersion !== expectedVersion) throw new Error('更新包版本校验失败')
    }
    const stagedTeam = await signingTeamIdentifier(staged)
    if (stagedTeam !== currentTeam) throw new Error('更新包签名主体与当前应用不一致')
    await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged], { timeout: 60_000, maxBuffer: 512 * 1024 })
    await installApplication(staged, target)
    const installedBundleId = await bundleValue(target, 'CFBundleIdentifier')
    if (installedBundleId !== bundleId) throw new Error('更新后应用身份校验失败')
  } catch (error) {
    if (error instanceof Error && /EACCES|EPERM/.test(error.message)) {
      throw new Error('更新需要修改应用目录权限，请使用应用自带更新器或先授予权限')
    }
    throw error
  } finally {
    if (mounted) await unmountImage(mounted)
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function sparkleUpdaterCommand(target: string, pathValue = process.env.PATH ?? ''): string | null {
  const bundled = [
    path.join(target, 'Contents', 'Frameworks', 'Sparkle.framework', 'Versions', 'Current', 'Resources', 'sparkle.app', 'Contents', 'MacOS', 'sparkle'),
    path.join(target, 'Contents', 'Frameworks', 'Sparkle.framework', 'Versions', 'Current', 'sparkle')
  ]
  const candidates = [...bundled, ...pathValue.split(path.delimiter).filter(Boolean).map((root) => path.join(root, 'sparkle'))]
  return candidates.find((candidate) => {
    try {
      return existsSync(candidate)
    } catch {
      return false
    }
  }) ?? null
}

export async function runSparkleUpdater(target: string, command: string): Promise<void> {
  await execFileAsync(command, ['--check-immediately', '--interactive', '--user-agent-name', 'Memento', target], { timeout: 15 * 60_000, maxBuffer: 2 * 1024 * 1024 })
}

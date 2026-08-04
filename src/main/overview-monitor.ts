import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  OverviewHealthIssue,
  OverviewMetrics,
  OverviewProcess
} from '../shared/types'
import { parseDiskFree } from './parsers'

const execFileAsync = promisify(execFile)
const DEFAULT_INTERFACE_CACHE_MS = 30_000
const BATTERY_DETAILS_CACHE_MS = 5 * 60_000

interface CpuTick {
  idle: number
  total: number
}

interface NetworkCounter {
  interfaceName: string
  receivedBytes: number
  sentBytes: number
}

interface BatteryDetails {
  cycleCount: number | null
  healthPercent: number | null
}

interface HardwareDetails {
  model: string
  cpuModel: string
}

interface TimedCache<T> {
  value: T
  checkedAt: number
  diagnostic: string | null
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function round(value: number, precision = 1): number {
  const scale = 10 ** precision
  return Math.round(value * scale) / scale
}

async function run(command: string, args: string[], timeout = 3_000): Promise<string> {
  const result = await execFileAsync(command, args, {
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' }
  })
  return result.stdout
}

async function optionalCommand(
  diagnostics: string[],
  code: string,
  command: string,
  args: string[],
  timeout?: number
): Promise<string> {
  try {
    return await run(command, args, timeout)
  } catch {
    diagnostics.push(code)
    return ''
  }
}

export function cpuTicks(cpus: os.CpuInfo[]): CpuTick {
  return cpus.reduce<CpuTick>((summary, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
    summary.idle += cpu.times.idle
    summary.total += total
    return summary
  }, { idle: 0, total: 0 })
}

export function calculateCpuUsage(previous: CpuTick, current: CpuTick): number {
  const total = current.total - previous.total
  const idle = current.idle - previous.idle
  return total > 0 ? round(clampPercent((1 - idle / total) * 100)) : 0
}

export function parseDefaultInterface(output: string): string | null {
  return output.match(/^\s*interface:\s*(\S+)/m)?.[1] ?? null
}

export function parseNetworkCounter(output: string, interfaceName: string | null): NetworkCounter | null {
  if (!interfaceName) return null
  for (const line of output.split('\n')) {
    const fields = line.trim().split(/\s+/)
    if (fields[0] !== interfaceName || !fields[2]?.startsWith('<Link#') || fields.length < 11) continue
    const receivedBytes = Number.parseInt(fields[6], 10)
    const sentBytes = Number.parseInt(fields[9], 10)
    if (!Number.isFinite(receivedBytes) || !Number.isFinite(sentBytes)) return null
    return { interfaceName, receivedBytes, sentBytes }
  }
  return null
}

export function parseBattery(output: string): OverviewMetrics['battery'] {
  const percent = output.match(/(\d{1,3})%/)?.[1]
  const normalized = output.toLowerCase()
  const available = percent !== undefined
  const status = normalized.includes('discharging')
    ? 'discharging'
    : normalized.includes('charged')
      ? 'charged'
      : normalized.includes('charging')
        ? 'charging'
        : 'unknown'
  const powerSource = normalized.includes("'ac power'")
    ? 'ac'
    : normalized.includes("'battery power'")
      ? 'battery'
      : 'unknown'
  return {
    available,
    percent: available ? clampPercent(Number(percent)) : null,
    status,
    powerSource,
    cycleCount: null,
    healthPercent: null
  }
}

export function parseBatteryDetails(output: string): BatteryDetails {
  const numberValue = (key: string): number | null => {
    const value = output.match(new RegExp(`"${key}"\\s*=\\s*(\\d+)`))?.[1]
    return value === undefined ? null : Number.parseInt(value, 10)
  }
  const cycleCount = numberValue('CycleCount')
  const maxCapacity = numberValue('MaxCapacity')
  const designCapacity = numberValue('DesignCapacity')
  return {
    cycleCount,
    healthPercent: maxCapacity !== null && designCapacity && designCapacity > 0
      ? round(clampPercent(maxCapacity / designCapacity * 100))
      : null
  }
}

export function parseGpu(output: string): OverviewMetrics['gpu'] {
  const usage = output.match(/"Device Utilization %"\s*=\s*(\d+(?:\.\d+)?)/)?.[1] ??
    output.match(/"Device Utilization % at cur p-state"\s*=\s*(\d+(?:\.\d+)?)/)?.[1]
  const name = output.match(/"model"\s*=\s*<"([^"]+)"/)?.[1] ??
    output.match(/"GPURawCounterBundleName"\s*=\s*"([^"]+)"/)?.[1] ?? null
  return {
    name,
    usagePercent: usage === undefined ? null : round(clampPercent(Number(usage)))
  }
}

export function parseThermal(output: string): OverviewMetrics['thermal'] {
  const speed = output.match(/CPU_Speed_Limit\s*=\s*(\d+)/)?.[1]
  const available = output.match(/CPU_Available_CPUs\s*=\s*(\d+)/)?.[1]
  const cpuSpeedLimitPercent = speed === undefined ? null : clampPercent(Number(speed))
  return {
    state: cpuSpeedLimitPercent === null
      ? (output.includes('No thermal warning') ? 'normal' : 'unknown')
      : cpuSpeedLimitPercent < 100 ? 'limited' : 'normal',
    cpuSpeedLimitPercent,
    availableCpus: available === undefined ? null : Number.parseInt(available, 10)
  }
}

export function parseVmStat(output: string, totalBytes: number): OverviewMetrics['memory'] | null {
  const pageSize = Number.parseInt(output.match(/page size of (\d+) bytes/i)?.[1] ?? '', 10)
  if (!Number.isFinite(pageSize) || pageSize <= 0 || totalBytes <= 0) return null
  const pages = new Map<string, number>()
  for (const line of output.split('\n')) {
    const match = line.match(/^([^:]+):\s+(\d+)\.?\s*$/)
    if (match) pages.set(match[1].trim(), Number.parseInt(match[2], 10))
  }
  if (!pages.has('Pages free')) return null
  const availablePages = (
    (pages.get('Pages free') ?? 0) +
    (pages.get('Pages inactive') ?? 0) +
    (pages.get('Pages speculative') ?? 0)
  )
  const availableBytes = Math.min(totalBytes, Math.max(0, availablePages * pageSize))
  const usedBytes = Math.max(0, totalBytes - availableBytes)
  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usedPercent: round(usedBytes / totalBytes * 100)
  }
}

function processName(command: string): string {
  const binary = path.basename(command.trim())
  return binary || command.trim()
}

export function parseProcesses(output: string, limit = 12): OverviewProcess[] {
  const processes: OverviewProcess[] = []
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/)
    if (!match) continue
    const [, pid, cpu, memory, rss, command] = match
    processes.push({
      pid: Number.parseInt(pid, 10),
      name: processName(command),
      command,
      cpuPercent: round(Number(cpu)),
      memoryPercent: round(Number(memory)),
      memoryBytes: Number.parseInt(rss, 10) * 1024
    })
  }
  return processes
    .sort((left, right) => right.cpuPercent - left.cpuPercent || right.memoryBytes - left.memoryBytes)
    .slice(0, Math.max(1, limit))
}

export function calculateOverviewHealth(input: {
  cpuPercent: number
  memoryPercent: number
  diskUsedPercent: number
  thermalLimited: boolean
  batteryHealthPercent: number | null
  uptimeSeconds: number
}): OverviewMetrics['health'] {
  let score = 100
  const issues: OverviewHealthIssue[] = []
  if (input.cpuPercent >= 85) {
    score -= Math.min(22, 10 + (input.cpuPercent - 85) * 0.8)
    issues.push('cpu-high')
  } else if (input.cpuPercent >= 65) score -= 6
  if (input.memoryPercent >= 90) {
    score -= 18
    issues.push('memory-high')
  } else if (input.memoryPercent >= 80) score -= 8
  if (input.diskUsedPercent >= 93) {
    score -= 22
    issues.push('disk-low')
  } else if (input.diskUsedPercent >= 82) score -= 9
  if (input.thermalLimited) {
    score -= 15
    issues.push('thermal-limited')
  }
  if (input.batteryHealthPercent !== null && input.batteryHealthPercent < 75) {
    score -= 6
    issues.push('battery-service')
  }
  if (input.uptimeSeconds >= 21 * 86_400) {
    score -= 4
    issues.push('restart-recommended')
  }
  const rounded = Math.max(0, Math.min(100, Math.round(score)))
  return {
    score: rounded,
    status: rounded >= 88 ? 'excellent' : rounded >= 72 ? 'good' : rounded >= 52 ? 'fair' : 'attention',
    issues
  }
}

export class OverviewMonitor {
  private previousCpu = cpuTicks(os.cpus())
  private previousNetwork: NetworkCounter | null = null
  private previousNetworkAt = Date.now()
  private hardware: HardwareDetails | null = null
  private defaultInterface: TimedCache<string | null> | null = null
  private batteryDetails: TimedCache<BatteryDetails> | null = null
  private osVersionValue: string | null = null
  private inFlight: Promise<OverviewMetrics> | null = null

  async collect(): Promise<OverviewMetrics> {
    if (this.inFlight) return this.inFlight
    const request = this.collectSnapshot()
    this.inFlight = request
    try {
      return await request
    } finally {
      if (this.inFlight === request) this.inFlight = null
    }
  }

  private async collectSnapshot(): Promise<OverviewMetrics> {
    const diagnostics: string[] = []
    const now = Date.now()
    const currentCpu = cpuTicks(os.cpus())
    const cpuUsage = calculateCpuUsage(this.previousCpu, currentCpu)
    this.previousCpu = currentCpu
    const memoryTotal = os.totalmem()
    const [diskOutput, memoryOutput, interfaceName, networkOutput, batteryOutput, batteryDetails, gpuOutput, thermalOutput, processOutput] = await Promise.all([
      optionalCommand(diagnostics, 'overview.disk.unavailable', '/bin/df', ['-k', '/']),
      optionalCommand(diagnostics, 'overview.memory.unavailable', '/usr/bin/vm_stat', []),
      this.collectDefaultInterface(diagnostics, now),
      optionalCommand(diagnostics, 'overview.network.counters-unavailable', '/usr/sbin/netstat', ['-ibn']),
      optionalCommand(diagnostics, 'overview.battery.unavailable', '/usr/bin/pmset', ['-g', 'batt']),
      this.collectBatteryDetails(diagnostics, now),
      optionalCommand(diagnostics, 'overview.gpu.unavailable', '/usr/sbin/ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator']),
      optionalCommand(diagnostics, 'overview.thermal.unavailable', '/usr/bin/pmset', ['-g', 'therm']),
      optionalCommand(diagnostics, 'overview.processes.unavailable', '/bin/ps', ['-axo', 'pid=,%cpu=,%mem=,rss=,comm='])
    ])

    if (!this.hardware) this.hardware = await this.collectHardware(diagnostics)
    let disk = { totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPercent: 0 }
    try {
      const parsed = parseDiskFree(diskOutput)
      if (parsed.totalBytes <= 0) throw new Error('Disk capacity is unavailable')
      const usedBytes = Math.max(0, parsed.totalBytes - parsed.freeBytes)
      disk = {
        totalBytes: parsed.totalBytes,
        usedBytes,
        freeBytes: parsed.freeBytes,
        usedPercent: parsed.totalBytes ? round(usedBytes / parsed.totalBytes * 100) : 0
      }
    } catch {
      if (!diagnostics.includes('overview.disk.unavailable')) diagnostics.push('overview.disk.invalid')
    }

    const networkCounter = parseNetworkCounter(networkOutput, interfaceName)
    const elapsedSeconds = Math.max(0.25, (now - this.previousNetworkAt) / 1000)
    const sameInterface = networkCounter && this.previousNetwork?.interfaceName === networkCounter.interfaceName
    const receivedBytesPerSecond = sameInterface
      ? Math.max(0, (networkCounter.receivedBytes - this.previousNetwork!.receivedBytes) / elapsedSeconds)
      : 0
    const sentBytesPerSecond = sameInterface
      ? Math.max(0, (networkCounter.sentBytes - this.previousNetwork!.sentBytes) / elapsedSeconds)
      : 0
    this.previousNetwork = networkCounter
    this.previousNetworkAt = now

    const parsedMemory = parseVmStat(memoryOutput, memoryTotal)
    if (!parsedMemory && !diagnostics.includes('overview.memory.unavailable')) {
      diagnostics.push('overview.memory.invalid')
    }
    const fallbackAvailable = os.freemem()
    const memory = parsedMemory ?? {
      totalBytes: memoryTotal,
      usedBytes: Math.max(0, memoryTotal - fallbackAvailable),
      availableBytes: fallbackAvailable,
      usedPercent: memoryTotal ? round((memoryTotal - fallbackAvailable) / memoryTotal * 100) : 0
    }
    const battery = parseBattery(batteryOutput)
    battery.cycleCount = batteryDetails.cycleCount
    battery.healthPercent = batteryDetails.healthPercent
    const thermal = parseThermal(thermalOutput)
    const uptimeSeconds = os.uptime()
    const loadAverage = os.loadavg()
    const health = calculateOverviewHealth({
      cpuPercent: cpuUsage,
      memoryPercent: memory.usedPercent,
      diskUsedPercent: disk.usedPercent,
      thermalLimited: thermal.state === 'limited',
      batteryHealthPercent: battery.healthPercent,
      uptimeSeconds
    })

    return {
      collectedAt: new Date(now).toISOString(),
      hostname: os.hostname().replace(/\.local$/, ''),
      osVersion: await this.osVersion(),
      uptimeSeconds,
      hardware: {
        ...this.hardware,
        architecture: os.arch(),
        logicalCores: os.cpus().length
      },
      health,
      cpu: {
        usagePercent: cpuUsage,
        loadAverage: [loadAverage[0] ?? 0, loadAverage[1] ?? 0, loadAverage[2] ?? 0]
      },
      gpu: parseGpu(gpuOutput),
      memory,
      disk,
      network: {
        interfaceName: networkCounter?.interfaceName ?? interfaceName,
        receivedBytesPerSecond: round(receivedBytesPerSecond, 0),
        sentBytesPerSecond: round(sentBytesPerSecond, 0)
      },
      battery,
      thermal,
      processes: parseProcesses(processOutput),
      diagnostics: [...new Set(diagnostics)]
    }
  }

  private async collectHardware(diagnostics: string[]): Promise<HardwareDetails> {
    const output = await optionalCommand(
      diagnostics,
      'overview.hardware.unavailable',
      '/usr/sbin/sysctl',
      ['-n', 'hw.model']
    )
    return {
      model: output.trim() || 'Mac',
      cpuModel: os.cpus()[0]?.model ?? ''
    }
  }

  private async collectDefaultInterface(diagnostics: string[], now: number): Promise<string | null> {
    if (this.defaultInterface && now - this.defaultInterface.checkedAt < DEFAULT_INTERFACE_CACHE_MS) {
      if (this.defaultInterface.diagnostic) diagnostics.push(this.defaultInterface.diagnostic)
      return this.defaultInterface.value
    }
    let value: string | null = null
    let diagnostic: string | null = null
    try {
      value = parseDefaultInterface(await run('/sbin/route', ['-n', 'get', 'default']))
      if (!value) diagnostic = 'overview.network.interface-invalid'
    } catch {
      diagnostic = 'overview.network.interface-unavailable'
    }
    this.defaultInterface = { value, checkedAt: now, diagnostic }
    if (diagnostic) diagnostics.push(diagnostic)
    return value
  }

  private async collectBatteryDetails(diagnostics: string[], now: number): Promise<BatteryDetails> {
    if (this.batteryDetails && now - this.batteryDetails.checkedAt < BATTERY_DETAILS_CACHE_MS) {
      if (this.batteryDetails.diagnostic) diagnostics.push(this.batteryDetails.diagnostic)
      return this.batteryDetails.value
    }
    let value: BatteryDetails = { cycleCount: null, healthPercent: null }
    let diagnostic: string | null = null
    try {
      value = parseBatteryDetails(await run('/usr/sbin/ioreg', ['-r', '-c', 'AppleSmartBattery', '-w', '0']))
    } catch {
      diagnostic = 'overview.battery-health.unavailable'
    }
    this.batteryDetails = { value, checkedAt: now, diagnostic }
    if (diagnostic) diagnostics.push(diagnostic)
    return value
  }

  private async osVersion(): Promise<string> {
    if (this.osVersionValue) return this.osVersionValue
    try {
      this.osVersionValue = (await run('/usr/bin/sw_vers', ['-productVersion'])).trim()
    } catch {
      this.osVersionValue = os.release()
    }
    return this.osVersionValue
  }
}

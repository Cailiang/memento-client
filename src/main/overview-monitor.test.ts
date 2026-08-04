import { describe, expect, it } from 'vitest'
import {
  calculateCpuUsage,
  calculateOverviewHealth,
  parseBattery,
  parseBatteryDetails,
  parseDefaultInterface,
  parseGpu,
  parseNetworkCounter,
  parseProcesses,
  parseThermal,
  parseVmStat
} from './overview-monitor'

describe('overview monitor parsing', () => {
  it('calculates CPU utilization from cumulative ticks', () => {
    expect(calculateCpuUsage({ idle: 400, total: 1000 }, { idle: 450, total: 1200 })).toBe(75)
  })

  it('parses the active network interface and its link counters', () => {
    expect(parseDefaultInterface(' gateway: 192.168.1.1\n interface: en0\n')).toBe('en0')
    expect(parseNetworkCounter(
      'en0 1500 <Link#9> aa:bb:cc:dd:ee:ff 40 0 12000 20 0 6000 0\n' +
      'en0 1500 192.168.1/24 192.168.1.4 40 - 12000 20 - 6000 -',
      'en0'
    )).toEqual({ interfaceName: 'en0', receivedBytes: 12000, sentBytes: 6000 })
  })

  it('parses battery, GPU, thermal, and process snapshots conservatively', () => {
    expect(parseBattery("Now drawing from 'AC Power'\n -InternalBattery-0 65%; charging; 1:20 remaining")).toMatchObject({
      available: true,
      percent: 65,
      status: 'charging',
      powerSource: 'ac'
    })
    expect(parseBatteryDetails('"CycleCount" = 412\n"MaxCapacity" = 4400\n"DesignCapacity" = 5000')).toEqual({
      cycleCount: 412,
      healthPercent: 88
    })
    expect(parseGpu('"Device Utilization %"=13')).toMatchObject({ usagePercent: 13 })
    expect(parseThermal('CPU_Available_CPUs = 6\nCPU_Speed_Limit = 70')).toEqual({
      state: 'limited',
      cpuSpeedLimitPercent: 70,
      availableCpus: 6
    })
    expect(parseProcesses(' 42 88.4 2.5 1048576 /Applications/Code.app/Contents/MacOS/Code\n')).toEqual([{
      pid: 42,
      name: 'Code',
      command: '/Applications/Code.app/Contents/MacOS/Code',
      cpuPercent: 88.4,
      memoryPercent: 2.5,
      memoryBytes: 1024 ** 3
    }])
  })

  it('counts reclaimable macOS pages as available memory', () => {
    expect(parseVmStat(
      'Mach Virtual Memory Statistics: (page size of 4096 bytes)\n' +
      'Pages free: 100.\nPages active: 400.\nPages inactive: 200.\nPages speculative: 50.\n',
      1_000 * 4096
    )).toEqual({
      totalBytes: 4_096_000,
      usedBytes: 2_662_400,
      availableBytes: 1_433_600,
      usedPercent: 65
    })
  })

  it('keeps the health score tied to observable pressure', () => {
    expect(calculateOverviewHealth({
      cpuPercent: 20,
      memoryPercent: 50,
      diskUsedPercent: 60,
      thermalLimited: false,
      batteryHealthPercent: 92,
      uptimeSeconds: 86_400
    })).toEqual({ score: 100, status: 'excellent', issues: [] })
    expect(calculateOverviewHealth({
      cpuPercent: 94,
      memoryPercent: 93,
      diskUsedPercent: 96,
      thermalLimited: true,
      batteryHealthPercent: 68,
      uptimeSeconds: 30 * 86_400
    })).toMatchObject({
      status: 'attention',
      issues: ['cpu-high', 'memory-high', 'disk-low', 'thermal-limited', 'battery-service', 'restart-recommended']
    })
  })
})

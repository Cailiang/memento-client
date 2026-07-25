import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { NormalizedTerminalReport, SanitizedSource } from '../../shared/ai-types'
import type { ScanResult, TerminalFinding } from '../../shared/types'
import { REDACTION_VERSION, redactText } from './redact'

const allowedAttributes: Partial<Record<TerminalFinding['code'], string[]>> = {
  shell_file_large: ['lineCount', 'sizeBytes'],
  path_missing_entries: ['missingCount'],
  path_duplicate_entries: ['duplicateCount'],
  nvm_eager_load: ['line'],
  pyenv_eager_init: ['line'],
  conda_eager_init: ['line'],
  ruby_manager_eager_init: ['line'],
  compinit_detected: ['line'],
  network_call_during_startup: ['line']
}
function shellFamily(shell: string): NormalizedTerminalReport['shell']['family'] {
  const name = path.basename(shell).toLowerCase()
  if (name.includes('zsh')) return 'zsh'
  if (name.includes('bash')) return 'bash'
  if (name.includes('fish')) return 'fish'
  return 'other'
}

function sanitizeSource(source?: string): SanitizedSource | null {
  if (!source) return null
  const configMatch = source.match(/(~\/\.(?:zshrc|zprofile|zshenv|zlogin))(?::(\d+))?$/)
  if (configMatch) {
    return {
      kind: 'shell-config',
      logicalPath: configMatch[1],
      line: configMatch[2] ? Number.parseInt(configMatch[2], 10) : undefined
    }
  }
  if (source === '当前 shell 环境') return { kind: 'environment' }
  if (source === '启动基线对比' || source.endsWith('/zsh') || source.endsWith('/bash')) {
    return { kind: 'measurement' }
  }
  return { kind: 'unknown' }
}

function sanitizeAttributes(finding: TerminalFinding): Record<string, string | number | boolean> {
  const allowed = new Set(allowedAttributes[finding.code] ?? [])
  const attributes: Record<string, string | number | boolean> = {}
  for (const [key, rawValue] of Object.entries(finding.attributes ?? {})) {
    if (!allowed.has(key)) continue
    if (typeof rawValue === 'string') {
      const redacted = redactText(rawValue)
      attributes[key] = redacted.value.slice(0, 160)
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      attributes[key] = rawValue
    } else if (typeof rawValue === 'boolean') {
      attributes[key] = rawValue
    }
  }
  return attributes
}

export function normalizeTerminalReport(result: ScanResult): NormalizedTerminalReport {
  const majorVersion = Number.parseInt(result.system.osVersion.split('.')[0] ?? '', 10)
  const architecture = process.arch === 'arm64' || process.arch === 'x64' ? process.arch : 'unknown'
  const configCostMs =
    result.terminal.baselineMs !== null && result.terminal.startupMs !== null
      ? Math.max(0, result.terminal.startupMs - result.terminal.baselineMs)
      : null

  return {
    schemaVersion: 1,
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    platform: {
      os: 'macos',
      osMajorVersion: Number.isFinite(majorVersion) ? majorVersion : 0,
      architecture
    },
    shell: {
      family: shellFamily(result.terminal.shell),
      baselineMs: result.terminal.baselineMs,
      startupMs: result.terminal.startupMs,
      configCostMs,
      sampleCount: Math.max(0, Math.min(result.terminal.sampleCount, 10))
    },
    findings: result.terminal.findings.slice(0, 64).map((finding) => ({
      id: finding.id.slice(0, 100),
      code: finding.code,
      severity: finding.severity,
      durationMs:
        finding.durationMs !== undefined && Number.isFinite(finding.durationMs)
          ? Math.max(0, finding.durationMs)
          : undefined,
      source: sanitizeSource(finding.source),
      attributes: sanitizeAttributes(finding)
    })),
    configFiles: result.terminal.configFiles.map((file) => ({
      logicalPath: file.logicalPath,
      exists: file.exists,
      lineCount: file.lineCount,
      sizeBytes: file.sizeBytes
    })),
    privacy: {
      rawConfigIncluded: false,
      redactionVersion: REDACTION_VERSION,
      removedFieldCount: 4
    }
  }
}

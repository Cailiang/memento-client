import { createHash, randomUUID } from 'node:crypto'
import type {
  AiAnalysisKind,
  AiDataPreview,
  AiProviderId,
  NormalizedAiReport
} from '../../shared/ai-types'
import { AiError } from './errors'

interface PreviewEntry {
  preview: AiDataPreview
  scanId: string
  payloadHash: string
}

function payloadHash(payload: NormalizedAiReport): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export class PreviewStore {
  private readonly entries = new Map<string, PreviewEntry>()

  constructor(private readonly ttlMs = 5 * 60_000) {}

  create(
    scanId: string,
    providerId: AiProviderId,
    kind: AiAnalysisKind,
    payload: NormalizedAiReport
  ): AiDataPreview {
    const serialized = JSON.stringify(payload)
    if (Buffer.byteLength(serialized) > 64 * 1024) {
      throw new AiError('AI_INPUT_TOO_LARGE', '脱敏报告超过 64 KiB，无法发送')
    }
    const terminalPayload = 'findings' in payload ? payload : null
    const preview: AiDataPreview = {
      previewId: randomUUID(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      providerId,
      kind,
      summary: {
        recordCount: terminalPayload ? terminalPayload.findings.length : 1,
        findingCount: terminalPayload?.findings.length,
        configFileCount:
          terminalPayload?.configFiles.filter((file) => file.exists).length,
        includesRawConfig: false,
        approximateInputTokens: Math.ceil(serialized.length / 3.6)
      },
      payload
    }
    this.entries.set(preview.previewId, {
      preview,
      scanId,
      payloadHash: payloadHash(payload)
    })
    return preview
  }

  consume(previewId: string, providerId: string, currentScanId: string): AiDataPreview {
    const entry = this.entries.get(previewId)
    if (!entry || Date.parse(entry.preview.expiresAt) <= Date.now()) {
      this.entries.delete(previewId)
      throw new AiError('AI_PREVIEW_EXPIRED', '数据预览已过期，请重新准备')
    }
    if (entry.scanId !== currentScanId) {
      throw new AiError('AI_SCAN_CHANGED', '扫描结果已经变化，请重新准备分析')
    }
    if (entry.preview.providerId !== providerId) {
      throw new AiError('AI_PROVIDER_NOT_CONFIGURED', 'Provider 与确认时不一致')
    }
    if (entry.payloadHash !== payloadHash(entry.preview.payload)) {
      throw new AiError('AI_REDACTION_FAILED', '数据预览完整性校验失败')
    }
    this.entries.delete(previewId)
    return entry.preview
  }

  invalidateAll(): void {
    this.entries.clear()
  }
}

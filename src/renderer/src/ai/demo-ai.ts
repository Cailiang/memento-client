import type {
  AiDataPreview,
  AiTerminalAnalysis,
  HostedLoginState,
  HostedSessionState,
  MementoAiApi,
  ProviderHealth,
  PublicAiSettings,
  UpdateAiSettingsInput
} from '../../../shared/ai-types'
import { demoResult } from '../demo'

let settings: PublicAiSettings = {
  mode: 'hosted',
  providerId: 'memento-hosted',
  model: null,
  allowRawConfig: false,
  showDataPreview: true,
  keyPresent: false,
  keyHint: null,
  hostedGatewayUrl: 'http://127.0.0.1:8787'
}

let preview: AiDataPreview | null = null

const wait = (duration: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, duration))

function providerForMode(mode: UpdateAiSettingsInput['mode']): PublicAiSettings['providerId'] {
  if (mode === 'local') return 'ollama'
  if (mode === 'byok') return 'tczor-byok'
  if (mode === 'hosted') return 'memento-hosted'
  return null
}

export const demoAiApi: MementoAiApi = {
  async getAiSettings(): Promise<PublicAiSettings> {
    return settings
  },
  async updateAiSettings(input): Promise<PublicAiSettings> {
    const keyPresent = input.clearByokKey
      ? false
      : Boolean(input.byokApiKey) || settings.keyPresent
    settings = {
      ...settings,
      mode: input.mode,
      providerId: providerForMode(input.mode),
      model:
        input.model ??
        (input.mode === 'local' ? 'qwen2.5:7b' : input.mode === 'byok' ? 'grok-4.5' : null),
      keyPresent,
      keyHint: input.byokApiKey ? input.byokApiKey.slice(-4) : keyPresent ? settings.keyHint : null
    }
    return settings
  },
  async testAiProvider(): Promise<ProviderHealth> {
    await wait(350)
    return { available: true, authenticated: true, models: ['qwen2.5:7b', 'llama3.2:3b'] }
  },
  async prepareTerminalAnalysis(): Promise<AiDataPreview> {
    await wait(350)
    if (!settings.providerId) throw new Error('请先选择 AI 模式')
    const configCostMs = Math.max(
      0,
      (demoResult.terminal.startupMs ?? 0) - (demoResult.terminal.baselineMs ?? 0)
    )
    preview = {
      previewId: 'browser-preview',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      providerId: settings.providerId,
      kind: 'terminal',
      summary: {
        recordCount: demoResult.terminal.findings.length,
        findingCount: demoResult.terminal.findings.length,
        configFileCount: demoResult.terminal.configFiles.filter((file) => file.exists).length,
        includesRawConfig: false,
        approximateInputTokens: 486
      },
      payload: {
        schemaVersion: 1,
        reportId: 'browser-report',
        generatedAt: new Date().toISOString(),
        platform: { os: 'macos', osMajorVersion: 15, architecture: 'arm64' },
        shell: {
          family: 'zsh',
          baselineMs: demoResult.terminal.baselineMs,
          startupMs: demoResult.terminal.startupMs,
          configCostMs,
          sampleCount: 3
        },
        findings: demoResult.terminal.findings.map((finding) => ({
          id: finding.id,
          code: finding.code,
          severity: finding.severity,
          durationMs: finding.durationMs,
          source: finding.source?.startsWith('~/.')
            ? {
                kind: 'shell-config' as const,
                logicalPath: finding.source.split(':')[0],
                line: Number(finding.source.split(':')[1]) || undefined
              }
            : { kind: 'measurement' as const },
          attributes: finding.attributes ?? {}
        })),
        configFiles: demoResult.terminal.configFiles,
        privacy: {
          rawConfigIncluded: false,
          redactionVersion: 'memento-redactor-v1',
          removedFieldCount: 4
        }
      }
    }
    return preview
  },
  async prepareCandidateAnalysis(input): Promise<AiDataPreview> {
    await wait(250)
    if (!settings.providerId) throw new Error('请先启用 AI')
    const candidate = demoResult.candidates.find((item) => item.id === input.candidateId)
    if (!candidate || (candidate.section !== 'services' && candidate.section !== 'storage')) {
      throw new Error('该项目不支持 AI 分析')
    }
    const kind = candidate.section === 'services' ? 'service' : 'storage'
    preview = {
      previewId: `browser-${kind}-preview`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      providerId: settings.providerId,
      kind,
      summary: {
        recordCount: 1,
        includesRawConfig: false,
        approximateInputTokens: 180
      },
      payload: {
        schemaVersion: 1,
        reportId: `browser-${kind}-report`,
        generatedAt: new Date().toISOString(),
        analysisKind: kind,
        platform: { os: 'macos', osMajorVersion: 15, architecture: 'arm64' },
        candidate: {
          id: 'candidate',
          name: candidate.name,
          category: kind === 'service' ? 'background-service' : 'storage-other',
          ruleRisk: candidate.risk,
          status: kind === 'service' ? 'running' : candidate.risk === 'protected' ? 'analysis-only' : 'reclaimable',
          sizeBytes: candidate.sizeBytes,
          ageDays: candidate.ageDays,
          availableActions: (candidate.operations ?? (candidate.action ? [{ ...candidate.action, id: candidate.id }] : [])).map((item) => ({
            kind: item.kind,
            reversible: item.reversible
          })),
          facts: { locallyActionable: Boolean(candidate.action || candidate.operations?.length) }
        },
        privacy: {
          rawPathsIncluded: false,
          rawContentIncluded: false,
          redactionVersion: 'memento-redactor-v1',
          removedFieldCount: candidate.evidence.length + 3
        }
      }
    }
    return preview
  },
  async analyzeTerminal(): Promise<AiTerminalAnalysis> {
    await wait(1_200)
    return {
      schemaVersion: 1,
      requestId: 'browser-analysis',
      generatedAt: new Date().toISOString(),
      provider: { id: settings.providerId ?? 'demo', model: settings.model ?? 'managed' },
      summary: {
        diagnosis: '终端的主要延迟来自用户配置层，NVM 与补全初始化应优先核对。',
        expectedPriority: 'high'
      },
      suggestions: [
        {
          id: 'suggestion-nvm',
          title: '把 NVM 改为按需加载',
          explanation: '当前扫描在 .zshrc 中识别到 NVM 同步初始化。可先备份配置，再仅在首次调用 Node 工具时加载。',
          evidenceFindingIds: ['demo-terminal-nvm', 'demo-terminal-config'],
          confidence: 0.91,
          risk: 'behavior-change',
          action: {
            kind: 'show-manual-steps',
            steps: ['备份 ~/.zshrc', '将 NVM 初始化包装为按需加载函数', '新开终端并重新扫描']
          }
        },
        {
          id: 'suggestion-compinit',
          title: '检查 compinit 是否重复执行',
          explanation: '补全初始化位于已识别的配置位置。确认只调用一次，并复用现有的 .zcompdump。',
          evidenceFindingIds: ['demo-terminal-compinit'],
          confidence: 0.82,
          risk: 'review',
          action: { kind: 'explain-only' }
        }
      ],
      limitations: ['本次报告不包含配置原文，无法判断 NVM 与 compinit 的完整加载顺序。']
    }
  },
  async analyzeCandidate(): Promise<AiTerminalAnalysis> {
    await wait(900)
    const kind = preview?.kind === 'service' ? 'service' : 'storage'
    const english = document.documentElement.lang === 'en-US'
    return {
      schemaVersion: 1,
      requestId: `browser-${kind}-analysis`,
      generatedAt: new Date().toISOString(),
      provider: { id: 'mock', model: 'grok-4.5' },
      summary: {
        diagnosis: kind === 'service'
          ? english
            ? 'This runs in the background so its app can keep working when its window is closed.'
            : '这是某个软件的后台程序，用来让软件关闭窗口后仍能继续工作。'
          : english
            ? 'These files are kept by an app and may include temporary files or important personal content.'
            : '这些是软件保存的文件，里面可能有临时文件，也可能有你的重要内容。',
        expectedPriority: 'medium'
      },
      suggestions: [{
        id: `browser-${kind}-suggestion`,
        title: kind === 'service'
          ? (english ? 'Can I stop or remove it?' : '能不能停止或删除')
          : (english ? 'Can I clean it up?' : '能不能清理'),
        explanation: kind === 'service'
          ? english
            ? 'Do not stop or remove it yet. Memento cannot tell which app needs it, and that app may stop working.'
            : '先不要停止，也不要删除。Memento 还不知道哪个软件正在使用它，处理后那个软件可能无法正常工作。'
          : english
            ? 'Do not clean it yet. Memento cannot confirm that these files can be safely created again.'
            : '先不要清理。Memento 还不能确认这些文件是否能重新生成，删除后可能无法找回。',
        evidenceFindingIds: ['candidate'],
        confidence: 0.78,
        risk: 'review',
        action: { kind: 'explain-only' }
      }],
      limitations: []
    }
  },
  async cancelAnalysis(): Promise<void> {},
  async getHostedSession(): Promise<HostedSessionState> {
    return { authenticated: settings.mode === 'hosted', plan: 'development', dailyRemaining: 3, monthlyRemaining: 30 }
  },
  async startHostedLogin(): Promise<HostedLoginState> {
    return { status: 'authenticated', message: '演示环境已登录' }
  },
  async logoutHosted(): Promise<void> {},
}

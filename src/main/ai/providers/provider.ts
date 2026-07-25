import type {
  AiCandidateAnalysisKind,
  AiTerminalAnalysis,
  NormalizedCandidateReport,
  NormalizedTerminalReport,
  ProviderHealth
} from '../../../shared/ai-types'

export interface AiRequestContext {
  requestId: string
  locale: 'zh-CN' | 'en-US'
  maxOutputTokens: number
}

export interface AiProvider {
  readonly id: string
  readonly kind: 'local' | 'byok' | 'hosted'
  readonly model: string
  health(signal?: AbortSignal): Promise<ProviderHealth>
  analyzeTerminal(
    report: NormalizedTerminalReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis>
  analyzeCandidate(
    report: NormalizedCandidateReport,
    context: AiRequestContext,
    signal?: AbortSignal
  ): Promise<AiTerminalAnalysis>
}

export function outputLanguageInstruction(locale: AiRequestContext['locale']): string {
  return locale === 'en-US'
    ? 'All user-facing natural-language values in diagnosis, title, explanation, steps, and limitations MUST be written in English. Keep JSON keys and enum values unchanged.'
    : 'diagnosis、title、explanation、steps 和 limitations 中所有面向用户的自然语言内容必须使用简体中文。JSON 键名和枚举值保持不变。'
}

const OUTPUT_SCHEMA =
  '{"summary":{"diagnosis":"string","expectedPriority":"low|medium|high"},"suggestions":[{"id":"string","title":"string","explanation":"string","evidenceFindingIds":["evidence-id"],"confidence":0.0,"risk":"informational|review|behavior-change","action":{"kind":"explain-only|show-manual-steps","steps":["string"]}}],"limitations":["string"]}'

const CANDIDATE_OUTPUT_SCHEMA =
  '{"summary":{"diagnosis":"string","expectedPriority":"low|medium|high"},"suggestions":[{"id":"impact","title":"string","explanation":"string","evidenceFindingIds":["candidate"],"confidence":0.0,"risk":"informational|review|behavior-change","action":{"kind":"explain-only","steps":[]}}],"limitations":["string"]}'

export const TERMINAL_ANALYSIS_INSTRUCTIONS = [
  '你是谨慎的 macOS 终端启动诊断助手。',
  '只依据输入的结构化报告给出结论，不要声称执行了命令。',
  '不得建议直接永久删除文件，不得要求密钥、环境变量值或完整配置原文。',
  '不要编造输入中不存在的耗时；证据不足时写入 limitations。',
  '只能返回 JSON，不要使用 Markdown 代码围栏。',
  '返回结构必须是：',
  OUTPUT_SCHEMA,
  '当建议可能改变 shell 行为时，risk 必须是 behavior-change。'
].join('\n')

const CANDIDATE_COMMON_INSTRUCTIONS = [
  '只依据输入的结构化报告和你对常见 macOS 软件的知识给出结论，不要声称执行了命令或检查了本机其他内容。',
  '本地规则的 ruleRisk 和 availableActions 是唯一可执行事实；AI 不能新增、选择、触发或扩大任何操作。',
  '读者是不懂电脑术语的普通用户。像向家人解释一样使用常用词和短句，让人看一遍就能决定。',
  '只回答两个问题：它是什么；现在能不能停止、删除或清理，以及这样做的直接后果。不要给操作教程或延伸建议。',
  'summary.diagnosis 只用 1 句说明它属于哪个软件、具体帮用户做什么；中文不超过 45 个字，英文不超过 18 个词。',
  '必须恰好返回 1 条建议。suggestion.explanation 必须先给明确结论，再说明最直接的后果。',
  '结论必须使用“可以处理”或“先不要处理”的明确语气。信息不足时直接说“先不要处理”，不能把决定推回给用户。',
  '不要用“可能、通常、取决于、建议核对、需要确认”等模糊说法作为结论。',
  '不要直接使用进程、守护进程、启动项、Bundle ID、依赖、工作流、可重建、构建产物、虚拟磁盘等术语；必须提及时改成普通人能懂的日常说法。',
  'suggestion.id 必须是 impact，action.kind 必须是 explain-only，action.steps 必须为空数组。',
  '不得输出命令、脚本、文件路径或直接永久删除建议。证据不足时必须明确写入 limitations。',
  'limitations 最多 1 条；没有必要说明的局限时返回空数组。',
  '中文总回答不超过 120 字，英文总回答不超过 3 个短句，避免重复输入中的名称和状态。',
  '只能返回 JSON，不要使用 Markdown 代码围栏。',
  '每条建议的 evidenceFindingIds 只能填写 candidate。',
  '返回结构必须是：',
  CANDIDATE_OUTPUT_SCHEMA
]

export function candidateAnalysisInstructions(kind: AiCandidateAnalysisKind): string {
  const specific = kind === 'service'
    ? [
        '你是谨慎的 macOS 后台服务识别助手。',
        'diagnosis 简洁说明它属于哪个软件，以及这个软件为什么让它在后台运行。',
        '唯一一条 suggestion 的 title 使用“能不能停止或删除”语义。explanation 先明确说“可以停止”或“先不要停止”；如果 availableActions 有删除软件的操作，再明确说“可以删除”或“先不要删除”。',
        '把停止解释为“暂时关闭，之后还能重新打开”，把删除解释为“移走软件及扫描明确找到的相关内容”。不要使用“进程、自动启动、依赖、数据库、数据库连接、数据库访问、工作流”等词。',
        '例如 PostgreSQL 要解释为“帮助其他软件保存和读取资料的工具”，英文要写成 “a tool apps use to save and load their information”，不要只写 database 或 database access。',
        '涉及保存数据、同步文件、备份、安全防护或远程控制时，必须用日常语言说明哪项常用功能会停止。身份无法可靠识别时，结论必须是“先不要停止，也不要删除”。'
      ]
    : [
        '你是谨慎的 macOS 存储空间分析助手。',
        'diagnosis 简洁说明里面保存的是临时文件、可再次生成的文件，还是用户自己的重要内容。',
        '唯一一条 suggestion 的 title 使用“能不能清理”语义。explanation 必须先明确说“可以清理”或“先不要清理”，再说明之后是会自动重新下载、由软件重新生成、永久丢失内容，还是让软件不能正常使用。',
        '不要使用“缓存、构建产物、应用数据、虚拟磁盘、可重建”等分类词，改成用户熟悉的说法。对于 protected 或 analysis-only 项目，结论必须是“先不要清理”。',
        '只能帮助用户判断是否值得选择本地扫描已经提供的操作，不得自行设计新的清理范围。'
      ]
  return [...specific, ...CANDIDATE_COMMON_INSTRUCTIONS].join('\n')
}

import { describe, expect, it } from 'vitest'
import { candidateAnalysisInstructions, outputLanguageInstruction } from './provider'

describe('outputLanguageInstruction', () => {
  it('requires English user-facing output for en-US', () => {
    expect(outputLanguageInstruction('en-US')).toContain('MUST be written in English')
  })

  it('requires Simplified Chinese user-facing output for zh-CN', () => {
    expect(outputLanguageInstruction('zh-CN')).toContain('必须使用简体中文')
  })
})

describe('candidateAnalysisInstructions', () => {
  it.each(['service', 'storage'] as const)('keeps %s analysis to two concise answers', (kind) => {
    const instructions = candidateAnalysisInstructions(kind)
    expect(instructions).toContain('必须恰好返回 1 条建议')
    expect(instructions).toContain('action.kind 必须是 explain-only')
    expect(instructions).toContain('action.steps 必须为空数组')
    expect(instructions).toContain('它是什么；现在能不能')
    expect(instructions).toContain('读者是不懂电脑术语的普通用户')
    expect(instructions).toContain('先给明确结论')
    expect(instructions).toContain('信息不足时直接说“先不要处理”')
  })

  it('replaces database terminology with plain language for service analysis', () => {
    const instructions = candidateAnalysisInstructions('service')
    expect(instructions).toContain('帮助其他软件保存和读取资料的工具')
    expect(instructions).toContain('不要只写 database 或 database access')
  })
})

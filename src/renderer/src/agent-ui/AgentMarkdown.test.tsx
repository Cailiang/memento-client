import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentMarkdown, normalizeAgentMarkdown } from './AgentMarkdown'

describe('AgentMarkdown', () => {
  it('renders model-style bold text, bullet points, and numbered choices semantically', () => {
    const source = [
      '**影响说明：**',
      '• 随用户登录自动启动。',
      '• 配置长期未变动。',
      '',
      '**三项可选操作：**',
      '1. **仅停止服务** - 保留应用和数据。',
      '2. 移除启动项 - 将配置移至废纸篓。'
    ].join('\n')

    const markup = renderToStaticMarkup(<AgentMarkdown>{source}</AgentMarkdown>)
    expect(markup).toContain('<strong>影响说明：</strong>')
    expect(markup).toContain('<ul>')
    expect(markup).toContain('<ol>')
    expect(markup).toContain('<strong>仅停止服务</strong>')
    expect(markup).not.toContain('**')
    expect(normalizeAgentMarkdown(source)).toContain('- 随用户登录自动启动。')
  })

  it('does not render raw HTML from model output', () => {
    const markup = renderToStaticMarkup(<AgentMarkdown>{'保留文字 <script>alert("x")</script>'}</AgentMarkdown>)
    expect(markup).toContain('保留文字')
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('alert(&quot;x&quot;)')
  })
})

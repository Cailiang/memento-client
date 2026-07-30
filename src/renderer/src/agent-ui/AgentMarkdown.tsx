import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

export function normalizeAgentMarkdown(value: string): string {
  return value.replace(/^(\s*)[•●]\s+/gm, '$1- ')
}

export function AgentMarkdown({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="agent-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          a: ({ children: label, href }) => <span className="agent-markdown-link" title={href}>{label}</span>
        }}
      >
        {normalizeAgentMarkdown(children)}
      </ReactMarkdown>
    </div>
  )
}

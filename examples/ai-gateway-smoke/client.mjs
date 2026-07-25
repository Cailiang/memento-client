const gatewayUrl = (process.env.MEMENTO_GATEWAY_URL || 'http://127.0.0.1:8787').replace(
  /\/$/,
  ''
)
const gatewayToken = process.env.MEMENTO_GATEWAY_TOKEN

if (!gatewayToken) {
  throw new Error('MEMENTO_GATEWAY_TOKEN is required')
}

const report = {
  schemaVersion: 1,
  shell: {
    family: 'zsh',
    baselineMs: 34,
    startupMs: 504,
    configCostMs: 470,
    sampleCount: 3
  },
  findings: [
    {
      id: 'finding-nvm',
      code: 'nvm_eager_load',
      severity: 'slow',
      durationMs: 310,
      source: { kind: 'shell-config', logicalPath: '~/.zshrc', line: 86 }
    },
    {
      id: 'finding-compinit',
      code: 'compinit_detected',
      severity: 'notice',
      durationMs: 95,
      source: { kind: 'shell-config', logicalPath: '~/.zshrc', line: 42 }
    }
  ]
}

const response = await fetch(`${gatewayUrl}/v1/analysis/terminal`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${gatewayToken}`,
    'content-type': 'application/json'
  },
  body: JSON.stringify({ report })
})

const body = await response.json()
process.stdout.write(`${JSON.stringify(body, null, 2)}\n`)
if (!response.ok) process.exitCode = 1

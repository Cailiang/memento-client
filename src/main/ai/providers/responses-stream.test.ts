import { describe, expect, it } from 'vitest'
import { readResponsesStream } from './responses-stream'

describe('readResponsesStream', () => {
  it('joins Responses API output text deltas split across chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"{\\"summary\\":"}\n'))
        controller.enqueue(encoder.encode('data: {"type":"output_text.delta","delta":"\\"ok\\"}"}\n\ndata: [DONE]\n'))
        controller.close()
      }
    })
    const response = new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
    await expect(readResponsesStream(response)).resolves.toMatchObject({ text: '{"summary":"ok"}' })
  })
})

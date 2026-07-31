import { afterEach, describe, expect, it, vi } from 'vitest'
import { chat, chatStream } from '../ai.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI request limits', () => {
  it('passes the selected context to Ollama without capping thinking-model output', async () => {
    let request
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      request = JSON.parse(options.body)
      return { ok: true, json: async () => ({ message: { content: 'ok' } }) }
    }))

    await chat(
      { provider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen2.5:3b' },
      { system: 'coach', messages: [], contextWindow: 4096, think: false }
    )

    expect(request.options).toEqual({ num_ctx: 4096 })
    expect(request.options).not.toHaveProperty('num_predict')
    expect(request.think).toBe(false)
  })

  it('leaves provider-specific limits out of cloud-compatible requests', async () => {
    let request
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      request = JSON.parse(options.body)
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
    }))

    await chat(
      { provider: 'cloud', cloudUrl: 'https://example.test/v1', cloudModel: 'model', cloudKey: '' },
      { system: 'coach', messages: [], contextWindow: 4096 }
    )

    expect(request).not.toHaveProperty('max_tokens')
    expect(request).not.toHaveProperty('num_ctx')
  })

  it('streams Ollama reasoning separately from the final answer', async () => {
    let request
    const body = [
      JSON.stringify({ message: { thinking: 'Checking journal evidence. ' }, done: false }),
      JSON.stringify({ message: { thinking: 'Choosing the clearest pattern.' }, done: false }),
      JSON.stringify({ message: { content: 'Protect your size.' }, done: false }),
      JSON.stringify({ message: { content: ' Review first.' }, done: true })
    ].join('\n')
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      request = JSON.parse(options.body)
      return new Response(body, { status: 200 })
    }))
    const answer = []
    const thinking = []

    const full = await chatStream(
      { provider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen3.6:latest' },
      { system: 'coach', messages: [], contextWindow: 4096, think: true },
      (delta) => answer.push(delta),
      (delta) => thinking.push(delta)
    )

    expect(request.think).toBe(true)
    expect(thinking.join('')).toBe('Checking journal evidence. Choosing the clearest pattern.')
    expect(answer.join('')).toBe('Protect your size. Review first.')
    expect(full).toBe('Protect your size. Review first.')
  })
})

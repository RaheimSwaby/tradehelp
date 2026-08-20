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

describe('Claude (Anthropic) provider', () => {
  const settings = { provider: 'anthropic', anthropicKey: 'sk-ant-test', anthropicModel: 'claude-opus-5' }

  it('posts to /messages with the headers Claude requires, not the OpenAI shape', async () => {
    let url, options
    vi.stubGlobal('fetch', vi.fn(async (u, o) => {
      url = u; options = o
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }
    }))

    await chat(settings, { system: 'coach', messages: [{ role: 'user', content: 'hi' }], think: false })

    // The 404 this provider exists to fix came from hitting /chat/completions.
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(url).not.toContain('chat/completions')
    expect(options.headers['x-api-key']).toBe('sk-ant-test')
    expect(options.headers['anthropic-version']).toBe('2023-06-01')
    expect(options.headers.Authorization).toBeUndefined()

    const body = JSON.parse(options.body)
    // system is a top-level field; a role:'system' message is an OpenAI-ism.
    expect(body.system).toBe('coach')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('reads the first text block, skipping thinking blocks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'the answer' }] })
    })))

    expect(await chat(settings, { system: 's', messages: [], think: true })).toBe('the answer')
  })

  it('splits an image data URL into media type and bytes', async () => {
    let body
    vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
      body = JSON.parse(o.body)
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }
    }))

    await chat(settings, {
      system: 's',
      messages: [{ role: 'user', content: 'read this', images: ['data:image/png;base64,AAAB'] }],
      think: false
    })

    expect(body.messages[0].content[0]).toEqual({
      type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAB' }
    })
    // Image first, then the question about it.
    expect(body.messages[0].content[1]).toEqual({ type: 'text', text: 'read this' })
  })

  it('names the setting to fix instead of surfacing a bare status code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })))
    await expect(chat(settings, { system: 's', messages: [], think: false })).rejects.toThrow(/rejected that API key/i)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    await expect(chat(settings, { system: 's', messages: [], think: false })).rejects.toThrow(/no model called "claude-opus-5"/i)
  })

  it('streams text and routes reasoning to the thinking channel', async () => {
    const events = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"weighing it"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hold "}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"the line."}}',
      'data: [DONE]'
    ].join('\n')

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: new TextEncoder().encode(events) }))
          }
        }
      }
    })))

    const chunks = []; const thoughts = []
    const answer = await chatStream(
      settings,
      { system: 's', messages: [], think: true },
      (c) => chunks.push(c),
      (t) => thoughts.push(t)
    )

    expect(answer).toBe('Hold the line.')
    expect(chunks).toEqual(['Hold ', 'the line.'])
    // Reasoning must never be folded into the coach's visible answer.
    expect(thoughts).toEqual(['weighing it'])
  })

  it('returns a readable message when Claude declines rather than an empty reply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ stop_reason: 'refusal', content: [] })
    })))

    expect(await chat(settings, { system: 's', messages: [], think: false })).toMatch(/declined/i)
  })
})

describe('Claude thinking parameter per model', () => {
  const bodyFor = async (anthropicModel, think) => {
    let body
    vi.stubGlobal('fetch', vi.fn(async (_u, o) => {
      body = JSON.parse(o.body)
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ok' }] }) }
    }))
    await chat({ provider: 'anthropic', anthropicKey: 'k', anthropicModel },
      { system: 's', messages: [], think })
    return body
  }

  it('asks for adaptive thinking only on models that have it', async () => {
    expect((await bodyFor('claude-opus-5')).thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect((await bodyFor('claude-sonnet-5')).thinking).toEqual({ type: 'adaptive', display: 'summarized' })
  })

  it('sends no thinking field at all to older models', async () => {
    // Browse lists every model the key can reach. Sending an adaptive block to
    // one that predates adaptive thinking is a 400, which looked to the trader
    // like Claude was simply broken.
    expect(await bodyFor('claude-haiku-4-5')).not.toHaveProperty('thinking')
    expect(await bodyFor('claude-3-5-sonnet-20241022')).not.toHaveProperty('thinking')
  })

  it('omits the field rather than disabling on models that reject a disable', async () => {
    expect(await bodyFor('claude-fable-5', false)).not.toHaveProperty('thinking')
    expect((await bodyFor('claude-opus-5', false)).thinking).toEqual({ type: 'disabled' })
  })
})

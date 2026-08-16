// Three providers, one interface. Ollama keeps everything offline and free;
// the cloud path works with any OpenAI-compatible endpoint using your own key;
// the anthropic path talks to Claude directly.
//
// Claude is not OpenAI-compatible, which is why it needs its own branch rather
// than a different Base URL on the cloud path. Four things differ: the endpoint
// is /messages not /chat/completions, the key goes in x-api-key not an
// Authorization bearer, anthropic-version is mandatory, and the system prompt is
// a top-level field instead of a message with role 'system'. Pointing the cloud
// path at api.anthropic.com returns 404 because /v1/chat/completions is not a
// route Anthropic serves.

import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_FALLBACK_MODELS,
  ANTHROPIC_MAX_TOKENS,
  anthropicHeaders
} from '../renderer/src/aiProviders.js'

// Ollama defaults its context window to ~2-4k tokens regardless of how much we send,
// which silently truncates the journal we feed the coach. Give it room to read all of it.
const OLLAMA_NUM_CTX = 16384
const contextWindow = (value) => Math.max(2048, Math.min(OLLAMA_NUM_CTX, Math.floor(Number(value) || OLLAMA_NUM_CTX)))
const ollamaOptions = (payload = {}) => {
  return {
    num_ctx: contextWindow(payload.contextWindow)
  }
}
const ollamaThinking = (think) => (
  think === true || think === false ? { think } : {}
)

const trim = (u) => String(u || '').replace(/\/+$/, '')
const stripDataPrefix = (u) => String(u || '').replace(/^data:image\/[\w+.-]+;base64,/, '')
const hasImgs = (messages) => messages.some((m) => Array.isArray(m.images) && m.images.length)
const cloudHeaders = (s) => ({ 'Content-Type': 'application/json', ...(s.cloudKey ? { Authorization: `Bearer ${s.cloudKey}` } : {}) })

// Messages may carry an `images` array of data URLs. Each provider wants a different shape.
function cloudMessages(system, messages) {
  return [{ role: 'system', content: system }, ...messages.map((m) => (
    m.images?.length
      ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))] }
      : { role: m.role, content: m.content }
  ))]
}
function ollamaMessages(system, messages) {
  return [{ role: 'system', content: system }, ...messages.map((m) => (
    m.images?.length
      ? { role: m.role, content: m.content, images: m.images.map(stripDataPrefix) }
      : { role: m.role, content: m.content }
  ))]
}
const ollamaModelFor = (s, messages) => (hasImgs(messages) ? (s.ollamaVisionModel || s.ollamaModel) : s.ollamaModel)

const anthropicModelFor = (s) => s.anthropicModel || ANTHROPIC_DEFAULT_MODEL

// Claude takes base64 image bytes and their media type as separate fields, so the
// data: URL the renderer hands us has to be taken apart rather than trimmed.
const anthropicImage = (url) => {
  const parts = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(String(url || ''))
  return parts ? { type: 'image', source: { type: 'base64', media_type: parts[1], data: parts[2] } } : null
}

// Images lead: Claude reads an image best when it arrives before the text asking
// about it. Anything that is not a well-formed data URL is dropped rather than
// sent as a broken block, which would fail the whole request.
function anthropicMessages(messages) {
  return messages.map((m) => {
    const images = (m.images || []).map(anthropicImage).filter(Boolean)
    return images.length
      ? { role: m.role, content: [...images, { type: 'text', text: m.content }] }
      : { role: m.role, content: m.content }
  })
}

// think === false turns thinking off. Otherwise Claude decides how much to think,
// and 'summarized' means the reasoning arrives as readable text on the thinking
// channel the coach already renders for Ollama. Without it the models that think
// by default emit empty thinking blocks, which shows up as a long silent pause
// before the answer starts.
const anthropicThinking = (think) => (
  think === false ? { type: 'disabled' } : { type: 'adaptive', display: 'summarized' }
)

const anthropicBody = (settings, system, messages, think, stream) => JSON.stringify({
  model: anthropicModelFor(settings),
  max_tokens: ANTHROPIC_MAX_TOKENS,
  system,
  messages: anthropicMessages(messages),
  thinking: anthropicThinking(think),
  ...(stream ? { stream: true } : {})
})

// The raw status code tells the trader nothing. Name the setting they need to fix.
async function anthropicFailure(res, model) {
  const detail = await res.json().catch(() => null)
  const message = detail?.error?.message || ''
  if (res.status === 401) return 'Claude rejected that API key. Check it under Settings, Model provider.'
  if (res.status === 403) return 'That Claude key does not have access to this model.'
  if (res.status === 404) return `Claude has no model called "${model}". Pick one from the Model list.`
  if (res.status === 429) return 'Claude is rate limiting this key. Wait a moment and try again.'
  if (res.status === 529 || res.status >= 500) return 'Claude is temporarily unavailable. Try again shortly.'
  return `Claude rejected the request${message ? ': ' + message : ` (${res.status})`}.`
}

async function anthropicFetch(settings, path, init) {
  return fetch(`${ANTHROPIC_BASE_URL}${path}`, {
    ...init,
    headers: anthropicHeaders(settings.anthropicKey)
  }).catch(() => { throw new Error('Cannot reach Claude. Check your internet connection.') })
}

// A refusal is a successful HTTP 200 with an empty or partial answer, so it has to
// be checked before reading the text or the coach silently returns nothing.
const anthropicRefused = (payload) => payload?.stop_reason === 'refusal'
const REFUSAL_MESSAGE = 'Claude declined to answer that one. Try rewording the question.'

export async function chat(settings, { system, messages, contextWindow: requestedContextWindow, think }) {
  if (settings.provider === 'anthropic') {
    const res = await anthropicFetch(settings, '/messages', {
      method: 'POST',
      body: anthropicBody(settings, system, messages, think, false)
    })
    if (!res.ok) throw new Error(await anthropicFailure(res, anthropicModelFor(settings)))
    const d = await res.json()
    if (anthropicRefused(d)) return REFUSAL_MESSAGE
    // The reply is a list of blocks; thinking blocks come first on models that
    // think, so the answer is the first text block rather than the first block.
    return d.content?.find((b) => b.type === 'text')?.text ?? '(no response)'
  }
  if (settings.provider === 'cloud') {
    const res = await fetch(`${trim(settings.cloudUrl)}/chat/completions`, {
      method: 'POST', headers: cloudHeaders(settings),
      body: JSON.stringify({ model: settings.cloudModel, messages: cloudMessages(system, messages) })
    })
    if (!res.ok) throw new Error(`Cloud API ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
    const d = await res.json()
    return d.choices?.[0]?.message?.content ?? '(no response)'
  }
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ollamaModelFor(settings, messages), stream: false, messages: ollamaMessages(system, messages), options: ollamaOptions({ contextWindow: requestedContextWindow }), ...ollamaThinking(think) })
  }).catch(() => { throw new Error('Cannot reach Ollama. Is it running? Try: ollama serve') })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
  const d = await res.json()
  return d.message?.content ?? '(no response)'
}

// Keep the polished answer and Ollama's optional reasoning trace on separate channels.
// Reasoning is intentionally never folded into the returned coach response.
export async function chatStream(settings, { system, messages, contextWindow: requestedContextWindow, think }, onChunk, onThinking) {
  if (settings.provider === 'anthropic') {
    const res = await anthropicFetch(settings, '/messages', {
      method: 'POST',
      body: anthropicBody(settings, system, messages, think, true)
    })
    if (!res.ok) throw new Error(await anthropicFailure(res, anthropicModelFor(settings)))
    let refused = false
    const answer = await readStream(res, onChunk, true, (data) => {
      try {
        const event = JSON.parse(data)
        // A refusal arrives as a stop_reason on message_delta, mid-stream.
        if (event.delta?.stop_reason === 'refusal') refused = true
        if (event.type !== 'content_block_delta') return ''
        if (event.delta?.type === 'text_delta') return { content: event.delta.text || '', thinking: '' }
        if (event.delta?.type === 'thinking_delta') return { content: '', thinking: event.delta.thinking || '' }
        return ''
      } catch { return '' }
    }, onThinking)
    return refused && answer === '(no response)' ? REFUSAL_MESSAGE : answer
  }
  if (settings.provider === 'cloud') {
    const res = await fetch(`${trim(settings.cloudUrl)}/chat/completions`, {
      method: 'POST', headers: cloudHeaders(settings),
      body: JSON.stringify({ model: settings.cloudModel, messages: cloudMessages(system, messages), stream: true })
    })
    if (!res.ok) throw new Error(`Cloud API ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
    return readStream(res, onChunk, true, (data) => {
      if (data === '[DONE]') return ''
      try { return JSON.parse(data).choices?.[0]?.delta?.content || '' } catch { return '' }
    })
  }
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ollamaModelFor(settings, messages), stream: true, messages: ollamaMessages(system, messages), options: ollamaOptions({ contextWindow: requestedContextWindow }), ...ollamaThinking(think) })
  }).catch(() => { throw new Error('Cannot reach Ollama. Is it running? Try: ollama serve') })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
  return readStream(res, onChunk, false, (line) => {
    try {
      const message = JSON.parse(line).message || {}
      return { content: message.content || '', thinking: message.thinking || '' }
    } catch { return '' }
  }, onThinking)
}

// Reads a streaming body line-by-line. sse=true strips "data:" (cloud SSE); otherwise each
// line is a JSON object (Ollama NDJSON). extract() may return a text delta or separate
// { content, thinking } deltas.
async function readStream(res, onChunk, sse, extract, onThinking) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = ''
  const handle = (raw) => {
    let line = raw.trim()
    if (!line) return
    if (sse) { if (!line.startsWith('data:')) return; line = line.slice(5).trim() }
    const extracted = extract(line)
    const content = typeof extracted === 'string' ? extracted : extracted?.content || ''
    const thinking = typeof extracted === 'object' ? extracted?.thinking || '' : ''
    if (thinking) { try { onThinking?.(thinking) } catch {} }
    if (content) { full += content; try { onChunk(content) } catch {} }
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1) }
  }
  if (buf) handle(buf)
  return full || '(no response)'
}

export async function models(settings) {
  // Claude publishes its catalogue, so the trader picks a model from a list
  // instead of typing an ID that 404s on a typo. Before a key is entered there is
  // nothing to ask, so fall back to the known-good names rather than an empty
  // dropdown that looks broken.
  if (settings.provider === 'anthropic') {
    if (!String(settings.anthropicKey || '').trim()) return [...ANTHROPIC_FALLBACK_MODELS]
    const res = await anthropicFetch(settings, '/models?limit=100', { method: 'GET' })
    if (!res.ok) return [...ANTHROPIC_FALLBACK_MODELS]
    const d = await res.json().catch(() => null)
    const ids = (d?.data || []).map((m) => m.id).filter(Boolean)
    return ids.length ? ids : [...ANTHROPIC_FALLBACK_MODELS]
  }
  // OpenAI-compatible servers don't expose a model list at a standard endpoint,
  // and the Ollama /api/tags endpoint only makes sense when the provider is Ollama.
  if (settings.provider !== 'ollama') return []
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/tags`).catch(() => {
    throw new Error('Cannot reach Ollama at ' + settings.ollamaUrl)
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const d = await res.json()
  return (d.models || []).map((m) => m.name)
}

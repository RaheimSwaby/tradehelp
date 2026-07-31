// Two providers, one interface. Ollama keeps everything offline and free;
// the cloud path works with any OpenAI-compatible endpoint using your own key.

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

export async function chat(settings, { system, messages, contextWindow: requestedContextWindow, think }) {
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
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/tags`).catch(() => {
    throw new Error('Cannot reach Ollama at ' + settings.ollamaUrl)
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const d = await res.json()
  return (d.models || []).map((m) => m.name)
}

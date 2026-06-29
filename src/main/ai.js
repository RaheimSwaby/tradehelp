// Two providers, one interface. Ollama keeps everything offline and free;
// the cloud path works with any OpenAI-compatible endpoint using your own key.

// Ollama defaults its context window to ~2-4k tokens regardless of how much we send,
// which silently truncates the journal we feed the coach. Give it room to read all of it.
const OLLAMA_NUM_CTX = 16384

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

export async function chat(settings, { system, messages }) {
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
    body: JSON.stringify({ model: ollamaModelFor(settings, messages), stream: false, messages: ollamaMessages(system, messages), options: { num_ctx: OLLAMA_NUM_CTX } })
  }).catch(() => { throw new Error('Cannot reach Ollama. Is it running? Try: ollama serve') })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
  const d = await res.json()
  return d.message?.content ?? '(no response)'
}

// Streaming: calls onChunk(deltaText) as tokens arrive, resolves with the full text.
export async function chatStream(settings, { system, messages }, onChunk) {
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
    body: JSON.stringify({ model: ollamaModelFor(settings, messages), stream: true, messages: ollamaMessages(system, messages), options: { num_ctx: OLLAMA_NUM_CTX } })
  }).catch(() => { throw new Error('Cannot reach Ollama. Is it running? Try: ollama serve') })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
  return readStream(res, onChunk, false, (line) => {
    try { return JSON.parse(line).message?.content || '' } catch { return '' }
  })
}

// Reads a streaming body line-by-line. sse=true strips "data:" (cloud SSE); otherwise each
// line is a JSON object (Ollama NDJSON). extract() pulls the text delta from a line.
async function readStream(res, onChunk, sse, extract) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = ''
  const handle = (raw) => {
    let line = raw.trim()
    if (!line) return
    if (sse) { if (!line.startsWith('data:')) return; line = line.slice(5).trim() }
    const piece = extract(line)
    if (piece) { full += piece; try { onChunk(piece) } catch {} }
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

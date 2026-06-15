// Two providers, one interface. Ollama keeps everything offline and free;
// the cloud path works with any OpenAI-compatible endpoint using your own key.

const trim = (u) => String(u || '').replace(/\/+$/, '')
const stripDataPrefix = (u) => String(u || '').replace(/^data:image\/[\w+.-]+;base64,/, '')

// Messages may carry an `images` array of data URLs. Each provider wants a different
// shape, so we adapt per provider. Text-only messages pass through unchanged.
export async function chat(settings, { system, messages }) {
  const hasImages = messages.some((m) => Array.isArray(m.images) && m.images.length)

  if (settings.provider === 'cloud') {
    const msgs = [{ role: 'system', content: system }, ...messages.map((m) => (
      m.images?.length
        ? { role: m.role, content: [{ type: 'text', text: m.content }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))] }
        : { role: m.role, content: m.content }
    ))]
    const res = await fetch(`${trim(settings.cloudUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.cloudKey ? { Authorization: `Bearer ${settings.cloudKey}` } : {})
      },
      body: JSON.stringify({ model: settings.cloudModel, messages: msgs })
    })
    if (!res.ok) throw new Error(`Cloud API ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
    const d = await res.json()
    return d.choices?.[0]?.message?.content ?? '(no response)'
  }

  // default: Ollama. Use the vision model only when images are attached.
  const model = hasImages ? (settings.ollamaVisionModel || settings.ollamaModel) : settings.ollamaModel
  const msgs = [{ role: 'system', content: system }, ...messages.map((m) => (
    m.images?.length
      ? { role: m.role, content: m.content, images: m.images.map(stripDataPrefix) }
      : { role: m.role, content: m.content }
  ))]
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, messages: msgs })
  }).catch(() => {
    throw new Error('Cannot reach Ollama. Is it running? Try: ollama serve')
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 200))
  const d = await res.json()
  return d.message?.content ?? '(no response)'
}

export async function models(settings) {
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/tags`).catch(() => {
    throw new Error('Cannot reach Ollama at ' + settings.ollamaUrl)
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const d = await res.json()
  return (d.models || []).map((m) => m.name)
}

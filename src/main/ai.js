// Two providers, one interface. Ollama keeps everything offline and free;
// the cloud path works with any OpenAI-compatible endpoint using your own key.

const trim = (u) => String(u || '').replace(/\/+$/, '')

export async function chat(settings, { system, messages }) {
  const msgs = [{ role: 'system', content: system }, ...messages]

  if (settings.provider === 'cloud') {
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

  // default: Ollama
  const res = await fetch(`${trim(settings.ollamaUrl)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: settings.ollamaModel, stream: false, messages: msgs })
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

// Validates a pasted API key by making one cheap request to the service.
import { ANTHROPIC_BASE_URL, anthropicHeaders } from '../renderer/src/aiProviders.js'

const trim = (u) => String(u || '').replace(/\/+$/, '')

export async function testKey({ type, key, url } = {}) {
  key = String(key || '').trim()
  if (!key) return { ok: false, msg: 'Enter a key first.' }
  try {
    if (type === 'finnhub') {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`)
      const d = await r.json().catch(() => ({}))
      if (r.ok && Number(d.c) > 0) return { ok: true, msg: '✓ Finnhub key works.' }
      return { ok: false, msg: r.status === 401 ? '✗ Invalid Finnhub key.' : '✗ Key rejected or rate-limited.' }
    }
    if (type === 'fmp') {
      const r = await fetch(`https://financialmodelingprep.com/api/v3/quote-short/AAPL?apikey=${encodeURIComponent(key)}`)
      const d = await r.json().catch(() => ({}))
      if (r.ok && Array.isArray(d) && d.length) return { ok: true, msg: '✓ FMP key works.' }
      return { ok: false, msg: d && d['Error Message'] ? '✗ Invalid FMP key.' : '✗ Key returned no data.' }
    }
    if (type === 'cloud') {
      const r = await fetch(`${trim(url)}/models`, { headers: { Authorization: `Bearer ${key}` } })
      if (r.ok) return { ok: true, msg: '✓ Cloud key works.' }
      return { ok: false, msg: `✗ Cloud key rejected (${r.status}).` }
    }
    if (type === 'anthropic') {
      // Listing models is the cheapest authenticated call Claude offers:
      // it proves the key without spending a single token.
      const r = await fetch(`${ANTHROPIC_BASE_URL}/models?limit=1`, { headers: anthropicHeaders(key) })
      if (r.ok) return { ok: true, msg: '✓ Claude key works.' }
      if (r.status === 401) return { ok: false, msg: '✗ Claude rejected that key.' }
      return { ok: false, msg: `✗ Claude key rejected (${r.status}).` }
    }
    return { ok: false, msg: 'Unknown key type.' }
  } catch {
    return { ok: false, msg: '✗ Could not reach the service — check your connection.' }
  }
}

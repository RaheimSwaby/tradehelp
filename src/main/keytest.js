// Validates a pasted API key by making one cheap request to the service.
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
    return { ok: false, msg: 'Unknown key type.' }
  } catch {
    return { ok: false, msg: '✗ Could not reach the service — check your connection.' }
  }
}

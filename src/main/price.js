// Runs in the main process, so there's no browser CORS restriction.
// Crypto -> Binance public ticker; stocks -> Stooq CSV. Both keyless.

const CRYPTO = new Set([
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB', 'LTC', 'MATIC',
  'DOT', 'AVAX', 'LINK', 'SHIB', 'TRX', 'XLM', 'ATOM', 'NEAR', 'APT'
])

export async function fetchPrice(symbolRaw, finnhubKey) {
  const symbol = String(symbolRaw || '').trim().toUpperCase()
  if (!symbol) throw new Error('No symbol given')

  const base = symbol.replace(/USDT|USDC|USD|-|\//g, '')

  if (symbol.endsWith('USDT') || CRYPTO.has(base)) {
    const pair = base + 'USDT'
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`)
    if (!res.ok) throw new Error(`No crypto quote for ${pair}`)
    const d = await res.json()
    return {
      symbol: pair,
      price: Number(d.lastPrice),
      changePct: Number(d.priceChangePercent),
      source: 'Binance'
    }
  }

  // Stocks/ETFs: prefer Finnhub real-time when a key is set, fall back to keyless Stooq.
  if (finnhubKey) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`)
      if (res.ok) {
        const d = await res.json()
        if (d && Number(d.c) > 0) return { symbol, price: Number(d.c), changePct: Number(d.dp) || 0, source: 'Finnhub' }
      }
    } catch { /* fall through to Stooq */ }
  }

  // US stock via Stooq CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  const res = await fetch(`https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`)
  if (!res.ok) throw new Error(`Quote service error (${res.status})`)
  const text = await res.text()
  const line = (text.trim().split('\n')[1] || '')
  const p = line.split(',')
  if (p.length < 7 || p[6] === 'N/D') throw new Error(`No quote found for ${symbol}`)
  const open = Number(p[3])
  const close = Number(p[6])
  const changePct = open ? ((close - open) / open) * 100 : 0
  return { symbol, price: close, changePct, source: 'Stooq (delayed)' }
}

// Batch quotes for the ticker tape — resolves what it can, drops the rest.
export async function fetchQuotes(symbols, finnhubKey) {
  const list = (Array.isArray(symbols) ? symbols : String(symbols || '').split(','))
    .map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 12)
  const settled = await Promise.allSettled(list.map((s) => fetchPrice(s, finnhubKey)))
  return settled.filter((r) => r.status === 'fulfilled').map((r) => r.value)
}

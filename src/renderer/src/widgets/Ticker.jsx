import React, { useState, useEffect } from 'react'
import { T, mono } from '../theme.js'
import { fmtN } from '../utils.js'

/* ───────── ticker tape ───────── */
export function Ticker({ settings }) {
  const [quotes, setQuotes] = useState([])
  const enabled = (settings?.tickerEnabled ?? 'true') !== 'false'
  const symbols = (settings?.tickerSymbols || '').trim()

  useEffect(() => {
    if (!enabled || !symbols || !window.api?.priceBatch) { setQuotes([]); return }
    let live = true
    const list = symbols.split(',').map((s) => s.trim()).filter(Boolean)
    const load = async () => {
      try { const q = await window.api.priceBatch(list); if (live && Array.isArray(q)) setQuotes(q) } catch { /* keep last */ }
    }
    load()
    const id = setInterval(load, 45000)
    return () => { live = false; clearInterval(id) }
  }, [enabled, symbols])

  if (!enabled || quotes.length === 0) return null
  const items = quotes.map((q) => (
    <span key={q.symbol} className="inline-flex items-center gap-1.5 mx-4">
      <span style={{ color: T.dim }}>{q.symbol}</span>
      <span style={{ color: T.text }}>{fmtN(q.price, q.price < 10 ? 4 : 2)}</span>
      <span style={{ color: q.changePct >= 0 ? T.up : T.down }}>{q.changePct >= 0 ? '+' : ''}{fmtN(q.changePct, 2)}%</span>
    </span>
  ))
  return (
    <div className="w-full overflow-hidden" style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }} title="Pause on hover · edit symbols in Settings">
      <div className="ticker-track py-1.5 text-xs" style={mono}>
        <span className="ticker-seg">{items}</span>
        <span className="ticker-seg" aria-hidden="true">{items}</span>
      </div>
    </div>
  )
}

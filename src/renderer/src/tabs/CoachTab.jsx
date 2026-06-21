import React, { useState, useEffect, useRef } from 'react'
import { Bot, Sparkles, Send, Search } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, streamChat } from '../utils.js'
import { tradeContext } from '../stats.js'
import { Panel } from '../components/Shared.jsx'
import { EventsPanel } from '../widgets/EventBanner.jsx'

/* ───────── AI coach ───────── */
const COACH_SYSTEM = `You are a trading performance coach embedded in a trader's personal journal app.
You are given the trader's REAL aggregated stats and recent trades. Coach the PROCESS and PSYCHOLOGY:
discipline, emotional patterns, position sizing behaviour, time-of-day performance, overtrading, revenge trading,
cutting winners early, rule-breaking. Be specific and reference their actual numbers.
Do NOT give buy/sell signals, price predictions, or personalized investment advice. Keep it tight (under ~180 words),
direct, and supportive. If data is thin, say so honestly.`

export function Coach({ trades, stats, settings, events, now }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState(null)
  const [price, setPrice] = useState({ sym: '', out: null, loading: false })
  const scrollRef = useRef(null)
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [msgs, busy, streamText])

  const modelLabel = settings?.provider === 'cloud' ? settings?.cloudModel : settings?.ollamaModel

  async function ask(userText) {
    if (busy) return
    const next = [...msgs, { role: 'user', content: userText }]
    setMsgs(next); setInput(''); setBusy(true); setStreamText('')
    const apiMsgs = [
      { role: 'user', content: `Here is my current journal data:\n\n${tradeContext(trades, stats)}` },
      { role: 'assistant', content: 'Got it — I have your stats and recent trades in front of me.' },
      ...next
    ]
    try {
      const full = await streamChat({ system: COACH_SYSTEM, messages: apiMsgs }, (d) => setStreamText((s) => (s || '') + d))
      setMsgs((m) => [...m, { role: 'assistant', content: full }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `⚠︎ ${e?.message || 'Could not reach the model. Check Settings.'}` }])
    } finally { setStreamText(null); setBusy(false) }
  }

  async function checkPrice() {
    const sym = price.sym.trim()
    if (!sym || price.loading) return
    setPrice((p) => ({ ...p, loading: true, out: null }))
    const res = await window.api.price(sym)
    setPrice((p) => ({ ...p, loading: false, out: res }))
  }

  const quick = [
    ['Review my recent trades', 'Review my recent trades. What stands out, good and bad?'],
    ['Spot my bad habits', 'Based on my data, what behavioural leaks (revenge, FOMO, early exits, overtrading) do you see?'],
    ['When do I trade best?', 'Looking at my P&L by hour and by setup, when and how do I perform best and worst?']
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-xl flex flex-col" style={{ background: T.surface, border: `1px solid ${T.line}`, height: 540 }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Bot size={16} style={{ color: T.accent }} />
          <span className="text-sm font-semibold">AI Coach</span>
          <span className="text-xs ml-auto" style={{ color: T.faint }}>{modelLabel || 'no model'} · not financial advice</span>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {msgs.length === 0 && (
            <div className="text-sm" style={{ color: T.dim }}>
              <Sparkles size={15} style={{ color: T.accent, display: 'inline' }} /> Ask anything about your trading, or tap a prompt below. I'm reading your {stats.n} logged trade{stats.n === 1 ? '' : 's'}.
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap" style={{ background: m.role === 'user' ? T.surface2 : T.accentSoft, color: m.role === 'user' ? T.text : '#F3D9A0', border: `1px solid ${T.line}` }}>{m.content}</div>
            </div>
          ))}
          {streamText !== null && (
            <div className="flex" style={{ justifyContent: 'flex-start' }}>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap" style={{ background: T.accentSoft, color: '#F3D9A0', border: `1px solid ${T.line}` }}>
                {streamText || 'Coach is thinking…'}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="flex flex-wrap gap-1.5 py-2">
            {quick.map(([label, q]) => (
              <button key={label} type="button" disabled={busy} onClick={() => ask(q)} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2 pb-3">
            <input style={inputStyle} className="flex-1 rounded px-3 py-2 text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) ask(input.trim()) }} placeholder="Ask your coach…" />
            <button type="button" disabled={busy || !input.trim()} onClick={() => input.trim() && ask(input.trim())} className="rounded px-3 py-2" style={{ background: T.accent, color: '#1A1306' }}><Send size={16} /></button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Live price">
          <div className="flex gap-2">
            <input style={inputStyle} className="flex-1 rounded px-2 py-1.5 text-sm" value={price.sym} onChange={(e) => setPrice((p) => ({ ...p, sym: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && checkPrice()} placeholder="BTC, AAPL, MSFT" />
            <button type="button" onClick={checkPrice} disabled={price.loading} className="rounded px-2.5 py-1.5" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Search size={15} /></button>
          </div>
          <div className="mt-2 text-sm min-h-[20px]" style={mono}>
            {price.loading ? <span style={{ color: T.accent }}>Looking up…</span>
              : price.out == null ? <span style={{ color: T.faint }}>Enter a symbol.</span>
              : price.out.ok ? (
                <span>
                  <span style={{ color: T.text }}>{price.out.symbol} </span>
                  <span style={{ color: T.text, fontWeight: 600 }}>{fmt$(price.out.price)} </span>
                  <span style={{ color: price.out.changePct >= 0 ? T.up : T.down }}>{price.out.changePct >= 0 ? '+' : ''}{fmtN(price.out.changePct, 2)}%</span>
                  <span style={{ color: T.faint }}> · {price.out.source}</span>
                </span>
              ) : <span style={{ color: T.down }}>{price.out.error}</span>}
          </div>
        </Panel>
        <EventsPanel events={events} now={now} />
        <Panel title="How this works">
          <p className="text-sm" style={{ color: T.dim }}>
            The coach reads the same numbers you see and reasons over them — entirely on your machine when pointed at
            <span style={{ color: T.accent, ...mono }}> Ollama</span>. Change the model in Settings.
          </p>
        </Panel>
      </div>
    </div>
  )
}

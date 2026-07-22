import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Bot, Sparkles, Send, Search } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, streamChat } from '../utils.js'
import { fullJournalContext, computeLeaks } from '../stats.js'
import { buildCoachPrompts, lastTradingDay, buildDailyReport, coachVoiceInstruction, localDayKey, shouldIncludeWrittenJournal } from '../coachInsights.js'
import { Panel } from '../components/Shared.jsx'
import { EventsPanel } from '../widgets/EventBanner.jsx'

/* ───────── AI coach ───────── */
const COACH_SYSTEM = `You are a trading performance coach embedded in a trader's personal journal app.
You are given the trader's REAL journal below: aggregated stats, individual trades (with their written notes, reasons and self-grades), saved reviews, playbook setups, goals, trading rules, and no-trade-day logs.
Coach the PROCESS and PSYCHOLOGY: discipline, emotional patterns, position sizing, time-of-day performance, overtrading, revenge trading, cutting winners early, rule-breaking. Be specific and quote their actual numbers, notes and setups.
CRITICAL: Use ONLY the data provided below. Never invent or assume trades, symbols, prices, dates, or notes, and never pull in examples from other traders or generic scenarios. If the trader asks about something that is not in the data, say you don't see it rather than guessing.
Each trade shows the account it was on (the "account" field); "Live" means their personal, non-prop account. When the trader asks about a specific account (their Live account, or a prop account by name), use ONLY the trades whose account matches — refer to accounts by that name, never by an internal id — and if no trades match, say so plainly instead of inventing them.
Many trades are logged without an emotion, setup, or reason — these show as "(none)". Treat "(none)" strictly as untagged: never infer, guess, or attribute an emotion/setup/reason to a trade that shows "(none)". Only count and cite tags that are literally present in the data, and count only the trades actually listed — do not estimate totals.
For account-level totals (net P&L, win rate, trade count), use the numbers in the PER-ACCOUNT SUMMARY directly — they are already computed. Do not re-derive them from the trade list.
Do NOT give buy/sell signals, price predictions, or personalized investment advice. Keep it tight (under ~180 words) and direct. If data is thin, say so honestly.`

export function Coach({ trades, stats, settings, reviews = {}, playbook = [], dayLogs = [], goals = {}, payouts = [], events, now }) {
  // Local Ollama always gets the full written record; cloud users can gate free-form text.
  const includeWritten = shouldIncludeWrittenJournal(settings)
  const coachSystem = `${COACH_SYSTEM}\n${coachVoiceInstruction(settings?.coachVoice)}`
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState(null)
  const [price, setPrice] = useState({ sym: '', out: null, loading: false })
  const scrollRef = useRef(null)
  const cancelStreamRef = useRef(null)
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [msgs, busy, streamText])
  useEffect(() => () => cancelStreamRef.current?.(), [])

  const modelLabel = settings?.provider === 'cloud' ? settings?.cloudModel : settings?.ollamaModel
  // Sub-2B models can't reliably read structured journal data and tend to fabricate trades.
  const tinyModel = settings?.provider !== 'cloud' && [':0.5b', ':1b', ':1.5b', ':135m', ':360m', ':500m'].some((t) => String(modelLabel || '').toLowerCase().includes(t))

  async function ask(userText) {
    if (busy) return
    const next = [...msgs, { role: 'user', content: userText }]
    setMsgs(next); setInput(''); setBusy(true); setStreamText('')
    const apiMsgs = [
      { role: 'user', content: `Here is my current journal data:\n\n${fullJournalContext({ trades, stats, settings, reviews, playbook, dayLogs, goals, payouts }, { includeWritten })}` },
      { role: 'assistant', content: includeWritten
        ? 'Got it — I have your full journal in front of me: trades, notes, reviews, playbook, goals and rules.'
        : 'Got it — I have your structured journal data. Written notes and reviews are excluded by your cloud privacy setting.' },
      ...next
    ]
    try {
      const full = await streamChat({ system: coachSystem, messages: apiMsgs }, (d) => setStreamText((s) => (s || '') + d), cancelStreamRef)
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

  // The quick prompts adapt to the journal's current state — a red last session,
  // the costliest leak, a clean streak, untagged trades — and fall back to evergreen.
  const leaks = useMemo(() => computeLeaks(trades), [trades])
  const quick = useMemo(() => {
    const promptNow = now == null ? new Date() : new Date(now)
    const lastDay = lastTradingDay(trades, localDayKey(promptNow))
    const dailyReport = lastDay ? buildDailyReport(trades, lastDay) : null
    return buildCoachPrompts({ trades, stats, leaks, dailyReport, dayLogs, payouts, now: promptNow })
  }, [trades, stats, leaks, dayLogs, payouts, now])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-xl flex flex-col" style={{ background: T.surface, border: `1px solid ${T.line}`, height: 540 }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Bot size={16} style={{ color: T.accent }} />
          <span className="text-sm font-semibold">AI Coach</span>
          <span className="text-xs ml-auto" style={{ color: T.faint }}>{modelLabel || 'no model'} · not financial advice</span>
        </div>
        {tinyModel && (
          <div className="px-4 py-2 text-xs" style={{ background: 'rgba(251,113,133,0.10)', borderBottom: `1px solid ${T.line}`, color: T.down }}>
            ⚠ <strong>{modelLabel}</strong> is a very small model — it may misread or invent trades. For accurate coaching, switch to a larger model (e.g. <span style={mono}>llama3.2</span> 3B, <span style={mono}>qwen2.5:7b</span>, or <span style={mono}>llama3.1:8b</span>) in Settings.
          </div>
        )}
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
            {quick.map(([label, q, reason]) => (
              <button key={label} type="button" disabled={busy} onClick={() => ask(q)} title={reason}
                className="text-left px-2 py-1.5 rounded-md max-w-[220px]" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
                <span className="block text-xs font-semibold">{label}</span>
                {reason && <span className="block text-[10px] leading-tight mt-0.5" style={{ color: T.faint }}>{reason}</span>}
              </button>
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

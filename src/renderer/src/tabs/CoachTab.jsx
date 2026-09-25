import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Bot, Brain, BookOpen, Send, Search, Trash2, Square, Target, GraduationCap } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, streamChat } from '../utils.js'
import { computeLeaks } from '../stats.js'
import { buildCoachPrompts, lastTradingDay, buildDailyReport, localDayKey, shouldIncludeWrittenJournal } from '../coachInsights.js'
import { coachRequestProfile } from '../coachRequest.js'
import { Panel } from '../components/Shared.jsx'
import { EventsPanel } from '../widgets/EventBanner.jsx'
import { clearCoachChatHistory, loadCoachChatHistory, saveCoachChatHistory } from '../coachChatHistory.js'
import { buildCoachEvidence, coachAccounts, coachMessages, checkCoachAnswer } from '../coachEvidence.js'
import { loadCoachMemory } from '../coachMemory.js'
import { CoachMemory } from '../components/CoachMemory.jsx'
import { CoachEvidenceAnswer } from '../components/CoachEvidence.jsx'
import { CommitmentModal } from '../components/CoachCommitmentCard.jsx'

function ThinkingTrace({ text, live = false }) {
  if (!text && !live) return null
  return (
    <details open={live} className="mb-2 rounded-md overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
      <summary className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs cursor-pointer select-none" style={{ color: live ? T.accentText : T.faint }}>
        <Brain size={13} />
        <span>{live ? 'Model reasoning · live' : 'Model reasoning'}</span>
      </summary>
      <div className="px-2.5 pb-2 text-xs whitespace-pre-wrap overflow-y-auto max-h-40" style={{ color: T.faint, ...mono }}>
        {text || 'Waiting for the model to begin its reasoning trace…'}
      </div>
    </details>
  )
}

export function Coach({ trades, stats, settings, reviews = {}, playbook = [], dayLogs = [], goals = {}, payouts = [], commitments = [], plans = [], events, now, onOpenTrade, onAddCommitment, onOpenPlaybook }) {
  // Cloud users can exclude written records, approved memory, and prior chat context.
  const includeWritten = shouldIncludeWrittenJournal(settings)
  const [memory, setMemory] = useState(loadCoachMemory)
  const [filters, setFilters] = useState({ symbol: '', account: 'auto', from: '', to: '' })
  const [creatingCommitment, setCreatingCommitment] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [streamEvidence, setStreamEvidence] = useState(null)
  const generation = useRef(0)
  const [msgs, setMsgs] = useState(loadCoachChatHistory)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamText, setStreamText] = useState(null)
  const [thinkingText, setThinkingText] = useState(null)
  const [price, setPrice] = useState({ sym: '', out: null, loading: false })
  const scrollRef = useRef(null)
  const cancelStreamRef = useRef(null)
  const savedMessagesRef = useRef(JSON.stringify(msgs))
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [msgs, busy, streamText, thinkingText])
  useEffect(() => {
    const serialized = JSON.stringify(msgs)
    if (serialized === savedMessagesRef.current) return
    savedMessagesRef.current = serialized
    saveCoachChatHistory(msgs)
  }, [msgs])
  useEffect(() => {
    const timer = setInterval(() => {
      if (msgs.length > 0 && loadCoachChatHistory().length === 0) setMsgs([])
    }, 60_000)
    return () => clearInterval(timer)
  }, [msgs.length])
  useEffect(() => {
    generation.current += 1
    cancelStreamRef.current?.()
    setBusy(false); setStreamText(null); setThinkingText(null); setStreamEvidence(null)
    return () => { generation.current += 1; cancelStreamRef.current?.() }
  }, [settings?.provider, settings?.cloudModel, settings?.anthropicModel, settings?.ollamaModel, includeWritten])

  const modelLabel = { cloud: settings?.cloudModel, anthropic: settings?.anthropicModel }[settings?.provider] ?? settings?.ollamaModel
  const showThinking = settings?.provider !== 'cloud' && (settings?.coachShowThinking === 'true' || settings?.coachShowThinking === true)
  const requestProfile = useMemo(() => coachRequestProfile(settings), [settings?.coachContextMode])
  const accountOptions = useMemo(() => coachAccounts(settings, trades), [settings, trades])
  const prepareRequest = (question) => {
    let priorScope = null
    try { priorScope = JSON.parse([...msgs].reverse().find((message) => message.role === 'user' && message.contextKey)?.contextKey || '[]')[0] || null } catch { /* Legacy messages have no scope. */ }
    return buildCoachEvidence({ question, trades, plans, commitments, reviews, playbook, dayLogs, goals, settings, memory, filters, priorScope, now: now ? new Date(now) : new Date(), maxChars: requestProfile.maxChars })
  }
  // Sub-2B models can't reliably read structured journal data and tend to fabricate trades.
  const tinyModel = settings?.provider === 'ollama' && [':0.5b', ':1b', ':1.5b', ':135m', ':360m', ':500m'].some((t) => String(modelLabel || '').toLowerCase().includes(t))

  async function ask(userText) {
    if (busy) return
    if (filters.from && filters.to && filters.from > filters.to) { setRequestError('The start date must come before the end date.'); return }
    const request = prepareRequest(userText)
    const run = ++generation.current
    const next = [...msgs, { role: 'user', content: userText, contextKey: request.contextKey }]
    setRequestError(''); setStreamEvidence(request.evidence)
    saveCoachChatHistory(next)
    setMsgs(next); setInput(''); setBusy(true); setStreamText('')
    setThinkingText(showThinking ? '' : null)
    let fullThinking = ''
    const apiMsgs = coachMessages(request, userText, msgs, requestProfile.historyMessages)
    try {
      const full = await streamChat({
        system: request.system,
        messages: apiMsgs,
        contextWindow: requestProfile.contextWindow,
        ...(showThinking ? { think: true } : requestProfile.think === false ? { think: false } : {})
      }, (d) => { if (run === generation.current) setStreamText((s) => (s || '') + d) }, cancelStreamRef, (d) => {
        if (run !== generation.current) return
        fullThinking += d
        setThinkingText(fullThinking)
      })
      if (run === generation.current) {
        const checked = checkCoachAnswer(full, request)
        setMsgs((m) => [...m, { role: 'assistant', ...checked, evidence: request.evidence, ...(!checked.evidenceFallback && fullThinking ? { thinking: fullThinking } : {}) }])
      }
    } catch (e) {
      if (run === generation.current) setRequestError(e?.message || 'Could not reach the model. Check Settings.')
    } finally { if (run === generation.current) { setStreamText(null); setThinkingText(null); setStreamEvidence(null); setBusy(false) } }
  }

  function clearChat() {
    if (busy || msgs.length === 0) return
    if (!window.confirm('Clear this saved coach conversation? This cannot be undone.')) return
    clearCoachChatHistory()
    setMsgs([])
    setInput('')
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
  const reviewCount = useMemo(
    () => Object.values(reviews || {}).filter((review) => String(review || '').trim()).length,
    [reviews]
  )
  const journalTradeCount = Number(stats?.n ?? trades.length) || 0
  const promptChoices = (placement) => (
    <div className={`th-coach-prompt-choices ${placement === 'empty' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4' : 'flex flex-wrap gap-1.5 py-2'}`}>
      {quick.map(([label, q, reason]) => (
        <button key={label} type="button" disabled={busy} onClick={() => ask(q)} title={reason}
          className={`text-left px-2 py-1.5 rounded-md${placement === 'empty' ? ' w-full' : ' max-w-[220px]'}`} style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
          <span className="block text-xs font-semibold">{label}</span>
          {reason && <span className="block text-[10px] leading-tight mt-0.5" style={{ color: T.faint }}>{reason}</span>}
        </button>
      ))}
    </div>
  )

  return (
    <div className="th-page th-page-coach grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="th-coach-chat rounded-xl flex flex-col" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Bot size={16} style={{ color: T.dim }} />
          <span className="text-sm font-semibold">AI Coach</span>
          <div className="ml-auto flex items-center gap-2">
            {msgs.length > 0 && (
              <button type="button" onClick={clearChat} disabled={busy} className="flex items-center gap-1 rounded px-1.5 py-1 text-xs"
                style={{ color: T.faint, opacity: busy ? 0.5 : 1 }} title="Clear saved coach conversation. Conversations expire five days after the latest message.">
                <Trash2 size={12} /> Clear
              </button>
            )}
            <span className="text-xs" style={{ color: T.faint }}>{modelLabel || 'No model selected'} · not financial advice</span>
          </div>
        </div>
        <div className="th-coach-scope">
          <label>Symbol<select disabled={busy} value={filters.symbol} onChange={(event) => setFilters({ ...filters, symbol: event.target.value })}><option value="">From question / all</option>{[...new Set(trades.map((trade) => trade.symbol).filter(Boolean))].sort().map((symbol) => <option key={symbol}>{symbol}</option>)}</select></label>
          <label>Account<select disabled={busy} value={filters.account} onChange={(event) => setFilters({ ...filters, account: event.target.value })}><option value="auto">From question / all</option>{accountOptions.map((account) => <option key={account.id} value={account.id ? `id:${account.id}` : 'live'}>{account.label}</option>)}</select></label>
          <label>From<input type="date" disabled={busy} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
          <label>To<input type="date" disabled={busy} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        </div>
        {tinyModel && (
          <div className="px-4 py-2 text-xs" style={{ background: 'rgba(251,113,133,0.10)', borderBottom: `1px solid ${T.line}`, color: T.down }}>
            <strong>{modelLabel}</strong> may misread or invent trades because of its size. Choose a larger model such as <span style={mono}>llama3.2</span> 3B, <span style={mono}>qwen2.5:7b</span>, or <span style={mono}>llama3.1:8b</span> in Settings.
          </div>
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {msgs.length === 0 && (
            <div className="th-coach-empty-state max-w-3xl py-2">
              <div className="flex items-start gap-2">
                <BookOpen size={16} style={{ color: T.dim, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: T.text }}>What your coach can use</div>
                  <div className="text-xs mt-1" style={{ color: T.dim }}>Choose a prompt or ask about a specific trade, pattern, or account.</div>
                </div>
              </div>
              <dl className="th-coach-context-summary grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-3 mt-4 py-3" style={{ borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Journal</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{journalTradeCount} logged trade{journalTradeCount === 1 ? '' : 's'}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Reviews</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{reviewCount} saved</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Playbook</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{playbook.length} setup{playbook.length === 1 ? '' : 's'}</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Commitments</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{commitments.length} saved</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>No-trade days</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{dayLogs.length} logged</dd></div>
                <div><dt className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Written notes</dt><dd className="text-sm mt-0.5" style={{ color: T.text }}>{includeWritten ? 'Included' : 'Excluded by privacy setting'}</dd></div>
              </dl>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm${m.role === 'user' ? ' whitespace-pre-wrap' : ''}`} style={{ background: m.role === 'user' ? T.surface2 : T.accentSoft, color: m.role === 'user' ? T.text : T.dim, border: `1px solid ${T.line}` }}>
                {m.role === 'assistant' ? (
                  <>
                    <ThinkingTrace text={m.thinking} />
                    <CoachEvidenceAnswer message={m} trades={trades} onOpenTrade={onOpenTrade} />
                    {m.evidence && <div className="th-coach-actions"><button type="button" disabled={busy || !onAddCommitment} onClick={() => setCreatingCommitment(m.content)}><Target size={14} /> Choose commitment</button><button type="button" onClick={onOpenPlaybook} disabled={!onOpenPlaybook}><GraduationCap size={14} /> Playbook practice</button></div>}
                  </>
                ) : m.content}
              </div>
            </div>
          ))}
          {streamText !== null && (
            <div className="flex" style={{ justifyContent: 'flex-start' }}>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm" style={{ background: T.accentSoft, color: T.dim, border: `1px solid ${T.line}` }}>
                {thinkingText !== null && <ThinkingTrace text={thinkingText} live />}
                {streamText ? <span className="text-xs" style={{ color: T.faint }}>Checking response references...</span>
                  : thinkingText ? <span className="text-xs" style={{ color: T.faint }}>Writing response...</span>
                    : `Reading ${streamEvidence?.included || 0} examples from ${streamEvidence?.matched || 0} matching trades...`}
                {streamEvidence && <p className="text-xs mt-2">{streamEvidence.scopeLabel}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 pt-2 pb-3" style={{ borderTop: `1px solid ${T.line}` }}>
          {requestError && <p role="alert" className="text-sm mb-2">{requestError}</p>}
          <div className="flex gap-2">
            <input style={inputStyle} className="flex-1 rounded px-3 py-2 text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) ask(input.trim()) }} placeholder="Ask about your journal…" />
            {busy ? <button type="button" title="Stop response" aria-label="Stop response" onClick={() => { generation.current += 1; cancelStreamRef.current?.(); setBusy(false); setStreamText(null); setThinkingText(null); setStreamEvidence(null) }}><Square size={16} /></button> : <button type="button" title="Ask coach" aria-label="Ask coach" disabled={!input.trim()} onClick={() => input.trim() && ask(input.trim())} className="rounded px-3 py-2" style={{ background: T.accent, color: '#1A1306' }}><Send size={16} /></button>}
          </div>
          {/* Prompts sit under the composer, so the input is the first thing reached
              whether or not the conversation has started. The roomier two-column form
              is kept for an empty thread, where it is the only thing to act on. */}
          {promptChoices(msgs.length === 0 ? 'empty' : 'footer')}
        </div>
      </div>

      <div className="th-coach-sidebar space-y-4">
        <CoachMemory memory={memory} onChange={setMemory} includeWritten={includeWritten} />
        {commitments.find((item) => item.status === 'active') && <section className="th-coach-memory"><h3>Active commitment</h3><p>{commitments.find((item) => item.status === 'active').title}</p></section>}
        <Panel title="Live price">
          <div className="flex gap-2">
            <input style={inputStyle} className="flex-1 rounded px-2 py-1.5 text-sm" value={price.sym} onChange={(e) => setPrice((p) => ({ ...p, sym: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && checkPrice()} placeholder="BTC, EURUSD, AAPL" />
            <button type="button" onClick={checkPrice} disabled={price.loading} className="rounded px-2.5 py-1.5" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}><Search size={15} /></button>
          </div>
          <div className="mt-2 text-sm min-h-[20px]" style={mono}>
            {price.loading ? <span style={{ color: T.accentText }}>Looking up…</span>
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
        <Panel title="Data and privacy">
          <p className="text-sm" style={{ color: T.dim }}>
            The coach reads your TradeHelp journal. With <span style={{ color: T.accentText, ...mono }}>Ollama</span>, processing stays on this device. Choose the model in Settings.
          </p>
        </Panel>
      </div>
      {creatingCommitment && <CommitmentModal source="coach-evidence" suggestion={creatingCommitment} onClose={() => setCreatingCommitment(false)} onSave={onAddCommitment} />}
    </div>
  )
}

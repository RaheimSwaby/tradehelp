import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X, ChevronLeft, ChevronRight, Play, Pause, ClipboardList,
  LogIn, LogOut, CheckCircle2, XCircle, CalendarOff, Image as ImageIcon
} from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'

function momentValue(raw, fallback) {
  const text = String(raw || fallback || '')
  const value = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'))
  return Number.isFinite(value) ? value : 0
}

function displayTime(raw) {
  const match = String(raw || '').match(/[T ](\d{1,2}:\d{2})/)
  return match?.[1] || '—'
}

function planDate(plan) {
  return String(plan.plannedAt || plan.lockedAt || plan.createdAt || '').slice(0, 10)
}

function tradeDate(trade) {
  return String(trade.entryTime || trade.timestamp || '').slice(0, 10)
}

function valueOrDash(value, money = false) {
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return '—'
  return money ? fmt$(number) : fmtN(number, 2)
}

export function PlanComparison({ plan, trade }) {
  if (!plan || !trade) return null
  const rows = [
    ['Direction', plan.direction || '—', trade.direction || '—'],
    ['Entry', valueOrDash(plan.plannedEntry), valueOrDash(trade.entry)],
    ['Stop', valueOrDash(plan.plannedStop), valueOrDash(trade.stop)],
    ['Target', valueOrDash(plan.plannedTarget), valueOrDash(trade.target)],
    ['Risk', valueOrDash(plan.riskAmount, true), valueOrDash(trade.riskAmount, true)],
    ['Setup', plan.setup || '—', trade.setup || '—']
  ]
  return (
    <div className="mt-3 rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
      <div className="grid grid-cols-[1fr_1fr_1fr] text-[10px] uppercase tracking-wider px-2 py-1.5" style={{ background: T.surface2, color: T.faint }}>
        <span>Field</span><span>Planned</span><span>Actual</span>
      </div>
      {rows.map(([label, planned, actual]) => {
        const matches = String(planned).toLowerCase() === String(actual).toLowerCase()
        return (
          <div key={label} className="grid grid-cols-[1fr_1fr_1fr] text-xs px-2 py-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
            <span style={{ color: T.faint }}>{label}</span>
            <span style={{ ...mono, color: T.dim }}>{planned}</span>
            <span style={{ ...mono, color: matches ? T.up : T.text }}>{actual}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PlanScreenshot({ plan }) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => {
    let live = true
    setDataUrl('')
    if (!plan?.hasScreenshot || !window.api?.getTradePlanScreenshot) return undefined
    window.api.getTradePlanScreenshot(plan.id).then((result) => { if (live) setDataUrl(result?.dataUrl || '') })
    return () => { live = false }
  }, [plan?.id, plan?.hasScreenshot])
  if (!plan?.hasScreenshot) return null
  return dataUrl
    ? <img src={dataUrl} alt="Pre-trade chart" className="mt-3 w-full max-h-52 object-contain rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }} />
    : <div className="mt-3 text-xs flex items-center gap-1.5" style={{ color: T.faint }}><ImageIcon size={13} /> Loading planned chart…</div>
}

function eventMeta(kind) {
  if (kind === 'plan') return { label: 'Plan', color: T.accent, Icon: ClipboardList }
  if (kind === 'entry') return { label: 'Entry', color: T.text, Icon: LogIn }
  if (kind === 'exit') return { label: 'Exit', color: T.up, Icon: LogOut }
  return { label: 'No-trade log', color: T.dim, Icon: CalendarOff }
}

export function DayReplayModal({ date, trades = [], plans = [], dayLogs = [], commitments = [], onClose, onOpenTrade }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const dayTrades = useMemo(
    () => trades.filter((trade) => tradeDate(trade) === date).sort((a, b) => momentValue(a.entryTime || a.timestamp) - momentValue(b.entryTime || b.timestamp)),
    [trades, date]
  )
  const dayPlans = useMemo(() => plans.filter((plan) => planDate(plan) === date), [plans, date])
  const dayLogEntries = useMemo(() => dayLogs.filter((entry) => entry.date === date), [dayLogs, date])
  const visibleTradeIds = useMemo(() => new Set(trades.map((trade) => String(trade.id))), [trades])
  const tradeById = useMemo(() => new Map(trades.map((trade) => [String(trade.id), trade])), [trades])
  const planByTradeId = useMemo(() => new Map(plans.filter((plan) => plan.linkedTradeId).map((plan) => [String(plan.linkedTradeId), plan])), [plans])
  const commitmentByTrade = useMemo(() => {
    const map = new Map()
    for (const commitment of commitments) {
      for (const result of commitment.results || []) {
        if (result.day !== date || !visibleTradeIds.has(String(result.tradeId))) continue
        const list = map.get(String(result.tradeId)) || []
        list.push({ commitment, result })
        map.set(String(result.tradeId), list)
      }
    }
    return map
  }, [commitments, date, visibleTradeIds])

  const timeline = useMemo(() => {
    const items = []
    for (const plan of dayPlans) {
      items.push({
        id: `plan-${plan.id}`, kind: 'plan', rawTime: plan.plannedAt || plan.lockedAt,
        sortTime: momentValue(plan.plannedAt || plan.lockedAt, `${date} 00:00`),
        title: `${plan.symbol || 'Trade'} ${plan.direction || ''} planned`, plan,
        trade: plan.linkedTradeId ? tradeById.get(String(plan.linkedTradeId)) : null
      })
    }
    for (const trade of dayTrades) {
      const entryTime = trade.entryTime || trade.timestamp || `${date} 12:00`
      const exitTime = trade.exitTime || entryTime
      const normalizedFills = Array.isArray(trade.fills) && trade.fills.length
        ? [...trade.fills].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0) || String(a.filledAt || '').localeCompare(String(b.filledAt || '')) || String(a.id || '').localeCompare(String(b.id || '')))
        : []
      if (normalizedFills.length) {
        const lastExitIndex = normalizedFills.reduce((last, fill, index) => fill.kind === 'exit' ? index : last, -1)
        normalizedFills.forEach((fill, index) => {
          const kind = fill.kind === 'exit' ? 'exit' : 'entry'
          const rawTime = fill.filledAt || (kind === 'exit' ? exitTime : entryTime)
          items.push({
            id: `fill-${trade.id}-${fill.id || index}`, kind, rawTime,
            sortTime: momentValue(rawTime, kind === 'exit' ? exitTime : entryTime) + (index / 1000),
            title: `${trade.symbol} ${kind} fill · ${fill.side || '—'} ${fmtN(fill.quantity, 2)} @ ${fmtN(fill.price, 2)}`,
            trade, fill, settlesTrade: kind === 'exit' && index === lastExitIndex,
            plan: planByTradeId.get(String(trade.id)) || null,
            commitmentResults: kind === 'exit' && index === lastExitIndex ? (commitmentByTrade.get(String(trade.id)) || []) : []
          })
        })
      } else {
        items.push({
          id: `entry-${trade.id}`, kind: 'entry', rawTime: entryTime,
          sortTime: momentValue(entryTime), title: `${trade.symbol} ${trade.direction} opened`, trade,
          plan: planByTradeId.get(String(trade.id)) || null
        })
        items.push({
          id: `exit-${trade.id}`, kind: 'exit', rawTime: exitTime,
          sortTime: momentValue(exitTime) + 1, title: `${trade.symbol} closed ${fmt$(trade.pnl)}`, trade,
          plan: planByTradeId.get(String(trade.id)) || null,
          commitmentResults: commitmentByTrade.get(String(trade.id)) || []
        })
      }
    }
    for (const dayLog of dayLogEntries) {
      items.push({ id: `daylog-${dayLog.id}`, kind: 'daylog', rawTime: `${date} 12:00`, sortTime: momentValue(`${date} 12:00`), title: dayLog.reason || 'No-trade day', dayLog })
    }
    items.sort((a, b) => a.sortTime - b.sortTime || a.id.localeCompare(b.id))
    let cumulative = 0
    return items.map((item) => {
      if (item.kind === 'exit' && (!item.fill || item.settlesTrade)) cumulative += Number(item.trade?.pnl) || 0
      return { ...item, cumulative }
    })
  }, [dayPlans, dayTrades, dayLogEntries, tradeById, planByTradeId, commitmentByTrade, date])

  useEffect(() => { setStep(0); setPlaying(false) }, [date])
  useEffect(() => {
    if (!playing || timeline.length < 2) return undefined
    const timer = setInterval(() => {
      setStep((current) => {
        if (current >= timeline.length - 1) { setPlaying(false); return current }
        return current + 1
      })
    }, 1200)
    return () => clearInterval(timer)
  }, [playing, timeline.length])

  const totalPnl = dayTrades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0)
  const wins = dayTrades.filter((trade) => (Number(trade.pnl) || 0) > 0).length
  const dayResults = commitments.flatMap((commitment) => (commitment.results || []).filter((result) => result.day === date && visibleTradeIds.has(String(result.tradeId))))
  const followed = dayResults.filter((result) => result.adhered).length
  const active = timeline[step] || null
  const activeMeta = active ? eventMeta(active.kind) : null

  return createPortal(
    <div className="th-overlay fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4" style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}>
          <div>
            <div className="text-sm font-semibold">Session replay</div>
            <div className="text-xs mt-0.5" style={{ color: T.dim }}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }}><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Net P&L', fmt$(totalPnl), totalPnl >= 0 ? T.up : T.down],
              ['Trades', String(dayTrades.length), T.text],
              ['Win rate', dayTrades.length ? `${fmtN((wins / dayTrades.length) * 100, 0)}%` : '—', T.text],
              ['Commitments', dayResults.length ? `${followed}/${dayResults.length} followed` : 'No checks', dayResults.length && followed === dayResults.length ? T.up : T.dim]
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
                <div className="text-sm font-semibold mt-1" style={{ ...mono, color }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="text-[11px]" style={{ color: T.faint }}>Trades and P&amp;L are grouped by entry session; an overnight exit stays with the session where its trade opened.</div>

          {timeline.length === 0 ? (
            <div className="py-14 text-center text-sm" style={{ color: T.dim }}>Nothing was recorded for this day.</div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} style={{ color: T.dim, opacity: step === 0 ? 0.35 : 1 }}><ChevronLeft size={17} /></button>
                <button type="button" onClick={() => setPlaying((value) => !value)} className="rounded-full p-1.5" style={{ background: T.accent, color: '#1A1306' }}>
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button type="button" onClick={() => setStep((value) => Math.min(timeline.length - 1, value + 1))} disabled={step >= timeline.length - 1} style={{ color: T.dim, opacity: step >= timeline.length - 1 ? 0.35 : 1 }}><ChevronRight size={17} /></button>
                <div className="h-1.5 grow rounded-full overflow-hidden" style={{ background: T.surface }}>
                  <div className="h-full rounded-full" style={{ width: `${((step + 1) / timeline.length) * 100}%`, background: T.accent, transition: 'width .2s' }} />
                </div>
                <span className="text-xs" style={{ ...mono, color: T.faint }}>{step + 1}/{timeline.length}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                <div className="space-y-1 max-h-[430px] overflow-y-auto pr-1">
                  {timeline.map((item, index) => {
                    const meta = eventMeta(item.kind)
                    const Icon = meta.Icon
                    return (
                      <button key={item.id} type="button" onClick={() => { setStep(index); setPlaying(false) }} className="w-full text-left rounded-lg px-3 py-2 flex items-start gap-2"
                        style={{ background: index === step ? T.surface2 : 'transparent', border: `1px solid ${index === step ? meta.color : 'transparent'}` }}>
                        <Icon size={14} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold truncate" style={{ color: T.text }}>{item.title}</span>
                          <span className="block text-[10px] mt-0.5" style={{ ...mono, color: T.faint }}>{displayTime(item.rawTime)} · {meta.label} · running {fmt$(item.cumulative)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                {active && activeMeta && (
                  <div className="rounded-xl p-4" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                    <div className="flex items-center gap-2">
                      <activeMeta.Icon size={16} style={{ color: activeMeta.color }} />
                      <span className="text-xs uppercase tracking-wider" style={{ color: activeMeta.color }}>{activeMeta.label}</span>
                      <span className="ml-auto text-xs" style={{ ...mono, color: T.faint }}>{displayTime(active.rawTime)}</span>
                    </div>
                    <div className="text-lg font-semibold mt-2">{active.title}</div>

                    {active.kind === 'plan' && (
                      <>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                          <div><span style={{ color: T.faint }}>Setup</span><div style={{ color: T.text }}>{active.plan.setup || '—'}</div></div>
                          <div><span style={{ color: T.faint }}>Confidence</span><div style={{ color: T.text }}>{active.plan.confidence ? `${active.plan.confidence}%` : '—'}</div></div>
                          <div><span style={{ color: T.faint }}>Risk</span><div style={{ color: T.text }}>{valueOrDash(active.plan.riskAmount, true)}</div></div>
                          <div><span style={{ color: T.faint }}>Status</span><div className="capitalize" style={{ color: T.text }}>{active.plan.status}</div></div>
                        </div>
                        {active.plan.thesis && <div className="mt-3 text-sm" style={{ color: T.dim }}><span className="font-semibold" style={{ color: T.text }}>Thesis:</span> {active.plan.thesis}</div>}
                        {active.plan.invalidation && <div className="mt-2 text-sm" style={{ color: T.dim }}><span className="font-semibold" style={{ color: T.text }}>Invalidation:</span> {active.plan.invalidation}</div>}
                        <PlanScreenshot plan={active.plan} />
                        <PlanComparison plan={active.plan} trade={active.trade} />
                      </>
                    )}

                    {(active.kind === 'entry' || active.kind === 'exit') && active.trade && (
                      <>
                        {active.fill && (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 rounded-lg p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                            <div><span className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Event</span><div className="text-xs capitalize" style={{ color: T.text }}>{active.fill.kind} · {active.fill.side}</div></div>
                            <div><span className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Quantity</span><div className="text-xs" style={{ ...mono, color: T.text }}>{fmtN(active.fill.quantity, 4)}</div></div>
                            <div><span className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Price</span><div className="text-xs" style={{ ...mono, color: T.text }}>{fmtN(active.fill.price, 4)}</div></div>
                            <div><span className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Fee</span><div className="text-xs" style={{ ...mono, color: T.text }}>{fmt$(Number(active.fill.fee) || 0)}</div></div>
                            <div><span className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Time</span><div className="text-xs" style={{ ...mono, color: T.text }}>{displayTime(active.fill.filledAt || active.rawTime)}</div></div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                          <div><span style={{ color: T.faint }}>Entry</span><div style={{ ...mono, color: T.text }}>{valueOrDash(active.trade.entry)}</div></div>
                          <div><span style={{ color: T.faint }}>Exit</span><div style={{ ...mono, color: T.text }}>{valueOrDash(active.trade.exit)}</div></div>
                          <div><span style={{ color: T.faint }}>Net</span><div style={{ ...mono, color: (Number(active.trade.pnl) || 0) >= 0 ? T.up : T.down }}>{fmt$(active.trade.pnl)}</div></div>
                          <div><span style={{ color: T.faint }}>Setup</span><div style={{ color: T.text }}>{active.trade.setup || '—'}</div></div>
                          <div><span style={{ color: T.faint }}>Emotion</span><div style={{ color: T.text }}>{active.trade.emotion || '—'}</div></div>
                          <div><span style={{ color: T.faint }}>Screenshots</span><div style={{ color: T.text }}>{Number(active.trade.imageCount) || 0}</div></div>
                        </div>
                        {active.trade.notes && <div className="mt-3 text-sm whitespace-pre-wrap" style={{ color: T.dim }}>{active.trade.notes}</div>}
                        {(active.commitmentResults || []).length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {(active.commitmentResults || []).map(({ commitment, result }) => (
                              <div key={commitment.id} className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                                {result.adhered ? <CheckCircle2 size={14} style={{ color: T.up }} /> : <XCircle size={14} style={{ color: T.down }} />}
                                <div><div className="font-semibold">{commitment.title}</div><div style={{ color: T.faint }}>{result.detail}</div></div>
                              </div>
                            ))}
                          </div>
                        )}
                        <PlanComparison plan={active.plan} trade={active.trade} />
                        <button type="button" onClick={() => onOpenTrade?.(active.trade)} className="mt-4 rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Open full trade</button>
                      </>
                    )}

                    {active.kind === 'daylog' && active.dayLog && (
                      <div className="mt-3 text-sm" style={{ color: T.dim }}>
                        {active.dayLog.mood && <div className="mb-1"><span style={{ color: T.faint }}>Mood:</span> {active.dayLog.mood}</div>}
                        {active.dayLog.note || 'No additional note.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

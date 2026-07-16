import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, ExternalLink, GitCompareArrows, X } from 'lucide-react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { T, inputStyle, mono } from '../theme.js'
import { fmt$, fmtDuration, fmtN } from '../utils.js'
import { summarizeTradeSession, tradeSessionDate } from '../workflow.js'

function dateLabel(date) {
  if (!date) return 'No session'
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function timeLabel(value) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function numberOrDash(value, digits = 1) {
  return Number.isFinite(value) ? fmtN(value, digits) : '—'
}

function moneyOrDash(value) {
  return Number.isFinite(value) ? fmt$(value) : '—'
}

function Metric({ label, value, tone = T.text, sub = '' }) {
  return (
    <div className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
      <div className="text-sm font-semibold mt-0.5 truncate" style={{ ...mono, color: tone }} title={String(value)}>{value}</div>
      {sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: T.faint }} title={sub}>{sub}</div>}
    </div>
  )
}

function TradeLink({ label, trade, onOpenTrade }) {
  if (!trade) return <Metric label={label} value="—" />
  return (
    <button type="button" onClick={() => onOpenTrade?.(trade)} className="min-w-0 rounded-lg px-2.5 py-2 text-left"
      style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
      <div className="text-[10px] uppercase tracking-wider flex items-center gap-1" style={{ color: T.faint }}>{label}<ExternalLink size={10} /></div>
      <div className="text-sm font-semibold mt-0.5 truncate" style={{ ...mono, color: Number(trade.pnl) >= 0 ? T.up : T.down }}>{fmt$(Number(trade.pnl) || 0)}</div>
      <div className="text-[10px] mt-0.5 truncate" style={{ color: T.faint }}>{trade.symbol || 'Trade'} · {trade.setup || 'No setup tag'}</div>
    </button>
  )
}

function SessionCard({ session, onOpenTrade }) {
  const planAdherence = Number.isFinite(session.executionScore)
    ? `${fmtN(session.executionScore, 0)}/100`
    : '—'
  const executionGrade = session.dominantExecutionGrade || session.executionGrade || '—'
  return (
    <div className="min-w-0 rounded-xl p-3" style={{ border: `1px solid ${T.line}` }}>
      <div className="text-sm font-semibold mb-3">{dateLabel(session.date)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Net P&L" value={fmt$(session.netPnl)} tone={session.netPnl >= 0 ? T.up : T.down} />
        <Metric label="Trades" value={String(session.tradeCount)} sub={`${session.wins} wins · ${session.losses} losses`} />
        <Metric label="Win rate" value={session.winRate == null ? '—' : `${fmtN(session.winRate, 1)}%`} />
        <Metric label="Profit factor" value={session.profitFactor === Infinity ? '∞' : numberOrDash(session.profitFactor, 2)} />
        <Metric label="Avg winner" value={moneyOrDash(session.avgWinner)} tone={T.up} />
        <Metric label="Avg loser" value={moneyOrDash(session.avgLoser)} tone={T.down} />
        <Metric label="Fees" value={fmt$(session.fees)} />
        <Metric label="Total risk" value={fmt$(session.totalRisk)} />
        <Metric label="Avg R:R" value={session.avgRR == null ? '—' : `1:${fmtN(session.avgRR, 2)}`} />
        <Metric label="Execution grade" value={executionGrade} sub={session.dominantExecutionGrade ? 'most frequent self-grade' : Number.isFinite(session.executionScore) ? 'from linked-plan score' : ''} />
        <Metric label="First entry" value={timeLabel(session.firstEntryMs)} />
        <Metric label="Last entry" value={timeLabel(session.lastEntryMs)} />
        <Metric label="Session duration" value={fmtDuration(session.durationMs) || '—'} sub="first entry to last exit" />
        <Metric label="Plan adherence" value={planAdherence} sub={session.linkedPlanCount ? `${session.scoredPlanCount}/${session.linkedPlanCount} linked plans scored` : 'no linked plans'} />
        <Metric label="Dominant setup" value={session.dominantSetup || '—'} />
        <Metric label="Dominant emotion" value={session.dominantEmotion || '—'} />
        <TradeLink label="Best trade" trade={session.bestTrade} onOpenTrade={onOpenTrade} />
        <TradeLink label="Worst trade" trade={session.worstTrade} onOpenTrade={onOpenTrade} />
      </div>
    </div>
  )
}

function differenceText(left, right) {
  const callouts = []
  const pnlDelta = right.netPnl - left.netPnl
  callouts.push(`${dateLabel(right.date)} finished ${fmt$(Math.abs(pnlDelta))} ${pnlDelta >= 0 ? 'higher' : 'lower'} in net P&L than ${dateLabel(left.date)}.`)
  if (left.winRate != null && right.winRate != null) {
    const delta = right.winRate - left.winRate
    callouts.push(`Win rate was ${fmtN(Math.abs(delta), 1)} percentage points ${delta >= 0 ? 'higher' : 'lower'} in the second session.`)
  }
  const feeDelta = right.fees - left.fees
  if (Math.abs(feeDelta) >= 0.005) callouts.push(`Fees were ${fmt$(Math.abs(feeDelta))} ${feeDelta >= 0 ? 'higher' : 'lower'} in the second session.`)
  if (left.avgRR != null && right.avgRR != null) {
    const delta = right.avgRR - left.avgRR
    callouts.push(`Average recorded R:R was ${fmtN(Math.abs(delta), 2)} ${delta >= 0 ? 'higher' : 'lower'} in the second session.`)
  }
  return callouts.slice(0, 4)
}

export function SessionCompareModal({ trades = [], plans = [], onClose, onOpenTrade }) {
  const dates = useMemo(() => [...new Set(trades.map(tradeSessionDate).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [trades])
  const [leftDate, setLeftDate] = useState(dates[1] || dates[0] || '')
  const [rightDate, setRightDate] = useState(dates[0] || '')

  useEffect(() => {
    setLeftDate((current) => dates.includes(current) ? current : (dates[1] || dates[0] || ''))
    setRightDate((current) => dates.includes(current) ? current : (dates[0] || ''))
  }, [dates])

  const left = useMemo(() => summarizeTradeSession(trades, plans, leftDate), [trades, plans, leftDate])
  const right = useMemo(() => summarizeTradeSession(trades, plans, rightDate), [trades, plans, rightDate])
  const chartData = useMemo(() => {
    const length = Math.max(left.equity.length, right.equity.length)
    return Array.from({ length }, (_, sequence) => ({
      sequence,
      left: left.equity[sequence]?.equity ?? null,
      right: right.equity[sequence]?.equity ?? null
    }))
  }, [left.equity, right.equity])
  const callouts = useMemo(() => differenceText(left, right), [left, right])
  const canCompare = dates.length >= 2 && leftDate && rightDate && leftDate !== rightDate

  return createPortal(
    <div className="th-overlay fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-5 py-4" style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}>
          <GitCompareArrows size={18} style={{ color: T.accent }} />
          <div><div className="text-sm font-semibold">Compare sessions</div><div className="text-xs" style={{ color: T.dim }}>Side-by-side observations from recorded trade days</div></div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }} aria-label="Close session comparison"><X size={18} /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {dates.length < 2 ? (
            <div className="py-14 text-center">
              <div className="text-sm font-semibold">Two distinct trade days are needed.</div>
              <div className="text-xs mt-1" style={{ color: T.dim }}>{dates.length ? 'Record trades on one more day to compare sessions.' : 'Record trades on at least two days to compare sessions.'}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-3">
                <label className="min-w-0 text-xs" style={{ color: T.dim }}>Session A
                  <select value={leftDate} onChange={(event) => setLeftDate(event.target.value)} className="block w-full rounded-md px-2 py-2 mt-1 text-sm" style={inputStyle}>
                    {dates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
                  </select>
                </label>
                <ArrowRight size={16} className="mb-2" style={{ color: T.faint }} />
                <label className="min-w-0 text-xs" style={{ color: T.dim }}>Session B
                  <select value={rightDate} onChange={(event) => setRightDate(event.target.value)} className="block w-full rounded-md px-2 py-2 mt-1 text-sm" style={inputStyle}>
                    {dates.map((date) => <option key={date} value={date}>{dateLabel(date)}</option>)}
                  </select>
                </label>
              </div>

              {!canCompare ? (
                <div className="rounded-lg p-4 text-sm text-center" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>Choose two different sessions.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SessionCard session={left} onOpenTrade={onOpenTrade} />
                    <SessionCard session={right} onOpenTrade={onOpenTrade} />
                  </div>

                  <div className="rounded-xl p-3 sm:p-4" style={{ border: `1px solid ${T.line}` }}>
                    <div className="text-sm font-semibold">Cumulative intraday equity by trade sequence</div>
                    <div className="text-xs mt-0.5" style={{ color: T.faint }}>Both curves start at $0; sequence 1 is each session’s first trade, regardless of clock time.</div>
                    <div className="mt-3" style={{ height: 230 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                          <ReferenceLine y={0} stroke={T.line} />
                          <XAxis dataKey="sequence" allowDecimals={false} tick={{ fill: T.faint, fontSize: 10 }} stroke={T.line} />
                          <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: T.faint, fontSize: 10 }} stroke={T.line} />
                          <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(value, name) => [fmt$(value), name === 'left' ? dateLabel(left.date) : dateLabel(right.date)]} labelFormatter={(value) => `Trade sequence ${value}`} />
                          <Line type="linear" dataKey="left" name="left" stroke={T.accent} strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                          <Line type="linear" dataKey="right" name="right" stroke={T.up} strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs mt-1">
                      <span style={{ color: T.accent }}>● {dateLabel(left.date)}</span>
                      <span style={{ color: T.up }}>● {dateLabel(right.date)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl p-3 sm:p-4" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                    <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.accent }}>Observed differences</div>
                    <ul className="mt-2 space-y-1.5 text-sm" style={{ color: T.dim }}>{callouts.map((text) => <li key={text}>• {text}</li>)}</ul>
                    <div className="text-[11px] mt-3" style={{ color: T.faint }}>These are numeric differences in your records; they do not establish what caused either result.</div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

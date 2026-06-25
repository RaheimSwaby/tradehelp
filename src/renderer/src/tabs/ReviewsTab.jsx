import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { Sparkles } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, periodKey, periodLabel, streamChat } from '../utils.js'
import { computeStats, letterFor, executionGrade, tradeContext } from '../stats.js'
import { Stat, Panel } from '../components/Shared.jsx'
import { GroupTable, ReasonList } from './PsychologyTab.jsx'

/* ───────── periodic reviews ───────── */
const REVIEW_SYSTEM = `You are a trading coach writing a short periodic review. Given the trader's aggregated stats and trades for ONE period, summarize how the period went using their real numbers, name 1-2 strengths and 1-2 leaks (revenge, FOMO, overtrading, cutting winners early, oversizing), then give 2 concrete focus points for next period. No price predictions or buy/sell advice. Under ~170 words.`

export function Reviews({ trades, reviews, onSave }) {
  const [gran, setGran] = useState('week')
  const [sel, setSel] = useState('')
  const isAll = gran === 'all'
  const periods = useMemo(() => {
    if (isAll) return ['all-time']
    const seen = new Set()
    for (const t of trades) { const k = periodKey((t.entryTime || t.timestamp || '').slice(0, 10), gran); if (k) seen.add(k) }
    return [...seen].sort().reverse()
  }, [trades, gran, isAll])
  const period = isAll ? 'all-time' : (periods.includes(sel) ? sel : (periods[0] || ''))
  const pLabel = isAll ? 'All-time' : periodLabel(period, gran)
  const periodTrades = useMemo(() => isAll ? trades : trades.filter((t) => periodKey((t.entryTime || t.timestamp || '').slice(0, 10), gran) === period), [trades, gran, period, isAll])
  const stats = useMemo(() => computeStats(periodTrades), [periodTrades])
  const avgGrade = periodTrades.length ? Math.round(periodTrades.reduce((a, t) => a + executionGrade(t).score, 0) / periodTrades.length) : 0
  const records = useMemo(() => {
    if (!periodTrades.length) return null
    const pnls = periodTrades.map((t) => Number(t.pnl) || 0)
    const day = {}
    for (const t of periodTrades) { const d = (t.entryTime || t.timestamp || '').slice(0, 10); if (d) day[d] = (day[d] || 0) + (Number(t.pnl) || 0) }
    const days = Object.values(day)
    const fees = periodTrades.reduce((a, t) => a + (Number(t.fees) || 0), 0)
    return { bigWin: Math.max(...pnls), bigLoss: Math.min(...pnls), bestDay: Math.max(...days), worstDay: Math.min(...days), fees }
  }, [periodTrades])

  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [ai, setAi] = useState(null)
  useEffect(() => { setText(reviews?.[period] || ''); setAi(null) }, [period, reviews])

  function save() { onSave(period, text); setSaved(true); setTimeout(() => setSaved(false), 1500) }
  async function summarize() {
    if (!window.api?.aiChat || ai?.loading) return
    setAi({ loading: true })
    try {
      let acc = ''
      await streamChat({ system: REVIEW_SYSTEM, messages: [{ role: 'user', content: `Here is my ${pLabel} performance:\n\n${tradeContext(periodTrades, stats)}` }] },
        (d) => { acc += d; setAi({ text: acc }) })
    } catch (e) { setAi({ error: String(e?.message || e) }) }
  }

  if (trades.length === 0) {
    return <Panel title="Reviews"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Log trades to build weekly, monthly and quarterly reviews.</div></Panel>
  }
  const GRANS = [['week', 'Weekly'], ['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly'], ['all', 'All-time']]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {GRANS.map(([g, label]) => (
            <button key={g} type="button" onClick={() => { setGran(g); setSel('') }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: gran === g ? T.surface2 : 'transparent', color: gran === g ? T.accent : T.dim, border: `1px solid ${gran === g ? T.line : 'transparent'}` }}>{label}</button>
          ))}
        </div>
        {!isAll && (
          <select style={inputStyle} className="rounded px-2 py-1.5 text-sm" value={period} onChange={(e) => setSel(e.target.value)}>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p, gran)}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} sub={`${stats.n} trades · ${stats.activeDays} days`} />
        <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`PF ${stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)}`} />
        <Stat label="Avg grade" value={letterFor(avgGrade).letter} tone="accent" sub={`${avgGrade}/100 execution`} />
        <Stat label="Expectancy" value={fmt$(stats.expectancy)} sub={`max DD ${fmt$(-stats.maxDD)}`} />
      </div>

      {records && (
        <Panel title={isAll ? 'Career records' : 'Records'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Biggest win" value={fmt$(records.bigWin)} tone="up" />
            <Stat label="Biggest loss" value={fmt$(records.bigLoss)} tone="down" />
            <Stat label="Best day" value={fmt$(records.bestDay)} tone="up" />
            <Stat label="Worst day" value={fmt$(records.worstDay)} tone="down" />
            <Stat label="Longest non-tilt" value={String(stats.bestNonTilt)} sub="best streak" tone="accent" />
            <Stat label="Total fees" value={fmt$(records.fees)} sub="paid" />
            <Stat label="Trades logged" value={String(stats.n)} sub={`${stats.activeDays} active days`} />
            <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`${stats.activeDays ? fmtN(stats.n / stats.activeDays, 1) : 0}/day`} />
          </div>
        </Panel>
      )}

      {stats.n > 0 && (
        <Panel title={`Equity · ${pLabel}`}>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.equity} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="i" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'Equity']} />
              <Line type="monotone" dataKey="equity" stroke={T.accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GroupTable title="P&L by setup" rows={stats.bySetup} />
        <div className="space-y-4">
          <ReasonList title="Why you won" rows={stats.reasonsWin} tone="up" />
          <ReasonList title="Why you lost" rows={stats.reasonsLoss} tone="down" />
        </div>
      </div>

      <Panel title="Your review" right={
        <button type="button" onClick={summarize} disabled={ai?.loading} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Sparkles size={13} /> {ai?.loading ? 'Thinking…' : 'AI summary'}</button>
      }>
        {ai && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: T.accentSoft, border: `1px solid ${T.line}`, color: '#F3D9A0' }}>
            {ai.loading ? <span style={{ color: T.accent }}>Reviewing the period…</span> : ai.error ? <span style={{ color: T.down }}>⚠︎ {ai.error}</span> : <div className="whitespace-pre-wrap">{ai.text}</div>}
          </div>
        )}
        <textarea style={inputStyle} className="w-full rounded px-3 py-2 text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'What worked this period?\nWhat leaked?\nFocus for next period:'} />
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={save} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save review</button>
          {saved && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
        </div>
      </Panel>
    </div>
  )
}

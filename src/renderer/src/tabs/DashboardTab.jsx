import React, { useState, useMemo } from 'react'
import { Share2 } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts'
import { T, mono } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { computeStats } from '../stats.js'
import { Stat, Panel, EmptyChart } from '../components/Shared.jsx'
import { PnlCalendar } from './JournalTab.jsx'
import { CoachBriefCard } from '../components/CoachBriefCard.jsx'
import { ShareReportModal } from '../components/ShareReportModal.jsx'

const HMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function heatColor(wr, total) {
  if (!total || total < 2) return { bg: 'transparent', border: T.line, glow: 'none', text: T.faint }
  if (wr >= 80) return { bg: '#ff4500', border: '#ff6a33', glow: '0 0 12px 3px rgba(255,80,0,0.65)', text: '#fff' }
  if (wr >= 70) return { bg: '#dc2626', border: '#ef4444', glow: '0 0 8px 2px rgba(220,38,38,0.5)', text: '#fff' }
  if (wr >= 60) return { bg: '#c2410c', border: '#ea580c', glow: '0 0 6px 1px rgba(194,65,12,0.4)', text: '#fff' }
  if (wr >= 50) return { bg: '#b45309', border: '#d97706', glow: 'none', text: '#fde68a' }
  if (wr >= 38) return { bg: '#1e3a5f', border: '#2563eb', glow: 'none', text: '#93c5fd' }
  return { bg: '#0f1f38', border: '#1e3a5f', glow: 'none', text: '#60a5fa' }
}

function HeatMap({ stats }) {
  const [hovered, setHovered] = useState(null)
  const { byHourDay = {}, bestHour, worstHour, bestDay, worstDay } = stats

  const allHours = Object.keys(byHourDay).map((k) => parseInt(k.split('-')[1], 10))
  const minH = allHours.length ? Math.min(...allHours) : 9
  const maxH = allHours.length ? Math.max(...allHours) : 16
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => String(minH + i).padStart(2, '0'))
  const activeDays = HMAP_DAYS.filter((d) => hours.some((h) => byHourDay[`${d}-${h}`]))
  const days = activeDays.length ? activeDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  const fmt12 = (h) => { const n = parseInt(h, 10); return n === 0 ? '12am' : n < 12 ? `${n}am` : n === 12 ? '12pm' : `${n - 12}pm` }

  const hasData = Object.keys(byHourDay).length > 0

  return (
    <Panel title="Performance heat map">
      {/* Advisory */}
      {(bestHour || bestDay) && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {bestHour && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,69,0,0.12)', border: '1px solid rgba(255,69,0,0.3)', color: '#ff6a33' }}>
              🔥 Best hour: {fmt12(bestHour.k)}–{fmt12(String(parseInt(bestHour.k, 10) + 1).padStart(2, '0'))} · {fmtN(bestHour.wr, 0)}% WR
            </div>
          )}
          {bestDay && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,69,0,0.08)', border: '1px solid rgba(255,69,0,0.25)', color: '#fb923c' }}>
              📅 Best day: {bestDay.k} · {fmtN(bestDay.wr, 0)}% WR
            </div>
          )}
          {worstHour && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(96,165,250,0.2)', color: '#93c5fd' }}>
              ❄️ Worst hour: {fmt12(worstHour.k)} · {fmtN(worstHour.wr, 0)}% WR
            </div>
          )}
        </div>
      )}

      {!hasData ? (
        <div className="py-8 text-center text-xs" style={{ color: T.faint }}>Log trades with entry times to see your heat map.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                {hours.map((h) => (
                  <th key={h} style={{ fontSize: 10, color: T.faint, fontWeight: 400, textAlign: 'center', paddingBottom: 4, minWidth: 40 }}>{fmt12(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td style={{ fontSize: 11, color: T.dim, paddingRight: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>{day}</td>
                  {hours.map((h) => {
                    const cell = byHourDay[`${day}-${h}`]
                    const total = cell?.total || 0
                    const wr = total ? (cell.wins / total) * 100 : 0
                    const c = heatColor(wr, total)
                    const key = `${day}-${h}`
                    const isHov = hovered === key
                    return (
                      <td key={h} style={{ padding: 0 }}>
                        <div
                          onMouseEnter={() => setHovered(key)}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: 40, height: 32, borderRadius: 5,
                            background: c.bg,
                            border: `1px solid ${isHov ? T.accent : c.border}`,
                            boxShadow: isHov ? `0 0 0 1px ${T.accent}` : c.glow,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            cursor: total >= 2 ? 'default' : 'default',
                            transition: 'box-shadow .15s',
                            position: 'relative'
                          }}
                        >
                          {total >= 2 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: c.text, lineHeight: 1 }}>{Math.round(wr)}%</span>
                          )}
                          {isHov && total > 0 && (
                            <div style={{
                              position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                              background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 6,
                              padding: '5px 8px', zIndex: 10, whiteSpace: 'nowrap', fontSize: 11, color: T.text,
                              pointerEvents: 'none'
                            }}>
                              <div style={{ color: c.bg === 'transparent' ? T.dim : c.bg, fontWeight: 600 }}>{Math.round(wr)}% win rate</div>
                              <div style={{ color: T.dim }}>{total} trade{total !== 1 ? 's' : ''} · {fmt$(cell.pnl)}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 text-xs" style={{ color: T.faint }}>
            <span>Cold</span>
            {[['#0f1f38', '<40%'], ['#1e3a5f', '40%'], ['#b45309', '50%'], ['#c2410c', '60%'], ['#dc2626', '70%'], ['#ff4500', '80%+']].map(([bg, label]) => (
              <span key={label} className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: bg }} />
                {label}
              </span>
            ))}
            <span>Hot 🔥</span>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ───────── dashboard ───────── */
export function Dashboard({ stats, trades, accounts = [], settings, journalData, onSaveSettings, onOpenCoach }) {
  const [view, setView] = useState('all') // all | live | prop
  const [shareOpen, setShareOpen] = useState(false)
  const hasProp = accounts.length > 0
  const propIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])
  const viewTrades = useMemo(() => {
    if (view === 'all' || !hasProp) return trades
    if (view === 'prop') return trades.filter((t) => propIds.has(t.account))
    return trades.filter((t) => !propIds.has(t.account)) // live
  }, [trades, view, propIds, hasProp])
  // Reuse the precomputed combined stats for "all"; only recompute for a filtered view.
  const vStats = useMemo(() => (view === 'all' || !hasProp ? stats : computeStats(viewTrades)), [view, hasProp, stats, viewTrades])
  const empty = vStats.n === 0

  return (
    <div className="space-y-4">
      <CoachBriefCard trades={viewTrades} stats={vStats} settings={settings} journalData={journalData} onSaveSettings={onSaveSettings} onOpenCoach={onOpenCoach} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasProp ? <div className="flex items-center gap-1.5">
          {[['all', 'All'], ['live', 'Live'], ['prop', 'Prop']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setView(k)} className="text-xs px-3 py-1.5 rounded-md font-semibold"
              style={{ background: view === k ? T.surface2 : 'transparent', color: view === k ? T.accent : T.dim, border: `1px solid ${view === k ? T.line : 'transparent'}` }}>
              {label}
            </button>
          ))}
          <span className="text-xs ml-1" style={{ color: T.faint }}>
            {view === 'prop' ? 'prop-tagged trades only' : view === 'live' ? 'live / personal trades only' : 'live + prop combined'}
          </span>
        </div> : <span />}
        <button type="button" onClick={() => setShareOpen(true)} disabled={empty} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold"
          style={{ background: empty ? T.surface2 : T.accent, color: empty ? T.faint : '#1A1306' }}>
          <Share2 size={15} /> Share report
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(vStats.totalPnl)} tone={vStats.totalPnl >= 0 ? 'up' : 'down'} sub={`${vStats.n} trades`} />
        <Stat label="Win rate" value={`${fmtN(vStats.winRate, 1)}%`} sub={`expectancy ${fmt$(vStats.expectancy)}/trade`} />
        <Stat label="Profit factor" value={vStats.profitFactor === Infinity ? '∞' : fmtN(vStats.profitFactor, 2)} tone="accent" sub="gross win ÷ gross loss" />
        <Stat label="Avg R:R" value={vStats.avgRR ? `1:${fmtN(vStats.avgRR, 1)}` : '—'} />
        <Stat label="Max drawdown" value={fmt$(-vStats.maxDD)} tone="down" />
        <Stat label="Avg winner" value={fmt$(vStats.avgWin)} tone="up" />
        <Stat label="Avg loser" value={fmt$(-vStats.avgLoss)} tone="down" />
        <Stat label="Streaks" value={String(vStats.currentStreak)} sub={`best ${vStats.bestWin}W · worst ${vStats.worstLoss}L`} />
      </div>

      <PnlCalendar trades={viewTrades} />

      <Panel title="Equity curve">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={vStats.equity} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="i" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'Equity']} />
              <Area type="monotone" dataKey="equity" stroke={T.accent} strokeWidth={2.5} fill="url(#equityFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Daily P&L (last 14 active days)">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vStats.daily} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="day" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{vStats.daily.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? T.up : T.down} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <HeatMap stats={vStats} />
      {shareOpen && (
        <ShareReportModal
          trades={viewTrades}
          accountLabel={view === 'prop' ? 'Prop accounts' : view === 'live' ? 'Live accounts' : 'All accounts'}
          accent={T.accent}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

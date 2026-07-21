import React, { useState, useMemo } from 'react'
import { Share2, GitCompareArrows, Quote, Flame, CalendarDays, Snowflake, TrendingDown } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts'
import { T, mono, withAlpha } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { computeStats, computeLeaks } from '../stats.js'
import { Stat, Panel, EmptyChart } from '../components/Shared.jsx'
import { PnlCalendar } from './JournalTab.jsx'
import { quoteOfTheDay } from '../quotes.js'
import { CoachBriefCard } from '../components/CoachBriefCard.jsx'
import { CoachCommitmentCard } from '../components/CoachCommitmentCard.jsx'
import { ShareReportModal } from '../components/ShareReportModal.jsx'
import { DayReplayModal } from '../components/DayReplayModal.jsx'
import { SessionCompareModal } from '../components/SessionCompareModal.jsx'

const HMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Leak finder — puts a dollar figure on your worst behavioral pattern. The point
// isn't to shame; it's to make the cost of tilt concrete and, therefore, fixable.
function LeakFinder({ trades }) {
  const leak = useMemo(() => computeLeaks(trades), [trades])
  if (!leak.taggedCount) return null // no emotion/reason tags yet — nothing to analyze
  if (!leak.worst) {
    return (
      <div className="rounded-lg p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>💸 Leak finder</div>
        <div className="text-sm mt-1" style={{ color: T.up }}>No behavioral leaks detected — the trades where you flagged an emotion or reason are net positive. Keep it disciplined. 🧊</div>
      </div>
    )
  }
  const worst = leak.worst
  const max = Math.abs(leak.leaks[0].pnl) || 1
  return (
    <div className="rounded-xl p-4" style={{ background: `linear-gradient(150deg, ${T.surface2}, ${withAlpha(T.down, 0.09)})`, border: `1px solid ${withAlpha(T.down, 0.4)}` }}>
      <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.down }}>💸 Your biggest leak</div>
      <div className="mt-1.5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg font-semibold" style={{ color: T.text }}>{worst.label} <span className="text-xs font-normal" style={{ color: T.dim }}>— {worst.blurb}</span></div>
          <div className="text-xs mt-0.5" style={{ color: T.faint }}>{worst.n} trades tagged</div>
        </div>
        <div className="text-3xl font-extrabold" style={{ ...mono, color: T.down }}>{fmt$(worst.pnl)}</div>
      </div>
      {leak.leaks.length > 1 && (
        <div className="mt-3 space-y-1.5">
          {leak.leaks.slice(0, 4).map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <div className="text-xs w-28 shrink-0 truncate" style={{ color: T.dim }}>{c.label}</div>
              <div className="h-2 rounded-full grow overflow-hidden" style={{ background: T.surface }}>
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(c.pnl) / max) * 100}%`, background: T.down, transition: 'width .4s' }} />
              </div>
              <div className="text-xs w-16 text-right shrink-0" style={{ ...mono, color: T.down }}>{fmt$(c.pnl)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs mt-3" style={{ color: T.dim }}>
        {leak.totalLeaked < 0 && <>Trades where tilt showed up have cost you <b style={{ color: T.down }}>{fmt$(leak.totalLeaked)}</b> in total. </>}
        Every dollar here is fixable — that's the whole point.
      </div>
    </div>
  )
}

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

  const allHours = Object.keys(byHourDay).map((key) => parseInt(key.split('-')[1], 10))
  const minH = allHours.length ? Math.min(...allHours) : 9
  const maxH = allHours.length ? Math.max(...allHours) : 16
  const hours = Array.from({ length: maxH - minH + 1 }, (_, index) => String(minH + index).padStart(2, '0'))
  const activeDays = HMAP_DAYS.filter((day) => hours.some((hour) => byHourDay[`${day}-${hour}`]))
  const days = activeDays.length ? activeDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const fmt12 = (hour) => { const n = parseInt(hour, 10); return n === 0 ? '12am' : n < 12 ? `${n}am` : n === 12 ? '12pm' : `${n - 12}pm` }
  const hasData = Object.keys(byHourDay).length > 0
  const summaries = [
    bestHour && { key: 'best-hour', Icon: Flame, label: 'Best hour', value: `${fmt12(bestHour.k)}-${fmt12(String(parseInt(bestHour.k, 10) + 1).padStart(2, '0'))}`, stat: `${fmtN(bestHour.wr, 0)}% / ${bestHour.total} trades`, color: '#ff6a33', bg: 'rgba(255,69,0,0.12)', border: 'rgba(255,69,0,0.3)' },
    bestDay && { key: 'best-day', Icon: CalendarDays, label: 'Best day', value: bestDay.k, stat: `${fmtN(bestDay.wr, 0)}% / ${bestDay.total} trades`, color: '#fb923c', bg: 'rgba(255,69,0,0.08)', border: 'rgba(255,69,0,0.25)' },
    worstHour && { key: 'worst-hour', Icon: Snowflake, label: 'Weakest hour', value: fmt12(worstHour.k), stat: `${fmtN(worstHour.wr, 0)}% / ${worstHour.total} trades`, color: '#93c5fd', bg: 'rgba(30,58,95,0.3)', border: 'rgba(96,165,250,0.2)' },
    worstDay && { key: 'worst-day', Icon: TrendingDown, label: 'Weakest day', value: worstDay.k, stat: `${fmtN(worstDay.wr, 0)}% / ${worstDay.total} trades`, color: T.down, bg: withAlpha(T.down, 0.08), border: withAlpha(T.down, 0.24) }
  ].filter(Boolean)

  return (
    <Panel title="Performance heat map" right={<span className="text-[10px]" style={{ color: T.faint }}>WIN RATE / SAMPLE</span>}>
      {summaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
          {summaries.map(({ key, Icon, label, value, stat, color, bg, border }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg px-3 py-2 min-w-0" style={{ background: bg, border: `1px solid ${border}` }}>
              <Icon size={15} style={{ color, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase" style={{ color: T.faint }}>{label}</div>
                <div className="text-xs font-semibold truncate" style={{ color }}>{value} <span style={{ color: T.dim, fontWeight: 400 }}>· {stat}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasData ? (
        <div className="py-8 text-center text-xs" style={{ color: T.faint }}>Log trades with entry times to see your heat map.</div>
      ) : (
        <div>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 5, minWidth: 'max-content' }}>
              <thead>
                <tr>
                  <th style={{ width: 42 }} />
                  {hours.map((hour) => (
                    <th key={hour} scope="col" style={{ fontSize: 11, color: T.dim, fontWeight: 600, textAlign: 'center', paddingBottom: 5, minWidth: 50 }}>{fmt12(hour)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day}>
                    <th scope="row" style={{ fontSize: 11, color: T.text, fontWeight: 600, paddingRight: 7, textAlign: 'right', whiteSpace: 'nowrap' }}>{day}</th>
                    {hours.map((hour) => {
                      const cell = byHourDay[`${day}-${hour}`]
                      const total = cell?.total || 0
                      const winRate = total ? (cell.wins / total) * 100 : 0
                      const colors = heatColor(winRate, total)
                      const key = `${day}-${hour}`
                      const isActive = hovered === key
                      return (
                        <td key={hour} style={{ padding: 0 }}>
                          <div
                            tabIndex={total ? 0 : undefined}
                            aria-label={total ? `${day} at ${fmt12(hour)}: ${Math.round(winRate)} percent win rate across ${total} trades, ${fmt$(cell.pnl)}` : `${day} at ${fmt12(hour)}: no trades`}
                            onMouseEnter={() => setHovered(key)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(key)}
                            onBlur={() => setHovered(null)}
                            style={{
                              width: 50, height: 42, borderRadius: 6,
                              background: total >= 2 ? colors.bg : T.surface2,
                              border: `1px solid ${isActive ? T.accent : colors.border}`,
                              boxShadow: isActive ? `0 0 0 1px ${T.accent}` : colors.glow,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              transition: 'box-shadow .15s, border-color .15s',
                              position: 'relative'
                            }}
                          >
                            {total >= 2 ? (
                              <>
                                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, lineHeight: 1 }}>{Math.round(winRate)}%</span>
                                <span style={{ fontSize: 9, color: colors.text, opacity: 0.78, lineHeight: 1.3 }}>{total} trades</span>
                              </>
                            ) : total === 1 ? (
                              <><span style={{ fontSize: 10, color: T.dim, lineHeight: 1 }}>1 trade</span><span style={{ fontSize: 8, color: T.faint, lineHeight: 1.4 }}>LOW SAMPLE</span></>
                            ) : <span style={{ color: T.faint, fontSize: 11 }}>-</span>}
                            {isActive && total > 0 && (
                              <div role="tooltip" style={{
                                position: 'absolute', bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)',
                                background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 6,
                                padding: '6px 9px', zIndex: 10, whiteSpace: 'nowrap', fontSize: 11, color: T.text,
                                boxShadow: '0 8px 20px rgba(0,0,0,.28)', pointerEvents: 'none'
                              }}>
                                <div style={{ color: T.text, fontWeight: 600 }}>{Math.round(winRate)}% win rate</div>
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
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3 text-[10px]" style={{ color: T.faint }}>
            <span>Win rate:</span>
            {[
              ['#0f1f38', 'Under 38%'], ['#1e3a5f', '38-49%'], ['#b45309', '50-59%'],
              ['#c2410c', '60-69%'], ['#dc2626', '70-79%'], ['#ff4500', '80%+']
            ].map(([background, label]) => (
              <span key={label} className="flex items-center gap-1">
                <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background }} />
                {label}
              </span>
            ))}
            <span style={{ color: T.dim }}>Percentages require at least 2 trades.</span>
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ───────── dashboard ───────── */
export function Dashboard({ stats, trades, accounts = [], settings, journalData, onSaveSettings, onOpenCoach, payouts = [], plans = [], commitments = [], onAddCommitment, onUpdateCommitment, onDeleteCommitment, onOpenTrade }) {
  const [view, setView] = useState('all') // all | live | prop
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const hasProp = accounts.length > 0
  const propIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])
  const viewTrades = useMemo(() => {
    if (view === 'all' || !hasProp) return trades
    if (view === 'prop') return trades.filter((t) => propIds.has(t.account))
    return trades.filter((t) => !propIds.has(t.account)) // live
  }, [trades, view, propIds, hasProp])
  const viewPlans = useMemo(() => {
    if (view === 'all' || !hasProp) return plans
    if (view === 'prop') return plans.filter((plan) => propIds.has(plan.account))
    return plans.filter((plan) => !propIds.has(plan.account))
  }, [plans, view, propIds, hasProp])
  const viewCommitments = useMemo(() => {
    if (view === 'all' || !hasProp) return commitments
    const visibleTradeIds = new Set(viewTrades.map((trade) => String(trade.id)))
    return commitments.map((commitment) => {
      const results = (commitment.results || []).filter((result) => visibleTradeIds.has(String(result.tradeId)))
      const adheredCount = results.filter((result) => result.adhered).length
      return {
        ...commitment, results, globalEvaluatedCount: commitment.evaluatedCount,
        evaluatedCount: results.length, adheredCount,
        adherenceRate: results.length ? (adheredCount / results.length) * 100 : 0
      }
    })
  }, [commitments, viewTrades, view, hasProp])
  // Reuse the precomputed combined stats for "all"; only recompute for a filtered view.
  const vStats = useMemo(() => (view === 'all' || !hasProp ? stats : computeStats(viewTrades)), [view, hasProp, stats, viewTrades])
  const empty = vStats.n === 0
  const dailyQuote = quoteOfTheDay()

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-4 py-2.5 flex items-start gap-2.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <Quote size={14} style={{ color: T.accent, flexShrink: 0, marginTop: 3 }} />
        <div className="min-w-0 leading-snug">
          <span className="text-sm" style={{ color: T.dim }}>{dailyQuote.text}</span>
          <span className="text-xs ml-1.5 whitespace-nowrap" style={{ color: T.faint }}>— {dailyQuote.author}</span>
        </div>
      </div>
      <CoachBriefCard trades={viewTrades} stats={vStats} settings={settings} journalData={journalData} onSaveSettings={onSaveSettings} onOpenCoach={onOpenCoach} />
      <CoachCommitmentCard commitments={viewCommitments} trades={viewTrades} scopeLabel={view === 'prop' ? 'Prop view' : view === 'live' ? 'Live view' : ''} onAdd={onAddCommitment} onUpdate={onUpdateCommitment} onDelete={onDeleteCommitment} onOpenCoach={onOpenCoach} />
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
        <Stat label="Net P&L" value={fmt$(vStats.totalPnl)} tone={vStats.totalPnl >= 0 ? 'up' : 'down'} sub={vStats.totalFees > 0 ? `${vStats.n} trades · ${fmt$(vStats.totalFees)} fees paid` : `${vStats.n} trades`} spark={vStats.equity.map((e) => e.equity)} />
        <Stat label="Win rate" value={`${fmtN(vStats.winRate, 1)}%`} sub={`expectancy ${fmt$(vStats.expectancy)}/trade`} />
        <Stat label="Profit factor" value={vStats.profitFactor === Infinity ? '∞' : fmtN(vStats.profitFactor, 2)} tone="accent" sub="gross win ÷ gross loss" />
        <Stat label="Avg R:R" value={vStats.avgRR ? `1:${fmtN(vStats.avgRR, 1)}` : '—'} />
        <Stat label="Max drawdown" value={fmt$(-vStats.maxDD)} tone="down" />
        <Stat label="Avg winner" value={fmt$(vStats.avgWin)} tone="up" />
        <Stat label="Avg loser" value={fmt$(-vStats.avgLoss)} tone="down" />
        <Stat label="Streaks" value={String(vStats.currentStreak)} sub={`best ${vStats.bestWin}W · worst ${vStats.worstLoss}L`} />
      </div>

      <LeakFinder trades={viewTrades} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div>
          <div className="text-sm font-semibold">Session review</div>
          <div className="text-xs mt-0.5" style={{ color: T.faint }}>Select a calendar day to replay it, or compare two trade days side by side.</div>
        </div>
        <button type="button" onClick={() => setCompareOpen(true)} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold"
          style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>
          <GitCompareArrows size={15} /> Compare sessions
        </button>
      </div>
      <PnlCalendar trades={viewTrades} plans={viewPlans} dayLogs={journalData?.dayLogs || []} onSelectDay={setSelectedDay} />

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
      {compareOpen && (
        <SessionCompareModal
          trades={viewTrades}
          plans={viewPlans}
          onOpenTrade={(trade) => { setCompareOpen(false); onOpenTrade?.(trade) }}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {selectedDay && (
        <DayReplayModal
          date={selectedDay}
          trades={viewTrades}
          plans={viewPlans}
          dayLogs={journalData?.dayLogs || []}
          commitments={commitments}
          onOpenTrade={(trade) => { setSelectedDay(null); onOpenTrade?.(trade) }}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {shareOpen && (
        <ShareReportModal
          trades={viewTrades}
          payouts={payouts}
          dayLogs={journalData?.dayLogs || []}
          accountLabel={view === 'prop' ? 'Prop accounts' : view === 'live' ? 'Live accounts' : 'All accounts'}
          accent={T.accent}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

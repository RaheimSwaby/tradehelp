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

function fmtHour(hour) {
  const value = Number.parseInt(hour, 10)
  const normalized = ((value % 24) + 24) % 24
  return normalized === 0 ? '12am' : normalized < 12 ? `${normalized}am` : normalized === 12 ? '12pm' : `${normalized - 12}pm`
}

function TimingTooltip({ active, payload, kind }) {
  const row = active && payload?.[0]?.payload
  if (!row) return null
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, boxShadow: '0 8px 20px rgba(0,0,0,.28)' }}>
      <div className="font-semibold">{kind === 'hour' ? `${fmtHour(row.k)}–${fmtHour(Number(row.k) + 1)}` : row.day}</div>
      {kind === 'hour' ? (
        <>
          <div style={{ color: T.dim }}>{fmtN(row.wr, 0)}% raw win rate · {fmtN(row.wrAdjusted, 0)}% sample-adjusted</div>
          <div style={{ color: T.dim }}>{fmt$(row.expectancy)}/trade · {fmt$(row.pnl)} net</div>
        </>
      ) : (
        <>
          <div style={{ color: T.dim }}>{fmt$(row.pnl)} net · {fmt$(row.expectancy)}/trade</div>
          <div style={{ color: T.dim }}>{fmtN(row.wr, 0)}% win rate</div>
        </>
      )}
      <div className="mt-0.5" style={{ color: row.total >= 8 ? T.accent : T.faint }}>
        {row.total} trade{row.total === 1 ? '' : 's'} · {row.total >= 8 ? 'confirmed sample' : 'building sample'}
      </div>
    </div>
  )
}

function TimingPerformance({ stats }) {
  const {
    byHour = [], byWeekday = [], bestHour, worstHour, bestDay, worstDay,
    timingSample = 0, timingDays = 0, timingCoverage = 0, timingWinRate = 0, n = 0
  } = stats
  const summaries = [
    bestHour && { key: 'best-hour', Icon: Flame, label: 'Best confirmed hour', value: `${fmtHour(bestHour.k)}–${fmtHour(Number(bestHour.k) + 1)}`, stat: `${fmtN(bestHour.wr, 0)}% WR · ${fmt$(bestHour.expectancy)}/trade`, color: T.up, bg: withAlpha(T.up, 0.09), border: withAlpha(T.up, 0.28) },
    bestDay && { key: 'best-day', Icon: CalendarDays, label: 'Best confirmed day', value: bestDay.k, stat: `${fmt$(bestDay.pnl)} net · ${bestDay.total} trades`, color: T.up, bg: withAlpha(T.up, 0.07), border: withAlpha(T.up, 0.24) },
    worstHour && { key: 'worst-hour', Icon: Snowflake, label: 'Weakest confirmed hour', value: `${fmtHour(worstHour.k)}–${fmtHour(Number(worstHour.k) + 1)}`, stat: `${fmtN(worstHour.wr, 0)}% WR · ${fmt$(worstHour.expectancy)}/trade`, color: T.down, bg: withAlpha(T.down, 0.08), border: withAlpha(T.down, 0.26) },
    worstDay && { key: 'worst-day', Icon: TrendingDown, label: 'Weakest confirmed day', value: worstDay.k, stat: `${fmt$(worstDay.pnl)} net · ${worstDay.total} trades`, color: T.down, bg: withAlpha(T.down, 0.08), border: withAlpha(T.down, 0.24) }
  ].filter(Boolean)
  const coverage = n ? `${timingSample} of ${n} trades timed (${fmtN(timingCoverage, 0)}%) · ${timingDays} days` : 'No trades yet'

  return (
    <Panel title="Timing performance" right={<span className="text-[10px]" style={{ color: T.faint }}>{coverage}</span>}>
      {summaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
          {summaries.map(({ key, Icon, label, value, stat, color, bg, border }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg px-3 py-2 min-w-0" style={{ background: bg, border: `1px solid ${border}` }}>
              <Icon size={15} style={{ color, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="text-[10px] uppercase" style={{ color: T.faint }}>{label}</div>
                <div className="text-xs font-semibold truncate" style={{ color }}>{value}</div>
                <div className="text-[10px] truncate" style={{ color: T.dim }}>{stat}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!timingSample ? (
        <div className="py-8 text-center text-xs" style={{ color: T.faint }}>Add actual entry times to unlock trustworthy timing insights.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <div className="text-xs font-semibold mb-2">Sample-adjusted win rate by hour</div>
              <div role="img" aria-label="Bar chart of sample-adjusted win rate by trading hour">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byHour} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <ReferenceLine y={timingWinRate} stroke={T.faint} strokeDasharray="4 4" />
                    <XAxis dataKey="k" tick={{ fill: T.faint, fontSize: 10 }} tickFormatter={fmtHour} stroke={T.line} minTickGap={12} />
                    <YAxis domain={[0, 100]} tick={{ fill: T.faint, fontSize: 10 }} stroke={T.line} tickFormatter={(value) => `${value}%`} />
                    <Tooltip content={<TimingTooltip kind="hour" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="wrAdjusted" radius={[4, 4, 0, 0]} maxBarSize={30}>
                      {byHour.map((row) => <Cell key={row.k} fill={row.expectancy >= 0 ? T.up : T.down} fillOpacity={Math.max(0.24, row.confidence)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <div className="text-xs font-semibold mb-2">Net P&amp;L by weekday</div>
              <div role="img" aria-label="Bar chart of net profit and loss by weekday">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byWeekday} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <ReferenceLine y={0} stroke={T.faint} />
                    <XAxis dataKey="day" tick={{ fill: T.faint, fontSize: 10 }} stroke={T.line} />
                    <YAxis tick={{ fill: T.faint, fontSize: 10 }} stroke={T.line} tickFormatter={(value) => `$${value}`} />
                    <Tooltip content={<TimingTooltip kind="weekday" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={38}>
                      {byWeekday.map((row) => <Cell key={row.day} fill={row.pnl >= 0 ? T.up : T.down} fillOpacity={Math.max(0.24, row.confidence)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[10px]" style={{ color: T.faint }}>
            Bar opacity reflects confidence; full strength begins at 8 trades. Hour height uses a sample-adjusted win rate, while color shows whether that hour actually makes or loses money.
          </div>
        </>
      )}
    </Panel>
  )
}

/* ───────── dashboard ───────── */
export function Dashboard({ stats, trades, accounts = [], settings, journalData, onSaveSettings, onOpenCoach, payouts = [], plans = [], commitments = [], pnlFeedback = null, onAddCommitment, onUpdateCommitment, onDeleteCommitment, onOpenTrade }) {
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
        <Stat label="Net P&L" value={fmt$(vStats.totalPnl)} tone={vStats.totalPnl >= 0 ? 'up' : 'down'} sub={vStats.totalFees > 0 ? `${vStats.n} trades · ${fmt$(vStats.totalFees)} fees paid` : `${vStats.n} trades`} spark={vStats.equity.map((e) => e.equity)} feedback={view === 'all' ? pnlFeedback : null} />
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

      <TimingPerformance stats={vStats} />
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

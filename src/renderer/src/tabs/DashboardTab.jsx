import React, { useState, useMemo } from 'react'
import { Share2, GitCompareArrows, Flame, CalendarDays, Snowflake, TrendingDown, X } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts'
import { T, mono, withAlpha } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { computeStats, computeLeaks } from '../stats.js'
import { Stat, Panel, EmptyChart } from '../components/Shared.jsx'
import { PnlCalendar } from './JournalTab.jsx'
import { buildDataAwareGreeting } from '../quotes.js'
import { formatClockMinute } from '../sessionClock.js'
import { CoachBriefCard } from '../components/CoachBriefCard.jsx'
import { PreflightStatus } from '../components/PreflightStatus.jsx'
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
      <div className="th-dashboard-priority rounded-lg p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="th-dashboard-priority-kicker">Current focus</div>
        <div className="text-lg font-semibold mt-1" style={{ color: T.text }}>No behavioral leak is costing you right now.</div>
        <div className="text-sm mt-1" style={{ color: T.dim }}>Tagged trades are net positive. Keep following the same process.</div>
      </div>
    )
  }
  const worst = leak.worst
  const max = Math.abs(leak.leaks[0].pnl) || 1
  return (
    <section className="th-dashboard-priority rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="th-dashboard-priority-kicker">Current focus</div>
      <div className="mt-1.5 flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <h2 className="th-dashboard-priority-title">{worst.label}</h2>
          <div className="text-sm mt-1" style={{ color: T.dim }}>{worst.blurb}</div>
          <div className="text-xs mt-1" style={{ color: T.faint }}>{worst.n} tagged trade{worst.n === 1 ? '' : 's'}</div>
        </div>
        <div className="th-dashboard-priority-value" style={{ ...mono, color: T.down }}>{fmt$(worst.pnl)}</div>
      </div>
      {leak.leaks.length > 1 && (
        <div className="th-leak-ranking mt-4">
          {leak.leaks.slice(0, 4).map((c) => (
            <div key={c.id} className="th-leak-row">
              <div className="text-xs truncate" style={{ color: T.dim }}>{c.label}</div>
              <div className="h-1.5 rounded-full grow overflow-hidden" style={{ background: T.surface2 }}>
                <div className="h-full rounded-full" style={{ width: `${(Math.abs(c.pnl) / max) * 100}%`, background: T.down, transition: 'width .4s' }} />
              </div>
              <div className="text-xs text-right shrink-0" style={{ ...mono, color: T.down }}>{fmt$(c.pnl)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs mt-3" style={{ color: T.dim }}>
        {leak.totalLeaked < 0 && <>Tagged leaks total <strong style={{ color: T.down }}>{fmt$(leak.totalLeaked)}</strong>. </>}
        Use this as the first behavior to review, not as a verdict on the session.
      </div>
    </section>
  )
}

function TimeframePerformance({ stats }) {
  const groups = [
    ['Entry', stats.byEntryTimeframe],
    ['Analysis', stats.byAnalysisTimeframe],
    ['Management', stats.byManagementTimeframe]
  ]
  const hasData = groups.some(([, rows]) => rows?.some((row) => row.name !== '—'))
  if (!hasData) return null
  return (
    <Panel title="Performance by timeframe">
      <div className="th-timeframe-groups">
        {groups.map(([label, rows]) => (
          <section key={label} className="th-timeframe-group">
            <div className="th-timeframe-label" style={{ color: T.faint }}>{label}</div>
            <div>
              {(rows || []).filter((row) => row.name !== '—').slice(0, 5).map((row) => (
                <div key={row.name} className="th-timeframe-row" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <strong style={{ color: T.text }}>{row.name}</strong>
                  <span className="th-timeframe-sample" style={{ color: T.dim }}>{row.n} trades · {fmtN(row.wr, 0)}% win</span>
                  <span className="th-timeframe-pnl" style={{ ...mono, color: row.pnl >= 0 ? T.up : T.down }}>{fmt$(row.pnl)}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  )
}

function SymbolPerformance({ stats }) {
  const rows = (stats.bySymbol || []).filter((r) => r.name && r.name !== '—')
  if (!rows || rows.length === 0) return null

  // Sort by trade count descending, taking top 6 symbols
  const sortedSymbols = [...rows].sort((a, b) => b.n - a.n).slice(0, 6)

  return (
    <Panel title="Performance by symbol" right={<span className="text-[10px]" style={{ color: T.faint }}>{rows.length} traded symbol{rows.length === 1 ? '' : 's'}</span>}>
      <div className="th-symbol-ranking">
        {sortedSymbols.map((s) => (
          <div key={s.name} className="th-symbol-row" style={{ borderBottom: `1px solid ${T.line}` }}>
            <strong style={{ color: T.text, ...mono }}>{s.name}</strong>
            <span style={{ color: T.dim }}>{s.n} trade{s.n === 1 ? '' : 's'} · {fmtN(s.wr, 0)}% win</span>
            <span className="text-right" style={{ ...mono, color: s.pnl >= 0 ? T.up : T.down }}>{fmt$(s.pnl)}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function RiskConsistency({ stats }) {
  if (!stats.riskSample) return null
  return (
    <Panel title="Risk consistency" right={<span className="text-[10px]" style={{ color: T.faint }}>{stats.riskSample} trades with risk</span>}>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Average risk" value={fmt$(stats.avgRisk)} />
        <Stat label="Median risk" value={fmt$(stats.medianRisk)} tone="accent" />
        <Stat label="Inside band" value={`${stats.riskConsistentCount}/${stats.riskSample}`} sub={`${fmtN(stats.riskConsistency, 0)}% consistent`} />
        <Stat label="Avg points risk" value={stats.riskPointsSample ? fmtN(stats.avgRiskPoints, 2) : '—'} sub={stats.riskPointsSample ? `${stats.riskPointsSample} point-based trades` : 'No point-based trades'} />
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[10px] mb-1" style={{ color: T.faint }}>
          <span>Personal consistency band</span>
          <span>{fmt$(stats.riskBandLow)}–{fmt$(stats.riskBandHigh)} · ±20% of median</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, stats.riskConsistency)}%`, background: stats.riskConsistency >= 80 ? T.up : T.accent }} />
        </div>
      </div>
    </Panel>
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
      {row.rCount > 0 && <div style={{ color: T.accentText }}>Average realized R {row.avgR >= 0 ? '+' : ''}{fmtN(row.avgR, 2)}R · {row.rCount} risk-tagged</div>}
      <div className="mt-0.5" style={{ color: row.total >= 8 ? T.accentText : T.faint }}>
        {row.total} trade{row.total === 1 ? '' : 's'} · {row.total >= 8 ? 'confirmed sample' : 'building sample'}
      </div>
    </div>
  )
}

export function TimingPerformance({ stats, onDrilldown }) {
  const {
    byHour = [], byWeekday = [], bestHour, worstHour, bestDay, worstDay,
    timingSample = 0, timingRecordedSample = 0, timingDays = 0, timingCoverage = 0, timingWinRate = 0,
    timingHistoryStart, timingHistoryEnd, timingMinSample = 8, timingRMinSample = 4, n = 0
  } = stats
  const metric = (row, fallback) => row?.rCount >= timingRMinSample
    ? `${row.avgR >= 0 ? '+' : ''}${fmtN(row.avgR, 2)}R avg · ${row.rCount} risk-tagged`
    : fallback
  const summaries = [
    bestHour && { key: 'best-hour', Icon: Flame, label: 'Best confirmed hour', value: `${fmtHour(bestHour.k)}–${fmtHour(Number(bestHour.k) + 1)}`, stat: metric(bestHour, `${fmtN(bestHour.wr, 0)}% WR · ${fmt$(bestHour.expectancy)}/trade`), color: T.up, bg: withAlpha(T.up, 0.09), border: withAlpha(T.up, 0.28) },
    bestDay && { key: 'best-day', Icon: CalendarDays, label: 'Best confirmed day', value: bestDay.k, stat: metric(bestDay, `${fmt$(bestDay.pnl)} net · ${bestDay.total} trades`), color: T.up, bg: withAlpha(T.up, 0.07), border: withAlpha(T.up, 0.24) },
    worstHour && { key: 'worst-hour', Icon: Snowflake, label: 'Weakest confirmed hour', value: `${fmtHour(worstHour.k)}–${fmtHour(Number(worstHour.k) + 1)}`, stat: metric(worstHour, `${fmtN(worstHour.wr, 0)}% WR · ${fmt$(worstHour.expectancy)}/trade`), color: T.down, bg: withAlpha(T.down, 0.08), border: withAlpha(T.down, 0.26) },
    worstDay && { key: 'worst-day', Icon: TrendingDown, label: 'Weakest confirmed day', value: worstDay.k, stat: metric(worstDay, `${fmt$(worstDay.pnl)} net · ${worstDay.total} trades`), color: T.down, bg: withAlpha(T.down, 0.08), border: withAlpha(T.down, 0.24) }
  ].filter(Boolean)
  const recentRange = timingHistoryStart && timingHistoryEnd ? `${timingHistoryStart}–${timingHistoryEnd}` : 'recent history'
  const coverage = n ? `${timingSample} recent timed · ${timingRecordedSample} of ${n} recorded (${fmtN(timingCoverage, 0)}%) · ${timingDays} days` : 'No trades yet'
  const summaryLine = (row, kind) => `${kind === 'hour' ? `${fmtHour(row.k)}–${fmtHour(Number(row.k) + 1)}` : row.day}: ${row.total} trades, ${fmtN(row.wr, 0)}% wins, ${fmt$(row.expectancy)}/trade${row.rCount ? `, ${row.avgR >= 0 ? '+' : ''}${fmtN(row.avgR, 2)}R average` : ''}`

  return (
    <Panel className="th-chart-timing" title="Timing performance" right={<span className="text-[10px]" style={{ color: T.faint }}>{coverage}</span>}>
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

      {timingSample > 0 && summaries.length === 0 && (
        <div className="mb-4 rounded-lg px-3 py-2 text-xs" role="status" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>
          <strong style={{ color: T.accentText }}>Confidence building.</strong> Confirmed best/worst guidance appears after {timingMinSample} trades in a bucket. When at least {timingRMinSample} have recorded risk, signed realized R leads the ranking so one oversized winner cannot create a false edge.
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
                      {byHour.map((row) => <Cell key={row.k} fill={row.expectancy >= 0 ? T.up : T.down} fillOpacity={Math.max(0.24, row.confidence)} cursor="pointer" onClick={() => onDrilldown?.({ hour: row.k, count: row.total })} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 max-h-24 overflow-y-auto text-[10px]" aria-label="Accessible hourly timing summary" style={{ color: T.faint }}>
                {byHour.map((row) => (
                  <button key={row.k} type="button" onClick={() => onDrilldown?.({ hour: row.k, count: row.total })} className="block w-full text-left rounded px-1.5 py-1 hover:opacity-80" title="Open these trades in Journal">
                    {summaryLine(row, 'hour')}
                  </button>
                ))}
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
                      {byWeekday.map((row) => <Cell key={row.day} fill={row.pnl >= 0 ? T.up : T.down} fillOpacity={Math.max(0.24, row.confidence)} cursor="pointer" onClick={() => onDrilldown?.({ weekday: row.day, count: row.total })} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-[10px]" aria-label="Accessible weekday timing summary" style={{ color: T.faint }}>
                {byWeekday.map((row) => (
                  <button key={row.day} type="button" onClick={() => onDrilldown?.({ weekday: row.day, count: row.total })} className="block w-full text-left rounded px-1.5 py-1 hover:opacity-80" title="Open these trades in Journal">
                    {summaryLine(row, 'weekday')}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[10px]" style={{ color: T.faint }}>
            Recent window: {recentRange}. Select any bar or text summary to inspect its trades. Opacity reflects confidence; full strength begins at {timingMinSample} trades. R-backed buckets are ranked by signed realized R; other buckets fall back to sample-adjusted win rate and dollar expectancy.
          </div>
        </>
      )}
    </Panel>
  )
}

/* ───────── dashboard ───────── */
export function Dashboard({ stats, trades, accounts = [], settings, journalData, onSaveSettings, onOpenCoach, onOpenTradeMode, payouts = [], plans = [], commitments = [], rules = [], todayNet = 0, maxLoss = 0, live = false, pnlFeedback = null, onOpenTrade, onTimingDrilldown, onClearDemo, personalClock = null, personalSchedule = null, now = Date.now() }) {
  const [view, setView] = useState('all') // all | live | prop
  // Derived from the trades already in hand rather than a separate count, so
  // the banner can never disagree with what is actually on screen.
  const demoCount = useMemo(() => trades.filter((trade) => trade.source === 'demo').length, [trades])
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
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
  const currentDate = new Date(now)
  const greeting = buildDataAwareGreeting({ now: currentDate, personalClock, cleanStreak: vStats.nonTiltStreak, name: settings?.traderName })
  const inferredWindows = personalSchedule?.windows || []
  const windowSummary = inferredWindows.map((window) => `${formatClockMinute(window.start)}–${formatClockMinute(window.end)}`).join(' · ')
  const scheduleSessions = personalSchedule?.metadata?.historySessionCount || personalSchedule?.metadata?.sessionCount || 0
  const scheduleSource = personalSchedule?.source === 'manual' ? 'manually set' : `based on ${scheduleSessions} recent session${scheduleSessions === 1 ? '' : 's'}`
  function openTimingDrilldown(intent) {
    const accountIds = view === 'prop' ? [...propIds] : view === 'live' ? [''] : undefined
    const scopeLabel = view === 'prop' ? 'Prop accounts' : view === 'live' ? 'Live account' : ''
    onTimingDrilldown?.({ ...intent, accountIds, scopeLabel })
  }

  return (
    <div className="th-page th-page-dashboard space-y-4">
      {demoCount > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}` }}>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: T.accentText }}>Sample trades</div>
            <div className="text-xs mt-1" style={{ color: T.dim }}>
              These {demoCount} trades are examples so you can see how the dashboard, leak finder and coach look with a filled-in journal. They disappear the moment you log a real trade or import a CSV.
            </div>
          </div>
          <button
            type="button"
            onClick={onClearDemo}
            className="text-xs font-semibold px-3 py-2 rounded-md whitespace-nowrap"
            style={{ background: T.accent, color: '#1A1306' }}
          >Clear samples</button>
        </div>
      )}

      <div className="th-dashboard-preflight-grid">
        <PreflightStatus rules={rules} todayNet={todayNet} maxLoss={maxLoss} live={live} onBreak={settings?.onBreak === 'true'} onAction={onOpenTradeMode} />
        <div className="th-dashboard-greeting px-4 py-3">
          <div className="text-sm font-semibold" style={{ color: T.text }}>{greeting}</div>
          {windowSummary && <div className="text-xs mt-1" style={{ color: T.dim }}>Usual window <span style={{ ...mono, color: T.text }}>{windowSummary}</span> · {scheduleSource}</div>}
          {personalSchedule?.metadata?.confidence?.state === 'building' && <div className="text-xs mt-1" role="status" style={{ color: T.faint }}>{personalSchedule.metadata.confidence.message}</div>}
          {personalSchedule?.scheduleShift?.message && <div className="text-xs mt-1" role="status" style={{ color: T.accentText }}>{personalSchedule.scheduleShift.message}</div>}
        </div>
        <div className="th-dashboard-controls flex items-center justify-end gap-2 px-3">
          {hasProp && <div className="flex items-center gap-1">
            {[['all', 'All accounts'], ['live', 'Live'], ['prop', 'Prop']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setView(k)} className="text-xs px-2.5 py-1.5"
                style={{ color: view === k ? T.accentText : T.dim, borderBottom: `2px solid ${view === k ? T.accent : 'transparent'}` }}>{label}</button>
            ))}
          </div>}
          <button type="button" onClick={() => setShareOpen(true)} disabled={empty} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold"
            style={{ color: empty ? T.faint : T.text, border: `1px solid ${T.line}` }}><Share2 size={14} /> Share report</button>
        </div>
      </div>
      <LeakFinder trades={viewTrades} />
      <CoachBriefCard trades={viewTrades} stats={vStats} settings={settings} journalData={journalData} onSaveSettings={onSaveSettings} onOpenCoach={onOpenCoach} />
      <div className="th-dashboard-summary grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(vStats.totalPnl)} tone={vStats.totalPnl >= 0 ? 'up' : 'down'} sub={vStats.totalFees > 0 ? `${vStats.n} trades · ${fmt$(vStats.totalFees)} fees paid` : `${vStats.n} trades`} spark={vStats.equity.map((e) => e.equity)} feedback={view === 'all' ? pnlFeedback : null} />
        <Stat label="Win rate" value={`${fmtN(vStats.winRate, 1)}%`} sub={`expectancy ${fmt$(vStats.expectancy)}/trade`} />
        <Stat label="Profit factor" value={vStats.profitFactor === Infinity ? '∞' : fmtN(vStats.profitFactor, 2)} tone="accent" sub="gross win ÷ gross loss" />
        <Stat label="Avg R:R" value={vStats.avgRR ? `1:${fmtN(vStats.avgRR, 1)}` : '—'} />
        <Stat label="Max drawdown" value={fmt$(-vStats.maxDD)} tone="down" />
        <Stat label="Avg winner" value={fmt$(vStats.avgWin)} tone="up" />
        <Stat label="Avg loser" value={fmt$(-vStats.avgLoss)} tone="down" />
        <Stat label="Streaks" value={String(vStats.currentStreak)} sub={`best ${vStats.bestWin}W · worst ${vStats.worstLoss}L`} />
      </div>

      <div className="th-dashboard-insights">
        <RiskConsistency stats={vStats} />
        <SymbolPerformance stats={vStats} />
        <TimeframePerformance stats={vStats} />
      </div>

      <div className="th-session-review flex flex-wrap items-center gap-5 rounded-xl px-3 py-2.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div>
          <div className="text-sm font-semibold">Session review</div>
          <div className="text-xs mt-0.5" style={{ color: T.faint }}>Review sessions to reinforce habits and improve outcomes.</div>
        </div>
        <div className="th-session-review-metrics flex flex-1 items-center justify-around gap-4 text-xs">
          <span>Total sessions <strong>{vStats.daily?.length || 0}</strong></span>
          <span>Winning <strong style={{ color: T.up }}>{(vStats.daily || []).filter((day) => day.pnl > 0).length}</strong></span>
          <span>Losing <strong style={{ color: T.down }}>{(vStats.daily || []).filter((day) => day.pnl < 0).length}</strong></span>
          <span>Best <strong style={{ color: T.up }}>{fmt$(Math.max(0, ...(vStats.daily || []).map((day) => day.pnl)))}</strong></span>
          <span>Worst <strong style={{ color: T.down }}>{fmt$(Math.min(0, ...(vStats.daily || []).map((day) => day.pnl)))}</strong></span>
        </div>
        <button type="button" onClick={() => setCompareOpen(true)} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold"
          style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}>
          <GitCompareArrows size={15} /> Compare sessions
        </button>
        <button type="button" onClick={() => setCalendarOpen(true)} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold"
          style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}><CalendarDays size={15} /> P&amp;L calendar</button>
      </div>

      <div className="th-dashboard-charts">
      <Panel className="th-chart-equity" title="Equity curve">
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

      <Panel className="th-chart-daily" title="Daily P&L (last 14 active days)">
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

      <TimingPerformance stats={vStats} onDrilldown={openTimingDrilldown} />
      </div>
      {compareOpen && (
        <SessionCompareModal
          trades={viewTrades}
          plans={viewPlans}
          onOpenTrade={(trade) => { setCompareOpen(false); onOpenTrade?.(trade) }}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {calendarOpen && (
        <div className="th-overlay fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,.72)' }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarOpen(false) }}>
          <div className="w-full max-w-6xl max-h-[90vh] overflow-auto rounded-xl p-4" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
            <div className="flex items-center justify-between mb-3"><strong>P&amp;L calendar</strong><button type="button" onClick={() => setCalendarOpen(false)} style={{ color: T.dim }}><X size={18} /></button></div>
            <PnlCalendar trades={viewTrades} plans={viewPlans} dayLogs={journalData?.dayLogs || []} onSelectDay={(day) => { setCalendarOpen(false); setSelectedDay(day) }} />
          </div>
        </div>
      )}
      {selectedDay && (
        <DayReplayModal
          date={selectedDay}
          trades={viewTrades}
          plans={viewPlans}
          dayLogs={journalData?.dayLogs || []}
          commitments={viewCommitments}
          onOpenTrade={(trade) => { setSelectedDay(null); onOpenTrade?.(trade) }}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {shareOpen && (
        <ShareReportModal
          trades={viewTrades}
          payouts={payouts}
          dayLogs={journalData?.dayLogs || []}
          commitments={commitments}
          accountLabel={view === 'prop' ? 'Prop accounts' : view === 'live' ? 'Live accounts' : 'All accounts'}
          accent={T.accent}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

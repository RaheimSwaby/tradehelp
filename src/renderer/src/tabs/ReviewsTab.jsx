import React, { useState, useEffect, useMemo, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { CalendarRange, Sparkles, Trash2 } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, periodLabel, streamChat } from '../utils.js'
import { computeStats, letterFor, executionGrade, tradeContext } from '../stats.js'
import {
  buildPeriodRetrospective, parsePeriodRetrospective,
  reviewPeriodKeys, serializePeriodRetrospective, tradeDateKey, tradesInPeriod
} from '../periodRetrospective.js'
import { AnimatedValue, Stat, Panel } from '../components/Shared.jsx'
import { GroupTable, ReasonList } from './PsychologyTab.jsx'
import { coachVoiceInstruction, shouldIncludeWrittenJournal } from '../coachInsights.js'
import { buildWeeklyWrap } from '../weeklyWrap.js'

/* ───────── periodic reviews ───────── */
const REVIEW_SYSTEM = `You are a trading coach writing a short periodic review. Given the trader's aggregated stats and trades for ONE period, summarize how the period went using their real numbers, name 1-2 strengths and 1-2 leaks (revenge, FOMO, overtrading, cutting winners early, oversizing), then give 2 concrete focus points for next period. No price predictions or buy/sell advice. Under ~170 words.`

export function buildReviewSummaryPayload({ periodTrades, stats, periodLabel: label, settings = {} }) {
  const includeWritten = shouldIncludeWrittenJournal(settings)
  return {
    system: `${REVIEW_SYSTEM} ${coachVoiceInstruction(settings.coachVoice)}`,
    messages: [{ role: 'user', content: `Here is my ${label} performance:\n\n${tradeContext(periodTrades, stats, { includeWritten })}` }]
  }
}
const GRANS = [['week', 'Weekly'], ['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly'], ['all', 'All-time']]
const PROCESS_CHOICES = [
  ['hit', 'Process hit'],
  ['miss', 'Process miss'],
  ['not-assessed', 'Not assessed']
]

function outcomePresentation(status) {
  if (status === 'hit') return { label: 'Hit', color: T.up }
  if (status === 'miss') return { label: 'Miss', color: T.down }
  if (status === 'not-set') return { label: 'Not set', color: T.faint }
  return { label: 'Not assessed', color: T.accentText }
}

function RetrospectiveMetric({ label, value, sub, color = T.text }) {
  return (
    <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ ...mono, color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: T.dim }}>{sub}</div>}
    </div>
  )
}

function RecordMetric({ label, value, sub, tone }) {
  const color = tone === 'up' ? T.up : tone === 'down' ? T.down : tone === 'accent' ? T.accent : T.text
  return (
    <div className="th-reviews-record-metric min-w-0 px-3 py-2 first:pl-0 last:pr-0">
      <dt className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>{label}</dt>
      <dd className="mt-1 text-lg font-semibold" style={{ ...mono, color }}>
        <AnimatedValue value={value} animateOnMount />
      </dd>
      {sub && <dd className="text-xs mt-0.5" style={{ color: T.dim }}>{sub}</dd>}
    </div>
  )
}

export function Reviews({
  trades = [], ruleBreaks = [], reviews = {}, goals = {}, settings = {}, onSave, onDelete, onOpenWeeklyWrap, now = new Date()
}) {
  const [gran, setGran] = useState('week')
  const [sel, setSel] = useState('')
  const isAll = gran === 'all'
  const periods = useMemo(
    () => reviewPeriodKeys({ trades, reviews, granularity: gran, now }),
    [trades, reviews, gran, now]
  )
  const period = isAll ? 'all-time' : (periods.includes(sel) ? sel : (periods[0] || ''))
  const pLabel = isAll ? 'All-time' : periodLabel(period, gran)
  const periodTrades = useMemo(
    () => tradesInPeriod(trades, period, gran),
    [trades, period, gran]
  )
  const stats = useMemo(() => computeStats(periodTrades), [periodTrades])
  const sparseEquityDate = periodTrades.length ? tradeDateKey(periodTrades[0]) : ''
  const weeklyWrap = useMemo(
    () => gran === 'week' ? buildWeeklyWrap({ trades, ruleBreaks, weekKey: period }) : null,
    [gran, trades, ruleBreaks, period]
  )
  const avgGrade = periodTrades.length ? Math.round(periodTrades.reduce((a, t) => a + executionGrade(t).score, 0) / periodTrades.length) : 0
  const records = useMemo(() => {
    if (!periodTrades.length) return null
    const pnls = periodTrades.map((t) => Number(t.pnl) || 0)
    const day = {}
    for (const t of periodTrades) {
      const date = tradeDateKey(t)
      if (date) day[date] = (day[date] || 0) + (Number(t.pnl) || 0)
    }
    const days = Object.values(day)
    const fees = periodTrades.reduce((a, t) => a + (Number(t.fees) || 0), 0)
    return { bigWin: Math.max(...pnls), bigLoss: Math.min(...pnls), bestDay: Math.max(...days), worstDay: Math.min(...days), fees }
  }, [periodTrades])

  const persistedReview = useMemo(() => parsePeriodRetrospective(reviews?.[period]), [period, reviews])
  const [text, setText] = useState('')
  const [processStatus, setProcessStatus] = useState('not-assessed')
  const [commitmentEvidence, setCommitmentEvidence] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [ai, setAi] = useState(null)

  // Every period the user has actually written in, newest first. Keys carry their own
  // granularity (2026-08-03 week, 2026-08 month, 2026-Q3, 2026), so the list can jump
  // straight to a note without the reader knowing which view it was written in.
  const savedNotes = useMemo(() => {
    const granularityOf = (key) => {
      if (key === 'all-time') return 'all'
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return 'week'
      if (/^\d{4}-\d{2}$/.test(key)) return 'month'
      if (/^\d{4}-Q[1-4]$/.test(key)) return 'quarter'
      if (/^\d{4}$/.test(key)) return 'year'
      return ''
    }
    return Object.entries(reviews || {})
      .map(([key, raw]) => {
        const granularity = granularityOf(key)
        if (!granularity) return null
        const parsed = parsePeriodRetrospective(raw)
        const reflection = String(parsed.reflection || '').trim()
        if (!reflection) return null // an auto-built retrospective with no writing is not a note
        return {
          key,
          granularity,
          label: granularity === 'all' ? 'All-time' : periodLabel(key, granularity),
          pnl: Number.isFinite(Number(parsed.retrospective?.actualPnl)) ? Number(parsed.retrospective.actualPnl) : null,
          snippet: reflection.replace(/\s+/g, ' ').slice(0, 110)
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.key === 'all-time' ? 1 : b.key === 'all-time' ? -1 : b.key.localeCompare(a.key)))
  }, [reviews])

  function openSavedNote(note) {
    setGran(note.granularity)
    if (note.granularity !== 'all') setSel(note.key)
  }

  async function deleteSavedNote(note) {
    if (!window.confirm(`Delete your note for ${note.label}? The stats for that period are rebuilt from your trades, so only the writing is lost.`)) return
    await onDelete?.(note.key)
  }

  const loadedPeriodRef = useRef(null)
  useEffect(() => {
    const periodChanged = loadedPeriodRef.current !== period
    loadedPeriodRef.current = period
    setText(persistedReview.reflection)
    setProcessStatus(persistedReview.retrospective?.process?.status || 'not-assessed')
    setCommitmentEvidence(persistedReview.retrospective?.process?.evidence || null)
    // Only reset on an actual period change. Saving updates `reviews`, which re-runs
    // this effect — clearing here wiped the "Saved ✓" confirmation the instant it
    // appeared, so a successful save looked like nothing had happened.
    if (periodChanged) {
      setSaved(false)
      setSaveError('')
      setAi(null)
    }
  }, [period, persistedReview])
  useEffect(() => { setSaved(false); setSaveError('') }, [text, processStatus, commitmentEvidence])

  const retrospective = useMemo(() => buildPeriodRetrospective({
    selectedPeriod: period,
    granularity: gran,
    goals,
    trades,
    existing: persistedReview.retrospective,
    processStatus,
    commitmentEvidence,
    reflection: text
  }), [period, gran, goals, trades, persistedReview, processStatus, commitmentEvidence, text])
  const goalPresentation = outcomePresentation(retrospective.goalOutcome)

  async function save() {
    if (!period) return
    setSaveError('')
    try {
      await onSave?.(period, serializePeriodRetrospective(retrospective))
      setSaved(true)
    } catch (error) {
      setSaveError(String(error?.message || error || 'Review could not be saved.'))
    }
  }
  async function summarize() {
    if (!window.api?.aiChat || ai?.loading || !periodTrades.length) return
    setAi({ loading: true })
    try {
      let acc = ''
      await streamChat(buildReviewSummaryPayload({ periodTrades, stats, periodLabel: pLabel, settings }),
        (d) => { acc += d; setAi({ text: acc }) })
    } catch (e) { setAi({ error: String(e?.message || e) }) }
  }

  return (
    <div className="th-page th-page-reviews">
      <div className="th-reviews-toolbar flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold">Reviews</h2>
          <div className="text-xs" style={{ color: T.dim }}>Review performance against your goals</div>
        </div>
        <div className="flex gap-1">
          {GRANS.map(([g, label]) => (
            <button key={g} type="button" onClick={() => { setGran(g); setSel('') }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: gran === g ? T.surface2 : 'transparent', color: gran === g ? T.accentText : T.dim, border: `1px solid ${gran === g ? T.line : 'transparent'}` }}>{label}</button>
          ))}
        </div>
        {!isAll && (
          <select style={inputStyle} className="rounded px-2 py-1.5 text-sm" value={period} onChange={(e) => setSel(e.target.value)} disabled={!periods.length}>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p, gran)}</option>)}
          </select>
        )}
      </div>

      {weeklyWrap && (
        <div className="th-reviews-wrap">
        <Panel title="Weekly review" right={
          <button type="button" onClick={() => onOpenWeeklyWrap?.(period)} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}><CalendarRange size={13} /> Open review</button>
        }>
          <div className="flex items-center gap-2 text-xs" style={{ color: T.dim }}><span style={{ color: T.up }}>●</span> Ready to review · {pLabel}</div>
        </Panel>
        </div>
      )}

      <div className="th-reviews-retrospective">
      <Panel title={`Goals and process · ${pLabel}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RetrospectiveMetric label="Saved target" value={retrospective.targetSnapshot.amount == null ? 'Not set' : fmt$(retrospective.targetSnapshot.amount)} sub={retrospective.targetSnapshot.source ? retrospective.targetSnapshot.source.replace('goals.', '') : 'No target set for this period'} />
          <RetrospectiveMetric label="Actual P&L" value={fmt$(retrospective.actualPnl)} color={retrospective.actualPnl >= 0 ? T.up : T.down} sub={`${retrospective.tradeCount} ${retrospective.tradeCount === 1 ? 'trade' : 'trades'} · calculated from trades`} />
          <RetrospectiveMetric label="Goal result" value={goalPresentation.label} color={goalPresentation.color} sub={retrospective.tradeCount === 0 && retrospective.goalOutcome === 'not-assessed' ? 'No trades · abstained' : 'Compared with saved target'} />
        </div>
        <div className="mt-4">
          <div className="text-xs" style={{ color: T.dim }}>Process result</div>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PROCESS_CHOICES.map(([value, label]) => {
              const selected = processStatus === value
              const color = value === 'hit' ? T.up : value === 'miss' ? T.down : T.faint
              return <button key={value} type="button" aria-pressed={selected} onClick={() => setProcessStatus(value)} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ color: selected ? color : T.dim, background: selected ? T.surface2 : 'transparent', border: `1px solid ${selected ? color : T.line}` }}>{label}</button>
            })}
          </div>
        </div>
      </Panel>
      </div>

      <div className="th-reviews-summary grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} sub={`${stats.n} trades · ${stats.activeDays} days`} />
        <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`PF ${stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)}`} />
        <Stat label="Avg grade" value={periodTrades.length ? letterFor(avgGrade).letter : '—'} tone="accent" sub={periodTrades.length ? `${avgGrade}/100 execution` : 'No trades assessed'} />
        <Stat label="Expectancy" value={fmt$(stats.expectancy)} sub={`max DD ${fmt$(-stats.maxDD)}`} />
      </div>

      {records && (
        <div className="th-reviews-records">
        <Panel title={isAll ? 'Career records' : 'Records'}>
          <dl className="th-reviews-record-grid">
            <div className="th-reviews-record-row grid grid-cols-2 md:grid-cols-4">
              <RecordMetric label="Biggest win" value={fmt$(records.bigWin)} tone="up" />
              <RecordMetric label="Biggest loss" value={fmt$(records.bigLoss)} tone="down" />
              <RecordMetric label="Best day" value={fmt$(records.bestDay)} tone="up" />
              <RecordMetric label="Worst day" value={fmt$(records.worstDay)} tone="down" />
            </div>
            <div className="th-reviews-record-row grid grid-cols-2 md:grid-cols-4 mt-2 pt-2 border-t" style={{ borderColor: T.line }}>
              <RecordMetric label="Longest non-tilt" value={String(stats.bestNonTilt)} sub="best streak" tone="accent" />
              <RecordMetric label="Total fees" value={fmt$(records.fees)} sub="paid" />
              <RecordMetric label="Trades logged" value={String(stats.n)} sub={`${stats.activeDays} active days`} />
              <RecordMetric label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`${stats.activeDays ? fmtN(stats.n / stats.activeDays, 1) : 0}/day`} />
            </div>
          </dl>
        </Panel>
        </div>
      )}

      {stats.n > 0 && (
        <div className="th-reviews-equity">
        <Panel title={`Equity · ${pLabel}`}>
          {stats.equity.length < 2 ? (
            <div className="th-reviews-equity-sparse flex min-h-[180px] flex-col justify-center" role="status">
              <div className="text-sm font-semibold" style={{ color: T.text }}>One trading day—trend unavailable</div>
              <div className="mt-1 text-xs" style={{ color: T.dim }}>
                {sparseEquityDate || pLabel} · Closing equity {fmt$(stats.equity[0]?.equity ?? stats.totalPnl)}
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={stats.equity} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <ReferenceLine y={0} stroke={T.line} />
                <XAxis dataKey="i" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
                <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
                <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'Equity']} />
                <Line type="monotone" dataKey="equity" stroke={T.accent} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
        </div>
      )}

      {periodTrades.length > 0 && (
        <div className="th-reviews-breakdown grid grid-cols-1 md:grid-cols-2 gap-4">
          <GroupTable title="P&L by setup" rows={stats.bySetup} />
          <div className="space-y-4">
            <ReasonList title="Why you won" rows={stats.reasonsWin} tone="up" />
            <ReasonList title="Why you lost" rows={stats.reasonsLoss} tone="down" />
          </div>
        </div>
      )}

      <div className="th-reviews-reflection">
      <Panel title="Your reflection" right={
        <button type="button" onClick={summarize} disabled={ai?.loading || !periodTrades.length} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}`, opacity: periodTrades.length ? 1 : 0.5 }}><Sparkles size={13} /> {ai?.loading ? 'Thinking…' : 'AI summary'}</button>
      }>
        {ai && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: T.accentSoft, border: `1px solid ${T.line}`, color: '#F3D9A0' }}>
            {ai.loading ? <span style={{ color: T.accentText }}>Reviewing the period…</span> : ai.error ? <span style={{ color: T.down }}>⚠︎ {ai.error}</span> : <div className="whitespace-pre-wrap">{ai.text}</div>}
          </div>
        )}
        <div className="text-xs mb-1.5" style={{ color: T.faint }}>Your notes stay separate from calculated results and AI suggestions.</div>
        <textarea style={inputStyle} className="w-full rounded px-3 py-2 text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'What worked this period?\nWhat leaked?\nFocus for next period:'} />
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={save} disabled={!period} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: period ? 1 : 0.5 }}>Save review</button>
          {saved && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
          {saveError && <span className="text-xs" style={{ color: T.down }}>{saveError}</span>}
        </div>
      </Panel>
      </div>

      {/* Saved reviews were only reachable by guessing which period you wrote in.
          This lists everything actually written, newest first, so notes can be found
          without hunting through the period dropdown. */}
      <div className="th-reviews-saved">
      <Panel title={`Saved notes · ${savedNotes.length}`}>
        {savedNotes.length === 0 ? (
          <div className="text-sm py-2" style={{ color: T.dim }}>
            No saved notes yet. Save this review to add one.
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {savedNotes.map((note) => (
              <div key={note.key} className="flex items-stretch gap-1 rounded-lg"
                style={{ background: note.key === period ? T.accentSoft : T.surface2, border: `1px solid ${note.key === period ? T.accent : 'transparent'}` }}>
                <button type="button" onClick={() => openSavedNote(note)} className="flex-1 min-w-0 text-left px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: T.text }}>{note.label}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ color: T.dim, border: `1px solid ${T.line}` }}>{note.granularity}</span>
                    {note.pnl != null && (
                      <span className="ml-auto text-xs font-semibold" style={{ ...mono, color: note.pnl >= 0 ? T.up : T.down }}>{fmt$(note.pnl)}</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: T.dim }}>{note.snippet}</div>
                </button>
                <button type="button" onClick={() => deleteSavedNote(note)} title={`Delete note for ${note.label}`}
                  aria-label={`Delete note for ${note.label}`} className="px-2.5 shrink-0" style={{ color: T.down }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
      </div>
    </div>
  )
}

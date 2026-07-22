import React, { useState, useEffect, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { Sparkles, Target } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, periodLabel, streamChat } from '../utils.js'
import { computeStats, letterFor, executionGrade, tradeContext } from '../stats.js'
import {
  buildPeriodRetrospective, commitmentEvidenceSnapshot, parsePeriodRetrospective,
  reviewPeriodKeys, serializePeriodRetrospective, tradeDateKey, tradesInPeriod
} from '../periodRetrospective.js'
import { Stat, Panel, Field } from '../components/Shared.jsx'
import { GroupTable, ReasonList } from './PsychologyTab.jsx'
import { COMMITMENT_RULE_META } from '../components/CoachCommitmentCard.jsx'
import { reviewCommitmentSuggestion } from '../workflow.js'
import { coachVoiceInstruction, shouldIncludeWrittenJournal } from '../coachInsights.js'

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
  return { label: 'Not assessed', color: T.accent }
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

export function Reviews({
  trades = [], reviews = {}, goals = {}, commitments = [], settings = {}, onSave,
  activeCommitment, onAddCommitment, now = new Date()
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
  const [commitmentDraft, setCommitmentDraft] = useState(() => reviewCommitmentSuggestion(periodTrades))
  const [commitmentBusy, setCommitmentBusy] = useState(false)
  const [commitmentStarted, setCommitmentStarted] = useState(false)

  const evidenceOptions = useMemo(() => {
    const byId = new Map()
    for (const commitment of [...(Array.isArray(commitments) ? commitments : []), activeCommitment]) {
      if (commitment?.id && !byId.has(String(commitment.id))) byId.set(String(commitment.id), commitment)
    }
    return [...byId.values()]
  }, [commitments, activeCommitment])

  useEffect(() => {
    setText(persistedReview.reflection)
    setProcessStatus(persistedReview.retrospective?.process?.status || 'not-assessed')
    setCommitmentEvidence(persistedReview.retrospective?.process?.evidence || null)
    setSaved(false)
    setSaveError('')
    setAi(null)
  }, [period, persistedReview])
  useEffect(() => { setCommitmentDraft(reviewCommitmentSuggestion(periodTrades)); setCommitmentStarted(false) }, [period, periodTrades])
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

  function chooseCommitmentRule(ruleType) {
    const meta = COMMITMENT_RULE_META[ruleType]
    const ruleValue = meta.defaultValue
    setCommitmentDraft({ ruleType, ruleValue, title: meta.describe(ruleValue), targetCount: 10 })
  }
  function changeCommitmentValue(ruleValue) {
    const meta = COMMITMENT_RULE_META[commitmentDraft.ruleType]
    setCommitmentDraft((current) => ({ ...current, ruleValue, title: meta.describe(ruleValue) }))
  }
  async function startReviewCommitment() {
    if (activeCommitment && !window.confirm(`Replace the active commitment “${activeCommitment.title}”? It will be archived and this review focus will become active.`)) return
    setCommitmentBusy(true)
    try {
      const started = await onAddCommitment?.({ ...commitmentDraft, source: `review:${gran}:${period}` })
      if (started !== false) setCommitmentStarted(true)
    } finally {
      setCommitmentBusy(false)
    }
  }
  function selectEvidence(id) {
    if (!id) { setCommitmentEvidence(null); return }
    const commitment = evidenceOptions.find((item) => String(item.id) === id)
    setCommitmentEvidence(commitmentEvidenceSnapshot(commitment))
  }

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {GRANS.map(([g, label]) => (
            <button key={g} type="button" onClick={() => { setGran(g); setSel('') }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: gran === g ? T.surface2 : 'transparent', color: gran === g ? T.accent : T.dim, border: `1px solid ${gran === g ? T.line : 'transparent'}` }}>{label}</button>
          ))}
        </div>
        {!isAll && (
          <select style={inputStyle} className="rounded px-2 py-1.5 text-sm" value={period} onChange={(e) => setSel(e.target.value)} disabled={!periods.length}>
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p, gran)}</option>)}
          </select>
        )}
      </div>

      <Panel title={`Goal-anchored retrospective · ${pLabel}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RetrospectiveMetric label="Target snapshot" value={retrospective.targetSnapshot.amount == null ? 'Not set' : fmt$(retrospective.targetSnapshot.amount)} sub={retrospective.targetSnapshot.source ? retrospective.targetSnapshot.source.replace('goals.', '') : 'No goal for this period type'} />
          <RetrospectiveMetric label="Actual P&L" value={fmt$(retrospective.actualPnl)} color={retrospective.actualPnl >= 0 ? T.up : T.down} sub={`${retrospective.tradeCount} ${retrospective.tradeCount === 1 ? 'trade' : 'trades'} · automatic`} />
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
          <div className="mt-3 max-w-xl">
            <Field label="Commitment evidence (optional)">
              <select style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={commitmentEvidence?.id || ''} onChange={(event) => selectEvidence(event.target.value)}>
                <option value="">No linked commitment</option>
                {commitmentEvidence?.id && !evidenceOptions.some((item) => String(item.id) === commitmentEvidence.id) && <option value={commitmentEvidence.id}>{commitmentEvidence.title || 'Saved commitment'}</option>}
                {evidenceOptions.map((commitment) => <option key={commitment.id} value={commitment.id}>{commitment.title} · {commitment.evaluatedCount || 0} checks</option>)}
              </select>
            </Field>
            {commitmentEvidence && <div className="text-xs mt-1.5" style={{ color: T.faint }}>{commitmentEvidence.adheredCount}/{commitmentEvidence.evaluatedCount} checks followed · {fmtN(commitmentEvidence.adherenceRate, 0)}% adherence</div>}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} sub={`${stats.n} trades · ${stats.activeDays} days`} />
        <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`PF ${stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)}`} />
        <Stat label="Avg grade" value={periodTrades.length ? letterFor(avgGrade).letter : '—'} tone="accent" sub={periodTrades.length ? `${avgGrade}/100 execution` : 'No trades assessed'} />
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

      {periodTrades.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GroupTable title="P&L by setup" rows={stats.bySetup} />
            <div className="space-y-4">
              <ReasonList title="Why you won" rows={stats.reasonsWin} tone="up" />
              <ReasonList title="Why you lost" rows={stats.reasonsLoss} tone="down" />
            </div>
          </div>

          <Panel title="Next-period commitment" right={<Target size={15} style={{ color: T.accent }} />}>
            <p className="text-xs mb-3" style={{ color: T.faint }}>TradeHelp proposes a deterministic, measurable rule from this period. Adjust it before handing it to the coach tracker.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Rule">
                <select style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={commitmentDraft.ruleType} onChange={(event) => chooseCommitmentRule(event.target.value)}>
                  {Object.entries(COMMITMENT_RULE_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                </select>
              </Field>
              <Field label={COMMITMENT_RULE_META[commitmentDraft.ruleType]?.label || 'Value'}>
                {COMMITMENT_RULE_META[commitmentDraft.ruleType]?.input === 'none'
                  ? <div className="rounded px-2 py-1.5 text-sm" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>Required on every trade</div>
                  : <input type={COMMITMENT_RULE_META[commitmentDraft.ruleType]?.input || 'text'} min={COMMITMENT_RULE_META[commitmentDraft.ruleType]?.input === 'number' ? 1 : undefined} style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={commitmentDraft.ruleValue} onChange={(event) => changeCommitmentValue(event.target.value)} />}
              </Field>
              <Field label="Measure next trades"><input type="number" min="1" max="100" style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={commitmentDraft.targetCount} onChange={(event) => setCommitmentDraft((current) => ({ ...current, targetCount: Math.max(1, Math.min(100, Number(event.target.value) || 1)) }))} /></Field>
            </div>
            <div className="mt-3"><Field label="Commitment title"><input style={inputStyle} className="w-full rounded px-3 py-2 text-sm" value={commitmentDraft.title} onChange={(event) => setCommitmentDraft((current) => ({ ...current, title: event.target.value }))} /></Field></div>
            <div className="flex items-center gap-3 mt-3"><button type="button" onClick={startReviewCommitment} disabled={commitmentBusy || !commitmentDraft.ruleValue || !commitmentDraft.title.trim()} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: commitmentBusy || !commitmentDraft.title.trim() ? 0.5 : 1 }}>{commitmentBusy ? 'Starting…' : activeCommitment ? 'Replace active commitment' : 'Start commitment'}</button>{commitmentStarted && <span className="text-xs" style={{ color: T.up }}>Commitment started ✓</span>}</div>
          </Panel>
        </>
      )}

      <Panel title="Your reflection" right={
        <button type="button" onClick={summarize} disabled={ai?.loading || !periodTrades.length} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}`, opacity: periodTrades.length ? 1 : 0.5 }}><Sparkles size={13} /> {ai?.loading ? 'Thinking…' : 'AI summary'}</button>
      }>
        {ai && (
          <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: T.accentSoft, border: `1px solid ${T.line}`, color: '#F3D9A0' }}>
            {ai.loading ? <span style={{ color: T.accent }}>Reviewing the period…</span> : ai.error ? <span style={{ color: T.down }}>⚠︎ {ai.error}</span> : <div className="whitespace-pre-wrap">{ai.text}</div>}
          </div>
        )}
        <div className="text-xs mb-1.5" style={{ color: T.faint }}>Written by you; automatic outcomes and AI suggestions never replace this reflection.</div>
        <textarea style={inputStyle} className="w-full rounded px-3 py-2 text-sm" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'What worked this period?\nWhat leaked?\nFocus for next period:'} />
        <div className="flex items-center gap-3 mt-2">
          <button type="button" onClick={save} disabled={!period} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: period ? 1 : 0.5 }}>Save retrospective</button>
          {saved && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
          {saveError && <span className="text-xs" style={{ color: T.down }}>{saveError}</span>}
        </div>
      </Panel>
    </div>
  )
}

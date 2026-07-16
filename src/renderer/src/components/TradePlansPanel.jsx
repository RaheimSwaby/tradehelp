import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Pencil, Trash2, Lock, Link2, SkipForward, Ban, X,
  ImagePlus, ClipboardList, CheckCircle2
} from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { downscale, fileToDataUrl, fmt$, fmtN, nowLocalInput } from '../utils.js'
import { Field, Panel } from './Shared.jsx'
import { PlanComparison, PlanScreenshot } from './DayReplayModal.jsx'
import { calculatePlanSizing, playbookPlanPrefill, scorePlanExecutionV1, scoreTradePlanV1, selectInstrumentProfile } from '../workflow.js'

function toInputTime(value) {
  return String(value || '').replace(' ', 'T').slice(0, 16)
}

function canFollowPlanLock(trade, plan) {
  const lockedMs = Date.parse(String(plan.lockedAt || ''))
  if (!Number.isFinite(lockedMs)) return true
  const raw = String(trade.entryTime || trade.timestamp || '')
  const tradeMs = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  return Number.isFinite(tradeMs) && tradeMs >= Math.floor(lockedMs / 60000) * 60000
}

function statusColor(status) {
  if (status === 'executed') return T.up
  if (status === 'skipped') return T.accent
  if (status === 'canceled') return T.faint
  if (status === 'locked') return T.text
  return T.dim
}

function TradePlanModal({ plan, prefill, accounts, playbook, profiles, onClose, onSave }) {
  const initial = plan || prefill || {}
  const [form, setForm] = useState(() => ({
    symbol: initial.symbol || '', direction: initial.direction || 'Long', account: initial.account || '',
    setup: initial.setup || '', plannedEntry: initial.plannedEntry || '', plannedStop: initial.plannedStop || '',
    plannedTarget: initial.plannedTarget || '', riskAmount: initial.riskAmount || '', confidence: initial.confidence || 50,
    thesis: initial.thesis || '', invalidation: initial.invalidation || '', playbookEntryId: initial.playbookEntryId || '',
    plannedAt: toInputTime(initial.plannedAt) || nowLocalInput()
  }))
  const initialProfile = selectInstrumentProfile(profiles, initial.symbol)
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfile?.id || '')
  const [screenshot, setScreenshot] = useState('')
  const [removeScreenshot, setRemoveScreenshot] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const selectedProfile = selectInstrumentProfile(profiles, form.symbol, selectedProfileId)
  const sizing = useMemo(() => calculatePlanSizing(form, selectedProfile), [form, selectedProfile])
  const scorePreview = useMemo(() => scoreTradePlanV1({
    ...form,
    plannedQuantity: sizing.valid ? sizing.quantity : 0,
    sizingRiskPerUnit: sizing.valid ? sizing.riskPerUnit : 0
  }), [form, sizing])
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  function changeSymbol(event) {
    const symbol = event.target.value
    const matching = selectInstrumentProfile(profiles, symbol)
    setForm((current) => ({ ...current, symbol }))
    setSelectedProfileId(matching?.id || '')
  }
  function chooseProfile(event) {
    const id = event.target.value
    const profile = selectInstrumentProfile(profiles, '', id)
    setSelectedProfileId(id)
    if (profile && profile.symbol !== 'STOCK') setForm((current) => ({ ...current, symbol: profile.symbol }))
  }

  async function chooseScreenshot(file) {
    if (!file?.type?.startsWith('image/')) return
    setScreenshot(await downscale(await fileToDataUrl(file)))
    setRemoveScreenshot(false)
  }

  async function save() {
    if (!form.symbol.trim() || busy) return
    setBusy(true)
    try {
      const sizingFields = sizing.valid ? {
        plannedQuantity: sizing.quantity, sizingTickSize: sizing.tickSize, sizingTickValue: sizing.tickValue,
        sizingQuantityStep: sizing.quantityStep, sizingRiskPerUnit: sizing.riskPerUnit
      } : { plannedQuantity: 0, sizingTickSize: 0, sizingTickValue: 0, sizingQuantityStep: 0, sizingRiskPerUnit: 0 }
      const scored = scoreTradePlanV1({ ...form, ...sizingFields })
      await onSave({
        ...(plan || {}), ...form, ...sizingFields,
        scoreVersion: scored.version, planScore: scored.score, executionScore: plan?.executionScore || 0,
        scoreDetail: { ...(plan?.scoreDetail || {}), ...scored.detail },
        plannedAt: form.plannedAt ? form.plannedAt.replace('T', ' ') : '',
        screenshotDataUrl: screenshot || undefined,
        removeScreenshot: removeScreenshot || undefined,
        status: plan?.status || 'draft'
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="th-overlay fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList size={17} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">{plan ? 'Edit pre-trade plan' : 'New pre-trade plan'}</div>
            <div className="text-xs" style={{ color: T.faint }}>Save the intent now; lock it before execution so it cannot be rewritten later.</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }}><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Symbol *"><input autoFocus style={inputStyle} className={inp} value={form.symbol} onChange={changeSymbol} placeholder="ES, NQ, AAPL" /></Field>
          <Field label="Direction"><select style={inputStyle} className={inp} value={form.direction} onChange={set('direction')}><option>Long</option><option>Short</option></select></Field>
          <Field label="Planned date & time"><input type="datetime-local" style={inputStyle} className={inp} value={form.plannedAt} onChange={set('plannedAt')} /></Field>
          <Field label="Account">
            <select style={inputStyle} className={inp} value={form.account} onChange={set('account')}>
              <option value="">Live / personal</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label || 'Account'}</option>)}
            </select>
          </Field>
          <Field label="Setup">
            <input list="trade-plan-setups" style={inputStyle} className={inp} value={form.setup} onChange={set('setup')} placeholder="Opening range, pullback…" />
            <datalist id="trade-plan-setups">{playbook.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist>
          </Field>
          <Field label="Confidence %"><input type="number" min="0" max="100" style={inputStyle} className={inp} value={form.confidence} onChange={set('confidence')} /></Field>
          <Field label="Planned entry"><input style={inputStyle} className={inp} value={form.plannedEntry} onChange={set('plannedEntry')} inputMode="decimal" /></Field>
          <Field label="Planned stop"><input style={inputStyle} className={inp} value={form.plannedStop} onChange={set('plannedStop')} inputMode="decimal" /></Field>
          <Field label="Planned target"><input style={inputStyle} className={inp} value={form.plannedTarget} onChange={set('plannedTarget')} inputMode="decimal" /></Field>
          <Field label="Maximum risk $"><input style={inputStyle} className={inp} value={form.riskAmount} onChange={set('riskAmount')} inputMode="decimal" /></Field>
          <Field label="Instrument profile">
            <select style={inputStyle} className={inp} value={selectedProfileId} onChange={chooseProfile}>
              <option value="">No profile — sizing unavailable</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.symbol} · {profile.name || profile.assetClass}</option>)}
            </select>
          </Field>
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${sizing.valid ? T.line : T.down}`, color: sizing.valid ? T.dim : T.down }}>
            {sizing.valid ? <><span style={{ color: T.text, ...mono }}>{fmtN(sizing.quantity, 4)}</span> units · {fmt$(sizing.riskPerUnit)} risk/unit · {fmt$(sizing.riskUsed)} planned risk</> : sizing.error}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>
          <span>Deterministic plan quality · v{scorePreview.version}</span><strong style={{ ...mono, color: scorePreview.score >= 80 ? T.up : scorePreview.score >= 60 ? T.accent : T.down }}>{scorePreview.score}/100</strong>
        </div>
        <div className="mt-3"><Field label="Thesis"><textarea style={inputStyle} className={inp} rows={3} value={form.thesis} onChange={set('thesis')} placeholder="What must happen for this trade to make sense?" /></Field></div>
        <div className="mt-3"><Field label="Invalidation"><textarea style={inputStyle} className={inp} rows={2} value={form.invalidation} onChange={set('invalidation')} placeholder="What would prove the idea wrong before or during entry?" /></Field></div>

        <div className="mt-3">
          <Field label="Before-entry chart (optional)">
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg px-3 py-3 text-xs flex items-center justify-center gap-2"
              style={{ background: T.surface2, border: `1px dashed ${T.line}`, color: T.dim }}>
              <ImagePlus size={16} style={{ color: T.accent }} /> {screenshot ? 'Replace selected chart' : plan?.hasScreenshot && !removeScreenshot ? 'Replace saved chart' : 'Choose a chart screenshot'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { chooseScreenshot(event.target.files?.[0]); event.target.value = '' }} />
          </Field>
          {screenshot && <img src={screenshot} alt="Selected pre-trade chart" className="mt-2 w-full max-h-48 object-contain rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }} />}
          {plan?.hasScreenshot && !screenshot && (
            <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: T.faint }}>
              <CheckCircle2 size={13} style={{ color: T.up }} /> Saved chart attached
              <button type="button" onClick={() => setRemoveScreenshot((value) => !value)} style={{ color: removeScreenshot ? T.up : T.down }}>{removeScreenshot ? 'Keep it' : 'Remove it'}</button>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg py-2 text-sm" style={{ color: T.dim, border: `1px solid ${T.line}` }}>Cancel</button>
          <button type="button" onClick={save} disabled={!form.symbol.trim() || busy} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: form.symbol.trim() && !busy ? 1 : 0.5 }}>{busy ? 'Saving…' : 'Save draft'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function ScoreBreakdown({ detail }) {
  const checks = detail?.checks || {}
  const entries = Object.entries(checks).filter(([, check]) => Number(check.possible) > 0)
  if (!entries.length) return null
  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
      {entries.map(([key, check]) => (
        <div key={key} className="flex items-center justify-between gap-2" style={{ color: T.faint }}>
          <span>{check.label || key}</span>
          <span style={{ ...mono, color: Number(check.points) >= Number(check.possible) ? T.up : Number(check.points) > 0 ? T.accent : T.down }}>{fmtN(check.points, 0)}/{check.possible}</span>
        </div>
      ))}
      {detail?.note && <div className="sm:col-span-2 mt-1" style={{ color: T.faint }}>{detail.note}</div>}
    </div>
  )
}

function PlanCard({ plan, trades, usedTradeIds, onEdit, onUpdate, onDelete }) {
  const [linkId, setLinkId] = useState('')
  const actual = plan.linkedTradeId ? trades.find((trade) => String(trade.id) === String(plan.linkedTradeId)) : null
  const candidates = useMemo(() => trades
    .filter((trade) => !plan.symbol || String(trade.symbol).toUpperCase() === String(plan.symbol).toUpperCase())
    .filter((trade) => String(trade.account || '') === String(plan.account || ''))
    .filter((trade) => canFollowPlanLock(trade, plan))
    .filter((trade) => !usedTradeIds.has(String(trade.id)) || String(trade.id) === String(plan.linkedTradeId || ''))
    .slice().reverse().slice(0, 30), [trades, plan, usedTradeIds])
  const color = statusColor(plan.status)

  async function lockPlan() {
    if (!window.confirm('Lock this plan? Its original trade idea, sizing, levels, and score will no longer be editable.')) return
    const scored = scoreTradePlanV1(plan)
    await onUpdate({ ...plan, status: 'locked', scoreVersion: scored.version, planScore: scored.score, scoreDetail: { ...(plan.scoreDetail || {}), ...scored.detail } })
  }

  async function linkTrade() {
    const trade = candidates.find((candidate) => String(candidate.id) === String(linkId))
    if (!trade) return
    const scored = scorePlanExecutionV1(plan, trade)
    await onUpdate({
      ...plan, status: 'executed', linkedTradeId: linkId, executionScore: scored.score,
      scoreDetail: { ...(plan.scoreDetail || {}), ...scored.detail }
    })
  }

  return (
    <div className="rounded-xl p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{plan.symbol} · {plan.direction}</div>
          <div className="text-xs mt-0.5" style={{ ...mono, color: T.faint }}>{String(plan.plannedAt || '').replace('T', ' ')}{plan.setup ? ` · ${plan.setup}` : ''}</div>
        </div>
        <span className="ml-auto text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color, border: `1px solid ${color}` }}>{plan.status}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
        <div><span style={{ color: T.faint }}>Entry</span><div style={{ ...mono, color: T.text }}>{Number(plan.plannedEntry) ? fmtN(plan.plannedEntry, 2) : '—'}</div></div>
        <div><span style={{ color: T.faint }}>Stop</span><div style={{ ...mono, color: T.text }}>{Number(plan.plannedStop) ? fmtN(plan.plannedStop, 2) : '—'}</div></div>
        <div><span style={{ color: T.faint }}>Target</span><div style={{ ...mono, color: T.text }}>{Number(plan.plannedTarget) ? fmtN(plan.plannedTarget, 2) : '—'}</div></div>
        <div><span style={{ color: T.faint }}>Risk</span><div style={{ ...mono, color: T.text }}>{Number(plan.riskAmount) ? fmt$(plan.riskAmount) : '—'}</div></div>
      </div>
      {(Number(plan.plannedQuantity) > 0 || Number(plan.planScore) > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: T.faint }}>
          {Number(plan.plannedQuantity) > 0 && <span>Frozen size <strong style={{ ...mono, color: T.text }}>{fmtN(plan.plannedQuantity, 4)}</strong></span>}
          {Number(plan.sizingRiskPerUnit) > 0 && <span>Risk/unit <strong style={{ ...mono, color: T.text }}>{fmt$(plan.sizingRiskPerUnit)}</strong></span>}
          {Number(plan.sizingTickSize) > 0 && <span>Tick <strong style={{ ...mono, color: T.text }}>{fmtN(plan.sizingTickSize, 6)} / {fmt$(plan.sizingTickValue)}</strong></span>}
          {Number(plan.planScore) > 0 && <span>Plan score <strong style={{ ...mono, color: T.accent }}>{fmtN(plan.planScore, 0)}/100</strong></span>}
          {plan.status === 'executed' && <span>Execution <strong style={{ ...mono, color: Number(plan.executionScore) >= 80 ? T.up : T.accent }}>{fmtN(plan.executionScore, 0)}/100</strong></span>}
        </div>
      )}
      <ScoreBreakdown detail={plan.scoreDetail?.plan} />
      {plan.status === 'executed' && <ScoreBreakdown detail={plan.scoreDetail?.execution} />}
      {plan.thesis && <div className="text-xs mt-3" style={{ color: T.dim }}>{plan.thesis}</div>}
      <PlanScreenshot plan={plan} />

      {plan.status === 'draft' && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => onEdit(plan)} className="rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1" style={{ color: T.text, border: `1px solid ${T.line}` }}><Pencil size={12} /> Edit</button>
          <button type="button" onClick={lockPlan} className="rounded-md px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1" style={{ background: T.accent, color: '#1A1306' }}><Lock size={12} /> Lock plan</button>
          <button type="button" onClick={() => onDelete(plan.id)} className="rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1 ml-auto" style={{ color: T.down }}><Trash2 size={12} /> Delete</button>
        </div>
      )}

      {plan.status === 'locked' && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <select value={linkId} onChange={(event) => setLinkId(event.target.value)} style={inputStyle} className="min-w-0 flex-1 rounded px-2 py-1.5 text-xs">
              <option value="">Choose the actual trade…</option>
              {candidates.map((trade) => <option key={trade.id} value={trade.id}>{trade.timestamp} · {trade.symbol} · {fmt$(trade.pnl)}</option>)}
            </select>
            <button type="button" onClick={linkTrade} disabled={!linkId}
              className="rounded-md px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1" style={{ background: T.accent, color: '#1A1306', opacity: linkId ? 1 : 0.45 }}><Link2 size={12} /> Link</button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onUpdate({ ...plan, status: 'skipped' })} className="rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1" style={{ color: T.accent, border: `1px solid ${T.line}` }}><SkipForward size={12} /> Skipped</button>
            <button type="button" onClick={() => onUpdate({ ...plan, status: 'canceled' })} className="rounded-md px-2.5 py-1.5 text-xs flex items-center gap-1" style={{ color: T.faint, border: `1px solid ${T.line}` }}><Ban size={12} /> Canceled</button>
          </div>
        </div>
      )}

      {plan.status === 'executed' && actual && (
        <>
          <div className="mt-3 text-xs" style={{ color: actual.pnl >= 0 ? T.up : T.down }}>Linked result: {fmt$(actual.pnl)}</div>
          <PlanComparison plan={plan} trade={actual} />
        </>
      )}
    </div>
  )
}

export function TradePlansPanel({ plans = [], trades = [], accounts = [], playbook = [], profiles = [], prefill, onConsumePrefill, onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [pendingPrefill, setPendingPrefill] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  useEffect(() => {
    if (!prefill) return
    setPendingPrefill(playbookPlanPrefill(prefill))
    setCreating(true)
    onConsumePrefill?.()
  }, [prefill, onConsumePrefill])
  const usedTradeIds = useMemo(() => new Set(plans.filter((plan) => plan.linkedTradeId).map((plan) => String(plan.linkedTradeId))), [plans])
  const active = plans.filter((plan) => plan.status === 'draft' || plan.status === 'locked')
  const history = plans.filter((plan) => plan.status !== 'draft' && plan.status !== 'locked')

  return (
    <>
      <Panel title="Pre-trade plans" right={
        <button type="button" onClick={() => { setPendingPrefill(null); setCreating(true) }} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ background: T.accent, color: '#1A1306' }}><Plus size={13} /> Plan trade</button>
      }>
        <p className="text-xs mb-3" style={{ color: T.faint }}>Draft the idea, lock it before execution, then link the actual trade to compare intent with behavior.</p>
        {active.length === 0 ? <div className="text-sm py-3" style={{ color: T.dim }}>No open plans. Capture the idea before the trade starts.</div> : (
          <div className="space-y-3">{active.map((plan) => <PlanCard key={plan.id} plan={plan} trades={trades} usedTradeIds={usedTradeIds} onEdit={setEditing} onUpdate={onUpdate} onDelete={onDelete} />)}</div>
        )}
        {history.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowHistory((value) => !value)} className="text-xs" style={{ color: T.accent }}>{showHistory ? 'Hide completed plans' : `Show completed plans (${history.length})`}</button>
            {showHistory && <div className="space-y-3 mt-3">{history.slice(0, 12).map((plan) => <PlanCard key={plan.id} plan={plan} trades={trades} usedTradeIds={usedTradeIds} onEdit={setEditing} onUpdate={onUpdate} onDelete={onDelete} />)}</div>}
          </div>
        )}
      </Panel>
      {(creating || editing) && <TradePlanModal plan={editing} prefill={editing ? null : pendingPrefill} accounts={accounts} playbook={playbook} profiles={profiles} onClose={() => { setCreating(false); setEditing(null); setPendingPrefill(null) }} onSave={editing ? onUpdate : onAdd} />}
    </>
  )
}

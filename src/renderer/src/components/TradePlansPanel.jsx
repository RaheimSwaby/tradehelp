import React, { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus, Pencil, Trash2, Lock, Link2, SkipForward, Ban, X,
  ImagePlus, ClipboardList, CheckCircle2
} from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { downscale, fileToDataUrl, fmt$, fmtN, nowLocalInput } from '../utils.js'
import { Field, Panel } from './Shared.jsx'
import { PlanComparison, PlanScreenshot } from './DayReplayModal.jsx'

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

function TradePlanModal({ plan, accounts, playbook, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    symbol: plan?.symbol || '', direction: plan?.direction || 'Long', account: plan?.account || '',
    setup: plan?.setup || '', plannedEntry: plan?.plannedEntry || '', plannedStop: plan?.plannedStop || '',
    plannedTarget: plan?.plannedTarget || '', riskAmount: plan?.riskAmount || '', confidence: plan?.confidence || 50,
    thesis: plan?.thesis || '', invalidation: plan?.invalidation || '',
    plannedAt: toInputTime(plan?.plannedAt) || nowLocalInput()
  }))
  const [screenshot, setScreenshot] = useState('')
  const [removeScreenshot, setRemoveScreenshot] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function chooseScreenshot(file) {
    if (!file?.type?.startsWith('image/')) return
    setScreenshot(await downscale(await fileToDataUrl(file)))
    setRemoveScreenshot(false)
  }

  async function save() {
    if (!form.symbol.trim() || busy) return
    setBusy(true)
    try {
      await onSave({
        ...(plan || {}), ...form,
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
          <Field label="Symbol *"><input autoFocus style={inputStyle} className={inp} value={form.symbol} onChange={set('symbol')} placeholder="ES, NQ, AAPL" /></Field>
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
    if (!window.confirm('Lock this plan? Its original trade idea and levels will no longer be editable.')) return
    await onUpdate({ ...plan, status: 'locked' })
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
            <button type="button" onClick={() => linkId && onUpdate({ ...plan, status: 'executed', linkedTradeId: linkId })} disabled={!linkId}
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

export function TradePlansPanel({ plans = [], trades = [], accounts = [], playbook = [], onAdd, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const usedTradeIds = useMemo(() => new Set(plans.filter((plan) => plan.linkedTradeId).map((plan) => String(plan.linkedTradeId))), [plans])
  const active = plans.filter((plan) => plan.status === 'draft' || plan.status === 'locked')
  const history = plans.filter((plan) => plan.status !== 'draft' && plan.status !== 'locked')

  return (
    <>
      <Panel title="Pre-trade plans" right={
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ background: T.accent, color: '#1A1306' }}><Plus size={13} /> Plan trade</button>
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
      {(creating || editing) && <TradePlanModal plan={editing} accounts={accounts} playbook={playbook} onClose={() => { setCreating(false); setEditing(null) }} onSave={editing ? onUpdate : onAdd} />}
    </>
  )
}

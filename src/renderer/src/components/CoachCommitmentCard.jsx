import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Target, Plus, X, Archive, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { Panel, Field } from './Shared.jsx'

export const COMMITMENT_RULE_META = {
  max_trades_day: {
    label: 'Maximum trades per day', input: 'number', defaultValue: '2', placeholder: '2',
    describe: (value) => `No more than ${value || 2} trades in one day`,
    result: (value) => `Daily trade limit: ${value}`
  },
  max_risk: {
    label: 'Maximum risk per trade', input: 'number', defaultValue: '100', placeholder: '100',
    describe: (value) => `Risk no more than $${value || 100} per trade`,
    result: (value) => `Risk limit: $${value}`
  },
  latest_entry: {
    label: 'Latest allowed entry', input: 'time', defaultValue: '11:30', placeholder: '11:30',
    describe: (value) => `Do not enter after ${value || '11:30'}`,
    result: (value) => `Entry cutoff: ${value}`
  },
  setup_only: {
    label: 'Allowed setup only', input: 'text', defaultValue: '', placeholder: 'Pullback, Breakout',
    describe: (value) => value ? `Only take: ${value}` : 'Only take selected setups',
    result: (value) => `Allowed setups: ${value}`
  },
  min_rr: {
    label: 'Minimum reward:risk', input: 'number', defaultValue: '2', placeholder: '2',
    describe: (value) => `Only take trades with at least ${value || 2}:1 reward-to-risk`,
    result: (value) => `Minimum R:R: 1:${value}`
  },
  require_stop: {
    label: 'Stop-loss on every trade', input: 'none', defaultValue: 'required', placeholder: '',
    describe: () => 'Set a stop-loss before every entry',
    result: () => 'Stop-loss required on every trade'
  },
  max_daily_loss: {
    label: 'Daily loss limit', input: 'number', defaultValue: '300', placeholder: '300',
    describe: (value) => `Stop trading once the day is down $${value || 300}`,
    result: (value) => `Daily loss limit: $${value}`
  }
}

function CommitmentModal({ onClose, onSave }) {
  const [ruleType, setRuleType] = useState('max_trades_day')
  const [ruleValue, setRuleValue] = useState(COMMITMENT_RULE_META.max_trades_day.defaultValue)
  const [title, setTitle] = useState(COMMITMENT_RULE_META.max_trades_day.describe(COMMITMENT_RULE_META.max_trades_day.defaultValue))
  const [customTitle, setCustomTitle] = useState(false)
  const [targetCount, setTargetCount] = useState('10')
  const [busy, setBusy] = useState(false)
  const meta = COMMITMENT_RULE_META[ruleType]

  function chooseRule(nextType) {
    const next = COMMITMENT_RULE_META[nextType]
    setRuleType(nextType); setRuleValue(next.defaultValue); setCustomTitle(false); setTitle(next.describe(next.defaultValue))
  }
  function changeValue(value) {
    setRuleValue(value)
    if (!customTitle) setTitle(meta.describe(value))
  }
  async function save() {
    if (!title.trim() || !ruleValue.trim() || busy) return
    setBusy(true)
    try {
      await onSave({ title: title.trim(), ruleType, ruleValue: ruleValue.trim(), targetCount: parseInt(targetCount, 10) || 10, source: 'coach' })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="th-overlay fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-2">
          <Target size={18} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">Start a coach commitment</div>
            <div className="text-xs mt-0.5" style={{ color: T.faint }}>Choose one behavior to measure over your next trades. Starting a new focus archives the current one.</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }}><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          {Object.entries(COMMITMENT_RULE_META).map(([key, rule]) => (
            <button key={key} type="button" onClick={() => chooseRule(key)} className="rounded-lg p-3 text-left text-xs"
              style={{ background: ruleType === key ? T.accentSoft : T.surface2, color: ruleType === key ? T.accent : T.dim, border: `1px solid ${ruleType === key ? T.accent : T.line}` }}>
              <span className="font-semibold">{rule.label}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <Field label={meta.label}>
            {meta.input === 'none'
              ? <div className="text-sm rounded px-2 py-1.5" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>Applies to every trade — no value needed.</div>
              : <input type={meta.input} min={meta.input === 'number' ? 1 : undefined} style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={ruleValue} onChange={(event) => changeValue(event.target.value)} placeholder={meta.placeholder} />}
          </Field>
          <Field label="Measure over next trades">
            <input type="number" min="1" max="100" style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={targetCount} onChange={(event) => setTargetCount(event.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Commitment wording">
            <input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={title} onChange={(event) => { setCustomTitle(true); setTitle(event.target.value) }} />
          </Field>
        </div>

        <div className="rounded-lg p-3 mt-4 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>
          TradeHelp evaluates this from your recorded trades and always shows why a trade passed or missed. The focus measures process, not whether a trade won.
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg py-2 text-sm" style={{ border: `1px solid ${T.line}`, color: T.dim }}>Cancel</button>
          <button type="button" onClick={save} disabled={!title.trim() || !ruleValue.trim() || busy} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: title.trim() && ruleValue.trim() && !busy ? 1 : 0.5 }}>{busy ? 'Starting…' : 'Start commitment'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function CommitmentResults({ commitment, trades }) {
  const tradeById = useMemo(() => new Map(trades.map((trade) => [String(trade.id), trade])), [trades])
  const results = (commitment.results || []).slice().reverse().slice(0, 8)
  if (!results.length) return <div className="text-xs mt-3" style={{ color: T.faint }}>Your next qualifying trade starts the measurement.</div>
  return (
    <div className="space-y-1.5 mt-3">
      {results.map((result) => {
        const trade = tradeById.get(String(result.tradeId))
        return (
          <div key={result.tradeId} className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            {result.adhered ? <CheckCircle2 size={14} className="shrink-0" style={{ color: T.up }} /> : <XCircle size={14} className="shrink-0" style={{ color: T.down }} />}
            <div className="min-w-0 grow">
              <div className="font-semibold truncate">{trade ? `${trade.symbol} · ${trade.timestamp}` : result.day}</div>
              <div className="truncate" style={{ color: T.faint }}>{result.detail}</div>
            </div>
            {trade && <span className="shrink-0" style={{ ...mono, color: Number(trade.pnl) >= 0 ? T.up : T.down }}>{fmt$(trade.pnl)}</span>}
          </div>
        )
      })}
    </div>
  )
}

export function CommitmentFocus({ commitment }) {
  if (!commitment) return null
  const meta = COMMITMENT_RULE_META[commitment.ruleType]
  const progress = Math.min(100, (commitment.evaluatedCount / Math.max(1, commitment.targetCount)) * 100)
  return (
    <Panel title="Current coach focus">
      <div className="flex items-start gap-2">
        <Target size={16} style={{ color: T.accent }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{commitment.title}</div>
          <div className="text-xs mt-0.5" style={{ color: T.faint }}>{meta?.result(commitment.ruleValue) || commitment.ruleValue}</div>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${progress}%`, background: T.accent }} /></div>
      <div className="flex justify-between mt-1.5 text-xs" style={{ color: T.faint }}><span>{commitment.evaluatedCount}/{commitment.targetCount} trades</span><span>{commitment.evaluatedCount ? `${fmtN(commitment.adherenceRate, 0)}% followed` : 'Waiting for a trade'}</span></div>
    </Panel>
  )
}

export function CoachCommitmentCard({ commitments = [], trades = [], scopeLabel = '', onAdd, onUpdate, onDelete, onOpenCoach }) {
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const active = commitments.find((commitment) => commitment.status === 'active') || null
  const completed = commitments.find((commitment) => commitment.status === 'completed') || null
  const current = active || completed
  const history = commitments.filter((commitment) => commitment.id !== current?.id)
  const progressCount = current?.globalEvaluatedCount ?? current?.evaluatedCount ?? 0
  const progress = current ? Math.min(100, (progressCount / Math.max(1, current.targetCount)) * 100) : 0

  return (
    <>
      <Panel title="Coach commitment" right={
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md font-semibold" style={{ background: T.accent, color: '#1A1306' }}><Plus size={13} /> {current ? 'New focus' : 'Start focus'}</button>
      }>
        {!current ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="grow min-w-[220px]">
              <div className="text-sm">Turn coaching into one behavior you can measure.</div>
              <div className="text-xs mt-1" style={{ color: T.faint }}>Choose a trade limit, risk limit, time cutoff, or allowed setup for your next trades.</div>
            </div>
            <button type="button" onClick={onOpenCoach} className="rounded-md px-3 py-1.5 text-xs" style={{ border: `1px solid ${T.line}`, color: T.accent }}>Open AI Coach</button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Target size={18} style={{ color: current.status === 'completed' ? T.up : T.accent }} />
              <div className="grow min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{current.title}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ color: current.status === 'completed' ? T.up : T.accent, border: `1px solid ${current.status === 'completed' ? T.up : T.accent}` }}>{current.status}</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: T.faint }}>{COMMITMENT_RULE_META[current.ruleType]?.result(current.ruleValue) || current.ruleValue}</div>
              </div>
              {active && <button type="button" onClick={() => onUpdate({ ...active, status: 'archived' })} title="Archive focus" style={{ color: T.faint }}><Archive size={15} /></button>}
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mt-3" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${progress}%`, background: current.status === 'completed' ? T.up : T.accent, transition: 'width .3s' }} /></div>
            <div className="flex flex-wrap justify-between gap-2 mt-1.5 text-xs" style={{ color: T.faint }}>
              <span>{progressCount}/{current.targetCount} trades measured{scopeLabel ? ' overall' : ''}</span>
              <span>{current.evaluatedCount ? `${current.adheredCount}/${current.evaluatedCount} followed · ${fmtN(current.adherenceRate, 0)}%${scopeLabel ? ` · ${scopeLabel}` : ' adherence'}` : scopeLabel ? `No checks · ${scopeLabel}` : 'Waiting for the next trade'}</span>
            </div>
            <CommitmentResults commitment={current} trades={trades} />
          </>
        )}
        {history.length > 0 && (
          <div className="mt-3">
            <button type="button" onClick={() => setShowHistory((value) => !value)} className="text-xs" style={{ color: T.accent }}>{showHistory ? 'Hide commitment history' : `Show commitment history (${history.length})`}</button>
            {showHistory && (
              <div className="space-y-2 mt-2">
                {history.slice(0, 8).map((commitment) => (
                  <div key={commitment.id} className="rounded-lg px-3 py-2 flex items-start gap-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                    <div className="grow"><div className="font-semibold">{commitment.title}</div><div style={{ color: T.faint }}>{scopeLabel ? `${commitment.evaluatedCount} checks · ${fmtN(commitment.adherenceRate, 0)}% followed · ${scopeLabel}` : `${commitment.evaluatedCount}/${commitment.targetCount} measured · ${fmtN(commitment.adherenceRate, 0)}% followed`}</div></div>
                    <button type="button" onClick={() => window.confirm('Delete this commitment and its results?') && onDelete(commitment.id)} style={{ color: T.down }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>
      {creating && <CommitmentModal onClose={() => setCreating(false)} onSave={onAdd} />}
    </>
  )
}

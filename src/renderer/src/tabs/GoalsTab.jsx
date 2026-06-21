import React, { useState, useEffect } from 'react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$ } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'

/* ───────── goals ───────── */
export function Goals({ goals, onSave, trades }) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 864e5)
  const ym = now.toISOString().slice(0, 7)
  const weekPnl = trades.filter((t) => new Date((t.timestamp || '').replace(' ', 'T')) >= weekAgo).reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const monthPnl = trades.filter((t) => (t.timestamp || '').slice(0, 7) === ym).reduce((a, t) => a + (Number(t.pnl) || 0), 0)

  const [w, setW] = useState(String(goals.weekly))
  const [m, setM] = useState(String(goals.monthly))
  useEffect(() => { setW(String(goals.weekly)); setM(String(goals.monthly)) }, [goals])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="Targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly $"><input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Monthly $"><input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" /></Field>
        </div>
        <button type="button" onClick={() => onSave({ weekly: parseFloat(w) || 0, monthly: parseFloat(m) || 0 })} className="mt-3 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save targets</button>
      </Panel>
      <Panel title="Progress">
        <ProgressBar label="This week" cur={weekPnl} target={goals.weekly} />
        <div className="h-4" />
        <ProgressBar label="This month" cur={monthPnl} target={goals.monthly} />
      </Panel>
    </div>
  )
}
export function ProgressBar({ label, cur, target }) {
  const pct = target > 0 ? Math.min(Math.max((cur / target) * 100, 0), 100) : 0
  const hit = target > 0 && cur >= target
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ ...mono, color: hit ? T.up : T.text }}>{fmt$(cur)} / {fmt$(target)}{hit ? '  ✓' : ''}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hit ? T.up : T.accent, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

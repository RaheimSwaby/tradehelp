import React, { useState, useEffect } from 'react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, periodLabel } from '../utils.js'
import { currentPeriodKey, periodPerformance } from '../periodRetrospective.js'
import { Panel, Field } from '../components/Shared.jsx'

/* ───────── goals ───────── */
export function Goals({ goals = {}, onSave, trades = [], now = new Date() }) {
  const weekKey = currentPeriodKey('week', now)
  const monthKey = currentPeriodKey('month', now)
  const week = periodPerformance(trades, weekKey, 'week')
  const month = periodPerformance(trades, monthKey, 'month')

  const [w, setW] = useState(String(goals.weekly ?? 0))
  const [m, setM] = useState(String(goals.monthly ?? 0))
  useEffect(() => { setW(String(goals.weekly ?? 0)); setM(String(goals.monthly ?? 0)) }, [goals])

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
        <ProgressBar label={`This week · ${periodLabel(weekKey, 'week')}`} cur={week.actualPnl} target={goals.weekly} tradeCount={week.tradeCount} />
        <div className="h-4" />
        <ProgressBar label={`This month · ${periodLabel(monthKey, 'month')}`} cur={month.actualPnl} target={goals.monthly} tradeCount={month.tradeCount} />
      </Panel>
    </div>
  )
}
export function ProgressBar({ label, cur, target, tradeCount }) {
  const pct = target > 0 ? Math.min(Math.max((cur / target) * 100, 0), 100) : 0
  const hit = target > 0 && tradeCount > 0 && cur >= target
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ ...mono, color: hit ? T.up : T.text }}>{fmt$(cur)} / {fmt$(target)}{hit ? '  ✓' : ''}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hit ? T.up : T.accent, transition: 'width .4s' }} />
      </div>
      <div className="text-xs mt-1" style={{ color: T.faint }}>{tradeCount || 0} {tradeCount === 1 ? 'trade' : 'trades'} in this calendar period</div>
    </div>
  )
}

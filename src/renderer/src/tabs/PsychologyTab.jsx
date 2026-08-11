import React from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts'
import { T, mono } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { Panel } from '../components/Shared.jsx'

/* ───────── psychology ───────── */
export function Psychology({ stats }) {
  if (stats.n === 0) return <Panel title="Psychology"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Tag emotions and setups on your trades to see where your edge — and your leaks — come from.</div></Panel>
  return (
    <div className="th-page th-page-psychology grid grid-cols-1 md:grid-cols-2 gap-4">
      <GroupTable title="P&L by emotion" rows={stats.byEmotion} />
      <GroupTable title="P&L by setup" rows={stats.bySetup} />
      {/* One card each: stacked in a single column they left the whole right half of
          the page empty, and squeezed both lists into half the width they had.
          ReasonList carries its own surface, so no wrapper is needed here. */}
      <ReasonList title="Why you win" rows={stats.reasonsWin} tone="up" />
      <ReasonList title="Why you lose" rows={stats.reasonsLoss} tone="down" />
      <div className="th-psychology-hours md:col-span-2">
        <Panel title="P&L by hour of day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byHour} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="hour" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{stats.byHour.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? T.up : T.down} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  )
}
export function ReasonList({ title, rows, tone }) {
  const color = tone === 'up' ? T.up : T.down
  return (
    // The card treatment lives here rather than at each call site: Reviews rendered
    // these in a bare div, so they had no surface at all next to a GroupTable panel.
    <section className="th-reason-section" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <h2 className="text-base font-semibold">{title}</h2>
      {(!rows || rows.length === 0) ? (
        <div className="text-sm py-2" style={{ color: T.dim }}>Tag a reason when you log trades to see this build up.</div>
      ) : (
        <div className="mt-3">
          <div className="th-reason-head grid grid-cols-[28px_1fr_auto] text-xs" style={{ color: T.faint }}><span>#</span><span>Reason</span><span>Occurrences</span></div>
          {rows.map((r, index) => (
            <div key={r.name} className="th-reason-row grid grid-cols-[28px_1fr_auto] items-center text-sm" style={{ borderTop: `1px solid ${T.line}` }}>
              <span style={{ color: T.faint }}>{index + 1}</span><span style={{ color: T.text }}>{r.name}</span><span style={{ ...mono, color }}>{r.n}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
export function GroupTable({ title, rows }) {
  return (
    <Panel title={title}>
      <table className="w-full text-sm" style={mono}>
        <thead><tr style={{ color: T.faint }} className="text-xs uppercase">
          <th className="text-left font-normal py-1">Name</th>
          <th className="text-right font-normal py-1">n</th>
          <th className="text-right font-normal py-1">Win%</th>
          <th className="text-right font-normal py-1">P&L</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{ borderTop: `1px solid ${T.line}` }}>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right" style={{ color: T.dim }}>{r.n}</td>
              <td className="py-1.5 text-right" style={{ color: T.dim }}>{fmtN(r.wr, 0)}%</td>
              <td className="py-1.5 text-right font-semibold" style={{ color: r.pnl >= 0 ? T.up : T.down }}>{fmt$(r.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

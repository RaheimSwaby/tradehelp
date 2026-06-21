import React from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip, Cell } from 'recharts'
import { T, mono } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'
import { Stat, Panel, EmptyChart } from '../components/Shared.jsx'
import { PnlCalendar } from './JournalTab.jsx'

/* ───────── dashboard ───────── */
export function Dashboard({ stats, trades }) {
  const empty = stats.n === 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} sub={`${stats.n} trades`} />
        <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`expectancy ${fmt$(stats.expectancy)}/trade`} />
        <Stat label="Profit factor" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} tone="accent" sub="gross win ÷ gross loss" />
        <Stat label="Avg R:R" value={stats.avgRR ? `1:${fmtN(stats.avgRR, 1)}` : '—'} />
        <Stat label="Max drawdown" value={fmt$(-stats.maxDD)} tone="down" />
        <Stat label="Avg winner" value={fmt$(stats.avgWin)} tone="up" />
        <Stat label="Avg loser" value={fmt$(-stats.avgLoss)} tone="down" />
        <Stat label="Streaks" value={String(stats.currentStreak)} sub={`best ${stats.bestWin}W · worst ${stats.worstLoss}L`} />
      </div>

      <PnlCalendar trades={trades} />

      <Panel title="Equity curve">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={240}>
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

      <Panel title="Daily P&L (last 14 active days)">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.daily} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="day" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{stats.daily.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? T.up : T.down} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

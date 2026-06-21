import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts'
import { CheckSquare, Square } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, clamp, PROP_PRESETS } from '../utils.js'
import { computePropFirm } from '../stats.js'
import { Stat, Panel, Field } from '../components/Shared.jsx'

/* ───────── prop firm ───────── */
export function Meter({ pct, color, top, bottom }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ ...mono, color: T.text }}>{top}</div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
        <div className="h-full rounded-full" style={{ width: `${clamp(pct, 0, 1) * 100}%`, background: color, transition: 'width .4s' }} />
      </div>
      <div className="text-xs mt-1" style={{ color: T.faint }}>{bottom}</div>
    </div>
  )
}

export function PropFirmForm({ account, onSave, onCancel, canCancel }) {
  const editing = !!account
  const base = { label: '', accountSize: '50000', target: '3000', maxDailyLoss: '1100', maxDrawdown: '2000', minDays: '5', ddType: 'trailing', scope: 'shared', sizeScale: '1' }
  const [f, setF] = useState(() => editing
    ? { label: account.label || '', accountSize: String(account.accountSize ?? ''), target: String(account.target ?? ''), maxDailyLoss: String(account.maxDailyLoss ?? ''), maxDrawdown: String(account.maxDrawdown ?? ''), minDays: String(account.minDays ?? ''), ddType: account.ddType || 'trailing', scope: account.scope || 'shared', sizeScale: String(account.sizeScale ?? '1') }
    : base)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const preset = (n) => setF((p) => ({ ...p, label: p.label || `${n} account`, ...Object.fromEntries(Object.entries(PROP_PRESETS[n]).map(([k, v]) => [k, String(v)])) }))
  function save() {
    onSave({
      id: account?.id || ('a' + Date.now().toString(36)), enabled: true, label: f.label.trim() || 'Account',
      accountSize: parseFloat(f.accountSize) || 0, target: parseFloat(f.target) || 0,
      maxDailyLoss: parseFloat(f.maxDailyLoss) || 0, maxDrawdown: parseFloat(f.maxDrawdown) || 0,
      minDays: parseInt(f.minDays, 10) || 0, ddType: f.ddType, scope: f.scope, sizeScale: parseFloat(f.sizeScale) || 1
    })
  }
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <div className="max-w-xl">
      <Panel title={editing ? 'Edit account' : 'Add prop firm account'}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.keys(PROP_PRESETS).map((n) => <button key={n} type="button" onClick={() => preset(n)} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>{n} template</button>)}
        </div>
        <Field label="Label"><input style={inputStyle} className={inp} value={f.label} onChange={set('label')} placeholder="e.g. Topstep 50K #2" /></Field>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Account size $"><input style={inputStyle} className={inp} value={f.accountSize} onChange={set('accountSize')} inputMode="decimal" /></Field>
          <Field label="Profit target $"><input style={inputStyle} className={inp} value={f.target} onChange={set('target')} inputMode="decimal" /></Field>
          <Field label="Max daily loss $"><input style={inputStyle} className={inp} value={f.maxDailyLoss} onChange={set('maxDailyLoss')} inputMode="decimal" /></Field>
          <Field label="Max drawdown $"><input style={inputStyle} className={inp} value={f.maxDrawdown} onChange={set('maxDrawdown')} inputMode="decimal" /></Field>
          <Field label="Min trading days"><input style={inputStyle} className={inp} value={f.minDays} onChange={set('minDays')} inputMode="numeric" /></Field>
          <Field label="Drawdown type">
            <select style={inputStyle} className={inp} value={f.ddType} onChange={set('ddType')}><option value="trailing">Trailing (follows high)</option><option value="static">Static (fixed)</option></select>
          </Field>
          <Field label="Trades counted">
            <select style={inputStyle} className={inp} value={f.scope} onChange={set('scope')}><option value="shared">All my trades (copy-trade)</option><option value="own">Only trades I tag to this account</option></select>
          </Field>
          <Field label="P&L scale (size factor)"><input style={inputStyle} className={inp} value={f.sizeScale} onChange={set('sizeScale')} inputMode="decimal" /></Field>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={save} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>{editing ? 'Save account' : 'Start tracking'}</button>
          {canCancel && <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Cancel</button>}
        </div>
        <p className="text-xs mt-3" style={{ color: T.faint }}>Templates are rough starting points — match your firm's exact rules. "P&L scale" multiplies your logged P&L (use 0.5 if this account trades half the size). Tracks closed-trade balance; intraday swings aren't counted.</p>
      </Panel>
    </div>
  )
}

export function AccountCard({ acc, r, tight, onClick }) {
  const status = r.status === 'passed' ? { label: 'PASSED', color: T.up } : r.status === 'failed' ? { label: 'FAILED', color: T.down } : { label: 'ACTIVE', color: T.accent }
  const ddPct = r.maxDD > 0 ? r.ddBuffer / r.maxDD : 1
  const ddColor = r.floorBreached ? T.down : ddPct > 0.5 ? T.up : ddPct > 0.2 ? T.accent : T.down
  return (
    <button type="button" onClick={onClick} className="text-left rounded-xl p-4 w-full" style={{ background: T.surface, border: `1px solid ${tight ? T.down : T.line}` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{acc.label || 'Account'}</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: status.color, border: `1px solid ${status.color}` }}>{status.label}</span>
      </div>
      <div className="text-xs mt-0.5" style={{ color: T.faint }}>{fmt$(r.start)} · {acc.scope === 'own' ? 'tagged trades' : 'copy-trade'}{Number(acc.sizeScale) !== 1 ? ` · ${acc.sizeScale}×` : ''}</div>
      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div><div style={{ color: T.faint }}>Net P&L</div><div style={{ ...mono, color: r.netProfit >= 0 ? T.up : T.down }}>{fmt$(r.netProfit)} / {fmt$(r.target)}</div></div>
        <div><div style={{ color: T.faint }}>DD cushion</div><div style={{ ...mono, color: ddColor }}>{fmt$(r.ddBuffer)}</div></div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: T.surface2 }}><div className="h-full" style={{ width: `${clamp(ddPct, 0, 1) * 100}%`, background: ddColor }} /></div>
      {tight && <div className="text-xs mt-2" style={{ color: T.down }}>⚠ tightest account — your real limit today</div>}
    </button>
  )
}

export function PropFirmDetail({ trades, acc, onBack, onEdit, onDelete }) {
  const r = computePropFirm(trades, acc)
  const ddPct = r.maxDD > 0 ? r.ddBuffer / r.maxDD : 1
  const ddColor = r.floorBreached ? T.down : ddPct > 0.5 ? T.up : ddPct > 0.2 ? T.accent : T.down
  const tgtPct = r.target > 0 ? r.netProfit / r.target : 0
  const dailyPct = r.maxDaily > 0 ? r.dailyRemaining / r.maxDaily : 1
  const status = r.status === 'passed' ? { label: 'PASSED', color: T.up } : r.status === 'failed' ? { label: 'FAILED', color: T.down } : { label: 'IN PROGRESS', color: T.accent }
  const Req = ({ ok, label }) => (
    <div className="flex items-center gap-2 text-sm">{ok ? <CheckSquare size={16} style={{ color: T.up }} /> : <Square size={16} style={{ color: T.faint }} />}<span style={{ color: ok ? T.text : T.dim }}>{label}</span></div>
  )
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>← All accounts</button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onEdit} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>Edit</button>
          <button type="button" onClick={onDelete} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.down, border: `1px solid ${T.line}` }}>Delete</button>
        </div>
      </div>
      <Panel title={acc.label || 'Account'} right={<span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ color: status.color, border: `1px solid ${status.color}` }}>{status.label}</span>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Balance" value={fmt$(r.bal)} sub={`start ${fmt$(r.start)}`} />
          <Stat label="Net P&L" value={fmt$(r.netProfit)} tone={r.netProfit >= 0 ? 'up' : 'down'} sub={`target ${fmt$(r.target)}`} />
          <Stat label="DD cushion" value={fmt$(r.ddBuffer)} tone={r.floorBreached ? 'down' : 'none'} sub={`floor ${fmt$(r.curFloor)}`} />
          <Stat label="Days traded" value={`${r.daysTraded} / ${r.minDays}`} tone={r.daysHit ? 'up' : 'none'} />
        </div>
        <div className="text-xs mt-2" style={{ color: T.faint }}>{acc.scope === 'own' ? 'Tracking only trades tagged to this account' : 'Tracking all your trades (copy-trade)'}{Number(acc.sizeScale) !== 1 ? ` · P&L ×${acc.sizeScale}` : ''}</div>
        {r.breached && (
          <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: T.accentSoft, color: T.down, border: `1px solid ${T.down}` }}>
            ⚠︎ Rules breached in this history — {[r.floorBreached && 'max drawdown', r.dailyBreached && 'daily-loss limit'].filter(Boolean).join(' & ')} hit.
          </div>
        )}
      </Panel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel title="Drawdown cushion"><Meter pct={ddPct} color={ddColor} top={fmt$(r.ddBuffer) + ' to breach'} bottom={`floor ${fmt$(r.curFloor)} · limit ${fmt$(-r.maxDD)}`} /></Panel>
        <Panel title="Toward profit target"><Meter pct={tgtPct} color={r.targetHit ? T.up : T.accent} top={`${fmt$(r.netProfit)} / ${fmt$(r.target)}`} bottom={r.targetHit ? 'target reached ✓' : `${fmt$(Math.max(0, r.target - r.netProfit))} to go`} /></Panel>
        <Panel title="Today's loss room"><Meter pct={dailyPct} color={dailyPct > 0.4 ? T.up : dailyPct > 0.15 ? T.accent : T.down} top={`${fmt$(r.dailyRemaining)} left today`} bottom={`today ${fmt$(r.todayPnl)} · limit ${fmt$(-r.maxDaily)}`} /></Panel>
      </div>
      <Panel title="Pass requirements">
        <div className="space-y-2">
          <Req ok={r.targetHit} label={`Hit profit target (${fmt$(r.target)})`} />
          <Req ok={r.daysHit} label={`Trade at least ${r.minDays} day${r.minDays === 1 ? '' : 's'}`} />
          <Req ok={!r.breached} label="No daily-loss or drawdown breach" />
        </div>
      </Panel>
      {r.curve.length > 1 && (
        <Panel title="Balance vs. drawdown floor">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={r.curve} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={r.start} stroke={T.line} strokeDasharray="3 3" />
              <XAxis dataKey="i" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v, n) => [fmt$(v), n === 'balance' ? 'Balance' : 'Floor']} />
              <Line type="monotone" dataKey="floor" stroke={T.down} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              <Line type="monotone" dataKey="balance" stroke={T.accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  )
}

export function PropFirm({ trades, accounts, onSave }) {
  const [view, setView] = useState('overview')
  function upsert(acc) {
    const next = accounts.some((a) => a.id === acc.id) ? accounts.map((a) => (a.id === acc.id ? acc : a)) : [...accounts, acc]
    onSave(next); setView('overview')
  }
  function remove(id) { onSave(accounts.filter((a) => a.id !== id)); setView('overview') }

  if (view === 'add') return <PropFirmForm onSave={upsert} onCancel={() => setView('overview')} canCancel={accounts.length > 0} />
  if (view?.edit) { const a = accounts.find((x) => x.id === view.edit); if (a) return <PropFirmForm account={a} onSave={upsert} onCancel={() => setView('overview')} canCancel /> }
  if (view?.detail) { const a = accounts.find((x) => x.id === view.detail); if (a) return <PropFirmDetail trades={trades} acc={a} onBack={() => setView('overview')} onEdit={() => setView({ edit: a.id })} onDelete={() => remove(a.id)} /> }

  if (accounts.length === 0) {
    return <Panel title="Prop firm accounts"><div className="py-10 text-center"><div className="text-sm mb-3" style={{ color: T.dim }}>Track one or many prop firm challenges — targets, daily loss, trailing drawdown, pass/fail.</div><button type="button" onClick={() => setView('add')} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>+ Add an account</button></div></Panel>
  }
  const rows = accounts.map((a) => ({ acc: a, r: computePropFirm(trades, a) }))
  const passing = rows.filter((x) => x.r.status === 'passed').length
  const active = rows.filter((x) => x.r.status === 'active').length
  const failed = rows.filter((x) => x.r.status === 'failed').length
  const tight = rows.filter((x) => x.r.status === 'active' && x.r.maxDD > 0).sort((a, b) => a.r.ddBuffer - b.r.ddBuffer)[0]
  const chip = (val, label, color) => <span className="text-xs px-2 py-0.5 rounded" style={{ color, border: `1px solid ${T.line}` }}>{val} {label}</span>
  return (
    <div className="space-y-4">
      <Panel title={`Accounts · ${accounts.length}`} right={<button type="button" onClick={() => setView('add')} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>+ Add account</button>}>
        <div className="flex flex-wrap gap-2">{chip(passing, 'passing', T.up)}{chip(active, 'active', T.accent)}{chip(failed, 'failed', T.down)}</div>
        {tight && <div className="text-sm mt-3" style={{ color: T.dim }}>Tightest: <span style={{ color: T.text }}>{tight.acc.label}</span> — <span style={{ ...mono, color: T.down }}>{fmt$(tight.r.ddBuffer)}</span> before breach. That's your real limit today.</div>}
      </Panel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map(({ acc, r }) => <AccountCard key={acc.id} acc={acc} r={r} tight={tight?.acc.id === acc.id} onClick={() => setView({ detail: acc.id })} />)}
      </div>
    </div>
  )
}

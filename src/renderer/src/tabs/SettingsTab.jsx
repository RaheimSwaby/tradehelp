import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { T, mono, inputStyle, ACCENT_OPTIONS, THEME_PRESETS, GO_TIME_OPTIONS, PNL_STYLE_OPTIONS, FONT_OPTIONS } from '../theme.js'
import { CHECKOUT_URL, SITE_URL } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'
import { BACKDROP_OPTIONS } from '../components/Backdrop.jsx'
import { SOURCE_ZONE_OPTIONS } from '../utils/barImport.js'
import { RELEASE_NOTES } from '../releaseNotes.js'
import { BrokerSyncPanel } from '../widgets/BrokerSyncPanel.jsx'
import { MobileSyncPanel } from '../widgets/MobileSyncPanel.jsx'
import { MarketDataPanel } from '../widgets/MarketDataPanel.jsx'
import { Instagram, MessagesSquare, Plus, Pencil, Trash2, X, Globe } from 'lucide-react'

const COACH_VOICE_VALUES = new Set(['supportive', 'balanced', 'tough-love'])
const COACH_CONTEXT_MODES = new Set(['fast', 'balanced', 'deep'])
const PERSONAL_CLOCK_SOURCES = new Set(['auto', 'manual'])
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const SETTINGS_SECTIONS = [
  'License', 'Data & backup', 'Broker sync', 'Mobile sync', 'Instrument profiles',
  'Chart data', 'Market data connections', "What's new", 'Appearance 2.0', 'Coach & personal clock',
  'Model provider', 'Getting Ollama running', 'Market data & ticker',
  'Economic calendar & news', 'Feedback & support'
]

export function parsePersonalClockWindows(value) {
  let parsed
  try { parsed = Array.isArray(value) ? value : JSON.parse(String(value ?? '[]')) } catch { parsed = [] }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((window) => {
    if (!window || typeof window !== 'object') return []
    const start = String(window.start ?? '').trim()
    const end = String(window.end ?? '').trim()
    return CLOCK_TIME.test(start) && CLOCK_TIME.test(end) && start !== end ? [{ start, end }] : []
  })
}

export function serializePersonalClockWindows(windows) {
  return JSON.stringify(parsePersonalClockWindows(windows))
}

export function normalizeSettingsForDisplay(settings = {}) {
  const coachVoice = String(settings.coachVoice ?? '')
  const coachContextMode = String(settings.coachContextMode ?? '')
  const personalClockSource = String(settings.personalClockSource ?? '')
  const flag = (value) => value === 'false' || value === false ? 'false' : 'true'
  const optInFlag = (value) => value === 'true' || value === true ? 'true' : 'false'
  return {
    ...settings,
    traderName: String(settings.traderName ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    coachVoice: COACH_VOICE_VALUES.has(coachVoice) ? coachVoice : 'balanced',
    coachContextMode: COACH_CONTEXT_MODES.has(coachContextMode) ? coachContextMode : 'balanced',
    coachShowThinking: optInFlag(settings.coachShowThinking),
    personalClockSource: PERSONAL_CLOCK_SOURCES.has(personalClockSource) ? personalClockSource : 'auto',
    personalClockAlerts: flag(settings.personalClockAlerts),
    personalClockAmbience: flag(settings.personalClockAmbience),
    personalClockManualWindows: serializePersonalClockWindows(settings.personalClockManualWindows)
  }
}

/* ───────── license & trial ───────── */
export function TrialBanner({ days }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accentText }}>
        <span>Free trial — <strong>{days} day{days === 1 ? '' : 's'}</strong> left</span>
        <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="ml-auto px-2.5 py-0.5 rounded-md font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Get it — $50</button>
      </div>
    </div>
  )
}

export function Paywall({ onActivated }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  async function activate() {
    if (!key.trim() || busy) return
    setBusy(true); setErr(null)
    const res = await window.api.activateLicense(key.trim())
    setBusy(false)
    if (res?.ok) onActivated?.()
    else setErr(res?.error || 'Activation failed.')
  }
  return (
    <div className="py-12 flex justify-center">
      <div className="rounded-2xl p-8 max-w-md w-full text-center" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="text-lg font-semibold">Your free trial has ended</div>
        <p className="text-sm mt-2" style={{ color: T.dim }}>Unlock TradeHelp for a one-time <span style={{ color: T.text }}>$50</span> — no subscription, works offline, yours forever.</p>
        <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="w-full mt-5 rounded-md py-2.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Get TradeHelp — $50</button>
        <div className="text-xs my-4" style={{ color: T.faint }}>Already bought it? Paste your key:</div>
        <input style={inputStyle} className="w-full rounded px-3 py-2 text-sm" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && activate()} placeholder="license key" />
        <button type="button" onClick={activate} disabled={busy} className="w-full mt-2 rounded-md py-2 text-sm font-semibold" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>{busy ? 'Activating…' : 'Activate'}</button>
        {err && <div className="mt-3 text-xs" style={{ color: T.down }}>{err}</div>}
        <div className="mt-4 text-xs" style={{ color: T.faint }}>Your trades stay safe on your machine — nothing is deleted.</div>
      </div>
    </div>
  )
}

export function LicensePanel({ license, onChange }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const st = license?.state
  async function activate() {
    if (!key.trim() || busy) return
    setBusy(true); setMsg(null)
    const res = await window.api.activateLicense(key.trim())
    setBusy(false)
    if (res?.ok) { setMsg({ ok: 'Activated — thank you!' }); setKey(''); onChange?.() }
    else setMsg({ err: res?.error || 'Activation failed.' })
  }
  async function deactivate() { await window.api.deactivateLicense(); onChange?.() }
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <Panel title="License">
      <div className="text-sm mb-3">
        {st === 'active' ? <span style={{ color: T.up }}>● Licensed — full version unlocked.</span>
          : st === 'trial' ? <span style={{ color: T.accentText }}>● Free trial — {license.daysLeft} day{license.daysLeft === 1 ? '' : 's'} left.</span>
          : <span style={{ color: T.down }}>● Trial ended — enter a key to unlock.</span>}
      </div>
      {st === 'active' ? (
        <button type="button" onClick={deactivate} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Deactivate on this machine</button>
      ) : (
        <>
          <Field label="License key"><input style={inputStyle} className={inp} value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste your key" /></Field>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={activate} disabled={busy} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>{busy ? 'Activating…' : 'Activate'}</button>
            <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="rounded-md px-4 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Buy — $50</button>
          </div>
        </>
      )}
      {msg && <div className="mt-3 text-xs" style={{ color: msg.ok ? T.up : T.down }}>{msg.ok || msg.err}</div>}
    </Panel>
  )
}

export function DataPanel({ onReload }) {
  const [msg, setMsg] = useState(null)
  async function exp() {
    const r = await window.api.exportData()
    if (r?.ok) {
      const removed = Number(r.duplicateTradesRemoved) || 0
      setMsg(removed ? `Backup saved. ${removed} exact duplicate imported trade${removed === 1 ? '' : 's'} removed from the backup.` : 'Backup saved.')
    } else if (r?.error) setMsg('Export failed: ' + r.error)
  }
  async function imp() {
    if (!window.confirm('Import a backup file? Trades with matching IDs will be overwritten; exact duplicate imported trades will be skipped.')) return
    const r = await window.api.importData()
    if (r?.ok) {
      const ignored = Number(r.data?.restoreSummary?.duplicateTradesIgnored) || 0
      setMsg(ignored ? `Backup restored. ${ignored} exact duplicate imported trade${ignored === 1 ? '' : 's'} skipped.` : 'Backup restored.')
      onReload?.()
    } else if (r?.error) setMsg('Import failed: ' + r.error)
  }
  return (
    <Panel title="Data &amp; backup">
      <p className="text-sm mb-3" style={{ color: T.dim }}>Your journal lives in a file on this machine — back it up regularly.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exp} className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Export backup</button>
        <button type="button" onClick={imp} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Import / restore</button>
        <button type="button" onClick={() => window.api.openDataFolder()} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Open data folder</button>
      </div>
      {msg && <div className="mt-3 text-xs" style={{ color: T.dim }}>{msg}</div>}
      <p className="text-xs mt-2" style={{ color: T.faint }}>JSON exports include journal records and day logs but exclude screenshot and recording files, plus API keys. For a complete backup with all attachments, copy the entire data folder. A daily SQLite backup is also kept there.</p>
    </Panel>
  )
}

/**
 * Optional, for traders whose platform can export price history.
 *
 * TradeHelp buys no market data and redistributes none: this imports the
 * history the trader already pays their own platform for, stores it locally,
 * and uses it to draw real candles behind a trade with that trade's own entry,
 * stop and target on top. Without an import nothing changes anywhere.
 */
function PriceBarsPanel() {
  const [series, setSeries] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [sourceZone, setSourceZone] = useState('utc')

  const refresh = async () => {
    try {
      setSeries((await window.api.listPriceSeries()) || [])
    } catch {
      setSeries([])
    }
  }

  useEffect(() => { refresh() }, [])

  async function importFile() {
    if (busy) return
    setBusy(true); setMsg('')
    try {
      const r = await window.api.importPriceBars(sourceZone)
      if (r?.canceled) setMsg('')
      else if (!r?.ok) setMsg(r?.error || 'That file could not be imported.')
      else {
        const skipped = r.skipped ? `, ${r.skipped} row(s) skipped` : ''
        setMsg(`Imported ${r.barCount.toLocaleString()} bars for ${r.root}${skipped}.`)
        await refresh()
      }
    } catch (reason) {
      setMsg(reason?.message || 'That file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete the imported ${row.root} bars? Your trades are not affected.`)) return
    try { await window.api.deletePriceSeries(row.root); await refresh() } catch {}
  }

  // Platform exports cover whole sessions, but only the minutes around a trade
  // are ever drawn. Manual and never automatic: re-exporting is a chore in the
  // platform, so discarding history stays the trader's decision.
  async function trim(row) {
    const hours = 4
    const ok = window.confirm(
      `Keep only bars within ${hours} hours of one of your ${row.root} trades, and delete the rest?\n\n` +
      `This usually removes most of an export. Charts keep working for every trade you have, at every ` +
      `context window up to ±${hours}h; the ±1d window may show gaps.\n\n` +
      `This cannot be undone — you would need to export from your platform again.`
    )
    if (!ok) return
    setBusy(true); setMsg('')
    try {
      const r = await window.api.trimPriceBars(row.root, hours * 3600)
      if (!r?.ok) setMsg(r?.error || 'Those bars could not be trimmed.')
      else {
        setMsg(`Trimmed ${row.root}: kept ${r.after.toLocaleString()} of ${r.before.toLocaleString()} bars around ${r.windows} trade(s).`)
        await refresh()
      }
    } catch (reason) {
      setMsg(reason?.message || 'Those bars could not be trimmed.')
    } finally {
      setBusy(false)
    }
  }

  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—')

  return (
    <Panel title="Chart data (optional)" right={
      <button type="button" onClick={importFile} disabled={busy} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: busy ? 0.6 : 1 }}>
        <Plus size={13} /> {busy ? 'Importing…' : 'Import bars'}
      </button>
    }>
      <p className="text-sm mb-3" style={{ color: T.dim }}>
        TradeHelp stores no market data, so trade charts show your entry, exit, stop and target rather than
        price action. If your platform can export price history, import it here and those charts become real
        candles with your levels drawn on top. Everything stays on this machine and works offline afterwards.
      </p>
      <p className="text-xs mb-3" style={{ color: T.faint }}>
        NinjaTrader 8: Tools → Historical Data → Export, pick the instrument and a Minute period. Keep the
        contract in the file name (for example <span style={mono}>MES 09-26.Last.txt</span>) so the instrument
        can be identified.
      </p>
      <p className="text-xs mb-3" style={{ color: T.faint }}>
        TradingView, MetaTrader 4 and 5, Sierra Chart and most other platforms also work — any CSV or text
        export of date, open, high, low, close and volume. The bars do not have to come from the broker you
        traded with; they are just market data for that instrument.
      </p>

      {/* MetaTrader writes broker server time with nothing in the file to say
          so, which parses cleanly and lands every candle hours off. */}
      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: T.dim }}>Times in the file are</label>
        <select
          value={sourceZone}
          onChange={(e) => setSourceZone(e.target.value)}
          className="rounded px-2 py-1.5 text-xs"
          style={{ ...inputStyle, maxWidth: 320 }}
        >
          {SOURCE_ZONE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs mt-1" style={{ color: T.faint }}>
          Leave on UTC for NinjaTrader and TradingView. If candles land beside your entry marker rather than
          on it, the file used a different clock — re-import with the matching offset.
        </p>
      </div>

      {series.length === 0 ? (
        <div className="text-xs" style={{ color: T.faint }}>Nothing imported yet — trade charts show the execution map.</div>
      ) : (
        <div className="space-y-2">
          {series.map((row) => (
            <div key={row.root} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <div className="min-w-0">
                <div className="font-semibold" style={{ color: T.text }}>{row.label || row.root} <span style={{ color: T.faint }}>({row.root})</span></div>
                <div style={{ color: T.faint, ...mono }}>{Number(row.barCount).toLocaleString()} bars · {when(row.firstTs)} → {when(row.lastTs)}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => trim(row)}
                  disabled={busy}
                  title={`Keep only bars near your ${row.root} trades and reclaim the rest`}
                  className="rounded px-2 py-1 text-[11px] font-semibold"
                  style={{ background: T.surface, color: T.dim, border: `1px solid ${T.line}`, opacity: busy ? 0.6 : 1 }}
                >
                  Trim to trades
                </button>
                <button type="button" onClick={() => remove(row)} title="Delete these bars" style={{ color: T.down }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <div className="mt-3 text-xs" style={{ color: T.dim }}>{msg}</div>}
    </Panel>
  )
}

/** Newest first. Plain numeric compare per part, so 0.10.0 sorts above 0.9.0. */
function compareVersionsDesc(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pb[i] || 0) - (pa[i] || 0)
    if (d) return d
  }
  return 0
}

/**
 * Every release's notes, not just the newest.
 *
 * The "what's new" modal shows once and is gone, so anyone who dismissed it —
 * or who updated across several versions at once — had no way back to what
 * changed. The notes for every version are already bundled; this just makes
 * them reachable.
 */
function ReleaseNotesPanel() {
  const [expanded, setExpanded] = useState(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const versions = useMemo(() => Object.keys(RELEASE_NOTES).sort(compareVersionsDesc), [])

  useEffect(() => {
    let cancelled = false
    window.api?.appVersion?.()
      .then((v) => { if (!cancelled) setCurrentVersion(String(v || '')) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Open the running version by default — that is the one worth reading first.
  useEffect(() => {
    if (currentVersion && RELEASE_NOTES[currentVersion]) setExpanded(currentVersion)
  }, [currentVersion])

  return (
    <Panel title="What's new">
      <p className="text-sm mb-3" style={{ color: T.dim }}>
        Every release, newest first — worth a scroll if you updated across a few versions and want to
        see what you missed.
      </p>
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
        {versions.map((v) => {
          const isOpen = expanded === v
          const isCurrent = v === currentVersion
          return (
            <div key={v} className="rounded-md" style={{ background: T.surface2, border: `1px solid ${isCurrent ? T.accent : T.line}` }}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : v)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: T.text, ...mono }}>
                  v{v}
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: T.accentSoft, color: T.accentText }}>
                      you have this
                    </span>
                  )}
                </span>
                <span className="text-xs" style={{ color: T.faint }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 text-xs whitespace-pre-line" style={{ color: T.dim, lineHeight: 1.55 }}>
                  {String(RELEASE_NOTES[v] || '').trim()}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

const BLANK_PROFILE = { symbol: '', name: '', assetClass: 'Futures', tickSize: '', tickValue: '', quantityStep: '1' }

function InstrumentProfilesPanel({ profiles = [], onAdd, onUpdate, onDelete }) {
  // Filters are derived from the asset classes actually present rather than a fixed
  // list, so a chip never offers a category with nothing behind it, and any class a
  // trader invents on a custom profile gets one for free.
  const [assetFilter, setAssetFilter] = useState('All')
  const assetClasses = useMemo(() => {
    const counts = new Map()
    for (const p of profiles) {
      const key = String(p.assetClass || '').trim() || 'Other'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [profiles])
  const visible = useMemo(() => {
    const list = assetFilter === 'All'
      ? profiles
      : profiles.filter((p) => (String(p.assetClass || '').trim() || 'Other') === assetFilter)
    // Group by class, then symbol, so the list reads in a stable order either way.
    return [...list].sort((a, b) =>
      String(a.assetClass || '').localeCompare(String(b.assetClass || '')) ||
      String(a.symbol || '').localeCompare(String(b.symbol || '')))
  }, [profiles, assetFilter])

  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const set = (key) => (event) => setEditing((current) => ({ ...current, [key]: event.target.value }))

  async function save() {
    if (!editing || busy) return
    setBusy(true); setError('')
    try {
      const payload = {
        ...editing, symbol: editing.symbol.trim().toUpperCase(), name: editing.name.trim(), assetClass: editing.assetClass.trim(),
        tickSize: Number(editing.tickSize), tickValue: Number(editing.tickValue), quantityStep: Number(editing.quantityStep)
      }
      if (editing.id) await onUpdate(payload)
      else await onAdd(payload)
      setEditing(null)
    } catch (reason) {
      setError(reason?.message || 'Instrument profile could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(profile) {
    if (!window.confirm(`Delete the ${profile.symbol} instrument profile? Existing trades and frozen plans are not changed.`)) return
    setError('')
    try { await onDelete(profile.id) } catch (reason) { setError(reason?.message || 'Instrument profile could not be deleted.') }
  }

  return (
    <Panel title="Instrument profiles" right={
      <button type="button" onClick={() => { setError(''); setEditing({ ...BLANK_PROFILE }) }} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}><Plus size={13} /> Add profile</button>
    }>
      <p className="text-xs mb-3" style={{ color: T.faint }}>Tick economics drive plan sizing and multi-fill P&amp;L. Futures contracts match their root profile; a generic stock fallback is used only when explicitly selected.</p>
      {error && <div className="rounded-md px-3 py-2 mb-3 text-xs" style={{ color: T.down, border: `1px solid ${T.down}`, background: T.surface2 }}>{error}</div>}
      {assetClasses.length > 1 && (
        <div className="th-profile-filters flex flex-wrap gap-1.5 mb-3">
          {[['All', profiles.length], ...assetClasses].map(([label, count]) => {
            const on = assetFilter === label
            return (
              <button key={label} type="button" onClick={() => setAssetFilter(label)}
                className="rounded-md px-2.5 py-1 text-xs"
                style={{ background: on ? T.accentSoft : 'transparent', color: on ? T.accentText : T.dim, border: `1px solid ${on ? T.accent : T.line}` }}>
                {label} <span style={{ color: T.faint }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="space-y-1.5">
        {visible.map((profile) => (
          <div key={profile.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            <div className="min-w-0"><strong>{profile.symbol}</strong> · <span style={{ color: T.dim }}>{profile.name || profile.assetClass || 'Custom'}</span><div style={{ ...mono, color: T.faint }}>tick {profile.tickSize} = {fmtProfileMoney(profile.tickValue)} · step {profile.quantityStep}</div></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setError(''); setEditing({ ...profile, tickSize: String(profile.tickSize), tickValue: String(profile.tickValue), quantityStep: String(profile.quantityStep) }) }} title="Edit profile" style={{ color: T.dim }}><Pencil size={14} /></button>
              <button type="button" onClick={() => remove(profile)} title="Delete profile" style={{ color: T.down }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(4px)' }} onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center mb-4"><strong className="text-sm">{editing.id ? 'Edit instrument profile' : 'New instrument profile'}</strong><button type="button" onClick={() => setEditing(null)} className="ml-auto" style={{ color: T.faint }}><X size={17} /></button></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Symbol *"><input autoFocus style={inputStyle} className={inp} value={editing.symbol} onChange={set('symbol')} placeholder="AAPL" /></Field>
              <Field label="Name"><input style={inputStyle} className={inp} value={editing.name} onChange={set('name')} placeholder="Apple shares" /></Field>
              <Field label="Asset class"><input style={inputStyle} className={inp} value={editing.assetClass} onChange={set('assetClass')} placeholder="Stock, Futures, Crypto" /></Field>
              <Field label="Tick size *"><input style={inputStyle} className={inp} value={editing.tickSize} onChange={set('tickSize')} inputMode="decimal" /></Field>
              <Field label="Tick value *"><input style={inputStyle} className={inp} value={editing.tickValue} onChange={set('tickValue')} inputMode="decimal" /></Field>
              <Field label="Quantity step *"><input style={inputStyle} className={inp} value={editing.quantityStep} onChange={set('quantityStep')} inputMode="decimal" /></Field>
            </div>
            {error && <div className="mt-3 text-xs" style={{ color: T.down }}>{error}</div>}
            <div className="flex gap-2 mt-4"><button type="button" onClick={() => setEditing(null)} className="flex-1 rounded-lg py-2 text-sm" style={{ border: `1px solid ${T.line}`, color: T.dim }}>Cancel</button><button type="button" onClick={save} disabled={busy || !editing.symbol.trim()} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: busy || !editing.symbol.trim() ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save profile'}</button></div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function fmtProfileMoney(value) {
  const number = Number(value) || 0
  return `$${number.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
}

/* ───────── model picker: text field + browse button + clickable chips ───────── */
function ModelSelect({ value, onChange, placeholder }) {
  const [models, setModels] = useState(null) // null = not yet fetched
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const browse = useCallback(async () => {
    setLoading(true); setErr(null)
    const res = await window.api.aiModels().catch(() => ({ ok: false, error: 'Cannot reach the model provider' }))
    setLoading(false)
    if (res.ok) setModels(res.models || [])
    else { setModels([]); setErr(res.error) }
  }, [])

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input style={inputStyle} className="flex-1 rounded px-2 py-1.5 text-sm"
          value={value} onChange={onChange} placeholder={placeholder} />
        <button type="button" onClick={browse} disabled={loading}
          className="rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
          style={{ background: T.surface2, border: `1px solid ${T.line}`, color: loading ? T.faint : T.accentText }}>
          {loading ? 'Loading…' : 'Browse'}
        </button>
      </div>
      {err && <div className="text-xs" style={{ color: T.down }}>{err} — is Ollama running?</div>}
      {models !== null && !err && (
        models.length === 0
          ? <div className="text-xs" style={{ color: T.faint }}>No models found. Run: <span style={{ ...mono, color: T.accentText }}>ollama pull llama3.2</span></div>
          : <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <button key={m} type="button" onClick={() => onChange({ target: { value: m } })}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: value === m ? T.accentSoft : T.surface2,
                    color: value === m ? T.accentText : T.dim,
                    border: `1px solid ${value === m ? T.accent : T.line}`
                  }}>
                  {m}
                </button>
              ))}
            </div>
      )}
    </div>
  )
}

/* ───────── api-key validity check ───────── */
function TestKey({ type, value, url }) {
  const [r, setR] = useState(null) // null | { loading } | { ok, msg }
  useEffect(() => { setR(null) }, [value])
  async function run() {
    if (r?.loading) return
    setR({ loading: true })
    const res = await window.api.testKey({ type, key: value, url }).catch(() => null)
    setR(res || { ok: false, msg: '✗ Test failed.' })
  }
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button type="button" onClick={run} disabled={r?.loading} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}>{r?.loading ? 'Testing…' : 'Test key'}</button>
      {r && !r.loading && <span className="text-xs" style={{ color: r.ok ? T.up : T.down }}>{r.msg}</span>}
    </div>
  )
}

/* ───────── settings ───────── */
function PillButton({ active, children, onClick, title }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-md font-semibold"
      style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accentText : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
      {children}
    </button>
  )
}

function ThemePreview({ preset, active, onClick }) {
  const p = preset.palette
  return (
    <button type="button" onClick={onClick}
      className="text-left rounded-lg p-3 th-card"
      style={{ background: p.surface, border: `1px solid ${active ? p.accent : p.line}`, color: p.text }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold truncate">{preset.name}</div>
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.accent }} />
      </div>
      <div className="mt-3 rounded-md p-2" style={{ background: p.surface2, border: `1px solid ${p.line}` }}>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-8 rounded-full" style={{ background: p.accent }} />
          <span className="h-1.5 w-5 rounded-full" style={{ background: p.line }} />
          <span className="h-1.5 w-6 rounded-full ml-auto" style={{ background: p.up }} />
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <span className="h-5 rounded" style={{ background: p.bg, border: `1px solid ${p.line}` }} />
          <span className="h-5 rounded" style={{ background: p.up, opacity: 0.7 }} />
          <span className="h-5 rounded" style={{ background: p.down, opacity: 0.7 }} />
        </div>
      </div>
    </button>
  )
}

function AppearanceLivePreview({ settings }) {
  // Mixed symbols and directions so the sample exercises both P&L colours and reads
  // like a journal rather than one instrument copied five times.
  const rows = [
    ['2026-07-30 11:10', 'MES', 'Long', '-$75.00', 'C', '1:1.0', '3m', 'Double bottom'],
    ['2026-07-29 14:20', 'EURUSD', 'Short', '$128.40', 'A', '1:2.0', '20m', 'Liquidity sweep'],
    ['2026-07-28 09:50', 'NQ', 'Long', '$100.00', 'A', '1:1.2', '1h 3m', 'Wick'],
    ['2026-07-27 09:50', 'MES', 'Short', '-$37.50', 'C', '—', '5m', 'Neutral'],
    ['2026-07-24 10:15', 'BTC', 'Long', '$46.25', 'B', '1:1.5', '5m', 'Break + retest']
  ]
  const backdrop = !settings.backdrop || settings.backdrop === 'on' ? 'constellation' : settings.backdrop
  return (
    <Panel title="Live preview" className="th-settings-preview-panel" right={<span className="text-xs" style={{ color: T.faint }}>Current settings</span>}>
      {/* The backdrop is a full-screen animated canvas and isn't reproduced in here,
          so this no longer claims to preview it. */}
      <p className="text-xs mb-3" style={{ color: T.dim }}>A compact journal preview using the active palette and number style.</p>
      <div className="th-settings-preview-surface" data-backdrop={backdrop}>
        <div className="th-preview-window">
          <div className="th-preview-toolbar flex gap-2"><button type="button" tabIndex={-1}>Simple journal</button><button type="button" tabIndex={-1}>No-trade day</button><button type="button" tabIndex={-1}>Undo delete</button><button type="button" tabIndex={-1}>Import CSV</button></div>
          <div className="th-preview-fields grid grid-cols-4 gap-3">
            <Field label="Symbol"><div>MES</div></Field><Field label="Direction"><div style={{ color: T.up }}>Long</div></Field><Field label="Account"><div>Live / personal</div></Field><Field label="Setup / strategy"><div>Double bottom</div></Field>
          </div>
          <table className="w-full text-xs mt-4"><thead><tr><th className="text-left">Time</th><th>Symbol</th><th>Dir</th><th>P&amp;L</th><th>Grade</th><th>R:R planned</th><th>Held</th><th className="text-left">Setup</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index} className={index === 0 || index === 7 ? 'text-left' : 'text-center'} style={index === 3 ? { color: cell.startsWith('-') ? T.down : T.up, ...mono } : index === 2 ? { color: cell === 'Long' ? T.up : T.down } : undefined}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </Panel>
  )
}

export function SettingsTab({ settings, onSave, license, onLicenseChange, onReload, accounts = [], profiles = [], onAddProfile, onUpdateProfile, onDeleteProfile, initialSection = '' }) {
  const [s, setS] = useState(() => normalizeSettingsForDisplay(settings))
  const [manualWindows, setManualWindows] = useState(() => parsePersonalClockWindows(settings?.personalClockManualWindows))
  const [test, setTest] = useState(null)
  const [settingsSection, setSettingsSection] = useState(initialSection || 'Appearance 2.0')
  useEffect(() => {
    const normalized = normalizeSettingsForDisplay(settings)
    setS(normalized)
    setManualWindows(parsePersonalClockWindows(normalized.personalClockManualWindows))
  }, [settings])
  useEffect(() => {
    if (!initialSection) return undefined
    setSettingsSection(initialSection)
    const timer = setTimeout(() => {
      const panels = document.querySelectorAll('.th-page-settings > .th-panel')
      const target = [...panels].find((panel) => panel.querySelector(':scope > div:first-child > div:first-child')?.textContent?.trim().startsWith(initialSection))
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
    return () => clearTimeout(timer)
  }, [initialSection])
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }))
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const validManualWindows = parsePersonalClockWindows(manualWindows)
  const manualWindowsComplete = s.personalClockSource !== 'manual' || (manualWindows.length > 0 && validManualWindows.length === manualWindows.length)
  const alertsEnabled = s.personalClockAlerts !== 'false'
  const ambienceEnabled = s.personalClockAmbience !== 'false'
  const clockCueStatus = alertsEnabled && ambienceEnabled
    ? 'Alerts and ambience are enabled.'
    : alertsEnabled
      ? 'Alerts are enabled; ambience is off.'
      : ambienceEnabled
        ? 'Ambience is enabled; alerts are off.'
        : 'Personal clock cues are disabled — alerts and ambience are both off.'

  function saveNext(next) {
    setS(next)
    onSave(next)
  }

  function selectClockSource(source) {
    setS((current) => ({ ...current, personalClockSource: source }))
    if (source === 'manual' && manualWindows.length === 0) {
      setManualWindows([{ start: '09:30', end: '12:00' }])
    }
  }

  function updateManualWindow(index, key, value) {
    setManualWindows((current) => current.map((window, itemIndex) => itemIndex === index ? { ...window, [key]: value } : window))
  }

  function saveCoachAndClock() {
    if (!manualWindowsComplete) return
    const next = normalizeSettingsForDisplay({
      ...s,
      personalClockManualWindows: serializePersonalClockWindows(manualWindows)
    })
    setS(next)
    setManualWindows(parsePersonalClockWindows(next.personalClockManualWindows))
    onSave(next)
  }

  async function chooseBackground() {
    const res = await window.api.chooseBackground?.()
    if (res?.ok && res.settings) {
      setS(res.settings)
      onSave(res.settings)
    }
  }

  async function clearBackground() {
    const res = await window.api.clearBackground?.(s.customBackgroundFile)
    if (res?.ok && res.settings) {
      setS(res.settings)
      onSave(res.settings)
    }
  }

  async function testConn() {
    setTest('Testing selected model…')
    try {
      await onSave(s)
      const res = await window.api.aiChat({
        system: 'This is a connection test. Follow the user instruction exactly.',
        messages: [{ role: 'user', content: 'Reply with exactly: Model ready.' }],
        contextWindow: 2048,
        think: false
      })
      if (res?.ok && res.text && res.text !== '(no response)') {
        const model = (s.provider || 'ollama') === 'cloud' ? s.cloudModel : s.ollamaModel
        setTest(`Connected. ${model || 'Selected model'} responded successfully.`)
      } else setTest(`Failed: ${res?.error || 'The selected model returned no response.'}`)
    } catch (error) {
      setTest(`Failed: ${error?.message || 'Could not test the selected model.'}`)
    }
  }

  function openSettingsSection(title) {
    setSettingsSection(title)
    const panels = document.querySelectorAll('.th-page-settings > .th-panel')
    const target = [...panels].find((panel) => {
      const heading = panel.querySelector(':scope > div:first-child > div:first-child')
      return heading?.textContent?.trim().startsWith(title)
    })
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`th-page th-page-settings grid grid-cols-1 md:grid-cols-2 gap-4${settingsSection === 'Appearance 2.0' ? ' th-settings-focus-appearance' : ''}`}>
      <aside className="th-settings-nav" aria-label="Settings sections">
        <div className="th-settings-nav-title">Settings</div>
        {SETTINGS_SECTIONS.map((title) => (
          <button key={title} type="button" onClick={() => openSettingsSection(title)}
            className={settingsSection === title ? 'th-settings-nav-on' : ''}>
            <span aria-hidden="true" />{title.replace(' 2.0', '')}
          </button>
        ))}
      </aside>
      <LicensePanel license={license} onChange={onLicenseChange} />
      <DataPanel onReload={onReload} />
      <BrokerSyncPanel accounts={accounts} onReload={onReload} />
      <MobileSyncPanel />
      <InstrumentProfilesPanel profiles={profiles} onAdd={onAddProfile} onUpdate={onUpdateProfile} onDelete={onDeleteProfile} />
      <PriceBarsPanel />
      <MarketDataPanel />
      <ReleaseNotesPanel />
      <Panel title="Appearance 2.0" className="th-settings-appearance-panel">
        <div className="grid grid-cols-[1fr_154px] gap-3">
          <Field label="Theme presets">
            <select style={inputStyle} className={inp} value={s.themePreset || 'classic'} onChange={(event) => {
              const preset = THEME_PRESETS.find((item) => item.key === event.target.value)
              if (preset) saveNext({ ...s, themePreset: preset.key, themeMode: preset.mode, accentColor: preset.accentKey })
              else saveNext({ ...s, themePreset: event.target.value })
            }}>
              {THEME_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.name}</option>)}
              {!THEME_PRESETS.some((preset) => preset.key === s.themePreset) && <option value="custom">Custom</option>}
            </select>
          </Field>
          <Field label="Mode"><div className="th-settings-mode flex">{[['dark', 'Dark'], ['light', 'Light']].map(([k, label]) => <PillButton key={k} active={(s.themeMode || 'dark') === k} onClick={() => saveNext({ ...s, themeMode: k, themePreset: 'custom' })}>{label}</PillButton>)}</div></Field>
        </div>
        <div className="mt-3" />
        <Field label="Animated backdrop">
          <div className="th-backdrop-options grid grid-cols-4 gap-2 mt-1">
            {BACKDROP_OPTIONS.map(([k, label]) => {
              const cur = !s.backdrop || s.backdrop === 'on' ? 'constellation' : s.backdrop
              return (
                <button key={k} type="button" data-backdrop={k} className="th-backdrop-choice" onClick={() => saveNext({ ...s, backdrop: k })}
                  style={{ color: cur === k ? T.accentText : T.dim, border: `1px solid ${cur === k ? T.accent : T.line}` }}>
                  <span className="th-backdrop-swatch" /><span>{label}</span>
                </button>
              )
            })}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Accent color">
          <div className="flex flex-wrap gap-2 mt-1">
            {ACCENT_OPTIONS.map((o) => (
              <button key={o.key} type="button" title={o.key}
                onClick={() => saveNext({ ...s, accentColor: o.key, themePreset: 'custom' })}
                className="w-8 h-8 rounded-full"
                style={{ background: o.accent, border: `2px solid ${(s.accentColor || 'amber') === o.key ? T.text : 'transparent'}`, outline: (s.accentColor || 'amber') === o.key ? `1px solid ${o.accent}` : 'none' }} />
            ))}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Go-Time color"><select style={inputStyle} className={inp} value={s.goTimeAccent || 'orange'} onChange={(event) => saveNext({ ...s, goTimeAccent: event.target.value })}>{GO_TIME_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></Field>
        <div className="mt-3" />
        <div className="grid grid-cols-2 gap-3">
        <Field label="Profit / loss style"><select style={inputStyle} className={inp} value={s.pnlStyle || 'classic'} onChange={(event) => saveNext({ ...s, pnlStyle: event.target.value })}>{PNL_STYLE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></Field>
        <div className="mt-3" />
        <Field label="Number font"><select style={inputStyle} className={inp} value={s.fontStyle || 'default'} onChange={(event) => saveNext({ ...s, fontStyle: event.target.value })}>{FONT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></Field>
        </div>
        <div className="mt-4 rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold">Custom background image</div>
              <div className="text-xs mt-0.5" style={{ color: T.faint }}>{s.customBackgroundFile ? 'Local background is active.' : 'Add a PNG, JPG, or WEBP under 12 MB.'}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={chooseBackground} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Choose</button>
              {s.customBackgroundFile && <button type="button" onClick={clearBackground} className="rounded-md px-3 py-1.5 text-xs" style={{ background: T.surface, color: T.dim, border: `1px solid ${T.line}` }}>Remove</button>}
            </div>
          </div>
          {s.customBackgroundFile && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label={`Opacity ${s.customBackgroundOpacity || 22}%`}>
                <input type="range" min="0" max="70" value={s.customBackgroundOpacity || 22}
                  onChange={(e) => saveNext({ ...s, customBackgroundOpacity: e.target.value })} className="w-full" />
              </Field>
              <Field label={`Blur ${s.customBackgroundBlur || 0}px`}>
                <input type="range" min="0" max="18" value={s.customBackgroundBlur || 0}
                  onChange={(e) => saveNext({ ...s, customBackgroundBlur: e.target.value })} className="w-full" />
              </Field>
              <Field label={`Dim ${s.customBackgroundDim || 42}%`}>
                <input type="range" min="0" max="80" value={s.customBackgroundDim || 42}
                  onChange={(e) => saveNext({ ...s, customBackgroundDim: e.target.value })} className="w-full" />
              </Field>
              <Field label="Fit">
                <select style={inputStyle} className="w-full rounded px-2 py-1.5 text-xs" value={s.customBackgroundFit || 'cover'}
                  onChange={(e) => saveNext({ ...s, customBackgroundFit: e.target.value })}>
                  <option value="cover">Fill</option>
                  <option value="contain">Fit</option>
                  <option value="auto">Tile</option>
                </select>
              </Field>
            </div>
          )}
        </div>
      </Panel>
      {settingsSection === 'Appearance 2.0' && <AppearanceLivePreview settings={s} />}
      {false && (
      <Panel title="Appearance">
        <Field label="Theme">
          <div className="flex gap-1.5 mt-1">
            {[['dark', '🌙 Dark'], ['light', '☀️ Light']].map(([k, label]) => {
              const active = (s.themeMode || 'dark') === k
              return (
                <button key={k} type="button"
                  onClick={() => { const next = { ...s, themeMode: k }; setS(next); onSave(next) }}
                  className="text-xs px-3 py-1.5 rounded-md font-semibold"
                  style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accentText : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
                  {label}
                </button>
              )
            })}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Animated backdrop">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {BACKDROP_OPTIONS.map(([k, label]) => {
              const cur = !s.backdrop || s.backdrop === 'on' ? 'constellation' : s.backdrop
              const active = cur === k
              return (
                <button key={k} type="button"
                  onClick={() => { const next = { ...s, backdrop: k }; setS(next); onSave(next) }}
                  className="text-xs px-3 py-1.5 rounded-md font-semibold"
                  style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accentText : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
                  {label}
                </button>
              )
            })}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Accent color">
          <div className="flex flex-wrap gap-2 mt-1">
            {ACCENT_OPTIONS.map((o) => {
              const active = (s.accentColor || 'amber') === o.key
              return (
                <button key={o.key} type="button" title={o.key}
                  onClick={() => { const next = { ...s, accentColor: o.key }; setS(next); onSave(next) }}
                  className="w-8 h-8 rounded-full"
                  style={{ background: o.accent, border: `2px solid ${active ? T.text : 'transparent'}`, outline: active ? `1px solid ${o.accent}` : 'none' }} />
              )
            })}
          </div>
        </Field>
        <p className="text-xs mt-3" style={{ color: T.faint }}>Recolors buttons, highlights and the active tab across the app. Trade Mode keeps its own "go time" color.</p>
      </Panel>
      )}
      <Panel title="Coach &amp; personal clock">
        <Field label="Preferred name">
          <input
            style={inputStyle}
            className={inp}
            maxLength={40}
            value={s.traderName || ''}
            onChange={set('traderName')}
            placeholder="Optional — e.g. Raheim"
          />
        </Field>
        <p className="text-xs mt-1.5 mb-4" style={{ color: T.faint }}>Used for your local dashboard greeting. Leave it blank to keep the current neutral greeting.</p>

        <Field label="Coach voice">
          <select style={inputStyle} className={inp} value={s.coachVoice} onChange={set('coachVoice')}>
            <option value="supportive">Supportive — encouraging and gentle</option>
            <option value="balanced">Balanced — direct and constructive</option>
            <option value="tough-love">Tough love — firm, never shaming</option>
          </select>
        </Field>
        <p className="text-xs mt-1.5" style={{ color: T.faint }}>Changes how the coach delivers the same evidence-based feedback.</p>

        <div className="mt-4">
          <Field label="Coach response depth">
            <select style={inputStyle} className={inp} value={s.coachContextMode} onChange={set('coachContextMode')}>
              <option value="fast">Fast — smallest recent evidence window</option>
              <option value="balanced">Balanced — recommended for everyday coaching</option>
              <option value="deep">Deep — most journal detail, slowest locally</option>
            </select>
          </Field>
          <p className="text-xs mt-1.5" style={{ color: T.faint }}>Every mode keeps full-journal totals. Deeper modes include more individual trade notes and a longer conversation history.</p>
          <label className="flex items-start gap-2 rounded-lg p-3 text-sm mt-3 cursor-pointer" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, opacity: (s.provider || 'ollama') === 'ollama' ? 1 : 0.55 }}>
            <input type="checkbox" className="mt-0.5" disabled={(s.provider || 'ollama') !== 'ollama'} checked={s.coachShowThinking === 'true'} onChange={(event) => setS((current) => ({ ...current, coachShowThinking: String(event.target.checked) }))} />
            <span>Show model reasoning<span className="block text-xs mt-0.5" style={{ color: T.faint }}>Streams a collapsible reasoning trace when the selected Ollama model supports it. This can make replies slower, and the scratch work may be rough.</span></span>
          </label>
        </div>

        <div className="mt-4">
          <Field label="Personal trading windows">
            <div className="flex flex-wrap gap-1.5 mt-1">
              <PillButton active={s.personalClockSource === 'auto'} onClick={() => selectClockSource('auto')} title="Infer your usual session from trade history">
                Automatically inferred
              </PillButton>
              <PillButton active={s.personalClockSource === 'manual'} onClick={() => selectClockSource('manual')} title="Use only the windows you enter">
                Manually set
              </PillButton>
            </div>
          </Field>
          <p className="text-xs mt-2" style={{ color: T.faint }}>
            {s.personalClockSource === 'auto'
              ? 'TradeHelp infers your usual windows from recent trading history.'
              : 'Set one or more daily windows. Only complete HH:MM start and end pairs are saved.'}
          </p>
        </div>

        {s.personalClockSource === 'manual' && (
          <div className="space-y-2 mt-3">
            {manualWindows.map((clockWindow, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end rounded-lg p-2.5" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <label className="text-xs" style={{ color: T.dim }}>
                  Start (HH:MM)
                  <input type="time" aria-label={`Window ${index + 1} start`} style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm mt-1" value={clockWindow.start} onChange={(event) => updateManualWindow(index, 'start', event.target.value)} />
                </label>
                <label className="text-xs" style={{ color: T.dim }}>
                  End (HH:MM)
                  <input type="time" aria-label={`Window ${index + 1} end`} style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm mt-1" value={clockWindow.end} onChange={(event) => updateManualWindow(index, 'end', event.target.value)} />
                </label>
                <button type="button" aria-label={`Remove window ${index + 1}`} title="Remove window" onClick={() => setManualWindows((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md p-2" style={{ color: T.down, border: `1px solid ${T.line}` }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setManualWindows((current) => [...current, { start: '', end: '' }])} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}>
              <Plus size={13} /> Add window
            </button>
            {!manualWindowsComplete && <div className="text-xs" style={{ color: T.down }}>Manual mode needs at least one complete window with different start and end times.</div>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <label className="flex items-start gap-2 rounded-lg p-3 text-sm cursor-pointer" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}>
            <input type="checkbox" className="mt-0.5" checked={alertsEnabled} onChange={(event) => setS((current) => ({ ...current, personalClockAlerts: String(event.target.checked) }))} />
            <span>Session alerts<span className="block text-xs mt-0.5" style={{ color: T.faint }}>Flag historically strong or weak hours while you are in-session.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-lg p-3 text-sm cursor-pointer" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}>
            <input type="checkbox" className="mt-0.5" checked={ambienceEnabled} onChange={(event) => setS((current) => ({ ...current, personalClockAmbience: String(event.target.checked) }))} />
            <span>Session ambience<span className="block text-xs mt-0.5" style={{ color: T.faint }}>Use subtle visual cues during your window.</span></span>
          </label>
        </div>
        <div className="text-xs mt-2" style={{ color: !alertsEnabled && !ambienceEnabled ? T.dim : T.faint }}>{clockCueStatus}</div>
        <button type="button" disabled={!manualWindowsComplete} onClick={saveCoachAndClock} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: manualWindowsComplete ? 1 : 0.5 }}>Save coach &amp; clock</button>
      </Panel>

      <Panel title="Model provider">
        <Field label="Provider">
          <select style={inputStyle} className={inp} value={s.provider || 'ollama'} onChange={set('provider')}>
            <option value="ollama">Ollama (local, offline, free)</option>
            <option value="anthropic">Claude (Anthropic key)</option>
            <option value="cloud">OpenAI-compatible — LM Studio, LocalAI, or a cloud key</option>
          </select>
        </Field>
        {(s.provider || 'ollama') === 'ollama' ? (
          <div className="space-y-3 mt-3">
            <Field label="Ollama URL"><input style={inputStyle} className={inp} value={s.ollamaUrl || ''} onChange={set('ollamaUrl')} /></Field>
            <Field label="Model"><ModelSelect value={s.ollamaModel || ''} onChange={set('ollamaModel')} placeholder="llama3.2" /></Field>
            <Field label="Vision model (chart analysis)"><ModelSelect value={s.ollamaVisionModel || ''} onChange={set('ollamaVisionModel')} placeholder="llama3.2-vision" /></Field>
            <p className="text-xs" style={{ color: T.faint }}>
              Recommended for accurate coaching: <span style={mono} className="text-xs">qwen2.5:7b</span> or <span style={mono} className="text-xs">llama3.1:8b</span>. Minimum <span style={mono} className="text-xs">qwen2.5:3b</span> / <span style={mono} className="text-xs">llama3.2</span> (3B) — models under 3B tend to misread or invent trades. Pull one with e.g. <span style={mono} className="text-xs">ollama pull qwen2.5:7b</span>.
            </p>
          </div>
        ) : s.provider === 'anthropic' ? (
          <div className="space-y-3 mt-3">
            <Field label="API key"><input type="password" style={inputStyle} className={inp} value={s.anthropicKey || ''} onChange={set('anthropicKey')} placeholder="sk-ant-..." /></Field>
            <Field label="Model"><ModelSelect value={s.anthropicModel || ''} onChange={set('anthropicModel')} placeholder="claude-opus-5" /></Field>
            <p className="text-xs" style={{ color: T.faint }}>
              Paste a key from <span style={mono} className="text-xs">console.anthropic.com</span> and press Browse to list the models it can use. There is no URL to configure. Opus is the most capable, Sonnet is the balance of speed and cost, Haiku is the cheapest and fastest.
            </p>
            <TestKey type="anthropic" value={s.anthropicKey} />
            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
              <input type="checkbox" className="mt-0.5" checked={(s.cloudJournalAccess ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, cloudJournalAccess: String(e.target.checked) }))} />
              <span>Send my written notes &amp; reviews to Claude<span className="block text-xs mt-0.5" style={{ color: T.faint }}>On: the coach reads your full journal — notes, reasons, reviews, playbook — for real coaching. Off: only structured numbers (P&amp;L, setups, grades) leave your machine. Local Ollama always gets everything.</span></span>
            </label>
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            <Field label="Base URL"><input style={inputStyle} className={inp} value={s.cloudUrl || ''} onChange={set('cloudUrl')} /></Field>
            <Field label="Model"><input style={inputStyle} className={inp} value={s.cloudModel || ''} onChange={set('cloudModel')} /></Field>
            <Field label="API key (optional — leave blank for a local server)"><input type="password" style={inputStyle} className={inp} value={s.cloudKey || ''} onChange={set('cloudKey')} /></Field>
            <p className="text-xs" style={{ color: T.faint }}>
              Works with any OpenAI-compatible server, local or hosted. Point Base URL at a local runtime and leave the key blank to stay fully offline — e.g. <span style={mono} className="text-xs">http://localhost:1234/v1</span> (LM Studio) or <span style={mono} className="text-xs">http://localhost:8080/v1</span> (LocalAI). A key is only needed for hosted providers like OpenAI.
            </p>
            <TestKey type="cloud" value={s.cloudKey} url={s.cloudUrl} />
            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
              <input type="checkbox" className="mt-0.5" checked={(s.cloudJournalAccess ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, cloudJournalAccess: String(e.target.checked) }))} />
              <span>Send my written notes &amp; reviews to the cloud model<span className="block text-xs mt-0.5" style={{ color: T.faint }}>On: the coach reads your full journal — notes, reasons, reviews, playbook — for real coaching. Off: only structured numbers (P&amp;L, setups, grades) leave your machine. Local Ollama always gets everything.</span></span>
            </label>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm mt-4 cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" className="mt-0.5" checked={(s.proactiveCoachEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, proactiveCoachEnabled: String(e.target.checked) }))} />
          <span>Proactive coach brief<span className="block text-xs mt-0.5" style={{ color: T.faint }}>Automatically adds one AI-enhanced process review when your trade snapshot changes. Turn this off to use only the built-in rule-based brief.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm mt-3 cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" className="mt-0.5" checked={(s.dailyReportEnabled ?? 'true') !== 'false'} onChange={(e) => { const next = { ...s, dailyReportEnabled: String(e.target.checked) }; setS(next); onSave(next) }} />
          <span>Daily session review on launch<span className="block text-xs mt-0.5" style={{ color: T.faint }}>A floating card recaps your last trading day every time you open the app. Close it when done, or reopen it from the top bar.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm mt-3 cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" className="mt-0.5" checked={(s.easterEggEnabled ?? 'true') !== 'false'} onChange={(e) => { const next = { ...s, easterEggEnabled: String(e.target.checked) }; setS(next); onSave(next) }} />
          <span>Behavior easter eggs<span className="block text-xs mt-0.5" style={{ color: T.faint }}>Occasional light nudges after streaks, tilt-heavy sessions or overtrading. Red-day streaks can suggest break mode.</span></span>
        </label>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => onSave(s)} className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
          <button type="button" onClick={testConn} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Test model</button>
        </div>
        {test && <div className="mt-3 text-xs" style={{ color: T.dim, ...mono }}>{test}</div>}
      </Panel>
      <Panel title="Getting Ollama running">
        <ol className="text-sm space-y-2" style={{ color: T.dim }}>
          <li>1. Install Ollama from ollama.com</li>
          <li>2. In a terminal: <span style={{ color: T.accentText, ...mono }}>ollama pull llama3.2</span></li>
          <li>3. For chart analysis: <span style={{ color: T.accentText, ...mono }}>ollama pull llama3.2-vision</span></li>
          <li>4. Ollama serves on localhost:11434 automatically</li>
          <li>5. Hit "Test model" to load it once and confirm, then use the AI Coach tab</li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>Everything stays on your machine. Your key and trades never leave this app.</p>
      </Panel>

      <Panel title="Market ticker &amp; briefing quotes">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" checked={(s.tickerEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, tickerEnabled: String(e.target.checked) }))} />
          Show the persistent market ticker
        </label>
        <p className="mt-2 text-xs" style={{ color: T.faint }}>
          This compact secondary ticker stays under the app navigation and mirrors the watchlist configured in Charting → Market Pulse.
        </p>
        <div className="space-y-3 mt-3">
          <Field label="Private Briefing quote symbols (comma-separated)">
            <input style={inputStyle} className={inp} value={s.tickerSymbols ?? ''} onChange={set('tickerSymbols')} placeholder="SPY,QQQ,EURUSD,BTC" />
          </Field>
          <Field label="Finnhub API key (optional — real-time stocks)">
            <input type="password" style={inputStyle} className={inp} value={s.finnhubKey ?? ''} onChange={set('finnhubKey')} placeholder="leave blank for keyless / delayed" />
            <TestKey type="finnhub" value={s.finnhubKey} />
          </Field>
        </div>
        <button type="button" onClick={() => onSave(s)} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          The secondary ticker is a view-only compact copy of the full TradingView ticker in Market Pulse. Private Briefing quotes use the separate Binance, stock and OANDA provider path.
        </p>
      </Panel>

      <Panel title="Economic calendar &amp; news">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" checked={(s.eventsEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, eventsEnabled: String(e.target.checked) }))} />
          Warn me before high-impact news
        </label>
        <div className="mt-3">
          <Field label="Minimum impact">
            <select style={inputStyle} className={inp} value={s.eventsMinImpact || 'High'} onChange={set('eventsMinImpact')}>
              <option value="High">High only</option>
              <option value="Medium">Medium &amp; High</option>
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="FMP API key (optional — fuller calendar)">
            <input type="password" style={inputStyle} className={inp} value={s.fmpKey ?? ''} onChange={set('fmpKey')} placeholder="leave blank for keyless (ForexFactory)" />
            <TestKey type="fmp" value={s.fmpKey} />
          </Field>
        </div>
        <button type="button" onClick={() => onSave(s)} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Keyless by default (ForexFactory weekly feed). You'll get desktop notifications 30, 15 and 5 minutes before a high-impact event, a subtle banner, and a warning in the Trade Mode pre-flight.
        </p>
      </Panel>

      <Panel title="Feedback &amp; support">
        <p className="text-sm" style={{ color: T.dim }}>
          Hit a bug or have an idea? TradeHelp is built by one trader — your feedback genuinely shapes what ships next.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
          <button type="button" onClick={() => window.api.openExternal('https://discord.gg/ATfcXSD4j')}
            className="rounded-md px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: T.accent, color: '#1A1306' }}>
            <MessagesSquare size={16} /> Join our Discord
          </button>
          <button type="button" onClick={() => window.api.openExternal(SITE_URL)}
            className="rounded-md px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
            <Globe size={16} style={{ color: T.accentText }} /> Website
          </button>
          <button type="button" onClick={() => window.api.openExternal('https://instagram.com/tradehelp.app')}
            className="rounded-md px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
            <Instagram size={16} style={{ color: T.accentText }} /> Instagram
          </button>
        </div>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Join the <span style={{ color: T.accentText }}>Discord</span> to report bugs, request features and talk trades — or DM <span style={{ color: T.accentText }}>@tradehelp.app</span> on Instagram. <span style={{ color: T.accentText }}>trade-help.app</span> has the install and broker-import guides, plus the latest download.
        </p>
      </Panel>
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { T, mono, inputStyle, ACCENT_OPTIONS, THEME_PRESETS, GO_TIME_OPTIONS, PNL_STYLE_OPTIONS, FONT_OPTIONS } from '../theme.js'
import { CHECKOUT_URL } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'
import { BACKDROP_OPTIONS } from '../components/Backdrop.jsx'
import { Instagram, MessagesSquare } from 'lucide-react'

/* ───────── license & trial ───────── */
export function TrialBanner({ days }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accent }}>
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
          : st === 'trial' ? <span style={{ color: T.accent }}>● Free trial — {license.daysLeft} day{license.daysLeft === 1 ? '' : 's'} left.</span>
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
  async function exp() { const r = await window.api.exportData(); if (r?.ok) setMsg('Backup saved.'); else if (r?.error) setMsg('Export failed: ' + r.error) }
  async function imp() {
    if (!window.confirm('Import a backup file? Trades with matching IDs will be overwritten.')) return
    const r = await window.api.importData()
    if (r?.ok) { setMsg('Backup restored.'); onReload?.() } else if (r?.error) setMsg('Import failed: ' + r.error)
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
      <p className="text-xs mt-2" style={{ color: T.faint }}>JSON exports include journal records and day logs but exclude screenshot files and API keys. For a complete backup with charts, copy the entire data folder. A daily SQLite backup is also kept there.</p>
    </Panel>
  )
}

/* ───────── model picker: text field + browse button + clickable chips ───────── */
function ModelSelect({ value, onChange, placeholder }) {
  const [models, setModels] = useState(null) // null = not yet fetched
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const browse = useCallback(async () => {
    setLoading(true); setErr(null)
    const res = await window.api.aiModels().catch(() => ({ ok: false, error: 'Cannot reach Ollama' }))
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
          style={{ background: T.surface2, border: `1px solid ${T.line}`, color: loading ? T.faint : T.accent }}>
          {loading ? 'Loading…' : 'Browse'}
        </button>
      </div>
      {err && <div className="text-xs" style={{ color: T.down }}>{err} — is Ollama running?</div>}
      {models !== null && !err && (
        models.length === 0
          ? <div className="text-xs" style={{ color: T.faint }}>No models found. Run: <span style={{ ...mono, color: T.accent }}>ollama pull llama3.2</span></div>
          : <div className="flex flex-wrap gap-1.5">
              {models.map((m) => (
                <button key={m} type="button" onClick={() => onChange({ target: { value: m } })}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: value === m ? T.accentSoft : T.surface2,
                    color: value === m ? T.accent : T.dim,
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
      <button type="button" onClick={run} disabled={r?.loading} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>{r?.loading ? 'Testing…' : 'Test key'}</button>
      {r && !r.loading && <span className="text-xs" style={{ color: r.ok ? T.up : T.down }}>{r.msg}</span>}
    </div>
  )
}

/* ───────── settings ───────── */
function PillButton({ active, children, onClick, title }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-md font-semibold"
      style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accent : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
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

export function SettingsTab({ settings, onSave, license, onLicenseChange, onReload }) {
  const [s, setS] = useState(settings || {})
  const [test, setTest] = useState(null)
  useEffect(() => { setS(settings || {}) }, [settings])
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }))
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  function saveNext(next) {
    setS(next)
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
    setTest('Testing…')
    const res = await window.api.aiModels()
    if (res.ok) setTest(`Connected. Models: ${res.models.join(', ') || '(none — run: ollama pull llama3.2)'}`)
    else setTest(`Failed: ${res.error}`)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LicensePanel license={license} onChange={onLicenseChange} />
      <DataPanel onReload={onReload} />
      <Panel title="Appearance 2.0">
        <Field label="Theme presets">
          <div className="grid grid-cols-2 gap-2 mt-1">
            {THEME_PRESETS.map((p) => (
              <ThemePreview key={p.key} preset={p} active={(s.themePreset || 'classic') === p.key}
                onClick={() => saveNext({ ...s, themePreset: p.key, themeMode: p.mode, accentColor: p.accentKey })} />
            ))}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Theme mode">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {[['dark', 'Dark'], ['light', 'Light']].map(([k, label]) => (
              <PillButton key={k} active={(s.themeMode || 'dark') === k}
                onClick={() => saveNext({ ...s, themeMode: k, themePreset: 'custom' })}>
                {label}
              </PillButton>
            ))}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Animated backdrop">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {BACKDROP_OPTIONS.map(([k, label]) => {
              const cur = !s.backdrop || s.backdrop === 'on' ? 'constellation' : s.backdrop
              return (
                <PillButton key={k} active={cur === k} onClick={() => saveNext({ ...s, backdrop: k })}>
                  {label}
                </PillButton>
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
        <Field label="Go-Time color">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {GO_TIME_OPTIONS.map((o) => (
              <PillButton key={o.key} active={(s.goTimeAccent || 'orange') === o.key}
                onClick={() => saveNext({ ...s, goTimeAccent: o.key })}>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: o.accent }} />{o.label}</span>
              </PillButton>
            ))}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Profit / loss style">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {PNL_STYLE_OPTIONS.map((o) => (
              <PillButton key={o.key} active={(s.pnlStyle || 'classic') === o.key}
                onClick={() => saveNext({ ...s, pnlStyle: o.key })}>
                {o.label}
              </PillButton>
            ))}
          </div>
        </Field>
        <div className="mt-3" />
        <Field label="Number font">
          <div className="flex flex-wrap gap-1.5 mt-1">
            {FONT_OPTIONS.map((o) => (
              <PillButton key={o.key} active={(s.fontStyle || 'default') === o.key}
                onClick={() => saveNext({ ...s, fontStyle: o.key })}>
                {o.label}
              </PillButton>
            ))}
          </div>
        </Field>
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
                  style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accent : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
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
                  style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accent : T.dim, border: `1px solid ${active ? T.accent : T.line}` }}>
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
      <Panel title="Model provider">
        <Field label="Provider">
          <select style={inputStyle} className={inp} value={s.provider || 'ollama'} onChange={set('provider')}>
            <option value="ollama">Ollama (local, offline, free)</option>
            <option value="cloud">Cloud (OpenAI-compatible, your key)</option>
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
        ) : (
          <div className="space-y-3 mt-3">
            <Field label="Base URL"><input style={inputStyle} className={inp} value={s.cloudUrl || ''} onChange={set('cloudUrl')} /></Field>
            <Field label="Model"><input style={inputStyle} className={inp} value={s.cloudModel || ''} onChange={set('cloudModel')} /></Field>
            <Field label="API key (stored locally)"><input type="password" style={inputStyle} className={inp} value={s.cloudKey || ''} onChange={set('cloudKey')} /></Field>
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
          <button type="button" onClick={testConn} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Test Ollama</button>
        </div>
        {test && <div className="mt-3 text-xs" style={{ color: T.dim, ...mono }}>{test}</div>}
      </Panel>
      <Panel title="Getting Ollama running">
        <ol className="text-sm space-y-2" style={{ color: T.dim }}>
          <li>1. Install Ollama from ollama.com</li>
          <li>2. In a terminal: <span style={{ color: T.accent, ...mono }}>ollama pull llama3.2</span></li>
          <li>3. For chart analysis: <span style={{ color: T.accent, ...mono }}>ollama pull llama3.2-vision</span></li>
          <li>4. Ollama serves on localhost:11434 automatically</li>
          <li>5. Hit "Test Ollama" to confirm, then use the AI Coach tab</li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>Everything stays on your machine. Your key and trades never leave this app.</p>
      </Panel>

      <Panel title="Market data &amp; ticker">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" checked={(s.tickerEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, tickerEnabled: String(e.target.checked) }))} />
          Show the scrolling ticker tape
        </label>
        <div className="space-y-3 mt-3">
          <Field label="Ticker symbols (comma-separated)">
            <input style={inputStyle} className={inp} value={s.tickerSymbols ?? ''} onChange={set('tickerSymbols')} placeholder="SPY,QQQ,BTC,ETH" />
          </Field>
          <Field label="Finnhub API key (optional — real-time stocks)">
            <input type="password" style={inputStyle} className={inp} value={s.finnhubKey ?? ''} onChange={set('finnhubKey')} placeholder="leave blank for keyless / delayed" />
            <TestKey type="finnhub" value={s.finnhubKey} />
          </Field>
        </div>
        <button type="button" onClick={() => onSave(s)} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Keyless by default (crypto via Binance, stocks delayed via Stooq). A free Finnhub key switches stocks to real-time and also speeds up the Live price lookup. Futures (ES/NQ) need a paid feed — use SPY/QQQ as proxies.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          <button type="button" onClick={() => window.api.openExternal('https://discord.gg/ATfcXSD4j')}
            className="rounded-md px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: T.accent, color: '#1A1306' }}>
            <MessagesSquare size={16} /> Join our Discord
          </button>
          <button type="button" onClick={() => window.api.openExternal('https://instagram.com/tradehelp.io')}
            className="rounded-md px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
            <Instagram size={16} style={{ color: T.accent }} /> Instagram
          </button>
        </div>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Join the <span style={{ color: T.accent }}>Discord</span> to report bugs, request features and talk trades — or DM <span style={{ color: T.accent }}>@tradehelp.io</span> on Instagram. A quick feedback form is coming soon.
        </p>
      </Panel>
    </div>
  )
}

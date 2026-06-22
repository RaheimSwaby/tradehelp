import React, { useState, useEffect, useCallback } from 'react'
import { T, mono, inputStyle } from '../theme.js'
import { CHECKOUT_URL } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'

/* ───────── license & trial ───────── */
export function TrialBanner({ days }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accent }}>
        <span>Free trial — <strong>{days} day{days === 1 ? '' : 's'}</strong> left</span>
        <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="ml-auto px-2.5 py-0.5 rounded-md font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Get it — $20</button>
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
        <p className="text-sm mt-2" style={{ color: T.dim }}>Unlock TradeHelp for a one-time <span style={{ color: T.text }}>$20</span> — no subscription, works offline, yours forever.</p>
        <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="w-full mt-5 rounded-md py-2.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Get TradeHelp — $20</button>
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
            <button type="button" onClick={() => window.api.openExternal(CHECKOUT_URL)} className="rounded-md px-4 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Buy — $20</button>
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
      <p className="text-xs mt-2" style={{ color: T.faint }}>A daily auto-backup is kept in the data folder. Exports exclude your API keys.</p>
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
export function SettingsTab({ settings, onSave, license, onLicenseChange, onReload }) {
  const [s, setS] = useState(settings || {})
  const [test, setTest] = useState(null)
  useEffect(() => { setS(settings || {}) }, [settings])
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }))
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

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
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            <Field label="Base URL"><input style={inputStyle} className={inp} value={s.cloudUrl || ''} onChange={set('cloudUrl')} /></Field>
            <Field label="Model"><input style={inputStyle} className={inp} value={s.cloudModel || ''} onChange={set('cloudModel')} /></Field>
            <Field label="API key (stored locally)"><input type="password" style={inputStyle} className={inp} value={s.cloudKey || ''} onChange={set('cloudKey')} /></Field>
            <TestKey type="cloud" value={s.cloudKey} url={s.cloudUrl} />
          </div>
        )}
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
    </div>
  )
}

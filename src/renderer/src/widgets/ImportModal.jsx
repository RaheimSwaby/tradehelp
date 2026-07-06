import React, { useState, useMemo, useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, parseCSV, csvNum, csvDate, normDir, IMPORT_FIELDS, BROKER_PRESETS, detectBrokerPreset, applyPresetMap } from '../utils.js'
import { Field } from '../components/Shared.jsx'

/* ───────── CSV import modal ───────── */
// Fingerprint a trade for duplicate detection. Only trades with a real entry
// time are comparable — without one we can't tell a re-import from a genuinely
// similar trade.
const tradeKey = (t) => (t.entryTime ? `${t.symbol}|${t.entryTime}|${(Number(t.pnl) || 0).toFixed(2)}` : null)

// Generic column guesser — header regexes per field, then a data sniff for the date
// column, used when no broker preset matches (or the user switches back to Generic).
function guessMap(headers, rows) {
  const guessed = {}
  for (const [field, , re] of IMPORT_FIELDS) guessed[field] = headers.find((h) => re.test(h)) || ''
  // A combined column like "Commissions & Fees" matches both guesses — keep it
  // in one slot so the amount isn't counted twice.
  if (guessed.commission && guessed.commission === guessed.fees) guessed.commission = ''
  // If no date column matched by header name, sniff the data for one — picks the
  // first unmapped column whose values mostly look like dates, so trades keep
  // their real dates instead of all falling back to the import time.
  if (!guessed.entryTime) {
    const used = new Set(Object.values(guessed).filter(Boolean))
    const sample = rows.slice(0, 7)
    const dateish = (v) => /\d[/.\-:]\d/.test(v) // digit-sep-digit, e.g. 1/2, 9:30, 2024-01
    for (let i = 0; i < headers.length; i++) {
      if (used.has(headers[i])) continue
      const vals = sample.map((r) => String(r[i] || '').trim()).filter(Boolean)
      if (vals.length >= 2 && vals.filter((v) => dateish(v) && csvDate(v)).length >= Math.ceil(vals.length * 0.6)) {
        guessed.entryTime = headers[i]; break
      }
    }
  }
  return guessed
}

export function ImportModal({ onClose, onImport, existing = [], accounts = [] }) {
  const [data, setData] = useState(null) // { headers, rows }
  const [map, setMap] = useState({})
  const [preset, setPreset] = useState(null) // BROKER_PRESETS entry, or null = generic
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [account, setAccount] = useState('')
  const [includeDupes, setIncludeDupes] = useState(false)
  const fileRef = useRef(null)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  const existingKeys = useMemo(() => new Set(existing.map(tradeKey).filter(Boolean)), [existing])

  async function onFile(file) {
    if (!file) return
    setErr(null)
    try {
      const all = parseCSV(await file.text())
      if (all.length < 2) { setErr('That file has a header but no data rows.'); return }
      const headers = all[0].map((h) => h.trim())
      const rows = all.slice(1)
      // A known broker export? Apply its exact mapping; otherwise guess generically.
      const det = detectBrokerPreset(headers)
      setPreset(det)
      setData({ headers, rows })
      setMap(det ? applyPresetMap(det, headers) : guessMap(headers, rows))
    } catch (e) { setErr('Could not read the CSV: ' + (e?.message || e)) }
  }

  const built = useMemo(() => {
    if (!data) return []
    const idx = (field) => (map[field] ? data.headers.indexOf(map[field]) : -1)
    const cell = (row, field) => { const i = idx(field); return i >= 0 ? row[i] : '' }
    return data.rows.map((row) => {
      const sym = String(cell(row, 'symbol') || '').trim()
      if (!sym) return null
      const dir = normDir(cell(row, 'direction'))
      const entry = csvNum(cell(row, 'entry')), exit = csvNum(cell(row, 'exit')), size = csvNum(cell(row, 'size'))
      const feesOnly = map.fees ? Math.abs(csvNum(cell(row, 'fees'))) : 0
      const commission = map.commission ? Math.abs(csvNum(cell(row, 'commission'))) : 0
      const fees = feesOnly + commission
      const grossPnl = map.pnl ? csvNum(cell(row, 'pnl')) : (entry && exit && size ? (exit - entry) * size * (dir === 'Long' ? 1 : -1) : 0)
      const pnl = grossPnl - fees // store net of fees + commission
      const et = csvDate(cell(row, 'entryTime')), xt = csvDate(cell(row, 'exitTime'))
      const t = {
        id: Date.now().toString(36) + Math.random().toString(16).slice(2),
        symbol: sym.toUpperCase(), direction: dir, entry, exit, stop: 0, target: 0, size, riskAmount: 0,
        pnl, fees, rr: 0, emotion: '', setup: '', notes: '', reason: '',
        entryTime: et, exitTime: xt,
        timestamp: et || xt || new Date().toISOString().slice(0, 16).replace('T', ' '), source: 'import'
      }
      // Broker-specific fixups the column map can't express (e.g. Tradovate's
      // direction-from-fill-order). Runs before dupe detection so keys are final.
      if (preset?.post) {
        const get = (name) => { const i = data.headers.findIndex((h) => h.trim().toLowerCase() === String(name).toLowerCase()); return i >= 0 ? row[i] : '' }
        preset.post(t, get)
        t.symbol = String(t.symbol || '').toUpperCase()
      }
      t.dupe = existingKeys.has(tradeKey(t))
      return t
    }).filter(Boolean)
  }, [data, map, preset, existingKeys])

  const dupeCount = built.filter((t) => t.dupe).length
  const toImport = includeDupes ? built : built.filter((t) => !t.dupe)

  async function doImport() {
    if (!toImport.length) { setErr(built.length ? 'Every row matched a trade you already have.' : 'No rows had a symbol — check the Symbol mapping.'); return }
    setBusy(true)
    try { await onImport(toImport.map(({ dupe, ...t }) => ({ ...t, account }))) } catch (e) { setErr(String(e?.message || e)); setBusy(false) }
  }

  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2"><Upload size={18} style={{ color: T.accent }} /><span className="text-sm font-semibold">Import trades from CSV</span></div>
          <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!data ? (
            <div onClick={() => fileRef.current?.click()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer?.files?.[0]) }} onDragOver={(e) => e.preventDefault()}
              className="rounded-lg py-10 text-center cursor-pointer" style={{ background: T.surface2, border: `1px dashed ${T.line}` }}>
              <Upload size={22} style={{ color: T.accent, display: 'inline' }} />
              <div className="text-sm mt-2" style={{ color: T.dim }}>Drop your broker's CSV export here, or click to choose</div>
              <div className="text-xs mt-1" style={{ color: T.faint }}>NinjaTrader, Tradovate, ThinkorSwim, IBKR, Webull… any CSV with headers</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="grow">
                  <Field label="Broker preset">
                    <select style={inputStyle} className={inp} value={preset?.key || ''}
                      onChange={(e) => {
                        const p = BROKER_PRESETS.find((x) => x.key === e.target.value) || null
                        setPreset(p)
                        setMap(p ? applyPresetMap(p, data.headers) : guessMap(data.headers, data.rows))
                      }}>
                      <option value="">Generic — auto-guess columns</option>
                      {BROKER_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="text-xs pb-2 shrink-0" style={{ color: T.faint }}>{data.rows.length} rows</div>
              </div>
              {preset && (
                <div className="text-xs rounded-lg px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.up }}>
                  ✓ {preset.label} export recognized — columns mapped for you. Adjust below if anything looks off.
                </div>
              )}
              <div className="text-xs" style={{ color: T.dim }}>Map your columns{preset ? '' : ' (we guessed — fix any that are off)'}:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map(([field, label, , req]) => (
                  <Field key={field} label={label + (req ? ' *' : '')}>
                    <select style={inputStyle} className={inp} value={map[field] || ''} onChange={(e) => setMap((m) => ({ ...m, [field]: e.target.value }))}>
                      <option value="">—</option>
                      {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              {accounts.length > 0 && (
                <Field label="Assign imported trades to">
                  <select style={inputStyle} className={inp} value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">Live / personal</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || 'Account'}</option>)}
                  </select>
                </Field>
              )}
              {dupeCount > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                  <span style={{ color: T.dim }}>
                    <span style={{ color: T.accent }}>{dupeCount} row{dupeCount === 1 ? '' : 's'}</span> match trades already in your journal (same symbol, entry time and P&L) — they'll be skipped.
                  </span>
                  <label className="flex items-center gap-1.5 shrink-0 cursor-pointer" style={{ color: T.dim }}>
                    <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} />
                    import anyway
                  </label>
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: T.faint }}>Preview</div>
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.line}` }}>
                  <table className="w-full text-xs" style={mono}>
                    <thead><tr style={{ color: T.faint }}>{['Symbol', 'Dir', 'Entry', 'Exit', 'Fees', 'P&L (net)', 'Entry time'].map((h) => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
                    <tbody>
                      {built.slice(0, 3).map((t) => (
                        <tr key={t.id} style={{ borderTop: `1px solid ${T.line}`, opacity: t.dupe && !includeDupes ? 0.4 : 1 }}>
                          <td className="px-2 py-1">{t.symbol}</td>
                          <td className="px-2 py-1" style={{ color: t.direction === 'Long' ? T.up : T.down }}>{t.direction}</td>
                          <td className="px-2 py-1">{t.entry || '—'}</td>
                          <td className="px-2 py-1">{t.exit || '—'}</td>
                          <td className="px-2 py-1" style={{ color: T.dim }}>{t.fees ? fmt$(t.fees) : '—'}</td>
                          <td className="px-2 py-1" style={{ color: t.pnl >= 0 ? T.up : T.down }}>{fmt$(t.pnl)}</td>
                          <td className="px-2 py-1" style={{ color: T.dim }}>{t.entryTime || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {err && <div className="text-xs" style={{ color: T.down }}>{err}</div>}
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <span className="text-xs" style={{ color: T.faint }}>Imported trades count as <span style={{ color: T.up }}>Verified</span> on your rating.</span>
          <div className="flex gap-2">
            {data && <button type="button" onClick={() => { setData(null); setMap({}); setPreset(null); setErr(null) }} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Choose another</button>}
            <button type="button" disabled={!data || busy} onClick={doImport} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: (!data || busy) ? 0.5 : 1 }}>{busy ? 'Importing…' : `Import ${toImport.length} trade${toImport.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

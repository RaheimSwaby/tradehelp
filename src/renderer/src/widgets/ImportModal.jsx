import React, { useState, useMemo, useRef } from 'react'
import { Upload, X } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, parseCSV, csvNum, csvDate, normDir, IMPORT_FIELDS } from '../utils.js'
import { Field } from '../components/Shared.jsx'

/* ───────── CSV import modal ───────── */
export function ImportModal({ onClose, onImport }) {
  const [data, setData] = useState(null) // { headers, rows }
  const [map, setMap] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  async function onFile(file) {
    if (!file) return
    setErr(null)
    try {
      const all = parseCSV(await file.text())
      if (all.length < 2) { setErr('That file has a header but no data rows.'); return }
      const headers = all[0].map((h) => h.trim())
      const guessed = {}
      for (const [field, , re] of IMPORT_FIELDS) guessed[field] = headers.find((h) => re.test(h)) || ''
      // If no date column matched by header name, sniff the data for one — picks the
      // first unmapped column whose values mostly look like dates. Handles brokers
      // (e.g. TopstepX) whose date-column header we don't recognize, so trades keep
      // their real dates instead of all falling back to the import time.
      if (!guessed.entryTime) {
        const used = new Set(Object.values(guessed).filter(Boolean))
        const sample = all.slice(1, 8)
        const dateish = (v) => /\d[/.\-:]\d/.test(v) // digit-sep-digit, e.g. 1/2, 9:30, 2024-01
        for (let i = 0; i < headers.length; i++) {
          if (used.has(headers[i])) continue
          const vals = sample.map((r) => String(r[i] || '').trim()).filter(Boolean)
          if (vals.length >= 2 && vals.filter((v) => dateish(v) && csvDate(v)).length >= Math.ceil(vals.length * 0.6)) {
            guessed.entryTime = headers[i]; break
          }
        }
      }
      setData({ headers, rows: all.slice(1) }); setMap(guessed)
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
      const fees = map.fees ? Math.abs(csvNum(cell(row, 'fees'))) : 0
      const grossPnl = map.pnl ? csvNum(cell(row, 'pnl')) : (entry && exit && size ? (exit - entry) * size * (dir === 'Long' ? 1 : -1) : 0)
      const pnl = grossPnl - fees // store net of fees
      const et = csvDate(cell(row, 'entryTime')), xt = csvDate(cell(row, 'exitTime'))
      return {
        id: Date.now().toString(36) + Math.random().toString(16).slice(2),
        symbol: sym.toUpperCase(), direction: dir, entry, exit, stop: 0, target: 0, size, riskAmount: 0,
        pnl, fees, rr: 0, emotion: '', setup: '', notes: '', reason: '',
        entryTime: et, exitTime: xt,
        timestamp: et || xt || new Date().toISOString().slice(0, 16).replace('T', ' '), source: 'import'
      }
    }).filter(Boolean)
  }, [data, map])

  async function doImport() {
    if (!built.length) { setErr('No rows had a symbol — check the Symbol mapping.'); return }
    setBusy(true)
    try { await onImport(built) } catch (e) { setErr(String(e?.message || e)); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
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
              <div className="text-xs" style={{ color: T.dim }}>{data.rows.length} rows · map your columns (we guessed — fix any that are off):</div>
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
              <div>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: T.faint }}>Preview</div>
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.line}` }}>
                  <table className="w-full text-xs" style={mono}>
                    <thead><tr style={{ color: T.faint }}>{['Symbol', 'Dir', 'Entry', 'Exit', 'P&L', 'Entry time'].map((h) => <th key={h} className="text-left px-2 py-1 font-normal">{h}</th>)}</tr></thead>
                    <tbody>
                      {built.slice(0, 3).map((t) => (
                        <tr key={t.id} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td className="px-2 py-1">{t.symbol}</td>
                          <td className="px-2 py-1" style={{ color: t.direction === 'Long' ? T.up : T.down }}>{t.direction}</td>
                          <td className="px-2 py-1">{t.entry || '—'}</td>
                          <td className="px-2 py-1">{t.exit || '—'}</td>
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
            {data && <button type="button" onClick={() => { setData(null); setMap({}); setErr(null) }} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Choose another</button>}
            <button type="button" disabled={!data || busy} onClick={doImport} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: (!data || busy) ? 0.5 : 1 }}>{busy ? 'Importing…' : `Import ${built.length} trades`}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

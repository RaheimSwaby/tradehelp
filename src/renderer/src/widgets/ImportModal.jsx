import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Upload, X } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, parseCSV, IMPORT_FIELDS, BROKER_PRESETS, detectBrokerPreset, applyPresetMap } from '../utils.js'
import { Field } from '../components/Shared.jsx'
import { buildImportRows, guessImportMap } from '../importEngine.js'
import { LOCAL_TIMEZONE, importTimeZoneOptions, normalizeImportTimeZone } from '../importTimezone.js'

export function ImportModal({ onClose, onImport, existing = [], accounts = [], initialImport = null }) {
  const [data, setData] = useState(null)
  const [map, setMap] = useState({})
  const [preset, setPreset] = useState(null)
  const [timezone, setTimezone] = useState(LOCAL_TIMEZONE)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [account, setAccount] = useState('')
  const [includeDupes, setIncludeDupes] = useState(false)
  const [fileName, setFileName] = useState('Manual CSV import')
  const [inboxContext, setInboxContext] = useState(null)
  const fileRef = useRef(null)
  const timezoneOptions = useMemo(() => importTimeZoneOptions(), [])
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  function loadText(text, name, context = null) {
    const all = parseCSV(text)
    if (all.length < 2) throw new Error('That file has a header but no data rows.')
    const headers = all[0].map((header) => String(header).trim())
    const rows = all.slice(1)
    const configured = context?.brokerKey ? BROKER_PRESETS.find((item) => item.key === context.brokerKey) : null
    const detected = detectBrokerPreset(headers)
    const nextPreset = configured || detected
    setPreset(nextPreset)
    setData({ headers, rows })
    setMap(nextPreset ? applyPresetMap(nextPreset, headers) : guessImportMap(headers, rows))
    setFileName(name || 'Manual CSV import')
    setInboxContext(context)
    setTimezone(normalizeImportTimeZone(context?.timezone))
    if (context?.account) setAccount(context.account)
  }

  useEffect(() => {
    if (!initialImport?.text) return
    try { loadText(initialImport.text, initialImport.fileName, initialImport) }
    catch (error) { setErr(error?.message || String(error)) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(file) {
    if (!file) return
    setErr(null)
    try { loadText(await file.text(), file.name) }
    catch (error) { setErr(`Could not read the CSV: ${error?.message || error}`) }
  }

  const built = useMemo(() => {
    if (!data) return []
    return buildImportRows({ headers: data.headers, rows: data.rows, map, preset, existing, account, timezone })
  }, [data, map, preset, existing, account, timezone])
  const dupeCount = built.filter((trade) => trade.dupe).length
  const toImport = includeDupes ? built : built.filter((trade) => !trade.dupe)

  async function doImport() {
    if (!toImport.length) {
      setErr(built.length ? 'Every row matched a trade you already have.' : 'No rows had a symbol - check the Symbol mapping.')
      return
    }
    const skippedCount = Math.max(0, (data?.rows?.length || 0) - built.length)
    const missingDates = built.filter((trade) => !trade.entryTime && !trade.exitTime).length
    const warnings = []
    if (!preset) warnings.push('Broker format was not recognized; column mapping was auto-guessed.')
    if (skippedCount) warnings.push(`${skippedCount} row${skippedCount === 1 ? '' : 's'} had no symbol and were skipped.`)
    if (missingDates) warnings.push(`${missingDates} trade${missingDates === 1 ? '' : 's'} had no usable trade date.`)
    setBusy(true)
    try {
      await onImport(toImport.map(({ dupe, ...trade }) => ({ ...trade, account })), {
        fileName, sourceId: inboxContext?.sourceId || '', inboxId: inboxContext?.inboxId || '',
        brokerKey: preset?.key || '', brokerLabel: preset?.label || 'Generic CSV', account,
        timezone, rowCount: data?.rows?.length || 0,
        duplicateCount: includeDupes ? 0 : dupeCount, skippedCount, warningCount: warnings.length, warnings
      })
      onClose()
    } catch (error) {
      setErr(String(error?.message || error))
      setBusy(false)
    }
  }

  function resetFile() {
    setData(null); setMap({}); setPreset(null); setTimezone(LOCAL_TIMEZONE); setErr(null); setFileName('Manual CSV import'); setInboxContext(null)
  }

  return createPortal(
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-lg w-full max-w-2xl max-h-[88vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2"><Upload size={18} style={{ color: T.accent }} /><span className="text-sm font-semibold">Import trades from CSV</span></div>
          <button type="button" onClick={onClose} style={{ color: T.faint }} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {!data ? (
            <div onClick={() => fileRef.current?.click()} onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer?.files?.[0]) }} onDragOver={(event) => event.preventDefault()}
              className="rounded-lg py-10 text-center cursor-pointer" style={{ background: T.surface2, border: `1px dashed ${T.line}` }}>
              <Upload size={22} style={{ color: T.accent, display: 'inline' }} />
              <div className="text-sm mt-2" style={{ color: T.dim }}>Drop your broker's CSV export here, or click to choose</div>
              <div className="text-xs mt-1" style={{ color: T.faint }}>NinjaTrader, Tradovate, TopstepX, or another CSV with headers</div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <div className="grow"><Field label="Broker preset">
                  <select style={inputStyle} className={inp} value={preset?.key || ''} onChange={(event) => {
                    const next = BROKER_PRESETS.find((item) => item.key === event.target.value) || null
                    setPreset(next)
                    setMap(next ? applyPresetMap(next, data.headers) : guessImportMap(data.headers, data.rows))
                  }}>
                    <option value="">Generic - auto-guess columns</option>
                    {BROKER_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </Field></div>
                <div className="text-xs pb-2 shrink-0" style={{ color: T.faint }}>{data.rows.length} rows</div>
              </div>
              {preset && <div className="text-xs rounded-lg px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.up }}>{preset.label} recognized - columns mapped automatically.</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map(([field, label, , required]) => <Field key={field} label={`${label}${required ? ' *' : ''}`}>
                  <select style={inputStyle} className={inp} value={map[field] || ''} onChange={(event) => setMap((current) => ({ ...current, [field]: event.target.value }))}>
                    <option value="">-</option>
                    {data.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </Field>)}
              </div>
              {accounts.length > 0 && <Field label="Assign imported trades to">
                <select style={inputStyle} className={inp} value={account} onChange={(event) => setAccount(event.target.value)}>
                  <option value="">Live / personal</option>
                  {accounts.map((item) => <option key={item.id} value={item.id}>{item.label || 'Account'}</option>)}
                </select>
              </Field>}
              <Field label="Source timezone">
                <select style={inputStyle} className={inp} value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-label="Source timezone">
                  {[...new Set([timezone, ...timezoneOptions])].map((zone) => <option key={zone} value={zone}>{zone === LOCAL_TIMEZONE ? 'Local time (no conversion)' : zone}</option>)}
                </select>
                <div className="text-xs mt-1" style={{ color: T.faint }}>Choose the timezone used by the CSV timestamps. Preview times are converted to your local timezone.</div>
              </Field>
              {dupeCount > 0 && <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <span style={{ color: T.dim }}><span style={{ color: T.accent }}>{dupeCount} duplicate{dupeCount === 1 ? '' : 's'}</span> will be skipped.</span>
                <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: T.dim }}><input type="checkbox" checked={includeDupes} onChange={(event) => setIncludeDupes(event.target.checked)} /> import anyway</label>
              </div>}
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: T.faint }}>Preview</div>
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.line}` }}><table className="w-full text-xs" style={mono}>
                  <thead><tr style={{ color: T.faint }}>{['Symbol', 'Dir', 'Entry', 'Exit', 'Fees', 'P&L (net)', 'Entry time'].map((label) => <th key={label} className="text-left px-2 py-1 font-normal">{label}</th>)}</tr></thead>
                  <tbody>{built.slice(0, 3).map((trade) => <tr key={trade.id} style={{ borderTop: `1px solid ${T.line}`, opacity: trade.dupe && !includeDupes ? 0.4 : 1 }}>
                    <td className="px-2 py-1">{trade.symbol}</td><td className="px-2 py-1" style={{ color: trade.direction === 'Long' ? T.up : T.down }}>{trade.direction}</td>
                    <td className="px-2 py-1">{trade.entry || '-'}</td><td className="px-2 py-1">{trade.exit || '-'}</td><td className="px-2 py-1" style={{ color: T.dim }}>{trade.fees ? fmt$(trade.fees) : '-'}</td>
                    <td className="px-2 py-1" style={{ color: trade.pnl >= 0 ? T.up : T.down }}>{fmt$(trade.pnl)}</td><td className="px-2 py-1" style={{ color: T.dim }}>{trade.entryTime || '-'}</td>
                  </tr>)}</tbody>
                </table></div>
              </div>
            </>
          )}
          {err && <div className="text-xs" style={{ color: T.down }}>{err}</div>}
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <span className="text-xs" style={{ color: T.faint }}>Every import is recorded and can be rolled back from Import inbox.</span>
          <div className="flex gap-2">
            {data && !initialImport && <button type="button" onClick={resetFile} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Choose another</button>}
            <button type="button" disabled={!data || busy} onClick={doImport} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: (!data || busy) ? 0.5 : 1 }}>{busy ? 'Importing...' : `Import ${toImport.length} trade${toImport.length === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      </div>
    </div>, document.body
  )
}

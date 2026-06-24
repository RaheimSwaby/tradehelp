import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2, Upload, Paperclip, X, Pencil, ImagePlus, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, nowLocalInput, parseLocal, holdMs, fmtDuration, EMOTIONS, SETUPS, WIN_REASONS, LOSS_REASONS, pad2, MONTHS, downscale, fileToDataUrl } from '../utils.js'
import { Field, Panel, GradeChip } from '../components/Shared.jsx'
import { ImportModal } from '../widgets/ImportModal.jsx'
import { AnnotateModal } from '../components/AnnotateModal.jsx'

/* ───────── journal ───────── */
export function Journal({ trades, onAdd, onUpdate, onRemove, onNotes, onImport, accounts = [] }) {
  const blank = { symbol: '', direction: 'Long', entry: '', exit: '', stop: '', target: '', size: '', riskAmount: '', pnl: '', emotion: 'Neutral', setup: 'Pullback', notes: '', entryTime: nowLocalInput(), exitTime: nowLocalInput(), reason: '', account: '' }
  const [f, setF] = useState(blank)
  const [images, setImages] = useState([])
  const [annotating, setAnnotating] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState('all') // all | win | loss
  const fileRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return trades.filter((t) => {
      const pnl = Number(t.pnl) || 0
      if (outcome === 'win' && pnl < 0) return false
      if (outcome === 'loss' && pnl >= 0) return false
      if (!q) return true
      return [t.symbol, t.setup, t.emotion, t.reason, t.notes, t.direction].some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [trades, query, outcome])

  function startEdit(t) {
    setEditing(t)
    setImages([])
    setF({
      symbol: t.symbol || '', direction: t.direction || 'Long',
      entry: String(t.entry ?? ''), exit: String(t.exit ?? ''), stop: String(t.stop ?? ''), target: String(t.target ?? ''),
      size: String(t.size ?? ''), riskAmount: String(t.riskAmount ?? ''), pnl: String(t.pnl ?? ''),
      emotion: t.emotion || 'Neutral', setup: t.setup || '', notes: t.notes || '',
      entryTime: t.entryTime ? t.entryTime.replace(' ', 'T') : '', exitTime: t.exitTime ? t.exitTime.replace(' ', 'T') : '',
      reason: t.reason || '', account: t.account || ''
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { setEditing(null); setF(blank) }
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  // Setup suggestions = presets + any custom setups already used. Free-text, so you can type your own.
  const setupOptions = useMemo(() => {
    const seen = new Set(SETUPS)
    for (const t of trades) if (t.setup) seen.add(t.setup)
    return [...seen]
  }, [trades])

  const derivedPnl = useMemo(() => {
    const en = parseFloat(f.entry), ex = parseFloat(f.exit), sz = parseFloat(f.size)
    if (!isNaN(en) && !isNaN(ex) && !isNaN(sz)) return (ex - en) * sz * (f.direction === 'Long' ? 1 : -1)
    return null
  }, [f.entry, f.exit, f.size, f.direction])

  const derivedRR = useMemo(() => {
    const en = parseFloat(f.entry), st = parseFloat(f.stop), tg = parseFloat(f.target)
    if (!isNaN(en) && !isNaN(st) && !isNaN(tg) && Math.abs(en - st) > 0) return Math.abs(tg - en) / Math.abs(en - st)
    return null
  }, [f.entry, f.stop, f.target])

  const derivedHold = useMemo(() => {
    const a = parseLocal(f.entryTime), b = parseLocal(f.exitTime)
    return a && b ? b - a : null
  }, [f.entryTime, f.exitTime])

  // reason options follow the outcome (win vs loss); clear a stale pick if the outcome flips
  const effPnl = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? null)
  const isWin = effPnl == null || isNaN(effPnl) ? null : effPnl >= 0
  const reasonOptions = isWin === false ? LOSS_REASONS : WIN_REASONS
  useEffect(() => { setF((p) => (p.reason && !reasonOptions.includes(p.reason) ? { ...p, reason: '' } : p)) }, [isWin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addImageFiles(files) {
    for (const file of files) {
      if (!file || !file.type?.startsWith('image/')) continue
      const small = await downscale(await fileToDataUrl(file))
      setImages((p) => [...p, { tmpId: Date.now() + Math.random(), dataUrl: small, tag: p.length === 0 ? 'Before' : p.length === 1 ? 'After' : '' }])
    }
  }
  // Paste a chart screenshot anywhere on the Journal tab (Ctrl+V) and it lands on the trade.
  useEffect(() => {
    const onPaste = (e) => {
      const imgs = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean)
      if (imgs.length) { e.preventDefault(); addImageFiles(imgs) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
  const setTag = (tmpId, v) => setImages((p) => p.map((im) => (im.tmpId === tmpId ? { ...im, tag: v } : im)))
  const removeImage = (tmpId) => setImages((p) => p.filter((im) => im.tmpId !== tmpId))

  function submit() {
    if (!f.symbol.trim()) return
    const pnl = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? 0)
    const rr = derivedRR ?? (f.riskAmount && f.pnl ? Math.abs(parseFloat(f.pnl)) / Math.abs(parseFloat(f.riskAmount)) : 0)
    const base = {
      symbol: f.symbol.trim().toUpperCase(), direction: f.direction,
      entry: parseFloat(f.entry) || 0, exit: parseFloat(f.exit) || 0,
      stop: parseFloat(f.stop) || 0, target: parseFloat(f.target) || 0,
      size: parseFloat(f.size) || 0, riskAmount: parseFloat(f.riskAmount) || 0,
      pnl: isNaN(pnl) ? 0 : pnl, rr: rr || 0,
      emotion: f.emotion, setup: f.setup.trim(), notes: f.notes.trim(),
      entryTime: f.entryTime ? f.entryTime.replace('T', ' ') : '',
      exitTime: f.exitTime ? f.exitTime.replace('T', ' ') : '',
      reason: f.reason, account: f.account
    }
    if (editing) {
      onUpdate({ ...base, id: editing.id, timestamp: editing.timestamp, source: editing.source || 'manual' })
      setEditing(null); setF(blank)
    } else {
      onAdd({ ...base, id: Date.now() + Math.random().toString(16).slice(2), timestamp: new Date().toISOString().slice(0, 16).replace('T', ' ') },
        images.map((im) => ({ dataUrl: im.dataUrl, tag: im.tag.trim(), caption: (im.labels || []).join(', ') })))
      setF(blank); setImages([])
    }
  }

  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 mb-3">
          {editing ? <Pencil size={16} style={{ color: T.accent }} /> : <Plus size={16} style={{ color: T.accent }} />}
          <h2 className="text-sm font-semibold">{editing ? `Edit trade · ${editing.symbol}` : 'Log a trade'}</h2>
          {editing && <button type="button" onClick={cancelEdit} className="ml-auto text-xs" style={{ color: T.dim }}>Cancel</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol"><input style={inputStyle} className={inp} value={f.symbol} onChange={set('symbol')} placeholder="ES, BTC, AAPL" /></Field>
          <Field label="Direction">
            <select style={inputStyle} className={inp} value={f.direction} onChange={set('direction')}><option>Long</option><option>Short</option></select>
          </Field>
          <Field label="Entry"><input style={inputStyle} className={inp} value={f.entry} onChange={set('entry')} inputMode="decimal" /></Field>
          <Field label="Exit"><input style={inputStyle} className={inp} value={f.exit} onChange={set('exit')} inputMode="decimal" /></Field>
          <Field label="Stop"><input style={inputStyle} className={inp} value={f.stop} onChange={set('stop')} inputMode="decimal" /></Field>
          <Field label="Target"><input style={inputStyle} className={inp} value={f.target} onChange={set('target')} inputMode="decimal" /></Field>
          <Field label="Size / contracts"><input style={inputStyle} className={inp} value={f.size} onChange={set('size')} inputMode="decimal" /></Field>
          <Field label="Risk $"><input style={inputStyle} className={inp} value={f.riskAmount} onChange={set('riskAmount')} inputMode="decimal" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Entry time"><input type="datetime-local" style={inputStyle} className={inp} value={f.entryTime} onChange={set('entryTime')} /></Field>
          <Field label="Exit time"><input type="datetime-local" style={inputStyle} className={inp} value={f.exitTime} onChange={set('exitTime')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Emotion"><select style={inputStyle} className={inp} value={f.emotion} onChange={set('emotion')}>{EMOTIONS.map((e) => <option key={e}>{e}</option>)}</select></Field>
          <Field label="Setup">
            <input style={inputStyle} className={inp} value={f.setup} onChange={set('setup')} list="setup-options" placeholder="Pick or type your own" />
            <datalist id="setup-options">{setupOptions.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
        <div className="mt-3">
          <Field label={isWin === false ? 'Why did it lose?' : 'Why did it win?'}>
            <select style={inputStyle} className={inp} value={f.reason} onChange={set('reason')}>
              <option value="">— optional, nudges your rating —</option>
              {reasonOptions.map((rr) => <option key={rr} value={rr}>{rr}</option>)}
            </select>
          </Field>
        </div>
        {accounts.length > 0 && (
          <div className="mt-3">
            <Field label="Account (for per-account books)">
              <select style={inputStyle} className={inp} value={f.account} onChange={set('account')}>
                <option value="">— unassigned / shared —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || 'Account'}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="mt-3">
          <Field label="Net P&L $ (blank = auto-calc)">
            <input style={inputStyle} className={inp} value={f.pnl} onChange={set('pnl')} inputMode="decimal" placeholder={derivedPnl != null ? `auto: ${fmtN(derivedPnl)}` : '—'} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes"><textarea style={inputStyle} className={inp} rows={3} value={f.notes} onChange={set('notes')} placeholder="What did you see? What did you feel?" /></Field>
        </div>
        {!editing && (
        <div className="mt-3">
          <Field label="Screenshots — before / after">
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); addImageFiles([...(e.dataTransfer?.files || [])]) }}
              onDragOver={(e) => e.preventDefault()}
              className="rounded px-3 py-3 text-center cursor-pointer"
              style={{ background: T.surface2, border: `1px dashed ${T.line}` }}>
              <ImagePlus size={18} style={{ color: T.accent, display: 'inline', verticalAlign: 'middle' }} />
              <span className="text-xs ml-2" style={{ color: T.dim }}>Paste a chart (Ctrl+V), drop an image, or click to choose</span>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImageFiles([...e.target.files]); e.target.value = '' }} />
            </div>
          </Field>
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {images.map((im) => (
                <div key={im.tmpId} className="rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                  <div className="relative">
                    <img src={im.dataUrl} alt="" className="w-full h-20 object-cover" />
                    <button type="button" onClick={() => removeImage(im.tmpId)} className="absolute top-1 right-1 rounded p-0.5" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}><X size={13} /></button>
                    <button type="button" onClick={() => setAnnotating(im)} className="absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1" style={{ background: 'rgba(0,0,0,0.6)', color: T.accent }}><Pencil size={10} /> Mark up</button>
                    {im.labels?.length > 0 && <span className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.6)', color: T.up }}>{im.labels.join(' · ')}</span>}
                  </div>
                  <input style={inputStyle} className="w-full px-2 py-1 text-xs" value={im.tag} onChange={(e) => setTag(im.tmpId, e.target.value)} placeholder="tag (e.g. Before)" />
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: T.dim }}>
          <span>R:R {derivedRR != null ? `1:${fmtN(derivedRR, 1)}` : '—'}</span>
          <span>Held {derivedHold != null ? fmtDuration(derivedHold) || '0m' : '—'}</span>
          <span>P&L {derivedPnl != null ? fmt$(derivedPnl) : '—'}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={submit} className="flex-1 rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>{editing ? 'Update trade' : 'Save trade'}</button>
          {editing && <button type="button" onClick={cancelEdit} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Cancel</button>}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Trade history <span style={{ color: T.faint }}>· {filtered.length === trades.length ? trades.length : `${filtered.length} of ${trades.length}`}</span></span>
            <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Upload size={13} /> Import CSV</button>
          </div>
          {trades.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <div className="relative flex-1">
                <Search size={13} style={{ color: T.faint, position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                <input style={inputStyle} className="w-full rounded pl-7 pr-2 py-1.5 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol, setup, emotion, notes…" />
              </div>
              {[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setOutcome(k)} className="text-xs px-2 py-1 rounded-md" style={{ background: outcome === k ? T.surface2 : 'transparent', color: outcome === k ? T.accent : T.dim, border: `1px solid ${outcome === k ? T.line : 'transparent'}` }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        {trades.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm" style={{ color: T.dim }}>No trades yet. Log your first one — your edge shows up after a handful.</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm" style={{ color: T.dim }}>No trades match your search.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={mono}>
              <thead>
                <tr style={{ color: T.faint }} className="text-xs uppercase tracking-wider">
                  {['Time', 'Symbol', 'Dir', 'P&L', 'Grade', 'R:R', 'Held', 'Setup', 'Emotion', ''].map((h) => <th key={h} className="text-left font-normal px-3 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map((t) => (
                  <tr key={t.id} className="cursor-pointer" style={{ borderTop: `1px solid ${T.line}` }} onDoubleClick={() => onNotes(t)}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: T.dim }}>{t.timestamp}</td>
                    <td className="px-3 py-2 font-semibold">
                      <span className="inline-flex items-center gap-1">{t.symbol}{t.imageCount > 0 && <Paperclip size={12} style={{ color: T.faint }} title={`${t.imageCount} screenshot${t.imageCount === 1 ? '' : 's'}`} />}</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: t.direction === 'Long' ? T.up : T.down }}>{t.direction}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: t.pnl >= 0 ? T.up : T.down }}>{fmt$(t.pnl)}</td>
                    <td className="px-3 py-2"><GradeChip t={t} /></td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.rr ? `1:${fmtN(t.rr, 1)}` : '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{fmtDuration(holdMs(t)) || '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.setup}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.emotion}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => startEdit(t)} title="Edit" style={{ color: T.faint }} className="mr-3"><Pencil size={14} /></button>
                      <button type="button" onClick={() => { if (window.confirm('Delete this trade? This cannot be undone.')) onRemove(t.id) }} title="Delete" style={{ color: T.faint }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 text-xs" style={{ color: T.faint, borderTop: `1px solid ${T.line}` }}>Double-click a row to view its notes &amp; screenshots.</div>
      </div>
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={async (rows) => { await onImport(rows); setImportOpen(false) }} />}
      {annotating && <AnnotateModal src={annotating.dataUrl} onClose={() => setAnnotating(null)} onSave={(dataUrl, labels) => { setImages((p) => p.map((im) => (im.tmpId === annotating.tmpId ? { ...im, dataUrl, labels } : im))); setAnnotating(null) }} />}
    </div>
  )
}

/* ───────── dashboard ───────── */
export function PnlCalendar({ trades }) {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7))
  const dayMap = useMemo(() => {
    const m = {}
    for (const t of trades || []) {
      const d = (t.entryTime || t.timestamp || '').slice(0, 10)
      if (d.slice(0, 7) !== ym) continue
      if (!m[d]) m[d] = { pnl: 0, n: 0 }
      m[d].pnl += Number(t.pnl) || 0; m[d].n += 1
    }
    return m
  }, [trades, ym])
  const [y, mo] = ym.split('-').map(Number)
  const startDow = new Date(y, mo - 1, 1).getDay()
  const days = new Date(y, mo, 0).getDate()
  const vals = Object.values(dayMap)
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v.pnl)))
  const monthPnl = vals.reduce((a, v) => a + v.pnl, 0)
  const greenDays = vals.filter((v) => v.pnl > 0).length
  const redDays = vals.filter((v) => v.pnl < 0).length
  const shift = (delta) => { const d = new Date(y, mo - 1 + delta, 1); setYm(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`) }
  const cellBg = (pnl) => {
    if (pnl == null) return T.surface2
    const a = Math.min(0.85, 0.2 + (Math.abs(pnl) / maxAbs) * 0.6)
    return pnl >= 0 ? `rgba(52,211,153,${a})` : `rgba(251,113,133,${a})`
  }
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push({ d, v: dayMap[`${ym}-${pad2(d)}`] })
  return (
    <Panel title="Calendar" right={
      <div className="flex items-center gap-3 text-sm">
        <span style={{ color: T.faint }}>Net <span style={{ ...mono, color: monthPnl >= 0 ? T.up : T.down }}>{fmt$(monthPnl)}</span> · <span style={{ color: T.up }}>{greenDays}G</span> · <span style={{ color: T.down }}>{redDays}R</span></span>
        <button type="button" onClick={() => shift(-1)} style={{ color: T.dim }}><ChevronLeft size={16} /></button>
        <span className="w-24 text-center">{MONTHS[mo - 1]} {y}</span>
        <button type="button" onClick={() => shift(1)} style={{ color: T.dim }}><ChevronRight size={16} /></button>
      </div>
    }>
      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="text-center text-xs py-1" style={{ color: T.faint }}>{d}</div>)}
        {cells.map((c, i) => c == null ? <div key={i} /> : (
          <div key={i} className="rounded p-1.5 min-h-[54px]" style={{ background: c.v ? cellBg(c.v.pnl) : T.surface2, border: `1px solid ${T.line}` }}>
            <div className="text-xs" style={{ color: c.v ? '#0E1117' : T.faint }}>{c.d}</div>
            {c.v && <div className="text-xs font-semibold leading-tight" style={{ ...mono, color: '#0E1117' }}>{fmt$(c.v.pnl)}</div>}
          </div>
        ))}
      </div>
    </Panel>
  )
}

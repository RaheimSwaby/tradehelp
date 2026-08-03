import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, X, BookMarked, ChevronDown, ChevronUp, ClipboardList, Share2, ImagePlus, Upload } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, downscale, fileToDataUrl } from '../utils.js'
import { PlaybookShareModal } from '../components/PlaybookShareModal.jsx'
import { parsePlaybookImport, MAX_SHARED_IMAGES } from '../playbookShare.js'

const BLANK = { name: '', description: '', criteria: '', invalidation: '', targets: '', notes: '', images: [] }

const FIELDS = [
  { key: 'name',         label: 'Setup name *',    placeholder: 'e.g. VWAP Reclaim',               rows: 1 },
  { key: 'description',  label: 'Description',      placeholder: 'One-line summary of the setup',   rows: 1 },
  { key: 'criteria',     label: 'Entry criteria',   placeholder: 'What conditions must be true',    rows: 2 },
  { key: 'invalidation', label: 'Invalidation',     placeholder: 'What cancels the setup',          rows: 2 },
  { key: 'targets',      label: 'Targets',          placeholder: 'Where you take profit',           rows: 2 },
  { key: 'notes',        label: 'Notes',            placeholder: 'Anything else',                   rows: 2 },
]

function wrColor(wr) {
  if (wr >= 65) return T.up
  if (wr >= 50) return T.accent
  return T.down
}

export function PlaybookTab({ entries, trades, onAdd, onUpdate, onDelete, onPlan }) {
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  // Example charts live on disk. They are cached by image id, which never changes for
  // a stored image, so the cache can't go stale — a re-saved entry simply gets new ids.
  const [shots, setShots] = useState({})
  const [sharing, setSharing] = useState(null)
  const [importNote, setImportNote] = useState('')
  const fileRef = useRef(null)
  const importRef = useRef(null)

  async function ensureImage(id) {
    if (!id) return ''
    if (shots[id] !== undefined) return shots[id]
    const result = await window.api?.getPlaybookImage?.(id).catch(() => null)
    const dataUrl = result?.dataUrl || ''
    setShots((current) => ({ ...current, [id]: dataUrl }))
    return dataUrl
  }

  async function ensureEntryImages(entry) {
    const list = Array.isArray(entry?.images) ? entry.images : []
    return Promise.all(list.map(async (image) => ({ ...image, dataUrl: await ensureImage(image.id) })))
  }

  useEffect(() => {
    const entry = entries.find((e) => e.id === expanded)
    if (entry?.images?.length) ensureEntryImages(entry)
  }, [expanded, entries]) // eslint-disable-line react-hooks/exhaustive-deps

  // An image already saved carries only its id; a freshly picked one carries its data.
  const previewOf = (image) => image?.dataUrl || shots[image?.id] || ''
  const editImages = Array.isArray(editing?.images) ? editing.images : []

  async function addCharts(files) {
    for (const file of [...(files || [])]) {
      if (!file?.type?.startsWith('image/')) continue
      const dataUrl = await downscale(await fileToDataUrl(file))
      // Re-check the cap inside the updater — several files can land in one drop.
      setEditing((current) => {
        const list = Array.isArray(current?.images) ? current.images : []
        if (list.length >= MAX_SHARED_IMAGES) return current
        return { ...current, images: [...list, { dataUrl, tag: '' }] }
      })
    }
  }

  function removeChart(index) {
    setEditing((current) => ({ ...current, images: (current.images || []).filter((_, position) => position !== index) }))
  }

  function startEdit(entry) {
    setEditing({ ...entry, images: (entry.images || []).map((image) => ({ id: image.id, tag: image.tag || '' })) })
    ensureEntryImages(entry)
  }

  async function openShare(entry) {
    const loaded = await ensureEntryImages(entry)
    setSharing({ entry, images: loaded.filter((image) => image.dataUrl) })
  }

  async function importSetup(file) {
    setImportNote('')
    if (!file) return
    const text = await file.text().catch(() => '')
    const result = parsePlaybookImport(text)
    if (!result.ok) { setImportNote(result.error); return }
    // Charts arriving in a shared file get the same downscale as ones picked here —
    // otherwise an import writes full-size images straight to disk while local picks
    // are capped at 1600px webp.
    const images = await Promise.all(
      (result.entry.images || []).map(async (image) => ({ ...image, dataUrl: await downscale(image.dataUrl) }))
    )
    await onAdd({ ...result.entry, images })
    setImportNote(result.droppedScreenshot
      ? `Imported “${result.entry.name}” — some example charts were not a supported image type, so they were left out.`
      : `Imported “${result.entry.name}”.`)
  }

  const setupStats = useMemo(() => {
    const m = {}
    for (const t of trades) {
      const s = (t.setup || '').trim()
      if (!s) continue
      if (!m[s]) m[s] = { wins: 0, total: 0, pnl: 0, trades: [] }
      const pnl = Number(t.pnl) || 0
      m[s].total++
      m[s].pnl += pnl
      if (pnl > 0) m[s].wins++
      m[s].trades.push(t)
    }
    return m
  }, [trades])

  function stats(entry) {
    const s = setupStats[entry.name] || { wins: 0, total: 0, pnl: 0, trades: [] }
    return { ...s, wr: s.total ? (s.wins / s.total) * 100 : null, avg: s.total ? s.pnl / s.total : 0 }
  }

  async function save() {
    if (!editing?.name?.trim()) return
    if (editing.id) await onUpdate(editing)
    else await onAdd(editing)
    setEditing(null)
  }

  const isExpanded = (id) => expanded === id
  const toggle = (id) => setExpanded((p) => (p === id ? null : id))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">My Playbook</h2>
          <p className="text-xs mt-0.5" style={{ color: T.dim }}>
            Document your setups — the app auto-links them to trades by the setup name.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => importRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"
            style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}
            title="Import a setup file shared by another TradeHelp user"
          >
            <Upload size={14} /> Import
          </button>
          <button
            onClick={() => setEditing({ ...BLANK })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: T.accent, color: '#1A1306' }}
          >
            <Plus size={14} /> Add setup
          </button>
          <input
            ref={importRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(ev) => { importSetup(ev.target.files?.[0]); ev.target.value = '' }}
          />
        </div>
      </div>

      {importNote && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" role="status" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}>
          <span className="flex-1">{importNote}</span>
          <button onClick={() => setImportNote('')} style={{ color: T.faint }}><X size={13} /></button>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="py-20 text-center" style={{ color: T.dim }}>
          <BookMarked size={36} className="mx-auto mb-4 opacity-25" />
          <p className="text-sm font-medium">No setups documented yet.</p>
          <p className="text-xs mt-1" style={{ color: T.faint }}>
            Add your first setup to start tracking which strategies actually work.
          </p>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {entries.map((e) => {
          const s = stats(e)
          const open = isExpanded(e.id)
          return (
            <div
              key={e.id}
              className={`rounded-xl overflow-hidden ${open ? '' : 'th-card'}`}
              style={{ background: T.surface, border: `1px solid ${open ? T.accent + '66' : T.line}`, transition: 'border-color .15s' }}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                onClick={() => toggle(e.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{e.name}</span>
                    {s.total > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md font-semibold" style={{ ...mono, background: T.surface2, color: wrColor(s.wr) }}>
                        {fmtN(s.wr, 0)}% WR
                      </span>
                    )}
                  </div>
                  {e.description && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: T.dim }}>{e.description}</p>
                  )}
                </div>
                {s.total > 0 && (
                  <div className="flex items-center gap-4 text-xs shrink-0" style={{ ...mono, color: T.dim }}>
                    <span>{s.total} trade{s.total !== 1 ? 's' : ''}</span>
                    <span style={{ color: s.pnl >= 0 ? T.up : T.down }}>{fmt$(s.avg)}/trade</span>
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0 ml-1">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onPlan?.(e) }}
                    className="p-1 rounded" style={{ color: T.accent }}
                    title="Plan a trade from this setup"
                  ><ClipboardList size={13} /></button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); openShare(e) }}
                    className="p-1 rounded" style={{ color: T.dim }}
                    title="Share this setup"
                  ><Share2 size={13} /></button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); startEdit(e) }}
                    className="p-1 rounded" style={{ color: T.dim }}
                    title="Edit"
                  ><Edit2 size={13} /></button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); if (window.confirm(`Delete "${e.name}"?`)) onDelete(e.id) }}
                    className="p-1 rounded" style={{ color: T.down }}
                    title="Delete"
                  ><Trash2 size={13} /></button>
                  {open ? <ChevronUp size={14} style={{ color: T.dim }} /> : <ChevronDown size={14} style={{ color: T.dim }} />}
                </div>
              </div>

              {/* Expanded detail */}
              {open && (
                <div style={{ borderTop: `1px solid ${T.line}` }}>
                  {/* Example charts */}
                  {e.images?.length > 0 && (
                    <div className={`px-4 pt-3 grid gap-2 ${e.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {e.images.map((image, index) => (
                        <figure key={image.id} className="m-0">
                          <img
                            src={shots[image.id] || ''}
                            alt={image.tag || `${e.name} example ${index + 1}`}
                            className="w-full rounded-lg"
                            style={{ border: `1px solid ${T.line}`, maxHeight: e.images.length === 1 ? 320 : 200, objectFit: 'contain', background: T.surface2 }}
                          />
                          {image.tag && <figcaption className="text-[10px] mt-1" style={{ color: T.faint }}>{image.tag}</figcaption>}
                        </figure>
                      ))}
                    </div>
                  )}

                  {/* Setup rules */}
                  {(e.criteria || e.invalidation || e.targets || e.notes) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-4 py-3">
                      {[
                        { label: 'Entry criteria', value: e.criteria, color: T.accent },
                        { label: 'Invalidation',   value: e.invalidation, color: T.down },
                        { label: 'Targets',        value: e.targets, color: T.up },
                        { label: 'Notes',          value: e.notes, color: T.dim },
                      ].filter((r) => r.value).map((r) => (
                        <div key={r.label} className="rounded-lg px-3 py-2.5" style={{ background: T.surface2 }}>
                          <div className="text-xs font-semibold mb-1" style={{ color: r.color }}>{r.label}</div>
                          <div className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: T.text }}>{r.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Trade list */}
                  <div className="px-4 pb-3">
                    {s.trades.length === 0 ? (
                      <p className="text-xs py-2" style={{ color: T.faint }}>
                        No trades linked yet. Make sure your trade's setup field matches "<strong style={{ color: T.dim }}>{e.name}</strong>" exactly.
                      </p>
                    ) : (
                      <>
                        <div className="text-xs font-semibold mb-2" style={{ color: T.dim }}>Linked trades ({s.trades.length})</div>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {[...s.trades]
                            .sort((a, b) => (b.entryTime || b.timestamp || '').localeCompare(a.entryTime || a.timestamp || ''))
                            .map((t) => {
                              const pnl = Number(t.pnl) || 0
                              return (
                                <div key={t.id} className="flex items-center gap-3 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: T.surface2, ...mono }}>
                                  <span style={{ color: T.faint }}>{(t.entryTime || t.timestamp || '').slice(0, 10)}</span>
                                  <span className="font-semibold" style={{ color: T.text }}>{t.symbol}</span>
                                  <span style={{ color: T.dim }}>{t.direction}</span>
                                  {t.reason && <span style={{ color: T.faint }}>{t.reason}</span>}
                                  <span className="ml-auto font-semibold" style={{ color: pnl >= 0 ? T.up : T.down }}>{fmt$(pnl)}</span>
                                </div>
                              )
                            })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add / Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center p-4 z-50"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-5 space-y-3"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{editing.id ? 'Edit setup' : 'New setup'}</span>
              <button onClick={() => setEditing(null)} style={{ color: T.dim }}><X size={16} /></button>
            </div>
            {FIELDS.map(({ key, label, placeholder, rows }) => (
              <div key={key}>
                <label className="block text-xs mb-1" style={{ color: T.dim }}>{label}</label>
                <textarea
                  value={editing[key] || ''}
                  onChange={(ev) => setEditing((ed) => ({ ...ed, [key]: ev.target.value }))}
                  placeholder={placeholder}
                  rows={rows}
                  className="w-full rounded-lg text-sm px-3 py-2 resize-none outline-none"
                  style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs mb-1" style={{ color: T.dim }}>
                Example charts <span style={{ color: T.faint }}>· {editImages.length}/{MAX_SHARED_IMAGES}</span>
              </label>
              {editImages.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {editImages.map((image, index) => (
                    <div key={image.id || `new-${index}`} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                      <div className="relative">
                        <img src={previewOf(image)} alt="" className="w-full h-20 object-cover" style={{ background: T.surface2 }} />
                        <button
                          onClick={() => removeChart(index)}
                          className="absolute top-1 right-1 rounded p-0.5"
                          style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}
                          title="Remove chart"
                        ><X size={12} /></button>
                      </div>
                      <input
                        value={image.tag || ''}
                        onChange={(ev) => setEditing((ed) => ({
                          ...ed,
                          images: ed.images.map((item, position) => (position === index ? { ...item, tag: ev.target.value } : item))
                        }))}
                        placeholder="label (e.g. A+ example)"
                        className="w-full px-2 py-1 text-xs outline-none"
                        style={{ background: T.surface2, color: T.text, border: 'none' }}
                      />
                    </div>
                  ))}
                </div>
              )}
              {editImages.length < MAX_SHARED_IMAGES && (
                <button
                  onClick={() => fileRef.current?.click()}
                  onDrop={(ev) => { ev.preventDefault(); addCharts(ev.dataTransfer?.files) }}
                  onDragOver={(ev) => ev.preventDefault()}
                  className="w-full rounded-lg px-3 py-3 text-center"
                  style={{ background: T.surface2, border: `1px dashed ${T.line}` }}
                >
                  <ImagePlus size={16} style={{ color: T.accent, display: 'inline', verticalAlign: 'middle' }} />
                  <span className="text-xs ml-2" style={{ color: T.dim }}>
                    {editImages.length ? 'Add another example' : 'Choose or drop chart screenshots'}
                  </span>
                </button>
              )}
              <input
                ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(ev) => { addCharts(ev.target.files); ev.target.value = '' }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-lg py-2 text-sm"
                style={{ border: `1px solid ${T.line}`, color: T.dim }}
              >Cancel</button>
              <button
                onClick={save}
                disabled={!editing.name?.trim()}
                className="flex-1 rounded-lg py-2 text-sm font-semibold"
                style={{ background: T.accent, color: '#1A1306', opacity: editing.name?.trim() ? 1 : 0.5 }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {sharing && (
        <PlaybookShareModal entry={sharing.entry} images={sharing.images} onClose={() => setSharing(null)} />
      )}
    </div>
  )
}

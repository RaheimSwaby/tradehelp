import React, { useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, X, BookMarked, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN } from '../utils.js'

const BLANK = { name: '', description: '', criteria: '', invalidation: '', targets: '', notes: '' }

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
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
          style={{ background: T.accent, color: '#1A1306' }}
        >
          <Plus size={14} /> Add setup
        </button>
      </div>

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
                    onClick={(ev) => { ev.stopPropagation(); setEditing({ ...e }) }}
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
    </div>
  )
}

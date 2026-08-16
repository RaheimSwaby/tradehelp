import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Download, X } from 'lucide-react'
import { T, inputStyle } from '../theme.js'

// Deleting a trade unlinks its screenshots and recordings from disk. The rows
// could be re-imported from a broker; those files cannot be recovered from the
// app at all. So the confirmation names the attachments, not just the trade
// count, and offers a backup before anything is destroyed.

// Above this many trades the confirmation asks the trader to type the word. A
// handful is a correction; a hundred is a decision.
const TYPE_TO_CONFIRM_THRESHOLD = 25

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function describe(summary) {
  if (!summary) return 'Counting…'
  const parts = [plural(summary.trades, 'trade')]
  if (summary.images) parts.push(plural(summary.images, 'screenshot'))
  if (summary.videos) parts.push(plural(summary.videos, 'recording'))
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function ConfirmDelete({ ids, label, onCancel, onDeleted, onConfirmDelete }) {
  const [summary, setSummary] = useState(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [backedUp, setBackedUp] = useState(false)

  useEffect(() => {
    let live = true
    window.api.tradeDeletionSummary(ids)
      .then((s) => { if (live) setSummary(s) })
      .catch(() => { if (live) setSummary({ trades: ids.length, images: 0, videos: 0 }) })
    return () => { live = false }
  }, [ids])

  const needsTyping = ids.length >= TYPE_TO_CONFIRM_THRESHOLD
  const armed = !busy && summary && (!needsTyping || typed.trim().toUpperCase() === 'DELETE')

  async function backup() {
    const res = await window.api.exportData().catch(() => null)
    if (res?.ok) setBackedUp(true)
  }

  async function run() {
    if (!armed) return
    setBusy(true); setError('')
    try {
      await onConfirmDelete(ids)
      onDeleted()
    } catch (e) {
      setBusy(false)
      setError(e?.message || 'The trades could not be deleted.')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl p-5" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} style={{ color: T.down, flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <h3 className="text-base font-semibold" style={{ color: T.text }}>Delete {label}?</h3>
            <p className="text-sm mt-1.5" style={{ color: T.dim }}>
              This removes {describe(summary)}.
            </p>
            {(summary?.images > 0 || summary?.videos > 0) && (
              <p className="text-sm mt-1.5" style={{ color: T.down }}>
                The screenshots and recordings are deleted from your disk and cannot be recovered.
              </p>
            )}
          </div>
          <button type="button" onClick={onCancel} style={{ color: T.faint }}><X size={16} /></button>
        </div>

        <button type="button" onClick={backup} disabled={busy}
          className="mt-4 w-full rounded-md px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-2"
          style={{ background: T.surface2, border: `1px solid ${T.line}`, color: backedUp ? T.up : T.accentText }}>
          <Download size={14} />{backedUp ? 'Backup saved' : 'Back up first'}
        </button>

        {needsTyping && (
          <div className="mt-3">
            <label className="text-xs" style={{ color: T.dim }}>Type DELETE to confirm</label>
            <input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm mt-1"
              value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoFocus />
          </div>
        )}

        {error && <p className="text-xs mt-2" style={{ color: T.down }}>{error}</p>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={busy}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium"
            style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}>Cancel</button>
          <button type="button" onClick={run} disabled={!armed}
            className="flex-1 rounded-md px-3 py-2 text-sm font-semibold"
            style={{ background: T.down, color: '#fff', opacity: armed ? 1 : 0.5 }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function BulkDeleteBar({ selectedIds, matchingIds, onClearSelection, onConfirmDelete }) {
  const [pending, setPending] = useState(null) // { ids, label }

  if (!selectedIds.length) return null

  const all = matchingIds.length
  const selectedAll = selectedIds.length >= all

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-2 mb-2 text-sm"
        style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}>
        <span>{plural(selectedIds.length, 'trade')} selected</span>
        <button type="button" onClick={() => setPending({ ids: selectedIds, label: plural(selectedIds.length, 'trade') })}
          className="rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: T.down, color: '#fff' }}>
          Delete selected
        </button>
        {/* Scoped to the current filter and search, and it spans every page of
            them, so the count is stated rather than implied by what is on screen. */}
        {!selectedAll && all > selectedIds.length && (
          <button type="button" onClick={() => setPending({ ids: matchingIds, label: `all ${all} trades in this view` })}
            className="rounded-md px-2.5 py-1 text-xs font-medium"
            style={{ background: 'transparent', border: `1px solid ${T.line}`, color: T.accentText }}>
            Delete all {all} matching
          </button>
        )}
        <button type="button" onClick={onClearSelection} className="text-xs ml-auto" style={{ color: T.faint }}>Clear</button>
      </div>

      {pending && (
        <ConfirmDelete
          ids={pending.ids}
          label={pending.label}
          onCancel={() => setPending(null)}
          onConfirmDelete={onConfirmDelete}
          onDeleted={() => { setPending(null); onClearSelection() }}
        />
      )}
    </>
  )
}

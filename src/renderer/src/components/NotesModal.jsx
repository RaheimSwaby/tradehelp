import React, { useState, useEffect } from 'react'
import { X, Sparkles, Trash2 } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, holdMs, fmtDuration, toJpeg } from '../utils.js'
import { streamChat } from '../utils.js'
import { GradeChip } from './Shared.jsx'
import { LazyImage } from './LazyImage.jsx'

const VISION_SYSTEM = `You are a trading chart analyst inside a trader's journal. You are shown the screenshot(s) of ONE trade plus its details (symbol, direction, setup, outcome, R:R, emotion). Read the chart: describe the visible price structure (trend, key levels, candle behaviour), then judge whether the entry/exit and the stated setup look clean and consistent with what's on the chart — including any 'Before' vs 'After' images. Some charts may have the trader's OWN markers drawn on them (e.g. Entry, Stop, Target) — treat those as ground truth for where those levels are, rather than guessing from the candles. Finish with ONE concrete, specific thing to repeat or fix next time. Do NOT predict future prices or give buy/sell signals. Keep it under ~160 words, concrete and direct.`

/* ───────── trade detail modal (notes + screenshots) ───────── */
export function NotesModal({ trade, onClose, onUpdate }) {
  const [imgs, setImgs] = useState(null)
  const [zoom, setZoom] = useState(null)
  const [analysis, setAnalysis] = useState(null) // { loading } | { text } | { error }
  const [notes, setNotes] = useState(trade.notes || '')
  const [baseNotes, setBaseNotes] = useState(trade.notes || '')
  const [savedFlash, setSavedFlash] = useState(false)
  const dirty = notes.trim() !== baseNotes.trim()
  async function saveNotes() {
    await onUpdate?.({ ...trade, notes: notes.trim() })
    setBaseNotes(notes.trim()); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800)
  }
  useEffect(() => {
    let live = true
    if (window.api?.listImages) window.api.listImages(trade.id).then((r) => { if (live) setImgs(r) })
    else setImgs([])
    return () => { live = false }
  }, [trade.id])
  async function del(id) { setImgs(await window.api.deleteImage(id)) }

  async function analyze() {
    if (!imgs?.length || analysis?.loading) return
    setAnalysis({ loading: true })
    try {
      // Fetch image data on demand — listImages only returns metadata now
      const fetched = await Promise.all(imgs.map((im) => window.api.getImage(im.id)))
      const withPics = fetched.filter((r) => r?.dataUrl)
      if (!withPics.length) { setAnalysis({ error: 'No image data found on disk.' }); return }
      const jpegs = await Promise.all(withPics.map((i) => toJpeg(i.dataUrl)))
      const ctx = [
        `Trade: ${trade.symbol} ${trade.direction} · setup=${trade.setup || '-'} · outcome=${(Number(trade.pnl) || 0) >= 0 ? 'WIN' : 'LOSS'} (${fmt$(trade.pnl)})`,
        `R:R=${trade.rr ? `1:${fmtN(trade.rr, 1)}` : '-'} · emotion=${trade.emotion || '-'}${trade.reason ? ` · reason=${trade.reason}` : ''}`,
        `Image tags (in order): ${withPics.map((i) => i.tag || 'untagged').join(', ')}`,
        `Trader-marked levels on the chart(s): ${withPics.map((i) => i.caption).filter(Boolean).join('; ') || 'none'}`,
        `Notes: ${trade.notes || '(none)'}`
      ].join('\n')
      let acc = ''
      await streamChat({ system: VISION_SYSTEM, messages: [{ role: 'user', content: `Here is my trade and its chart screenshot(s).\n\n${ctx}`, images: jpegs }] },
        (d) => { acc += d; setAnalysis({ text: acc }) })
    } catch (e) {
      setAnalysis({ error: String(e?.message || e) })
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-full max-w-2xl max-h-[88vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{trade.symbol} · {trade.direction}</div>
            <div className="text-xs" style={{ color: T.dim, ...mono }}>{trade.timestamp} · {fmt$(trade.pnl)} · {trade.setup} · {trade.emotion}</div>
            {(trade.entryTime || trade.exitTime) && (
              <div className="text-xs mt-0.5" style={{ color: T.faint, ...mono }}>
                {trade.entryTime || '—'} → {trade.exitTime || '—'}{holdMs(trade) ? ` · held ${fmtDuration(holdMs(trade))}` : ''}
              </div>
            )}
            <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: T.faint }}>Execution <GradeChip t={trade} /> <span>· {trade.source === 'import' ? 'imported (outcome-based)' : 'process, not outcome'}</span></div>
            {trade.reason && <div className="text-xs mt-1" style={{ color: T.dim }}>Reason: <span style={{ color: T.text }}>{trade.reason}</span></div>}
            {trade.fees > 0 && <div className="text-xs mt-1" style={{ color: T.faint, ...mono }}>Net {fmt$(trade.pnl)} · after {fmt$(trade.fees)} fees · gross {fmt$((Number(trade.pnl) || 0) + (Number(trade.fees) || 0))}</div>}
            {(trade.selfSetup || trade.selfExec) && <div className="text-xs mt-1" style={{ color: T.faint }}>Self-grade · setup <span style={{ color: T.text }}>{trade.selfSetup || '—'}</span> · execution <span style={{ color: T.text }}>{trade.selfExec || '—'}</span></div>}
          </div>
          <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={18} /></button>
        </div>
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: T.faint }}>Notes</div>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
            placeholder="What did you see? What did you feel? Edit anytime…"
            className="w-full rounded px-3 py-2 text-sm"
            style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }} />
          {(dirty || savedFlash) && (
            <div className="flex items-center gap-2 mt-2">
              {dirty && <button type="button" onClick={saveNotes} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save notes</button>}
              {dirty && <button type="button" onClick={() => setNotes(baseNotes)} className="rounded-md px-3 py-1.5 text-xs" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Revert</button>}
              {savedFlash && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
            </div>
          )}
        </div>
        {imgs === null ? (
          <div className="mt-4 text-xs" style={{ color: T.faint }}>Loading screenshots…</div>
        ) : imgs.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>Screenshots</div>
              <button type="button" onClick={analyze} disabled={analysis?.loading}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-semibold"
                style={{ background: T.accent, color: '#1A1306', opacity: analysis?.loading ? 0.6 : 1 }}>
                <Sparkles size={13} /> {analysis?.loading ? 'Analyzing…' : 'Analyze chart'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {imgs.map((im) => (
                <div key={im.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                  <div className="flex items-center justify-between px-2 py-1" style={{ background: T.surface2 }}>
                    <span className="text-xs" style={{ color: T.dim }}>{im.tag || 'untagged'}</span>
                    <button type="button" onClick={() => del(im.id)} title="Delete image" style={{ color: T.faint }}><Trash2 size={13} /></button>
                  </div>
                  <LazyImage id={im.id} tag={im.tag} onZoom={setZoom} />
                </div>
              ))}
            </div>
            {analysis && (
              <div className="mt-3 rounded-lg p-3 text-sm" style={{ background: T.accentSoft, border: `1px solid ${T.line}`, color: '#F3D9A0' }}>
                {analysis.loading ? <span style={{ color: T.accent }}>Reading the chart… local vision models can take a moment.</span>
                  : analysis.error ? <span style={{ color: T.down }}>⚠︎ {analysis.error}</span>
                  : <div className="whitespace-pre-wrap">{analysis.text}</div>}
                {!analysis.loading && <div className="text-xs mt-2" style={{ color: T.faint }}>AI chart read · not financial advice</div>}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {zoom && (
        <div className="fixed inset-0 flex items-center justify-center p-6 z-[70]" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setZoom(null)}>
          <img src={zoom} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { X, Pencil, Minus, Square, ArrowUpRight, Undo2, Eraser } from 'lucide-react'
import { T } from '../theme.js'
import { loadImg } from '../utils.js'

const COLORS = ['#FB7185', '#34D399', '#F5B642', '#38BDF8', '#E6EAF2']
const LABELS = ['Entry', 'Stop', 'Target', 'Note']
const LABEL_COLOR = { Entry: '#38BDF8', Stop: '#FB7185', Target: '#34D399', Note: '#F5B642' }
const isMarker = (t) => LABELS.includes(t)

/* ───────── chart markup: freehand drawing + labeled Entry/Stop/Target markers ─────────
   Flattens annotations onto the image and reports which labels were placed, so the
   vision AI gets the markers both visually and as reliable text. */
export function AnnotateModal({ src, onSave, onClose }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const shapesRef = useRef([]) // committed shapes
  const draftRef = useRef(null) // in-progress shape
  const drawingRef = useRef(false)
  const [tool, setTool] = useState('pen') // pen | line | rect | arrow | Entry | Stop | Target | Note
  const [color, setColor] = useState('#FB7185')

  const drawArrow = (ctx, a, b, col) => {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    const ang = Math.atan2(b.y - a.y, b.x - a.x), h = 13
    ctx.beginPath(); ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - h * Math.cos(ang - Math.PI / 6), b.y - h * Math.sin(ang - Math.PI / 6))
    ctx.lineTo(b.x - h * Math.cos(ang + Math.PI / 6), b.y - h * Math.sin(ang + Math.PI / 6))
    ctx.closePath(); ctx.fill()
  }
  const drawMarker = (ctx, m) => {
    const col = LABEL_COLOR[m.label] || m.color
    ctx.fillStyle = col; ctx.strokeStyle = '#0E1117'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif'
    const tw = ctx.measureText(m.label).width, px = m.x + 11, py = m.y - 8
    ctx.fillStyle = 'rgba(14,17,23,0.85)'; ctx.fillRect(px - 4, py - 14, tw + 8, 19)
    ctx.fillStyle = col; ctx.fillText(m.label, px, py)
  }
  const drawShape = (ctx, s) => {
    if (s.type === 'marker') return drawMarker(ctx, s)
    ctx.strokeStyle = s.color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    if (s.type === 'pen') { ctx.beginPath(); s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke() }
    else if (s.type === 'line') { ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke() }
    else if (s.type === 'rect') ctx.strokeRect(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y))
    else if (s.type === 'arrow') drawArrow(ctx, s.a, s.b, s.color)
  }
  const redraw = useCallback(() => {
    const c = canvasRef.current; if (!c || !imgRef.current) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(imgRef.current, 0, 0, c.width, c.height)
    for (const s of shapesRef.current) drawShape(ctx, s)
    if (draftRef.current) drawShape(ctx, draftRef.current)
  }, [])

  useEffect(() => {
    let live = true
    loadImg(src).then((img) => {
      if (!live) return
      imgRef.current = img
      const maxW = Math.min(1100, window.innerWidth - 80), maxH = window.innerHeight * 0.6
      const scale = Math.min(maxW / img.width, maxH / img.height, 1.5)
      const c = canvasRef.current
      if (c) { c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale) }
      redraw()
    })
    return () => { live = false }
  }, [src, redraw])

  const pos = (e) => {
    const c = canvasRef.current, r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const down = (e) => {
    const p = pos(e)
    if (isMarker(tool)) { shapesRef.current.push({ type: 'marker', label: tool, x: p.x, y: p.y, color }); redraw(); return }
    drawingRef.current = true
    draftRef.current = tool === 'pen' ? { type: 'pen', color, points: [p] } : { type: tool, color, a: p, b: p }
  }
  const move = (e) => {
    if (!drawingRef.current) return
    const p = pos(e)
    if (draftRef.current.type === 'pen') draftRef.current.points.push(p)
    else draftRef.current.b = p
    redraw()
  }
  const up = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (draftRef.current) { shapesRef.current.push(draftRef.current); draftRef.current = null }
    redraw()
  }
  const undo = () => { shapesRef.current.pop(); redraw() }
  const clearAll = () => { shapesRef.current = []; draftRef.current = null; redraw() }
  const save = () => {
    const c = canvasRef.current; if (!c) return
    const labels = [...new Set(shapesRef.current.filter((s) => s.type === 'marker').map((s) => s.label))]
    onSave(c.toDataURL('image/webp', 0.85), labels)
  }

  const TOOLS = [['pen', 'Pen', Pencil], ['line', 'Line', Minus], ['rect', 'Box', Square], ['arrow', 'Arrow', ArrowUpRight]]
  const btn = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
    background: active ? T.accentSoft : T.surface2, color: active ? T.accent : T.dim, border: `1px solid ${active ? T.accent : T.line}`
  })

  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[80]" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="rounded-xl p-4 max-w-[95vw] max-h-[92vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Mark up chart</div>
          <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {TOOLS.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTool(k)} style={btn(tool === k)}><Icon size={13} /> {label}</button>
          ))}
          <span style={{ width: 1, height: 18, background: T.line, margin: '0 4px' }} />
          {LABELS.map((l) => (
            <button key={l} type="button" onClick={() => setTool(l)} style={btn(tool === l)}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: LABEL_COLOR[l], display: 'inline-block' }} /> {l}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: T.faint }}>Color</span>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} title={c}
              style={{ width: 20, height: 20, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? `2px solid ${T.text}` : `1px solid ${T.line}` }} />
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={undo} style={btn(false)}><Undo2 size={13} /> Undo</button>
          <button type="button" onClick={clearAll} style={btn(false)}><Eraser size={13} /> Clear</button>
        </div>

        <canvas
          ref={canvasRef}
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          style={{ display: 'block', maxWidth: '100%', borderRadius: 8, border: `1px solid ${T.line}`, cursor: 'crosshair', touchAction: 'none' }}
        />

        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="text-xs" style={{ color: T.faint }}>Drop Entry / Stop / Target markers so the AI knows exactly what you traded.</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Cancel</button>
            <button type="button" onClick={save} className="rounded-md px-4 py-1.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save markup</button>
          </div>
        </div>
      </div>
    </div>
  )
}

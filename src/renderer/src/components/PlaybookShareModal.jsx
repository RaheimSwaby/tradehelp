import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Copy, FileJson } from 'lucide-react'
import { T } from '../theme.js'
import { buildPlaybookExport, drawPlaybookCard, playbookShareFilename } from '../playbookShare.js'

const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

function loadImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(null)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

function saveFile(href, filename) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
}

export function PlaybookShareModal({ entry, images = [], onClose }) {
  const canvasRef = useRef(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all(images.map((image) => loadImage(image.dataUrl))).then((loaded) => {
      if (alive && canvasRef.current) drawPlaybookCard(canvasRef.current, entry, loaded.filter(Boolean), T.accent)
    })
    return () => { alive = false }
  }, [entry, images])

  function downloadPng() {
    if (!canvasRef.current) return
    saveFile(canvasRef.current.toDataURL('image/png'), playbookShareFilename(entry.name, 'png'))
    setStatus('PNG downloaded')
  }

  async function copyPng() {
    try {
      const blob = await canvasBlob(canvasRef.current)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setStatus('Card copied to clipboard')
    } catch {
      setStatus('Copying failed — use Download PNG instead.')
    }
  }

  function exportJson() {
    const payload = buildPlaybookExport(entry, images)
    const href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`
    saveFile(href, playbookShareFilename(entry.name))
    setStatus('Setup file saved — send it to another TradeHelp user to import.')
  }

  return createPortal(
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[70]"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md p-5 space-y-3" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Share “{entry.name}”</span>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.dim }}><X size={16} /></button>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          <canvas ref={canvasRef} className="w-full block" style={{ aspectRatio: '1080 / 1350' }} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={downloadPng} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
            <Download size={14} /> Download PNG
          </button>
          <button type="button" onClick={copyPng} className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
            <Copy size={14} /> Copy card
          </button>
        </div>
        <button type="button" onClick={exportJson} className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}>
          <FileJson size={14} /> Export setup file (.json)
        </button>

        <p className="text-[11px]" style={{ color: T.faint }}>
          The PNG is for posting. The .json keeps your criteria, invalidation, targets and example charts so another TradeHelp user can import the setup directly.
        </p>
        {status && <div className="text-xs" style={{ color: T.dim }}>{status}</div>}
      </div>
    </div>,
    document.body
  )
}

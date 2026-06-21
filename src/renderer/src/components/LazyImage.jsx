import React, { useState, useEffect } from 'react'
import { T } from '../theme.js'

/* ───────── lazy image: fetches its own data URL on mount so listImages stays fast ───────── */
export function LazyImage({ id, tag, onZoom }) {
  const [src, setSrc] = useState(null) // null = loading, '' = missing
  useEffect(() => {
    let live = true
    window.api?.getImage(id).then((r) => { if (live) setSrc(r?.dataUrl || '') }).catch(() => { if (live) setSrc('') })
    return () => { live = false }
  }, [id])
  if (src === null) return <div className="py-8 text-center text-xs" style={{ color: T.faint }}>Loading…</div>
  if (!src) return <div className="py-8 text-center text-xs" style={{ color: T.faint }}>Image missing</div>
  return (
    <img src={src} alt={tag} className="w-full cursor-zoom-in"
      style={{ maxHeight: 320, objectFit: 'contain', background: '#000' }}
      onClick={() => onZoom(src)} />
  )
}

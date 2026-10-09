import React, { useEffect, useRef, useState } from 'react'
import { coachPhotoTrades, listCoachPhotos, loadCoachPhoto } from '../coachTradePhotos.js'

function TradePhoto({ source, trade, onOpenTrade }) {
  const container = useRef(null)
  const dialog = useRef(null)
  const [visible, setVisible] = useState(false)
  const [photos, setPhotos] = useState(null)
  const [index, setIndex] = useState(0)
  const [image, setImage] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const selected = photos?.[index]
  useEffect(() => {
    if (!globalThis.IntersectionObserver) { setVisible(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let live = true
    setPhotos(null); setImage(null); setError('')
    listCoachPhotos(window.api, trade.id).then((rows) => { if (live) { setIndex((current) => Math.min(current, Math.max(0, rows.length - 1))); setPhotos(rows) } })
      .catch((e) => { if (live) setError(e.message || 'Could not load screenshots.') })
    return () => { live = false }
  }, [visible, trade.id, trade.imageCount, retry])
  useEffect(() => {
    if (!selected) return
    let live = true
    setImage(null); setError('')
    loadCoachPhoto(window.api, trade.id, selected.id).then((src) => { if (live) setImage({ id: selected.id, src }) })
      .catch((e) => { if (live) setError(e.message || 'Could not load screenshot.') })
    return () => { live = false }
  }, [trade.id, selected])
  const src = image?.id === selected?.id ? image?.src : null
  const label = `[${source.key}] ${source.label}`
  const alt = `${label}: ${selected?.tag || 'Trade screenshot'}`
  return <figure ref={container} className="th-coach-photo">
    <figcaption>
      <strong>{label}</strong>
      <button type="button" disabled={!onOpenTrade} onClick={() => onOpenTrade?.(trade)}>Open trade</button>
    </figcaption>
    {error ? <p role="status">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>
      : photos?.length === 0 ? <p>No screenshots remain attached to this trade.</p>
        : src ? <button type="button" className="th-coach-photo-preview" aria-label={`Enlarge ${alt}`} onClick={() => dialog.current?.showModal()}>
          <img src={src} alt={alt} loading="lazy" onError={() => setError('Could not display this screenshot. Open the trade to check the attachment.')} />
        </button> : <p role="status">Loading trade screenshot...</p>}
    {selected && <div className="th-coach-photo-controls">
      <span>{selected.tag || 'Screenshot'} · {index + 1} of {photos.length}</span>
      {photos.length > 1 && <><button type="button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>Previous</button><button type="button" disabled={index === photos.length - 1} onClick={() => setIndex((value) => value + 1)}>Next</button></>}
    </div>}
    {selected?.caption && <p className="th-coach-photo-caption">{selected.caption}</p>}
    <dialog ref={dialog} className="th-coach-photo-dialog" aria-label={alt} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close() }}>
      <button type="button" autoFocus onClick={() => dialog.current.close()}>Close screenshot</button>
      {src && <img src={src} alt={alt} />}
      <p>{label}{selected?.tag ? ` · ${selected.tag}` : ''}</p>
    </dialog>
  </figure>
}

export function CoachTradePhotos({ message, trades, onOpenTrade }) {
  const [limit, setLimit] = useState(3)
  const entries = coachPhotoTrades(message, trades)
  if (!entries.length) return null
  return <section className="th-coach-photos" aria-label="Screenshots from cited trades">
    <p className="th-coach-photo-disclaimer">Screenshots from cited trades. Shown from your device, not sent to or analysed by the coach.</p>
    {entries.slice(0, limit).map(({ source, trade }) => <TradePhoto key={String(trade.id)} source={source} trade={trade} onOpenTrade={onOpenTrade} />)}
    {entries.length > limit && <button type="button" onClick={() => setLimit((value) => value + 3)}>Show more cited trades ({entries.length - limit})</button>}
  </section>
}

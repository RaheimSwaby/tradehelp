import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, Image as ImageIcon, ShieldCheck } from 'lucide-react'
import { T, inputStyle, mono } from '../theme.js'
import { dHashDataUrl, dHashSimilarity, IMAGE_FINGERPRINT_VERSION } from '../workflow.js'
import { Panel } from './Shared.jsx'

const MAX_RESULTS = 16

function dateLabel(value) {
  const text = String(value || '')
  if (!text) return 'No date'
  const date = new Date(text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? text.slice(0, 10) : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function inSmallBatches(rows, size, worker) {
  for (let index = 0; index < rows.length; index += size) {
    await Promise.all(rows.slice(index, index + size).map(worker))
  }
}

function recordLabel(record) {
  return `${record.trade?.symbol || 'Trade'} · ${dateLabel(record.trade?.entryTime || record.trade?.timestamp)}${record.tag ? ` · ${record.tag}` : ''}`
}

function hasCurrentFingerprint(record) {
  return /^[0-9a-f]{16}$/i.test(String(record?.fingerprint || '')) && Number(record?.fingerprintVersion) === IMAGE_FINGERPRINT_VERSION
}

export function SimilarCharts({ trades = [], onOpenTrade }) {
  const [records, setRecords] = useState([])
  const [queryId, setQueryId] = useState('')
  const [threshold, setThreshold] = useState(75)
  const [progress, setProgress] = useState({ stage: 'idle', done: 0, total: 0 })
  const [failures, setFailures] = useState([])
  const [imageUrls, setImageUrls] = useState({})
  const thumbnailAttempts = useRef(new Set())

  useEffect(() => {
    let live = true
    const candidates = trades.filter((trade) => (Number(trade.imageCount) || 0) > 0)
    setRecords([])
    setFailures([])
    setImageUrls({})
    setQueryId('')
    thumbnailAttempts.current = new Set()

    async function load() {
      if (!window.api?.listImages || !window.api?.getImage || !window.api?.updateImageFingerprint) {
        setProgress({ stage: 'unavailable', done: 0, total: 0 })
        return
      }
      const discovered = []
      const discoveryFailures = []
      let discoveredCount = 0
      setProgress({ stage: 'discovering', done: 0, total: candidates.length })
      await inSmallBatches(candidates, 3, async (trade) => {
        try {
          const metadata = await window.api.listImages(trade.id)
          for (const image of metadata || []) discovered.push({ ...image, trade })
        } catch (error) {
          discoveryFailures.push({ id: `trade-${trade.id}`, label: `${trade.symbol || 'Trade'} metadata`, error: error?.message || 'Could not list screenshots' })
        } finally {
          discoveredCount += 1
          if (live) setProgress({ stage: 'discovering', done: discoveredCount, total: candidates.length })
        }
      })
      if (!live) return
      discovered.sort((a, b) => String(a.trade?.timestamp || '').localeCompare(String(b.trade?.timestamp || '')) || String(a.id).localeCompare(String(b.id)))
      setRecords(discovered)
      setFailures(discoveryFailures)

      const stale = discovered.filter((record) => !hasCurrentFingerprint(record))
      if (!stale.length) {
        setProgress({ stage: 'done', done: discovered.length, total: discovered.length })
        return
      }
      let completed = 0
      const next = [...discovered]
      setProgress({ stage: 'fingerprinting', done: 0, total: stale.length })
      await inSmallBatches(stale, 2, async (record) => {
        try {
          const image = await window.api.getImage(record.id)
          if (!image?.dataUrl) throw new Error('Screenshot file is unavailable')
          const fingerprint = await dHashDataUrl(image.dataUrl)
          await window.api.updateImageFingerprint(record.id, fingerprint, IMAGE_FINGERPRINT_VERSION)
          const position = next.findIndex((item) => String(item.id) === String(record.id))
          if (position >= 0) next[position] = { ...next[position], fingerprint, fingerprintVersion: IMAGE_FINGERPRINT_VERSION }
        } catch (error) {
          if (live) setFailures((current) => [...current, { id: record.id, label: recordLabel(record), error: error?.message || 'Fingerprint failed' }])
        } finally {
          completed += 1
          if (live) {
            setRecords([...next])
            setProgress({ stage: 'fingerprinting', done: completed, total: stale.length })
          }
        }
      })
      if (live) setProgress({ stage: 'done', done: discovered.length, total: discovered.length })
    }

    load().catch((error) => {
      if (live) {
        setFailures([{ id: 'load', label: 'Screenshot scan', error: error?.message || 'Could not scan screenshots' }])
        setProgress({ stage: 'done', done: 0, total: 0 })
      }
    })
    return () => { live = false }
  }, [trades])

  const readyRecords = useMemo(
    () => records.filter(hasCurrentFingerprint),
    [records]
  )
  useEffect(() => {
    if (readyRecords.some((record) => String(record.id) === String(queryId))) return
    setQueryId(readyRecords[0]?.id || '')
  }, [readyRecords, queryId])

  const query = readyRecords.find((record) => String(record.id) === String(queryId)) || null
  const allMatches = useMemo(() => {
    if (!query) return []
    return readyRecords
      .filter((record) => String(record.tradeId) !== String(query.tradeId))
      .map((record) => ({ ...record, similarity: dHashSimilarity(query.fingerprint, record.fingerprint) }))
      .sort((a, b) => b.similarity - a.similarity || String(a.id).localeCompare(String(b.id)))
  }, [query, readyRecords])
  const matches = useMemo(() => allMatches.filter((record) => record.similarity >= threshold).slice(0, MAX_RESULTS), [allMatches, threshold])

  useEffect(() => {
    let live = true
    const wanted = [query, ...matches].filter(Boolean)
    async function loadNeededThumbnails() {
      await inSmallBatches(wanted, 3, async (record) => {
        if (imageUrls[record.id] || thumbnailAttempts.current.has(String(record.id))) return
        thumbnailAttempts.current.add(String(record.id))
        try {
          const image = await window.api.getImage(record.id)
          if (!image?.dataUrl) throw new Error('Screenshot file is unavailable')
          if (live) setImageUrls((current) => ({ ...current, [record.id]: image.dataUrl }))
        } catch (error) {
          if (live) setFailures((current) => current.some((failure) => String(failure.id) === String(record.id))
            ? current
            : [...current, { id: record.id, label: recordLabel(record), error: error?.message || 'Thumbnail failed' }])
        }
      })
    }
    if (window.api?.getImage) loadNeededThumbnails()
    return () => { live = false }
  }, [query, matches, imageUrls])

  const tradeCount = new Set(records.map((record) => String(record.tradeId))).size
  const progressText = progress.stage === 'discovering'
    ? `Finding screenshots ${progress.done}/${progress.total}…`
    : progress.stage === 'fingerprinting'
      ? `Building local fingerprints ${progress.done}/${progress.total}…`
      : progress.stage === 'unavailable'
        ? 'Local image APIs are unavailable.'
        : `${readyRecords.length}/${records.length} screenshots ready`

  return (
    <Panel title="Similar charts">
      <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
        <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: T.up }} />
        <div className="text-xs" style={{ color: T.dim }}>
          <strong style={{ color: T.text }}>Matching stays on-device.</strong> It compares screenshot visual shape with a compact local fingerprint—not market meaning, trade quality, or future direction. No AI API is used.
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <label className="text-xs grow min-w-[220px]" style={{ color: T.dim }}>Query screenshot
          <select className="block w-full rounded-md px-2 py-2 mt-1 text-sm" style={inputStyle} value={queryId} onChange={(event) => setQueryId(event.target.value)} disabled={!readyRecords.length}>
            {!readyRecords.length && <option value="">No fingerprinted screenshots yet</option>}
            {readyRecords.map((record) => <option key={record.id} value={record.id}>{recordLabel(record)}</option>)}
          </select>
        </label>
        <label className="text-xs min-w-[190px]" style={{ color: T.dim }}>Minimum similarity: <strong style={{ ...mono, color: T.text }}>{threshold}%</strong>
          <input type="range" min="50" max="100" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="block w-full mt-2" style={{ accentColor: T.accent }} />
        </label>
        <div className="text-xs pb-2" style={{ color: T.faint }}>{progressText}</div>
      </div>

      {query && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-start">
          <div className="rounded-lg overflow-hidden" style={{ background: '#000', border: `1px solid ${T.accent}` }}>
            {imageUrls[query.id]
              ? <img src={imageUrls[query.id]} alt="Query chart" className="w-full object-cover" style={{ height: 104 }} />
              : <div className="h-[104px] flex items-center justify-center"><ImageIcon size={20} style={{ color: T.faint }} /></div>}
            <div className="px-2 py-1.5 text-[10px] truncate" style={{ background: T.surface2, color: T.dim }}>{recordLabel(query)}</div>
          </div>
          <div className="text-xs rounded-lg p-3" style={{ color: T.dim, background: T.surface2, border: `1px solid ${T.line}` }}>
            <div className="font-semibold" style={{ color: T.text }}>Cross-trade comparison only</div>
            Screenshots attached to this query’s trade are excluded. Results are sorted by highest visual similarity, with image ID as the stable tie-break.
          </div>
        </div>
      )}

      {records.length === 0 && progress.stage !== 'discovering' ? (
        <div className="py-8 text-center text-sm" style={{ color: T.dim }}>Attach screenshots to trades to build visual matches. Screenshots from at least two different trades are needed.</div>
      ) : tradeCount < 2 && progress.stage === 'done' ? (
        <div className="py-8 text-center text-sm" style={{ color: T.dim }}>Add a screenshot to another trade. Similarity intentionally does not compare screenshots from the same trade.</div>
      ) : query && allMatches.length === 0 && progress.stage === 'done' ? (
        <div className="py-8 text-center text-sm" style={{ color: T.dim }}>No fingerprinted screenshots from other trades are available yet.</div>
      ) : query && matches.length === 0 && progress.stage === 'done' ? (
        <div className="py-8 text-center text-sm" style={{ color: T.dim }}>No cross-trade screenshots meet {threshold}%. Lower the threshold to broaden the visual match.</div>
      ) : matches.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {matches.map((record) => (
            <div key={record.id} className="rounded-lg overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              {imageUrls[record.id]
                ? <img src={imageUrls[record.id]} alt={`${record.trade?.symbol || 'Trade'} chart`} className="w-full object-cover" style={{ height: 118, background: '#000' }} />
                : <div className="h-[118px] flex items-center justify-center" style={{ background: '#000' }}><ImageIcon size={20} style={{ color: T.faint }} /></div>}
              <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{record.trade?.symbol || 'Trade'}</span>
                  <span className="text-xs font-semibold" style={{ ...mono, color: T.accent }}>{record.similarity.toFixed(1)}%</span>
                </div>
                <div className="text-[10px] truncate mt-0.5" style={{ color: T.dim }}>{dateLabel(record.trade?.entryTime || record.trade?.timestamp)}{record.tag ? ` · ${record.tag}` : ''}</div>
                <button type="button" onClick={() => onOpenTrade?.(record.trade)} className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color: T.accent }}>
                  <ExternalLink size={12} /> Open trade
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {failures.length > 0 && (
        <div className="mt-4 rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: T.down }}><AlertTriangle size={13} /> {failures.length} screenshot{failures.length === 1 ? '' : 's'} could not be processed</div>
          <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
            {failures.map((failure) => <div key={`${failure.id}-${failure.error}`} className="text-[10px]" style={{ color: T.faint }}><span style={{ color: T.dim }}>{failure.label}:</span> {failure.error}</div>)}
          </div>
        </div>
      )}
    </Panel>
  )
}

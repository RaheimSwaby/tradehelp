import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2, Upload, Paperclip, X, Pencil, ImagePlus, Video, ChevronLeft, ChevronRight, Search, CalendarOff, Check, Coffee, Bookmark, ArrowUp, ArrowDown } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, nowLocalInput, parseLocal, holdMs, fmtDuration, EMOTIONS, SETUPS, WIN_REASONS, LOSS_REASONS, SELF_GRADES, pad2, MONTHS, downscale, fileToDataUrl } from '../utils.js'
import { Field, Panel, GradeChip } from '../components/Shared.jsx'
import { ImportModal } from '../widgets/ImportModal.jsx'
import { AnnotateModal } from '../components/AnnotateModal.jsx'
import { matchesJournalFilters, parseJournalQuery } from '../journalSearch.js'
import { averageCostFillPreview, selectInstrumentProfile, synthesizeTradeFills } from '../workflow.js'

const NO_TRADE_REASONS = [
  'Followed my rules — no clean setup',
  'No setups / quiet market',
  'Missed it — hesitated or distracted',
  'Was unavailable / busy',
  'Rules kept me out (news, lockout)',
  'Other'
]

function parseList(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }
function formatFileSize(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
function attachmentCount(trade) { return (Number(trade.imageCount) || 0) + (Number(trade.videoCount) || 0) }
function attachmentTitle(trade) {
  const parts = []
  if (Number(trade.imageCount) > 0) parts.push(`${trade.imageCount} screenshot${Number(trade.imageCount) === 1 ? '' : 's'}`)
  if (Number(trade.videoCount) > 0) parts.push(`${trade.videoCount} recording${Number(trade.videoCount) === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/* ───────── journal ───────── */
export function Journal({ trades, onAdd, onUpdate, onRemove, onNotes, onImport, accounts = [], profiles = [], savedSearches = [], onAddSavedSearch, onUpdateSavedSearch, onDeleteSavedSearch, onRefreshSavedSearches, settings, onSaveSettings, dayLogs = [], onAddDayLog, onDeleteDayLog }) {
  const blank = { symbol: '', direction: 'Long', entry: '', exit: '', stop: '', target: '', size: '', riskAmount: '', pnl: '', fees: '', emotion: 'Neutral', setup: 'Pullback', notes: '', entryTime: nowLocalInput(), exitTime: nowLocalInput(), reason: '', account: '', selfSetup: '', selfExec: '' }
  const [f, setF] = useState(blank)
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [annotating, setAnnotating] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [dismissedSearchFilters, setDismissedSearchFilters] = useState([])
  const [outcome, setOutcome] = useState('all') // all | win | loss
  const [selectedSearchId, setSelectedSearchId] = useState('')
  const [searchName, setSearchName] = useState('')
  const [searchError, setSearchError] = useState('')
  const [fillsEnabled, setFillsEnabled] = useState(false)
  const [fills, setFills] = useState([])
  const [fillProfileId, setFillProfileId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileRef = useRef(null)
  const submittingRef = useRef(false)
  const videosRef = useRef([])

  useEffect(() => { videosRef.current = videos }, [videos])
  useEffect(() => () => {
    const tokens = videosRef.current.map((video) => video.token).filter(Boolean)
    if (tokens.length) Promise.resolve(window.api?.discardPickedTradeVideos?.(tokens)).catch(() => {})
  }, [])

  // Simple journal mode + custom lists are persisted in settings.
  const simple = settings?.simpleJournal === 'true'
  // Editing an existing trade always shows the full form, even in simple mode.
  const compact = simple && !editing
  const customEmotions = useMemo(() => parseList(settings?.customEmotions), [settings])
  const customSetups = useMemo(() => parseList(settings?.customSetups), [settings])
  const allEmotions = useMemo(() => [...EMOTIONS, ...customEmotions], [customEmotions])
  const [addingEmotion, setAddingEmotion] = useState(false)
  const [newEmotion, setNewEmotion] = useState('')
  const [addingSetup, setAddingSetup] = useState(false)
  const [newSetup, setNewSetup] = useState('')
  const [noTradeOpen, setNoTradeOpen] = useState(false)

  // Deleting is deferred while the undo toast is up — the DB delete unlinks
  // screenshots and recordings, so committing early would make undo lossy.
  const [pendingDelete, setPendingDelete] = useState(null) // { id, symbol }
  const deleteTimerRef = useRef(null)
  const pendingRef = useRef(null)
  function requestDelete(t) {
    if (pendingRef.current) commitDelete() // a second delete flushes the first
    pendingRef.current = t.id
    setPendingDelete({ id: t.id, symbol: t.symbol })
    deleteTimerRef.current = setTimeout(commitDelete, 6000)
  }
  function commitDelete() {
    clearTimeout(deleteTimerRef.current)
    if (pendingRef.current) onRemove(pendingRef.current)
    pendingRef.current = null
    setPendingDelete(null)
  }
  function undoDelete() {
    clearTimeout(deleteTimerRef.current)
    pendingRef.current = null
    setPendingDelete(null)
  }
  // Leaving the tab (unmount) commits any pending delete so it isn't lost.
  useEffect(() => () => { if (pendingRef.current) { clearTimeout(deleteTimerRef.current); onRemove(pendingRef.current) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSimple() { onSaveSettings?.({ simpleJournal: simple ? 'false' : 'true' }) }

  function addEmotion() {
    const v = newEmotion.trim()
    if (!v) return
    if (!allEmotions.includes(v)) onSaveSettings?.({ customEmotions: JSON.stringify([...customEmotions, v]) })
    setF((p) => ({ ...p, emotion: v }))
    setNewEmotion(''); setAddingEmotion(false)
  }
  function addSetup() {
    const v = newSetup.trim()
    if (!v) return
    if (![...SETUPS, ...customSetups].includes(v)) onSaveSettings?.({ customSetups: JSON.stringify([...customSetups, v]) })
    setF((p) => ({ ...p, setup: v }))
    setNewSetup(''); setAddingSetup(false)
  }

  const parsedSearch = useMemo(() => parseJournalQuery(query, { trades, accounts }), [query, trades, accounts])
  const activeSearchFilters = useMemo(() => {
    const dismissed = new Set(dismissedSearchFilters)
    return parsedSearch.filters.filter((filter) => !dismissed.has(filter.id))
  }, [parsedSearch, dismissedSearchFilters])

  function changeSearch(value) {
    setQuery(value)
    setDismissedSearchFilters([])
    setSelectedSearchId('')
    setSearchError('')
  }
  function dismissSearchFilter(id) {
    setDismissedSearchFilters((current) => current.includes(id) ? current : [...current, id])
  }
  function clearSearch() {
    setQuery('')
    setDismissedSearchFilters([])
    setOutcome('all')
    setSelectedSearchId('')
  }
  function applySavedSearch(id) {
    const saved = savedSearches.find((search) => String(search.id) === String(id))
    setSelectedSearchId(id)
    setSearchError('')
    if (!saved) return
    setSearchName(saved.name || '')
    setQuery(saved.query || '')
    setOutcome(['all', 'win', 'loss'].includes(saved.outcome) ? saved.outcome : 'all')
    setDismissedSearchFilters(Array.isArray(saved.dismissedFilterIds) ? saved.dismissedFilterIds : [])
  }
  async function saveCurrentSearch(update = false) {
    const name = searchName.trim()
    if (!name || !query.trim()) { setSearchError('Enter a name and a search query first.'); return }
    setSearchError('')
    const payload = { name, query, outcome, dismissedFilterIds: dismissedSearchFilters }
    try {
      if (update && selectedSearchId) await onUpdateSavedSearch?.({ ...payload, id: selectedSearchId })
      else {
        const next = await onAddSavedSearch?.(payload)
        const added = next?.filter((search) => search.name === name).slice(-1)[0]
        if (added) setSelectedSearchId(added.id)
      }
    } catch (error) { setSearchError(error?.message || 'Saved search could not be stored.') }
  }
  async function removeSavedSearch() {
    if (!selectedSearchId) return
    try {
      await onDeleteSavedSearch?.(selectedSearchId)
      setSelectedSearchId(''); setSearchName('')
    } catch (error) { setSearchError(error?.message || 'Saved search could not be deleted.') }
  }

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (pendingDelete && t.id === pendingDelete.id) return false
      const pnl = Number(t.pnl) || 0
      if (outcome === 'win' && pnl <= 0) return false
      if (outcome === 'loss' && pnl >= 0) return false
      return matchesJournalFilters(t, activeSearchFilters)
    })
  }, [trades, activeSearchFilters, outcome, pendingDelete])

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const ordered = useMemo(() => [...filtered].reverse(), [filtered]) // newest first
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = ordered.slice(safePage * pageSize, safePage * pageSize + pageSize)
  useEffect(() => { setPage(0) }, [query, outcome, pageSize, dismissedSearchFilters])

  function startEdit(t) {
    discardPendingVideos()
    setEditing(t)
    setImages([])
    const existingFills = Array.isArray(t.fills) ? t.fills.map((fill, index) => ({ ...fill, filledAt: String(fill.filledAt || '').replace(' ', 'T'), sequence: index })) : []
    setFills(existingFills)
    setFillsEnabled(existingFills.length > 0)
    setFillProfileId(selectInstrumentProfile(profiles, t.symbol)?.id || '')
    setF({
      symbol: t.symbol || '', direction: t.direction || 'Long',
      entry: String(t.entry ?? ''), exit: String(t.exit ?? ''), stop: String(t.stop ?? ''), target: String(t.target ?? ''),
      size: String(t.size ?? ''), riskAmount: String(t.riskAmount ?? ''),
      pnl: String((Number(t.pnl) || 0) + (Number(t.fees) || 0)), fees: t.fees ? String(t.fees) : '',
      emotion: t.emotion || 'Neutral', setup: t.setup || '', notes: t.notes || '',
      entryTime: t.entryTime ? t.entryTime.replace(' ', 'T') : '', exitTime: t.exitTime ? t.exitTime.replace(' ', 'T') : '',
      reason: t.reason || '', account: t.account || '', selfSetup: t.selfSetup || '', selfExec: t.selfExec || ''
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelEdit() { discardPendingVideos(); setEditing(null); setF(blank); setImages([]); setFillsEnabled(false); setFills([]); setFillProfileId('') }
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  function setSymbol(event) {
    const symbol = event.target.value
    setF((current) => ({ ...current, symbol }))
    if (fillsEnabled) setFillProfileId(selectInstrumentProfile(profiles, symbol)?.id || '')
  }
  function toggleFills() {
    if (fillsEnabled) {
      if (Array.isArray(editing?.fills) && editing.fills.length > 0) {
        setSubmitError('This trade already has saved fills. Edit or remove individual fills so its aggregate values stay consistent.')
        return
      }
      setFillsEnabled(false); return
    }
    setSubmitError('')
    const exact = selectInstrumentProfile(profiles, f.symbol)
    setFillProfileId(exact?.id || '')
    if (!fills.length) setFills(synthesizeTradeFills({ ...f, size: f.size, entry: f.entry, exit: f.exit, fees: f.fees }).map((fill, index) => ({ ...fill, id: `${editing?.id || 'new-trade'}-fill-${index}-${Date.now()}` })))
    setFillsEnabled(true)
  }
  function updateFill(index, key, value) { setFills((current) => current.map((fill, position) => position === index ? { ...fill, [key]: value } : fill)) }
  function addFill() {
    const long = f.direction !== 'Short'
    setFills((current) => [...current, { id: `${editing?.id || 'trade'}-fill-${Date.now()}-${current.length}`, kind: 'entry', side: long ? 'buy' : 'sell', quantity: '', price: '', fee: '', filledAt: f.entryTime || '', sequence: current.length }])
  }
  function removeFill(index) { setFills((current) => current.filter((_, position) => position !== index)) }
  function moveFill(index, delta) {
    setFills((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]; [next[index], next[target]] = [next[target], next[index]]
      return next.map((fill, sequence) => ({ ...fill, sequence }))
    })
  }

  // Setup options = presets + saved custom setups + any already used on a trade.
  const setupOptions = useMemo(() => {
    const seen = new Set(SETUPS)
    for (const s of customSetups) seen.add(s)
    for (const t of trades) if (t.setup) seen.add(t.setup)
    return [...seen]
  }, [trades, customSetups])

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
  const exactFillProfile = useMemo(() => selectInstrumentProfile(profiles, f.symbol), [profiles, f.symbol])
  const genericStockProfile = useMemo(() => profiles.find((profile) => String(profile.symbol).toUpperCase() === 'STOCK') || null, [profiles])
  const fillProfileOptions = useMemo(() => exactFillProfile ? [exactFillProfile] : (genericStockProfile ? [genericStockProfile] : []), [exactFillProfile, genericStockProfile])
  const fillProfile = useMemo(() => selectInstrumentProfile(profiles, f.symbol, fillProfileId), [profiles, f.symbol, fillProfileId])
  const fillPreview = useMemo(() => {
    if (!fillsEnabled) return null
    if (!fillProfile) return { valid: false, error: `No instrument profile is selected for ${f.symbol || 'this symbol'}. Add an exact profile in Settings, or explicitly select Generic stock for a non-futures symbol.` }
    return averageCostFillPreview(f, fills, fillProfile)
  }, [fillsEnabled, fillProfile, f, fills])

  // reason options follow the outcome (win vs loss); clear a stale pick if the outcome flips
  const feeNum = parseFloat(f.fees) || 0
  const effGross = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? null)
  const effNet = effGross == null || isNaN(effGross) ? null : effGross - feeNum
  const isWin = effNet == null ? null : effNet >= 0
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

  function discardPendingVideos(items = videos) {
    const tokens = items.map((video) => video.token).filter(Boolean)
    if (tokens.length) Promise.resolve(window.api?.discardPickedTradeVideos?.(tokens)).catch(() => {})
    setVideos([])
  }
  async function pickVideoFiles() {
    if (!window.api?.pickTradeVideos) { setSubmitError('Screen recording import is unavailable.'); return }
    setSubmitError('')
    try {
      const result = await window.api.pickTradeVideos()
      if (result?.canceled) return
      if (!result?.ok) throw new Error(result?.error || 'The recordings could not be selected.')
      const picked = Array.isArray(result.files) ? result.files : []
      if (videos.length + picked.length > 10) {
        await window.api.discardPickedTradeVideos?.(picked.map((video) => video.token))
        setSubmitError('Attach no more than 10 recordings to one trade at a time.')
        return
      }
      setVideos((current) => [...current, ...picked])
    } catch (error) {
      setSubmitError(error?.message || 'The recordings could not be selected.')
    }
  }
  function removeVideo(token) {
    Promise.resolve(window.api?.discardPickedTradeVideos?.([token])).catch(() => {})
    setVideos((current) => current.filter((video) => video.token !== token))
  }

  async function submit() {
    if (!f.symbol.trim() || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')
    try {
      if (fillsEnabled && !fillPreview?.valid) throw new Error(fillPreview?.error || 'Fix the fill list before saving.')
      const explicitFills = fillsEnabled ? fills.map((fill, sequence) => ({
        ...fill, sequence, quantity: Number(fill.quantity), price: Number(fill.price), fee: fill.fee === '' ? 0 : Number(fill.fee),
        filledAt: String(fill.filledAt || '').replace('T', ' ')
      })) : undefined
      const grossPnl = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? 0)
      const fees = parseFloat(f.fees) || 0
      const pnl = (isNaN(grossPnl) ? 0 : grossPnl) - fees // store P&L net of fees
      const rr = derivedRR ?? (f.riskAmount && f.pnl ? Math.abs(parseFloat(f.pnl)) / Math.abs(parseFloat(f.riskAmount)) : 0)
      const base = {
        symbol: f.symbol.trim().toUpperCase(), direction: f.direction,
        entry: parseFloat(f.entry) || 0, exit: parseFloat(f.exit) || 0,
        stop: parseFloat(f.stop) || 0, target: parseFloat(f.target) || 0,
        size: parseFloat(f.size) || 0, riskAmount: parseFloat(f.riskAmount) || 0,
        pnl: isNaN(pnl) ? 0 : pnl, fees, rr: rr || 0,
        emotion: f.emotion, setup: f.setup.trim(), notes: f.notes.trim(),
        entryTime: f.entryTime ? f.entryTime.replace('T', ' ') : '',
        // In simple mode there's no separate exit time — mirror the entry time so the calendar/heatmap still place it.
        exitTime: (compact ? f.entryTime : f.exitTime) ? (compact ? f.entryTime : f.exitTime).replace('T', ' ') : '',
        reason: f.reason, account: f.account, selfSetup: f.selfSetup, selfExec: f.selfExec,
        ...(fillsEnabled ? { fills: explicitFills } : {})
      }
      const screenshots = images.map((im) => ({ dataUrl: im.dataUrl, tag: im.tag.trim(), caption: (im.labels || []).join(', ') }))
      const videoTokens = videos.map((video) => video.token).filter(Boolean)
      const savedLabel = editing ? 'Trade updated' : 'Trade saved'
      let result
      if (editing) {
        result = await onUpdate({ ...base, id: editing.id, timestamp: editing.timestamp, source: editing.source || 'manual' }, screenshots, videoTokens)
        setEditing(null); setF(blank); setImages([]); setVideos([]); setFillsEnabled(false); setFills([])
      } else {
        result = await onAdd({ ...base, id: Date.now() + Math.random().toString(16).slice(2), timestamp: new Date().toISOString().slice(0, 16).replace('T', ' ') }, screenshots, videoTokens)
        setF(blank); setImages([]); setVideos([]); setFillsEnabled(false); setFills([]); setFillProfileId('')
      }
      if (result?.videoErrors?.length) setSubmitError(`${savedLabel}, but some recordings were not attached. ${result.videoErrors.join(' ')}`)
    } catch (error) {
      setSubmitError(error?.message || 'Trade could not be saved. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 mb-3">
          {editing ? <Pencil size={16} style={{ color: T.accent }} /> : <Plus size={16} style={{ color: T.accent }} />}
          <h2 className="text-sm font-semibold">{editing ? `Edit trade · ${editing.symbol}` : 'Log a trade'}</h2>
          {editing
            ? <button type="button" onClick={cancelEdit} className="ml-auto text-xs" style={{ color: T.dim }}>Cancel</button>
            : (
              <button type="button" onClick={toggleSimple} title="Simple journal hides the advanced price/risk fields for a faster log"
                className="ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
                style={{ background: simple ? T.accentSoft : T.surface2, color: simple ? T.accent : T.dim, border: `1px solid ${simple ? T.accent : T.line}` }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: simple ? T.accent : 'transparent', border: `1px solid ${simple ? T.accent : T.faint}`, display: 'inline-block' }} />
                Simple journal
              </button>
            )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol"><input style={inputStyle} className={inp} value={f.symbol} onChange={setSymbol} placeholder="ES, BTC, AAPL" /></Field>
          <Field label="Direction">
            <select style={inputStyle} className={inp} value={f.direction} onChange={set('direction')}><option>Long</option><option>Short</option></select>
          </Field>
          {!compact && <>
            <Field label="Entry"><input style={inputStyle} className={inp} value={f.entry} onChange={set('entry')} inputMode="decimal" /></Field>
            <Field label="Exit"><input style={inputStyle} className={inp} value={f.exit} onChange={set('exit')} inputMode="decimal" /></Field>
            <Field label="Stop"><input style={inputStyle} className={inp} value={f.stop} onChange={set('stop')} inputMode="decimal" /></Field>
            <Field label="Target"><input style={inputStyle} className={inp} value={f.target} onChange={set('target')} inputMode="decimal" /></Field>
            <Field label="Size / contracts"><input style={inputStyle} className={inp} value={f.size} onChange={set('size')} inputMode="decimal" /></Field>
            <Field label="Risk $"><input style={inputStyle} className={inp} value={f.riskAmount} onChange={set('riskAmount')} inputMode="decimal" /></Field>
          </>}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label={compact ? 'Date & time' : 'Entry time'}><input type="datetime-local" style={inputStyle} className={inp} value={f.entryTime} onChange={set('entryTime')} /></Field>
          {!compact && <Field label="Exit time"><input type="datetime-local" style={inputStyle} className={inp} value={f.exitTime} onChange={set('exitTime')} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Emotion">
            <div className="flex gap-1.5">
              <select style={inputStyle} className={inp} value={f.emotion} onChange={set('emotion')}>
                {f.emotion && !allEmotions.includes(f.emotion) && <option value={f.emotion}>{f.emotion}</option>}
                {allEmotions.map((e) => <option key={e}>{e}</option>)}
              </select>
              <button type="button" onClick={() => { setAddingEmotion((v) => !v); setAddingSetup(false) }} title="Add a custom emotion" className="shrink-0 rounded px-2" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.accent }}><Plus size={14} /></button>
            </div>
            {addingEmotion && (
              <div className="flex gap-1.5 mt-1.5">
                <input autoFocus style={inputStyle} className={inp} value={newEmotion} onChange={(e) => setNewEmotion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmotion() } if (e.key === 'Escape') setAddingEmotion(false) }} placeholder="New emotion" />
                <button type="button" onClick={addEmotion} className="shrink-0 rounded px-2" style={{ background: T.accent, color: '#1A1306' }}><Check size={14} /></button>
              </div>
            )}
          </Field>
          <Field label="Setup">
            <div className="flex gap-1.5">
              <select style={inputStyle} className={inp} value={f.setup} onChange={set('setup')}>
                {!setupOptions.includes(f.setup) && f.setup && <option value={f.setup}>{f.setup}</option>}
                {setupOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => { setAddingSetup((v) => !v); setAddingEmotion(false) }} title="Add a custom setup" className="shrink-0 rounded px-2" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.accent }}><Plus size={14} /></button>
            </div>
            {addingSetup && (
              <div className="flex gap-1.5 mt-1.5">
                <input autoFocus style={inputStyle} className={inp} value={newSetup} onChange={(e) => setNewSetup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSetup() } if (e.key === 'Escape') setAddingSetup(false) }} placeholder="New setup" />
                <button type="button" onClick={addSetup} className="shrink-0 rounded px-2" style={{ background: T.accent, color: '#1A1306' }}><Check size={14} /></button>
              </div>
            )}
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
        {!compact && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Setup grade (self)">
              <select style={inputStyle} className={inp} value={f.selfSetup} onChange={set('selfSetup')}>
                <option value="">— ungraded —</option>
                {SELF_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Execution grade (self)">
              <select style={inputStyle} className={inp} value={f.selfExec} onChange={set('selfExec')}>
                <option value="">— ungraded —</option>
                {SELF_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
          </div>
        )}
        {accounts.length > 0 && (
          <div className="mt-3">
            <Field label="Account — Live or which prop account">
              <select style={inputStyle} className={inp} value={f.account} onChange={set('account')}>
                <option value="">Live / personal</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label || 'Account'}</option>)}
              </select>
            </Field>
          </div>
        )}
        {!compact && (
          <div className="mt-3 rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${fillsEnabled ? T.accent : T.line}` }}>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={toggleFills} className="rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: fillsEnabled ? T.accentSoft : T.surface, color: fillsEnabled ? T.accent : T.dim, border: `1px solid ${fillsEnabled ? T.accent : T.line}` }}>{fillsEnabled ? 'Use multiple fills: on' : 'Use multiple fills'}</button>
              {fillsEnabled && <button type="button" onClick={addFill} className="ml-auto flex items-center gap-1 text-xs" style={{ color: T.accent }}><Plus size={12} /> Add fill</button>}
            </div>
            {fillsEnabled && (
              <div className="space-y-2 mt-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: T.dim }}>Instrument profile for fill P&amp;L</label>
                  <select style={inputStyle} className="w-full rounded px-2 py-1.5 text-xs" value={fillProfileId} onChange={(event) => setFillProfileId(event.target.value)}>
                    <option value="">Choose a profile…</option>
                    {fillProfileOptions.map((profile) => <option key={profile.id} value={profile.id}>{profile.symbol} · {profile.name || profile.assetClass}{profile.symbol === 'STOCK' && !exactFillProfile ? ' (explicit fallback)' : ''}</option>)}
                  </select>
                  {!exactFillProfile && genericStockProfile && <div className="text-[10px] mt-1" style={{ color: T.faint }}>Generic stock is an explicit 1× fallback for non-futures symbols. Futures require an exact profile.</div>}
                </div>
                {fills.map((fill, index) => (
                  <div key={fill.id || index} className="rounded-lg p-2" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                    <div className="grid grid-cols-2 sm:grid-cols-[70px_70px_1fr_1fr_1fr_1.4fr] gap-2">
                      <select aria-label={`Fill ${index + 1} kind`} style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={fill.kind} onChange={(event) => updateFill(index, 'kind', event.target.value)}><option value="entry">Entry</option><option value="exit">Exit</option></select>
                      <select aria-label={`Fill ${index + 1} side`} style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={fill.side} onChange={(event) => updateFill(index, 'side', event.target.value)}><option value="buy">Buy</option><option value="sell">Sell</option></select>
                      <input aria-label={`Fill ${index + 1} quantity`} style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={fill.quantity} onChange={(event) => updateFill(index, 'quantity', event.target.value)} inputMode="decimal" placeholder="Qty" />
                      <input aria-label={`Fill ${index + 1} price`} style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={fill.price} onChange={(event) => updateFill(index, 'price', event.target.value)} inputMode="decimal" placeholder="Price" />
                      <input aria-label={`Fill ${index + 1} fee`} style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={fill.fee} onChange={(event) => updateFill(index, 'fee', event.target.value)} inputMode="decimal" placeholder="Fee" />
                      <input aria-label={`Fill ${index + 1} time`} type="datetime-local" style={inputStyle} className="rounded px-1.5 py-1 text-xs" value={String(fill.filledAt || '').replace(' ', 'T').slice(0, 16)} onChange={(event) => updateFill(index, 'filledAt', event.target.value)} />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-1.5">
                      <button type="button" onClick={() => moveFill(index, -1)} disabled={index === 0} title="Move fill earlier" style={{ color: T.faint, opacity: index === 0 ? 0.35 : 1 }}><ArrowUp size={13} /></button>
                      <button type="button" onClick={() => moveFill(index, 1)} disabled={index === fills.length - 1} title="Move fill later" style={{ color: T.faint, opacity: index === fills.length - 1 ? 0.35 : 1 }}><ArrowDown size={13} /></button>
                      <button type="button" onClick={() => removeFill(index)} title="Remove fill" style={{ color: T.down }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
                <div className="rounded-md px-3 py-2 text-xs" style={{ background: T.surface, border: `1px solid ${fillPreview?.valid ? T.line : T.down}`, color: fillPreview?.valid ? T.dim : T.down }}>
                  {fillPreview?.valid ? <>Average entry <strong style={{ ...mono, color: T.text }}>{fmtN(fillPreview.entry, 4)}</strong> · average exit <strong style={{ ...mono, color: T.text }}>{fillPreview.exit ? fmtN(fillPreview.exit, 4) : '—'}</strong> · peak {fmtN(fillPreview.size, 4)} · open {fmtN(fillPreview.openQuantity, 4)} · fees {fmt$(fillPreview.fees)} · net <strong style={{ ...mono, color: fillPreview.pnl >= 0 ? T.up : T.down }}>{fmt$(fillPreview.pnl)}</strong></> : fillPreview?.error}
                </div>
                <div className="text-[10px]" style={{ color: T.faint }}>When enabled, entry, exit, size, fees, and P&amp;L are computed from these fills using average cost. Partial exits are supported; over-exits and position flips are rejected.</div>
              </div>
            )}
          </div>
        )}
        {compact ? (
          <div className="mt-3">
            <Field label="P&L $ (net)">
              <input style={inputStyle} className={inp} value={f.pnl} onChange={set('pnl')} inputMode="decimal" placeholder="e.g. 125 or -40" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="P&L $ (before fees)">
              <input style={inputStyle} className={inp} value={f.pnl} onChange={set('pnl')} inputMode="decimal" placeholder={derivedPnl != null ? `auto: ${fmtN(derivedPnl)}` : '—'} />
            </Field>
            <Field label="Fees / commissions $">
              <input style={inputStyle} className={inp} value={f.fees} onChange={set('fees')} inputMode="decimal" placeholder="0" />
            </Field>
          </div>
        )}
        <div className="mt-3">
          <Field label="Notes"><textarea style={inputStyle} className={inp} rows={3} value={f.notes} onChange={set('notes')} placeholder="What did you see? What did you feel?" /></Field>
        </div>
        <div className="mt-3">
          <Field label={editing ? 'Add screenshots' : 'Screenshots — before / after'}>
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
        <div className="mt-3">
          <Field label={editing ? 'Add screen recordings' : 'Screen recordings'}>
            <button type="button" onClick={pickVideoFiles} className="w-full rounded px-3 py-3 text-center"
              style={{ background: T.surface2, border: `1px dashed ${T.line}`, color: T.dim }}>
              <Video size={18} style={{ color: T.accent, display: 'inline', verticalAlign: 'middle' }} />
              <span className="text-xs ml-2">Choose MP4, WebM, MOV, or M4V files</span>
            </button>
            <div className="text-[10px] mt-1" style={{ color: T.faint }}>Up to 10 recordings, 2 GB each. Files are copied into TradeHelp and stay on this machine.</div>
          </Field>
          {videos.length > 0 && (
            <div className="space-y-2 mt-2">
              {videos.map((video) => (
                <div key={video.token} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                  <Video size={16} className="shrink-0" style={{ color: T.accent }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs" title={video.name} style={{ color: T.text }}>{video.name}</div>
                    <div className="text-[10px]" style={{ color: T.faint }}>{formatFileSize(video.size)}</div>
                  </div>
                  <button type="button" onClick={() => removeVideo(video.token)} title="Remove recording" style={{ color: T.faint }}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: T.dim }}>
          {!compact && <span>R:R {derivedRR != null ? `1:${fmtN(derivedRR, 1)}` : '—'}</span>}
          {!compact && <span>Held {derivedHold != null ? fmtDuration(derivedHold) || '0m' : '—'}</span>}
          <span>Net {effNet != null ? fmt$(effNet) : '—'}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={submit} disabled={submitting || !f.symbol.trim() || (fillsEnabled && !fillPreview?.valid)} className="flex-1 rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: submitting || !f.symbol.trim() || (fillsEnabled && !fillPreview?.valid) ? 0.5 : 1 }}>{submitting ? 'Saving…' : editing ? 'Update trade' : 'Save trade'}</button>
          {editing && <button type="button" onClick={cancelEdit} disabled={submitting} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}`, opacity: submitting ? 0.5 : 1 }}>Cancel</button>}
        </div>
        {submitError && <div className="text-xs mt-2" style={{ color: T.down }}>{submitError}</div>}

        {!editing && (
          <>
            <button type="button" onClick={() => setNoTradeOpen(true)} className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-md py-2 text-sm" style={{ background: 'transparent', color: T.dim, border: `1px dashed ${T.line}` }}>
              <Coffee size={14} /> Log a no-trade day
            </button>
            {dayLogs.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: T.dim }}><CalendarOff size={12} /> No-trade days · {dayLogs.length}</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {dayLogs.slice(0, 30).map((d) => (
                    <div key={d.id} className="flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: T.surface2 }}>
                      <span style={{ ...mono, color: T.faint }} className="shrink-0">{d.date}</span>
                      <div className="flex-1 min-w-0">
                        <div style={{ color: T.text }}>{d.reason}{d.mood ? ` · ${d.mood}` : ''}</div>
                        {d.note && <div style={{ color: T.dim }} className="truncate">{d.note}</div>}
                      </div>
                      <button type="button" onClick={() => onDeleteDayLog?.(d.id)} title="Delete" className="shrink-0" style={{ color: T.faint }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Trade history <span style={{ color: T.faint }}>· {filtered.length === trades.length ? trades.length : `${filtered.length} of ${trades.length}`}</span></span>
            <button type="button" onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Upload size={13} /> Import CSV</button>
          </div>
          {trades.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="relative flex-1 min-w-[260px]">
                <Search size={13} style={{ color: T.faint, position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                <input style={inputStyle} className="w-full rounded pl-7 pr-2 py-1.5 text-xs" value={query} onChange={(e) => changeSearch(e.target.value)} placeholder="Try: losing NQ trades last week after 11am" />
              </div>
              {[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setOutcome(k)} className="text-xs px-2 py-1 rounded-md" style={{ background: outcome === k ? T.surface2 : 'transparent', color: outcome === k ? T.accent : T.dim, border: `1px solid ${outcome === k ? T.line : 'transparent'}` }}>{label}</button>
              ))}
              <div className="basis-full flex flex-wrap items-center gap-2 mt-1 rounded-lg p-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <Bookmark size={13} style={{ color: T.accent }} />
                <select aria-label="Saved searches" style={inputStyle} className="min-w-[150px] flex-1 rounded px-2 py-1 text-xs" value={selectedSearchId} onChange={(event) => applySavedSearch(event.target.value)}>
                  <option value="">Saved searches…</option>
                  {savedSearches.map((search) => <option key={search.id} value={search.id}>{search.name}</option>)}
                </select>
                <button type="button" onClick={() => Promise.resolve(onRefreshSavedSearches?.()).catch((error) => setSearchError(error?.message || 'Saved searches could not be refreshed.'))} className="rounded px-2 py-1 text-xs" style={{ color: T.dim, border: `1px solid ${T.line}` }}>Refresh</button>
                <input aria-label="Saved search name" style={inputStyle} className="min-w-[150px] flex-1 rounded px-2 py-1 text-xs" value={searchName} onChange={(event) => setSearchName(event.target.value)} placeholder="Name this search" />
                <button type="button" onClick={() => saveCurrentSearch(false)} disabled={!query.trim() || !searchName.trim()} className="rounded px-2 py-1 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: query.trim() && searchName.trim() ? 1 : 0.5 }}>Save new</button>
                {selectedSearchId && <button type="button" onClick={() => saveCurrentSearch(true)} className="rounded px-2 py-1 text-xs" style={{ color: T.accent, border: `1px solid ${T.line}` }}>Update</button>}
                {selectedSearchId && <button type="button" onClick={removeSavedSearch} title="Delete saved search" style={{ color: T.down }}><Trash2 size={13} /></button>}
                {searchError && <div className="basis-full text-xs" style={{ color: T.down }}>{searchError}</div>}
              </div>
              <div className="basis-full mt-1">
                {query.trim() ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider mr-0.5" style={{ color: T.faint }}>Interpreted as</span>
                      {activeSearchFilters.map((filter) => (
                        <button key={filter.id} type="button" onClick={() => dismissSearchFilter(filter.id)} title={`${filter.detail} Click to remove this condition.`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                          style={{ background: T.accentSoft, color: T.accent, border: `1px solid ${T.accent}` }}>
                          {filter.label}<X size={11} />
                        </button>
                      ))}
                      {activeSearchFilters.length === 0 && <span className="text-xs" style={{ color: T.dim }}>No conditions active.</span>}
                      {dismissedSearchFilters.length > 0 && <button type="button" onClick={() => setDismissedSearchFilters([])} className="text-[11px] ml-1" style={{ color: T.accent }}>Restore removed</button>}
                      <button type="button" onClick={clearSearch} className="text-[11px] ml-auto" style={{ color: T.faint }}>Clear search</button>
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: T.faint }}>Local, deterministic filters only. Quoted phrases are matched literally; every chip explains what will be applied.</div>
                  </>
                ) : (
                  <div className="text-[10px]" style={{ color: T.faint }}>Natural search examples: “wins this month”, “long pullbacks over $200”, or “anxious trades with screenshots”.</div>
                )}
              </div>
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
                  {['Time', 'Symbol', 'Dir', 'P&L', 'Grade', 'R:R', 'Held', 'Setup', 'Emotion'].map((h) => <th key={h} className="text-left font-normal px-3 py-2">{h}</th>)}
                  <th className="text-right font-normal px-3 py-2 sticky right-0" style={{ background: T.surface }}>Edit · Del</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id} className="cursor-pointer" style={{ borderTop: `1px solid ${T.line}` }} onDoubleClick={() => onNotes(t)}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: T.dim, boxShadow: `inset 3px 0 0 ${(Number(t.pnl) || 0) >= 0 ? T.up : T.down}` }}>{t.timestamp}</td>
                    <td className="px-3 py-2 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        {t.symbol}
                        {attachmentCount(t) > 0 && (
                          <span className="inline-flex items-center gap-0.5" title={attachmentTitle(t)} style={{ color: T.faint }}>
                            <Paperclip size={12} /><span className="text-[10px]">{attachmentCount(t)}</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: t.direction === 'Long' ? T.up : T.down }}>{t.direction}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: t.pnl >= 0 ? T.up : T.down }}>{fmt$(t.pnl)}</td>
                    <td className="px-3 py-2"><GradeChip t={t} /></td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.rr ? `1:${fmtN(t.rr, 1)}` : '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{fmtDuration(holdMs(t)) || '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.setup}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.emotion}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap sticky right-0" style={{ background: T.surface }}>
                      <button type="button" onClick={() => startEdit(t)} title="Edit trade" style={{ color: T.dim }} className="mr-3 hover:opacity-70"><Pencil size={16} /></button>
                      <button type="button" onClick={() => requestDelete(t)} title="Delete trade" style={{ color: T.down }} className="hover:opacity-70"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ordered.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: T.dim, borderTop: `1px solid ${T.line}` }}>
            <span>Showing <span style={{ ...mono, color: T.text }}>{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, ordered.length)}</span> of {ordered.length}</span>
            <div className="flex items-center gap-1.5">
              <span style={{ color: T.faint }}>Per page</span>
              {[20, 40, 50].map((n) => (
                <button key={n} type="button" onClick={() => setPageSize(n)} className="px-1.5 py-0.5 rounded" style={{ background: pageSize === n ? T.surface2 : 'transparent', color: pageSize === n ? T.accent : T.dim, border: `1px solid ${pageSize === n ? T.line : 'transparent'}` }}>{n}</button>
              ))}
              <span style={{ width: 1, height: 14, background: T.line, margin: '0 4px' }} />
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} style={{ color: T.dim, opacity: safePage === 0 ? 0.4 : 1 }}><ChevronLeft size={15} /></button>
              <span style={{ ...mono, color: T.text }}>{safePage + 1}/{pageCount}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} style={{ color: T.dim, opacity: safePage >= pageCount - 1 ? 0.4 : 1 }}><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
        <div className="px-4 py-2 text-xs" style={{ color: T.faint, borderTop: `1px solid ${T.line}` }}>Double-click a row to open it — edit notes, view screenshots and recordings. Use ✏️ to edit the full trade.</div>
      </div>
      {importOpen && <ImportModal existing={trades} accounts={accounts} onClose={() => setImportOpen(false)} onImport={async (rows) => { await onImport(rows); setImportOpen(false) }} />}
      {annotating && <AnnotateModal src={annotating.dataUrl} onClose={() => setAnnotating(null)} onSave={(dataUrl, labels) => { setImages((p) => p.map((im) => (im.tmpId === annotating.tmpId ? { ...im, dataUrl, labels } : im))); setAnnotating(null) }} />}
      {noTradeOpen && <NoTradeModal emotions={allEmotions} onClose={() => setNoTradeOpen(false)} onSave={async (entry) => { await onAddDayLog?.(entry); setNoTradeOpen(false) }} />}
      {pendingDelete && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-lg"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}>
          <Trash2 size={14} style={{ color: T.down }} />
          <span>Deleted <span className="font-semibold">{pendingDelete.symbol}</span></span>
          <button type="button" onClick={undoDelete} className="font-semibold px-2 py-0.5 rounded" style={{ color: T.accent, border: `1px solid ${T.line}` }}>Undo</button>
        </div>
      )}
    </div>
  )
}

/* ───────── no-trade day logger ───────── */
function NoTradeModal({ emotions = [], onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [reason, setReason] = useState(NO_TRADE_REASONS[0])
  const [mood, setMood] = useState('')
  const [note, setNote] = useState('')
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[70]" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md p-5 space-y-3" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <CalendarOff size={16} style={{ color: T.accent }} />
          <span className="text-sm font-semibold">Log a no-trade day</span>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.dim }}><X size={16} /></button>
        </div>
        <p className="text-xs" style={{ color: T.dim }}>Track the days you sat out — whether you stayed disciplined or missed one. It won't touch your P&L stats.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" style={inputStyle} className={inp} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Mood (optional)">
            <select style={inputStyle} className={inp} value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="">—</option>
              {emotions.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Field>
        </div>
        <Field label="What happened?">
          <select style={inputStyle} className={inp} value={reason} onChange={(e) => setReason(e.target.value)}>
            {NO_TRADE_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)">
          <textarea style={inputStyle} className={inp} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Setup you saw, what you felt, what you'd do differently…" />
        </Field>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg py-2 text-sm" style={{ border: `1px solid ${T.line}`, color: T.dim }}>Cancel</button>
          <button type="button" onClick={() => date && onSave({ date, reason, mood, note })} disabled={!date} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: date ? 1 : 0.5 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ───────── dashboard ───────── */
export function PnlCalendar({ trades, plans = [], dayLogs = [], onSelectDay }) {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7))
  const dayMap = useMemo(() => {
    const m = {}
    const ensure = (date) => {
      if (!date || date.slice(0, 7) !== ym) return null
      if (!m[date]) m[date] = { pnl: 0, n: 0, plans: 0, noTrade: false }
      return m[date]
    }
    for (const t of trades || []) {
      const bucket = ensure((t.entryTime || t.timestamp || '').slice(0, 10))
      if (!bucket) continue
      bucket.pnl += Number(t.pnl) || 0; bucket.n += 1
    }
    for (const plan of plans || []) {
      const bucket = ensure((plan.plannedAt || plan.lockedAt || plan.createdAt || '').slice(0, 10))
      if (bucket) bucket.plans += 1
    }
    for (const entry of dayLogs || []) {
      const bucket = ensure(String(entry.date || '').slice(0, 10))
      if (bucket) bucket.noTrade = true
    }
    return m
  }, [trades, plans, dayLogs, ym])
  const [y, mo] = ym.split('-').map(Number)
  const startDow = new Date(y, mo - 1, 1).getDay()
  const days = new Date(y, mo, 0).getDate()
  const vals = Object.values(dayMap)
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v.pnl)))
  const monthPnl = vals.reduce((a, v) => a + v.pnl, 0)
  const greenDays = vals.filter((v) => v.n > 0 && v.pnl > 0).length
  const redDays = vals.filter((v) => v.n > 0 && v.pnl < 0).length
  const shift = (delta) => { const d = new Date(y, mo - 1 + delta, 1); setYm(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`) }
  const cellBg = (pnl) => {
    if (pnl == null) return T.surface2
    const a = Math.min(0.85, 0.2 + (Math.abs(pnl) / maxAbs) * 0.6)
    return pnl >= 0 ? `rgba(52,211,153,${a})` : `rgba(251,113,133,${a})`
  }
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${pad2(d)}`
    cells.push({ d, date, v: dayMap[date] })
  }
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
        {cells.map((c, i) => c == null ? <div key={i} /> : (() => {
          const active = Boolean(c.v?.n || c.v?.plans || c.v?.noTrade)
          const darkText = c.v?.n > 0
          return (
            <button key={c.date} type="button" onClick={() => onSelectDay?.(c.date)} title={active ? 'Open day details and session replay' : 'Open this day'}
              className="rounded p-1.5 min-h-[62px] text-left transition-transform hover:-translate-y-0.5"
              style={{ background: c.v?.n ? cellBg(c.v.pnl) : T.surface2, border: `1px solid ${active ? T.accent : T.line}` }}>
              <div className="text-xs" style={{ color: darkText ? '#0E1117' : T.faint }}>{c.d}</div>
              {c.v?.n > 0 && <div className="text-xs font-semibold leading-tight" style={{ ...mono, color: '#0E1117' }}>{fmt$(c.v.pnl)}</div>}
              {c.v?.plans > 0 && <div className="text-[9px] mt-0.5" style={{ color: darkText ? '#0E1117' : T.accent }}>{c.v.plans} plan{c.v.plans === 1 ? '' : 's'}</div>}
              {c.v?.noTrade && <div className="text-[9px] mt-0.5" style={{ color: darkText ? '#0E1117' : T.dim }}>No-trade log</div>}
            </button>
          )
        })())}
      </div>
      <div className="text-xs mt-2" style={{ color: T.faint }}>Select any date to open its details and replay the session.</div>
    </Panel>
  )
}

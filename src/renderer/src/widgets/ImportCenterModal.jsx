import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Clock3, FolderPlus, History, Inbox, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { T, inputStyle, mono } from '../theme.js'
import { BROKER_PRESETS } from '../utils.js'

const TABS = [
  ['inbox', Inbox, 'Inbox'],
  ['history', History, 'History'],
  ['folders', FolderPlus, 'Watched folders']
]

const commonZones = ['Local time', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'UTC']
const shortPath = (path) => String(path || '').split(/[\\/]/).filter(Boolean).pop() || 'Broker exports'
const when = (value) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-'

export function ImportCenterModal({ onClose, onReview, onRollback, accounts = [] }) {
  const [tab, setTab] = useState('inbox')
  const [inbox, setInbox] = useState([])
  const [batches, setBatches] = useState([])
  const [sources, setSources] = useState([])
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  async function reload() {
    const [nextInbox, nextBatches, nextSources] = await Promise.all([
      window.api.listImportInbox(), window.api.listImportBatches(), window.api.listImportSources()
    ])
    setInbox(nextInbox); setBatches(nextBatches); setSources(nextSources)
  }

  useEffect(() => {
    reload().catch((error) => setMessage(error?.message || String(error)))
    return window.api.onImportsChanged?.(() => reload())
  }, [])

  async function chooseFolder() {
    const picked = await window.api.chooseImportFolder()
    if (!picked?.ok) return
    setDraft({
      name: shortPath(picked.folderPath), folderPath: picked.folderPath, brokerKey: '', account: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time', trusted: false, enabled: true
    })
  }

  async function saveDraft() {
    setBusy('draft')
    try { setSources(await window.api.saveImportSource(draft)); setDraft(null); setMessage('Folder is now being watched.') }
    catch (error) { setMessage(error?.message || String(error)) }
    finally { setBusy('') }
  }

  async function updateSource(source, changes) {
    const next = { ...source, ...changes }
    setSources((current) => current.map((item) => item.id === source.id ? next : item))
    try { setSources(await window.api.saveImportSource(next)) }
    catch (error) { setMessage(error?.message || String(error)); reload() }
  }

  async function scan(source) {
    setBusy(`scan:${source.id}`); setMessage('')
    try {
      const result = await window.api.scanImportSource(source.id)
      setMessage(result.detected ? `${result.detected} CSV file${result.detected === 1 ? '' : 's'} added to the inbox.` : 'No new CSV files found.')
      await reload()
    } catch (error) { setMessage(error?.message || String(error)) }
    finally { setBusy('') }
  }

  async function removeSource(source) {
    if (!window.confirm(`Stop watching "${source.name}"? Existing import history stays intact.`)) return
    setSources(await window.api.deleteImportSource(source.id))
    await reload()
  }

  async function dismiss(item) {
    await window.api.dismissImportInbox(item.id)
    await reload()
  }

  async function review(item) {
    setBusy(`review:${item.id}`)
    try { onReview(await window.api.readImportInbox(item.id)) }
    catch (error) { setMessage(error?.message || String(error)); setBusy('') }
  }

  async function rollback(batch) {
    const count = Number(batch.remainingCount) || 0
    if (!window.confirm(`Remove the ${count} remaining trade${count === 1 ? '' : 's'} from this import? Any edits or attachments on those trades will also be removed.`)) return
    setBusy(`rollback:${batch.id}`)
    try { await onRollback(batch.id); await reload(); setMessage('Import batch rolled back.') }
    catch (error) { setMessage(error?.message || String(error)) }
    finally { setBusy('') }
  }

  const fieldClass = 'rounded px-2 py-1.5 text-xs min-w-0'
  return createPortal(
    <div className="th-overlay fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-lg flex flex-col" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div><div className="text-sm font-semibold">Import inbox</div><div className="text-xs mt-0.5" style={{ color: T.faint }}>Broker exports, saved mappings, and reversible import history</div></div>
          <button type="button" onClick={onClose} style={{ color: T.faint }} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 pt-3 flex gap-1" style={{ borderBottom: `1px solid ${T.line}` }}>
          {TABS.map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setTab(key)} className="flex items-center gap-1.5 px-3 py-2 text-xs" style={{ color: tab === key ? T.accent : T.dim, borderBottom: `2px solid ${tab === key ? T.accent : 'transparent'}` }}>
            <Icon size={14} /> {label}{key === 'inbox' && inbox.length ? ` (${inbox.length})` : ''}
          </button>)}
        </div>
        <div className="p-5 overflow-y-auto min-h-[360px]">
          {tab === 'inbox' && <div className="space-y-2">
            {!inbox.length && <Empty icon={CheckCircle2} title="Inbox clear" text="New CSV exports from watched folders will appear here." />}
            {inbox.map((item) => <div key={item.id} className="p-3 rounded-lg flex items-center gap-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <Inbox size={17} style={{ color: T.accent }} />
              <div className="min-w-0 grow"><div className="text-sm font-medium truncate">{item.fileName}</div><div className="text-xs mt-0.5" style={{ color: T.faint }}>{item.sourceName || 'Watched folder'} · {when(item.modifiedAt)} · {(Number(item.size) / 1024).toFixed(1)} KB</div>{item.error && <div className="text-xs mt-1" style={{ color: T.down }}>{item.error}</div>}</div>
              <button type="button" onClick={() => dismiss(item)} className="px-2 py-1.5 text-xs" style={{ color: T.dim }}>Dismiss</button>
              <button type="button" disabled={busy === `review:${item.id}`} onClick={() => review(item)} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#17120A' }}>Review</button>
            </div>)}
          </div>}

          {tab === 'history' && <div className="space-y-2">
            {!batches.length && <Empty icon={History} title="No import history yet" text="Completed CSV imports will be recorded here." />}
            {batches.map((batch) => <div key={batch.id} className="p-3 rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}`, opacity: batch.status === 'rolled_back' ? 0.65 : 1 }}>
              <div className="flex items-center gap-3"><Clock3 size={16} style={{ color: batch.status === 'rolled_back' ? T.faint : T.accent }} />
                <div className="grow min-w-0"><div className="text-sm font-medium truncate">{batch.fileName}</div><div className="text-xs mt-0.5" style={{ color: T.faint }}>{when(batch.createdAt)} · {batch.brokerLabel || 'Generic CSV'}{batch.account ? ` · ${batch.account}` : ''}</div></div>
                <div className="text-right text-xs" style={mono}><div style={{ color: batch.status === 'rolled_back' ? T.faint : T.up }}>{batch.status === 'rolled_back' ? 'Rolled back' : `${batch.importedCount} imported`}</div><div style={{ color: T.faint }}>{batch.duplicateCount} duplicate · {batch.skippedCount} skipped</div></div>
                {batch.status !== 'rolled_back' && Number(batch.remainingCount) > 0 && <button type="button" title="Roll back this import" disabled={busy === `rollback:${batch.id}`} onClick={() => rollback(batch)} className="p-2 rounded-md" style={{ color: T.down, border: `1px solid ${T.line}` }}><RotateCcw size={15} /></button>}
              </div>
              {batch.warnings?.length > 0 && <div className="mt-2 text-xs" style={{ color: T.dim }}>{batch.warnings.join(' ')}</div>}
            </div>)}
          </div>}

          {tab === 'folders' && <div className="space-y-3">
            <div className="flex justify-between items-center"><div className="text-xs" style={{ color: T.dim }}>TradeHelp checks enabled folders every few seconds while the app is open.</div><button type="button" onClick={chooseFolder} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold" style={{ background: T.accent, color: '#17120A' }}><FolderPlus size={14} /> Add folder</button></div>
            {draft && <div className="p-3 rounded-lg space-y-3" style={{ border: `1px solid ${T.accent}`, background: T.surface2 }}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2"><input style={inputStyle} className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-label="Folder name" />
                <BrokerSelect value={draft.brokerKey} onChange={(brokerKey) => setDraft({ ...draft, brokerKey })} className={fieldClass} />
                <AccountSelect value={draft.account} accounts={accounts} onChange={(account) => setDraft({ ...draft, account })} className={fieldClass} />
                <ZoneSelect value={draft.timezone} onChange={(timezone) => setDraft({ ...draft, timezone })} className={fieldClass} /></div>
              <div className="text-xs truncate" style={{ color: T.faint }}>{draft.folderPath}</div>
              <div className="flex justify-between"><label className="flex items-center gap-2 text-xs" style={{ color: T.dim }}><input type="checkbox" checked={draft.trusted} onChange={(event) => setDraft({ ...draft, trusted: event.target.checked })} /> Auto-import recognized broker files</label><div className="flex gap-2"><button onClick={() => setDraft(null)} className="text-xs px-3">Cancel</button><button onClick={saveDraft} disabled={busy === 'draft'} className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#17120A' }}>Save</button></div></div>
            </div>}
            {!sources.length && !draft && <Empty icon={FolderPlus} title="No watched folders" text="Add the folder where your broker saves CSV exports." />}
            {sources.map((source) => <div key={source.id} className="p-3 rounded-lg space-y-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <div className="flex items-start gap-3"><div className="grow min-w-0"><div className="text-sm font-medium">{source.name}</div><div className="text-xs truncate mt-0.5" title={source.folderPath} style={{ color: T.faint }}>{source.folderPath}</div></div>
                <button type="button" disabled={busy === `scan:${source.id}`} onClick={() => scan(source)} className="p-2 rounded-md" title="Scan existing CSV files" style={{ color: T.accent, border: `1px solid ${T.line}` }}><RefreshCw size={14} className={busy === `scan:${source.id}` ? 'animate-spin' : ''} /></button>
                <button type="button" onClick={() => removeSource(source)} className="p-2 rounded-md" title="Remove watched folder" style={{ color: T.down, border: `1px solid ${T.line}` }}><Trash2 size={14} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2"><BrokerSelect value={source.brokerKey} onChange={(brokerKey) => updateSource(source, { brokerKey })} className={fieldClass} /><AccountSelect value={source.account} accounts={accounts} onChange={(account) => updateSource(source, { account })} className={fieldClass} /><ZoneSelect value={source.timezone} onChange={(timezone) => updateSource(source, { timezone })} className={fieldClass} /></div>
              <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-xs" style={{ color: T.dim }}><input type="checkbox" checked={source.enabled} onChange={(event) => updateSource(source, { enabled: event.target.checked })} /> Watch this folder</label><label className="flex items-center gap-2 text-xs" style={{ color: T.dim }}><input type="checkbox" checked={source.trusted} onChange={(event) => updateSource(source, { trusted: event.target.checked })} /> Auto-import recognized files</label></div>
            </div>)}
          </div>}
          {message && <div className="mt-4 text-xs" style={{ color: /error|could|not found/i.test(message) ? T.down : T.dim }}>{message}</div>}
        </div>
      </div>
    </div>, document.body
  )
}

function Empty({ icon: Icon, title, text }) {
  return <div className="py-16 text-center"><Icon size={24} style={{ color: T.faint, display: 'inline' }} /><div className="text-sm font-medium mt-2">{title}</div><div className="text-xs mt-1" style={{ color: T.faint }}>{text}</div></div>
}

function BrokerSelect({ value, onChange, className }) {
  return <select style={inputStyle} className={className} value={value || ''} onChange={(event) => onChange(event.target.value)} aria-label="Broker preset"><option value="">Auto-detect broker</option>{BROKER_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
}

function AccountSelect({ value, accounts, onChange, className }) {
  return <select style={inputStyle} className={className} value={value || ''} onChange={(event) => onChange(event.target.value)} aria-label="Destination account"><option value="">Live / personal</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.label || 'Account'}</option>)}</select>
}

function ZoneSelect({ value, onChange, className }) {
  const zones = [...new Set([value, ...commonZones].filter(Boolean))]
  return <select style={inputStyle} className={className} value={value || 'Local time'} onChange={(event) => onChange(event.target.value)} aria-label="Broker timezone">{zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select>
}

import React, { useState } from 'react'
import { Edit2, Trash2, Plus, Check, X } from 'lucide-react'
import { loadCoachMemory, saveCoachMemory } from '../coachMemory.js'

export function CoachMemory({ memory, onChange, includeWritten }) {
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  function persist(next) {
    if (!saveCoachMemory(next)) { setError('Memory could not be saved on this device.'); return false }
    onChange(loadCoachMemory()); setError(''); return true
  }
  return <section className="th-coach-memory">
    <h3>Approved memory</h3>
    <p>{includeWritten ? 'Up to five relevant memories per request. Saved separately from chat.' : 'Excluded from requests by your cloud privacy setting.'}</p>
    {memory.map((item) => <div key={item.id} className="th-memory-item"><span>{item.kind}</span><p>{item.text}</p>
      <button type="button" title="Edit memory" aria-label="Edit memory" onClick={() => setDraft({ ...item })}><Edit2 size={14} /></button>
      <button type="button" title="Forget memory" aria-label="Forget memory" onClick={() => { if (window.confirm('Forget this approved memory?')) { if (persist(memory.filter((row) => row.id !== item.id)) && draft?.id === item.id) setDraft(null) } }}><Trash2 size={14} /></button>
    </div>)}
    {draft ? <form onSubmit={(event) => { event.preventDefault(); const next = [...memory.filter((item) => item.id !== draft.id), draft]; if (persist(next)) setDraft(null) }}>
      <label>Type<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}><option value="preference">Preference</option><option value="correction">Correction</option></select></label>
      <label>Remember<textarea maxLength={800} rows={4} required value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} /></label>
      <button type="submit" disabled={!draft.text.trim()}><Check size={14} /> Approve and save</button>
      <button type="button" title="Cancel memory edit" aria-label="Cancel memory edit" onClick={() => setDraft(null)}><X size={14} /></button>
    </form> : <button type="button" disabled={memory.length >= 20} onClick={() => setDraft({ id: crypto.randomUUID(), kind: 'preference', text: '' })}><Plus size={14} /> Add memory</button>}
    {error && <p role="alert">{error}</p>}
  </section>
}

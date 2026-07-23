import React, { useState, useEffect, useMemo } from 'react'
import { CheckSquare, Square, Zap, Play, Plus, Trash2, AlertTriangle, Target, Monitor, Video, RefreshCw, Clock3 } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, clamp, untilLabel } from '../utils.js'
import { Stat, Panel, Field } from '../components/Shared.jsx'
import { TradePlansPanel } from '../components/TradePlansPanel.jsx'
import { CommitmentFocus } from '../components/CoachCommitmentCard.jsx'

/* ───────── trade mode ───────── */
export function Check({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-2 text-left w-full py-1.5">
      {on ? <CheckSquare size={18} style={{ color: T.up, flexShrink: 0 }} /> : <Square size={18} style={{ color: T.faint, flexShrink: 0 }} />}
      <span className="text-sm" style={{ color: on ? T.text : T.dim }}>{label}</span>
    </button>
  )
}

function durationLabel(milliseconds) {
  const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function sizeLabel(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.max(0, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function TradeModeTab({ settings, onSave, rules, live, arming = false, todayNet, todayCount, weekNet, goal, maxLoss, onStart, onEnd, session, recordingState, elapsed = 0, sessions = [], plans = [], trades = [], accounts = [], playbook = [], profiles = [], planPrefill, onConsumePlanPrefill, commitment, onAddPlan, onUpdatePlan, onDeletePlan }) {
  const [list, setList] = useState(rules)
  const [g, setG] = useState(String(goal || ''))
  const [ml, setMl] = useState(String(maxLoss || ''))
  const [saved, setSaved] = useState(false)
  const cleanRules = (l) => (l || []).map((r) => String(r || '').trim()).filter(Boolean)
  // Key the sync on rule CONTENT, not array identity: `rules` is rebuilt on every
  // settings write (achievements, daily-report flags, …), and depending on its
  // identity wiped in-progress rule edits whenever an unrelated setting saved.
  const savedKey = useMemo(() => JSON.stringify(cleanRules(rules)), [rules])
  useEffect(() => { setList(rules) }, [savedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setG(String(goal || '')); setMl(String(maxLoss || '')) }, [goal, maxLoss])

  // Rules used to persist only via "Save rules & limits", which sits below a separate
  // panel — so deleting or editing a rule looked done but reverted to the defaults on
  // restart. Commit on the discrete moments (delete, leaving a field) instead. Never
  // mid-keystroke: that would round-trip through settings and fight the sync above.
  function commitRules(next) {
    const clean = cleanRules(next)
    if (JSON.stringify(clean) === savedKey) return
    onSave({ tradeRules: JSON.stringify(clean) })
  }
  const edit = (i, v) => setList((p) => p.map((r, j) => (j === i ? v : r)))
  const add = () => setList((p) => [...p, ''])
  const remove = (i) => { const next = list.filter((_, j) => j !== i); setList(next); commitRules(next) }
  function save() {
    const clean = cleanRules(list)
    setList(clean)
    onSave({ tradeRules: JSON.stringify(clean), dailyGoal: parseFloat(g) || 0, maxDailyLoss: parseFloat(ml) || 0 })
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const goalPct = goal > 0 ? clamp((todayNet / goal) * 100, 0, 100) : 0
  const lossPct = maxLoss > 0 ? clamp((-todayNet / maxLoss) * 100, 0, 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4">
        <TradePlansPanel plans={plans} trades={trades} accounts={accounts} playbook={playbook} profiles={profiles} prefill={planPrefill} onConsumePrefill={onConsumePlanPrefill} onAdd={onAddPlan} onUpdate={onUpdatePlan} onDelete={onDeletePlan} />
        <Panel title="Your trading rules" right={
          <button type="button" onClick={add} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Plus size={13} /> Add rule</button>
        }>
          {list.length === 0 ? (
            <div className="text-sm py-3" style={{ color: T.dim }}>No rules yet. Add the checks you want to confirm before every trade.</div>
          ) : (
            <div className="space-y-2">
              {list.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span style={{ color: T.faint }} className="text-xs w-5 text-right">{i + 1}.</span>
                  <input style={inputStyle} className={inp} value={r} onChange={(e) => edit(i, e.target.value)} onBlur={() => commitRules(list)} placeholder="e.g. Stop-loss set before entry" />
                  <button type="button" onClick={() => remove(i)} title="Remove" style={{ color: T.faint }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs mt-3" style={{ color: T.faint }}>These become your pre-flight checklist every time you start a trading day.</p>
        </Panel>

        <Panel title="Daily limits">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily goal $"><input style={inputStyle} className={inp} value={g} onChange={(e) => setG(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Max daily loss $"><input style={inputStyle} className={inp} value={ml} onChange={(e) => setMl(e.target.value)} inputMode="decimal" /></Field>
          </div>
          <p className="text-xs mt-2" style={{ color: T.faint }}>Cross your max loss and Trade Mode throws a full-screen alarm telling you to walk away. It can't close positions — the call is still yours.</p>
        </Panel>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save rules &amp; limits</button>
          {saved && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
        </div>
      </div>

      <div className="space-y-4">
        <CommitmentFocus commitment={commitment} />
        <Panel title="Session">
          {live ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm flex items-center gap-2" style={{ color: T.accent }}><span>●</span> You're live.</div>
                <div className="text-xs flex items-center gap-1.5" style={{ ...mono, color: recordingState?.status === 'recording' ? T.down : T.dim }}>
                  {recordingState?.status === 'recording' ? <Video size={13} /> : <Clock3 size={13} />}
                  {recordingState?.status === 'recording' ? 'REC ' : ''}{durationLabel(elapsed)}
                </div>
              </div>
              {recordingState?.error && <div className="text-xs rounded-md px-2.5 py-2" style={{ color: T.down, background: `${T.down}14`, border: `1px solid ${T.down}55` }}>{recordingState.error} Session timing is still active.</div>}
              <div>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>Toward goal</span><span style={{ ...mono, color: T.text }}>{fmt$(todayNet)} / {fmt$(goal)}</span></div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: T.up, transition: 'width .4s' }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>Toward loss limit</span><span style={{ ...mono, color: T.down }}>{fmt$(-maxLoss)}</span></div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${lossPct}%`, background: T.down, transition: 'width .4s' }} /></div>
              </div>
              <button type="button" onClick={onEnd} className="w-full rounded-md py-2 text-sm font-semibold" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>End session</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Today" value={fmt$(todayNet)} tone={todayNet >= 0 ? 'up' : 'down'} sub={`${todayCount} trades`} />
                <Stat label="This week" value={fmt$(weekNet)} tone={weekNet >= 0 ? 'up' : 'down'} />
              </div>
              <button type="button" onClick={onStart} disabled={arming} aria-busy={arming} className={`th-go-trigger w-full rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-2${arming ? ' th-go-trigger-on' : ''}`} style={{ background: T.accent, color: '#1A1306' }}>
                <Play size={16} /> Start trading day
              </button>
              <p className="text-xs" style={{ color: T.faint }}>Runs your pre-flight checklist, then flips the app into a focused "go time" mode.</p>
            </div>
          )}
        </Panel>
        {!live && sessions.length > 0 && (
          <Panel title="Recent sessions">
            <div className="space-y-2">
              {sessions.slice(0, 4).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-md px-2.5 py-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{new Date(item.startedAt).toLocaleString()}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: T.dim }}>
                      {item.tradeCount} trade{item.tradeCount === 1 ? '' : 's'} · {fmt$(item.netPnl)} · {durationLabel(new Date(item.endedAt || item.startedAt) - new Date(item.startedAt))}
                    </div>
                  </div>
                  {item.recordingUrl && <video controls preload="metadata" src={item.recordingUrl} className="w-24 h-14 object-cover rounded" />}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}

export function Preflight({ rules, checks, setChecks, snapshot, goal, maxLoss, imminent, now, commitment, launching = false, recordingEnabled, setRecordingEnabled, captureSources = [], selectedSource, setSelectedSource, captureLoading, captureError, onRefreshSources, onCancel, onGoLive }) {
  const toggle = (i) => setChecks((c) => ({ ...c, [i]: !c[i] }))
  const unchecked = rules.reduce((n, _, i) => n + (checks[i] ? 0 : 1), 0)
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div className="rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Zap size={18} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">Pre-flight check</div>
            <div className="text-xs" style={{ color: T.dim }}>{dateLabel}</div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          {imminent && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: T.accentSoft, color: T.accent }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>High-impact news — {imminent.country} {imminent.title} in {untilLabel(imminent.ts, now)}. Consider waiting for the print.</span>
            </div>
          )}
          {commitment && (
            <div className="rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: T.accentSoft, border: `1px solid ${T.accent}`, color: T.text }}>
              <Target size={15} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: T.accent }}>Current coach focus</div>
                <div className="text-sm font-semibold mt-0.5">{commitment.title}</div>
                <div className="text-xs mt-0.5" style={{ color: T.dim }}>{commitment.evaluatedCount}/{commitment.targetCount} trades measured · process first, outcome second</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Today" value={fmt$(snapshot.todayNet)} tone={snapshot.todayNet >= 0 ? 'up' : 'down'} sub={`${snapshot.todayCount} trades`} />
            <Stat label="This week" value={fmt$(snapshot.weekNet)} tone={snapshot.weekNet >= 0 ? 'up' : 'down'} />
            <Stat label="Goal / stop" value={fmt$(goal)} sub={`stop ${fmt$(-maxLoss)}`} tone="accent" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: T.faint }}>Your rules</div>
            {rules.length === 0 ? (
              <div className="text-sm py-3" style={{ color: T.dim }}>No rules yet — add them in the Trade Mode tab.</div>
            ) : (
              <div className="rounded-lg px-3 py-1" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                {rules.map((r, i) => <Check key={i} on={!!checks[i]} label={r} onClick={() => toggle(i)} />)}
              </div>
            )}
            <div className="text-xs mt-2" style={{ color: T.faint }}>Tick what you've confirmed — this is on your honor.</div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>Session recording</div>
                <div className="text-xs mt-0.5" style={{ color: T.dim }}>Video only. Saved locally and linked to trades from this session.</div>
              </div>
              <button type="button" onClick={() => setRecordingEnabled(!recordingEnabled)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: recordingEnabled ? T.accentSoft : T.surface2, color: recordingEnabled ? T.accent : T.dim, border: `1px solid ${recordingEnabled ? T.accent : T.line}` }}>
                {recordingEnabled ? 'Recording on' : 'No recording'}
              </button>
            </div>
            {recordingEnabled && (
              <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs" style={{ color: T.dim }}>{captureLoading ? 'Finding screens and windows…' : 'Choose what TradeHelp should record'}</span>
                  <button type="button" onClick={onRefreshSources} disabled={captureLoading} title="Refresh capture choices" style={{ color: T.faint }}><RefreshCw size={14} className={captureLoading ? 'animate-spin' : ''} /></button>
                </div>
                {captureError && <div className="text-xs mb-2" style={{ color: T.down }}>{captureError}</div>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {captureSources.map((source) => {
                    const active = selectedSource?.id === source.id
                    return (
                      <button key={source.id} type="button" onClick={() => setSelectedSource(source)} className="text-left rounded-md overflow-hidden" style={{ background: T.surface, border: `1px solid ${active ? T.accent : T.line}` }}>
                        <div className="aspect-video flex items-center justify-center overflow-hidden" style={{ background: '#090C12' }}>
                          {source.thumbnail ? <img src={source.thumbnail} alt="" className="w-full h-full object-cover" /> : <Monitor size={22} style={{ color: T.faint }} />}
                        </div>
                        <div className="px-2 py-1.5 text-[11px] truncate" style={{ color: active ? T.accent : T.dim }}>{source.name}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <button type="button" onClick={onCancel} disabled={launching} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Cancel</button>
          <button type="button" onClick={onGoLive} disabled={launching || (recordingEnabled && !selectedSource)} aria-busy={launching} className={`th-go-trigger rounded-md px-4 py-2 text-sm font-semibold flex items-center gap-1.5${launching ? ' th-go-trigger-on' : ''}`} style={{ background: T.accent, color: '#1A1306', opacity: recordingEnabled && !selectedSource ? 0.5 : 1 }}>
            <Zap size={15} /> {launching ? 'Locking in…' : `Go live${unchecked > 0 ? ` (${unchecked} unchecked)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function LiveBanner({ net, goal, maxLoss, lossHit, recordingState, elapsed = 0, onEnd }) {
  const lossPct = maxLoss > 0 ? clamp((-net / maxLoss) * 100, 0, 100) : 0
  const bg = lossHit ? T.down : T.accent
  return (
    <div className="w-full" style={{ background: bg, color: '#1A0E06' }}>
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={mono}>
        <span className="font-bold tracking-wide flex items-center gap-2">● LIVE — TRADE MODE</span>
        <span className="flex items-center gap-1.5 font-semibold">
          {recordingState?.status === 'recording' && <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#7A0B18' }} />}
          {recordingState?.status === 'recording' ? 'REC' : 'SESSION'} {durationLabel(elapsed)}
        </span>
        <span>Today <strong>{fmt$(net)}</strong>{goal > 0 ? ` / ${fmt$(goal)}` : ''}</span>
        {maxLoss > 0 && (
          <span className="flex items-center gap-2">
            Loss limit
            <span className="inline-block h-2 w-24 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)' }}>
              <span className="block h-full" style={{ width: `${lossPct}%`, background: '#1A0E06' }} />
            </span>
            {fmt$(-maxLoss)}
          </span>
        )}
        <button type="button" onClick={onEnd} className="ml-auto px-3 py-1 rounded-md text-sm font-semibold" style={{ background: '#1A0E06', color: bg }}>End session</button>
      </div>
    </div>
  )
}

export function SessionEndReview({ session, recordingState, onSave, onDiscardRecording }) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  if (!session) return null
  async function submit(discard = false) {
    setSaving(true)
    try {
      if (discard) await onDiscardRecording()
      await onSave(notes)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[80]" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)' }}>
      <div className="rounded-xl w-full max-w-lg" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="text-base font-semibold">Session complete</div>
          <div className="text-xs mt-1" style={{ color: T.dim }}>Review the session before returning to normal mode.</div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Duration" value={durationLabel(new Date(session.endedAt || Date.now()) - new Date(session.startedAt))} />
            <Stat label="Trades" value={String(session.tradeCount || 0)} />
            <Stat label="Net P&L" value={fmt$(session.netPnl)} tone={session.netPnl >= 0 ? 'up' : 'down'} />
          </div>
          {session.recordingStatus === 'ready' && (
            <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <div className="flex justify-between text-xs mb-2"><span>Session recording</span><span style={{ color: T.dim }}>{sizeLabel(session.size)}</span></div>
              <video controls preload="metadata" src={session.recordingUrl} className="w-full rounded-md max-h-56" />
            </div>
          )}
          {recordingState?.error && <div className="text-xs" style={{ color: T.down }}>{recordingState.error}</div>}
          <Field label="Session notes">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="What worked? What needs adjustment?" className="w-full rounded-md px-3 py-2 text-sm resize-y" style={inputStyle} />
          </Field>
        </div>
        <div className="px-5 py-4 flex flex-wrap justify-end gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          {session.recordingStatus === 'ready' && <button type="button" disabled={saving} onClick={() => submit(true)} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.down, border: `1px solid ${T.line}` }}>Delete recording &amp; save</button>}
          <button type="button" disabled={saving} onClick={() => submit(false)} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>{saving ? 'Saving…' : 'Save session'}</button>
        </div>
      </div>
    </div>
  )
}

export function Lockout({ net, maxLoss, onEnd, onDismiss }) {
  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[60]" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-xl w-full max-w-md p-6 text-center" style={{ background: T.surface, border: `1px solid ${T.down}` }}>
        <div className="flex justify-center mb-3"><AlertTriangle size={40} style={{ color: T.down }} /></div>
        <div className="text-lg font-semibold">Daily loss limit reached</div>
        <div className="text-sm mt-2" style={{ color: T.dim }}>
          You're down <span style={{ color: T.down, ...mono }}>{fmt$(net)}</span> today — past your{' '}
          <span style={mono}>{fmt$(-maxLoss)}</span> stop. The edge for today is gone. Step away.
        </div>
        <div className="flex gap-2 justify-center mt-5">
          <button type="button" onClick={onEnd} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.down, color: '#2A0A10' }}>End session</button>
          <button type="button" onClick={onDismiss} className="rounded-md px-4 py-2 text-sm" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>Keep trading anyway</button>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, ArrowRight, Sparkles, Target, X } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, periodLabel, streamChat } from '../utils.js'

function Metric({ label, value, tone = T.text }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'rgba(8,12,18,.42)', border: '1px solid rgba(255,255,255,.09)' }}>
      <div className="text-[10px] uppercase tracking-[.16em]" style={{ color: T.dim }}>{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ ...mono, color: tone }}>{value}</div>
    </div>
  )
}

export function WeeklyWrapContent({ wrap, hideFocus = false }) {
  // 'week' or 'month' — the same recap is used for both, so wording follows the data.
  const noun = wrap?.granularity === 'quarter' ? 'quarter' : wrap?.granularity === 'month' ? 'month' : 'week'
  if (!wrap) return null
  const weakness = wrap.weakness
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Net P&L" value={fmt$(wrap.stats.totalPnl)} tone={wrap.stats.totalPnl >= 0 ? T.up : T.down} />
        <Metric label="Record" value={`${wrap.wins}W · ${wrap.losses}L${wrap.flat ? ` · ${wrap.flat}F` : ''}`} />
        <Metric label="Win rate" value={`${fmtN(wrap.stats.winRate, 0)}%`} />
        <Metric label="Rule breaks" value={String(wrap.ruleBreaks.length)} tone={wrap.ruleBreaks.length ? T.down : T.up} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: T.faint }}>Pattern that kept showing up</div>
          <div className="text-sm font-semibold mt-1">{wrap.recurringSetup?.label || wrap.dominantEmotion?.label || 'No repeated setup yet'}</div>
          <div className="text-xs mt-1" style={{ color: T.dim }}>
            {wrap.recurringSetup ? `${wrap.recurringSetup.count} trades used this setup` : 'Keep tagging setups to make this sharper.'}
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: weakness ? `${T.down}0D` : `${T.up}0D`, border: `1px solid ${weakness ? `${T.down}55` : `${T.up}55`}` }}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: weakness ? T.down : T.up }}>Current weakness</div>
          <div className="text-sm font-semibold mt-1">{weakness?.label || 'No repeated leak detected'}</div>
          <div className="text-xs mt-1" style={{ color: T.dim }}>{weakness ? `${weakness.count} occurrence${weakness.count === 1 ? '' : 's'} this ${noun}` : 'Your logged process stayed clean.'}</div>
        </div>
      </div>
      {!hideFocus && (
        <div className="rounded-lg p-3.5 flex gap-3" style={{ background: T.accentSoft, border: `1px solid ${T.accent}55` }}>
          <Target size={18} style={{ color: T.accentText, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: T.accentText }}>One focus for next {noun}</div>
            <div className="text-sm mt-1" style={{ color: T.text }}>{wrap.focus}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export function WeeklyWrapModal({ wrap, settings = {}, onClose, onOpenReview, onSaveFocus, priorFocus = '' }) {
  const noun = wrap?.granularity === 'quarter' ? 'quarter' : wrap?.granularity === 'month' ? 'month' : 'week'
  const [coach, setCoach] = useState(null)
  // The generated line is a starting point, not the answer. Whatever the trader types
  // replaces it and is what gets carried into the next period.
  const savedFocus = useMemo(() => {
    try {
      const map = JSON.parse(settings?.wrapFocus || '{}')
      return typeof map?.[wrap?.weekKey] === 'string' ? map[wrap.weekKey] : ''
    } catch { return '' }
  }, [settings?.wrapFocus, wrap?.weekKey])
  const [focus, setFocus] = useState('')
  const [focusSaved, setFocusSaved] = useState(false)
  useEffect(() => { setFocus(savedFocus || wrap?.focus || ''); setFocusSaved(false) }, [savedFocus, wrap?.focus, wrap?.weekKey])
  async function saveFocus() {
    await onSaveFocus?.(wrap.weekKey, focus.trim())
    setFocusSaved(true)
  }
  async function addCoachNote() {
    if (coach?.loading || !window.api?.aiChatStream) return
    setCoach({ loading: true })
    const weakness = wrap.weakness?.label || 'no repeated leak'
    const payload = {
      system: 'You are a concise trading process coach. Use only the supplied stats for this period. Give one encouraging observation and one concrete process adjustment. No price predictions or financial advice. Plain text only, under 90 words.',
      messages: [{ role: 'user', content: `${noun[0].toUpperCase()}${noun.slice(1)} ${wrap.weekKey}: ${wrap.trades.length} trades, ${wrap.wins} wins, ${wrap.losses} losses, net ${fmt$(wrap.stats.totalPnl)}, win rate ${fmtN(wrap.stats.winRate, 1)}%, ${wrap.ruleBreaks.length} rule breaks, current weakness: ${weakness}. Trader name: ${settings.traderName || 'not provided'}.` }]
    }
    try {
      let text = ''
      await streamChat(payload, (delta) => { text += delta; setCoach({ text }) })
    } catch (error) {
      setCoach({ error: String(error?.message || error) })
    }
  }
  return (
    <div className="th-overlay fixed inset-0 z-[86] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.74)', backdropFilter: 'blur(7px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl" style={{ background: `linear-gradient(145deg, ${T.surface}, ${T.bg})`, border: `1px solid ${T.accent}66`, boxShadow: '0 26px 80px rgba(0,0,0,.5)' }} onClick={(event) => event.stopPropagation()}>
        <div className="p-5 sm:p-6" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[.24em] font-semibold" style={{ color: T.accentText }}>Your {noun} in review</div>
              <h2 className="text-2xl sm:text-3xl font-semibold mt-1">{periodLabel(wrap.weekKey, noun)}</h2>
              <p className="text-sm mt-2" style={{ color: T.dim }}>{wrap.headline}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={`Close ${noun}ly wrap-up`} style={{ color: T.dim }}><X size={20} /></button>
          </div>
        </div>
        <div className="p-5 sm:p-6">
          {/* Whether the focus set last period actually held is the point of setting one. */}
          {priorFocus && (
            <div className="rounded-lg p-3.5 mb-4 flex gap-3" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              <Target size={18} style={{ color: T.dim, flexShrink: 0, marginTop: 1 }} />
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: T.dim }}>Last {noun} you said you would focus on</div>
                <div className="text-sm mt-1" style={{ color: T.text }}>{priorFocus}</div>
              </div>
            </div>
          )}
          <WeeklyWrapContent wrap={wrap} hideFocus />

          <div className="rounded-lg p-3.5 mt-4" style={{ background: T.accentSoft, border: `1px solid ${T.accent}55` }}>
            <div className="flex items-center gap-2">
              <Target size={16} style={{ color: T.accentText }} />
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: T.accentText }}>One focus for next {noun}</span>
            </div>
            <textarea
              value={focus}
              onChange={(event) => { setFocus(event.target.value); setFocusSaved(false) }}
              rows={2}
              placeholder={`What is the one thing you will hold to next ${noun}?`}
              className="w-full rounded-md px-3 py-2 text-sm mt-2 resize-none outline-none"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text }}
            />
            <div className="flex items-center gap-2 mt-2">
              <button type="button" onClick={saveFocus} disabled={!focus.trim()}
                className="rounded-md px-3 py-1.5 text-xs font-semibold"
                style={{ background: T.accent, color: '#1A1306', opacity: focus.trim() ? 1 : 0.5 }}>Save focus</button>
              {focus.trim() && focus.trim() !== (savedFocus || '').trim() && !focusSaved && (
                <span className="text-[11px]" style={{ color: T.faint }}>Unsaved</span>
              )}
              {focusSaved && <span className="text-[11px]" style={{ color: T.up }}>Saved ✓</span>}
              <button type="button" onClick={() => { setFocus(wrap.focus || ''); setFocusSaved(false) }}
                className="ml-auto text-[11px]" style={{ color: T.dim }}>Use the suggestion</button>
            </div>
          </div>
          {coach && (
            <div className="rounded-lg p-3.5 mt-4 text-sm whitespace-pre-wrap" style={{ background: T.surface2, border: `1px solid ${T.line}`, color: coach.error ? T.down : T.text }}>
              {coach.loading ? `Your local coach is reviewing the ${noun}…` : coach.error || coach.text}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 mt-5">
            <button type="button" onClick={addCoachNote} disabled={coach?.loading} className="rounded-md px-3 py-2 text-sm flex items-center gap-1.5" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}><Sparkles size={14} /> Add optional Coach note</button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm" style={{ color: T.dim }}>Done</button>
              <button type="button" onClick={onOpenReview} className="rounded-md px-3 py-2 text-sm font-semibold flex items-center gap-1.5" style={{ background: T.accent, color: '#1A1306' }}>Open {noun}ly review <ArrowRight size={14} /></button>
            </div>
          </div>
          <div className="flex gap-1.5 mt-3 text-[11px]" style={{ color: T.faint }}><AlertTriangle size={12} /> Stats are local and automatic. The Coach note only runs when you ask for it.</div>
        </div>
      </div>
    </div>
  )
}

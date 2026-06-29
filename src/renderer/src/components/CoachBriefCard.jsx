import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, RefreshCw, Sparkles } from 'lucide-react'
import { T } from '../theme.js'
import { buildCoachBrief, coachSnapshotKey, proactiveCoachPayload } from '../coachInsights.js'
import { fullJournalContext } from '../stats.js'

function aiConfigured(settings) {
  if (settings?.provider === 'cloud') {
    const hostedOpenAi = /api\.openai\.com/i.test(settings.cloudUrl || '')
    return Boolean(settings.cloudUrl && settings.cloudModel && (settings.cloudKey || !hostedOpenAi))
  }
  return Boolean(settings?.ollamaUrl && settings?.ollamaModel)
}

export function CoachBriefCard({ trades, stats, settings, journalData = {}, onSaveSettings, onOpenCoach }) {
  const brief = useMemo(() => buildCoachBrief(trades, stats), [trades, stats])
  const includeWritten = settings?.provider !== 'cloud' || (settings?.cloudJournalAccess ?? 'true') !== 'false'
  const context = useMemo(() => fullJournalContext({ trades, stats, settings, ...journalData }, { includeWritten }), [trades, stats, settings, journalData, includeWritten])
  const snapshot = useMemo(() => coachSnapshotKey(trades, context), [trades, context])
  const cached = settings?.coachBriefSnapshot === snapshot ? settings?.coachBriefText : ''
  const [aiText, setAiText] = useState(cached || '')
  const [loading, setLoading] = useState(false)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setAiText(cached || '') }, [cached, snapshot])

  async function enhance(manual = false) {
    if (!stats.n || loading || !window.api?.aiChat || !aiConfigured(settings)) return
    setLoading(true)
    if (!manual) await onSaveSettings?.({ coachBriefAttempt: snapshot })
    try {
      const res = await window.api.aiChat(proactiveCoachPayload(context, brief))
      if (res?.ok && res.text) {
        if (mounted.current) setAiText(res.text)
        await onSaveSettings?.({ coachBriefSnapshot: snapshot, coachBriefText: res.text, coachBriefAttempt: snapshot })
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  useEffect(() => {
    const enabled = (settings?.proactiveCoachEnabled ?? 'true') !== 'false'
    if (enabled && stats.n >= 3 && aiConfigured(settings) && !cached && settings?.coachBriefAttempt !== snapshot) enhance(false)
  }, [snapshot, settings?.proactiveCoachEnabled, settings?.provider, settings?.cloudKey, settings?.ollamaModel])

  return (
    <section className="rounded-lg overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Bot size={16} style={{ color: T.accent }} />
        <span className="text-sm font-semibold">Coach brief</span>
        <span className="text-xs ml-auto" style={{ color: aiText ? T.up : T.faint }}>{aiText ? 'AI enhanced' : 'Always available'}</span>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <div>
          <div className="text-base font-semibold" style={{ color: T.text }}>{brief.headline}</div>
          <p className="text-sm mt-1 leading-relaxed" style={{ color: T.dim }}>{aiText || brief.summary}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {aiConfigured(settings) && (
              <button type="button" onClick={() => enhance(true)} disabled={loading} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>
                {loading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {loading ? 'Reviewing...' : aiText ? 'Refresh AI read' : 'Add AI read'}
              </button>
            )}
            <button type="button" onClick={onOpenCoach} className="text-xs px-2.5 py-1.5 rounded-md" style={{ color: T.dim, border: `1px solid ${T.line}` }}>Open coach</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          <div className="rounded-md p-3" style={{ background: T.surface2 }}>
            <div className="text-xs uppercase" style={{ color: T.up }}>Keep</div>
            <div className="text-sm mt-1" style={{ color: T.text }}>{brief.strength}</div>
          </div>
          <div className="rounded-md p-3" style={{ background: T.surface2 }}>
            <div className="text-xs uppercase" style={{ color: T.accent }}>Next focus</div>
            <div className="text-sm mt-1" style={{ color: T.text }}>{brief.focus}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

import React from 'react'
import { ArrowRight, BookOpen, X } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$ } from '../utils.js'

export function PrivateBriefingBubble({ briefing, updatedAt, onClose, onOpen }) {
  if (!briefing) return null
  const urgent = briefing.guardrail?.state === 'stop' || briefing.commitment?.capReached || briefing.eventRisk?.level === 'imminent'
  const caution = briefing.guardrail?.state === 'caution' || briefing.eventRisk?.level === 'near'
  const color = urgent ? T.down : caution ? T.accentText : T.accent
  const insight = briefing.insights?.find((item) => item.tone === 'risk' || item.tone === 'caution') || briefing.insights?.[0]

  return (
    <aside role="status" aria-live="polite" className="fixed bottom-4 left-4 z-[74] w-[370px] max-w-[calc(100vw-2rem)] rounded-xl th-fade"
      style={{ background: T.surface, border: `1px solid ${color}`, boxShadow: '0 12px 30px rgba(0,0,0,0.42)' }}>
      <div className="p-3.5">
        <div className="flex items-start gap-2.5">
          <BookOpen size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>Private briefing</div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: T.text }}>{briefing.headline}</div>
          </div>
          <button type="button" onClick={onClose} style={{ color: T.faint }} aria-label="Dismiss private briefing"><X size={15} /></button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs" style={{ color: T.dim }}>
          <span>{briefing.session.label}</span>
          <span>{briefing.eventRisk.detail}</span>
          <span style={mono}>{fmt$(briefing.guardrail.net)} today · {briefing.guardrail.trades} trade{briefing.guardrail.trades === 1 ? '' : 's'}</span>
        </div>
        {insight && (
          <div className="rounded-lg px-2.5 py-2 mt-2 text-xs" style={{ background: T.surface2 }}>
            <strong style={{ color: insight.tone === 'risk' ? T.down : insight.tone === 'positive' ? T.up : T.text }}>{insight.title}</strong>
            <span style={{ color: T.dim }}> · {insight.detail}</span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
            Open briefing <ArrowRight size={12} />
          </button>
          {updatedAt && <span className="text-[10px]" style={{ color: T.faint }}>Updated {new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      </div>
    </aside>
  )
}

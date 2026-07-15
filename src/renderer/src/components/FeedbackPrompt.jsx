import React from 'react'
import { MessagesSquare, X } from 'lucide-react'
import { T } from '../theme.js'

// One-time, well-timed feedback nudge. Presentational only — App owns when it shows
// (after a usage milestone), where it routes, and marks it permanently seen.
export function FeedbackPrompt({ onShare, onDismiss }) {
  return (
    <div className="fixed bottom-4 left-4 z-[75] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl p-4"
      style={{ background: T.surface, border: `1px solid ${T.accent}`, boxShadow: '0 16px 44px rgba(0,0,0,0.5)' }}>
      <button type="button" onClick={onDismiss} title="Dismiss" className="absolute top-2.5 right-2.5 p-1 rounded hover:opacity-70" style={{ color: T.faint }}><X size={15} /></button>
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: T.text }}>
        <MessagesSquare size={16} style={{ color: T.accent }} /> How's TradeHelp treating you?
      </div>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: T.dim }}>
        You've journaled a good stretch of trades now. TradeHelp is built by one trader — a quick word on what's working, or what's missing, genuinely shapes what ships next.
      </p>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onShare} className="flex-1 rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Share feedback</button>
        <button type="button" onClick={onDismiss} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>Maybe later</button>
      </div>
    </div>
  )
}

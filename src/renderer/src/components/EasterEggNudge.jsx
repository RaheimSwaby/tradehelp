import React from 'react'
import { PauseCircle, Sparkles, X } from 'lucide-react'
import { T } from '../theme.js'

export function EasterEggNudge({ nudge, onClose, onBreak }) {
  if (!nudge) return null
  return (
    <div className="fixed bottom-4 left-4 z-[76] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden"
      style={{ background: T.surface, border: `1px solid ${nudge.action === 'break' ? T.down : T.accent}`, boxShadow: '0 16px 42px rgba(0,0,0,0.46)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        {nudge.action === 'break'
          ? <PauseCircle size={17} style={{ color: T.down }} />
          : <Sparkles size={17} style={{ color: T.accent }} />}
        <div className="text-sm font-semibold">{nudge.title}</div>
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded hover:opacity-70" style={{ color: T.faint }} title="Close"><X size={16} /></button>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="text-sm leading-relaxed" style={{ color: T.dim }}>{nudge.body}</div>
        {nudge.action === 'break' && (
          <button type="button" onClick={onBreak} className="w-full rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
            Take a break
          </button>
        )}
      </div>
    </div>
  )
}

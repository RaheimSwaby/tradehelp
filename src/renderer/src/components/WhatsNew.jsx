import React from 'react'
import { Sparkles, X } from 'lucide-react'
import { T } from '../theme.js'

export function WhatsNew({ info, onClose }) {
  const notes = (info.notes || '').trim()
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[70]" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose}>
      <div className="rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Sparkles size={18} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">What's new</div>
            <div className="text-xs" style={{ color: T.dim }}>You're now on v{info.version}</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 text-sm whitespace-pre-wrap" style={{ color: T.text }}>
          {notes || 'Thanks for keeping TradeHelp up to date — enjoy the latest improvements.'}
        </div>
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.line}` }}>
          <button type="button" onClick={onClose} className="w-full rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Got it</button>
        </div>
      </div>
    </div>
  )
}

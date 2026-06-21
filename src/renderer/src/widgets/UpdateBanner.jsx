import React from 'react'
import { Sparkles } from 'lucide-react'
import { T } from '../theme.js'

export function UpdateBanner({ onInstall }) {
  return (
    <div className="fixed bottom-4 left-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
      <Sparkles size={18} style={{ color: T.accent }} />
      <div className="text-sm">A new version is ready.</div>
      <button type="button" onClick={onInstall} className="rounded-md px-3 py-1.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Restart to update</button>
    </div>
  )
}

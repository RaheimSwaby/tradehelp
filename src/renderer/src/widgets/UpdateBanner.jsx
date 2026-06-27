import React from 'react'
import { Sparkles } from 'lucide-react'
import { T, withAlpha } from '../theme.js'

export function UpdateBanner({ info = {}, onInstall }) {
  return (
    <div className="fixed bottom-4 left-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: withAlpha(T.surface, 0.78), backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: `1px solid ${T.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
      <Sparkles size={18} style={{ color: T.accent }} />
      <div>
        <div className="text-sm font-semibold">{info.version ? `v${info.version} downloaded` : 'Update downloaded'}</div>
        <div className="text-xs" style={{ color: T.dim }}>Ready in the background · restart to apply</div>
      </div>
      <button type="button" onClick={onInstall} className="rounded-md px-3 py-1.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Restart now</button>
    </div>
  )
}

import React from 'react'
import { ArrowUpCircle, X } from 'lucide-react'
import { T } from '../theme.js'

// Top banner nudging the user to grab a newer version. Shown mainly on macOS,
// where the unsigned build can't auto-update — opens the landing page (which has
// the download + the one-time install command).
export function UpdateAvailableBanner({ info, onClose }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accent }}>
        <ArrowUpCircle size={14} />
        <span>TradeHelp <strong>v{info.version}</strong> is available — you're on v{info.current}.</span>
        <button type="button" onClick={() => window.api.openExternal('https://raheimswaby.github.io/tradehelp')} className="ml-auto px-2.5 py-0.5 rounded-md font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Download update</button>
        <button type="button" onClick={onClose} title="Dismiss" style={{ color: T.accent }}><X size={14} /></button>
      </div>
    </div>
  )
}

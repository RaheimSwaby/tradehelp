import React from 'react'
import { ArrowUpCircle, X } from 'lucide-react'
import { T } from '../theme.js'

export function UpdateAvailableBanner({ info, onClose }) {
  const downloadUrl = info.platform === 'win32'
    ? (info.exeUrl || info.url || 'https://raheimswaby.github.io/tradehelp')
    : (info.dmgUrl || info.url || 'https://raheimswaby.github.io/tradehelp')

  const label = info.platform === 'win32' ? 'Download .exe' : 'Download .dmg'

  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accent }}>
        <ArrowUpCircle size={14} />
        <span>TradeHelp <strong>v{info.version}</strong> is available — you're on v{info.current}.</span>
        <button
          type="button"
          onClick={() => window.api.openExternal(downloadUrl)}
          className="ml-auto px-2.5 py-0.5 rounded-md font-semibold"
          style={{ background: T.accent, color: '#1A1306' }}
        >{label}</button>
        <button type="button" onClick={onClose} title="Dismiss" style={{ color: T.accent }}><X size={14} /></button>
      </div>
    </div>
  )
}

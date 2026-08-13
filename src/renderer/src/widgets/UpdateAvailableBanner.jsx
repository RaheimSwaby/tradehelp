import React from 'react'
import { ArrowUpCircle, X } from 'lucide-react'
import { T } from '../theme.js'

export function UpdateAvailableBanner({ info, onClose }) {
  const downloads = {
    win32: { url: info.exeUrl, label: 'Download .exe' },
    darwin: { url: info.dmgUrl, label: 'Download .dmg' },
    linux: { url: info.appImageUrl, label: 'Download AppImage' }
  }
  const download = downloads[info.platform] || { url: '', label: 'View release' }
  const downloadUrl = download.url || info.url || 'https://raheimswaby.github.io/tradehelp'

  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ color: T.accentText }}>
        <ArrowUpCircle size={14} />
        <span>TradeHelp <strong>v{info.version}</strong> is available — you're on v{info.current}.</span>
        <button
          type="button"
          onClick={() => window.api.openExternal(downloadUrl)}
          className="ml-auto px-2.5 py-0.5 rounded-md font-semibold"
          style={{ background: T.accent, color: '#1A1306' }}
        >{download.label}</button>
        <button type="button" onClick={onClose} title="Dismiss" style={{ color: T.accentText }}><X size={14} /></button>
      </div>
    </div>
  )
}

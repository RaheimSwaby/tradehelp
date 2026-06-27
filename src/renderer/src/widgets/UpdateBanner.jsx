import React from 'react'
import { Sparkles, Download, RefreshCw } from 'lucide-react'
import { T } from '../theme.js'

// state: 'available' | 'downloading' | 'ready'
export function UpdateBanner({ info = {}, state = 'available', onDownload, onInstall }) {
  return (
    <div className="fixed bottom-4 left-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', minWidth: 280 }}>
      <Sparkles size={18} style={{ color: T.accent, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        {state === 'available' && (
          <>
            <div className="text-sm font-semibold">{info.version ? `v${info.version} available` : 'Update available'}</div>
            <div className="text-xs" style={{ color: T.dim }}>Click to download and install</div>
          </>
        )}
        {state === 'downloading' && (
          <>
            <div className="text-sm font-semibold">Downloading{info.version ? ` v${info.version}` : ''}…</div>
            <div className="text-xs" style={{ color: T.dim }}>{info.percent != null ? `${info.percent}%` : 'Please wait'}</div>
          </>
        )}
        {state === 'ready' && (
          <>
            <div className="text-sm font-semibold">{info.version ? `v${info.version} ready` : 'Update ready'}</div>
            <div className="text-xs" style={{ color: T.dim }}>Restart to apply</div>
          </>
        )}
      </div>
      {state === 'available' && (
        <button type="button" onClick={onDownload} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shrink-0" style={{ background: T.accent, color: '#1A1306' }}>
          <Download size={13} /> Update now
        </button>
      )}
      {state === 'downloading' && (
        <RefreshCw size={16} style={{ color: T.accent, flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      )}
      {state === 'ready' && (
        <button type="button" onClick={onInstall} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shrink-0" style={{ background: T.accent, color: '#1A1306' }}>
          <RefreshCw size={13} /> Restart now
        </button>
      )}
    </div>
  )
}

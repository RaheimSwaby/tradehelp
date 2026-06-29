import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, Share2, X } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { buildShareReport, DEFAULT_SHARE_OPTIONS, drawShareReport } from '../shareReport.js'

const CONTROLS = [
  ['rating', 'Trader rating'], ['execution', 'Average execution grade'], ['selfGrades', 'Self-graded setup and execution'],
  ['netPnl', 'Net P&L'], ['winRate', 'Win rate'], ['profitFactor', 'Profit factor'], ['expectancy', 'Expectancy'],
  ['drawdown', 'Maximum drawdown'], ['tradeCount', 'Trade count'], ['equity', 'Equity curve'],
  ['recentGrades', 'Recent trade grades'], ['symbols', 'Ticker symbols']
]

const canvasBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

export function ShareReportModal({ trades, accountLabel, accent, onClose }) {
  const [range, setRange] = useState('30')
  const [options, setOptions] = useState(DEFAULT_SHARE_OPTIONS)
  const [status, setStatus] = useState('')
  const canvasRef = useRef(null)
  const report = useMemo(() => buildShareReport(trades, range, accountLabel), [trades, range, accountLabel])

  useEffect(() => {
    if (canvasRef.current) drawShareReport(canvasRef.current, report, options, accent)
  }, [report, options, accent])
  useEffect(() => {
    const close = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }))
  const filename = `TradeHelp-report-${new Date().toISOString().slice(0, 10)}.png`

  async function save() {
    const dataUrl = canvasRef.current.toDataURL('image/png')
    const res = window.api?.saveReportPng ? await window.api.saveReportPng(dataUrl, filename) : null
    if (res?.ok) setStatus('PNG saved')
    else if (!window.api?.saveReportPng) {
      const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click(); setStatus('PNG downloaded')
    } else if (res?.error) setStatus(res.error)
  }

  async function copy() {
    try {
      const blob = await canvasBlob(canvasRef.current)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setStatus('Image copied')
    } catch { setStatus('Clipboard unavailable - save the PNG instead') }
  }

  async function share() {
    try {
      const blob = await canvasBlob(canvasRef.current)
      const file = new File([blob], filename, { type: 'image/png' })
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) throw new Error('unsupported')
      await navigator.share({ files: [file], title: 'TradeHelp performance report' })
    } catch { setStatus('System sharing unavailable - save the PNG and post it anywhere') }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(5,8,12,0.82)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-6xl max-h-[94vh] rounded-lg overflow-hidden flex flex-col" style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}`, boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}>
        <header className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Share2 size={17} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">Share performance report</div>
            <div className="text-xs" style={{ color: T.faint }}>Preview exactly what leaves your computer.</div>
          </div>
          <button type="button" title="Close" onClick={onClose} className="ml-auto p-1.5 rounded-md" style={{ color: T.dim }}><X size={18} /></button>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px] min-h-0 flex-1">
          <div className="p-4 overflow-auto flex justify-center" style={{ background: T.bg }}>
            <canvas ref={canvasRef} aria-label="Performance report preview" style={{ width: 'min(100%, 500px)', height: 'auto', alignSelf: 'flex-start', boxShadow: '0 12px 34px rgba(0,0,0,0.4)' }} />
          </div>
          <aside className="p-4 overflow-y-auto" style={{ borderLeft: `1px solid ${T.line}` }}>
            <label className="block text-xs" style={{ color: T.dim }}>
              Date range
              <select value={range} onChange={(e) => setRange(e.target.value)} className="w-full rounded px-2 py-2 text-sm mt-1" style={inputStyle}>
                <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm mt-4 cursor-pointer" style={{ color: T.text }}>
              <input type="checkbox" checked={options.hideMoney} onChange={() => toggle('hideMoney')} /> Hide every dollar amount
            </label>
            <div className="text-xs uppercase mt-5 mb-2" style={{ color: T.faint }}>Include</div>
            <div className="space-y-2">
              {CONTROLS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.dim, opacity: key === 'symbols' && !options.recentGrades ? 0.45 : 1 }}>
                  <input type="checkbox" checked={options[key]} disabled={key === 'symbols' && !options.recentGrades} onChange={() => toggle(key)} /> {label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button type="button" onClick={save} className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}><Download size={15} /> Save PNG</button>
              <button type="button" onClick={copy} className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}><Copy size={15} /> Copy</button>
              <button type="button" onClick={share} className="col-span-2 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}><Share2 size={15} /> Share with installed apps</button>
            </div>
            {status && <div className="flex items-center gap-1.5 text-xs mt-3" style={{ color: status.includes('unavailable') ? T.dim : T.up }}><Check size={13} /> {status}</div>}
            <p className="text-xs mt-4 leading-relaxed" style={{ color: T.faint }}>The PNG is created locally. TradeHelp does not upload the report or create a public link.</p>
          </aside>
        </div>
      </div>
    </div>
  )
}

import React, { useMemo, useState, useRef, useEffect } from 'react'
import { CalendarClock, X, Sparkles } from 'lucide-react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, streamChat, TILT } from '../utils.js'
import { buildDailyReport, dailyReportAiPayload } from '../coachInsights.js'

export function buildDailyReportAiPayload(report, settings = {}) {
  return dailyReportAiPayload(report, settings.coachVoice)
}

const dayLabel = (date) => {
  const d = new Date(date + 'T00:00:00')
  return isNaN(d) ? date : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// Floating "last session" review — pops up once per app launch. Basic summary
// always renders; the AI review is on-demand so it never blocks or spends tokens
// unless asked. Returns null when the target day has no trades.
export function DailyReport({ trades, date, settings, onClose, onOpenCoach }) {
  const report = useMemo(() => buildDailyReport(trades, date), [trades, date])
  const [ai, setAi] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cancelRef = useRef(null)
  useEffect(() => () => cancelRef.current?.(), [])

  // Cloud needs a model + key; local Ollama we assume present and let the call fail
  // gracefully if the server isn't up.
  const aiConfigured = settings?.provider === 'cloud'
    ? !!(settings?.cloudModel && settings?.cloudKey)
    : !!(settings?.ollamaModel)

  async function runAi() {
    if (busy) return
    setBusy(true); setErr(''); setAi('')
    try {
      const { system, messages } = buildDailyReportAiPayload(report, settings)
      await streamChat({ system, messages }, (d) => setAi((s) => s + d), cancelRef)
    } catch (e) { setErr(String(e?.message || e) || 'AI unavailable') }
    setBusy(false)
  }

  if (!report.rows.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-[75] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden"
      style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 16px 44px rgba(0,0,0,0.5)' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        <CalendarClock size={16} style={{ color: T.accent }} />
        <div>
          <div className="text-sm font-semibold">Last session review</div>
          <div className="text-xs" style={{ color: T.faint }}>{dayLabel(report.date)}</div>
        </div>
        <button type="button" onClick={onClose} className="ml-auto p-1 rounded hover:opacity-70" style={{ color: T.faint }} title="Close"><X size={16} /></button>
      </div>

      <div className="px-4 py-3 max-h-[62vh] overflow-y-auto space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold" style={{ ...mono, color: report.net >= 0 ? T.up : T.down }}>{fmt$(report.net)}</span>
          <span className="text-xs" style={{ color: T.dim }}>
            {report.rows.length} trade{report.rows.length === 1 ? '' : 's'} · <span style={{ color: T.up }}>{report.wins}W</span> / <span style={{ color: T.down }}>{report.losses}L</span> · {fmtN(report.winRate, 0)}% win
          </span>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
          {report.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-xs" style={{ ...mono, borderTop: i ? `1px solid ${T.line}` : 'none' }}>
              <span style={{ color: T.faint }}>{r.time}</span>
              <span style={{ color: T.text }}>{r.symbol}</span>
              {r.direction && <span style={{ color: r.direction === 'Long' ? T.up : T.down }}>{r.direction[0]}</span>}
              {r.size ? <span style={{ color: T.faint }}>×{r.size}</span> : null}
              {r.emotion && <span className="truncate" style={{ color: TILT.includes(r.emotion) ? T.down : T.dim }}>{r.emotion}</span>}
              <span className="ml-auto font-semibold" style={{ color: r.win ? T.up : T.down }}>{fmt$(r.pnl)}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>💡 {report.tip}</div>

        {ai ? (
          <div className="rounded-lg px-3 py-2 text-xs whitespace-pre-wrap" style={{ background: T.accentSoft, color: '#F3D9A0', border: `1px solid ${T.line}` }}>{ai}{busy ? ' ▍' : ''}</div>
        ) : err ? (
          <div className="text-xs" style={{ color: T.down }}>⚠︎ {err} — check your model in Settings.</div>
        ) : aiConfigured ? (
          <button type="button" onClick={runAi} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306', opacity: busy ? 0.6 : 1 }}>
            <Sparkles size={14} /> {busy ? 'Reviewing your day…' : 'Get AI review'}
          </button>
        ) : (
          <button type="button" onClick={onOpenCoach} className="w-full rounded-md py-2 text-sm" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
            Set up the AI coach for deeper reviews →
          </button>
        )}
      </div>
    </div>
  )
}

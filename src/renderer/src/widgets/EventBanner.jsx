import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { T, mono } from '../theme.js'
import { untilLabel } from '../utils.js'
import { Panel } from '../components/Shared.jsx'

/* ───────── economic calendar ───────── */
export function EventBanner({ event, now }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ ...mono, color: T.accent }}>
        <AlertTriangle size={13} />
        <span className="font-semibold">News</span>
        <span style={{ color: T.dim }}>{event.country} · {event.title}</span>
        <span className="ml-auto">{untilLabel(event.ts, now) === 'now' ? 'now' : `in ${untilLabel(event.ts, now)}`}</span>
      </div>
    </div>
  )
}

export function EventsPanel({ events, now }) {
  const dot = (impact) => impact === 'High' ? T.down : impact === 'Medium' ? T.accent : T.faint
  const upcoming = (events || []).filter((e) => e.ts > now).slice(0, 6)
  return (
    <Panel title="Economic calendar">
      {upcoming.length === 0 ? (
        <p className="text-sm" style={{ color: T.dim }}>No upcoming events. Add an FMP key in Settings for a fuller calendar.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot(e.impact), flexShrink: 0 }} />
              <span style={{ color: T.faint }}>{e.country}</span>
              <span style={{ color: T.text }} className="truncate flex-1">{e.title}</span>
              <span style={{ color: T.dim, ...mono }}>{untilLabel(e.ts, now)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs" style={{ color: T.faint }}>Don't trade the news? Wait for the print, or be set before it drops.</p>
    </Panel>
  )
}

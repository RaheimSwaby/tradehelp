import React, { useState } from 'react'
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react'
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

// Floating economic-calendar card shown only in Trade Mode, so upcoming news stays
// in view while you're live. Collapses to a one-line pill to stay out of the way.
export function FloatingEvents({ events, now, leadMin = 15 }) {
  const [collapsed, setCollapsed] = useState(false)
  const dot = (impact) => impact === 'High' ? T.down : impact === 'Medium' ? T.accent : T.faint
  const upcoming = (events || []).filter((e) => e.ts > now).slice(0, 5)
  if (upcoming.length === 0) return null

  const next = upcoming[0]
  const soon = (e) => e.ts - now <= leadMin * 60000
  const nextSoon = soon(next)

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold"
        style={{ background: T.surface, border: `1px solid ${nextSoon ? T.down : T.accent}`, color: nextSoon ? T.down : T.accent, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', ...mono }}
      >
        <CalendarClock size={14} />
        <span style={{ color: T.dim }} className="max-w-[160px] truncate">{next.title}</span>
        <span>{untilLabel(next.ts, now)}</span>
        <ChevronUp size={14} style={{ color: T.faint }} />
      </button>
    )
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-72 rounded-xl overflow-hidden"
      style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 12px 34px rgba(0,0,0,0.5)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.line}`, background: T.surface2 }}>
        <CalendarClock size={14} style={{ color: T.accent }} />
        <span className="text-xs font-semibold">Upcoming news</span>
        <button type="button" onClick={() => setCollapsed(true)} className="ml-auto" title="Collapse" style={{ color: T.dim }}>
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {upcoming.map((e, i) => {
          const isSoon = soon(e)
          return (
            <div key={i} className="flex items-center gap-2 text-xs rounded px-1.5 py-1" style={isSoon ? { background: 'rgba(251,113,133,0.10)' } : undefined}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot(e.impact), flexShrink: 0 }} />
              <span style={{ color: T.faint }}>{e.country}</span>
              <span style={{ color: T.text }} className="truncate flex-1">{e.title}</span>
              <span style={{ ...mono, color: isSoon ? T.down : T.dim, fontWeight: isSoon ? 600 : 400 }}>{untilLabel(e.ts, now)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

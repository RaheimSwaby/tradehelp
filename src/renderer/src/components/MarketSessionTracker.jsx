import React, { useEffect, useMemo, useState } from 'react'
import { T, mono } from '../theme.js'
import { marketSessionsSnapshot } from '../marketSessions.js'

export function MarketSessionTracker() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const snapshot = useMemo(() => marketSessionsSnapshot(now), [now])

  return (
    <section aria-labelledby="market-sessions-title" className="overflow-hidden rounded-lg" style={{ background: T.surface }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${T.line}` }}>
        <div>
          <h3 id="market-sessions-title" className="text-xs font-semibold">Regional sessions</h3>
          <div className="mt-0.5 text-[11px]" style={{ color: T.faint }}>Common forex windows in each venue's local time.</div>
        </div>
        <div className="text-[11px] font-medium" style={{ color: snapshot.overlapActive ? T.accentText : T.faint }}>{snapshot.summary}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {snapshot.sessions.map((session, index) => (
          <article key={session.id} className="relative px-3 py-2.5" style={{ borderLeft: index > 0 ? `1px solid ${T.line}` : 'none' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: session.open ? T.up : T.faint }} />
                <span className="text-xs font-semibold">{session.label}</span>
                {session.city !== session.label && <span className="text-[10px]" style={{ color: T.faint }}>{session.city}</span>}
              </div>
              <span className="text-[10px] font-semibold tracking-wide" style={{ color: session.open ? T.up : T.faint }}>{session.open ? 'OPEN' : 'CLOSED'}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <strong className="text-sm" style={{ ...mono, color: T.text }}>{session.localTime}</strong>
              <span className="text-[11px]" style={{ color: session.open ? T.dim : T.faint }}>{session.detail}</span>
            </div>
            <div className="mt-2 h-0.5 overflow-hidden" style={{ background: T.line }}>
              <div className="h-full transition-[width] duration-500" style={{ width: `${session.progressPct}%`, background: session.open ? T.accent : 'transparent' }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

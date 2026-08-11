import React, { useState, useEffect, useMemo } from 'react'
import { Newspaper, ChevronLeft, ChevronRight, RefreshCw, History, TrendingDown, TrendingUp } from 'lucide-react'
import { T, mono, inputStyle } from '../theme.js'
import { fmt$, fmtN, pad2, MONTHS } from '../utils.js'
import { Stat, Panel } from '../components/Shared.jsx'
import { buildNewsCorrelation, newsCorrelationHeadline, eventsAtImpact, DEFAULT_NEWS_WINDOW_MIN } from '../newsCorrelation.js'

const IMPACTS = ['High', 'Medium', 'Low']
const WINDOWS = [15, 30, 60]

function impactColor(impact) {
  const value = String(impact || '').toLowerCase()
  if (value.startsWith('high')) return T.down
  if (value.startsWith('med')) return T.accent
  if (value.startsWith('low')) return T.dim
  return T.faint
}

function dayKey(ts) {
  const date = new Date(ts)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function clockLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function EventRow({ event, trades = [] }) {
  const net = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0)
  return (
    <div className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: T.surface2 }}>
      <span style={{ ...mono, color: T.faint }} className="shrink-0 w-16">{clockLabel(event.ts)}</span>
      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ color: impactColor(event.impact), border: `1px solid ${impactColor(event.impact)}` }}>
        {event.country || '—'}
      </span>
      <span className="flex-1 min-w-0 truncate" style={{ color: T.text }}>{event.title}</span>
      {(event.actual || event.forecast || event.previous) && (
        <span className="shrink-0 hidden sm:inline" style={{ ...mono, color: T.faint }}>
          {event.actual ? <strong style={{ color: T.text }}>a {event.actual}</strong> : null}
          {event.actual ? ' · ' : ''}f {event.forecast || '—'} · p {event.previous || '—'}
        </span>
      )}
      {trades.length > 0 && (
        <span className="shrink-0 font-semibold" style={{ ...mono, color: net >= 0 ? T.up : T.down }}>
          {trades.length}t {fmt$(net)}
        </span>
      )}
    </div>
  )
}

export function NewsTab({ trades = [], settings = {}, events = [] }) {
  const [sub, setSub] = useState('calendar')
  // Upcoming events come from the app-wide poll (every 10 min) so opening this tab
  // costs nothing; Refresh is the only thing that forces a live fetch.
  const [refreshed, setRefreshed] = useState(null)
  const upcoming = refreshed || events
  const [history, setHistory] = useState([])
  const [coverage, setCoverage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(null)
  const [minImpact, setMinImpact] = useState(settings.eventsMinImpact || 'High')
  const [windowMin, setWindowMin] = useState(DEFAULT_NEWS_WINDOW_MIN)
  const [backfill, setBackfill] = useState({ busy: false, message: '' })

  // Reads the local archive only — no network. Cheap enough to run on every mount.
  async function loadArchive() {
    setLoading(true)
    const [past, cover] = await Promise.all([
      Promise.resolve(window.api?.eventHistory?.({})).catch(() => []),
      Promise.resolve(window.api?.eventCoverage?.()).catch(() => null)
    ])
    setHistory(Array.isArray(past) ? past : [])
    setCoverage(cover || null)
    setLoading(false)
  }

  useEffect(() => { loadArchive() }, [])

  async function refresh() {
    const next = await Promise.resolve(window.api?.events?.()).catch(() => null)
    if (Array.isArray(next)) setRefreshed(next)
    loadArchive() // the fetch archives what it saw, so re-read coverage
  }

  // The archive is the source of truth for the past; the live feed fills in anything
  // ahead of it that has not been stored yet.
  const allEvents = useMemo(() => {
    const byKey = new Map()
    for (const event of [...history, ...upcoming]) {
      if (!event?.title || !Number.isFinite(Number(event.ts))) continue
      byKey.set(`${event.ts}|${event.country}|${String(event.title).toLowerCase()}`, event)
    }
    return [...byKey.values()].sort((a, b) => a.ts - b.ts)
  }, [history, upcoming])

  const visibleEvents = useMemo(() => eventsAtImpact(allEvents, minImpact), [allEvents, minImpact])

  const correlation = useMemo(
    () => buildNewsCorrelation(trades, allEvents, {
      windowMin,
      minImpact,
      coverage: coverage && coverage.total ? { earliest: coverage.earliest, latest: coverage.latest } : undefined
    }),
    [trades, allEvents, windowMin, minImpact, coverage]
  )
  const headline = newsCorrelationHeadline(correlation)

  const byDay = useMemo(() => {
    const map = {}
    for (const event of visibleEvents) {
      const key = dayKey(event.ts)
      if (!map[key]) map[key] = []
      map[key].push(event)
    }
    return map
  }, [visibleEvents])

  const tradesByDay = useMemo(() => {
    const map = {}
    for (const trade of trades) {
      const key = String(trade.entryTime || trade.timestamp || '').slice(0, 10)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(trade)
    }
    return map
  }, [trades])

  const [year, month] = ym.split('-').map(Number)
  const startDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const shiftMonth = (delta) => {
    const date = new Date(year, month - 1 + delta, 1)
    setYm(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}`)
    setSelectedDay(null)
  }

  const cells = []
  for (let index = 0; index < startDow; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${ym}-${pad2(day)}`
    cells.push({ day, key, events: byDay[key] || [], trades: tradesByDay[key] || [] })
  }

  async function runBackfill(days) {
    setBackfill({ busy: true, message: '' })
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    const result = await Promise.resolve(window.api?.backfillEvents?.({ from, to })).catch(() => null)
    if (result?.ok) {
      setBackfill({ busy: false, message: `Stored ${result.stored} events from the last ${days} days.` })
      loadArchive()
    } else {
      setBackfill({ busy: false, message: result?.error || 'Backfill is unavailable.' })
    }
  }

  const selectedEvents = selectedDay ? byDay[selectedDay] || [] : []
  const nextUp = visibleEvents.filter((event) => event.ts >= Date.now()).slice(0, 8)

  return (
    <div className="th-page th-page-news space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2"><Newspaper size={16} style={{ color: T.accentText }} /> News &amp; events</h2>
          <p className="text-xs mt-0.5" style={{ color: T.dim }}>
            The economic calendar, plus how your own trades actually perform around it.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {[['calendar', 'Calendar'], ['performance', 'My performance']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setSub(id); document.getElementById(`news-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="text-xs px-2.5 py-1.5 rounded-md"
              style={{ background: sub === id ? T.surface2 : 'transparent', color: sub === id ? T.accentText : T.dim, border: `1px solid ${sub === id ? T.line : 'transparent'}` }}>
              {label}
            </button>
          ))}
          <button type="button" onClick={refresh} title="Refresh the calendar" className="text-xs px-2 py-1.5 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: T.faint }}>Impact</span>
        {IMPACTS.map((impact) => (
          <button key={impact} type="button" onClick={() => setMinImpact(impact)} className="px-2 py-1 rounded-md"
            style={{ background: minImpact === impact ? T.surface2 : 'transparent', color: minImpact === impact ? T.accentText : T.dim, border: `1px solid ${minImpact === impact ? T.line : 'transparent'}` }}>
            {impact}{impact !== 'Low' ? '+' : ''}
          </button>
        ))}
        <span className="ml-2" style={{ color: T.faint }}>Window ±</span>
        {WINDOWS.map((value) => (
          <button key={value} type="button" onClick={() => setWindowMin(value)} className="px-2 py-1 rounded-md"
            style={{ background: windowMin === value ? T.surface2 : 'transparent', color: windowMin === value ? T.accentText : T.dim, border: `1px solid ${windowMin === value ? T.line : 'transparent'}` }}>
            {value}m
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: T.dim }}>Loading the calendar…</div>
      ) : (
        <div className="th-news-workspace">
        <section id="news-calendar" className="th-news-calendar space-y-4">
          <Panel title={`${MONTHS[month - 1]} ${year}`} right={
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => shiftMonth(-1)} style={{ color: T.dim }}><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => shiftMonth(1)} style={{ color: T.dim }}><ChevronRight size={16} /></button>
            </div>
          }>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                <div key={label} className="text-center text-xs py-1" style={{ color: T.faint }}>{label}</div>
              ))}
              {cells.map((cell, index) => cell == null ? <div key={`pad-${index}`} /> : (
                <button key={cell.key} type="button" onClick={() => setSelectedDay(cell.key === selectedDay ? null : cell.key)}
                  className="rounded p-1.5 min-h-[62px] text-left"
                  style={{ background: T.surface2, border: `1px solid ${selectedDay === cell.key ? T.accent : cell.events.length ? T.line : 'transparent'}` }}>
                  <div className="text-xs" style={{ color: T.faint }}>{cell.day}</div>
                  {cell.events.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {cell.events.slice(0, 4).map((event, position) => (
                        <span key={position} style={{ width: 6, height: 6, borderRadius: 3, background: impactColor(event.impact), display: 'inline-block' }} />
                      ))}
                      {cell.events.length > 4 && <span className="text-[9px]" style={{ color: T.faint }}>+{cell.events.length - 4}</span>}
                    </div>
                  )}
                  {cell.trades.length > 0 && (
                    <div className="text-[9px] mt-0.5" style={{ ...mono, color: cell.trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0) >= 0 ? T.up : T.down }}>
                      {fmt$(cell.trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0))}
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="text-xs mt-2" style={{ color: T.faint }}>Dots are events by impact; the figure is your P&amp;L that day. Select a date for its releases.</div>
          </Panel>

          {selectedDay && (
            <Panel title={`Releases on ${selectedDay}`}>
              {selectedEvents.length === 0 ? (
                <div className="text-xs py-2" style={{ color: T.faint }}>No events at this impact level.</div>
              ) : (
                <div className="space-y-1">
                  {selectedEvents.map((event, index) => (
                    <EventRow key={`${event.ts}-${index}`} event={event} trades={(tradesByDay[selectedDay] || []).filter((trade) => {
                      const at = new Date(String(trade.entryTime || trade.timestamp || '').replace(' ', 'T')).getTime()
                      return Number.isFinite(at) && Math.abs(at - event.ts) <= windowMin * 60000
                    })} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel title="Next up">
            {nextUp.length === 0 ? (
              <div className="text-xs py-2" style={{ color: T.faint }}>Nothing scheduled at this impact level.</div>
            ) : (
              <div className="space-y-1">
                {nextUp.map((event, index) => (
                  <div key={`${event.ts}-${index}`}>
                    <div className="text-[10px] mb-0.5" style={{ color: T.faint }}>{dayKey(event.ts)}</div>
                    <EventRow event={event} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>
        <aside id="news-performance" className="th-news-performance space-y-4">
          {headline && (
            <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-3" style={{ background: T.surface, border: `1px solid ${headline.tone === 'up' ? T.up : T.down}` }}>
              {headline.tone === 'up' ? <TrendingUp size={18} style={{ color: T.up }} /> : <TrendingDown size={18} style={{ color: T.down }} />}
              <div>
                <div className="text-sm font-semibold" style={{ color: T.text }}>{headline.text}</div>
                <div className="text-xs" style={{ color: T.dim }}>{headline.detail}</div>
              </div>
            </div>
          )}

          <Panel title={`Around high-impact news · ±${correlation.windowMin} min`}>
            {!correlation.covered ? (
              <div className="text-sm" style={{ color: T.dim }}>
                Not enough archived calendar yet to judge this. TradeHelp stores events as it sees them, so this fills in as you use the app — or backfill the past below if you have an FMP key.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Stat label="News trades" value={String(correlation.news.n)} sub={`${fmtN(correlation.news.winRate, 1)}% win rate`} />
                  <Stat label="News P&L" value={fmt$(correlation.news.totalPnl)} tone={correlation.news.totalPnl >= 0 ? 'up' : 'down'} sub={`${fmt$(correlation.news.avgPnl)}/trade`} />
                  <Stat label="Quiet trades" value={String(correlation.quiet.n)} sub={`${fmtN(correlation.quiet.winRate, 1)}% win rate`} />
                  <Stat label="Quiet P&L" value={fmt$(correlation.quiet.totalPnl)} tone={correlation.quiet.totalPnl >= 0 ? 'up' : 'down'} sub={`${fmt$(correlation.quiet.avgPnl)}/trade`} />
                </div>
                <div className="text-xs mt-3" style={{ color: T.faint }}>
                  Based on {correlation.analyzed} trade{correlation.analyzed === 1 ? '' : 's'} inside the archived calendar range.
                  {correlation.uncovered > 0 && ` ${correlation.uncovered} older trade${correlation.uncovered === 1 ? '' : 's'} sit outside it and are left out rather than counted as quiet.`}
                </div>
              </>
            )}
          </Panel>

          {correlation.byEvent.length > 0 && (
            <Panel title="By release — worst first">
              <div className="space-y-1">
                {correlation.byEvent.map((row) => (
                  <div key={row.title} className="flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: T.surface2 }}>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px]" style={{ color: T.faint, border: `1px solid ${T.line}` }}>{row.country || '—'}</span>
                    <span className="flex-1 min-w-0 truncate" style={{ color: T.text }}>{row.title}</span>
                    <span className="shrink-0" style={{ ...mono, color: T.dim }}>{row.n}t · {fmtN(row.winRate, 0)}%</span>
                    <span className="shrink-0 font-semibold w-20 text-right" style={{ ...mono, color: row.totalPnl >= 0 ? T.up : T.down }}>{fmt$(row.totalPnl)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Event history" right={<span className="text-xs" style={{ color: T.faint }}>{coverage?.total || 0} stored</span>}>
            <div className="text-xs" style={{ color: T.dim }}>
              {coverage?.total
                ? `Archived from ${dayKey(coverage.earliest)} to ${dayKey(coverage.latest)}. New events are saved automatically whenever the calendar loads.`
                : 'Nothing archived yet — events are saved automatically as the calendar loads.'}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <History size={14} style={{ color: T.accentText }} />
              <span className="text-xs" style={{ color: T.dim }}>Backfill past events (needs an FMP key):</span>
              {[30, 90, 365].map((days) => (
                <button key={days} type="button" disabled={backfill.busy} onClick={() => runBackfill(days)}
                  className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}`, opacity: backfill.busy ? 0.5 : 1 }}>
                  {days === 365 ? '1 year' : `${days} days`}
                </button>
              ))}
            </div>
            {backfill.message && <div className="text-xs mt-2" style={{ color: T.dim }}>{backfill.message}</div>}
          </Panel>
        </aside>
        </div>
      )}
    </div>
  )
}

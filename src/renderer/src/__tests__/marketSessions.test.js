// Pin the timezone so the time-only entry test is deterministic across
// local (America/New_York) and CI (UTC) runners.
process.env.TZ = 'America/New_York'

import { describe, expect, it } from 'vitest'
import { MARKET_SESSION_DEFINITIONS, buildMarketSessionPerformance, marketSessionState, marketSessionsSnapshot } from '../marketSessions.js'

const session = (id) => MARKET_SESSION_DEFINITIONS.find((item) => item.id === id)

describe('regional market sessions', () => {
  it('tracks Tokyo using Japan local time', () => {
    const state = marketSessionState(session('asia'), new Date('2026-08-19T01:00:00Z'))
    expect(state.open).toBe(true)
    expect(state.localTime).toBe('10:00 AM')
    expect(state.detail).toBe('Closes in 8h')
  })

  it('tracks London through British summer time', () => {
    const state = marketSessionState(session('london'), new Date('2026-08-19T12:00:00Z'))
    expect(state.open).toBe(true)
    expect(state.localTime).toBe('1:00 PM')
    expect(state.detail).toBe('Closes in 4h')
  })

  it('tracks New York through US daylight time', () => {
    const state = marketSessionState(session('new-york'), new Date('2026-08-19T16:00:00Z'))
    expect(state.open).toBe(true)
    expect(state.localTime).toBe('12:00 PM')
    expect(state.progressPct).toBeCloseTo(44.44, 1)
  })

  it('calls out the London and New York overlap', () => {
    const snapshot = marketSessionsSnapshot(new Date('2026-08-19T14:00:00Z'))
    expect(snapshot.overlapActive).toBe(true)
    expect(snapshot.summary).toBe('London + New York overlap · 2h left')
  })

  it('keeps all three sessions closed on Saturday', () => {
    const snapshot = marketSessionsSnapshot(new Date('2026-08-22T14:00:00Z'))
    expect(snapshot.sessions.every((item) => !item.open)).toBe(true)
    expect(snapshot.summary).toBe('All tracked sessions closed')
  })

  it('assigns overlap trades to the most recently opened session', () => {
    const performance = buildMarketSessionPerformance([
      { entryTime: '2026-08-19T01:00:00Z', pnl: 100 },
      { entryTime: '2026-08-19T07:30:00Z', pnl: 25 },
      { entryTime: '2026-08-19T14:00:00Z', pnl: -50 },
      { entryTime: '2026-08-19T16:00:00Z', pnl: 0 },
      { entryTime: '', timestamp: '', pnl: 999 }
    ])

    expect(performance).toMatchObject({ totalCount: 5, timedCount: 4, missingTimeCount: 1, overlapCount: 2 })
    expect(performance.rows.find((row) => row.id === 'asia')).toMatchObject({ tradeCount: 1, netPnl: 100, winRate: 100 })
    expect(performance.rows.find((row) => row.id === 'london')).toMatchObject({ tradeCount: 1, netPnl: 25, winRate: 100 })
    expect(performance.rows.find((row) => row.id === 'new-york')).toMatchObject({ tradeCount: 2, netPnl: -50, winRate: 0, breakEvenCount: 1 })
  })

  it('combines a time-only entry with the trade date', () => {
    const performance = buildMarketSessionPerformance([
      { entryTime: '09:30', timestamp: '2026-08-19 09:30', pnl: 25 }
    ])

    expect(performance.timedCount).toBe(1)
    expect(performance.rows.find((row) => row.id === 'new-york').tradeCount).toBe(1)
  })
})

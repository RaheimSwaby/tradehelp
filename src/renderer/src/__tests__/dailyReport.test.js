import { describe, expect, it } from 'vitest'
import { lastTradingDay, buildDailyReport, dailyReportAiPayload } from '../coachInsights.js'

const trades = [
  { id: '1', symbol: 'mes', direction: 'Long', size: 2, pnl: 80, emotion: 'Disciplined', setup: 'ORB', timestamp: '2026-07-08 09:31' },
  { id: '2', symbol: 'MES', direction: 'Short', size: 1, pnl: -35, emotion: 'Revenge', timestamp: '2026-07-08 10:05' },
  { id: '3', symbol: 'NQ', direction: 'Long', size: 1, pnl: 40, emotion: 'Neutral', entryTime: '2026-07-08 11:00', timestamp: '2026-07-08 11:00' },
  { id: '4', symbol: 'MES', direction: 'Long', size: 1, pnl: 15, timestamp: '2026-07-09 09:45' } // today's trade
]

describe('lastTradingDay', () => {
  it('returns the most recent day strictly before today', () => {
    expect(lastTradingDay(trades, '2026-07-09')).toBe('2026-07-08')
  })
  it('ignores today and returns null when nothing precedes it', () => {
    expect(lastTradingDay([{ timestamp: '2026-07-09 10:00' }], '2026-07-09')).toBeNull()
  })
  it('returns null for no trades', () => {
    expect(lastTradingDay([], '2026-07-09')).toBeNull()
  })
})

describe('buildDailyReport', () => {
  const r = buildDailyReport(trades, '2026-07-08')

  it('includes only that day, sorted by time, and computes the summary', () => {
    expect(r.rows).toHaveLength(3)
    expect(r.rows.map((x) => x.time)).toEqual(['09:31', '10:05', '11:00'])
    expect(r.net).toBe(85)
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(1)
    expect(Math.round(r.winRate)).toBe(67)
  })

  it('uppercases symbols and flags tilt emotions', () => {
    expect(r.rows[0].symbol).toBe('MES')
    expect(r.tiltEmotions).toEqual(['Revenge'])
    expect(r.tip).toMatch(/Revenge/)
  })

  it('nudges to tag emotions when none are present', () => {
    const none = buildDailyReport([{ symbol: 'MES', pnl: 10, timestamp: '2026-07-08 09:30' }], '2026-07-08')
    expect(none.tip).toMatch(/No emotions tagged/i)
  })
})

describe('dailyReportAiPayload', () => {
  it('lists each trade and marks untagged fields as (none)', () => {
    const p = dailyReportAiPayload(buildDailyReport(trades, '2026-07-08'))
    expect(p.messages[0].content).toContain('2026-07-08')
    expect(p.messages[0].content).toContain('setup=(none)') // trades #2 and #3 have no setup tagged
    expect(p.system).toMatch(/never invent/i)
  })
})

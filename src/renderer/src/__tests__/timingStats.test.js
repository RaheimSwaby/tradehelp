import { describe, expect, it } from 'vitest'
import { computeStats, TIMING_CONFIDENT_SAMPLE, TIMING_R_CONFIDENT_SAMPLE } from '../stats.js'

function timedTrade(id, date, hour, pnl, riskAmount = 0) {
  return {
    id,
    symbol: 'MES',
    timestamp: `${date} ${String(hour).padStart(2, '0')}:00`,
    entryTime: `${date} ${String(hour).padStart(2, '0')}:00`,
    pnl,
    riskAmount
  }
}

describe('recent timing statistics', () => {
  it('keeps portfolio history but limits timing buckets to the recent window', () => {
    const old = Array.from({ length: 8 }, (_, index) => timedTrade(`old-${index}`, '2026-01-01', 9, 100))
    const recent = Array.from({ length: 8 }, (_, index) => timedTrade(`new-${index}`, '2026-07-20', 18, index < 5 ? 50 : -50))
    const stats = computeStats([...old, ...recent])

    expect(stats.n).toBe(16)
    expect(stats.byHour.map((row) => row.k)).toEqual(['18'])
    expect(stats.timingSample).toBe(8)
    expect(stats.timingRecordedSample).toBe(16)
    expect(stats.timingHistoryLimits).toMatchObject({ calendarDays: 90, tradingDays: 50 })
  })

  it('reports chronological timing bounds even when entry and journal order differ', () => {
    const enteredLaterButLoggedFirst = timedTrade('late-entry', '2026-07-21', 10, 100)
    enteredLaterButLoggedFirst.timestamp = '2026-07-01 10:00'
    const enteredEarlierButLoggedLast = timedTrade('early-entry', '2026-07-20', 11, -50)
    enteredEarlierButLoggedLast.timestamp = '2026-07-31 11:00'

    const stats = computeStats([enteredLaterButLoggedFirst, enteredEarlierButLoggedLast])

    expect(stats.timingHistoryStart).toBe('2026-07-20')
    expect(stats.timingHistoryEnd).toBe('2026-07-21')
  })

  it('uses signed realized R for ranking when enough risk observations exist', () => {
    const oversizedDollarHour = [
      timedTrade('large-win', '2026-07-20', 9, 10000, 10000),
      ...Array.from({ length: 7 }, (_, index) => timedTrade(`loss-${index}`, '2026-07-20', 9, -100, 100))
    ]
    const repeatableHour = [
      ...Array.from({ length: 5 }, (_, index) => timedTrade(`win-${index}`, '2026-07-21', 10, 100, 100)),
      ...Array.from({ length: 3 }, (_, index) => timedTrade(`small-loss-${index}`, '2026-07-21', 10, -100, 100))
    ]
    const stats = computeStats([...oversizedDollarHour, ...repeatableHour])
    const nine = stats.byHour.find((row) => row.k === '09')
    const ten = stats.byHour.find((row) => row.k === '10')

    expect(nine.expectancy).toBeGreaterThan(0)
    expect(nine.avgR).toBeLessThan(0)
    expect(ten.avgR).toBeGreaterThan(0)
    expect(stats.bestHour.k).toBe('10')
    expect(stats.worstHour.k).toBe('09')
    expect(stats.timingRMinSample).toBe(TIMING_R_CONFIDENT_SAMPLE)
  })

  it('stays in confidence-building mode below the confirmed sample', () => {
    const trades = Array.from({ length: TIMING_CONFIDENT_SAMPLE - 1 }, (_, index) =>
      timedTrade(`trade-${index}`, '2026-07-21', 10, 100, 100))
    const stats = computeStats(trades)
    expect(stats.byHour[0].confidence).toBeLessThan(1)
    expect(stats.bestHour).toBeNull()
    expect(stats.worstHour).toBeNull()
  })
})

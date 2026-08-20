import { describe, expect, it } from 'vitest'
import { buildPeriodStatistics } from '../periodStatistics.js'

const trades = [
  { timestamp: '2026-01-02 09:30', pnl: 100 },
  { timestamp: '2026-01-03 10:30', pnl: -40 },
  { timestamp: '2026-02-04 09:30', pnl: -80 },
  { timestamp: '2026-04-05 09:30', pnl: 200 },
  { timestamp: 'bad date', pnl: 999 }
]

describe('monthly and quarterly statistics', () => {
  it('compares monthly win rate, profitability, profit factor, and average trade', () => {
    const result = buildPeriodStatistics(trades, 'month')
    expect(result.rows.map((row) => row.periodKey)).toEqual(['2026-04', '2026-02', '2026-01'])
    expect(result.rows.find((row) => row.periodKey === '2026-01')).toMatchObject({ tradeCount: 2, winRate: 50, totalPnl: 60, averageTrade: 30 })
    expect(result.summary).toMatchObject({ periodCount: 3, profitableCount: 2, totalPnl: 180, averagePnl: 60 })
    expect(result.summary.profitabilityRate).toBeCloseTo(66.666, 2)
  })

  it('groups the same trades into calendar quarters', () => {
    const result = buildPeriodStatistics(trades, 'quarter')
    expect(result.rows.map((row) => row.periodKey)).toEqual(['2026-Q2', '2026-Q1'])
    expect(result.rows.find((row) => row.periodKey === '2026-Q1')).toMatchObject({ tradeCount: 3, totalPnl: -20 })
    expect(result.summary.best).toMatchObject({ periodKey: '2026-Q2', totalPnl: 200 })
    expect(result.summary.worst).toMatchObject({ periodKey: '2026-Q1', totalPnl: -20 })
  })

  it('returns an empty summary for an unsupported period or no dated trades', () => {
    expect(buildPeriodStatistics(trades, 'week')).toMatchObject({ rows: [], summary: null })
    expect(buildPeriodStatistics([{ timestamp: 'bad' }], 'month')).toMatchObject({ rows: [], summary: null })
  })
})

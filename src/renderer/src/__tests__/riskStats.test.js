import { describe, expect, it } from 'vitest'
import { computeStats, normalizeTimeframe } from '../stats.js'

function trade(id, overrides = {}) {
  return {
    id, timestamp: `2026-07-${String(id).padStart(2, '0')} 09:30`,
    pnl: 100, fees: 0, riskAmount: 100, riskPoints: 8,
    entryTimeframe: '1m', analysisTimeframe: '4h', managementTimeframe: '5m',
    ...overrides
  }
}

describe('timeframe normalization', () => {
  it('groups equivalent trader labels consistently', () => {
    expect(normalizeTimeframe('1 min')).toBe('1m')
    expect(normalizeTimeframe('4 hours')).toBe('4h')
    expect(normalizeTimeframe('Daily')).toBe('1D')
  })

  it('aggregates equivalent entry timeframes into one result', () => {
    const stats = computeStats([
      trade(1, { entryTimeframe: '1 min', pnl: 100 }),
      trade(2, { entryTimeframe: '1m', pnl: -50 })
    ])
    expect(stats.byEntryTimeframe.filter((row) => row.name === '1m')).toEqual([
      expect.objectContaining({ n: 2, pnl: 50, wr: 50 })
    ])
  })
})

describe('risk consistency', () => {
  it('uses the median and a 20% band so one outlier does not move the baseline', () => {
    const stats = computeStats([
      trade(1, { riskAmount: 90 }),
      trade(2, { riskAmount: 100 }),
      trade(3, { riskAmount: 110 }),
      trade(4, { riskAmount: 500 })
    ])
    expect(stats.medianRisk).toBe(110)
    expect(stats.riskConsistentCount).toBe(3)
    expect(stats.riskConsistency).toBe(75)
    expect(stats.avgRiskPoints).toBe(8)
  })
})

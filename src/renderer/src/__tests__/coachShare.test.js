import { describe, expect, it } from 'vitest'
import { buildCoachBrief } from '../coachInsights.js'
import { buildShareReport, tradesForShareRange } from '../shareReport.js'
import { computeStats } from '../stats.js'

function trade(id, overrides = {}) {
  return {
    id,
    symbol: 'NQ',
    direction: 'Long',
    entry: 20000,
    stop: 19980,
    rr: 2,
    riskAmount: 100,
    pnl: 150,
    emotion: 'Disciplined',
    setup: 'Opening Range Breakout',
    reason: 'Followed my plan',
    timestamp: `${new Date().toISOString().slice(0, 10)} 09:30`,
    ...overrides
  }
}

describe('proactive coach brief', () => {
  it('turns repeated loss reasons into a concrete guardrail', () => {
    const trades = [
      trade('1', { pnl: -120, emotion: 'Revenge', reason: 'Revenge trade' }),
      trade('2', { pnl: -100, emotion: 'Revenge', reason: 'Revenge trade' }),
      trade('3', { pnl: 180 })
    ]
    const brief = buildCoachBrief(trades, computeStats(trades))
    expect(brief.focus).toContain('Revenge trade')
    expect(brief.focus).toContain('2 times')
    expect(brief.executionLetter).toBeTruthy()
  })

  it('stays useful without trade data or AI', () => {
    const brief = buildCoachBrief([], computeStats([]))
    expect(brief.headline).toContain('first trade')
    expect(brief.focus).toContain('Capture the setup')
  })
})

describe('share report model', () => {
  it('filters date ranges without changing the source trades', () => {
    const recent = trade('recent')
    const old = trade('old', { timestamp: '2020-01-01 09:30' })
    const source = [old, recent]
    expect(tradesForShareRange(source, '30')).toEqual([recent])
    expect(source).toHaveLength(2)
  })

  it('includes overall and recent execution grades in the preview model', () => {
    const report = buildShareReport([trade('1'), trade('2', { pnl: -100 })], 'all', 'Topstep')
    expect(report.accountLabel).toBe('Topstep')
    expect(report.stats.n).toBe(2)
    expect(report.executionLetter).not.toBe('-')
    expect(report.recent).toHaveLength(2)
    expect(report.recent.every((row) => row.grade)).toBe(true)
  })
})

describe('share report accolades', () => {
  const shareTrades = [
    { id: 's1', symbol: 'NQ', direction: 'Long', pnl: 250, stop: 19980, entry: 20000, target: 20100, timestamp: '2026-07-27 09:30', entryTime: '2026-07-27 09:30' },
    { id: 's2', symbol: 'NQ', direction: 'Long', pnl: -90, stop: 19980, entry: 20000, target: 20100, timestamp: '2026-07-28 09:30', entryTime: '2026-07-28 09:30' }
  ]

  // The card gets posted publicly, so a badge earned for breaking rules must never
  // reach it — even if a caller later starts passing rule breaks through.
  it('never puts troll badges on a shareable card', () => {
    const report = buildShareReport(shareTrades, 'all', 'All accounts', [], [])
    expect(report.achievements.some((a) => /Rule Breaker|Doing My Own Thing|Casino Connoisseur/.test(a.name))).toBe(false)
  })

  it('accepts commitments so earned discipline badges can appear', () => {
    const commitments = [{
      id: 'c1', title: 'Stop before every entry', ruleType: 'require_stop', status: 'completed',
      targetCount: 10, evaluatedCount: 10, adheredCount: 10, adherenceRate: 100
    }]
    const withCommitments = buildShareReport(shareTrades, 'all', 'All accounts', [], [], commitments)
    const without = buildShareReport(shareTrades, 'all', 'All accounts', [], [])
    expect(withCommitments.achievements.length).toBeGreaterThanOrEqual(without.achievements.length)
    expect(Array.isArray(withCommitments.achievements)).toBe(true)
  })
})

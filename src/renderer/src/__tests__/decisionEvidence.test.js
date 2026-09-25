import { describe, it, expect } from 'vitest'
import { decisionEvidence, preEntryPlan, practiceExamples, previousReviewPeriod } from '../decisionEvidence.js'

const trade = { id: 1, entryTime: '2026-09-15T10:00:00Z', entry: 100, stop: 95, riskAmount: 50, setup: 'Breakout', pnl: -50 }
const plan = { id: 2, linkedTradeId: '1', lockedAt: '2026-09-15T09:55:00Z', plannedEntry: 100, plannedStop: 95, riskAmount: 50, setup: 'Breakout', hasScreenshot: true }
describe('decision evidence', () => {
  it('compares adjacent calendar periods, including empty periods', () => {
    expect(previousReviewPeriod('2026-01', 'month')).toBe('2025-12')
    expect(previousReviewPeriod('2026-Q1', 'quarter')).toBe('2025-Q4')
    expect(previousReviewPeriod('2026-01-05', 'week')).toBe('2025-12-29')
    expect(previousReviewPeriod('all-time', 'all')).toBe('')
  })
  it('matches recorded fields independently of profit', () => {
    const result = decisionEvidence([trade], [plan])
    expect(result.metrics.every((metric) => metric.matched === 1)).toBe(true)
    expect(decisionEvidence([{ ...trade, pnl: 100 }], [plan]).metrics).toEqual(result.metrics)
  })
  it('rejects post-entry plans and date-only entry times', () => {
    expect(preEntryPlan(trade, [{ ...plan, lockedAt: '2026-09-15T11:00:00Z' }])).toBeNull()
    expect(preEntryPlan({ ...trade, entryTime: '2026-09-15' }, [plan])).toBeNull()
  })
  it('counts missing values as unknown, not different', () => {
    const result = decisionEvidence([{ ...trade, stop: '', riskAmount: null }], [plan])
    expect(result.metrics[1]).toMatchObject({ unknown: 1, different: 0 })
    expect(result.metrics[2]).toMatchObject({ unknown: 1, different: 0 })
  })
  it('requires a matching setup and pre-entry screenshot for practice', () => {
    expect(practiceExamples({ name: 'Breakout' }, [trade], [plan])).toHaveLength(1)
    expect(practiceExamples({ name: 'Other' }, [trade], [plan])).toHaveLength(0)
    expect(practiceExamples({ name: 'Breakout' }, [trade], [{ ...plan, hasScreenshot: false }])).toHaveLength(0)
  })
})

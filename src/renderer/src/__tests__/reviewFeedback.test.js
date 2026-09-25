import { describe, expect, it } from 'vitest'
import { buildReviewFeedback, reviewResultStatus, normalizeReviewResponses } from '../reviewFeedback.js'
import { buildPeriodRetrospective, serializePeriodRetrospective, parsePeriodRetrospective } from '../periodRetrospective.js'

describe('evidence-backed decision reviews', () => {
  it('does not infer behavior from profits, losses, or missing tags', () => {
    const feedback = buildReviewFeedback([{ id: 'a', pnl: -900 }, { id: 'b', pnl: 1200 }])
    expect(feedback.repeat).toBeNull()
    expect(feedback.attention).toBeNull()
    expect(feedback.taggedCount).toBe(0)
  })
  it('includes valid losses as strengths and profitable mistakes as attention', () => {
    const trades = [{ id: 'a', pnl: -100, reason: 'Just variance, good trade' }, { id: 'b', pnl: 300, reason: 'Moved / ignored my stop' }]
    const feedback = buildReviewFeedback(trades)
    expect(feedback.repeat.trades.map((t) => t.id)).toEqual(['a'])
    expect(feedback.attention.trades.map((t) => t.id)).toEqual(['b'])
  })
  it('scopes commitment checks to period trade IDs and separates missing data', () => {
    const feedback = buildReviewFeedback([{ id: 1 }, { id: 2, riskAmount: 120 }, { id: 3, riskAmount: 40 }], [{
      id: 'focus', ruleType: 'max_risk', results: [
        { tradeId: '1', adhered: false }, { tradeId: '2', adhered: false }, { tradeId: '3', adhered: true }, { tradeId: 'outside', adhered: true },
      ],
    }])
    expect(feedback.commitments[0]).toMatchObject({ followed: 1, missed: 1, unresolved: 1 })
    expect(feedback.commitments[0].results).toHaveLength(3)
  })
  it('respects manual assessments even when automatic inputs are absent', () => {
    expect(reviewResultStatus({ ruleType: 'require_stop' }, { adhered: true, source: 'manual' }, {})).toBe('followed')
    expect(reviewResultStatus({ ruleType: 'require_stop' }, { adhered: false, source: 'auto' }, {})).toBe('unresolved')
    expect(reviewResultStatus({ ruleType: 'require_stop' }, { adhered: false }, { entry: 100, stop: 110, direction: 'Long' })).toBe('missed')
  })
  it('round-trips finding responses without changing legacy reflection text', () => {
    const responses = { 'attention:FOMO / chased': { status: 'context', context: 'This was a planned scale-in.' } }
    const review = buildPeriodRetrospective({ selectedPeriod: '2026-09', granularity: 'month', reflection: 'My notes', responses })
    const parsed = parsePeriodRetrospective(serializePeriodRetrospective(review))
    expect(parsed.reflection).toBe('My notes')
    expect(parsed.retrospective.responses).toEqual(responses)
    expect(parsePeriodRetrospective('Old note').reflection).toBe('Old note')
    expect(buildPeriodRetrospective({ existing: parsed.retrospective }).responses).toEqual(responses)
  })
  it('normalizes invalid response states and bounds stored context', () => {
    expect(normalizeReviewResponses({ a: { status: 'invalid', context: 'x'.repeat(5000) }, b: null }).a).toEqual({ status: '', context: 'x'.repeat(4000) })
  })
})

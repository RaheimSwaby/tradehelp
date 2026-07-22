import { describe, expect, it } from 'vitest'
import {
  PERIOD_RETROSPECTIVE_VERSION,
  assessGoalOutcome,
  buildPeriodRetrospective,
  commitmentEvidenceSnapshot,
  currentPeriodKey,
  parsePeriodRetrospective,
  periodPerformance,
  reviewPeriodKeys,
  serializePeriodRetrospective,
  targetSnapshotFromGoals,
  tradeDateKey,
  tradePeriodKey
} from '../periodRetrospective.js'

describe('canonical period trade dates', () => {
  it('prefers a valid entry time and falls back across malformed or absent fields', () => {
    expect(tradeDateKey({ entryTime: '2026-07-15 09:30', timestamp: '2026-07-14 08:00' })).toBe('2026-07-15')
    expect(tradeDateKey({ entryTime: 'not-a-date', timestamp: '2026-07-14 08:00' })).toBe('2026-07-14')
    expect(tradeDateKey({ entryTime: '2026-02-30', tradeDate: '2026-02-27' })).toBe('2026-02-27')
    expect(tradeDateKey({})).toBe('')
  })

  it('normalizes equivalent zoned strings, epochs, and Date objects to the same local day', () => {
    const iso = '2026-07-20T00:30:00Z'
    const epoch = Date.parse(iso)
    const expected = tradeDateKey({ timestamp: epoch })
    expect(tradeDateKey({ entryTime: iso })).toBe(expected)
    expect(tradeDateKey({ entryTime: new Date(epoch) })).toBe(expected)
  })

  it('uses Monday week keys rather than a rolling seven-day window', () => {
    expect(tradePeriodKey({ entryTime: '2026-07-19 23:00' }, 'week')).toBe('2026-07-13')
    expect(tradePeriodKey({ timestamp: '2026-07-20 00:01' }, 'week')).toBe('2026-07-20')
    expect(currentPeriodKey('month', new Date(2026, 6, 20, 12))).toBe('2026-07')
  })

  it('computes period P&L from the same canonical key used by reviews', () => {
    const trades = [
      { entryTime: '2026-07-15 09:30', pnl: 100 },
      { entryTime: 'bad', timestamp: '2026-07-16 10:00', pnl: '-25' },
      { timestamp: '2026-07-12 10:00', pnl: 999 },
      { timestamp: 'bad', pnl: 500 }
    ]
    const result = periodPerformance(trades, '2026-07-13', 'week')
    expect(result.tradeCount).toBe(2)
    expect(result.actualPnl).toBe(75)
  })
})

describe('review period options', () => {
  it('keeps the current empty week and month selectable', () => {
    const now = new Date(2026, 6, 22, 12)
    expect(reviewPeriodKeys({ trades: [], reviews: {}, granularity: 'week', now })).toEqual(['2026-07-20'])
    expect(reviewPeriodKeys({ trades: [], reviews: {}, granularity: 'month', now })).toEqual(['2026-07'])
  })

  it('combines current, traded, and previously reviewed periods without mixing granularities', () => {
    const keys = reviewPeriodKeys({
      trades: [{ entryTime: '2026-07-10 09:00' }],
      reviews: { '2026-06-29': 'week', '2026-07': 'month', '2026-Q3': 'quarter' },
      granularity: 'week',
      now: new Date(2026, 6, 22, 12)
    })
    expect(keys).toEqual(['2026-07-20', '2026-07-06', '2026-06-29'])
  })
})

describe('goal snapshots and outcomes', () => {
  it('snapshots only weekly and monthly positive targets', () => {
    expect(targetSnapshotFromGoals({ weekly: 500, monthly: '2000' }, 'week')).toEqual({ amount: 500, source: 'goals.weekly' })
    expect(targetSnapshotFromGoals({ weekly: 500, monthly: '2000' }, 'month')).toEqual({ amount: 2000, source: 'goals.monthly' })
    expect(targetSnapshotFromGoals({ weekly: 500 }, 'quarter')).toEqual({ amount: null, source: null })
    expect(targetSnapshotFromGoals({ weekly: 0 }, 'week')).toEqual({ amount: null, source: 'goals.weekly' })
  })

  it('deterministically reports hit, miss, and not-set', () => {
    expect(assessGoalOutcome({ target: 500, actualPnl: 500, tradeCount: 1 })).toBe('hit')
    expect(assessGoalOutcome({ target: 500, actualPnl: 499.99, tradeCount: 3 })).toBe('miss')
    expect(assessGoalOutcome({ target: null, actualPnl: 1000, tradeCount: 3 })).toBe('not-set')
  })

  it('abstains when a targeted period has no trades instead of recording a miss', () => {
    expect(assessGoalOutcome({ target: 500, actualPnl: 0, tradeCount: 0 })).toBe('not-assessed')
  })
})

describe('versioned retrospective text envelope', () => {
  const trades = [
    { id: 'a', entryTime: '2026-07-15 09:30', pnl: 300 },
    { id: 'b', timestamp: '2026-07-16 10:15', pnl: 250 }
  ]
  const commitment = {
    id: 'focus-1', title: 'Use a stop', status: 'completed', ruleType: 'require_stop', ruleValue: 'required',
    evaluatedCount: 10, adheredCount: 9, adherenceRate: 90
  }

  it('reads legacy review text as human reflection without changing it', () => {
    expect(parsePeriodRetrospective('Good patience.\nAvoid FOMO.')).toEqual({
      structured: false,
      reflection: 'Good patience.\nAvoid FOMO.',
      retrospective: null
    })
  })

  it('round-trips human reflection and structured outcome/process data in the existing text field', () => {
    const retrospective = buildPeriodRetrospective({
      selectedPeriod: '2026-07-13', granularity: 'week', goals: { weekly: 500 }, trades,
      processStatus: 'hit', commitmentEvidence: commitment, reflection: 'I followed the plan — even under pressure.'
    })
    const stored = serializePeriodRetrospective(retrospective)
    const parsed = parsePeriodRetrospective(stored)

    expect(stored.startsWith('I followed the plan — even under pressure.')).toBe(true)
    expect(parsed.structured).toBe(true)
    expect(parsed.reflection).toBe('I followed the plan — even under pressure.')
    expect(parsed.retrospective.version).toBe(PERIOD_RETROSPECTIVE_VERSION)
    expect(parsed.retrospective.targetSnapshot.amount).toBe(500)
    expect(parsed.retrospective.actualPnl).toBe(550)
    expect(parsed.retrospective.goalOutcome).toBe('hit')
    expect(parsed.retrospective.process.status).toBe('hit')
    expect(parsed.retrospective.process.evidence).toEqual(commitmentEvidenceSnapshot(commitment))
  })

  it('preserves the original target snapshot while refreshing automatic actuals', () => {
    const first = buildPeriodRetrospective({
      selectedPeriod: '2026-07-13', granularity: 'week', goals: { weekly: 500 }, trades: trades.slice(0, 1)
    })
    const updated = buildPeriodRetrospective({
      selectedPeriod: '2026-07-13', granularity: 'week', goals: { weekly: 900 }, trades, existing: first
    })
    expect(updated.targetSnapshot.amount).toBe(500)
    expect(updated.actualPnl).toBe(550)
    expect(updated.tradeCount).toBe(2)
  })

  it('falls back to legacy text when an envelope is malformed', () => {
    const malformed = 'Reflection\n\n<!-- tradehelp-period-retrospective:v1\n{bad json}\n-->'
    const parsed = parsePeriodRetrospective(malformed)
    expect(parsed.structured).toBe(false)
    expect(parsed.reflection).toBe(malformed)
  })
})

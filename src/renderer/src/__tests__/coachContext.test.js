import { describe, expect, it } from 'vitest'
import { fullJournalContext, computeStats } from '../stats.js'

const trades = [
  { id: '1', symbol: 'MNQ', account: 'acc1', pnl: 100, size: 2, timestamp: '2026-07-01 10:00' },
  { id: '2', symbol: 'MES', account: '', pnl: -50, size: 1, timestamp: '2026-07-02 10:00' }
]
const settings = {
  propFirmAccounts: JSON.stringify([
    { id: 'acc1', label: '100K Topstep', accountSize: 100000, target: 6000, maxDailyLoss: 2200, maxDrawdown: 3000, ddType: 'trailing' }
  ])
}

describe('coach journal context — account labelling', () => {
  const ctx = fullJournalContext({ trades, stats: computeStats(trades), settings })

  it('shows prop trades by their human label, never the internal id', () => {
    expect(ctx).toContain('account=100K Topstep')
    expect(ctx).not.toContain('account=acc1')
  })

  it('labels an unassigned trade as the Live account', () => {
    expect(ctx).toContain('account=Live')
  })

  it('names the account in PROP ACCOUNT RULES by label, not id', () => {
    expect(ctx).toContain('name=100K Topstep')
    expect(ctx).not.toMatch(/name=acc1\b/)
  })

  it('explains that size is a contract count, not dollars', () => {
    expect(ctx).toMatch(/size = number of contracts/i)
  })

  it('marks untagged emotion/setup/reason as (none), not an invented value', () => {
    expect(ctx).toContain('emotion=(none)')
    expect(ctx).toContain('setup=(none)')
    expect(ctx).toContain('reason=(none)')
  })
})

describe('coach journal context — per-account summary', () => {
  const ctx = fullJournalContext({ trades, stats: computeStats(trades), settings })

  it('includes a pre-computed per-account summary when trades span accounts', () => {
    expect(ctx).toContain('PER-ACCOUNT SUMMARY')
    expect(ctx).toContain('account=100K Topstep | trades=1 | netPnL=100.00')
    expect(ctx).toContain('account=Live | trades=1 | netPnL=-50.00')
  })

  it('omits the per-account summary when everything is one account', () => {
    const liveOnly = [
      { id: 'a', symbol: 'MES', account: '', pnl: 20, size: 1, timestamp: '2026-07-01 10:00' },
      { id: 'b', symbol: 'MES', account: '', pnl: -10, size: 1, timestamp: '2026-07-02 10:00' }
    ]
    const out = fullJournalContext({ trades: liveOnly, stats: computeStats(liveOnly), settings: {} })
    expect(out).not.toContain('PER-ACCOUNT SUMMARY')
  })
})


describe('coach journal context — structured period retrospective privacy', () => {
  const structuredReview = [
    'Private structured reflection.',
    '',
    '<!-- tradehelp-period-retrospective:v1',
    JSON.stringify({
      type: 'period-retrospective',
      version: 1,
      periodKey: '2026-07-13',
      granularity: 'week',
      targetSnapshot: { amount: 500, source: 'goals.weekly' },
      actualPnl: 550,
      tradeCount: 2,
      goalOutcome: 'hit',
      process: {
        status: 'hit',
        evidence: {
          id: 'focus-1',
          title: 'Use a stop',
          status: 'completed',
          ruleType: 'require_stop',
          ruleValue: 'required',
          evaluatedCount: 10,
          adheredCount: 9,
          adherenceRate: 90
        }
      },
      reflection: 'Private structured reflection.'
    }),
    '-->'
  ].join('\n')
  const malformedEnvelope = [
    'Visible malformed reflection.',
    '',
    '<!-- tradehelp-period-retrospective:v1',
    '{"raw-envelope-secret":true}',
    '-->'
  ].join('\n')
  const reviews = {
    '2026-07-13': structuredReview,
    '2026-07-06': 'Legacy patience note.',
    '2026-06-30': malformedEnvelope
  }
  const context = (includeWritten) => fullJournalContext(
    { trades: [], stats: computeStats([]), settings: {}, reviews },
    { includeWritten }
  )

  it('always includes structured period, outcome, process, and evidence facts', () => {
    const out = context(false)
    expect(out).toContain('PERIOD RETROSPECTIVES')
    expect(out).toContain('period=2026-07-13 | granularity=week | target=500.00')
    expect(out).toContain('actualPnL=550.00 | tradeCount=2.00 | goalOutcome=hit | processOutcome=hit')
    expect(out).toContain('evidenceRuleType=require_stop')
    expect(out).toContain('evidenceAdhered=9.00/10.00 | evidenceAdherenceRate=90.00%')
  })

  it('withholds structured reflections and legacy reviews when written access is disabled', () => {
    const out = context(false)
    expect(out).not.toContain('Private structured reflection.')
    expect(out).not.toContain('Legacy patience note.')
    expect(out).not.toContain('Visible malformed reflection.')
  })

  it('includes written reflections when allowed without exposing envelope JSON', () => {
    const out = context(true)
    expect(out).toContain('Private structured reflection.')
    expect(out).toContain('Legacy patience note.')
    expect(out).toContain('Visible malformed reflection.')
    expect(out).not.toContain('tradehelp-period-retrospective')
    expect(out).not.toContain('raw-envelope-secret')
    expect(out).not.toContain('"type":"period-retrospective"')
  })
})
describe('coach journal context — commitments and goal progress', () => {
  const now = new Date('2026-07-15T12:00:00')
  // Monday of that week is 2026-07-13, so only the last two trades count week-to-date.
  const weekTrades = [
    { id: 'a', symbol: 'MNQ', pnl: 500, entryTime: '2026-07-02 10:00' },
    { id: 'b', symbol: 'MNQ', pnl: 200, entryTime: '2026-07-14 10:00' },
    { id: 'c', symbol: 'MNQ', pnl: -80, entryTime: '2026-07-15 09:30' }
  ]
  const commitment = {
    id: 'c1', title: 'Set a stop before every entry', ruleType: 'require_stop', ruleValue: 'required',
    targetCount: 10, status: 'active', startAt: '2026-07-13 08:00',
    evaluatedCount: 8, adheredCount: 6, adherenceRate: 75
  }
  const build = (extra = {}) => fullJournalContext(
    { trades: weekTrades, stats: computeStats(weekTrades), settings: { dailyGoal: 250 }, goals: { weekly: 400, monthly: 2000 }, ...extra },
    { now }
  )

  it('reports the active commitment with its adherence', () => {
    const ctx = build({ commitments: [commitment] })
    expect(ctx).toContain('PROCESS COMMITMENTS')
    expect(ctx).toContain('Set a stop before every entry')
    expect(ctx).toContain('kept 6/8 measured trades (75%)')
    expect(ctx).toContain('ACTIVE')
  })

  it('tells the coach to treat an active commitment as a constraint', () => {
    expect(build({ commitments: [commitment] })).toContain('standing constraint')
  })

  it('omits the section entirely when there are no commitments', () => {
    expect(build()).not.toContain('PROCESS COMMITMENTS')
  })

  it('pairs each goal with progress, not just the target', () => {
    const ctx = build()
    // Week starts Monday 2026-07-13: 200 + -80 = 120 against a 400 target.
    expect(ctx).toContain('This week so far: target 400.00 | actual 120.00 | 280.00 to go')
    // Month-to-date picks up all three trades: 500 + 200 - 80 = 620.
    expect(ctx).toContain('This month so far: target 2,000.00 | actual 620.00')
  })

  it('says a goal is met once it is beaten', () => {
    const ctx = fullJournalContext(
      { trades: weekTrades, stats: computeStats(weekTrades), settings: {}, goals: { weekly: 100 } },
      { now }
    )
    expect(ctx).toContain('This week so far: target 100.00 | actual 120.00 | met, 20.00 above')
  })

  it('does not pretend a missing target exists', () => {
    const ctx = fullJournalContext(
      { trades: weekTrades, stats: computeStats(weekTrades), settings: {}, goals: {} },
      { now }
    )
    expect(ctx).toContain('This week so far: no target set')
  })
})

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
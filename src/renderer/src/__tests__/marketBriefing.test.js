import { describe, expect, it } from 'vitest'
import { activeCommitmentSnapshot, buildJournalInsights, buildSessionBriefing, nextEventRisk, quoteBreadth, riskGuardrail } from '../marketBriefing.js'

describe('market briefing', () => {
  it('summarizes breadth without turning it into a directional signal', () => {
    expect(quoteBreadth([{ changePct: 1 }, { changePct: 0.4 }, { changePct: -0.2 }, { changePct: 0 }])).toEqual({
      total: 4, up: 2, down: 1, flat: 1, tone: 'positive'
    })
  })

  it('flags a high-impact release inside fifteen minutes', () => {
    const now = Date.parse('2026-08-17T13:00:00Z')
    const risk = nextEventRisk([
      { title: 'CPI', impact: 'High', ts: now + 10 * 60000 },
      { title: 'Low event', impact: 'Low', ts: now + 5 * 60000 }
    ], now, 'High')
    expect(risk.level).toBe('imminent')
    expect(risk.event.title).toBe('CPI')
    expect(risk.minutesAway).toBe(10)
  })

  it('keeps the output factual when no quote feed is available', () => {
    const brief = buildSessionBriefing({ quotes: [], events: [], settings: { maxDailyLoss: '300' }, now: Date.parse('2026-08-17T15:00:00Z') })
    expect(brief.headline).toMatch(/limited/)
    expect(brief.maxLoss).toBe(300)
    expect(brief.disclaimer).toMatch(/does not predict direction/)
  })

  it('shows how close today is to the saved loss boundary', () => {
    expect(riskGuardrail({ todayNet: -240, todayCount: 3, maxLoss: 300 })).toMatchObject({
      state: 'caution', remaining: 60, usedPct: 80, trades: 3
    })
    expect(riskGuardrail({ todayNet: -310, maxLoss: 300 }).state).toBe('stop')
  })

  it('recognizes when a maximum-trades commitment has been reached', () => {
    const snapshot = activeCommitmentSnapshot([{
      id: 'c1', status: 'active', title: 'Two attempts only', ruleType: 'max_trades_day', ruleValue: '2', evaluatedCount: 4, targetCount: 10, adherenceRate: 75
    }], 2)
    expect(snapshot.capReached).toBe(true)
    expect(snapshot.progressPct).toBe(40)
    expect(snapshot.adherenceRate).toBe(75)
  })

  it('turns journal evidence into specific, traceable warnings', () => {
    const now = Date.parse('2026-08-17T15:00:00Z')
    const insights = buildJournalInsights({
      now,
      todayCount: 2,
      commitment: { capReached: true, cap: 2 },
      ruleBreaks: [{ occurredAt: '2026-08-17T14:55:00Z' }],
      correlation: {
        covered: true,
        news: { n: 4, winRate: 25 },
        quiet: { n: 8, winRate: 62.5 },
        avgPnlDelta: -85
      },
      leaks: { worst: { label: 'Revenge trades', n: 3, pnl: -420, blurb: 'trading to win it back' } }
    })
    expect(insights.map((insight) => insight.id)).toEqual(['trade-cap', 'rule-breaks-today', 'news-history', 'behavior-leak'])
    expect(insights[2].detail).toContain('-$85.00')
  })

  it('puts a hard personal guardrail ahead of generic market context', () => {
    const brief = buildSessionBriefing({
      quotes: [{ changePct: 1 }],
      settings: { maxDailyLoss: '300' },
      journal: { todayNet: -300, todayCount: 2 },
      now: Date.parse('2026-08-17T15:00:00Z')
    })
    expect(brief.headline).toMatch(/loss boundary/)
    expect(brief.guardrail.state).toBe('stop')
  })
})

describe('briefing robustness', () => {
  it('stays silent instead of throwing when a correlation bucket has no win rate', () => {
    // The buckets carry a trade count but no rate. Reading .toFixed() off the
    // missing one used to take the whole News tab down.
    const insights = buildJournalInsights({
      correlation: { covered: true, news: { n: 4 }, quiet: { n: 6 }, avgPnlDelta: -85 }
    })
    expect(insights.some((i) => i.id === 'news-history')).toBe(false)
    expect(insights.length).toBeGreaterThan(0)
  })

  it('still reports the comparison when both rates are present', () => {
    const insights = buildJournalInsights({
      correlation: { covered: true, news: { n: 4, winRate: 25 }, quiet: { n: 6, winRate: 60 }, avgPnlDelta: -85 }
    })
    expect(insights.find((i) => i.id === 'news-history').detail).toContain('25% win rate')
  })

  it('returns the same shape whether or not a commitment is active', () => {
    // A guard written against one branch used to miss the other.
    const none = activeCommitmentSnapshot([], 0)
    const some = activeCommitmentSnapshot([{ status: 'active', targetCount: 5, evaluatedCount: 1 }], 0)
    expect(Object.keys(none).sort()).toEqual(Object.keys(some).sort())
    expect(none.adherenceRate).toBeNull()
  })

  it('judges event risk on the trader settings, not on a calendar filter', () => {
    const now = Date.parse('2026-08-17T13:00:00Z')
    const events = [{ title: 'Retail sales', impact: 'Medium', ts: now + 10 * 60000 }]
    // The News tab used to hand over its already-filtered list, so browsing
    // "High only" hid a Medium release the settings still asked to be warned about.
    const brief = buildSessionBriefing({ events, settings: { eventsMinImpact: 'Medium' }, now })
    expect(brief.eventRisk.level).toBe('imminent')
    expect(brief.eventRisk.event.title).toBe('Retail sales')
  })
})

describe('day bucketing agrees with the rest of the app', () => {
  it('uses the same calendar day helper the journal filters trades by', () => {
    // todayNet and todayCount reach the briefing already filtered by
    // localDateKey. If this module bucketed by a different day the guardrail
    // and the rule-break line would contradict each other in the same card.
    const now = Date.parse('2026-08-17T15:00:00Z')
    const sameDay = new Date(now).setHours(9, 0, 0, 0)
    const dayBefore = sameDay - 24 * 60 * 60 * 1000

    const insights = buildJournalInsights({
      now,
      ruleBreaks: [{ occurredAt: new Date(sameDay).toISOString() }]
    })
    expect(insights.some((i) => i.id === 'rule-breaks-today')).toBe(true)

    // Yesterday's single break is recent but not today's.
    const older = buildJournalInsights({
      now,
      ruleBreaks: [{ occurredAt: new Date(dayBefore).toISOString() }]
    })
    expect(older.some((i) => i.id === 'rule-breaks-today')).toBe(false)
  })
})

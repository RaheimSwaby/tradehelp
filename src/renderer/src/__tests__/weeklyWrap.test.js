import { describe, expect, it } from 'vitest'
import { buildWeeklyWrap, filterTradingSessions, monthlyWrapCandidate, previousMonthKey, previousQuarterKey, previousWeekKey, quarterlyWrapCandidate, ruleBreakKey, ruleBreaksForSession, summarizeRuleBreaks, weeklyWrapCandidate } from '../weeklyWrap.js'

const trades = [
  { id: 'a', timestamp: '2026-07-27 09:30', pnl: 120, emotion: 'Confident', setup: 'Pullback', reason: 'Followed my plan' },
  { id: 'b', timestamp: '2026-07-28 10:00', pnl: -80, emotion: 'FOMO', setup: 'Breakout', reason: 'FOMO / chased' },
  { id: 'c', timestamp: '2026-07-30 09:45', pnl: -60, emotion: 'FOMO', setup: 'Breakout', reason: 'FOMO / chased' }
]
const ruleBreaks = [
  { id: 'r2', ruleKey: 'risk-is-within-plan', ruleText: 'Risk is within plan', reason: 'Tried to win it back', occurredAt: '2026-07-30T14:00:00.000Z' },
  { id: 'r1', ruleKey: 'risk-is-within-plan', ruleText: 'Risk is within plan', reason: 'Raised size after a loss', occurredAt: '2026-07-28T14:00:00.000Z' }
]

describe('weekly wrap scheduling', () => {
  it('offers the completed week on Monday and the current week after a Friday session', () => {
    const monday = new Date(2026, 7, 3, 9)
    const friday = new Date(2026, 6, 31, 16)
    expect(previousWeekKey(monday)).toBe('2026-07-27')
    expect(weeklyWrapCandidate(monday)).toBe('2026-07-27')
    expect(weeklyWrapCandidate(friday, { afterSession: true })).toBe('2026-07-27')
  })

  // Someone away on Monday, or who only trades midweek, would otherwise never see the
  // recap. The caller stores each week key it has shown, so offering it every day still
  // surfaces the wrap exactly once.
  it('still offers the completed week midweek, not only on Monday', () => {
    const thursday = new Date(2026, 6, 30, 16)
    expect(thursday.getDay()).toBe(4)
    expect(weeklyWrapCandidate(thursday)).toBe('2026-07-20')
    const wednesday = new Date(2026, 7, 5, 11)
    expect(weeklyWrapCandidate(wednesday)).toBe('2026-07-27')
  })

  it('returns nothing for an unusable date', () => {
    expect(weeklyWrapCandidate('not a date')).toBe('')
  })
})

describe('weekly wrap stats', () => {
  it('builds a local deterministic recap and prioritizes repeated rule breaks', () => {
    const wrap = buildWeeklyWrap({ trades, ruleBreaks, weekKey: '2026-07-27' })
    expect(wrap).toMatchObject({ wins: 1, losses: 2, flat: 0 })
    expect(wrap.stats.totalPnl).toBe(-20)
    expect(wrap.ruleBreaks).toHaveLength(2)
    expect(wrap.weakness).toMatchObject({ type: 'rule', label: 'Risk is within plan', count: 2 })
    expect(wrap.focus).toContain('exact size')
  })

  it('returns no recap when the week has no trades', () => {
    expect(buildWeeklyWrap({ trades, ruleBreaks, weekKey: '2026-08-10' })).toBeNull()
  })
})

describe('rule-break summaries', () => {
  it('normalizes rule keys and recalls the latest reason', () => {
    expect(ruleBreakKey(' Risk is within plan! ')).toBe('risk-is-within-plan')
    const summary = summarizeRuleBreaks(ruleBreaks, ['Risk is within plan'])
    expect(summary.total).toBe(2)
    expect(summary.weakness).toMatchObject({ label: 'Risk is within plan', count: 2 })
    expect(summary.latestByRule['risk-is-within-plan'].reason).toBe('Tried to win it back')
  })

  it('retrieves only reasons linked to the expanded saved session', () => {
    const entries = [
      { id: 'one', sessionId: 'session-a', reason: 'Chased' },
      { id: 'two', sessionId: 'session-b', reason: 'Oversized' },
      { id: 'three', sessionId: 'session-a', reason: 'Moved stop' }
    ]
    expect(ruleBreaksForSession(entries, 'session-a').map((entry) => entry.id)).toEqual(['one', 'three'])
    expect(ruleBreaksForSession(entries, '')).toEqual([])
  })

  it('searches session notes and linked rule-break details, then applies archive filters', () => {
    const sessions = [
      { id: 'session-a', startedAt: '2026-08-01T14:30:00.000Z', notes: 'Waited for confirmation', recordingStatus: 'none' },
      { id: 'session-b', startedAt: '2026-08-02T14:30:00.000Z', notes: '', recordingStatus: 'ready' }
    ]
    const entries = [{ sessionId: 'session-b', ruleText: 'Risk stays fixed', reason: 'Sized up after a loss' }]
    expect(filterTradingSessions(sessions, entries, 'confirmation')).toEqual([sessions[0]])
    expect(filterTradingSessions(sessions, entries, 'sized up')).toEqual([sessions[1]])
    expect(filterTradingSessions(sessions, entries, '', 'notes')).toEqual([sessions[0]])
    expect(filterTradingSessions(sessions, entries, '', 'rule-breaks')).toEqual([sessions[1]])
    expect(filterTradingSessions(sessions, entries, '', 'recordings')).toEqual([sessions[1]])
    expect(filterTradingSessions(sessions, entries, '', 'clean')).toEqual([sessions[0]])
  })
})

describe('monthly rewind', () => {
  it('offers the completed month on any day of the current one', () => {
    expect(previousMonthKey(new Date(2026, 7, 1, 9))).toBe('2026-07')
    expect(monthlyWrapCandidate(new Date(2026, 7, 19, 15))).toBe('2026-07')
  })

  // Stepping back from the 31st without anchoring to the 1st lands in the wrong month
  // whenever the previous month is shorter.
  it('does not skip a short month when run on a 31st', () => {
    expect(previousMonthKey(new Date(2026, 6, 31, 12))).toBe('2026-06')
    expect(previousMonthKey(new Date(2026, 2, 31, 12))).toBe('2026-02')
  })

  it('rolls back across a year boundary', () => {
    expect(previousMonthKey(new Date(2026, 0, 4, 9))).toBe('2025-12')
  })

  it('builds the same recap shape over a month of trades', () => {
    const wrap = buildWeeklyWrap({ trades, ruleBreaks, weekKey: '2026-07', granularity: 'month' })
    expect(wrap.granularity).toBe('month')
    expect(wrap.trades).toHaveLength(3)
    expect(wrap.ruleBreaks).toHaveLength(2)
    expect(wrap.headline).toContain('month')
    expect(wrap.weakness).toMatchObject({ type: 'rule', label: 'Risk is within plan' })
  })

  it('returns nothing for a month with no trades', () => {
    expect(buildWeeklyWrap({ trades, ruleBreaks, weekKey: '2026-01', granularity: 'month' })).toBeNull()
  })
})

describe('quarterly rewind', () => {
  it('offers the most recently completed quarter once the next quarter begins', () => {
    expect(previousQuarterKey(new Date(2026, 7, 19, 15))).toBe('2026-Q2')
    expect(quarterlyWrapCandidate(new Date(2026, 9, 1, 9))).toBe('2026-Q3')
  })

  it('rolls back across a year boundary', () => {
    expect(previousQuarterKey(new Date(2026, 0, 4, 9))).toBe('2025-Q4')
  })

  it('builds the same deterministic recap over a quarter', () => {
    const wrap = buildWeeklyWrap({ trades, ruleBreaks, weekKey: '2026-Q3', granularity: 'quarter' })
    expect(wrap).toMatchObject({ granularity: 'quarter', wins: 1, losses: 2 })
    expect(wrap.trades).toHaveLength(3)
    expect(wrap.headline).toContain('quarter')
  })
})

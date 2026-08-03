import { describe, expect, it } from 'vitest'
import { buildNewsCorrelation, eventsAtImpact, newsCorrelationHeadline, tradeNewsMatches } from '../newsCorrelation.js'

const at = (iso) => new Date(iso).getTime()

function trade(entryTime, pnl) {
  return { id: `${entryTime}-${pnl}`, entryTime, pnl }
}

function event(ts, title = 'Non-Farm Employment Change', impact = 'High') {
  return { ts: at(ts), title, impact, country: 'USD' }
}

// One high-impact print at 08:30 local on the 5th and another on the 12th.
const EVENTS = [event('2026-06-05T08:30'), event('2026-06-12T08:30', 'CPI m/m')]

describe('eventsAtImpact', () => {
  it('keeps only events at or above the requested impact', () => {
    const mixed = [event('2026-06-05T08:30'), event('2026-06-05T10:00', 'Retail Sales', 'Medium')]
    expect(eventsAtImpact(mixed, 'High')).toHaveLength(1)
    expect(eventsAtImpact(mixed, 'Medium')).toHaveLength(2)
  })
})

describe('tradeNewsMatches', () => {
  it('matches a trade inside the window on either side of the print', () => {
    expect(tradeNewsMatches(trade('2026-06-05T08:20', 50), EVENTS, 30)).toHaveLength(1)
    expect(tradeNewsMatches(trade('2026-06-05T08:55', 50), EVENTS, 30)).toHaveLength(1)
  })

  it('does not match a trade outside the window', () => {
    expect(tradeNewsMatches(trade('2026-06-05T09:30', 50), EVENTS, 30)).toHaveLength(0)
  })

  it('ignores a trade with no usable timestamp', () => {
    expect(tradeNewsMatches({ pnl: 10 }, EVENTS, 30)).toEqual([])
  })
})

describe('buildNewsCorrelation', () => {
  // Coverage is passed explicitly here the way the tab does it, standing in for a full
  // week of archived calendar rather than just the two high-impact prints.
  const WEEK = { earliest: at('2026-06-01T00:00'), latest: at('2026-06-14T23:59') }

  it('splits news-adjacent trades from quiet ones and compares them', () => {
    const trades = [
      trade('2026-06-05T08:35', -200), // inside NFP
      trade('2026-06-05T08:40', -100), // inside NFP
      trade('2026-06-05T12:00', 150),  // quiet
      trade('2026-06-12T12:00', 250)   // quiet
    ]
    const result = buildNewsCorrelation(trades, EVENTS, { windowMin: 30, coverage: WEEK })
    expect(result.covered).toBe(true)
    expect(result.news.n).toBe(2)
    expect(result.quiet.n).toBe(2)
    expect(result.news.totalPnl).toBe(-300)
    expect(result.quiet.totalPnl).toBe(400)
    expect(result.news.winRate).toBe(0)
    expect(result.quiet.winRate).toBe(100)
    expect(result.winRateDelta).toBe(-100)
  })

  it('breaks the news side down per event, worst first', () => {
    const trades = [
      trade('2026-06-05T08:35', -400), // NFP
      trade('2026-06-12T08:35', 120)   // CPI
    ]
    const result = buildNewsCorrelation(trades, EVENTS, { windowMin: 30 })
    expect(result.byEvent.map((e) => e.title)).toEqual(['Non-Farm Employment Change', 'CPI m/m'])
    expect(result.byEvent[0].totalPnl).toBe(-400)
  })

  // The whole point of tracking coverage: a trade from before any event was archived
  // has unknown context and must not be scored as a quiet trade.
  it('excludes trades outside the archived event range instead of calling them quiet', () => {
    const trades = [
      trade('2020-01-15T10:00', -500), // long before any stored event
      trade('2026-06-05T12:00', 100)   // inside coverage, genuinely quiet
    ]
    const result = buildNewsCorrelation(trades, EVENTS, { windowMin: 30, coverage: WEEK })
    expect(result.uncovered).toBe(1)
    expect(result.analyzed).toBe(1)
    expect(result.quiet.n).toBe(1)
    expect(result.quiet.totalPnl).toBe(100)
  })

  it('reports no coverage when nothing has been archived yet', () => {
    const result = buildNewsCorrelation([trade('2026-06-05T08:35', -200)], [], { windowMin: 30 })
    expect(result.covered).toBe(false)
    expect(result.uncovered).toBe(1)
    expect(result.news.n).toBe(0)
  })

  it('counts a trade caught between two prints toward both breakdowns but once overall', () => {
    const stacked = [event('2026-06-05T08:30', 'NFP'), event('2026-06-05T08:45', 'Unemployment Rate')]
    const result = buildNewsCorrelation([trade('2026-06-05T08:37', -75)], stacked, { windowMin: 30 })
    expect(result.news.n).toBe(1)
    expect(result.byEvent).toHaveLength(2)
    expect(result.byEvent.every((e) => e.n === 1)).toBe(true)
  })

  it('ignores medium-impact events by default', () => {
    const medium = [event('2026-06-05T08:30', 'Retail Sales', 'Medium')]
    const result = buildNewsCorrelation([trade('2026-06-05T08:35', -50)], medium, { windowMin: 30 })
    expect(result.covered).toBe(false)
  })
})

describe('newsCorrelationHeadline', () => {
  it('summarises the comparison in one line', () => {
    const trades = [trade('2026-06-05T08:35', -200), trade('2026-06-05T12:00', 100)]
    const headline = newsCorrelationHeadline(buildNewsCorrelation(trades, EVENTS, { windowMin: 30 }))
    expect(headline.tone).toBe('down')
    expect(headline.text).toContain('0% win rate within 30 min')
  })

  it('says nothing when one side has no trades', () => {
    const result = buildNewsCorrelation([trade('2026-06-05T08:35', -200)], EVENTS, { windowMin: 30 })
    expect(newsCorrelationHeadline(result)).toBeNull()
  })
})

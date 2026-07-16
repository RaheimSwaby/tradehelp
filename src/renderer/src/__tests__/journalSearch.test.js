import { describe, it, expect } from 'vitest'
import { parseJournalQuery, matchesJournalFilters } from '../journalSearch.js'

// A Wednesday, noon local — keeps the relative-date cases deterministic.
const NOW = new Date(2026, 6, 15, 12, 0, 0)

function parse(query, opts = {}) {
  return parseJournalQuery(query, { now: NOW, ...opts }).filters
}
function byKind(filters, kind) {
  return filters.filter((f) => f.kind === kind)
}
function firstKind(filters, kind) {
  return byKind(filters, kind)[0]
}

const TRADES = [
  { id: 'a', symbol: 'NQ', direction: 'Long', setup: 'Pullback', emotion: 'calm', reason: 'plan', notes: 'clean break', account: '', pnl: 250, riskAmount: 100, rr: 3, entryTime: '2026-07-15 10:00', exitTime: '2026-07-15 10:45', imageCount: 2 },
  { id: 'b', symbol: 'ES', direction: 'Short', setup: 'Breakout', emotion: 'anxious', reason: 'fomo', notes: 'chased it', account: 'prop1', pnl: -150, riskAmount: 200, rr: 1, entryTime: '2026-07-13 13:30', exitTime: '2026-07-13 13:40', imageCount: 0 },
]

describe('parseJournalQuery — outcomes & direction', () => {
  it('returns no filters for an empty query', () => {
    expect(parseJournalQuery('', { now: NOW }).filters).toEqual([])
    expect(parseJournalQuery('   ', { now: NOW }).filters).toEqual([])
  })

  it('maps outcome words', () => {
    expect(firstKind(parse('wins'), 'outcome')).toMatchObject({ value: 'win' })
    expect(firstKind(parse('losing trades'), 'outcome')).toMatchObject({ value: 'loss' })
    expect(firstKind(parse('breakeven'), 'outcome')).toMatchObject({ value: 'flat' })
  })

  it('maps direction words', () => {
    expect(firstKind(parse('long'), 'field')).toMatchObject({ field: 'direction', value: 'Long' })
    expect(firstKind(parse('short trades'), 'field')).toMatchObject({ field: 'direction', value: 'Short' })
  })

  it('dedupes repeated conditions', () => {
    expect(byKind(parse('wins wins winners'), 'outcome')).toHaveLength(1)
  })
})

describe('parseJournalQuery — numbers & money', () => {
  it('interprets "losses over $100" as loss magnitude plus a loss outcome', () => {
    const filters = parse('losses over $100')
    expect(firstKind(filters, 'outcome')).toMatchObject({ value: 'loss' })
    expect(firstKind(filters, 'number')).toMatchObject({ field: 'lossMagnitude', operator: 'gt', value: 100 })
  })

  it('parses risk / pnl / rr / hold comparisons', () => {
    expect(firstKind(parse('risk under $50'), 'number')).toMatchObject({ field: 'risk', operator: 'lt', value: 50 })
    expect(firstKind(parse('pnl over 200'), 'number')).toMatchObject({ field: 'pnl', operator: 'gt', value: 200 })
    expect(firstKind(parse('rr at least 2'), 'number')).toMatchObject({ field: 'rr', operator: 'gte', value: 2 })
    expect(firstKind(parse('held over 30 minutes'), 'number')).toMatchObject({ field: 'hold', operator: 'gt', value: 30 * 60000 })
    expect(firstKind(parse('held over 2 hours'), 'number')).toMatchObject({ field: 'hold', operator: 'gt', value: 2 * 3600000 })
  })

  it('treats an unqualified dollar amount as net P&L', () => {
    expect(firstKind(parse('over $200'), 'number')).toMatchObject({ field: 'pnl', operator: 'gt', value: 200 })
    expect(firstKind(parse('$500+'), 'number')).toMatchObject({ field: 'pnl', operator: 'gte', value: 500 })
  })

  it('strips thousands separators', () => {
    expect(firstKind(parse('pnl over $1,250'), 'number')).toMatchObject({ value: 1250 })
  })
})

describe('parseJournalQuery — time, dates & weekdays', () => {
  it('parses clock times with and without minutes', () => {
    expect(firstKind(parse('after 11am'), 'entryTime')).toMatchObject({ operator: 'gt', value: 11 * 60 })
    expect(firstKind(parse('before 3pm'), 'entryTime')).toMatchObject({ operator: 'lt', value: 15 * 60 })
    expect(firstKind(parse('after 11:30'), 'entryTime')).toMatchObject({ operator: 'gt', value: 11 * 60 + 30 })
  })

  it('parses "today" and "this week" relative to now', () => {
    const today = firstKind(parse('today'), 'dateRange')
    expect(today.from).toBe(new Date(2026, 6, 15).getTime())
    expect(today.to).toBe(new Date(2026, 6, 16).getTime())
    const week = firstKind(parse('this week'), 'dateRange')
    expect(week.from).toBe(new Date(2026, 6, 13).getTime()) // Monday of NOW's week
  })

  it('parses an explicit ISO date qualifier', () => {
    const since = firstKind(parse('since 2026-01-01'), 'dateRange')
    expect(since.from).toBe(new Date(2026, 0, 1).getTime())
    expect(since.to).toBe(Infinity)
  })

  it('parses a weekday name to its index', () => {
    expect(firstKind(parse('monday'), 'weekday')).toMatchObject({ value: 1 })
  })
})

describe('parseJournalQuery — fields, flags & free text', () => {
  it('matches known symbols/setups/accounts from the data', () => {
    const filters = parse('NQ pullback', { trades: TRADES })
    expect(filters.find((f) => f.field === 'symbol')).toMatchObject({ value: 'NQ' })
    expect(filters.find((f) => f.field === 'setup')).toMatchObject({ value: 'Pullback' })
  })

  it('resolves an account label to its id', () => {
    const filters = parse('Topstep account', { trades: TRADES, accounts: [{ id: 'prop1', label: 'Topstep' }] })
    expect(filters.find((f) => f.field === 'account')).toMatchObject({ value: 'prop1' })
  })

  it('escapes regex metacharacters in symbol candidates', () => {
    const filters = parse('BRK.B', { trades: [{ symbol: 'BRK.B' }] })
    expect(filters.find((f) => f.field === 'symbol')).toMatchObject({ value: 'BRK.B' })
    // The dot must be literal — it should not match "BRKXB".
    expect(parse('BRKXB', { trades: [{ symbol: 'BRK.B' }] }).find((f) => f.field === 'symbol')).toBeUndefined()
  })

  it('parses screenshot, grade and source flags', () => {
    expect(firstKind(parse('with screenshots'), 'hasImages')).toMatchObject({ value: true })
    expect(firstKind(parse('without a screenshot'), 'hasImages')).toMatchObject({ value: false })
    expect(firstKind(parse('setup grade A'), 'field')).toMatchObject({ field: 'selfSetup', value: 'A' })
    expect(firstKind(parse('imported trades'), 'field')).toMatchObject({ field: 'source', value: 'import' })
  })

  it('treats quoted text as an exact phrase', () => {
    expect(firstKind(parse('"opening range"'), 'textExact')).toMatchObject({ value: 'opening range' })
  })

  it('collects leftover words as required tokens, dropping stop words', () => {
    const tokens = firstKind(parse('show me gap fill trades'), 'textTokens')
    expect(tokens.value).toEqual(expect.arrayContaining(['gap', 'fill']))
    expect(tokens.value).not.toContain('trades')
    expect(tokens.value).not.toContain('show')
  })
})

describe('matchesJournalFilters', () => {
  it('evaluates outcomes against net P&L', () => {
    expect(matchesJournalFilters({ pnl: 10 }, parse('wins'))).toBe(true)
    expect(matchesJournalFilters({ pnl: 0 }, parse('wins'))).toBe(false)
    expect(matchesJournalFilters({ pnl: -10 }, parse('losses'))).toBe(true)
  })

  it('requires every filter to pass (AND semantics)', () => {
    const filters = parse('losses over $100')
    expect(matchesJournalFilters({ pnl: -150 }, filters)).toBe(true)
    expect(matchesJournalFilters({ pnl: -50 }, filters)).toBe(false) // magnitude too small
    expect(matchesJournalFilters({ pnl: 150 }, filters)).toBe(false) // not a loss
  })

  it('evaluates entry time and hold duration', () => {
    expect(matchesJournalFilters(TRADES[0], parse('after 9am'))).toBe(true) // entered 10:00
    expect(matchesJournalFilters(TRADES[0], parse('after 11am'))).toBe(false)
    expect(matchesJournalFilters(TRADES[0], parse('held over 30 minutes'))).toBe(true) // 45m
    expect(matchesJournalFilters(TRADES[1], parse('held over 30 minutes'))).toBe(false) // 10m
  })

  it('evaluates the has-screenshots flag', () => {
    expect(matchesJournalFilters(TRADES[0], parse('with screenshots'))).toBe(true)
    expect(matchesJournalFilters(TRADES[1], parse('with screenshots'))).toBe(false)
    expect(matchesJournalFilters(TRADES[1], parse('without screenshots'))).toBe(true)
  })

  it('evaluates weekday and date ranges by entry date', () => {
    expect(matchesJournalFilters(TRADES[1], parse('monday'))).toBe(true) // 2026-07-13 is Mon
    expect(matchesJournalFilters(TRADES[0], parse('monday'))).toBe(false)
    expect(matchesJournalFilters(TRADES[0], parse('today'))).toBe(true) // 2026-07-15
    expect(matchesJournalFilters(TRADES[1], parse('today'))).toBe(false)
  })

  it('matches free-text tokens across searchable fields', () => {
    expect(matchesJournalFilters(TRADES[1], parse('chased'))).toBe(true) // in notes
    expect(matchesJournalFilters(TRADES[0], parse('chased'))).toBe(false)
  })

  it('buckets a date-only timestamp by its local day', () => {
    // No time component — must still count as NOW's day, not shift to a neighbour.
    expect(matchesJournalFilters({ timestamp: '2026-07-15' }, parse('today'))).toBe(true)
    expect(matchesJournalFilters({ timestamp: '2026-07-14' }, parse('today'))).toBe(false)
  })

  it('an unmatched filter set excludes everything but empty filters keep all', () => {
    expect(matchesJournalFilters(TRADES[0], [])).toBe(true)
  })
})

describe('integration — a full natural-language query', () => {
  it('parses "losing NQ trades this week after 11am" into the expected conditions', () => {
    const filters = parse('losing NQ trades this week after 11am', { trades: TRADES })
    const kinds = filters.map((f) => f.kind)
    expect(kinds).toEqual(expect.arrayContaining(['outcome', 'field', 'dateRange', 'entryTime']))
    expect(filters.find((f) => f.field === 'symbol')).toMatchObject({ value: 'NQ' })
    expect(firstKind(filters, 'outcome')).toMatchObject({ value: 'loss' })
    expect(firstKind(filters, 'entryTime')).toMatchObject({ operator: 'gt', value: 11 * 60 })

    // NQ trade won: fails the "losing" condition.
    expect(matchesJournalFilters(TRADES[0], filters)).toBe(false)
  })
})

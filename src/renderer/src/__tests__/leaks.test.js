import { describe, expect, it } from 'vitest'
import { computeLeaks } from '../stats.js'

function trade(overrides = {}) {
  return { id: Math.random().toString(36).slice(2), symbol: 'MNQ', pnl: 0, emotion: '', reason: '', ...overrides }
}
const cat = (res, id) => res.leaks.find((c) => c.id === id)

describe('computeLeaks', () => {
  it('returns nothing to analyze when no trades carry emotion/reason tags', () => {
    const res = computeLeaks([trade({ pnl: -100 }), trade({ pnl: 50 })])
    expect(res.taggedCount).toBe(0)
    expect(res.worst).toBeNull()
  })

  it('sums P&L per behavioral category from emotion OR reason tags', () => {
    const res = computeLeaks([
      trade({ emotion: 'Revenge', pnl: -200 }),
      trade({ reason: 'Revenge trade', pnl: -150 }),
      trade({ emotion: 'FOMO', pnl: -80 }),
      trade({ reason: 'FOMO / chased', pnl: -40 })
    ])
    expect(cat(res, 'revenge').n).toBe(2)
    expect(cat(res, 'revenge').pnl).toBe(-350)
    expect(cat(res, 'fomo').pnl).toBe(-120)
  })

  it('surfaces the single worst leak by net loss', () => {
    const res = computeLeaks([
      trade({ emotion: 'Revenge', pnl: -300 }),
      trade({ emotion: 'Revenge', pnl: -300 }),
      trade({ emotion: 'Bored', pnl: -20 }),
      trade({ emotion: 'Bored', pnl: -20 })
    ])
    expect(res.worst.id).toBe('revenge')
    expect(res.worst.pnl).toBe(-600)
  })

  it('ignores patterns that are net positive or too small a sample', () => {
    const res = computeLeaks([
      trade({ emotion: 'Greedy', pnl: 500 }),   // greed happened to win — not a leak
      trade({ emotion: 'Greedy', pnl: 100 }),
      trade({ reason: 'Oversized', pnl: -300 }) // only 1 oversized trade — below sample threshold
    ])
    expect(cat(res, 'greed')).toBeUndefined()
    expect(cat(res, 'oversized')).toBeUndefined()
    expect(res.worst).toBeNull()
  })

  it('counts a trade once per leak it matches and totals unique tilt-tagged P&L', () => {
    const res = computeLeaks([
      trade({ emotion: 'Greedy', reason: 'Oversized', pnl: -100 }), // feeds greed + oversized, counted once in total
      trade({ emotion: 'Greedy', reason: 'Oversized', pnl: -100 }),
      trade({ emotion: 'Revenge', pnl: -50 }),
      trade({ emotion: 'Revenge', pnl: -50 })
    ])
    // total should be unique-trade P&L: -100 -100 -50 -50 = -300 (the greed/oversized overlap not double-counted)
    expect(res.totalLeaked).toBe(-300)
    expect(cat(res, 'greed').pnl).toBe(-200)
    expect(cat(res, 'oversized').pnl).toBe(-200)
  })
})

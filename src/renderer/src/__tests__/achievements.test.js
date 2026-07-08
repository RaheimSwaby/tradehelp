import { describe, expect, it } from 'vitest'
import { ACH_TIERS, computeAchievements, computeStats } from '../stats.js'

function trade(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    symbol: 'MNQ', direction: 'Long', entry: 0, exit: 0, stop: 0, target: 0,
    size: 1, riskAmount: 0, pnl: 100, rr: 0, emotion: 'Neutral', setup: '',
    notes: '', reason: '', timestamp: '2026-06-01 09:30',
    ...overrides
  }
}

const ach = (trades, { payouts = [], dayLogs = [] } = {}) =>
  computeAchievements(trades, computeStats(trades), payouts, dayLogs)
const byId = (list, id) => list.find((a) => a.id === id)

describe('achievement tiers', () => {
  it('every achievement carries a valid difficulty tier', () => {
    for (const a of ach([])) {
      expect(Object.keys(ACH_TIERS)).toContain(a.tier)
    }
  })
})

describe('Sat On My Hands', () => {
  it('counts logged no-trade days and unlocks at 10', () => {
    const logs9 = Array.from({ length: 9 }, (_, i) => ({ id: String(i) }))
    expect(byId(ach([], { dayLogs: logs9 }), 'satonhands').unlocked).toBe(false)
    const a = byId(ach([], { dayLogs: [...logs9, { id: '9' }] }), 'satonhands')
    expect(a.current).toBe(10)
    expect(a.unlocked).toBe(true)
  })
})

describe('Defined Risk', () => {
  it('counts only trades with a valid stop AND a target', () => {
    const trades = [
      trade({ entry: 100, stop: 95, target: 110 }),  // counts
      trade({ entry: 100, stop: 105, target: 110 }), // stop on wrong side for a Long — no
      trade({ entry: 100, stop: 95, target: 0 }),    // no target — no
      trade({ direction: 'Short', entry: 100, stop: 105, target: 90 }) // counts
    ]
    expect(byId(ach(trades), 'definedrisk').current).toBe(2)
  })
})

describe('Locked In', () => {
  it('rides through weekends but breaks on longer gaps', () => {
    // Mon Jun 1 – Fri Jun 5, then Mon Jun 8 – Fri Jun 12 (Fri→Mon gap of 3 days is fine)
    const days = ['06-01', '06-02', '06-03', '06-04', '06-05', '06-08', '06-09', '06-10', '06-11', '06-12']
    const trades = days.map((d) => trade({ timestamp: `2026-${d} 09:30` }))
    const a = byId(ach(trades), 'lockedin')
    expect(a.current).toBe(10)
    expect(a.unlocked).toBe(true)
    // A week-long hole resets the run
    const broken = [...days.slice(0, 5), '06-15', '06-16'].map((d) => trade({ timestamp: `2026-${d} 09:30` }))
    expect(byId(ach(broken), 'lockedin').current).toBe(5)
  })
})

describe('Bounce Back', () => {
  it('counts clean, risk-honored days that follow a red day', () => {
    const trades = [
      trade({ timestamp: '2026-06-01 09:30', pnl: -200 }),                       // red day
      trade({ timestamp: '2026-06-02 09:30', pnl: 150, emotion: 'Disciplined' }), // clean bounce ✓
      trade({ timestamp: '2026-06-03 09:30', pnl: -100 }),                       // red day
      trade({ timestamp: '2026-06-04 09:30', pnl: 80, emotion: 'Revenge' })      // tilted — no
    ]
    const a = byId(ach(trades), 'bounceback')
    expect(a.current).toBe(1)
    expect(a.goal).toBe(3)
    expect(a.unlocked).toBe(false)
  })
})

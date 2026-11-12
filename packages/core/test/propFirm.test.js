import { afterEach, describe, expect, it, vi } from 'vitest'
import { computePropFirm } from '../src/propFirm.js'

const account = (overrides = {}) => ({
  id: 'eval-1', accountSize: 50000, target: 3000, maxDailyLoss: 1000, maxDrawdown: 2000,
  minDays: 0, ddType: 'trailing', scope: 'shared', sizeScale: 1, ...overrides
})
const trade = (timestamp, pnl, extra = {}) => ({ timestamp, pnl, ...extra })

afterEach(() => vi.useRealTimers())

describe('computePropFirm drawdown floor', () => {
  const trades = [trade('2026-11-02 09:30', 3000), trade('2026-11-03 09:30', -4500)]

  it('keeps a static floor at start minus max drawdown', () => {
    const r = computePropFirm(trades, account({ ddType: 'static', maxDailyLoss: 0 }))
    expect(r.bal).toBe(48500)
    expect(r.curFloor).toBe(48000)
    expect(r.ddBuffer).toBe(500)
    expect(r.status).toBe('active')
  })

  it('trails the floor up from the peak but never above the starting balance', () => {
    const r = computePropFirm(trades, account({ maxDailyLoss: 0 }))
    expect(r.peak).toBe(53000)
    expect(r.curFloor).toBe(50000)
    expect(r.floorBreached).toBe(true)
    expect(r.status).toBe('failed')
  })
})

describe('computePropFirm days', () => {
  it('fails on a day whose combined loss reaches the daily limit', () => {
    const r = computePropFirm([trade('2026-11-02 09:30', -600), trade('2026-11-02 11:00', -400)], account())
    expect(r.dailyBreached).toBe(true)
  })

  it('buckets days by date when entryTime is only a clock time', () => {
    // Desktop trades can store entryTime as "09:30". Two losses on different days
    // that opened at the same time are two days, not one day over the limit.
    const r = computePropFirm([
      trade('2026-11-02 09:30', -600, { entryTime: '09:30' }),
      trade('2026-11-03 09:30', -600, { entryTime: '09:30' })
    ], account())
    expect(r.daysTraded).toBe(2)
    expect(r.dailyBreached).toBe(false)
  })

  it('passes only once both the profit target and minimum days are met', () => {
    const cfg = account({ minDays: 2 })
    expect(computePropFirm([trade('2026-11-02 09:30', 3000)], cfg).status).toBe('active')
    expect(computePropFirm([trade('2026-11-02 09:30', 3000), trade('2026-11-03 09:30', 0)], cfg).status).toBe('passed')
  })

  it("reads today's loss on the trader's local date", () => {
    // Late evening in the Americas is already tomorrow in UTC. The daily allowance
    // must still count today's trades then. (Only distinguishes on a non-UTC clock.)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 10, 23, 30))
    const r = computePropFirm([trade('2026-11-10 23:00', -400)], account())
    expect(r.todayPnl).toBe(-400)
    expect(r.dailyRemaining).toBe(600)
  })
})

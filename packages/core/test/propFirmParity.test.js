import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computePropFirm } from '../src/propFirm.js'
import { computePropAccount } from '../../../mobile/src/stats.ts'

// The mobile app still has its own copy of the prop-firm rules. Until it imports
// @tradehelp/core, this pins the two to the same answers for the same account, so
// a trader never sees a pass on one device and a fail on the other.

const ACCOUNT = {
  id: 'eval-1', enabled: true, label: '50K eval', accountSize: 50000, target: 3000,
  maxDailyLoss: 1000, maxDrawdown: 2000, minDays: 2, ddType: 'trailing', scope: 'own', sizeScale: 1
}

// One trade, shaped the way each app stores it.
function both(when, pnl, accountId = 'eval-1') {
  return {
    desktop: { timestamp: when.replace('T', ' '), pnl, account: accountId },
    mobile: { tradeDate: when, pnl, account: accountId }
  }
}

function compare(rows, overrides = {}) {
  const cfg = { ...ACCOUNT, ...overrides }
  const d = computePropFirm(rows.map((r) => r.desktop), cfg)
  const m = computePropAccount(rows.map((r) => r.mobile), cfg)
  expect({
    balance: m.balance, netPnl: m.netPnl, currentFloor: m.currentFloor, drawdownBuffer: m.drawdownBuffer,
    dailyRemaining: m.dailyRemaining, daysTraded: m.daysTraded, status: m.status,
    floorBreached: m.floorBreached, dailyBreached: m.dailyBreached
  }).toEqual({
    balance: d.bal, netPnl: d.netProfit, currentFloor: d.curFloor, drawdownBuffer: d.ddBuffer,
    dailyRemaining: d.dailyRemaining, daysTraded: d.daysTraded, status: d.status,
    floorBreached: d.floorBreached, dailyBreached: d.dailyBreached
  })
  return d
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0))
})
afterEach(() => vi.useRealTimers())

describe('desktop and mobile prop-firm evaluation agree', () => {
  it('on an account still in progress, including today', () => {
    const d = compare([both('2026-11-03T09:30:00', 800), both('2026-11-04T10:15:00', -300)])
    expect(d.status).toBe('active')
    expect(d.todayPnl).toBe(-300)
  })

  it('on a pass once target and minimum days are met', () => {
    expect(compare([both('2026-11-02T09:30:00', 1800), both('2026-11-03T09:30:00', 1400)]).status).toBe('passed')
  })

  it('on a trailing drawdown breach', () => {
    expect(compare([both('2026-11-02T09:30:00', 2500), both('2026-11-03T09:30:00', -1500), both('2026-11-03T13:00:00', -1500)], { maxDailyLoss: 0 }).floorBreached).toBe(true)
  })

  it('on a static drawdown floor', () => {
    expect(compare([both('2026-11-02T09:30:00', 2500), both('2026-11-03T09:30:00', -1500), both('2026-11-03T13:00:00', -1500)], { ddType: 'static', maxDailyLoss: 0 }).status).toBe('active')
  })

  it('on a daily loss breach split across trades', () => {
    expect(compare([both('2026-11-03T09:30:00', -600), both('2026-11-03T11:00:00', -450)]).dailyBreached).toBe(true)
  })

  it('on account scoping and size scaling', () => {
    const rows = [both('2026-11-03T09:30:00', 400), both('2026-11-03T10:00:00', -2000, 'other')]
    expect(compare(rows, { sizeScale: 2 }).bal).toBe(50800)
    expect(compare(rows, { scope: 'shared' }).bal).toBe(48400)
  })
})

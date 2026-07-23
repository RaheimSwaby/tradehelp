import { describe, it, expect } from 'vitest'
import {
  instrumentRootSymbol, defaultInstrumentProfile, selectInstrumentProfile, instrumentMultiplier,
  calculatePlanSizing, calculatePointRisk, scoreTradePlanV1, scorePlanExecutionV1, parsePlaybookTarget,
  synthesizeTradeFills, averageCostFillPreview, reviewCommitmentSuggestion,
  summarizeTradeSession, tradeSessionDate, dHashFromRgba, hammingDistance64, dHashSimilarity,
  INSTRUMENT_PROFILE_DEFAULTS
} from '../workflow.js'

const ES = INSTRUMENT_PROFILE_DEFAULTS.ES        // tick 0.25, value 12.50 → $50/pt
const MNQ = INSTRUMENT_PROFILE_DEFAULTS.MNQ      // tick 0.25, value 0.50  → $2/pt
const STOCK = INSTRUMENT_PROFILE_DEFAULTS.STOCK  // tick 0.01, value 0.01  → $1/pt

describe('instrument root symbol', () => {
  it('resolves plain and contract-month symbols', () => {
    expect(instrumentRootSymbol('ES')).toBe('ES')
    expect(instrumentRootSymbol('ESZ4')).toBe('ES')
    expect(instrumentRootSymbol('/MNQH5')).toBe('MNQ')
    expect(instrumentRootSymbol('mesz4')).toBe('MES')
  })

  it('prefers the longer root so MES never resolves to ES', () => {
    expect(instrumentRootSymbol('MESZ4')).toBe('MES')
    expect(defaultInstrumentProfile('MESZ4').symbol).toBe('MES')
  })

  it('returns nothing for equities and junk', () => {
    expect(instrumentRootSymbol('AAPL')).toBe('')
    expect(instrumentRootSymbol('')).toBe('')
    expect(defaultInstrumentProfile('AAPL')).toBeNull()
  })
})

describe('selectInstrumentProfile', () => {
  const profiles = [ES, MNQ, STOCK]
  it('honours an explicit id over the symbol', () => {
    expect(selectInstrumentProfile(profiles, 'ES', MNQ.id)).toBe(MNQ)
  })
  it('falls back to an exact symbol, then the root', () => {
    expect(selectInstrumentProfile(profiles, 'ES')).toBe(ES)
    expect(selectInstrumentProfile(profiles, 'ESZ4')).toBe(ES)
    expect(selectInstrumentProfile(profiles, 'AAPL')).toBeNull()
  })
})

describe('instrumentMultiplier', () => {
  it('derives dollars per point from tick size and value', () => {
    expect(instrumentMultiplier(ES)).toBe(50)
    expect(instrumentMultiplier(MNQ)).toBe(2)
    expect(instrumentMultiplier(STOCK)).toBeCloseTo(1)
  })
  it('falls back to 1 when the profile is unusable', () => {
    expect(instrumentMultiplier(null)).toBe(1)
    expect(instrumentMultiplier({ tickSize: 0, tickValue: 5 })).toBe(1)
  })
})

describe('calculatePointRisk', () => {
  it('derives long stop, target, R:R and dollar risk from points', () => {
    expect(calculatePointRisk({
      entry: 6000, direction: 'Long', riskPoints: 9, rewardPoints: 18, size: 2
    }, ES)).toMatchObject({
      stop: 5991, target: 6018, riskPoints: 9, rewardPoints: 18,
      riskAmount: 900, rr: 2, calculated: true
    })
  })

  it('places short stop and target on the correct sides', () => {
    expect(calculatePointRisk({
      entry: 20000, direction: 'Short', riskPoints: 10, rewardPoints: 15, size: 1
    }, MNQ)).toMatchObject({ stop: 20010, target: 19985, riskAmount: 20, rr: 1.5 })
  })
})

// The money-critical path: a wrong quantity here oversizes a real trade.
describe('calculatePlanSizing', () => {
  it('sizes an ES long from risk budget and stop distance', () => {
    const r = calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, riskAmount: 500, direction: 'Long' }, ES)
    expect(r.valid).toBe(true)
    expect(r.stopDistance).toBe(5)
    expect(r.riskPerUnit).toBe(250) // 20 ticks × $12.50
    expect(r.quantity).toBe(2)
    expect(r.riskUsed).toBe(500)
  })

  it('sizes an MNQ long', () => {
    const r = calculatePlanSizing({ plannedEntry: 20000, plannedStop: 19990, riskAmount: 100, direction: 'Long' }, MNQ)
    expect(r.riskPerUnit).toBe(20) // 40 ticks × $0.50
    expect(r.quantity).toBe(5)
  })

  it('sizes a stock position', () => {
    const r = calculatePlanSizing({ plannedEntry: 100, plannedStop: 98, riskAmount: 100, direction: 'Long' }, STOCK)
    expect(r.riskPerUnit).toBeCloseTo(2)
    expect(r.quantity).toBe(50)
  })

  it('sizes a short off an above-entry stop', () => {
    const r = calculatePlanSizing({ plannedEntry: 5000, plannedStop: 5005, riskAmount: 500, direction: 'Short' }, ES)
    expect(r.valid).toBe(true)
    expect(r.quantity).toBe(2)
  })

  it('never rounds up past the risk budget', () => {
    // 1.6 contracts affordable → must floor to 1, not round to 2.
    const r = calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, riskAmount: 400, direction: 'Long' }, ES)
    expect(r.rawQuantity).toBeCloseTo(1.6)
    expect(r.quantity).toBe(1)
    expect(r.riskUsed).toBe(250)
    expect(r.riskUsed).toBeLessThanOrEqual(400)
  })

  it('rejects a stop on the wrong side of entry', () => {
    expect(calculatePlanSizing({ plannedEntry: 5000, plannedStop: 5005, riskAmount: 500, direction: 'Long' }, ES).valid).toBe(false)
    expect(calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, riskAmount: 500, direction: 'Short' }, ES).valid).toBe(false)
  })

  it('rejects a budget too small for one step, and a missing profile', () => {
    const small = calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, riskAmount: 100, direction: 'Long' }, ES)
    expect(small.valid).toBe(false)
    expect(small.quantity).toBe(0)
    expect(calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, riskAmount: 500 }, null).valid).toBe(false)
  })

  it('rejects incomplete input', () => {
    expect(calculatePlanSizing({ plannedEntry: 5000, riskAmount: 500, direction: 'Long' }, ES).valid).toBe(false)
    expect(calculatePlanSizing({ plannedEntry: 5000, plannedStop: 4995, direction: 'Long' }, ES).valid).toBe(false)
  })
})

describe('averageCostFillPreview', () => {
  const fill = (kind, side, quantity, price, fee = 0) => ({ kind, side, quantity, price, fee })

  it('averages scale-ins and applies the contract multiplier', () => {
    const r = averageCostFillPreview({}, [
      fill('entry', 'buy', 1, 5000),
      fill('entry', 'buy', 1, 5010),
      fill('exit', 'sell', 2, 5015)
    ], ES)
    expect(r.valid).toBe(true)
    expect(r.direction).toBe('Long')
    expect(r.entry).toBe(5005)   // average cost
    expect(r.exit).toBe(5015)
    expect(r.size).toBe(2)       // peak exposure
    expect(r.openQuantity).toBe(0)
    expect(r.grossPnl).toBe(1000) // 10 pts × 2 × $50
    expect(r.pnl).toBe(1000)
  })

  it('nets fees out of P&L', () => {
    const r = averageCostFillPreview({}, [
      fill('entry', 'buy', 1, 5000, 2),
      fill('exit', 'sell', 1, 5010, 2)
    ], ES)
    expect(r.grossPnl).toBe(500)
    expect(r.fees).toBe(4)
    expect(r.pnl).toBe(496)
  })

  it('handles a partial exit leaving open quantity', () => {
    const r = averageCostFillPreview({}, [
      fill('entry', 'buy', 2, 5000),
      fill('exit', 'sell', 1, 5010)
    ], ES)
    expect(r.openQuantity).toBe(1)
    expect(r.grossPnl).toBe(500)
    expect(r.size).toBe(2)
  })

  it('prices a short correctly', () => {
    const r = averageCostFillPreview({}, [
      fill('entry', 'sell', 1, 5010),
      fill('exit', 'buy', 1, 5000)
    ], ES)
    expect(r.direction).toBe('Short')
    expect(r.grossPnl).toBe(500) // fell 10 pts → short profits
  })

  it('rejects an exit that flips the position', () => {
    const r = averageCostFillPreview({}, [fill('entry', 'buy', 1, 5000), fill('exit', 'sell', 2, 5010)], ES)
    expect(r.valid).toBe(false)
  })

  it('rejects a wrong-sided fill, bad numbers, and an empty list', () => {
    expect(averageCostFillPreview({}, [fill('entry', 'buy', 1, 5000), fill('exit', 'buy', 1, 5010)], ES).valid).toBe(false)
    expect(averageCostFillPreview({}, [fill('entry', 'buy', 0, 5000)], ES).valid).toBe(false)
    expect(averageCostFillPreview({}, [fill('entry', 'buy', 1, 5000, -1)], ES).valid).toBe(false)
    expect(averageCostFillPreview({}, [], ES).valid).toBe(false)
    expect(averageCostFillPreview({}, [fill('exit', 'sell', 1, 5000)], ES).valid).toBe(false) // no entry
  })
})

describe('synthesizeTradeFills', () => {
  it('rebuilds entry/exit fills from a simple trade', () => {
    const fills = synthesizeTradeFills({ size: 2, entry: 100, exit: 110, fees: 3, direction: 'Long' })
    expect(fills).toHaveLength(2)
    expect(fills[0]).toMatchObject({ kind: 'entry', side: 'buy', quantity: 2, price: 100 })
    expect(fills[1]).toMatchObject({ kind: 'exit', side: 'sell', quantity: 2, price: 110, fee: 3 })
  })
  it('flips sides for a short and skips a missing exit', () => {
    const fills = synthesizeTradeFills({ size: 1, entry: 100, direction: 'Short' })
    expect(fills).toHaveLength(1)
    expect(fills[0]).toMatchObject({ kind: 'entry', side: 'sell' })
  })
})

describe('plan scoring', () => {
  const goodPlan = {
    plannedEntry: 5000, plannedStop: 4995, plannedTarget: 5015, direction: 'Long',
    setup: 'Pullback', riskAmount: 500, plannedQuantity: 2, sizingRiskPerUnit: 250,
    thesis: 'reclaim', invalidation: 'loses vwap', confidence: 70
  }
  it('awards a full score to a complete, well-formed plan', () => {
    const r = scoreTradePlanV1(goodPlan)
    expect(r.score).toBe(100)
    expect(r.detail.plan.rr).toBe(3)
  })
  it('penalises a missing stop geometry and thesis', () => {
    expect(scoreTradePlanV1({ ...goodPlan, plannedStop: 5005 }).score).toBeLessThan(100)
    expect(scoreTradePlanV1({ ...goodPlan, thesis: '' }).score).toBe(90)
  })
  it('scores an exact execution at 100 and a deviation lower', () => {
    const trade = { entry: 5000, stop: 4995, size: 2, direction: 'Long', setup: 'Pullback' }
    expect(scorePlanExecutionV1(goodPlan, trade).score).toBe(100)
    expect(scorePlanExecutionV1(goodPlan, { ...trade, direction: 'Short' }).score).toBeLessThan(100)
    expect(scorePlanExecutionV1(goodPlan, { ...trade, size: 6 }).score).toBeLessThan(100)
  })
})

describe('parsePlaybookTarget', () => {
  it('pulls a price but ignores R-multiples and percentages', () => {
    expect(parsePlaybookTarget('Target 5100')).toBe(5100)
    expect(parsePlaybookTarget('@5100.25')).toBe(5100.25)
    expect(parsePlaybookTarget('2R')).toBe('')
    expect(parsePlaybookTarget('50%')).toBe('')
    expect(parsePlaybookTarget('')).toBe('')
  })
})

describe('reviewCommitmentSuggestion', () => {
  const t = (o) => ({ entry: 100, stop: 98, direction: 'Long', timestamp: '2026-07-15 09:30', rr: 3, riskAmount: 100, ...o })
  it('defaults to requiring a stop with no history', () => {
    expect(reviewCommitmentSuggestion([]).ruleType).toBe('require_stop')
  })
  it('flags missing stops first', () => {
    expect(reviewCommitmentSuggestion([t({ stop: 0 }), t({ stop: 0 }), t({}), t({})]).ruleType).toBe('require_stop')
  })
  it('flags overtrading when a day runs hot', () => {
    const day = Array.from({ length: 5 }, () => t({}))
    expect(reviewCommitmentSuggestion(day).ruleType).toBe('max_trades_day')
  })
  it('always returns a rule the evaluator understands', () => {
    const known = new Set(['max_trades_day', 'max_risk', 'latest_entry', 'setup_only', 'min_rr', 'require_stop', 'max_daily_loss'])
    for (const sample of [[], [t({})], [t({ stop: 0 })], Array.from({ length: 5 }, () => t({}))]) {
      expect(known.has(reviewCommitmentSuggestion(sample).ruleType)).toBe(true)
    }
  })
})

describe('session summary', () => {
  const trades = [
    { id: '1', entryTime: '2026-07-15 09:30', exitTime: '2026-07-15 09:45', pnl: 200, rr: 2, setup: 'Pullback', emotion: 'calm' },
    { id: '2', entryTime: '2026-07-15 11:00', exitTime: '2026-07-15 11:10', pnl: -100, rr: 1, setup: 'Pullback', emotion: 'anxious' },
    { id: '3', entryTime: '2026-07-14 10:00', pnl: 999 }
  ]
  it('reads the session date from entry time', () => {
    expect(tradeSessionDate(trades[0])).toBe('2026-07-15')
    expect(tradeSessionDate({ timestamp: '2026-07-14 10:00' })).toBe('2026-07-14')
  })
  it('summarises only the requested day', () => {
    const s = summarizeTradeSession(trades, [], '2026-07-15')
    expect(s.tradeCount).toBe(2)
    expect(s.netPnl).toBe(100)
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(1)
    expect(s.winRate).toBe(50)
    expect(s.profitFactor).toBe(2)
    expect(s.dominantSetup).toBe('Pullback')
    expect(s.bestTrade.id).toBe('1')
    expect(s.worstTrade.id).toBe('2')
  })
  it('builds a cumulative equity curve starting at zero', () => {
    const s = summarizeTradeSession(trades, [], '2026-07-15')
    expect(s.equity.map((p) => p.equity)).toEqual([0, 200, 100])
  })
  it('returns an empty shape for a day with no trades', () => {
    const s = summarizeTradeSession(trades, [], '2026-01-01')
    expect(s.tradeCount).toBe(0)
    expect(s.netPnl).toBe(0)
    expect(s.winRate).toBeNull()
  })
})

describe('chart fingerprints', () => {
  // 9×8 RGBA. The 9th column exists so each row yields 8 left→right comparisons
  // without ever reading into the next row.
  function buffer(valueAt) {
    const data = new Uint8ClampedArray(9 * 8 * 4)
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const i = (y * 9 + x) * 4
        const v = valueAt(x, y)
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
      }
    }
    return data
  }

  it('hashes a left-to-right ramp to all zero bits', () => {
    expect(dHashFromRgba(buffer((x) => x * 20))).toBe('0000000000000000')
  })
  it('hashes a right-to-left ramp to all one bits', () => {
    expect(dHashFromRgba(buffer((x) => 200 - x * 20))).toBe('ffffffffffffffff')
  })
  it('rejects a wrong-sized buffer', () => {
    expect(() => dHashFromRgba(new Uint8ClampedArray(4))).toThrow()
    expect(() => dHashFromRgba(null)).toThrow()
  })

  it('measures hamming distance and similarity', () => {
    expect(hammingDistance64('0000000000000000', '0000000000000000')).toBe(0)
    expect(hammingDistance64('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hammingDistance64('0000000000000000', '0000000000000001')).toBe(1)
    expect(dHashSimilarity('0000000000000000', '0000000000000000')).toBe(100)
    expect(dHashSimilarity('0000000000000000', 'ffffffffffffffff')).toBe(0)
  })
  it('rejects malformed fingerprints', () => {
    expect(() => hammingDistance64('abc', '0000000000000000')).toThrow()
    expect(() => hammingDistance64('zzzzzzzzzzzzzzzz', '0000000000000000')).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { achievedR, isBreakEven, looksLikeBreakEven, plannedRR, riskAmountFor, tradeOutcome } from '../workflow.js'
import { computeStats, executionGrade } from '../stats.js'

describe('planned R:R', () => {
  it('reads the plan from points when the trader used points mode', () => {
    expect(plannedRR({ riskPoints: 10, rewardPoints: 30 })).toBe(3)
  })

  it('falls back to price geometry', () => {
    expect(plannedRR({ entry: 100, stop: 90, target: 130 })).toBe(3)
    // Short: the same shape mirrored.
    expect(plannedRR({ entry: 100, stop: 110, target: 70 })).toBe(3)
  })

  it('is unaffected by the outcome', () => {
    const plan = { riskPoints: 10, rewardPoints: 30 }
    expect(plannedRR({ ...plan, pnl: 900 })).toBe(3)
    expect(plannedRR({ ...plan, pnl: -300 })).toBe(3)
  })

  it('returns 0 rather than guessing when there is no plan', () => {
    expect(plannedRR({ entry: 100, pnl: 500 })).toBe(0)
    expect(plannedRR({})).toBe(0)
  })
})

describe('achieved R', () => {
  it('is signed, so a 2R win and a 2R loss cannot read alike', () => {
    expect(achievedR({ pnl: 1000, riskAmount: 500 })).toBe(2)
    expect(achievedR({ pnl: -1000, riskAmount: 500 })).toBe(-2)
  })

  it('reports a clean stop-out as -1R and a scratch as 0R', () => {
    expect(achievedR({ pnl: -500, riskAmount: 500 })).toBe(-1)
    expect(achievedR({ pnl: 0, riskAmount: 500 })).toBe(0)
  })

  it('does not care how many fills the position took', () => {
    // Scaling in changes the average entry but not dollars risked against
    // dollars made, which is why R is computed from P&L rather than prices.
    const scaledIn = { pnl: 750, riskAmount: 500, entry: 0, stop: 0 }
    expect(achievedR(scaledIn)).toBe(1.5)
  })

  it('is null, not zero, when risk is unknown', () => {
    // An unrecorded risk and a break-even trade are different facts.
    expect(achievedR({ pnl: 250 })).toBeNull()
    expect(achievedR({ pnl: 0, riskAmount: 500 })).toBe(0)
  })

  it('reconstructs risk from price distance and contract size when needed', () => {
    // MES: $5 per point. 10 points of stop on 2 contracts = $100 risked.
    expect(riskAmountFor({ symbol: 'MES', entry: 5000, stop: 4990, size: 2 })).toBeCloseTo(100, 6)
    expect(achievedR({ symbol: 'MES', entry: 5000, stop: 4990, size: 2, pnl: 200 })).toBeCloseTo(2, 6)
  })
})

describe('grading no longer rewards a losing trade for its plan', () => {
  const planned = { direction: 'Long', entry: 100, stop: 90, riskPoints: 10, rewardPoints: 30, emotion: 'Disciplined' }

  it('scores the setup, and the loss is penalised by the stop-honoured check instead', () => {
    const win = executionGrade({ ...planned, pnl: 900, riskAmount: 300 })
    const blownStop = executionGrade({ ...planned, pnl: -900, riskAmount: 300 })
    // Same plan, so the R:R component matches; the oversized loss must still
    // grade strictly worse overall than the win.
    expect(blownStop.score).toBeLessThan(win.score)
  })

  it('does not read a stored outcome as if it were the plan', () => {
    // The old column packed |P&L| / risk into rr, so this trade used to score
    // full marks for risk-reward on a three-R loss.
    const legacyLoss = { direction: 'Long', entry: 100, stop: 90, pnl: -1500, riskAmount: 500, emotion: 'Disciplined' }
    expect(plannedRR(legacyLoss)).toBe(0)
    expect(achievedR(legacyLoss)).toBe(-3)
  })
})

describe('break-even', () => {
  it('treats a small band around zero as a scratch, not a loss', () => {
    // Commissions push a flat exit slightly negative; that is still a scratch.
    expect(isBreakEven({ pnl: -20, riskAmount: 500 })).toBe(true)
    expect(isBreakEven({ pnl: 20, riskAmount: 500 })).toBe(true)
    expect(isBreakEven({ pnl: -200, riskAmount: 500 })).toBe(false)
  })

  it('lets the trader overrule the band in both directions', () => {
    // A clear loss the trader insists was a scratch.
    expect(isBreakEven({ pnl: -500, riskAmount: 500, breakEven: 'yes' })).toBe(true)
    // A trade inside the band the trader says was a real result.
    expect(isBreakEven({ pnl: -20, riskAmount: 500, breakEven: 'no' })).toBe(false)
  })

  it('needs an exact zero when no risk was recorded', () => {
    // Without risk there is no band, and guessing from dollars would answer
    // differently for the same trade on a bigger account.
    expect(isBreakEven({ pnl: 0 })).toBe(true)
    expect(isBreakEven({ pnl: -20 })).toBe(false)
  })

  it('classifies into exactly one of three outcomes', () => {
    expect(tradeOutcome({ pnl: 1000, riskAmount: 500 })).toBe('win')
    expect(tradeOutcome({ pnl: -1000, riskAmount: 500 })).toBe('loss')
    expect(tradeOutcome({ pnl: -10, riskAmount: 500 })).toBe('breakeven')
  })

  it('suggests from notes without ever classifying on them', () => {
    expect(looksLikeBreakEven('moved to break even and got tapped')).toBe(true)
    expect(looksLikeBreakEven('scratched it')).toBe(true)
    expect(looksLikeBreakEven('held the runner')).toBe(false)
    // The phrase alone must not change the answer for a saved trade.
    expect(isBreakEven({ pnl: -1000, riskAmount: 500, notes: 'broke even on the day' })).toBe(false)
  })
})

describe('win rate excludes break-even', () => {
  it('drops scratches from the denominator instead of counting them as losses', () => {
    const trades = [
      { pnl: 1000, riskAmount: 500 },  // win
      { pnl: -1000, riskAmount: 500 }, // loss
      { pnl: -10, riskAmount: 500 }    // scratch
    ]
    const s = computeStats(trades)
    expect(s.winCount).toBe(1)
    expect(s.lossCount).toBe(1)
    expect(s.breakEvenCount).toBe(1)
    // 1 of 2 decided, not 1 of 3.
    expect(s.winRate).toBe(50)
  })
})

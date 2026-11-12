import { plannedRR } from './workflow.js'

export function letterFor(score) {
  if (score >= 95) return { letter: 'A+', tone: 'up' }
  if (score >= 85) return { letter: 'A', tone: 'up' }
  if (score >= 70) return { letter: 'B', tone: 'up' }
  if (score >= 55) return { letter: 'C', tone: 'accent' }
  if (score >= 40) return { letter: 'D', tone: 'down' }
  return { letter: 'F', tone: 'down' }
}

// Per-trade execution grade — deliberately blind to whether the trade won or lost.
//
// This used to hand every imported trade a flat A for a win and C for a loss, which
// made the grade a restatement of P&L and meant an imported journal only ever showed
// two letters. It also scored missing data generously (no R:R counted 14 of 25, no
// emotion 12), so a trade we knew nothing about still earned a D rather than saying
// so.
//
// Now each signal is scored only when present, and the total is normalised across
// the signals that exist. A trade with two signals is graded honestly on those two.
// Below two, there is nothing to judge and it returns ungraded rather than inventing
// a letter. Callers must handle score === null.
export function executionGrade(t) {
  const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0
  const pnl = Number(t.pnl) || 0, risk = Number(t.riskAmount) || 0, rr = plannedRR(t)

  const parts = []

  if (stop > 0 && entry > 0) {
    parts.push((t.direction === 'Long' ? stop < entry : stop > entry) ? 25 : 10)
  }
  if (rr > 0) {
    parts.push(rr >= 2 ? 25 : rr >= 1.5 ? 20 : rr >= 1 ? 15 : 8)
  }
  if (t.emotion) {
    parts.push(['Disciplined', 'Confident', 'Neutral'].includes(t.emotion) ? 25
      : ['FOMO', 'Greedy', 'Revenge'].includes(t.emotion) ? 0 : 12)
  }
  // Only meaningful on a loss with a planned risk: did the stop actually hold?
  if (pnl < 0 && risk > 0) {
    const mult = Math.abs(pnl) / risk
    parts.push(mult <= 1.1 ? 25 : mult <= 1.5 ? 12 : 0)
  }

  if (parts.length < 2) return { score: null, letter: '—', tone: 'none', ungraded: true }

  const score = Math.round((parts.reduce((a, b) => a + b, 0) / (parts.length * 25)) * 100)
  return { score, signals: parts.length, ...letterFor(score) }
}

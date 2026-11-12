import { localDateKey, tradeDateKey } from './tradeDate.js'
import { tradeOutcome } from './workflow.js'

/* ───────── prop firm challenge tracker ───────── */
// Tracks closed-trade (end-of-day style) balance vs. a prop firm's challenge rules.
export function computePropFirm(trades, cfg) {
  const start = Number(cfg.accountSize) || 0
  const target = Number(cfg.target) || 0
  const maxDaily = Number(cfg.maxDailyLoss) || 0
  const maxDD = Number(cfg.maxDrawdown) || 0
  const minDays = Number(cfg.minDays) || 0
  const trailing = cfg.ddType !== 'static'
  const scale = Number(cfg.sizeScale) || 1
  const rel = cfg.scope === 'own' ? trades.filter((t) => t.account === cfg.id) : trades
  const sorted = [...rel].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  const floorAt = (peak) => (trailing ? Math.min(peak - maxDD, start) : start - maxDD)

  let bal = start, peak = start, floorBreached = false
  const curve = [{ i: 0, balance: start, floor: floorAt(start) }]
  const dayPnl = {}
  for (const t of sorted) {
    const pnl = (Number(t.pnl) || 0) * scale
    bal += pnl
    peak = Math.max(peak, bal)
    const floor = floorAt(peak)
    if (maxDD > 0 && bal <= floor) floorBreached = true
    curve.push({ i: curve.length, balance: bal, floor })
    const d = tradeDateKey(t)
    if (d) dayPnl[d] = (dayPnl[d] || 0) + pnl
  }
  let dailyBreached = false
  for (const v of Object.values(dayPnl)) if (maxDaily > 0 && v <= -maxDaily) dailyBreached = true

  const netProfit = bal - start
  const curFloor = floorAt(peak)
  const ddBuffer = bal - curFloor
  const todayPnl = dayPnl[localDateKey(new Date())] || 0
  const dailyRemaining = Math.max(0, maxDaily - Math.max(0, -todayPnl))
  const daysTraded = Object.keys(dayPnl).length
  const targetHit = target > 0 && netProfit >= target
  const daysHit = daysTraded >= minDays
  const breached = floorBreached || dailyBreached
  const status = breached ? 'failed' : (targetHit && daysHit ? 'passed' : 'active')
  // Trading performance over the same trades the evaluation is scored on. The size
  // scale is positive, so it never changes whether a trade counts as a win.
  const n = sorted.length
  const propOutcomes = sorted.map((t) => tradeOutcome(t))
  const wins = propOutcomes.filter((o) => o === 'win').length
  const decidedProp = wins + propOutcomes.filter((o) => o === 'loss').length
  const winRate = decidedProp ? (wins / decidedProp) * 100 : 0
  return { start, bal, netProfit, peak, curFloor, ddBuffer, maxDD, target, maxDaily, todayPnl, dailyRemaining, daysTraded, minDays, targetHit, daysHit, breached, floorBreached, dailyBreached, status, curve, n, wins, winRate }
}

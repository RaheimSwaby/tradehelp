import type { MobileTrade } from './storage/repository'

export type MobileStats = {
  tradeCount: number
  netPnl: number
  winRate: number | null
  averageTrade: number
  profitFactor: number | null
  ruleRate: number | null
  bestWin: number
  worstLoss: number
  avgWin: number
  avgLoss: number
  payoffRatio: number | null
  expectancy: number
  streak: string
  topSetup: string
}

export function computeMobileStats(trades: MobileTrade[]): MobileStats {
  const sorted = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  const pnl = sorted.map((trade) => Number(trade.pnl) || 0)
  const wins = pnl.filter((value) => value > 0)
  const losses = pnl.filter((value) => value < 0)
  const decided = wins.length + losses.length
  const grossProfit = wins.reduce((sum, value) => sum + value, 0)
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0))
  const checks = trades.flatMap((trade) => trade.ruleChecks || [])

  const bestWin = wins.length ? Math.max(...wins) : 0
  const worstLoss = losses.length ? Math.min(...losses) : 0
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : null
  const winRateVal = decided ? wins.length / decided : 0
  const lossRateVal = decided ? losses.length / decided : 0
  const expectancy = decided ? winRateVal * avgWin - lossRateVal * avgLoss : 0

  // Calculate current streak
  let streakCount = 0
  let streakType: 'win' | 'loss' | null = null
  for (let i = pnl.length - 1; i >= 0; i--) {
    const val = pnl[i] ?? 0
    if (val === 0) continue
    const type = val > 0 ? 'win' : 'loss'
    if (streakType === null) {
      streakType = type
      streakCount = 1
    } else if (streakType === type) {
      streakCount++
    } else {
      break
    }
  }

  const streakText = streakType === 'win'
    ? `🔥 ${streakCount} Win${streakCount > 1 ? 's' : ''}`
    : streakType === 'loss'
      ? `${streakCount} Loss${streakCount > 1 ? 'es' : ''}`
      : '--'

  // Calculate top setup
  const setupStats = new Map<string, { wins: number; total: number; pnl: number }>()
  for (const trade of sorted) {
    const setupName = trade.setup.trim() || 'General'
    const curr = setupStats.get(setupName) || { wins: 0, total: 0, pnl: 0 }
    curr.total++
    curr.pnl += trade.pnl
    if (trade.pnl > 0) curr.wins++
    setupStats.set(setupName, curr)
  }

  let topSetupName = '--'
  let topSetupPnl = -Infinity
  let topSetupWr = 0

  for (const [name, data] of setupStats.entries()) {
    if (data.total >= 1 && data.pnl > topSetupPnl) {
      topSetupPnl = data.pnl
      topSetupName = name
      topSetupWr = Math.round((data.wins / data.total) * 100)
    }
  }

  const topSetupText = topSetupName !== '--' ? `${topSetupName} (${topSetupWr}%)` : '--'

  return {
    tradeCount: trades.length,
    netPnl: pnl.reduce((sum, value) => sum + value, 0),
    winRate: decided ? wins.length / decided : null,
    averageTrade: trades.length ? pnl.reduce((sum, value) => sum + value, 0) / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    ruleRate: checks.length ? checks.filter((check) => check.followed).length / checks.length : null,
    bestWin,
    worstLoss,
    avgWin,
    avgLoss,
    payoffRatio,
    expectancy,
    streak: streakText,
    topSetup: topSetupText
  }
}

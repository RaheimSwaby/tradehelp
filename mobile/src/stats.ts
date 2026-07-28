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

export function computeTradeGrade(trade: MobileTrade): { grade: 'A+' | 'A' | 'B' | 'C' | 'F'; score: number; color: string } {
  const checks = trade.ruleChecks || []
  if (!checks.length) return { grade: 'A', score: 90, color: '#10B981' }
  const followed = checks.filter((c) => c.followed).length
  const pct = (followed / checks.length) * 100
  let grade: 'A+' | 'A' | 'B' | 'C' | 'F' = 'F'
  let color = '#EF4444'
  if (pct >= 100) { grade = 'A+'; color = '#10B981' }
  else if (pct >= 85) { grade = 'A'; color = '#34D399' }
  else if (pct >= 70) { grade = 'B'; color = '#F59E0B' }
  else if (pct >= 50) { grade = 'C'; color = '#F97316' }
  else { grade = 'F'; color = '#EF4444' }
  return { grade, score: Math.round(pct), color }
}

export type SetupEdge = {
  name: string
  count: number
  winRate: number
  netPnl: number
  expectancy: number
  isTopEdge: boolean
  isLeak: boolean
}

export function computeEdgeStats(trades: MobileTrade[]): SetupEdge[] {
  const map = new Map<string, { wins: number; losses: number; count: number; pnl: number; winsPnl: number; lossesPnl: number }>()
  for (const trade of trades) {
    const name = trade.setup.trim() || 'General'
    const curr = map.get(name) || { wins: 0, losses: 0, count: 0, pnl: 0, winsPnl: 0, lossesPnl: 0 }
    curr.count++
    curr.pnl += trade.pnl
    if (trade.pnl > 0) {
      curr.wins++
      curr.winsPnl += trade.pnl
    } else if (trade.pnl < 0) {
      curr.losses++
      curr.lossesPnl += Math.abs(trade.pnl)
    }
    map.set(name, curr)
  }

  const list: SetupEdge[] = []
  for (const [name, d] of map.entries()) {
    const wr = d.count ? (d.wins / d.count) * 100 : 0
    const avgW = d.wins ? d.winsPnl / d.wins : 0
    const avgL = d.losses ? d.lossesPnl / d.losses : 0
    const exp = d.count ? (wr / 100) * avgW - ((100 - wr) / 100) * avgL : 0
    list.push({
      name,
      count: d.count,
      winRate: Math.round(wr),
      netPnl: d.pnl,
      expectancy: exp,
      isTopEdge: false,
      isLeak: false
    })
  }

  list.sort((a, b) => b.expectancy - a.expectancy)
  if (list[0] && list[0].netPnl > 0) list[0].isTopEdge = true
  const last = list[list.length - 1]
  if (list.length > 1 && last && last.netPnl < 0) last.isLeak = true
  return list
}

import { computeStats } from './stats.js'
import { tradePeriodKey } from './periodRetrospective.js'

export function buildPeriodStatistics(trades = [], granularity = 'month') {
  if (!['month', 'quarter'].includes(granularity)) return { granularity, rows: [], summary: null }
  const groups = new Map()
  for (const trade of Array.isArray(trades) ? trades : []) {
    const key = tradePeriodKey(trade, granularity)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(trade)
  }
  const rows = [...groups.entries()].map(([periodKey, periodTrades]) => {
    const stats = computeStats(periodTrades)
    return {
      periodKey,
      tradeCount: stats.n,
      winRate: stats.winRate,
      totalPnl: stats.totalPnl,
      profitFactor: stats.profitFactor,
      averageTrade: stats.n ? stats.totalPnl / stats.n : 0,
      activeDays: stats.activeDays,
      profitable: stats.totalPnl > 0
    }
  }).sort((a, b) => b.periodKey.localeCompare(a.periodKey))

  if (!rows.length) return { granularity, rows, summary: null }
  const profitable = rows.filter((row) => row.totalPnl > 0)
  const flat = rows.filter((row) => row.totalPnl === 0)
  const totalPnl = rows.reduce((sum, row) => sum + row.totalPnl, 0)
  return {
    granularity,
    rows,
    summary: {
      periodCount: rows.length,
      profitableCount: profitable.length,
      flatCount: flat.length,
      profitabilityRate: (profitable.length / rows.length) * 100,
      totalPnl,
      averagePnl: totalPnl / rows.length,
      best: rows.reduce((best, row) => row.totalPnl > best.totalPnl ? row : best, rows[0]),
      worst: rows.reduce((worst, row) => row.totalPnl < worst.totalPnl ? row : worst, rows[0])
    }
  }
}

import type { MobileTrade, PropAccount } from './storage/repository'

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
  maxDrawdown: number
}

export type PropAccountStats = {
  balance: number
  netPnl: number
  target: number
  amountToTarget: number
  drawdownBuffer: number
  currentFloor: number
  dailyRemaining: number
  daysTraded: number
  status: 'active' | 'passed' | 'failed'
  floorBreached: boolean
  dailyBreached: boolean
}

export type HoldStats = {
  sampleSize: number
  averageMinutes: number | null
  winnerMinutes: number | null
  loserMinutes: number | null
  bestWindow: {
    label: string
    count: number
    netPnl: number
  } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function tradeMoment(value: string, tradeDate: string) {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/.test(raw)) {
    const parsed = new Date(raw.replace(' ', 'T')).getTime()
    return Number.isFinite(parsed) ? { value: parsed, clockOnly: false } : null
  }

  const clock = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?$/i)
  const date = String(tradeDate || '').slice(0, 10)
  if (!clock || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  let hour = Number(clock[1])
  const period = String(clock[4] || '').toUpperCase()
  if (period === 'AM' && hour === 12) hour = 0
  if (period === 'PM' && hour < 12) hour += 12
  const parsed = new Date(
    `${date}T${String(hour).padStart(2, '0')}:${clock[2]}:${clock[3] || '00'}`
  ).getTime()
  return Number.isFinite(parsed) ? { value: parsed, clockOnly: true } : null
}

export function tradeHoldMinutes(trade: MobileTrade) {
  const entry = tradeMoment(trade.entryTime, trade.tradeDate)
  const exit = tradeMoment(trade.exitTime, trade.tradeDate)
  if (!entry || !exit) return null

  let duration = exit.value - entry.value
  if (duration < 0 && entry.clockOnly && exit.clockOnly) duration += DAY_MS
  if (duration < 0 || duration > DAY_MS * 7) return null
  return duration / 60_000
}

export function formatHoldDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return '--'
  if (minutes < 1) return '<1m'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded}m`
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

export function computeHoldStats(trades: MobileTrade[]): HoldStats {
  const measured = trades.flatMap((trade) => {
    const minutes = tradeHoldMinutes(trade)
    return minutes === null ? [] : [{ trade, minutes }]
  })
  const average = (rows: typeof measured) =>
    rows.length ? rows.reduce((sum, row) => sum + row.minutes, 0) / rows.length : null

  const buckets = [
    { label: '<5m', test: (minutes: number) => minutes < 5 },
    { label: '5-15m', test: (minutes: number) => minutes >= 5 && minutes <= 15 },
    { label: '16-30m', test: (minutes: number) => minutes > 15 && minutes <= 30 },
    { label: '31-60m', test: (minutes: number) => minutes > 30 && minutes <= 60 },
    { label: '60m+', test: (minutes: number) => minutes > 60 }
  ].map((bucket) => {
    const rows = measured.filter((row) => bucket.test(row.minutes))
    return {
      label: bucket.label,
      count: rows.length,
      netPnl: rows.reduce((sum, row) => sum + row.trade.pnl, 0)
    }
  }).filter((bucket) => bucket.count > 0)

  const bestWindow = buckets.sort((a, b) => b.netPnl - a.netPnl)[0] || null

  return {
    sampleSize: measured.length,
    averageMinutes: average(measured),
    winnerMinutes: average(measured.filter((row) => row.trade.pnl > 0)),
    loserMinutes: average(measured.filter((row) => row.trade.pnl < 0)),
    bestWindow
  }
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
  let running = 0
  let peak = 0
  let maxDrawdown = 0
  for (const value of pnl) {
    running += value
    peak = Math.max(peak, running)
    maxDrawdown = Math.max(maxDrawdown, peak - running)
  }

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
    ? `${streakCount} Win${streakCount > 1 ? 's' : ''}`
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
    topSetup: topSetupText,
    maxDrawdown
  }
}

export function computePropAccount(trades: MobileTrade[], account: PropAccount): PropAccountStats {
  const start = Number(account.accountSize) || 0
  const target = Number(account.target) || 0
  const maxDaily = Number(account.maxDailyLoss) || 0
  const maxDrawdown = Number(account.maxDrawdown) || 0
  const scale = Number(account.sizeScale) || 1
  const relevant = account.scope === 'shared'
    ? trades
    : trades.filter((trade) => trade.account === account.id)
  const sorted = [...relevant].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  const floorAt = (peak: number) =>
    account.ddType === 'static' ? start - maxDrawdown : Math.min(peak - maxDrawdown, start)

  let balance = start
  let peak = start
  let floorBreached = false
  const dayPnl = new Map<string, number>()
  for (const trade of sorted) {
    const pnl = (Number(trade.pnl) || 0) * scale
    balance += pnl
    peak = Math.max(peak, balance)
    if (maxDrawdown > 0 && balance <= floorAt(peak)) floorBreached = true
    const date = String(trade.tradeDate || '').slice(0, 10)
    if (date) dayPnl.set(date, (dayPnl.get(date) || 0) + pnl)
  }

  const dailyBreached = [...dayPnl.values()].some((pnl) => maxDaily > 0 && pnl <= -maxDaily)
  const todayPnl = dayPnl.get(new Date().toISOString().slice(0, 10)) || 0
  const netPnl = balance - start
  const daysTraded = dayPnl.size
  const passed = target > 0 && netPnl >= target && daysTraded >= account.minDays
  const failed = floorBreached || dailyBreached
  return {
    balance,
    netPnl,
    target,
    amountToTarget: Math.max(0, target - netPnl),
    drawdownBuffer: balance - floorAt(peak),
    currentFloor: floorAt(peak),
    dailyRemaining: Math.max(0, maxDaily - Math.max(0, -todayPnl)),
    daysTraded,
    status: failed ? 'failed' : passed ? 'passed' : 'active',
    floorBreached,
    dailyBreached
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

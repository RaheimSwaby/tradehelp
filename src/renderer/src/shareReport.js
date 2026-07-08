import { computeAchievements, computeRating, computeSelfGrade, computeStats, executionGrade, letterFor } from './stats.js'

export const DEFAULT_SHARE_OPTIONS = {
  rating: true,
  execution: true,
  selfGrades: true,
  achievements: true,
  netPnl: true,
  winRate: true,
  profitFactor: true,
  expectancy: false,
  drawdown: true,
  tradeCount: true,
  equity: true,
  recentGrades: true,
  symbols: true,
  hideMoney: false
}

const dateOf = (t) => String(t.entryTime || t.timestamp || '').slice(0, 10)

export function tradesForShareRange(trades = [], range = '30') {
  if (range === 'all') return trades
  const days = Number(range) || 30
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - days + 1)
  return trades.filter((t) => {
    const d = new Date(`${dateOf(t)}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d >= cutoff
  })
}

function money(n) {
  const v = Number(n) || 0
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function rangeLabel(trades, range) {
  if (!trades.length) return range === 'all' ? 'All time' : `Last ${range} days`
  const dates = trades.map(dateOf).filter(Boolean).sort()
  const fmt = (s) => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(dates[0])} - ${fmt(dates[dates.length - 1])}`
}

export function buildShareReport(trades = [], range = '30', accountLabel = 'All accounts', payouts = []) {
  const selected = tradesForShareRange(trades, range)
  const stats = computeStats(selected)
  const rating = computeRating(selected, stats)
  const self = computeSelfGrade(selected)
  // Accolades are lifetime milestones, so compute them across ALL trades — not the
  // selected date range — otherwise a "Last 7 days" report would hide earned badges.
  const allStats = computeStats(trades)
  const achievements = computeAchievements(trades, allStats, payouts).filter((a) => a.unlocked).map((a) => a.name)
  const avgExecution = selected.length
    ? Math.round(selected.reduce((sum, t) => sum + executionGrade(t).score, 0) / selected.length)
    : 0
  return {
    trades: selected,
    stats,
    rating,
    self,
    avgExecution,
    achievements,
    executionLetter: selected.length ? letterFor(avgExecution).letter : '-',
    accountLabel,
    periodLabel: rangeLabel(selected, range),
    recent: [...selected].slice(-5).reverse().map((t) => ({
      symbol: t.symbol || 'Trade',
      direction: t.direction || '',
      pnl: Number(t.pnl) || 0,
      date: dateOf(t),
      grade: executionGrade(t).letter
    }))
  }
}

function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke() }
}

function fitText(ctx, text, maxWidth) {
  const value = String(text)
  if (ctx.measureText(value).width <= maxWidth) return value
  let out = value
  while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1)
  return `${out}...`
}

function gradeColor(letter) {
  if (letter === 'A+' || letter === 'A') return '#34D399'
  if (letter === 'B' || letter === 'C') return '#F5B642'
  return '#FB7185'
}

export function drawShareReport(canvas, report, options = DEFAULT_SHARE_OPTIONS, accent = '#F5B642') {
  const ctx = canvas.getContext('2d')
  canvas.width = 1080
  canvas.height = 1350
  const W = canvas.width
  const pad = 64
  ctx.fillStyle = '#0E1117'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, 12)

  ctx.fillStyle = '#E6EAF2'
  ctx.font = '700 38px Arial, sans-serif'
  ctx.fillText('TradeHelp', pad, 82)
  ctx.fillStyle = accent
  ctx.font = '700 18px Arial, sans-serif'
  ctx.fillText('PERFORMANCE REPORT', pad, 116)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#8A94A6'
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText(report.accountLabel, W - pad, 80)
  ctx.fillText(report.periodLabel, W - pad, 112)
  ctx.textAlign = 'left'

  let y = 158
  const gradeItems = []
  if (options.rating) gradeItems.push(['TRADER RATING', report.stats.n ? String(report.rating.ovr) : '-', report.rating.provisional ? 'provisional' : report.rating.archetype, report.rating.ovr >= 84 ? '#34D399' : report.rating.ovr >= 68 ? accent : '#FB7185'])
  if (options.execution) gradeItems.push(['AVG EXECUTION', report.executionLetter, report.stats.n ? `${report.avgExecution}/100 process` : 'no trades', gradeColor(report.executionLetter)])
  if (options.selfGrades) {
    gradeItems.push(['SELF-GRADED SETUP', report.self.setupLetter, `${report.self.count} graded`, gradeColor(report.self.setupLetter)])
    gradeItems.push(['SELF-GRADED EXECUTION', report.self.execLetter, `${report.self.count} graded`, gradeColor(report.self.execLetter)])
  }
  if (gradeItems.length) {
    const gap = 14
    const w = (W - pad * 2 - gap * (gradeItems.length - 1)) / gradeItems.length
    gradeItems.forEach(([label, value, sub, color], i) => {
      const x = pad + i * (w + gap)
      rounded(ctx, x, y, w, 174, 12, '#151B26', '#2A3344')
      ctx.fillStyle = '#8A94A6'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText(label, x + 22, y + 34)
      ctx.fillStyle = color; ctx.font = '800 58px Arial, sans-serif'; ctx.fillText(value, x + 22, y + 103)
      ctx.fillStyle = '#5A6478'; ctx.font = '16px Arial, sans-serif'; ctx.fillText(fitText(ctx, sub, w - 44), x + 22, y + 142)
    })
    y += 202
  }

  // Accolades: unlocked achievement badges as a wrapped pill strip (max 2 rows).
  if (options.achievements && report.achievements.length) {
    ctx.fillStyle = '#8A94A6'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText('ACCOLADES', pad, y + 4)
    y += 22
    const pillH = 40, gap = 10, padX = 18
    let px = pad, py = y, rows = 1
    ctx.font = '700 18px Arial, sans-serif'
    for (const name of report.achievements) {
      const label = `★ ${name}`
      const pw = Math.min(ctx.measureText(label).width + padX * 2, W - pad * 2)
      if (px + pw > W - pad && px > pad) {
        if (rows >= 2) break // cap at two rows so it never crowds the stats below
        px = pad; py += pillH + gap; rows++
      }
      rounded(ctx, px, py, pw, pillH, 10, '#1C2433', accent)
      ctx.fillStyle = accent; ctx.font = '700 18px Arial, sans-serif'
      ctx.fillText(fitText(ctx, label, pw - padX * 2), px + padX, py + 26)
      px += pw + gap
    }
    y = py + pillH + 22
  }

  const stats = []
  if (options.netPnl && !options.hideMoney) stats.push(['NET P&L', money(report.stats.totalPnl), report.stats.totalPnl >= 0 ? '#34D399' : '#FB7185'])
  if (options.winRate) stats.push(['WIN RATE', `${report.stats.winRate.toFixed(1)}%`, '#E6EAF2'])
  if (options.profitFactor) stats.push(['PROFIT FACTOR', report.stats.profitFactor === Infinity ? 'INF' : report.stats.profitFactor.toFixed(2), accent])
  if (options.expectancy && !options.hideMoney) stats.push(['EXPECTANCY', money(report.stats.expectancy), report.stats.expectancy >= 0 ? '#34D399' : '#FB7185'])
  if (options.drawdown && !options.hideMoney) stats.push(['MAX DRAWDOWN', money(-report.stats.maxDD), '#FB7185'])
  if (options.tradeCount) stats.push(['TRADES', String(report.stats.n), '#E6EAF2'])
  if (stats.length) {
    const cols = Math.min(3, stats.length)
    const gap = 14
    const w = (W - pad * 2 - gap * (cols - 1)) / cols
    stats.forEach(([label, value, color], i) => {
      const row = Math.floor(i / cols), col = i % cols
      const x = pad + col * (w + gap), sy = y + row * 126
      rounded(ctx, x, sy, w, 108, 10, '#151B26', '#2A3344')
      ctx.fillStyle = '#8A94A6'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText(label, x + 20, sy + 32)
      ctx.fillStyle = color; ctx.font = '700 32px ui-monospace, Consolas, monospace'; ctx.fillText(fitText(ctx, value, w - 40), x + 20, sy + 76)
    })
    y += Math.ceil(stats.length / cols) * 126 + 14
  }

  if (options.equity && report.stats.equity.length > 1) {
    rounded(ctx, pad, y, W - pad * 2, 230, 12, '#151B26', '#2A3344')
    ctx.fillStyle = '#8A94A6'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText('EQUITY CURVE', pad + 22, y + 34)
    const plot = { x: pad + 22, y: y + 58, w: W - pad * 2 - 44, h: 138 }
    const vals = report.stats.equity.map((p) => p.equity)
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = Math.max(1, hi - lo)
    ctx.beginPath()
    report.stats.equity.forEach((p, i) => {
      const x = plot.x + (i / (report.stats.equity.length - 1)) * plot.w
      const py = plot.y + plot.h - ((p.equity - lo) / span) * plot.h
      if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py)
    })
    ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke()
    y += 252
  }

  if (options.recentGrades && report.recent.length && y < 1170) {
    const rowH = 48
    const available = Math.max(1, Math.min(report.recent.length, Math.floor((1248 - y - 44) / rowH)))
    rounded(ctx, pad, y, W - pad * 2, 44 + available * rowH, 12, '#151B26', '#2A3344')
    ctx.fillStyle = '#8A94A6'; ctx.font = '700 15px Arial, sans-serif'; ctx.fillText('RECENT TRADE EXECUTION', pad + 22, y + 30)
    report.recent.slice(0, available).forEach((t, i) => {
      const ry = y + 44 + i * rowH
      if (i) { ctx.strokeStyle = '#2A3344'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad + 22, ry); ctx.lineTo(W - pad - 22, ry); ctx.stroke() }
      ctx.fillStyle = '#E6EAF2'; ctx.font = '18px Arial, sans-serif'; ctx.fillText(options.symbols ? t.symbol : `Trade ${report.recent.length - i}`, pad + 22, ry + 31)
      ctx.fillStyle = '#5A6478'; ctx.font = '15px Arial, sans-serif'; ctx.fillText(t.date, pad + 250, ry + 30)
      if (!options.hideMoney) { ctx.fillStyle = t.pnl >= 0 ? '#34D399' : '#FB7185'; ctx.textAlign = 'right'; ctx.fillText(money(t.pnl), W - pad - 92, ry + 30) }
      ctx.fillStyle = gradeColor(t.grade); ctx.font = '800 20px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(t.grade, W - pad - 22, ry + 31); ctx.textAlign = 'left'
    })
  }

  ctx.fillStyle = '#5A6478'; ctx.font = '15px Arial, sans-serif'
  ctx.fillText('Process over outcome. Not financial advice.', pad, 1310)
  ctx.textAlign = 'right'; ctx.fillStyle = accent; ctx.font = '700 16px Arial, sans-serif'; ctx.fillText('Made with TradeHelp', W - pad, 1310); ctx.textAlign = 'left'
}

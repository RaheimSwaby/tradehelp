import { Trophy, Brain, Snowflake, Shield, Target, BookOpen, Camera, TrendingUp, Calendar, Flame, Wallet, Banknote, CalendarCheck, Coffee, Sunrise, Crosshair, Handshake, Repeat, ShieldCheck } from 'lucide-react'
import { TILT, REASONS, clamp, fmtN, holdMs, periodKey, pad2 } from './utils.js'

/* ───────── stats ───────── */
export function computeStats(trades) {
  const sorted = [...trades].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  const n = sorted.length
  const pnls = sorted.map((t) => Number(t.pnl) || 0)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const totalPnl = pnls.reduce((a, b) => a + b, 0)
  const totalFees = sorted.reduce((a, t) => a + (Number(t.fees) || 0), 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  const winRate = n ? (wins.length / n) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0)
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const expectancy = n ? totalPnl / n : 0
  const rrs = sorted.map((t) => Number(t.rr)).filter((r) => r > 0)
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0

  let eq = 0, peak = 0, maxDD = 0
  const equity = sorted.map((t, i) => {
    eq += Number(t.pnl) || 0
    peak = Math.max(peak, eq)
    maxDD = Math.max(maxDD, peak - eq)
    return { i: i + 1, equity: eq }
  })

  let cur = 0, curSign = 0, bestWin = 0, worstLoss = 0
  for (const p of pnls) {
    const s = p > 0 ? 1 : p < 0 ? -1 : 0
    if (s === 0) continue
    if (s === curSign) cur += 1
    else { curSign = s; cur = 1 }
    if (curSign === 1) bestWin = Math.max(bestWin, cur)
    else worstLoss = Math.max(worstLoss, cur)
  }
  const currentStreak = curSign === 0 ? '—' : `${cur}${curSign === 1 ? 'W' : 'L'}`

  const dayMap = {}
  for (const t of sorted) {
    const d = (t.timestamp || '').slice(0, 10)
    if (!d) continue
    dayMap[d] = (dayMap[d] || 0) + (Number(t.pnl) || 0)
  }
  const daily = Object.entries(dayMap).map(([d, v]) => ({ day: d.slice(5), pnl: v })).slice(-14)
  const activeDays = Object.keys(dayMap).length

  const groupPnl = (key) => {
    const m = {}
    for (const t of sorted) {
      const k = t[key] || '—'
      if (!m[k]) m[k] = { name: k, pnl: 0, n: 0, w: 0 }
      m[k].pnl += Number(t.pnl) || 0
      m[k].n += 1
      if ((Number(t.pnl) || 0) > 0) m[k].w += 1
    }
    return Object.values(m).map((g) => ({ ...g, wr: g.n ? (g.w / g.n) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl)
  }

  const hourMap = {}
  for (const t of sorted) {
    // Prefer the actual entry time (when the trade was taken) over the log time.
    const hh = (t.entryTime || t.timestamp || '').slice(11, 13)
    if (!hh) continue
    hourMap[hh] = (hourMap[hh] || 0) + (Number(t.pnl) || 0)
  }
  const byHour = Object.entries(hourMap).map(([h, v]) => ({ hour: h + ':00', pnl: v })).sort((a, b) => a.hour.localeCompare(b.hour))

  // Hour × weekday win-rate matrix for the heat map
  const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const byHourDay = {}
  for (const t of sorted) {
    const ts = t.entryTime || t.timestamp
    if (!ts) continue
    const d = new Date(String(ts).replace(' ', 'T'))
    if (isNaN(d)) continue
    const day = WDAYS[d.getDay()]
    const h = String(d.getHours()).padStart(2, '0')
    const k = `${day}-${h}`
    if (!byHourDay[k]) byHourDay[k] = { wins: 0, total: 0, pnl: 0 }
    byHourDay[k].total++
    byHourDay[k].pnl += Number(t.pnl) || 0
    if ((Number(t.pnl) || 0) > 0) byHourDay[k].wins++
  }
  // Roll up to per-hour and per-day totals for the advisory
  const _hourTotals = {}
  const _dayTotals = {}
  for (const [k, v] of Object.entries(byHourDay)) {
    const [day, h] = k.split('-')
    if (!_hourTotals[h]) _hourTotals[h] = { wins: 0, total: 0, pnl: 0 }
    _hourTotals[h].wins += v.wins; _hourTotals[h].total += v.total; _hourTotals[h].pnl += v.pnl
    if (!_dayTotals[day]) _dayTotals[day] = { wins: 0, total: 0, pnl: 0 }
    _dayTotals[day].wins += v.wins; _dayTotals[day].total += v.total; _dayTotals[day].pnl += v.pnl
  }
  const _rankBy = (map) => Object.entries(map)
    .filter(([, v]) => v.total >= 3)
    .map(([k, v]) => ({ k, wr: (v.wins / v.total) * 100, total: v.total, pnl: v.pnl }))
    .sort((a, b) => b.wr - a.wr)
  const _hRanked = _rankBy(_hourTotals)
  const _dRanked = _rankBy(_dayTotals)
  const bestHour = _hRanked[0] || null
  const worstHour = _hRanked.length > 1 ? _hRanked[_hRanked.length - 1] : null
  const bestDay = _dRanked[0] || null
  const worstDay = _dRanked.length > 1 ? _dRanked[_dRanked.length - 1] : null

  // non-tilt streak: consecutive trades with no FOMO/greed/revenge tag (current + best)
  let ntCur = 0, ntBest = 0
  for (const t of sorted) {
    if (TILT.includes(t.emotion)) ntCur = 0
    else { ntCur += 1; ntBest = Math.max(ntBest, ntCur) }
  }

  // self-diagnosed reasons, split by outcome
  const reasonsWin = {}, reasonsLoss = {}
  for (const t of sorted) {
    if (!t.reason) continue
    const b = (Number(t.pnl) || 0) >= 0 ? reasonsWin : reasonsLoss
    b[t.reason] = (b[t.reason] || 0) + 1
  }
  const toReasonArr = (o) => Object.entries(o).map(([name, m]) => ({ name, n: m })).sort((a, b) => b.n - a.n)

  return {
    n, totalPnl, totalFees, winRate, profitFactor, avgWin, avgLoss, expectancy, avgRR,
    maxDD, currentStreak, bestWin, worstLoss, equity, daily, activeDays,
    grossProfit, grossLoss, nonTiltStreak: ntCur, bestNonTilt: ntBest,
    reasonsWin: toReasonArr(reasonsWin), reasonsLoss: toReasonArr(reasonsLoss),
    byEmotion: groupPnl('emotion'), bySetup: groupPnl('setup'), byHour,
    byHourDay, bestHour, worstHour, bestDay, worstDay
  }
}

/* ───────── leak finder: the dollar cost of behavioral patterns ─────────
   Each leak matches trades by their emotion tag and/or self-diagnosed reason.
   A trade can feed more than one leak (e.g. greedy AND oversized) — that's fine,
   we're surfacing patterns, not partitioning P&L. */
export const LEAK_DEFS = [
  { id: 'revenge', label: 'Revenge trades', blurb: 'trading to win it back', emotions: ['Revenge'], reasons: ['Revenge trade'] },
  { id: 'fomo', label: 'FOMO / chasing', blurb: 'chasing entries you missed', emotions: ['FOMO'], reasons: ['FOMO / chased'] },
  { id: 'greed', label: 'Greed', blurb: 'overstaying or oversizing winners', emotions: ['Greedy'], reasons: ['Greed — overstayed/oversized'] },
  { id: 'impatience', label: 'Impatience', blurb: 'forcing trades before the setup', emotions: [], reasons: ['Impatient — forced it'] },
  { id: 'movedstop', label: 'Moving your stop', blurb: 'letting losers run past plan', emotions: [], reasons: ['Moved / ignored my stop'] },
  { id: 'oversized', label: 'Oversizing', blurb: 'risking more than planned', emotions: [], reasons: ['Oversized'] },
  { id: 'bored', label: 'Boredom trades', blurb: 'trading just to be in the market', emotions: ['Bored'], reasons: [] }
]

export function computeLeaks(trades = []) {
  const cats = LEAK_DEFS.map((d) => ({ id: d.id, label: d.label, blurb: d.blurb, n: 0, pnl: 0 }))
  const tagged = new Set()
  for (const t of trades) {
    const pnl = Number(t.pnl) || 0
    LEAK_DEFS.forEach((d, i) => {
      if ((t.emotion && d.emotions.includes(t.emotion)) || (t.reason && d.reasons.includes(t.reason))) {
        cats[i].n += 1; cats[i].pnl += pnl; tagged.add(t)
      }
    })
  }
  // A real leak is a net-negative pattern with a meaningful sample.
  const leaks = cats.filter((c) => c.n >= 2 && c.pnl < 0).sort((a, b) => a.pnl - b.pnl)
  let totalLeaked = 0
  for (const t of tagged) totalLeaked += Number(t.pnl) || 0
  return { worst: leaks[0] || null, leaks, totalLeaked, taggedCount: tagged.size }
}

/* ───────── rating: grade the process, not the outcome ───────── */
export function letterFor(score) {
  if (score >= 95) return { letter: 'A+', tone: 'up' }
  if (score >= 85) return { letter: 'A', tone: 'up' }
  if (score >= 70) return { letter: 'B', tone: 'up' }
  if (score >= 55) return { letter: 'C', tone: 'accent' }
  if (score >= 40) return { letter: 'D', tone: 'down' }
  return { letter: 'F', tone: 'down' }
}

// ── self-graded GPA: the trader's own Setup + Execution letter grades (A+→F).
// Separate from the app's algorithmic grade — it's self-reported, not verified.
const SELF_GPA = { 'A+': 4.3, A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 }
const gpaToLetter = (g) =>
  g == null ? '—' : g >= 4.15 ? 'A+' : g >= 3.5 ? 'A' : g >= 2.5 ? 'B' : g >= 1.5 ? 'C' : g >= 0.5 ? 'D' : 'F'
export function computeSelfGrade(trades) {
  const setupPts = [], execPts = []
  let count = 0
  for (const t of trades || []) {
    const s = SELF_GPA[t.selfSetup], e = SELF_GPA[t.selfExec]
    if (s != null) setupPts.push(s)
    if (e != null) execPts.push(e)
    if (s != null || e != null) count++
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const setupGpa = avg(setupPts), execGpa = avg(execPts), gpa = avg([...setupPts, ...execPts])
  return { count, gpa, setupGpa, execGpa, letter: gpaToLetter(gpa), setupLetter: gpaToLetter(setupGpa), execLetter: gpaToLetter(execGpa) }
}

// Per-trade execution grade — deliberately blind to whether the trade won or lost.
export function executionGrade(t) {
  // Imported trades carry no process data (no emotion/stop/risk), so execution can't be judged.
  // Use a fair outcome-based placeholder until the trader journals them: win = A, loss = C.
  if (t.source === 'import') {
    return (Number(t.pnl) || 0) >= 0 ? { score: 90, letter: 'A', tone: 'up' } : { score: 60, letter: 'C', tone: 'accent' }
  }
  const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0
  const pnl = Number(t.pnl) || 0, risk = Number(t.riskAmount) || 0, rr = Number(t.rr) || 0

  let stopPts = 0
  if (stop > 0 && entry > 0) stopPts = (t.direction === 'Long' ? stop < entry : stop > entry) ? 25 : 10

  const rrPts = rr >= 2 ? 25 : rr >= 1.5 ? 20 : rr >= 1 ? 15 : rr > 0 ? 8 : 14

  const e = t.emotion || ''
  const emoPts = ['Disciplined', 'Confident', 'Neutral'].includes(e) ? 25 : ['FOMO', 'Greedy', 'Revenge'].includes(e) ? 0 : 12

  let riskPts = 20 // win / breakeven / no risk logged = can't fault it
  if (pnl < 0 && risk > 0) {
    const mult = Math.abs(pnl) / risk
    riskPts = mult <= 1.1 ? 25 : mult <= 1.5 ? 12 : 0 // loss bigger than planned = stop wasn't honored
  }

  const score = stopPts + rrPts + emoPts + riskPts
  return { score, ...letterFor(score) }
}

export function computeRating(trades, stats) {
  const n = stats.n
  const grades = trades.map(executionGrade)
  const avgGrade = grades.length ? grades.reduce((a, g) => a + g.score, 0) / grades.length : 60

  const PF = stats.profitFactor === Infinity ? 2.5 : (stats.profitFactor || 0)
  const edge = clamp(Math.round(55 + (PF - 1) * 40), 20, 99)
  const discipline = clamp(Math.round(avgGrade), 20, 99)
  const ddRatio = stats.maxDD / Math.max(stats.grossProfit, Math.abs(stats.avgWin) * 3, 1)
  const risk = clamp(Math.round(95 - ddRatio * 55), 25, 99)
  const consistency = clamp(Math.round(38 + stats.winRate * 0.55 + (PF >= 1 ? 8 : -8)), 25, 95)
  const tpd = stats.activeDays ? n / stats.activeDays : 0
  const patience = clamp(Math.round(95 - Math.max(0, tpd - 4) * 9), 30, 95)

  // self-diagnosed reasons nudge the attribute they map to (bounded ±10)
  const tally = { patience: { g: 0, b: 0 }, discipline: { g: 0, b: 0 }, risk: { g: 0, b: 0 }, edge: { g: 0, b: 0 } }
  for (const t of trades) {
    const r = REASONS[t.reason]
    if (r && r.attr) tally[r.attr][r.good ? 'g' : 'b']++
  }
  const nudge = (k) => { const a = tally[k], tot = a.g + a.b; return tot ? clamp(Math.round(((a.g - a.b) / tot) * 10), -10, 10) : 0 }

  const attrs = {
    edge: clamp(edge + nudge('edge'), 20, 99),
    discipline: clamp(discipline + nudge('discipline'), 20, 99),
    risk: clamp(risk + nudge('risk'), 25, 99),
    consistency,
    patience: clamp(patience + nudge('patience'), 30, 95)
  }
  const raw = attrs.edge * 0.3 + attrs.discipline * 0.3 + attrs.risk * 0.2 + attrs.consistency * 0.1 + attrs.patience * 0.1
  const ovr = clamp(Math.round(raw), 59, 99)

  const holds = trades.map(holdMs).filter((m) => m && m > 0).sort((a, b) => a - b)
  const medHold = holds.length ? holds[Math.floor(holds.length / 2)] : null
  const archetype = medHold == null ? 'Trader'
    : medHold < 10 * 60000 ? 'Scalper'
    : medHold < 2 * 3600000 ? 'Day Trader'
    : medHold < 2 * 864e5 ? 'Swing Trader'
    : 'Position Trader'

  const imported = trades.filter((t) => t.source === 'import').length
  return { ovr, attrs, archetype, provisional: n < 20, sampleN: n, imported }
}

// Achievements reward BEHAVIOUR, not P&L — and use "best ever" tallies so they stay earned.
// Difficulty tiers — the harder the badge, the cooler the medal renders.
export const ACH_TIERS = {
  bronze: { label: 'Bronze', color: '#CD7F32' },
  silver: { label: 'Silver', color: '#C0C9D6' },
  gold: { label: 'Gold', color: '#FFD54A' },
  diamond: { label: 'Diamond', color: '#7FE3F0' }
}

export function computeAchievements(trades, stats, payouts = [], dayLogs = [], commitments = []) {
  const sorted = [...trades].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  let aGradeLosses = 0, stopSet = 0, withShots = 0, honoredCur = 0, honoredBest = 0, planned = 0
  const dayTilt = {}
  const days = {} // date → { pnl, tilt, honored } for streak/bounce-back logic
  for (const t of sorted) {
    const pnl = Number(t.pnl) || 0, risk = Number(t.riskAmount) || 0
    const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0, target = Number(t.target) || 0
    const stopOk = stop > 0 && entry > 0 && (t.direction === 'Long' ? stop < entry : stop > entry)
    if (executionGrade(t).score >= 85 && pnl < 0) aGradeLosses++
    if (stopOk) stopSet++
    if (stopOk && target > 0) planned++
    if ((t.imageCount || 0) > 0) withShots++
    const honored = pnl >= 0 || risk <= 0 || Math.abs(pnl) <= 1.1 * risk
    if (honored) { honoredCur++; honoredBest = Math.max(honoredBest, honoredCur) } else honoredCur = 0
    const d = (t.entryTime || t.timestamp || '').slice(0, 10)
    if (d) {
      if (!(d in dayTilt)) dayTilt[d] = false
      if (TILT.includes(t.emotion)) dayTilt[d] = true
      if (!days[d]) days[d] = { pnl: 0, tilt: false, honored: true }
      days[d].pnl += pnl
      if (TILT.includes(t.emotion)) days[d].tilt = true
      if (!honored) days[d].honored = false
    }
  }
  let cleanRun = 0, cleanBest = 0
  for (const d of Object.keys(dayTilt).sort()) { if (!dayTilt[d]) { cleanRun++; cleanBest = Math.max(cleanBest, cleanRun) } else cleanRun = 0 }

  const dayKeys = Object.keys(days).sort()
  // Locked In: longest run of journaled trading days; gaps ≤3 calendar days keep
  // the run alive so weekends don't break it.
  let dayRun = dayKeys.length ? 1 : 0, dayBest = dayRun
  for (let i = 1; i < dayKeys.length; i++) {
    const gap = (new Date(dayKeys[i] + 'T00:00:00') - new Date(dayKeys[i - 1] + 'T00:00:00')) / 864e5
    dayRun = gap <= 3 ? dayRun + 1 : 1
    dayBest = Math.max(dayBest, dayRun)
  }
  // Bounce Back: a red day followed by a clean day — no tilt, every loss inside plan.
  let bounceBacks = 0
  for (let i = 1; i < dayKeys.length; i++) {
    const prev = days[dayKeys[i - 1]], cur = days[dayKeys[i]]
    if (prev.pnl < 0 && !cur.tilt && cur.honored) bounceBacks++
  }
  const PF = stats.profitFactor === Infinity ? 99 : (stats.profitFactor || 0)

  // Commitment adherence — reward sticking to a chosen focus, not just starting one.
  // Only completed commitments (a full run of measured trades) count.
  const doneCommitments = (commitments || []).filter((c) => c.status === 'completed')
  const bestAdherence = doneCommitments.reduce((m, c) => Math.max(m, Number(c.adherenceRate) || 0), 0)

  const defs = [
    { id: 'process', name: 'Process over Profit', Icon: Trophy, tier: 'gold', desc: '10 A-grade trades that still lost — right trade, accepted variance.', current: aGradeLosses, goal: 10 },
    { id: 'zen', name: 'Zen Mode', Icon: Brain, tier: 'gold', desc: 'A 25-trade streak with no FOMO, greed or revenge.', current: stats.bestNonTilt, goal: 25 },
    { id: 'bounceback', name: 'Bounce Back', Icon: Sunrise, tier: 'silver', desc: '3 clean, tilt-free days right after a red day — no revenge, risk honored.', current: bounceBacks, goal: 3 },
    { id: 'coolweek', name: 'Cool Week', Icon: Snowflake, tier: 'silver', desc: '5 straight trading days with zero tilt.', current: cleanBest, goal: 5 },
    { id: 'lockedin', name: 'Locked In', Icon: CalendarCheck, tier: 'silver', desc: 'Journaled trades 10 trading days in a row — weekends don\'t break it.', current: dayBest, goal: 10 },
    { id: 'satonhands', name: 'Sat On My Hands', Icon: Coffee, tier: 'bronze', desc: 'Logged 10 no-trade days — knowing when not to trade is a skill.', current: dayLogs?.length || 0, goal: 10 },
    { id: 'stophonored', name: 'Stop Honored', Icon: Shield, tier: 'silver', desc: '15 trades in a row with no loss past your planned risk.', current: honoredBest, goal: 15 },
    { id: 'riskmgr', name: 'Risk Manager', Icon: Target, tier: 'silver', desc: '50 trades logged with a stop set.', current: stopSet, goal: 50 },
    { id: 'definedrisk', name: 'Defined Risk', Icon: Crosshair, tier: 'silver', desc: '25 trades entered with both a stop and a target set.', current: planned, goal: 25 },
    { id: 'journaler', name: 'Journaler', Icon: BookOpen, tier: 'gold', desc: '100 trades journaled.', current: stats.n, goal: 100 },
    { id: 'reviewer', name: 'Reviewer', Icon: Camera, tier: 'bronze', desc: 'Screenshots attached to 20 trades.', current: withShots, goal: 20 },
    { id: 'edge', name: 'Edge Confirmed', Icon: TrendingUp, tier: 'diamond', desc: 'Profit factor over 1.5 across 50+ trades.', current: Math.min(stats.n, 50), goal: 50, gate: PF > 1.5 },
    { id: 'firstpayout', name: 'First Payout', Icon: Wallet, tier: 'gold', desc: 'Cashed your first prop firm payout.', current: (payouts?.length || 0) >= 1 ? 1 : 0, goal: 1 },
    { id: 'committed', name: 'Kept My Word', Icon: Handshake, tier: 'bronze', desc: 'Completed your first coach commitment — a full run of trades measured against one rule.', current: doneCommitments.length, goal: 1 },
    { id: 'habitbuilder', name: 'Habit Builder', Icon: Repeat, tier: 'silver', desc: 'Completed 3 coach commitments — process is becoming routine.', current: doneCommitments.length, goal: 3 },
    { id: 'ironclad', name: 'Ironclad Discipline', Icon: ShieldCheck, tier: 'diamond', desc: 'Completed a commitment with 90%+ of trades following your rule.', current: Math.round(bestAdherence), goal: 90 }
  ]
  return defs.map((d) => ({
    ...d,
    progress: clamp((d.current || 0) / d.goal, 0, 1),
    unlocked: (d.current || 0) >= d.goal && (d.gate === undefined || d.gate)
  }))
}

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
    const d = (t.entryTime || t.timestamp || '').slice(0, 10)
    if (d) dayPnl[d] = (dayPnl[d] || 0) + pnl
  }
  let dailyBreached = false
  for (const v of Object.values(dayPnl)) if (maxDaily > 0 && v <= -maxDaily) dailyBreached = true

  const netProfit = bal - start
  const curFloor = floorAt(peak)
  const ddBuffer = bal - curFloor
  const todayPnl = dayPnl[new Date().toISOString().slice(0, 10)] || 0
  const dailyRemaining = Math.max(0, maxDaily - Math.max(0, -todayPnl))
  const daysTraded = Object.keys(dayPnl).length
  const targetHit = target > 0 && netProfit >= target
  const daysHit = daysTraded >= minDays
  const breached = floorBreached || dailyBreached
  const status = breached ? 'failed' : (targetHit && daysHit ? 'passed' : 'active')
  return { start, bal, netProfit, peak, curFloor, ddBuffer, maxDD, target, maxDaily, todayPnl, dailyRemaining, daysTraded, minDays, targetHit, daysHit, breached, floorBreached, dailyBreached, status, curve }
}

const promptText = (value, max = 1200) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const promptNum = (value) => Number.isFinite(Number(value)) ? fmtN(Number(value)) : '-'

function tradePromptRow(t, includeWritten, accountName) {
  const fields = [
    `date=${t.entryTime || t.timestamp || '-'}`,
    `symbol=${promptText(t.symbol, 30) || '-'}`,
    `direction=${promptText(t.direction, 12) || '-'}`,
    `account=${accountName ? accountName(t.account) : (promptText(t.account, 50) || 'Live')}`,
    `entry=${promptNum(t.entry)}`,
    `exit=${promptNum(t.exit)}`,
    `stop=${promptNum(t.stop)}`,
    `target=${promptNum(t.target)}`,
    `size=${promptNum(t.size)}`,
    `risk=${promptNum(t.riskAmount)}`,
    `pnl=${promptNum(t.pnl)}`,
    `fees=${promptNum(t.fees)}`,
    `rr=${t.rr ? fmtN(t.rr, 1) : '-'}`,
    `setup=${promptText(t.setup, 80) || '(none)'}`,
    `emotion=${promptText(t.emotion, 40) || '(none)'}`,
    `reason=${promptText(t.reason, 160) || '(none)'}`,
    `selfSetup=${promptText(t.selfSetup, 4) || '(none)'}`,
    `selfExecution=${promptText(t.selfExec, 4) || '(none)'}`,
    `source=${promptText(t.source, 20) || 'manual'}`
  ]
  if (includeWritten) fields.push(`notes=${promptText(t.notes) || '(none)'}`)
  return fields.join(' | ')
}

export function tradeContext(trades, stats, { includeWritten = true, maxChars = 48000, accountName } = {}) {
  const top = (arr) => arr.slice(0, 5).map((g) => `${g.name}(pnl=${fmtN(g.pnl)}, n=${g.n}, wr=${fmtN(g.wr, 0)}%)`).join(', ')
  const reasons = (arr) => arr.slice(0, 5).map((r) => `${r.name}(${r.n})`).join(', ')
  const header = `AGGREGATED STATS (all ${stats.n} trades):
netPnL=${fmtN(stats.totalPnl)} winRate=${fmtN(stats.winRate, 1)}% profitFactor=${stats.profitFactor === Infinity ? 'inf' : fmtN(stats.profitFactor, 2)} expectancy=${fmtN(stats.expectancy)}
avgWin=${fmtN(stats.avgWin)} avgLoss=${fmtN(stats.avgLoss)} maxDD=${fmtN(stats.maxDD)} avgRR=${fmtN(stats.avgRR, 1)} currentStreak=${stats.currentStreak} nonTiltStreak=${stats.nonTiltStreak}
P&L by emotion: ${top(stats.byEmotion) || '(none)'}
P&L by setup: ${top(stats.bySetup) || '(none)'}
Most common win reasons: ${reasons(stats.reasonsWin) || '(none)'}
Most common loss reasons: ${reasons(stats.reasonsLoss) || '(none)'}

TRADE ENTRIES (newest first). Field notes: account = which account the trade was on ("Live" = personal/non-prop); size = number of contracts/shares (NOT dollars); entry/exit/stop/target = prices; pnl/risk/fees = dollar amounts; a field shown as "(none)" was left blank/untagged — never infer, guess, or invent a value for it:`
  const rows = [...trades].reverse().map((t) => tradePromptRow(t, includeWritten, accountName))
  const kept = []
  let used = header.length
  for (const row of rows) {
    if (used + row.length + 1 > maxChars) break
    kept.push(row); used += row.length + 1
  }
  const coverage = kept.length < rows.length ? `\n[Included ${kept.length} of ${rows.length} individual entries; aggregates above cover the full history.]` : ''
  return `${header}\n${kept.join('\n') || '(none)'}${coverage}`
}

export function fullJournalContext({ trades = [], stats, reviews = {}, playbook = [], dayLogs = [], goals = {}, settings = {}, payouts = [] }, { includeWritten = true, maxChars = 44000 } = {}) {
  let accounts = []
  try { const parsed = JSON.parse(settings.propFirmAccounts || '[]'); if (Array.isArray(parsed)) accounts = parsed } catch {}
  const accById = {}
  for (const a of accounts) accById[a.id] = a
  // Trades reference an account by id; show the human label so the coach can break
  // results down per account (an empty id is the personal "Live" account).
  const accountName = (id) => {
    if (!id) return 'Live'
    const a = accById[id]
    return a ? (promptText(a.label || a.name || a.firm, 60) || id) : id
  }

  let out = tradeContext(trades, stats, { includeWritten, maxChars: Math.floor(maxChars * 0.7), accountName })
  const append = (title, lines) => {
    const clean = lines.filter(Boolean)
    if (!clean.length || out.length >= maxChars) return
    const section = `\n\n${title}:\n${clean.join('\n')}`
    out += section.slice(0, Math.max(0, maxChars - out.length))
  }

  // Per-account aggregates, pre-computed so the coach can quote account-level totals
  // without (mis)counting the raw trade list itself. Only shown when trades span
  // more than one account — otherwise it just restates the portfolio stats above.
  const byAccount = {}
  for (const t of trades) { const name = accountName(t.account); (byAccount[name] || (byAccount[name] = [])).push(t) }
  const acctNames = Object.keys(byAccount)
  if (acctNames.length > 1) {
    const lines = acctNames
      .map((name) => ({ name, s: computeStats(byAccount[name]) }))
      .sort((a, b) => b.s.n - a.s.n)
      .map(({ name, s }) => `account=${name} | trades=${s.n} | netPnL=${fmtN(s.totalPnl)} | winRate=${fmtN(s.winRate, 1)}% | avgWin=${fmtN(s.avgWin)} | avgLoss=${fmtN(s.avgLoss)} | profitFactor=${s.profitFactor === Infinity ? 'inf' : fmtN(s.profitFactor, 2)} | maxDD=${fmtN(s.maxDD)}`)
    append('PER-ACCOUNT SUMMARY (already computed — cite these exact figures for account-level totals; do not recompute or estimate)', lines)
  }

  // The personal/live account has a real funded balance the trader sets — give it
  // to the coach so it can reason about balance/return instead of guessing off prices.
  const liveCapital = Number(settings.liveCapital) || 0
  if (liveCapital > 0) {
    const ls = computeStats(trades.filter((t) => !accById[t.account]))
    const withdrawn = (payouts || []).filter((p) => p.accountId === 'live').reduce((a, p) => a + (Number(p.amount) || 0), 0)
    append('LIVE ACCOUNT (the trader\'s real personal account; startingCapital is its size; all dollar amounts)', [
      `startingCapital=${fmtN(liveCapital)} | currentBalance=${fmtN(liveCapital + ls.totalPnl - withdrawn)} | netPnL=${fmtN(ls.totalPnl)} | withdrawals=${fmtN(withdrawn)} | trades=${ls.n} | maxDrawdown=${fmtN(ls.maxDD)}`
    ])
  }

  append('GOALS AND RISK LIMITS', [
    `weeklyGoal=${promptNum(goals.weekly)} monthlyGoal=${promptNum(goals.monthly)} dailyGoal=${promptNum(settings.dailyGoal)} maxDailyLoss=${promptNum(settings.maxDailyLoss)}`
  ])

  if (includeWritten) {
    let rules = []
    try { const parsed = JSON.parse(settings.tradeRules || '[]'); if (Array.isArray(parsed)) rules = parsed } catch {}
    append('TRADING RULES', rules.map((r, i) => `${i + 1}. ${promptText(r, 500)}`))
    append('SAVED REVIEWS', Object.entries(reviews || {}).sort(([a], [b]) => b.localeCompare(a)).map(([period, text]) => `${period}: ${promptText(text, 2400)}`))
    append('PLAYBOOK', (playbook || []).map((p) => [
      `Setup=${promptText(p.name, 100)}`,
      `description=${promptText(p.description, 700) || '-'}`,
      `criteria=${promptText(p.criteria, 900) || '-'}`,
      `invalidation=${promptText(p.invalidation, 700) || '-'}`,
      `targets=${promptText(p.targets, 700) || '-'}`,
      `notes=${promptText(p.notes, 900) || '-'}`
    ].join(' | ')))
  }

  append('NO-TRADE AND MISSED-DAY LOGS', [...(dayLogs || [])].reverse().map((d) => {
    const base = `${d.date}: reason=${promptText(d.reason, 200) || '-'} | mood=${promptText(d.mood, 80) || '-'}`
    return includeWritten ? `${base} | note=${promptText(d.note, 800) || '-'}` : base
  }))

  append('PROP ACCOUNT RULES', accounts.map((a) =>
    `name=${promptText(a.label || a.name || a.firm, 100) || a.id} | size=${promptNum(a.accountSize)} | target=${promptNum(a.target)} | maxDailyLoss=${promptNum(a.maxDailyLoss)} | maxDrawdown=${promptNum(a.maxDrawdown)} | drawdownType=${promptText(a.ddType, 30) || '-'} | minDays=${promptNum(a.minDays)}`
  ))

  return out
}

/* ───────── medals + weekly journaling streak ───────── */
const TIER_NAMES = ['—', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
const tierOf = (v, th) => { let t = 0; for (let i = 0; i < th.length; i++) if (v >= th[i]) t = i + 1; return t }
const weekOf = (d) => periodKey(String(d || '').slice(0, 10), 'week')
const prevWeek = (wk) => { const d = new Date(wk + 'T00:00:00'); d.setDate(d.getDate() - 7); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

// Consecutive weeks (Mon-start) with at least one logged trade, bridging weeks the
// trader marked as a break. Forgives the current in-progress week.
export function journalingStreak(trades, settings = {}) {
  const active = new Set()
  for (const t of trades || []) { const w = weekOf(t.entryTime || t.timestamp); if (w) active.add(w) }
  let breakSet
  try { breakSet = new Set(JSON.parse(settings.breakWeeks || '[]')) } catch { breakSet = new Set() }
  const onBreak = settings.onBreak === 'true' || settings.onBreak === true
  const since = settings.breakSince || ''
  const isBreak = (w) => breakSet.has(w) || (onBreak && since && w >= since)
  const cw = weekOf(new Date().toISOString())
  let w = cw, streak = 0, guard = 0
  if (!active.has(cw) && !isBreak(cw)) w = prevWeek(cw) // grace for the in-progress week
  while (guard++ < 600) {
    if (isBreak(w)) { w = prevWeek(w); continue }
    if (active.has(w)) { streak++; w = prevWeek(w); continue }
    break
  }
  return { streak, onBreak }
}

function bestWinStreak(trades) {
  const sorted = [...(trades || [])].sort((a, b) => String(a.entryTime || a.timestamp || '').localeCompare(String(b.entryTime || b.timestamp || '')))
  let best = 0, cur = 0
  for (const t of sorted) { if ((Number(t.pnl) || 0) > 0) { cur++; if (cur > best) best = cur } else cur = 0 }
  return best
}

function cleanWeeks(trades) {
  const byWeek = {}
  for (const t of trades || []) { const w = weekOf(t.entryTime || t.timestamp); if (!w) continue; if (!(w in byWeek)) byWeek[w] = true; if (TILT.includes(t.emotion)) byWeek[w] = false }
  return Object.values(byWeek).filter(Boolean).length
}

// The payout medal runs an extended 8-tier ladder (wood → legendary) with its own
// names/colors, distinct from the 5-tier Bronze→Diamond scale the other medals use.
const PAYOUT_TIER_NAMES = ['—', 'Wood', 'Steel', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legendary']
const PAYOUT_TIER_COLORS = ['#5A6478', '#8B5A2B', '#9CA3AF', '#CD7F32', '#C0C0C0', '#FFD54A', '#7FD8E8', '#B9F2FF', '#C084FC']

export function computeMedals(trades, stats, settings = {}, payouts = []) {
  const js = journalingStreak(trades, settings)
  const defs = [
    { id: 'consistency', name: 'Consistency', desc: 'Weeks journaled in a row', Icon: Calendar, value: js.streak, unit: 'wk', th: [2, 4, 12, 26, 52] },
    { id: 'discipline', name: 'Discipline', desc: 'Best non-tilt streak', Icon: Shield, value: stats.bestNonTilt || 0, unit: '', th: [10, 25, 50, 100, 200] },
    { id: 'composure', name: 'Composure', desc: 'Clean (no-tilt) weeks', Icon: Snowflake, value: cleanWeeks(trades), unit: 'wk', th: [2, 5, 12, 26, 52] },
    { id: 'dedication', name: 'Dedication', desc: 'Trades journaled', Icon: BookOpen, value: stats.n || 0, unit: '', th: [25, 100, 250, 500, 1000] },
    { id: 'hothand', name: 'Hot hand', desc: 'Best win streak — luck counts here', Icon: Flame, value: bestWinStreak(trades), unit: '', th: [3, 5, 8, 12, 20] },
    { id: 'payday', name: 'Payday', desc: 'Prop firm payouts collected', Icon: Banknote, value: payouts?.length || 0, unit: '', th: [1, 6, 12, 22, 35, 50, 65, 100], tierNames: PAYOUT_TIER_NAMES, tierColors: PAYOUT_TIER_COLORS }
  ]
  const medals = defs.map((m) => {
    const names = m.tierNames || TIER_NAMES
    const tier = tierOf(m.value, m.th)
    return { ...m, tier, tierName: names[tier], next: tier < m.th.length ? m.th[tier] : null, progress: tier < m.th.length ? Math.min(1, m.value / m.th[tier]) : 1 }
  })
  return { streak: js.streak, onBreak: js.onBreak, medals }
}

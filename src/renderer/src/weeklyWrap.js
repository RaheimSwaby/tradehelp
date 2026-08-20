import { computeLeaks, computeStats } from './stats.js'
import { currentPeriodKey, tradesInPeriod } from './periodRetrospective.js'

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function ruleBreakKey(ruleText) {
  return String(ruleText || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180)
}

export function previousWeekKey(now = new Date()) {
  const date = asDate(now)
  if (!date) return ''
  const previous = new Date(date)
  previous.setDate(previous.getDate() - 7)
  return currentPeriodKey('week', previous)
}

/**
 * Which week deserves a wrap right now, or '' for none.
 *
 * Friday after a session offers that same week. Otherwise it offers the previous week
 * on any day, not just Monday: a trader who is away Monday or only trades midweek would
 * otherwise skip the wrap forever. Repeats are not a risk because the caller records
 * each week key it has shown, so this fires once per week whenever the app is opened.
 */
export function weeklyWrapCandidate(now = new Date(), { afterSession = false } = {}) {
  const date = asDate(now)
  if (!date) return ''
  if (afterSession && date.getDay() === 5) return currentPeriodKey('week', date)
  return previousWeekKey(date)
}

export function ruleBreaksInWeek(ruleBreaks = [], weekKey = '', granularity = 'week') {
  return (Array.isArray(ruleBreaks) ? ruleBreaks : []).filter((entry) => {
    const date = asDate(entry?.occurredAt)
    return date && currentPeriodKey(granularity, date) === weekKey
  })
}

export function previousMonthKey(now = new Date()) {
  const date = asDate(now)
  if (!date) return ''
  // Anchor to the 1st before stepping back, so the 31st doesn't skip a short month.
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return currentPeriodKey('month', previous)
}

/**
 * The completed month, offered on any day of the current one. Same reasoning as the
 * weekly candidate: the caller records which keys it has shown, so this surfaces once.
 */
export function monthlyWrapCandidate(now = new Date()) {
  const date = asDate(now)
  if (!date) return ''
  return previousMonthKey(date)
}

export function previousQuarterKey(now = new Date()) {
  const date = asDate(now)
  if (!date) return ''
  const currentQuarter = Math.floor(date.getMonth() / 3)
  const previous = new Date(date.getFullYear(), (currentQuarter - 1) * 3, 1)
  return currentPeriodKey('quarter', previous)
}

/** The most recently completed quarter, offered once whenever the app is next opened. */
export function quarterlyWrapCandidate(now = new Date()) {
  const date = asDate(now)
  if (!date) return ''
  return previousQuarterKey(date)
}

export function ruleBreaksForSession(ruleBreaks = [], sessionId = '') {
  const key = String(sessionId || '')
  if (!key) return []
  return (Array.isArray(ruleBreaks) ? ruleBreaks : []).filter((entry) => String(entry?.sessionId || '') === key)
}

export function filterTradingSessions(sessions = [], ruleBreaks = [], query = '', filter = 'all') {
  const needle = String(query || '').trim().toLowerCase()
  return (Array.isArray(sessions) ? sessions : []).filter((session) => {
    const breaks = ruleBreaksForSession(ruleBreaks, session?.id)
    const matchesFilter = filter === 'notes' ? Boolean(String(session?.notes || '').trim())
      : filter === 'rule-breaks' ? breaks.length > 0
        : filter === 'recordings' ? Boolean(session?.recordingUrl || session?.recordingStatus === 'ready')
          : filter === 'clean' ? breaks.length === 0
            : true
    if (!matchesFilter) return false
    if (!needle) return true
    const date = asDate(session?.startedAt)
    const searchable = [
      session?.startedAt,
      session?.endedAt,
      date?.toLocaleString(),
      session?.notes,
      session?.status,
      ...breaks.flatMap((entry) => [entry.ruleText, entry.reason])
    ].filter(Boolean).join(' ').toLowerCase()
    return searchable.includes(needle)
  })
}

function rankedCounts(values) {
  const counts = new Map()
  for (const value of values) {
    const label = String(value || '').trim()
    if (label) counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function focusFor(weakness, reasons = []) {
  const text = `${weakness || ''} ${reasons.join(' ')}`.toLowerCase()
  if (/size|risk|lot|contract/.test(text)) return 'Set the exact size before the session and require a second check before every order.'
  if (/revenge|win it back|loss/.test(text)) return 'After a loss, take a timed reset and do not re-enter until the next setup is written down.'
  if (/fomo|chase|late|miss/.test(text)) return 'Define the latest acceptable entry before the session; a missed entry becomes a logged pass.'
  if (/stop/.test(text)) return 'Place the stop with the order and treat moving it farther away as ending the session.'
  if (/news/.test(text)) return 'Mark the event window before trading and block new entries inside that window.'
  return 'Turn this into one binary pre-flight check and review it before the next order.'
}

/**
 * Recap for one completed period. The month rewind is the same analysis over a longer
 * window, so it shares this builder rather than forking a parallel one that would drift.
 */
export function buildWeeklyWrap({ trades = [], ruleBreaks = [], weekKey = '', granularity = 'week' } = {}) {
  if (!weekKey) return null
  const periodTrades = tradesInPeriod(trades, weekKey, granularity)
  if (!periodTrades.length) return null
  const stats = computeStats(periodTrades)
  const breaks = ruleBreaksInWeek(ruleBreaks, weekKey, granularity)
  const breakRanking = rankedCounts(breaks.map((entry) => entry.ruleText))
  const emotions = rankedCounts(periodTrades.map((trade) => trade.emotion).filter((emotion) => emotion && emotion !== 'Neutral'))
  const setups = rankedCounts(periodTrades.map((trade) => trade.setup))
  const leaks = computeLeaks(periodTrades)
  const losingReasons = stats.reasonsLoss || []
  const topBreak = breakRanking[0] || null
  const weakness = topBreak
    ? { type: 'rule', label: topBreak.label, count: topBreak.count, reasons: breaks.filter((entry) => entry.ruleText === topBreak.label).map((entry) => entry.reason) }
    : leaks.worst
      ? { type: 'leak', label: leaks.worst.label, count: leaks.worst.n, pnl: leaks.worst.pnl, reasons: [] }
      : losingReasons[0]
        ? { type: 'reason', label: losingReasons[0].name, count: losingReasons[0].n, reasons: [] }
        : null
  const wins = periodTrades.filter((trade) => Number(trade.pnl) > 0).length
  const losses = periodTrades.filter((trade) => Number(trade.pnl) < 0).length
  const flat = periodTrades.length - wins - losses
  const latestBreakByRule = {}
  for (const entry of breaks) {
    if (!latestBreakByRule[entry.ruleKey]) latestBreakByRule[entry.ruleKey] = entry
  }
  return {
    weekKey,
    granularity,
    trades: periodTrades,
    stats,
    wins,
    losses,
    flat,
    ruleBreaks: breaks,
    breakRanking,
    latestBreakByRule,
    dominantEmotion: emotions[0] || null,
    recurringSetup: setups[0] || null,
    weakness,
    focus: weakness ? focusFor(weakness.label, weakness.reasons) : 'Keep the same risk plan and record one sentence about what made your cleanest trade repeatable.',
    headline: stats.totalPnl >= 0
      ? `You finished the ${granularity} up with ${wins} winning trade${wins === 1 ? '' : 's'}.`
      : `You finished the ${granularity} red, but the pattern is visible now.`
  }
}

export function summarizeRuleBreaks(ruleBreaks = [], rules = []) {
  const list = Array.isArray(ruleBreaks) ? ruleBreaks : []
  const ranking = rankedCounts(list.map((entry) => entry.ruleText))
  const latestByRule = {}
  for (const entry of list) {
    const key = entry.ruleKey || ruleBreakKey(entry.ruleText)
    if (!latestByRule[key]) latestByRule[key] = entry
  }
  const active = new Set((rules || []).map((rule) => String(rule || '').trim()))
  const currentRanking = ranking.filter((row) => active.has(row.label))
  const weakness = currentRanking[0] || ranking[0] || null
  const reasons = weakness ? list.filter((entry) => entry.ruleText === weakness.label).map((entry) => entry.reason) : []
  return {
    total: list.length,
    ranking,
    latestByRule,
    weakness,
    focus: weakness ? focusFor(weakness.label, reasons) : ''
  }
}

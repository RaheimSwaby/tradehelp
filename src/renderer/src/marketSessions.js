import { tradeOutcome } from './workflow.js'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const MARKET_SESSION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'asia', label: 'Asia', city: 'Tokyo', timeZone: 'Asia/Tokyo', openMinute: 9 * 60, closeMinute: 18 * 60 }),
  Object.freeze({ id: 'london', label: 'London', city: 'London', timeZone: 'Europe/London', openMinute: 8 * 60, closeMinute: 17 * 60 }),
  Object.freeze({ id: 'new-york', label: 'New York', city: 'New York', timeZone: 'America/New_York', openMinute: 8 * 60, closeMinute: 17 * 60 })
])

const partsFormatters = new Map()
const clockFormatters = new Map()

function partsFormatter(timeZone) {
  if (!partsFormatters.has(timeZone)) {
    partsFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }))
  }
  return partsFormatters.get(timeZone)
}

function clockFormatter(timeZone) {
  if (!clockFormatters.has(timeZone)) {
    clockFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit'
    }))
  }
  return clockFormatters.get(timeZone)
}

function zonedParts(now, timeZone) {
  const values = Object.fromEntries(partsFormatter(timeZone).formatToParts(now).map((part) => [part.type, part.value]))
  return {
    weekday: WEEKDAYS.indexOf(values.weekday),
    hour: Number(values.hour) || 0,
    minute: Number(values.minute) || 0,
    second: Number(values.second) || 0
  }
}

function formatSessionMinute(value) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function formatSessionDuration(totalMinutes) {
  const rounded = Math.max(0, Math.ceil(Number(totalMinutes) || 0))
  if (rounded < 1) return 'under 1m'
  if (rounded < 60) return `${rounded}m`
  const hours = Math.floor(rounded / 60)
  const minutes = rounded % 60
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function isWeekday(day) {
  return day >= 1 && day <= 5
}

function nextOpenLabel(weekday, currentMinute, openMinute) {
  if (isWeekday(weekday) && currentMinute < openMinute) {
    return `Opens in ${formatSessionDuration(openMinute - currentMinute)}`
  }
  let daysAhead = 1
  while (!isWeekday((weekday + daysAhead) % 7)) daysAhead += 1
  const nextDay = WEEKDAYS[(weekday + daysAhead) % 7]
  return `Opens ${nextDay} ${formatSessionMinute(openMinute)}`
}

export function marketSessionState(definition, nowValue = Date.now()) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue)
  const parts = zonedParts(now, definition.timeZone)
  const minuteOfDay = parts.hour * 60 + parts.minute + (parts.second / 60)
  const open = isWeekday(parts.weekday) && minuteOfDay >= definition.openMinute && minuteOfDay < definition.closeMinute
  const minutesToBoundary = open ? definition.closeMinute - minuteOfDay : null
  const duration = definition.closeMinute - definition.openMinute

  return {
    ...definition,
    open,
    localTime: clockFormatter(definition.timeZone).format(now),
    localWeekday: WEEKDAYS[parts.weekday],
    detail: open
      ? `Closes in ${formatSessionDuration(minutesToBoundary)}`
      : nextOpenLabel(parts.weekday, minuteOfDay, definition.openMinute),
    progressPct: open ? Math.max(0, Math.min(100, ((minuteOfDay - definition.openMinute) / duration) * 100)) : 0,
    minutesToBoundary
  }
}

export function marketSessionsSnapshot(nowValue = Date.now()) {
  const sessions = MARKET_SESSION_DEFINITIONS.map((definition) => marketSessionState(definition, nowValue))
  const london = sessions.find((session) => session.id === 'london')
  const newYork = sessions.find((session) => session.id === 'new-york')
  const overlapActive = Boolean(london?.open && newYork?.open)
  const overlapMinutes = overlapActive ? Math.min(london.minutesToBoundary, newYork.minutesToBoundary) : 0
  const openCount = sessions.filter((session) => session.open).length
  return {
    sessions,
    overlapActive,
    summary: overlapActive
      ? `London + New York overlap · ${formatSessionDuration(overlapMinutes)} left`
      : openCount > 0
        ? `${openCount} regional session${openCount === 1 ? '' : 's'} open`
        : 'All tracked sessions closed'
  }
}

function tradeEntryInstant(trade) {
  let raw = String(trade?.entryTime || trade?.timestamp || '').trim()
  if (!raw) return null

  if (/^\d{1,2}:\d{2}/.test(raw)) {
    const date = String(trade?.timestamp || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    if (!date) return null
    raw = `${date}T${raw}`
  } else if (/^\d{4}-\d{2}-\d{2} /.test(raw)) {
    raw = raw.replace(' ', 'T')
  }

  const instant = new Date(raw)
  return Number.isFinite(instant.getTime()) ? instant : null
}

export function buildMarketSessionPerformance(trades = []) {
  const source = Array.isArray(trades) ? trades : []
  const buckets = new Map(MARKET_SESSION_DEFINITIONS.map((definition) => [definition.id, {
    ...definition,
    tradeCount: 0,
    wins: 0,
    losses: 0,
    breakEvenCount: 0,
    netPnl: 0
  }]))
  let timedCount = 0
  let overlapCount = 0
  let outsideCount = 0

  for (const trade of source) {
    const instant = tradeEntryInstant(trade)
    if (!instant) continue
    timedCount += 1

    const activeSessions = MARKET_SESSION_DEFINITIONS
      .map((definition) => marketSessionState(definition, instant))
      .filter((session) => session.open)
    if (activeSessions.length > 1) overlapCount += 1
    if (!activeSessions.length) outsideCount += 1

    // Regional windows overlap. Historical performance still needs one answer
    // to "which session did I trade?", so attribute the trade to whichever
    // active session opened most recently. This makes the U.S. morning New York
    // instead of double-counting it under both London and New York.
    const primarySession = activeSessions.reduce((latest, session) => (
      !latest || session.progressPct < latest.progressPct ? session : latest
    ), null)

    const outcome = tradeOutcome(trade)
    const pnl = Number(trade?.pnl)
    if (primarySession) {
      const bucket = buckets.get(primarySession.id)
      bucket.tradeCount += 1
      bucket.netPnl += Number.isFinite(pnl) ? pnl : 0
      if (outcome === 'win') bucket.wins += 1
      else if (outcome === 'loss') bucket.losses += 1
      else bucket.breakEvenCount += 1
    }
  }

  const rows = MARKET_SESSION_DEFINITIONS.map((definition) => {
    const bucket = buckets.get(definition.id)
    const decidedCount = bucket.wins + bucket.losses
    return {
      ...bucket,
      decidedCount,
      winRate: decidedCount ? (bucket.wins / decidedCount) * 100 : null
    }
  })

  return {
    rows,
    totalCount: source.length,
    timedCount,
    missingTimeCount: source.length - timedCount,
    overlapCount,
    outsideCount
  }
}

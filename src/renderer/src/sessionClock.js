const DAY_MINUTES = 24 * 60

function parts(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[2])
  const minute = Number(match[3])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { date: match[1], minute: hour * 60 + minute }
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function formatClockMinute(value) {
  const minute = ((Math.round(value) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  const hour24 = Math.floor(minute / 60)
  const mins = minute % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`
}

// Build one session per trading day first. That keeps a high-volume day from
// outweighing every quieter day when the personal window is inferred.
export function inferTradingWindow(trades, minimumDays = 3) {
  const sessions = new Map()
  for (const trade of trades || []) {
    const entry = parts(trade.entryTime || trade.timestamp)
    if (!entry) continue
    const exit = parts(trade.exitTime)
    const validExit = exit && exit.date === entry.date && exit.minute >= entry.minute && exit.minute - entry.minute <= 12 * 60
    const current = sessions.get(entry.date) || { start: entry.minute, end: entry.minute }
    current.start = Math.min(current.start, entry.minute)
    current.end = Math.max(current.end, validExit ? exit.minute : entry.minute)
    sessions.set(entry.date, current)
  }

  const days = [...sessions.values()]
  if (days.length < minimumDays) return null

  const start = median(days.map((day) => day.start))
  let end = median(days.map((day) => day.end))
  end = Math.max(end, start + 90)
  end = Math.min(end, start + 10 * 60, DAY_MINUTES - 1)

  return { start, end, duration: end - start, sampleDays: days.length }
}

export function personalTradingClock(trades, now = new Date()) {
  const window = inferTradingWindow(trades)
  if (!window) return null

  const minute = now.getHours() * 60 + now.getMinutes()
  const openingEnd = window.start + Math.max(30, Math.round(window.duration * 0.25))
  const focusEnd = window.start + Math.round(window.duration * 0.72)
  let phase = 'off'
  if (minute >= window.start - 30 && minute < openingEnd) phase = 'opening'
  else if (minute >= openingEnd && minute < focusEnd) phase = 'focus'
  else if (minute >= focusEnd && minute <= window.end + 30) phase = 'wind-down'

  const labels = {
    opening: { short: 'OPEN', label: 'Opening window' },
    focus: { short: 'FOCUS', label: 'Core session' },
    'wind-down': { short: 'CLOSE', label: 'Wind-down' },
    off: { short: 'OFF', label: 'Off-session' }
  }

  return {
    ...window,
    minute,
    phase,
    phaseShort: labels[phase].short,
    phaseLabel: labels[phase].label,
    timeLabel: now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    windowLabel: `${formatClockMinute(window.start)}–${formatClockMinute(window.end)}`
  }
}

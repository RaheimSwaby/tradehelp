const DAY_MINUTES = 24 * 60
const MAX_TRADE_MINUTES = 12 * 60
const MAX_WINDOW_MINUTES = 10 * 60
const OCCURRENCE_GAP_MINUTES = 3 * 60
const START_CLUSTER_MINUTES = 3 * 60
const PRIOR_WEIGHT = 8

function normalizeMinute(value) {
  return ((Math.round(value) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
}

function parsedDateTime(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const hour = Number(hourText), minute = Number(minuteText)
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null
  const dayIndex = Math.floor(check.getTime() / 86400000)
  return {
    date: `${yearText}-${monthText}-${dayText}`,
    minute: hour * 60 + minute,
    absolute: dayIndex * DAY_MINUTES + hour * 60 + minute
  }
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function circularDistance(a, b) {
  const direct = Math.abs(normalizeMinute(a) - normalizeMinute(b))
  return Math.min(direct, DAY_MINUTES - direct)
}

function circularMean(values) {
  if (!values.length) return 0
  const vectors = values.reduce((acc, value) => {
    const angle = normalizeMinute(value) / DAY_MINUTES * Math.PI * 2
    acc.sin += Math.sin(angle)
    acc.cos += Math.cos(angle)
    return acc
  }, { sin: 0, cos: 0 })
  const angle = Math.atan2(vectors.sin / values.length, vectors.cos / values.length)
  return normalizeMinute(angle / (Math.PI * 2) * DAY_MINUTES)
}

function unwrapNear(value, anchor) {
  const candidates = [value - DAY_MINUTES, value, value + DAY_MINUTES]
  return candidates.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0]
}

export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatClockMinute(value) {
  const minute = normalizeMinute(value)
  const hour24 = Math.floor(minute / 60)
  const mins = minute % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(mins).padStart(2, '0')} ${suffix}`
}

function tradeSpan(trade) {
  // Personal timing must describe when a trade happened, never when it was journaled.
  const entry = parsedDateTime(trade?.entryTime)
  if (!entry) return null
  const exit = parsedDateTime(trade?.exitTime)
  const exitDuration = exit ? exit.absolute - entry.absolute : -1
  const end = exitDuration >= 0 && exitDuration <= MAX_TRADE_MINUTES ? exit.absolute : entry.absolute
  return { day: entry.date, start: entry.absolute, end }
}

function buildOccurrences(trades) {
  const spans = (trades || []).map(tradeSpan).filter(Boolean).sort((a, b) => a.start - b.start)
  const occurrences = []
  for (const span of spans) {
    const current = occurrences[occurrences.length - 1]
    const joinsCurrent = current && span.start - current.end <= OCCURRENCE_GAP_MINUTES && span.start - current.start <= MAX_TRADE_MINUTES
    if (joinsCurrent) {
      current.end = Math.max(current.end, span.end)
    } else {
      occurrences.push({ ...span })
    }
  }
  return occurrences
}

// Infer every recurring personal window instead of forcing morning and evening trades
// into one oversized session. Circular clustering keeps 11:30 PM and 12:30 AM close.
export function inferTradingWindows(trades, minimumDays = 3) {
  const occurrences = buildOccurrences(trades)
  const clusters = []
  for (const occurrence of occurrences) {
    const startMinute = normalizeMinute(occurrence.start)
    let closest = null
    let closestDistance = Infinity
    for (const cluster of clusters) {
      const distance = circularDistance(startMinute, cluster.center)
      if (distance <= START_CLUSTER_MINUTES && distance < closestDistance) {
        closest = cluster
        closestDistance = distance
      }
    }
    if (!closest) {
      closest = { center: startMinute, items: [] }
      clusters.push(closest)
    }
    closest.items.push({ ...occurrence, startMinute })
    closest.center = circularMean(closest.items.map((item) => item.startMinute))
  }

  return clusters
    .map((cluster) => {
      const sampleDays = new Set(cluster.items.map((item) => item.day)).size
      if (sampleDays < minimumDays) return null
      const alignedStarts = cluster.items.map((item) => unwrapNear(item.startMinute, cluster.center))
      const alignedEnds = cluster.items.map((item, index) => alignedStarts[index] + Math.max(0, item.end - item.start))
      const start = normalizeMinute(median(alignedStarts))
      const medianEnd = median(alignedEnds)
      const duration = Math.min(MAX_WINDOW_MINUTES, Math.max(90, medianEnd - median(alignedStarts)))
      const end = start + duration
      return {
        id: `${start}-${end}`,
        start,
        end,
        duration,
        overnight: end >= DAY_MINUTES,
        sampleDays,
        sampleSessions: cluster.items.length
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

// Backward-compatible primary window for consumers that only need one schedule.
export function inferTradingWindow(trades, minimumDays = 3) {
  return [...inferTradingWindows(trades, minimumDays)]
    .sort((a, b) => b.sampleDays - a.sampleDays || b.sampleSessions - a.sampleSessions || a.start - b.start)[0] || null
}

function hourLabel(hour) {
  const h = normalizeMinute(Math.round(hour) * 60) / 60
  return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`
}

function legacyHourSummaries(stats, baselineRate) {
  const totals = {}
  for (const [key, cell] of Object.entries(stats.byHourDay || {})) {
    const hour = String(key).split('-')[1]
    if (!hour) continue
    if (!totals[hour]) totals[hour] = { k: hour, wins: 0, total: 0, pnl: 0, pnlKnown: false }
    totals[hour].wins += Number(cell?.wins) || 0
    totals[hour].total += Number(cell?.total) || 0
    if (Number.isFinite(Number(cell?.pnl))) { totals[hour].pnl += Number(cell.pnl); totals[hour].pnlKnown = true }
  }
  return Object.values(totals).map((item) => ({
    ...item,
    wr: item.total ? (item.wins / item.total) * 100 : 0,
    wrAdjusted: ((item.wins + baselineRate / 100 * PRIOR_WEIGHT) / (item.total + PRIOR_WEIGHT)) * 100,
    expectancy: item.total ? item.pnl / item.total : 0
  }))
}

// Only the globally strongest or weakest well-sampled hour can trigger a cue.
// Confidence-adjusted win rate prevents a tiny perfect sample from outranking history.
export function sessionEdgeCue(stats = {}, now = new Date(), options = {}) {
  const minSample = options.minSample ?? stats.timingMinSample ?? 8
  const edge = options.edge ?? 8
  const lookaheadMin = options.lookaheadMin ?? 12
  const baseline = Number.isFinite(Number(stats.timingWinRate)) ? Number(stats.timingWinRate) : Number(stats.winRate)
  if (!Number.isFinite(baseline)) return null

  const source = Array.isArray(stats.byHour) && stats.byHour.some((item) => Number.isFinite(Number(item.wrAdjusted)))
    ? stats.byHour.map((item) => ({ ...item, pnlKnown: true }))
    : legacyHourSummaries(stats, baseline)
  const eligible = source.filter((item) => Number(item.total) >= minSample)
  if (eligible.length < 2) return null

  const strong = eligible
    .filter((item) => !item.pnlKnown || Number(item.expectancy) > 0)
    .sort((a, b) => Number(b.wrAdjusted) - Number(a.wrAdjusted) || Number(b.expectancy) - Number(a.expectancy))[0]
  const weak = eligible
    .filter((item) => !item.pnlKnown || Number(item.expectancy) < 0)
    .sort((a, b) => Number(a.wrAdjusted) - Number(b.wrAdjusted) || Number(a.expectancy) - Number(b.expectancy))[0]

  const entering = now.getMinutes() >= 60 - lookaheadMin
  const hourNum = entering ? (now.getHours() + 1) % 24 : now.getHours()
  const hh = String(hourNum).padStart(2, '0')
  let tone = null
  let cell = null
  if (strong?.k === hh && Number(strong.wrAdjusted) - baseline >= edge) { tone = 'strong'; cell = strong }
  else if (weak?.k === hh && baseline - Number(weak.wrAdjusted) >= edge) { tone = 'weak'; cell = weak }
  if (!tone || !cell) return null

  const range = `${hourLabel(hourNum)}–${hourLabel(hourNum + 1)}`
  const rawRate = Math.round(Number(cell.wr))
  const adjustedRate = Math.round(Number(cell.wrAdjusted))
  const baseRate = Math.round(baseline)
  return {
    tone,
    hour: hh,
    wr: rawRate,
    adjustedWr: adjustedRate,
    baseline: baseRate,
    sample: Number(cell.total),
    entering,
    range,
    headline: tone === 'strong'
      ? (entering ? 'Your strongest hour is next' : "You're in your strongest hour")
      : (entering ? 'Heads up — your weakest hour is next' : "You're in your weakest hour"),
    detail: tone === 'strong'
      ? `${rawRate}% wins across ${cell.total} trades; the sample-adjusted read is ${adjustedRate}%, above your ${baseRate}% average. Stay selective — the clock is context, not a signal.`
      : `${rawRate}% wins across ${cell.total} trades; the sample-adjusted read is ${adjustedRate}%, below your ${baseRate}% average. Demand your cleanest setup or sit it out.`
  }
}

function alignMinuteToWindow(minute, window) {
  const candidates = [minute - DAY_MINUTES, minute, minute + DAY_MINUTES]
  const distance = (candidate) => candidate < window.start - 30
    ? window.start - 30 - candidate
    : candidate > window.end + 30 ? candidate - window.end - 30 : 0
  return candidates.sort((a, b) => distance(a) - distance(b))[0]
}

function phaseFor(window, minute) {
  const openingEnd = window.start + Math.max(30, Math.round(window.duration * 0.25))
  const focusEnd = window.start + Math.round(window.duration * 0.72)
  if (minute >= window.start - 30 && minute < openingEnd) return 'opening'
  if (minute >= openingEnd && minute < focusEnd) return 'focus'
  if (minute >= focusEnd && minute <= window.end + 30) return 'wind-down'
  return 'off'
}

export function personalTradingClock(trades, now = new Date()) {
  const windows = inferTradingWindows(trades)
  if (!windows.length) return null

  const clockMinute = now.getHours() * 60 + now.getMinutes()
  const active = windows
    .map((window) => {
      const alignedMinute = alignMinuteToWindow(clockMinute, window)
      return { window, alignedMinute, phase: phaseFor(window, alignedMinute) }
    })
    .find((candidate) => candidate.phase !== 'off')
  const nextWindow = [...windows].sort((a, b) => ((a.start - clockMinute + DAY_MINUTES) % DAY_MINUTES) - ((b.start - clockMinute + DAY_MINUTES) % DAY_MINUTES))[0]
  const selected = active?.window || nextWindow
  const alignedMinute = active?.alignedMinute ?? alignMinuteToWindow(clockMinute, selected)
  const phase = active?.phase || 'off'
  const labels = {
    opening: { short: 'OPEN', label: 'Opening window' },
    focus: { short: 'FOCUS', label: 'Core session' },
    'wind-down': { short: 'CLOSE', label: 'Wind-down' },
    off: { short: 'OFF', label: 'Off-session' }
  }

  return {
    ...selected,
    windows,
    windowCount: windows.length,
    minute: alignedMinute,
    phase,
    phaseShort: labels[phase].short,
    phaseLabel: labels[phase].label,
    timeLabel: now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    windowLabel: `${formatClockMinute(selected.start)}–${formatClockMinute(selected.end)}`
  }
}

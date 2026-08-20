export const BIAS_STATES = Object.freeze(['bullish', 'bearish', 'neutral', 'unavailable'])
export const CME_BIAS_INSTRUMENTS = Object.freeze(['MNQ', 'MES', 'ES', 'NQ', 'GC', 'MGC', 'CL', 'RTY'])
export const FOREX_BIAS_INSTRUMENTS = Object.freeze(['EURUSD', 'GBPUSD', 'USDJPY'])
export const BIAS_INSTRUMENTS = Object.freeze([...CME_BIAS_INSTRUMENTS, ...FOREX_BIAS_INSTRUMENTS])

export const BIAS_FACTOR_WEIGHTS = Object.freeze({
  trend: 35,
  structure: 25,
  vwap: 20,
  momentum: 10,
  participation: 10
})

const MINUTE_MS = 60_000
const MIN_BARS = 120
const MAX_BAR_AGE_MS = 2 * MINUTE_MS
const EASTERN = 'America/New_York'

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function barTime(value) {
  if (Number.isFinite(Number(value))) {
    const number = Number(value)
    return number > 10_000_000_000 ? Math.floor(number / 1000) : Math.floor(number)
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

export function normalizeBiasBars(input = []) {
  const byTime = new Map()
  for (const raw of Array.isArray(input) ? input : []) {
    const time = barTime(raw?.time ?? raw?.ts_event ?? raw?.hd?.ts_event)
    const open = finite(raw?.open)
    const high = finite(raw?.high)
    const low = finite(raw?.low)
    const close = finite(raw?.close)
    const volume = finite(raw?.volume)
    if (time == null || [open, high, low, close].some((value) => value == null)) continue
    if (high < low || open < low || open > high || close < low || close > high) continue
    byTime.set(time, { time, open, high, low, close, volume: volume == null || volume < 0 ? null : volume })
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

function ema(values, period) {
  if (!values.length) return []
  const multiplier = 2 / (period + 1)
  const output = [values[0]]
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier))
  }
  return output
}

function directionFor(score) {
  return score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral'
}

function factor(id, label, score, detail, extra = {}) {
  return {
    id,
    label,
    weight: BIAS_FACTOR_WEIGHTS[id],
    score,
    direction: directionFor(score),
    detail,
    ...extra
  }
}

function easternParts(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value))
  const result = {}
  for (const part of parts) if (part.type !== 'literal') result[part.type] = Number(part.value)
  return result
}

function wallTimeToEpoch(parts) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute || 0, parts.second || 0)
  let guess = target
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seen = easternParts(guess)
    const observed = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second)
    guess += target - observed
  }
  return guess
}

function sessionStartAtHour(now, hour) {
  const local = easternParts(now)
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day))
  if (local.hour < hour) date.setUTCDate(date.getUTCDate() - 1)
  return wallTimeToEpoch({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour,
    minute: 0,
    second: 0
  })
}

/** CME's next trading day starts at 18:00 New York time. */
export function cmeSessionStart(now = Date.now()) {
  return sessionStartAtHour(now, 18)
}

/** Spot forex uses the 17:00 New York rollover as its session boundary. */
export function forexSessionStart(now = Date.now()) {
  return sessionStartAtHour(now, 17)
}

function isForexInstrument(instrument) {
  return FOREX_BIAS_INSTRUMENTS.includes(String(instrument || '').toUpperCase())
}

function marketSessionStart(instrument, now) {
  return isForexInstrument(instrument) ? forexSessionStart(now) : cmeSessionStart(now)
}

function trendFactor(bars) {
  const closes = bars.map((bar) => bar.close)
  const fast = ema(closes, 20)
  const slow = ema(closes, 50)
  const last = closes.length - 1
  const lookback = Math.max(0, last - 5)
  const fastUp = fast[last] > fast[lookback]
  const slowUp = slow[last] > slow[lookback]
  const fastDown = fast[last] < fast[lookback]
  const slowDown = slow[last] < slow[lookback]
  const bullish = closes[last] > fast[last] && fast[last] > slow[last] && fastUp && slowUp
  const bearish = closes[last] < fast[last] && fast[last] < slow[last] && fastDown && slowDown
  const score = bullish ? BIAS_FACTOR_WEIGHTS.trend : bearish ? -BIAS_FACTOR_WEIGHTS.trend : 0
  const relation = bullish ? 'Price and both EMA slopes are rising.' : bearish ? 'Price and both EMA slopes are falling.' : 'Price and EMA slopes are not aligned.'
  return factor('trend', '2H trend', score, relation, { fastEma: fast[last], slowEma: slow[last] })
}

function confirmedSwings(bars, radius = 2) {
  const highs = []
  const lows = []
  for (let index = radius; index < bars.length - radius; index += 1) {
    const window = bars.slice(index - radius, index + radius + 1)
    if (window.every((bar, item) => item === radius || bars[index].high > bar.high)) highs.push(bars[index])
    if (window.every((bar, item) => item === radius || bars[index].low < bar.low)) lows.push(bars[index])
  }
  return { highs, lows }
}

function structureFactor(bars) {
  const { highs, lows } = confirmedSwings(bars.slice(-180))
  const highPair = highs.slice(-2)
  const lowPair = lows.slice(-2)
  const bullish = highPair.length === 2 && lowPair.length === 2 && highPair[1].high > highPair[0].high && lowPair[1].low > lowPair[0].low
  const bearish = highPair.length === 2 && lowPair.length === 2 && highPair[1].high < highPair[0].high && lowPair[1].low < lowPair[0].low
  const score = bullish ? BIAS_FACTOR_WEIGHTS.structure : bearish ? -BIAS_FACTOR_WEIGHTS.structure : 0
  const detail = bullish
    ? 'The last confirmed swing high and swing low are both higher.'
    : bearish
      ? 'The last confirmed swing high and swing low are both lower.'
      : highPair.length < 2 || lowPair.length < 2
        ? 'Not enough confirmed swings yet.'
        : 'The latest swing sequence is mixed.'
  return factor('structure', 'Market structure', score, detail, {
    latestSwingHigh: highPair.at(-1)?.high ?? null,
    latestSwingLow: lowPair.at(-1)?.low ?? null
  })
}

function vwapFactor(bars, now, instrument) {
  const forex = isForexInstrument(instrument)
  const sessionStart = Math.floor(marketSessionStart(instrument, now) / 1000)
  const session = bars.filter((bar) => bar.time >= sessionStart && bar.volume != null)
  const source = session.length ? session : bars.filter((bar) => bar.volume != null).slice(-120)
  const totals = source.reduce((result, bar) => {
    const typical = (bar.high + bar.low + bar.close) / 3
    result.value += typical * bar.volume
    result.volume += bar.volume
    return result
  }, { value: 0, volume: 0 })
  const label = forex ? 'VWAP proxy' : 'Session VWAP'
  if (!(totals.volume > 0)) return factor('vwap', label, 0, `${forex ? 'Tick activity' : 'Volume'} is missing, so VWAP cannot be confirmed.`, { vwap: null })
  const vwap = totals.value / totals.volume
  const close = bars.at(-1).close
  const distancePct = ((close - vwap) / vwap) * 100
  const score = Math.abs(distancePct) < 0.03 ? 0 : distancePct > 0 ? BIAS_FACTOR_WEIGHTS.vwap : -BIAS_FACTOR_WEIGHTS.vwap
  const detail = score > 0 ? `Price is ${Math.abs(distancePct).toFixed(2)}% above session VWAP.` : score < 0 ? `Price is ${Math.abs(distancePct).toFixed(2)}% below session VWAP.` : 'Price is sitting near session VWAP.'
  return factor('vwap', label, score, forex ? `${detail} OANDA tick activity supplies the weighting.` : detail, { vwap, distancePct })
}

function momentumFactor(bars) {
  const last = bars.at(-1)
  const anchor = bars.at(-16) || bars[0]
  const rocPct = ((last.close - anchor.close) / anchor.close) * 100
  const avg = (rows) => rows.reduce((sum, bar) => sum + (bar.high - bar.low), 0) / Math.max(1, rows.length)
  const recentRange = avg(bars.slice(-5))
  const baselineRange = avg(bars.slice(-25, -5))
  const expansion = baselineRange > 0 ? recentRange / baselineRange : 1
  let score = 0
  if (Math.abs(rocPct) >= 0.05) score = (rocPct > 0 ? 1 : -1) * (expansion >= 1 ? 10 : 5)
  const detail = score === 0
    ? `15-minute change is ${rocPct.toFixed(2)}%; momentum is muted.`
    : `${rocPct > 0 ? 'Positive' : 'Negative'} 15-minute momentum with ${expansion >= 1 ? 'expanding' : 'contracting'} range.`
  return factor('momentum', 'Momentum', score, detail, { rocPct, rangeExpansion: expansion })
}

function sessionDescriptor(timeMs, instrument) {
  const start = marketSessionStart(instrument, timeMs)
  return { start, minute: Math.floor((timeMs - start) / MINUTE_MS) }
}

function participationFactor(bars, instrument) {
  const forex = isForexInstrument(instrument)
  const label = forex ? 'Tick activity' : 'Participation'
  const withVolume = bars.filter((bar) => bar.volume != null)
  if (withVolume.length < 30) return factor('participation', label, 0, `${forex ? 'Tick activity' : 'Volume'} history is not available yet.`, { ratio: null, baselineSessions: 0 })
  const latest = withVolume.at(-1)
  const current = sessionDescriptor(latest.time * 1000, instrument)
  const recent = withVolume.filter((bar) => bar.time * 1000 >= latest.time * 1000 - 4 * MINUTE_MS)
  const currentAverage = recent.reduce((sum, bar) => sum + bar.volume, 0) / Math.max(1, recent.length)
  const baselines = new Map()
  for (const bar of withVolume) {
    const descriptor = sessionDescriptor(bar.time * 1000, instrument)
    if (descriptor.start === current.start || Math.abs(descriptor.minute - current.minute) > 2) continue
    if (!baselines.has(descriptor.start)) baselines.set(descriptor.start, [])
    baselines.get(descriptor.start).push(bar.volume)
  }
  const sessionAverages = [...baselines.values()].map((values) => values.reduce((sum, value) => sum + value, 0) / values.length)
  if (sessionAverages.length < 2) {
    return factor('participation', label, 0, `Building a time-of-day ${forex ? 'tick-activity' : 'volume'} baseline from prior sessions.`, { ratio: null, baselineSessions: sessionAverages.length })
  }
  const baseline = sessionAverages.reduce((sum, value) => sum + value, 0) / sessionAverages.length
  const ratio = baseline > 0 ? currentAverage / baseline : 1
  const direction = bars.at(-1).close >= bars.at(-6).close ? 1 : -1
  const score = ratio >= 1.2 ? direction * BIAS_FACTOR_WEIGHTS.participation : ratio <= 0.65 ? 0 : direction * 5
  const noun = forex ? 'Tick activity' : 'Volume'
  const detail = ratio >= 1.2 ? `${noun} is ${ratio.toFixed(1)}× its time-of-day baseline.` : ratio <= 0.65 ? `${noun} is only ${ratio.toFixed(1)}× its time-of-day baseline.` : `${noun} is ${ratio.toFixed(1)}× its time-of-day baseline.`
  return factor('participation', label, score, detail, { ratio, baselineSessions: sessionAverages.length })
}

function unavailable(instrument, source, reason, bars = []) {
  const last = bars.at(-1)
  return {
    instrument,
    source,
    state: 'unavailable',
    score: null,
    reason,
    factors: [],
    lastBarAt: last ? last.time * 1000 : null,
    updatedAt: Date.now(),
    invalidation: 'No bias is published until the data checks pass.'
  }
}

export function computeDirectionalBias({ bars = [], instrument = '', source = 'Local bars', now = Date.now() } = {}) {
  const normalized = normalizeBiasBars(bars)
  const symbol = String(instrument || '').trim().toUpperCase()
  if (normalized.length < MIN_BARS) return unavailable(symbol, source, `Need at least ${MIN_BARS} one-minute bars; ${normalized.length} are available.`, normalized)
  const last = normalized.at(-1)
  const ageMs = Math.max(0, Number(now) - last.time * 1000)
  if (ageMs > MAX_BAR_AGE_MS) return unavailable(symbol, source, `The latest bar is ${Math.ceil(ageMs / MINUTE_MS)} minutes old.`, normalized)
  const recent = normalized.slice(-Math.max(MIN_BARS, 180))
  const gaps = recent.slice(1).map((bar, index) => bar.time - recent[index].time).sort((a, b) => a - b)
  const medianGap = gaps[Math.floor(gaps.length / 2)] || 60
  if (medianGap > 90) return unavailable(symbol, source, 'The stored series is not one-minute data.', normalized)

  const factors = [
    trendFactor(recent),
    structureFactor(recent),
    vwapFactor(normalized, now, symbol),
    momentumFactor(recent),
    participationFactor(normalized, symbol)
  ]
  const score = Math.max(-100, Math.min(100, factors.reduce((sum, item) => sum + item.score, 0)))
  const state = score >= 20 ? 'bullish' : score <= -20 ? 'bearish' : 'neutral'
  const structure = factors.find((item) => item.id === 'structure')
  const vwap = factors.find((item) => item.id === 'vwap')
  const level = state === 'bullish'
    ? structure.latestSwingLow ?? vwap.vwap
    : state === 'bearish'
      ? structure.latestSwingHigh ?? vwap.vwap
      : null
  const invalidation = state === 'neutral'
    ? 'A score outside the neutral band requires trend and structure to align.'
    : level == null
      ? 'Bias changes when the weighted score returns to the neutral band.'
      : `Bias changes if a confirmed one-minute close crosses ${Number(level).toLocaleString(undefined, { maximumFractionDigits: 4 })}.`

  return {
    instrument: symbol,
    source,
    state,
    score,
    reason: '',
    factors,
    lastBarAt: last.time * 1000,
    updatedAt: Number(now),
    invalidation
  }
}

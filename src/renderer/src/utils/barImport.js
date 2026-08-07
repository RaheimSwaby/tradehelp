/**
 * Imports OHLC bars exported from a broker platform, starting with NinjaTrader 8.
 *
 * This exists so a trade can be reviewed against real candles without TradeHelp
 * buying or redistributing market data: the trader exports the history they
 * already pay their platform for, and it stays on their machine.
 *
 * NinjaTrader 8 writes semicolon-delimited rows like
 *   20260805 143000;5200.25;5202.00;5199.75;5201.50;1423
 * but the delimiter, the timestamp layout and the presence of a volume column
 * all vary between versions, instruments and period types, so the format is
 * detected from the file rather than assumed.
 */

const DELIMITERS = [';', ',', '\t', '|']

/** Picks the delimiter that yields the most consistent column count. */
function detectDelimiter(lines) {
  let best = { delimiter: ';', score: -1, columns: 0 }

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((l) => l.split(delimiter).length)
    const columns = counts[0]
    if (columns < 5) continue
    const consistent = counts.filter((c) => c === columns).length
    const score = consistent + columns / 100
    if (score > best.score) best = { delimiter, score, columns }
  }

  return best
}

/**
 * Which clock the exported timestamps are written in.
 *
 * NinjaTrader 8 exports historical data in UTC — confirmed against a real MES
 * export, where the daily CME halt begins after the 21:00 bar (16:00 Chicago)
 * and the week opens Sunday 22:01 (17:00 Chicago). Reading those digits as
 * local wall-clock time parses without a single error and silently places every
 * candle hours away from the trade it is meant to explain, so the source clock
 * is explicit rather than assumed.
 */
export const SOURCE_ZONES = {
  utc: 'utc',
  local: 'local'
}

/**
 * Offsets offered at import.
 *
 * MetaTrader is the reason the fixed offsets exist: it writes broker *server*
 * time, commonly UTC+2 or +3, with nothing in the file to say so. Such a file
 * parses perfectly and lands every candle hours from the trade, so the trader
 * has to be able to state the clock.
 */
export const SOURCE_ZONE_OPTIONS = [
  { id: 'utc', label: 'UTC — NinjaTrader, TradingView', minutes: 0 },
  { id: 'local', label: "This computer's time zone", minutes: null },
  ...[-10, -8, -7, -6, -5, -4, -3, 1, 2, 3, 4, 5, 8, 9, 10]
    .map((h) => ({ id: `utc${h > 0 ? '+' : ''}${h}`, label: `UTC${h > 0 ? '+' : ''}${h}${[2, 3].includes(h) ? ' — typical MetaTrader server' : ''}`, minutes: h * 60 }))
]

/** Turns a dropdown id into something parseBarTimestamp understands. */
export function resolveSourceZone(id) {
  if (id === SOURCE_ZONES.local) return SOURCE_ZONES.local
  const found = SOURCE_ZONE_OPTIONS.find((o) => o.id === id)
  return found && typeof found.minutes === 'number' ? found.minutes : SOURCE_ZONES.utc
}

/**
 * Parses the timestamp forms these exports use, returning a true UNIX epoch.
 *
 * Trades are journalled in local wall-clock time and converted to real epochs
 * on the way in, so bars must be too — then both render through the same local
 * formatter and line up.
 */
export function parseBarTimestamp(raw, sourceZone = SOURCE_ZONES.utc) {
  const s = String(raw || '').trim()
  if (!s) return null

  const build = (y, mo, d, h, mi, sec) => {
    if (sourceZone === SOURCE_ZONES.local) {
      const ms = new Date(y, mo - 1, d, h, mi, sec).getTime()
      return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
    }
    const ms = Date.UTC(y, mo - 1, d, h, mi, sec)
    if (Number.isNaN(ms)) return null
    // A fixed offset means these digits are wall clock in that zone.
    const offsetMinutes = typeof sourceZone === 'number' ? sourceZone : 0
    return Math.floor(ms / 1000) - offsetMinutes * 60
  }

  // Plain epoch, as some platforms and API dumps emit. 10 digits is seconds,
  // 13 is milliseconds; 8 digits is a YYYYMMDD date, handled below.
  if (/^\d{10}$/.test(s)) return Number(s)
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000)

  // 20260805 143000 / 20260805 1430 / 20260805
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})(?:[ T]?(\d{2})(\d{2})(\d{2})?)?$/)
  if (compact) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0'] = compact
    return build(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec))
  }

  // 2026-08-05 14:30:00 / 2026/08/05 14:30 / 2026.08.05 14:30 (MetaTrader),
  // optionally carrying an explicit offset (TradingView writes -04:00).
  const dashed = s.match(
    /^(\d{4})[-/.](\d{2})[-/.](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?/
  )
  if (dashed) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0', zone] = dashed

    // An offset in the file is authoritative — it states the instant outright,
    // so honouring it beats any assumption about the source clock. Ignoring it
    // parsed cleanly and put every bar hours from the trade.
    if (zone) {
      const offsetMinutes =
        zone === 'Z'
          ? 0
          : (zone[0] === '-' ? -1 : 1) *
            (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)))
      return Math.floor(
        Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) / 1000
      ) - offsetMinutes * 60
    }

    return build(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec))
  }

  return null
}

function parsePrice(raw) {
  if (raw === undefined || raw === null) return NaN
  // Some locales export decimal commas; a lone comma between digits is a point.
  const cleaned = String(raw).trim().replace(/\s/g, '').replace(/^(\d+),(\d+)$/, '$1.$2')
  return Number(cleaned)
}

/**
 * Parses an exported bar file into chart-ready OHLC data.
 *
 * Returns the bars it could read plus a per-line account of what it could not,
 * rather than throwing: a single malformed row in a long export should not cost
 * the trader the rest of the file.
 */
export function parseBarExport(text, { maxErrors = 20, sourceZone = SOURCE_ZONES.utc } = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { bars: [], errors: [{ line: 0, reason: 'File is empty' }], delimiter: null, hasVolume: false }
  }

  // A header row is optional in these exports; drop it if the first field is
  // not a timestamp.
  const sample = lines.slice(0, 20)
  const { delimiter } = detectDelimiter(sample)
  const body = parseBarTimestamp(lines[0].split(delimiter)[0].trim(), sourceZone) === null ? lines.slice(1) : lines

  const bars = []
  const errors = []
  let hasVolume = false

  body.forEach((line, i) => {
    let parts = line.split(delimiter)

    // Sierra Chart and similar put the date and the time in separate columns;
    // fold them back together before reading prices.
    if (parts.length >= 6 && /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(parts[1] || '')) {
      parts = [`${parts[0].trim()} ${parts[1].trim()}`, ...parts.slice(2)]
    }

    if (parts.length < 5) {
      if (errors.length < maxErrors) errors.push({ line: i + 1, reason: `Expected at least 5 columns, found ${parts.length}` })
      return
    }

    const time = parseBarTimestamp(String(parts[0]).trim(), sourceZone)
    if (time === null) {
      if (errors.length < maxErrors) errors.push({ line: i + 1, reason: `Unrecognised timestamp "${parts[0]}"` })
      return
    }

    const [open, high, low, close] = parts.slice(1, 5).map(parsePrice)
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) {
      if (errors.length < maxErrors) errors.push({ line: i + 1, reason: 'Non-numeric or non-positive OHLC value' })
      return
    }
    if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) {
      if (errors.length < maxErrors) errors.push({ line: i + 1, reason: 'Impossible bar: high/low do not contain open/close' })
      return
    }

    const bar = { time, open, high, low, close }
    const volume = parsePrice(parts[5])
    if (Number.isFinite(volume)) {
      bar.volume = volume
      hasVolume = true
    }
    bars.push(bar)
  })

  // Charts require strictly ascending, unique times. Exports are usually sorted
  // already, but a duplicated timestamp would make the series throw.
  bars.sort((a, b) => a.time - b.time)
  const deduped = bars.filter((b, i) => i === 0 || b.time !== bars[i - 1].time)
  const duplicates = bars.length - deduped.length
  if (duplicates > 0) errors.push({ line: null, reason: `Dropped ${duplicates} duplicate timestamp(s)` })

  return { bars: deduped, errors, delimiter, hasVolume }
}

/**
 * Narrows an imported series to the window around a trade, so the chart shows
 * the execution in context instead of the whole export.
 */
export function selectBarsForTrade(bars, entryTime, exitTime, padding = 30 * 60) {
  if (!Array.isArray(bars) || bars.length === 0) return []
  const from = entryTime - padding
  const to = (exitTime || entryTime) + padding
  return bars.filter((b) => b.time >= from && b.time <= to)
}

/**
 * True when the import actually covers the trade. An export for the wrong day
 * or the wrong contract parses perfectly and still tells the trader nothing, so
 * this is what the chart should gate on before showing candles.
 */
export function barsCoverTrade(bars, entryTime, exitTime) {
  if (!Array.isArray(bars) || bars.length === 0) return false
  const first = bars[0].time
  const last = bars[bars.length - 1].time
  return first <= entryTime && last >= (exitTime || entryTime)
}

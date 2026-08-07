/**
 * Utilities for formatting TradeHelp trade records into TradingView Lightweight Charts format.
 * Includes broker symbol parsing, asset classification, and execution-path construction.
 */

// Keyed by contract root. Matched exactly, never by prefix: prefix matching sent
// CLF (Cleveland-Cliffs) to crude oil and NGD (New Gold) to natural gas.
const FUTURES_ROOTS = {
  NQ: { class: 'FUTURES_INDEX', tick: 0.25, name: 'E-mini Nasdaq', tv: 'CME_MINI:NQ1!' },
  MNQ: { class: 'FUTURES_INDEX', tick: 0.25, name: 'Micro Nasdaq', tv: 'CME_MINI:MNQ1!' },
  ES: { class: 'FUTURES_INDEX', tick: 0.25, name: 'E-mini S&P 500', tv: 'CME_MINI:ES1!' },
  MES: { class: 'FUTURES_INDEX', tick: 0.25, name: 'Micro S&P 500', tv: 'CME_MINI:MES1!' },
  YM: { class: 'FUTURES_INDEX', tick: 1.0, name: 'E-mini Dow', tv: 'CBOT_MINI:YM1!' },
  MYM: { class: 'FUTURES_INDEX', tick: 1.0, name: 'Micro Dow', tv: 'CBOT_MINI:MYM1!' },
  RTY: { class: 'FUTURES_INDEX', tick: 0.1, name: 'E-mini Russell', tv: 'CME_MINI:RTY1!' },
  M2K: { class: 'FUTURES_INDEX', tick: 0.1, name: 'Micro Russell', tv: 'CME_MINI:M2K1!' },

  GC: { class: 'FUTURES_COMMODITY', tick: 0.1, name: 'Gold', tv: 'COMEX:GC1!' },
  MGC: { class: 'FUTURES_COMMODITY', tick: 0.1, name: 'Micro Gold', tv: 'COMEX:MGC1!' },
  SI: { class: 'FUTURES_COMMODITY', tick: 0.005, name: 'Silver', tv: 'COMEX:SI1!' },
  SIL: { class: 'FUTURES_COMMODITY', tick: 0.005, name: 'Micro Silver', tv: 'COMEX:SIL1!' },
  HG: { class: 'FUTURES_COMMODITY', tick: 0.0005, name: 'Copper', tv: 'COMEX:HG1!' },
  CL: { class: 'FUTURES_COMMODITY', tick: 0.01, name: 'Crude Oil', tv: 'NYMEX:CL1!' },
  MCL: { class: 'FUTURES_COMMODITY', tick: 0.01, name: 'Micro Crude Oil', tv: 'NYMEX:MCL1!' },
  NG: { class: 'FUTURES_COMMODITY', tick: 0.001, name: 'Natural Gas', tv: 'NYMEX:NG1!' },

  ZB: { class: 'FUTURES_BOND', tick: 0.03125, name: '30Y T-Bond', tv: 'CBOT:ZB1!' },
  ZN: { class: 'FUTURES_BOND', tick: 0.015625, name: '10Y T-Note', tv: 'CBOT:ZN1!' },
  ZF: { class: 'FUTURES_BOND', tick: 0.0078125, name: '5Y T-Note', tv: 'CBOT:ZF1!' },
  ZT: { class: 'FUTURES_BOND', tick: 0.00390625, name: '2Y T-Note', tv: 'CBOT:ZT1!' },

  '6E': { class: 'FOREX', tick: 0.0001, name: 'EUR/USD', tv: 'FX:EURUSD' },
  '6B': { class: 'FOREX', tick: 0.0001, name: 'GBP/USD', tv: 'FX:GBPUSD' },
  '6J': { class: 'FOREX', tick: 0.000001, name: 'USD/JPY', tv: 'FX:USDJPY' },
  '6A': { class: 'FOREX', tick: 0.0001, name: 'AUD/USD', tv: 'FX:AUDUSD' },
  '6C': { class: 'FOREX', tick: 0.0001, name: 'USD/CAD', tv: 'FX:USDCAD' }
}

// Names people type that are not contract roots.
const SYMBOL_ALIASES = {
  NAS100: 'NQ', US100: 'NQ', ENQ: 'NQ',
  US500: 'ES', SPX: 'ES',
  US30: 'YM', DOW: 'YM',
  US2000: 'RTY', RUSSELL: 'RTY',
  GOLD: 'GC', XAUUSD: 'GC', 'XAU/USD': 'GC',
  SILVER: 'SI', XAGUSD: 'SI',
  COPPER: 'HG',
  OIL: 'CL', CRUDE: 'CL', WTI: 'CL',
  NATGAS: 'NG'
}

const FOREX_PAIRS = {
  EURUSD: { tick: 0.0001, tv: 'FX:EURUSD' },
  GBPUSD: { tick: 0.0001, tv: 'FX:GBPUSD' },
  USDJPY: { tick: 0.001, tv: 'FX:USDJPY' },
  AUDUSD: { tick: 0.0001, tv: 'FX:AUDUSD' },
  USDCAD: { tick: 0.0001, tv: 'FX:USDCAD' },
  USDCHF: { tick: 0.0001, tv: 'FX:USDCHF' },
  NZDUSD: { tick: 0.0001, tv: 'FX:NZDUSD' },
  EURJPY: { tick: 0.001, tv: 'FX:EURJPY' },
  GBPJPY: { tick: 0.001, tv: 'FX:GBPJPY' }
}

const CRYPTO = {
  BTC: { tick: 1.0, name: 'Bitcoin', tv: 'BINANCE:BTCUSDT' },
  BTCUSD: { tick: 1.0, name: 'Bitcoin', tv: 'BINANCE:BTCUSDT' },
  BTCUSDT: { tick: 1.0, name: 'Bitcoin', tv: 'BINANCE:BTCUSDT' },
  BITCOIN: { tick: 1.0, name: 'Bitcoin', tv: 'BINANCE:BTCUSDT' },
  ETH: { tick: 0.1, name: 'Ethereum', tv: 'BINANCE:ETHUSDT' },
  ETHUSD: { tick: 0.1, name: 'Ethereum', tv: 'BINANCE:ETHUSDT' },
  ETHUSDT: { tick: 0.1, name: 'Ethereum', tv: 'BINANCE:ETHUSDT' },
  SOL: { tick: 0.01, name: 'Solana', tv: 'BINANCE:SOLUSDT' },
  SOLUSD: { tick: 0.01, name: 'Solana', tv: 'BINANCE:SOLUSDT' },
  SOLUSDT: { tick: 0.01, name: 'Solana', tv: 'BINANCE:SOLUSDT' }
}

/**
 * Strips the contract decoration brokers add, leaving the root.
 * Handles "/ES", "ES_F", "ES.CME", "NQ 03-25", "NQ-03-25", "ES1!", "ESH5", "ESZ2025".
 */
function stripContractDecoration(sym) {
  let s = sym.replace(/^\//, '').trim()
  s = s.split(/\s+/)[0] // "NQ 03-25" -> "NQ"
  s = s.replace(/_(F|C|FUT|CONT)$/, '') // "ES_F" -> "ES"
  s = s.replace(/\.(CME|CBOT|COMEX|NYMEX|GLOBEX|CME_MINI)$/, '') // "ES.CME" -> "ES"
  s = s.replace(/\d+!$/, '') // "ES1!" -> "ES"
  s = s.replace(/-\d{1,2}-\d{2,4}$/, '') // "NQ-03-25" -> "NQ"
  return s
}

/**
 * Resolves a decorated symbol to a known futures root, or null.
 * The month-code strip only applies when it uncovers a root we recognise, so a
 * stock ticker that happens to end in a letter+digit is left alone.
 */
function resolveFuturesRoot(s) {
  if (FUTURES_ROOTS[s]) return s
  if (SYMBOL_ALIASES[s] && FUTURES_ROOTS[SYMBOL_ALIASES[s]]) return SYMBOL_ALIASES[s]

  // Month code (F G H J K M N Q U V X Z) plus a 1-4 digit year: ESH5, NQZ2025.
  const m = s.match(/^([A-Z0-9]{1,3})[FGHJKMNQUVXZ]\d{1,4}$/)
  if (m && FUTURES_ROOTS[m[1]]) return m[1]
  return null
}

/**
 * Analyzes and classifies raw broker symbols (NinjaTrader, Tradovate, MetaTrader, Rithmic, CSV).
 * Returns asset class, exact tick size, and TradingView feed symbol.
 */
export function analyzeSymbol(rawSymbol) {
  const sym = String(rawSymbol || '').trim().toUpperCase()
  if (!sym) return { class: 'UNKNOWN', tick: 0.01, name: '', tv: '' }

  // Already exchange-qualified — trust the caller and read the tick off the root.
  if (sym.includes(':')) {
    const root = resolveFuturesRoot(stripContractDecoration(sym.split(':')[1] || ''))
    return {
      class: 'EXCHANGE_PREFIXED',
      tick: root ? FUTURES_ROOTS[root].tick : 0.01,
      name: sym,
      tv: sym
    }
  }

  const bare = stripContractDecoration(sym)

  const futuresRoot = resolveFuturesRoot(bare)
  if (futuresRoot) return { ...FUTURES_ROOTS[futuresRoot], name: FUTURES_ROOTS[futuresRoot].name }

  const pair = bare.replace(/[^A-Z]/g, '')
  if (FOREX_PAIRS[pair]) {
    return { class: 'FOREX', tick: FOREX_PAIRS[pair].tick, name: `${pair.slice(0, 3)}/${pair.slice(3)}`, tv: FOREX_PAIRS[pair].tv }
  }

  if (CRYPTO[bare]) return { class: 'CRYPTO', ...CRYPTO[bare] }

  // Equities and ETFs. No exchange prefix: guessing NASDAQ broke every NYSE
  // listing (NASDAQ:F, NASDAQ:BA). Bare tickers let TradingView resolve the
  // primary listing itself.
  const ticker = bare.replace(/[^A-Z0-9.]/g, '')
  if (!ticker) return { class: 'UNKNOWN', tick: 0.01, name: sym, tv: '' }
  return { class: 'STOCK', tick: 0.01, name: ticker, tv: ticker }
}

/**
 * Legacy compatibility wrapper for tick size detection.
 */
export function getSymbolTickSize(symbol) {
  return analyzeSymbol(symbol).tick
}

/**
 * Snaps price float to exact tick increment and decimal precision.
 */
export function snapToTick(val, tick = 0.01) {
  if (val === null || val === undefined || isNaN(val)) return 0
  const decimals = tick < 0.001 ? 4 : tick < 0.05 ? 2 : 2
  const rounded = Math.round(val / tick) * tick
  return Number(rounded.toFixed(decimals))
}

/**
 * Normalizes raw trade symbols into TradingView live market feed symbols.
 */
export function formatTradingViewSymbol(rawSymbol, fallback = 'CME_MINI:NQ1!') {
  return analyzeSymbol(rawSymbol).tv || fallback
}

/**
 * Parses a date string or timestamp into seconds timestamp for Lightweight Charts.
 */
export function toTimestamp(dateStr, fallbackTimestamp = null) {
  if (!dateStr) return fallbackTimestamp ?? Math.floor(Date.now() / 1000)
  if (typeof dateStr === 'number') {
    return dateStr > 10000000000 ? Math.floor(dateStr / 1000) : Math.floor(dateStr)
  }
  const parsed = new Date(dateStr).getTime()
  if (isNaN(parsed)) return fallbackTimestamp ?? Math.floor(Date.now() / 1000)
  return Math.floor(parsed / 1000)
}

/**
 * Safely parses numeric inputs (handles string numbers, currency signs, commas).
 */
function parseNum(val, fallback) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'number') return isNaN(val) ? fallback : val
  const cleaned = String(val).replace(/[^0-9.-]/g, '')
  const n = Number(cleaned)
  return isNaN(n) || !isFinite(n) ? fallback : n
}

/**
 * True when a trade carries enough recorded price for an execution view.
 * Without it the chart used to invent a series around an arbitrary $100, which
 * is worse than showing nothing.
 */
export function hasExecutionPrices(trade) {
  return Number.isFinite(Number(trade?.entry)) && Number(trade.entry) > 0
}

/**
 * The execution path: the only two prices the journal actually knows — where
 * the trade was entered and where it was closed.
 *
 * This deliberately does not fabricate the movement in between. TradeHelp
 * stores no market data, so any candles drawn here would be invented, and a
 * trader reading invented wicks can conclude they exited early on the strength
 * of a random number. The two real points are plotted and the segment joining
 * them is drawn dashed, which says "unknown" without pretending otherwise.
 */
export function buildExecutionPath(trade) {
  if (!hasExecutionPrices(trade)) return { points: [], entryTime: 0, exitTime: 0 }

  const entry = Number(trade.entry)
  const exit = Number.isFinite(Number(trade.exit)) && Number(trade.exit) > 0 ? Number(trade.exit) : null

  // Broker imports and the local DB disagree on field names, so accept them all.
  const rawEntryTime =
    trade.entryTime || trade.entry_time || trade.openTime || trade.open_time ||
    trade.time || trade.date || trade.timestamp
  const rawExitTime =
    trade.exitTime || trade.exit_time || trade.closeTime || trade.close_time ||
    trade.exitDate || trade.exit_date

  const entryTime = toTimestamp(rawEntryTime)
  let exitTime = rawExitTime ? toTimestamp(rawExitTime) : 0
  // A missing or non-advancing exit time would collapse the axis; give the
  // trade a nominal width so the two points stay distinguishable.
  if (!(exitTime > entryTime)) exitTime = entryTime + 300

  const points = [{ time: entryTime, value: entry }]
  if (exit !== null) points.push({ time: exitTime, value: exit })

  return { points, entryTime, exitTime: exit !== null ? exitTime : entryTime }
}


/**
 * How much time the chart shows either side of a trade.
 *
 * Fixed rather than a set of preset buttons. A fixed scale is what makes
 * duration legible — a two-minute scalp and a four-hour hold look plainly
 * different without anyone clicking anything — and mouse zoom covers the rest.
 * Four hours also matches what "Trim to trades" keeps, so the chart never asks
 * for data that trimming discarded.
 */
export const CONTEXT_PADDING = 4 * 60 * 60

/** Breathing room when zooming tight to the trade itself. */
export const TRADE_FIT_PADDING = 5 * 60

/**
 * The series to hand the chart: the real points, plus timed-but-valueless
 * "whitespace" points filling the rest of the window.
 *
 * The padding cannot be applied by asking the time scale to show a wider range
 * — it clamps to the extent of the data. And the grid has to cover the span
 * BETWEEN entry and exit too, because Lightweight Charts lays bars out by
 * index: a stretch of time holding no data collapses to a single bar width,
 * which made the axis read 14:25 and then jump straight to 15:10.
 */
export function buildExecutionSeries(trade, padding = null) {
  const { points, entryTime, exitTime } = buildExecutionPath(trade)
  if (points.length === 0 || !padding) {
    return { data: points, entryTime, exitTime, from: null, to: null }
  }

  const from = entryTime - padding
  const to = exitTime + padding
  // ~240 slots across the window: fine enough that inserting the two real
  // points off-grid does not visibly distort the spacing.
  const step = Math.max(30, Math.round((to - from) / 240))

  const times = new Set()
  for (let t = from; t <= to; t += step) times.add(t)
  times.add(entryTime)
  times.add(exitTime)

  const byTime = new Map(points.map((p) => [p.time, p]))
  const data = [...times].sort((a, b) => a - b).map((t) => byTime.get(t) || { time: t })

  return { data, entryTime, exitTime, from, to }
}

const toLocalDate = (t) => (typeof t === 'string' ? new Date(`${t}T00:00:00`) : new Date(t * 1000))

/**
 * Crosshair label: the local date and time the trade was journalled at.
 *
 * Lightweight Charts renders timestamps in UTC unless told otherwise, which
 * made a 14:30 trade read as 18:30 on the axis for anyone east or west of
 * Greenwich. Trades are recorded in the trader's own wall-clock time, so both
 * the axis and the crosshair are formatted back to local.
 */
export function formatLocalDateTime(t) {
  const d = toLocalDate(t)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  })
}

/**
 * Axis tick label. tickMarkType 0-2 are year/month/day spans, 3-4 are times.
 */
export function formatLocalTick(t, tickMarkType) {
  const d = toLocalDate(t)
  if (Number.isNaN(d.getTime())) return ''
  if (tickMarkType <= 2) return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * The price range the chart must show: every level the trade recorded.
 *
 * Lightweight Charts autoscales to the series only, so a stop or target far
 * from the entry silently scrolls off the top or bottom — a trader would see
 * no stop line and assume none was set.
 */
export function getExecutionPriceRange(trade) {
  const levels = [trade?.entry, trade?.exit, trade?.stop, trade?.target]
    .map((v) => parseNum(v, 0))
    .filter((v) => v > 0)

  if (levels.length === 0) return null

  const min = Math.min(...levels)
  const max = Math.max(...levels)
  const pad = Math.max((max - min) * 0.15, min * 0.0005)
  return { minValue: min - pad, maxValue: max + pad }
}

/**
 * Builds markers for Entry and Exit execution points.
 * An open trade gets an entry marker only — there is no exit to label yet, and
 * labelling one "EXIT @ 0.00" would state a price that does not exist.
 */
export function generateTradeMarkers(trade, entryTimestamp, exitTimestamp) {
  if (!trade || !entryTimestamp) return []
  const isLong = trade.direction !== 'Short'
  const pnl = parseNum(trade.pnl, 0)
  const isProfit = pnl >= 0
  const entryPrice = parseNum(trade.entry, 0)
  const exitPrice = parseNum(trade.exit, 0)

  const entryMarker = {
    time: entryTimestamp,
    position: isLong ? 'belowBar' : 'aboveBar',
    color: '#22c55e',
    shape: isLong ? 'arrowUp' : 'arrowDown',
    text: `${isLong ? 'BUY' : 'SELL'} @ ${entryPrice.toFixed(2)}`
  }

  if (!exitTimestamp || !(exitPrice > 0)) return [entryMarker]

  const markers = [
    entryMarker,
    {
      time: exitTimestamp,
      position: isLong ? 'aboveBar' : 'belowBar',
      color: isProfit ? '#10b981' : '#ef4444',
      shape: isLong ? 'arrowDown' : 'arrowUp',
      text: `EXIT @ ${exitPrice.toFixed(2)} (${isProfit ? '+' : '-'}$${Math.abs(pnl).toFixed(2)})`
    }
  ]
  return markers.sort((a, b) => (String(a.time).localeCompare(String(b.time))))
}

/**
 * Price line configurations for Entry, Stop Loss, and Take Profit.
 */
export function getPriceLineConfigs(trade) {
  const lines = []
  const entry = parseNum(trade?.entry, 0)
  const stop = parseNum(trade?.stop, 0)
  const target = parseNum(trade?.target, 0)

  if (entry > 0) {
    lines.push({
      price: entry,
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 0,
      title: 'ENTRY'
    })
  }
  if (stop > 0) {
    lines.push({
      price: stop,
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: 2,
      title: 'STOP LOSS'
    })
  }
  if (target > 0) {
    lines.push({
      price: target,
      color: '#10b981',
      lineWidth: 2,
      lineStyle: 2,
      title: 'TARGET'
    })
  }
  return lines
}

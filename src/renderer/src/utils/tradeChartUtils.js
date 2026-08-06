/**
 * Utilities for formatting TradeHelp trade records into TradingView Lightweight Charts format.
 */

/**
 * Parses a date string into seconds timestamp for Lightweight Charts.
 */
export function toTimestamp(dateStr, fallbackOffsetSec = 0) {
  if (!dateStr) return Math.floor(Date.now() / 1000) + fallbackOffsetSec
  const parsed = new Date(dateStr).getTime()
  if (isNaN(parsed)) return Math.floor(Date.now() / 1000) + fallbackOffsetSec
  return Math.floor(parsed / 1000)
}

/**
 * Deterministic pseudo-random source, seeded from a string.
 *
 * The reconstruction below has to look the same every time a given trade is
 * opened. Seeded from the trade id, a trade always renders identically; with
 * Math.random it redrew on every mount, so the same trade showed a different
 * "price path" each visit — which is exactly the kind of thing that makes a
 * trader stop trusting the tool.
 */
function seededRandom(seed) {
  let h = 1779033703 ^ String(seed).length
  for (let i = 0; i < String(seed).length; i += 1) {
    h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

/**
 * Builds an illustrative candle series for a trade from the prices the trader
 * recorded — entry, exit, stop and target.
 *
 * IMPORTANT: this is NOT market data. TradeHelp stores no historical bars, so
 * the path between entry and exit is inferred, not observed. It exists to give
 * a trade visual context when no screenshot was attached; it must never be
 * presented as what the market actually did, and any UI rendering it is
 * expected to label it as a reconstruction.
 */
export function generateTradeCandles(trade) {
  if (!trade) return { candles: [], entryTime: 0, exitTime: 0 }

  // Keyed on the trade so the same trade always reconstructs the same way.
  const rand = seededRandom(trade.id || `${trade.symbol}-${trade.timestamp}`)

  const entryPrice = Number(trade.entry) || 100
  const exitPrice = Number(trade.exit) || (entryPrice * 1.01)
  const stopPrice = Number(trade.stop) || (trade.direction === 'Long' ? entryPrice * 0.99 : entryPrice * 1.01)
  const targetPrice = Number(trade.target) || (trade.direction === 'Long' ? entryPrice * 1.02 : entryPrice * 0.98)

  const baseTime = toTimestamp(trade.entryTime || trade.timestamp || new Date().toISOString())
  const exitTime = toTimestamp(trade.exitTime, 600)

  const candles = []
  const timeStep = Math.max(60, Math.floor((exitTime - baseTime) / 20))

  // Pre-entry buffer (5 bars)
  let currentPrice = entryPrice * (trade.direction === 'Long' ? 0.997 : 1.003)
  let currentTime = baseTime - (5 * timeStep)

  for (let i = 0; i < 5; i++) {
    const volatility = entryPrice * 0.0015
    const open = currentPrice
    const close = open + (rand() - 0.48) * volatility
    const high = Math.max(open, close) + rand() * volatility
    const low = Math.min(open, close) - rand() * volatility
    candles.push({
      time: currentTime,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close
    })
    currentPrice = close
    currentTime += timeStep
  }

  // Trade execution duration (20 bars from entry to exit)
  const entryTimeActual = currentTime
  for (let i = 0; i < 20; i++) {
    const progress = (i + 1) / 20
    const targetMid = entryPrice + (exitPrice - entryPrice) * progress
    const volatility = Math.abs(exitPrice - entryPrice) * 0.15 + (entryPrice * 0.001)

    const open = currentPrice
    const close = i === 19 ? exitPrice : targetMid + (rand() - 0.5) * volatility

    let high = Math.max(open, close) + rand() * volatility
    let low = Math.min(open, close) - rand() * volatility

    // Ensure stop/target extremes are reflected realistically if defined
    if (stopPrice > 0) {
      if (trade.direction === 'Long') low = Math.max(low, stopPrice * 0.998)
      else high = Math.min(high, stopPrice * 1.002)
    }
    if (targetPrice > 0) {
      if (trade.direction === 'Long') high = Math.max(high, Math.min(targetPrice, Math.max(open, close)))
      else low = Math.min(low, Math.max(targetPrice, Math.min(open, close)))
    }

    // Always enforce strict OHLC geometry: low <= min(open, close) and high >= max(open, close)
    const finalOpen = open
    const finalClose = close
    const finalHigh = Math.max(high, finalOpen, finalClose)
    const finalLow = Math.min(low, finalOpen, finalClose)

    candles.push({ time: currentTime, open: finalOpen, high: finalHigh, low: finalLow, close: finalClose })
    currentPrice = close
    currentTime += timeStep
  }
  const exitTimeActual = currentTime - timeStep

  // Post-exit buffer (5 bars)
  for (let i = 0; i < 5; i++) {
    const volatility = entryPrice * 0.0015
    const open = currentPrice
    const close = open + (rand() - 0.5) * volatility
    const high = Math.max(open, close) + rand() * volatility
    const low = Math.min(open, close) - rand() * volatility
    candles.push({
      time: currentTime,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close
    })
    currentPrice = close
    currentTime += timeStep
  }

  return { candles, entryTime: entryTimeActual, exitTime: exitTimeActual }
}

/**
 * Builds markers for Entry and Exit execution points.
 */
export function generateTradeMarkers(trade, entryTimestamp, exitTimestamp) {
  if (!trade) return []
  const isLong = trade.direction !== 'Short'
  const isProfit = (Number(trade.pnl) || 0) >= 0

  const markers = [
    {
      time: entryTimestamp,
      position: isLong ? 'belowBar' : 'aboveBar',
      color: '#22c55e',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      text: `${isLong ? 'BUY' : 'SELL'} @ ${Number(trade.entry || 0).toFixed(2)}`
    },
    {
      time: exitTimestamp,
      position: isLong ? 'aboveBar' : 'belowBar',
      color: isProfit ? '#10b981' : '#ef4444',
      shape: isLong ? 'arrowDown' : 'arrowUp',
      text: `EXIT @ ${Number(trade.exit || 0).toFixed(2)} (${isProfit ? '+' : ''}$${(Number(trade.pnl) || 0).toFixed(2)})`
    }
  ]
  return markers.sort((a, b) => a.time - b.time)
}

/**
 * Price line configurations for Entry, Stop Loss, and Take Profit.
 */
export function getPriceLineConfigs(trade) {
  const lines = []
  if (trade?.entry > 0) {
    lines.push({
      price: Number(trade.entry),
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 0, // Solid
      title: 'ENTRY'
    })
  }
  if (trade?.stop > 0) {
    lines.push({
      price: Number(trade.stop),
      color: '#ef4444',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      title: 'STOP LOSS'
    })
  }
  if (trade?.target > 0) {
    lines.push({
      price: Number(trade.target),
      color: '#10b981',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      title: 'TARGET'
    })
  }
  return lines
}

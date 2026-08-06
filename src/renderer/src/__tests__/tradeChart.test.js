import { describe, it, expect } from 'vitest'
import { generateTradeCandles, generateTradeMarkers, getPriceLineConfigs, toTimestamp } from '../utils/tradeChartUtils.js'

describe('TradeChart Utilities', () => {
  const sampleTrade = {
    id: 't-101',
    symbol: 'ES',
    direction: 'Long',
    entry: 5200.5,
    exit: 5220.0,
    stop: 5190.0,
    target: 5230.0,
    size: 2,
    pnl: 1950.0,
    timestamp: '2026-08-05 14:30'
  }

  it('converts date string to valid timestamp in seconds', () => {
    const ts = toTimestamp('2026-08-05T14:30:00Z')
    expect(ts).toBeGreaterThan(0)
    expect(Number.isInteger(ts)).toBe(true)
  })

  it('generates high-fidelity synthetic OHLC candles for a trade', () => {
    const { candles, entryTime, exitTime } = generateTradeCandles(sampleTrade)
    expect(candles.length).toBeGreaterThan(20)
    expect(entryTime).toBeLessThan(exitTime)

    candles.forEach((candle) => {
      expect(candle).toHaveProperty('time')
      expect(candle).toHaveProperty('open')
      expect(candle).toHaveProperty('high')
      expect(candle).toHaveProperty('low')
      expect(candle).toHaveProperty('close')
      expect(candle.high).toBeGreaterThanOrEqual(candle.low)
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close))
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close))
    })
  })

  it('generates execution markers for Buy and Sell points', () => {
    const markers = generateTradeMarkers(sampleTrade, 1700000000, 1700000600)
    expect(markers).toHaveLength(2)

    const [buyMarker, sellMarker] = markers
    expect(buyMarker.shape).toBe('arrowUp')
    expect(buyMarker.text).toContain('BUY @ 5200.50')

    expect(sellMarker.shape).toBe('arrowDown')
    expect(sellMarker.text).toContain('EXIT @ 5220.00')
    expect(sellMarker.text).toContain('+$1950.00')
  })

  it('builds price line configurations for Entry, Stop Loss, and Take Profit', () => {
    const lines = getPriceLineConfigs(sampleTrade)
    expect(lines).toHaveLength(3)

    const entryLine = lines.find((l) => l.title === 'ENTRY')
    const stopLine = lines.find((l) => l.title === 'STOP LOSS')
    const targetLine = lines.find((l) => l.title === 'TARGET')

    expect(entryLine.price).toBe(5200.5)
    expect(stopLine.price).toBe(5190.0)
    expect(targetLine.price).toBe(5230.0)
  })
})

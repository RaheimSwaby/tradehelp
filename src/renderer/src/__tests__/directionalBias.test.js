import { describe, expect, it } from 'vitest'
import { BIAS_FACTOR_WEIGHTS, cmeSessionStart, computeDirectionalBias, forexSessionStart, normalizeBiasBars } from '../directionalBias.js'

function trendBars({ direction = 1, count = 180, now = Date.UTC(2026, 7, 19, 15, 0), staleMinutes = 1 } = {}) {
  const end = Math.floor((now - staleMinutes * 60_000) / 1000)
  return Array.from({ length: count }, (_, index) => {
    const close = 6000 + direction * index * 0.6
    return {
      time: end - (count - index - 1) * 60,
      open: close - direction * 0.2,
      high: close + 0.4,
      low: close - 0.4,
      close,
      volume: 100 + (index % 7)
    }
  })
}

describe('directional bias input checks', () => {
  it('normalizes, sorts, and de-duplicates valid bars', () => {
    const bars = normalizeBiasBars([
      { time: 2, open: 2, high: 3, low: 1, close: 2, volume: 4 },
      { time: 1, open: 1, high: 2, low: 0, close: 1, volume: 3 },
      { time: 2, open: 2, high: 4, low: 1, close: 3, volume: 5 },
      { time: 3, open: 5, high: 4, low: 1, close: 3 }
    ])
    expect(bars).toHaveLength(2)
    expect(bars.map((bar) => bar.time)).toEqual([1, 2])
    expect(bars[1].close).toBe(3)
  })

  it('withholds a state when history is short or stale', () => {
    const now = Date.UTC(2026, 7, 19, 15, 0)
    expect(computeDirectionalBias({ bars: trendBars({ count: 80, now }), instrument: 'ES', now })).toMatchObject({ state: 'unavailable' })
    expect(computeDirectionalBias({ bars: trendBars({ now, staleMinutes: 5 }), instrument: 'ES', now })).toMatchObject({ state: 'unavailable' })
  })
})

describe('directional bias scoring', () => {
  it('uses the documented factor weights', () => {
    expect(BIAS_FACTOR_WEIGHTS).toEqual({ trend: 35, structure: 25, vwap: 20, momentum: 10, participation: 10 })
  })

  it('publishes bullish and bearish states from deterministic bar inputs', () => {
    const now = Date.UTC(2026, 7, 19, 15, 0)
    const bullish = computeDirectionalBias({ bars: trendBars({ direction: 1, now }), instrument: 'ES', source: 'Test', now })
    const bearish = computeDirectionalBias({ bars: trendBars({ direction: -1, now }), instrument: 'NQ', source: 'Test', now })
    expect(bullish.state).toBe('bullish')
    expect(bullish.score).toBeGreaterThanOrEqual(20)
    expect(bullish.factors.find((item) => item.id === 'trend')).toMatchObject({ score: 35, direction: 'bullish' })
    expect(bearish.state).toBe('bearish')
    expect(bearish.score).toBeLessThanOrEqual(-20)
    expect(bearish.factors.find((item) => item.id === 'trend')).toMatchObject({ score: -35, direction: 'bearish' })
  })

  it('marks the CME session from 18:00 New York time across daylight saving', () => {
    expect(new Date(cmeSessionStart(Date.UTC(2026, 7, 19, 15))).toISOString()).toBe('2026-08-18T22:00:00.000Z')
    expect(new Date(cmeSessionStart(Date.UTC(2026, 0, 19, 15))).toISOString()).toBe('2026-01-18T23:00:00.000Z')
  })

  it('uses the forex rollover and labels OANDA volume as tick activity', () => {
    const now = Date.UTC(2026, 7, 19, 15, 0)
    expect(new Date(forexSessionStart(now)).toISOString()).toBe('2026-08-18T21:00:00.000Z')
    const bias = computeDirectionalBias({ bars: trendBars({ now }), instrument: 'EURUSD', source: 'OANDA Practice API', now })
    expect(bias.factors.find((item) => item.id === 'vwap')?.label).toBe('VWAP proxy')
    expect(bias.factors.find((item) => item.id === 'participation')?.label).toBe('Tick activity')
  })
})

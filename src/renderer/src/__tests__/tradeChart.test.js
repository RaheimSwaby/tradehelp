import { describe, it, expect } from 'vitest'
import {
  buildExecutionPath,
  buildExecutionSeries,
  hasExecutionPrices,
  generateTradeMarkers,
  getPriceLineConfigs,
  toTimestamp,
  formatTradingViewSymbol,
  analyzeSymbol,
  getExecutionPriceRange,
  formatLocalTick,
  formatLocalDateTime
} from '../utils/tradeChartUtils.js'

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

  describe('execution path', () => {
    it('plots only the recorded entry and exit, inventing nothing between them', () => {
      const { points, entryTime, exitTime } = buildExecutionPath({
        ...sampleTrade,
        entryTime: '2026-08-05 14:30',
        exitTime: '2026-08-05 15:05'
      })

      expect(points).toHaveLength(2)
      expect(points[0].value).toBe(5200.5)
      expect(points[1].value).toBe(5220.0)
      expect(entryTime).toBeLessThan(exitTime)
    })

    it('plots a single point when the trade is still open', () => {
      const { points } = buildExecutionPath({ ...sampleTrade, exit: null })
      expect(points).toHaveLength(1)
      expect(points[0].value).toBe(5200.5)
    })

    it('returns nothing rather than inventing a price when entry is missing', () => {
      expect(hasExecutionPrices({ ...sampleTrade, entry: null })).toBe(false)
      expect(buildExecutionPath({ ...sampleTrade, entry: null }).points).toEqual([])
      expect(buildExecutionPath(null).points).toEqual([])
    })

    it('keeps the two points distinct when exit time is missing or not after entry', () => {
      const { entryTime, exitTime } = buildExecutionPath({ ...sampleTrade, exitTime: null })
      expect(exitTime).toBeGreaterThan(entryTime)
    })

    it('reads exit time from broker field name variants', () => {
      const a = buildExecutionPath({ ...sampleTrade, exitTime: '2026-08-05 16:00' })
      const b = buildExecutionPath({ ...sampleTrade, exit_time: '2026-08-05 16:00' })
      const c = buildExecutionPath({ ...sampleTrade, close_time: '2026-08-05 16:00' })
      expect(b.exitTime).toBe(a.exitTime)
      expect(c.exitTime).toBe(a.exitTime)
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

  it('labels a loss with the sign in front of the currency', () => {
    const [, exitMarker] = generateTradeMarkers({ ...sampleTrade, pnl: -515 }, 1700000000, 1700000600)
    expect(exitMarker.text).toContain('-$515.00')
  })

  it('omits the exit marker while a trade is still open', () => {
    const markers = generateTradeMarkers({ ...sampleTrade, exit: null }, 1700000000, 1700000600)
    expect(markers).toHaveLength(1)
    expect(markers[0].text).toContain('BUY @ 5200.50')
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

  describe('context window', () => {
    const timed = { ...sampleTrade, entryTime: '2026-08-05 14:30', exitTime: '2026-08-05 15:10' }

    it('plots only the trade when set to fit', () => {
      const { data, from, to } = buildExecutionSeries(timed, null)
      expect(data).toHaveLength(2)
      expect(from).toBeNull()
      expect(to).toBeNull()
    })

    it('pads the window by the requested amount either side', () => {
      const pad = 60 * 60
      const { entryTime, exitTime, from, to } = buildExecutionSeries(timed, pad)
      expect(from).toBe(entryTime - pad)
      expect(to).toBe(exitTime + pad)
    })

    // Lightweight Charts spaces bars by index, so a span with no data collapses
    // to one bar width and the axis skips from 14:25 straight to 15:10.
    it('fills the gap between entry and exit so the axis stays linear', () => {
      const { data, entryTime, exitTime } = buildExecutionSeries(timed, 60 * 60)
      const between = data.filter((d) => d.time > entryTime && d.time < exitTime)
      expect(between.length).toBeGreaterThan(5)
    })

    it('keeps the real prices intact among the whitespace', () => {
      const { data } = buildExecutionSeries(timed, 60 * 60)
      const valued = data.filter((d) => d.value !== undefined)
      expect(valued.map((d) => d.value)).toEqual([5200.5, 5220.0])
    })

    it('emits strictly ascending, unique times', () => {
      const { data } = buildExecutionSeries(timed, 24 * 60 * 60)
      const times = data.map((d) => d.time)
      expect(new Set(times).size).toBe(times.length)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
    })

    it('stays empty when the trade has no recorded entry', () => {
      expect(buildExecutionSeries({ ...timed, entry: null }, 60 * 60).data).toEqual([])
    })
  })

  describe('time axis', () => {
    // The chart library renders UTC by default, so a 14:30 trade was showing as
    // 18:30 for anyone not on UTC. The axis must echo the journalled time back.
    it('renders the wall-clock time the trade was recorded at', () => {
      const recorded = '2026-08-05 14:30'
      const epoch = toTimestamp(recorded)
      expect(formatLocalTick(epoch, 3)).toBe('14:30')
    })

    it('renders a date for day-level ticks and a time for intraday ticks', () => {
      const epoch = toTimestamp('2026-08-05 09:45')
      expect(formatLocalTick(epoch, 2)).toMatch(/05/)
      expect(formatLocalTick(epoch, 3)).toBe('09:45')
    })

    it('shows date and time together in the crosshair label', () => {
      const label = formatLocalDateTime(toTimestamp('2026-08-05 09:45'))
      expect(label).toMatch(/05/)
      expect(label).toMatch(/09:45/)
    })

    it('does not throw on unparseable input', () => {
      expect(formatLocalTick(NaN, 3)).toBe('')
      expect(formatLocalDateTime('not-a-date')).toBe('')
    })
  })

  describe('price range', () => {
    // Autoscaling to the series alone pushed distant stops and targets off the
    // visible area, so a trader saw no stop line and could assume none was set.
    it('spans every recorded level, including a far target', () => {
      const range = getExecutionPriceRange({ entry: 20134.25, exit: 20160, stop: 20170, target: 20080 })
      expect(range.minValue).toBeLessThan(20080)
      expect(range.maxValue).toBeGreaterThan(20170)
    })

    it('ignores levels that were never recorded', () => {
      const range = getExecutionPriceRange({ entry: 5200, exit: 5220, stop: null, target: 0 })
      expect(range.minValue).toBeLessThan(5200)
      expect(range.maxValue).toBeGreaterThan(5220)
    })

    it('returns null when there is nothing to scale to', () => {
      expect(getExecutionPriceRange({})).toBeNull()
    })
  })

  describe('symbol mapping', () => {
    it('maps futures roots to the exchange TradingView actually lists them on', () => {
      expect(formatTradingViewSymbol('NQ')).toBe('CME_MINI:NQ1!')
      expect(formatTradingViewSymbol('ES')).toBe('CME_MINI:ES1!')
      expect(formatTradingViewSymbol('YM')).toBe('CBOT_MINI:YM1!')
      expect(formatTradingViewSymbol('CL')).toBe('NYMEX:CL1!')
      expect(formatTradingViewSymbol('GC')).toBe('COMEX:GC1!')
      expect(formatTradingViewSymbol('ZN')).toBe('CBOT:ZN1!')
    })

    it('keeps micros distinct from their full-size contracts', () => {
      expect(formatTradingViewSymbol('MNQ')).toBe('CME_MINI:MNQ1!')
      expect(formatTradingViewSymbol('MES')).toBe('CME_MINI:MES1!')
      expect(formatTradingViewSymbol('MCL')).toBe('NYMEX:MCL1!')
    })

    it('strips the contract decoration brokers add', () => {
      expect(formatTradingViewSymbol('NQ 06-24')).toBe('CME_MINI:NQ1!')
      expect(formatTradingViewSymbol('/ES')).toBe('CME_MINI:ES1!')
      expect(formatTradingViewSymbol('ES_F')).toBe('CME_MINI:ES1!')
      expect(formatTradingViewSymbol('ES.CME')).toBe('CME_MINI:ES1!')
      expect(formatTradingViewSymbol('ESH5')).toBe('CME_MINI:ES1!')
      expect(formatTradingViewSymbol('NQZ2025')).toBe('CME_MINI:NQ1!')
      expect(formatTradingViewSymbol('ES1!')).toBe('CME_MINI:ES1!')
    })

    // The old prefix matching sent these to the wrong instrument entirely.
    it('does not mistake stock tickers for futures that share their opening letters', () => {
      expect(formatTradingViewSymbol('CLF')).toBe('CLF')
      expect(formatTradingViewSymbol('NGD')).toBe('NGD')
      expect(formatTradingViewSymbol('ESTC')).toBe('ESTC')
      expect(formatTradingViewSymbol('SPY')).toBe('SPY')
      expect(formatTradingViewSymbol('GME')).toBe('GME')
    })

    // Guessing NASDAQ produced unresolvable symbols for every NYSE listing.
    it('leaves equities unprefixed so TradingView resolves the listing', () => {
      expect(formatTradingViewSymbol('AAPL')).toBe('AAPL')
      expect(formatTradingViewSymbol('F')).toBe('F')
      expect(formatTradingViewSymbol('BA')).toBe('BA')
    })

    it('passes through symbols that are already exchange-qualified', () => {
      expect(formatTradingViewSymbol('NASDAQ:AAPL')).toBe('NASDAQ:AAPL')
      expect(formatTradingViewSymbol('CME_MINI:ES1!')).toBe('CME_MINI:ES1!')
    })

    it('maps forex and crypto', () => {
      expect(formatTradingViewSymbol('EURUSD')).toBe('FX:EURUSD')
      expect(formatTradingViewSymbol('EUR/USD')).toBe('FX:EURUSD')
      expect(formatTradingViewSymbol('6E')).toBe('FX:EURUSD')
      expect(formatTradingViewSymbol('BTCUSD')).toBe('BINANCE:BTCUSDT')
      expect(formatTradingViewSymbol('ETH')).toBe('BINANCE:ETHUSDT')
    })

    it('falls back rather than returning an empty symbol', () => {
      expect(formatTradingViewSymbol('')).toBe('CME_MINI:NQ1!')
      expect(formatTradingViewSymbol(null)).toBe('CME_MINI:NQ1!')
    })

    it('reports the correct tick size per instrument', () => {
      expect(analyzeSymbol('ES').tick).toBe(0.25)
      expect(analyzeSymbol('NQ 06-24').tick).toBe(0.25)
      expect(analyzeSymbol('YM').tick).toBe(1.0)
      expect(analyzeSymbol('GC').tick).toBe(0.1)
      expect(analyzeSymbol('AAPL').tick).toBe(0.01)
      expect(analyzeSymbol('CME_MINI:ES1!').tick).toBe(0.25)
    })
  })
})

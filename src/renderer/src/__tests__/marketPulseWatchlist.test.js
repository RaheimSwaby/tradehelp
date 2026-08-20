import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_PULSE_MARKETS,
  MAX_MARKET_PULSE_ITEMS,
  createMarketPulseItem,
  normalizeMarketPulseWatchlist,
  sanitizeTradingViewSymbol,
  searchMarketPulseMarkets
} from '../components/marketPulseWatchlist.js'

describe('Market Pulse watchlist', () => {
  it('keeps the tested proxy mapping for the default Nasdaq view', () => {
    const list = normalizeMarketPulseWatchlist(null)
    expect(list[0]).toEqual({
      label: 'Nasdaq 100',
      tickerSymbol: 'FOREXCOM:NSXUSD',
      chartSymbol: 'OANDA:NAS100USD',
      technicalSymbol: 'NASDAQ:NDX'
    })
  })

  it('uses TradingView canonical index symbols for technical summaries', () => {
    const list = normalizeMarketPulseWatchlist(null)
    expect(list[1]).toMatchObject({
      label: 'S&P 500',
      chartSymbol: 'OANDA:SPX500USD',
      technicalSymbol: 'SP:SPX'
    })
  })

  it('creates a custom market from one explicit TradingView symbol', () => {
    expect(createMarketPulseItem('  Solana  ', ' binance:solusdt ')).toEqual({
      label: 'Solana',
      tickerSymbol: 'BINANCE:SOLUSDT',
      chartSymbol: 'BINANCE:SOLUSDT',
      technicalSymbol: 'BINANCE:SOLUSDT'
    })
  })

  it('rejects symbols without an exchange and removes duplicates', () => {
    const list = normalizeMarketPulseWatchlist([
      { label: 'Invalid', symbol: 'BTCUSD' },
      { label: 'Bitcoin', symbol: 'BITSTAMP:BTCUSD' },
      { label: 'Duplicate', symbol: 'bitstamp:btcusd' }
    ])
    expect(list).toHaveLength(1)
    expect(list[0].label).toBe('Bitcoin')
  })

  it('caps oversized saved lists', () => {
    const list = normalizeMarketPulseWatchlist(Array.from({ length: 20 }, (_, index) => ({
      label: `Market ${index}`,
      symbol: `TEST:SYMBOL${index}`
    })))
    expect(list).toHaveLength(MAX_MARKET_PULSE_ITEMS)
  })

  it('falls back safely when saved JSON is corrupt', () => {
    expect(normalizeMarketPulseWatchlist('{bad json')).toHaveLength(DEFAULT_MARKET_PULSE_MARKETS.length)
    expect(sanitizeTradingViewSymbol(' nasdaq:<script> ')).toBe('NASDAQ:SCRIPT')
  })

  it('finds familiar shorthand without requiring a provider symbol', () => {
    expect(searchMarketPulseMarkets('mnq')[0]).toMatchObject({
      label: 'Micro E-mini Nasdaq 100',
      chartSymbol: 'CME_MINI:MNQ1!'
    })
    expect(searchMarketPulseMarkets('bitcoin')[0].chartSymbol).toBe('BITSTAMP:BTCUSD')
    expect(searchMarketPulseMarkets('EUR/USD')[0].chartSymbol).toBe('FX:EURUSD')
  })

  it('ranks exact shorthand first and omits markets already on the watchlist', () => {
    expect(searchMarketPulseMarkets('ES')[0].chartSymbol).toBe('CME_MINI:ES1!')
    expect(searchMarketPulseMarkets('BTC', ['BITSTAMP:BTCUSD'])).toHaveLength(0)
  })
})

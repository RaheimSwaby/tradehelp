import { describe, expect, it } from 'vitest'
import { persistentTickerSymbols } from '../widgets/Ticker.jsx'

describe('persistent Market Pulse ticker', () => {
  it('uses the default Market Pulse watchlist', () => {
    expect(persistentTickerSymbols(null)).toEqual([
      'FOREXCOM:NSXUSD',
      'FOREXCOM:SPXUSD',
      'FX:EURUSD',
      'BITSTAMP:BTCUSD',
      'BITSTAMP:ETHUSD',
      'TVC:GOLD'
    ])
  })

  it('mirrors custom watchlist ticker symbols and removes duplicates', () => {
    expect(persistentTickerSymbols([
      { label: 'NQ', tickerSymbol: 'CME_MINI:NQ1!', chartSymbol: 'CME_MINI:NQ1!' },
      { label: 'NQ duplicate', tickerSymbol: 'CME_MINI:NQ1!', chartSymbol: 'NASDAQ:NDX' },
      { label: 'Bitcoin', tickerSymbol: 'BITSTAMP:BTCUSD', chartSymbol: 'BITSTAMP:BTCUSD' }
    ])).toEqual(['CME_MINI:NQ1!', 'BITSTAMP:BTCUSD'])
  })
})

import { describe, expect, it } from 'vitest'
import { prepareTradingViewRequestHeaders } from '../tradingViewHeaders.js'

describe('TradingView request headers', () => {
  it('preserves the technical widget origin while setting the required referer', () => {
    expect(prepareTradingViewRequestHeaders({
      Origin: 'https://www.tradingview-widget.com',
      Referer: 'http://127.0.0.1:5173/'
    })).toEqual({
      Origin: 'https://www.tradingview-widget.com',
      Referer: 'https://www.tradingview.com/'
    })
  })

  it('does not invent an origin when Chromium did not send one', () => {
    expect(prepareTradingViewRequestHeaders({ Accept: 'application/json' })).toEqual({
      Accept: 'application/json',
      Referer: 'https://www.tradingview.com/'
    })
  })
})

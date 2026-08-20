import { describe, expect, it, vi } from 'vitest'
import { createDatabentoProvider, parseDatabentoJsonLines } from '../marketData/databento.js'
import { createOandaPracticeProvider, parseOandaCandles } from '../marketData/oanda.js'
import { createMarketDataService } from '../marketData/service.js'

function response({ ok = true, status = 200, body = '', json } = {}) {
  return { ok, status, text: async () => body, json: async () => json ?? JSON.parse(body || '{}') }
}

describe('Databento provider adapter', () => {
  it('authenticates in the main process and tests CME dataset access', async () => {
    const fetchImpl = vi.fn(async () => response({ json: { schema: { 'ohlcv-1m': { end: '2026-08-19T15:00:00Z' } } } }))
    const provider = createDatabentoProvider({ fetchImpl })
    const result = await provider.test('db-abcdefghijklmnopqrstuvwxyz1234')
    expect(result).toMatchObject({ ok: true, dataset: 'GLBX.MDP3' })
    const [, options] = fetchImpl.mock.calls[0]
    expect(options.headers.Authorization).toMatch(/^Basic /)
    expect(options.headers.Authorization).not.toContain('db-abcdefghijklmnopqrstuvwxyz1234')
  })

  it('estimates cost before requesting billable bars', async () => {
    const fetchImpl = vi.fn(async () => response({ body: '0.0125' }))
    const provider = createDatabentoProvider({ fetchImpl, now: () => Date.UTC(2026, 7, 19, 15) })
    await expect(provider.estimate('db-abcdefghijklmnopqrstuvwxyz1234', { instrument: 'ES', days: 5 })).resolves.toMatchObject({ instrument: 'ES', cost: 0.0125 })
    expect(fetchImpl.mock.calls[0][0]).toContain('metadata.get_cost')
    expect(fetchImpl.mock.calls[0][0]).toContain('symbols=ES.v.0')
  })

  it('parses JSON lines in both pretty and header timestamp shapes', () => {
    const rows = parseDatabentoJsonLines([
      JSON.stringify({ ts_event: '2026-08-19T14:00:00.000000000Z', open: '1', high: '2', low: '0.5', close: '1.5', volume: 10 }),
      JSON.stringify({ hd: { ts_event: '2026-08-19T14:01:00Z' }, open: 1.5, high: 2.5, low: 1, close: 2, volume: 12 })
    ].join('\n'))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ open: 1, close: 1.5, volume: 10 })
  })
})

describe('OANDA practice provider adapter', () => {
  const token = 'practice-token-abcdefghijklmnopqrstuvwxyz'

  it('verifies a practice token without exposing it in the URL', async () => {
    const fetchImpl = vi.fn(async () => response({ json: { accounts: [{ id: 'demo-account' }] } }))
    const provider = createOandaPracticeProvider({ fetchImpl })
    await expect(provider.test(token)).resolves.toMatchObject({ ok: true, accountCount: 1 })
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api-fxpractice.oanda.com/v3/accounts')
    expect(url).not.toContain(token)
    expect(options.headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('parses complete midpoint candles and preserves tick activity', () => {
    const bars = parseOandaCandles({ candles: [
      { time: '2026-08-19T14:00:00Z', complete: true, volume: 17, mid: { o: '1.1700', h: '1.1710', l: '1.1690', c: '1.1705' } },
      { time: '2026-08-19T14:01:00Z', complete: false, volume: 4, mid: { o: '1.1705', h: '1.1710', l: '1.1700', c: '1.1708' } }
    ] })
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ open: 1.17, close: 1.1705, volume: 17 })
  })

  it('builds a ticker quote from the current New York forex session', async () => {
    const fetchImpl = vi.fn(async () => response({ json: { candles: [
      { time: '2026-08-19T21:00:00Z', complete: false, mid: { o: '1.1700', h: '1.1750', l: '1.1690', c: '1.1740' } }
    ] } }))
    const provider = createOandaPracticeProvider({ fetchImpl })
    const quote = await provider.getQuote(token, { instrument: 'EURUSD' })
    expect(quote).toMatchObject({ symbol: 'EUR/USD', price: 1.174, source: 'OANDA Practice' })
    expect(quote.changePct).toBeCloseTo(((1.174 - 1.17) / 1.17) * 100)
    expect(fetchImpl.mock.calls[0][0]).toContain('/v3/instruments/EUR_USD/candles?')
    expect(fetchImpl.mock.calls[0][0]).toContain('granularity=D')
  })

  it('splits longer history into bounded candle requests', async () => {
    let minute = 0
    const fetchImpl = vi.fn(async () => response({ json: { candles: [
      { time: new Date(Date.UTC(2026, 7, 14, 15, minute++)).toISOString(), complete: true, volume: 10, mid: { o: '1', h: '2', l: '0.5', c: '1.5' } }
    ] } }))
    const provider = createOandaPracticeProvider({ fetchImpl, now: () => Date.UTC(2026, 7, 19, 15) })
    const result = await provider.getHistory(token, { instrument: 'EUR/USD', days: 5 })
    expect(result).toMatchObject({ instrument: 'EURUSD', symbol: 'EURUSD' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls.every(([url]) => url.includes('/v3/instruments/EUR_USD/candles?'))).toBe(true)
  })
})

describe('market data service boundary', () => {
  it('returns public status without returning the saved API key', () => {
    const vault = { status: () => ({ available: true, protected: true, hasCredential: true }), get: () => 'db-secret' }
    const database = { getPriceBars: () => [], listPriceSeries: () => [] }
    const service = createMarketDataService({ database, vault })
    expect(service.status('databento')).toMatchObject({ provider: 'databento', hasCredential: true })
    expect(JSON.stringify(service.status('databento'))).not.toContain('db-secret')
  })

  it('advertises the free forex provider separately from metered CME data', () => {
    const vault = { status: () => ({ available: true, hasCredential: false }), get: () => '' }
    const database = { getPriceBars: () => [], listPriceSeries: () => [] }
    const service = createMarketDataService({ database, vault })
    expect(service.capabilities()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'oanda-practice', market: 'forex', noCharge: true, instruments: expect.arrayContaining(['EURUSD']) }),
      expect.objectContaining({ id: 'databento', noCharge: false, instruments: expect.arrayContaining(['ES']) })
    ]))
  })

  it('routes forex ticker quotes through the encrypted OANDA credential', async () => {
    const vault = {
      status: () => ({ available: true, hasCredential: true }),
      get: vi.fn(() => 'practice-token-abcdefghijklmnopqrstuvwxyz')
    }
    const database = { getPriceBars: () => [], listPriceSeries: () => [] }
    const fetchImpl = vi.fn(async () => response({ json: { candles: [
      { time: '2026-08-19T21:00:00Z', mid: { o: '150.00', h: '151.00', l: '149.00', c: '150.50' } }
    ] } }))
    const service = createMarketDataService({ database, vault, fetchImpl })
    await expect(service.quote('USD/JPY')).resolves.toMatchObject({ symbol: 'USD/JPY', price: 150.5 })
    expect(vault.get).toHaveBeenCalledWith('oanda-practice')
  })

  it('computes an unavailable state instead of inventing a bias without bars', () => {
    const vault = { status: () => ({ available: true, hasCredential: false }), get: () => '' }
    const database = { getPriceBars: () => [], listPriceSeries: () => [] }
    const service = createMarketDataService({ database, vault, now: () => Date.UTC(2026, 7, 19, 15) })
    expect(service.bias('ES')).toMatchObject({ instrument: 'ES', state: 'unavailable', score: null })
  })
})

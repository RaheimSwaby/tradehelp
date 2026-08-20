import { describe, expect, it, vi } from 'vitest'
import { fetchPrice, fetchQuotes } from '../price.js'

describe('ticker price routing', () => {
  it('normalizes supported forex symbols and uses the OANDA resolver', async () => {
    const forexQuote = vi.fn(async (symbol) => ({ symbol: 'EUR/USD', price: 1.174, changePct: 0.3, source: 'OANDA Practice' }))
    await expect(fetchPrice('eur/usd', '', { forexQuote })).resolves.toMatchObject({ symbol: 'EUR/USD', price: 1.174 })
    expect(forexQuote).toHaveBeenCalledWith('EURUSD')
  })

  it('drops an unconnected forex quote without dropping resolved symbols', async () => {
    const forexQuote = vi.fn(async (symbol) => {
      if (symbol === 'EURUSD') return { symbol: 'EUR/USD', price: 1.174, changePct: 0.3, source: 'OANDA Practice' }
      throw new Error('No quote')
    })
    const quotes = await fetchQuotes(['EURUSD', 'GBPUSD'], '', { forexQuote })
    expect(quotes).toEqual([{ symbol: 'EUR/USD', price: 1.174, changePct: 0.3, source: 'OANDA Practice' }])
  })

  it('asks the user to connect OANDA when no forex resolver exists', async () => {
    await expect(fetchPrice('USDJPY', '')).rejects.toThrow(/Connect OANDA Practice/i)
  })
})

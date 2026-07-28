import { describe, expect, it } from 'vitest'
import { createBrokerSync, developmentBrokerSnapshot } from '../brokerSync.js'

describe('development broker connector', () => {
  it('reveals history incrementally while returning old records for dedupe testing', () => {
    const first = developmentBrokerSnapshot('')
    const second = developmentBrokerSnapshot(first.cursor)
    const final = developmentBrokerSnapshot('5')

    expect(first).toMatchObject({ cursor: '3' })
    expect(first.items).toHaveLength(3)
    expect(second).toMatchObject({ cursor: '4' })
    expect(second.items).toHaveLength(4)
    expect(second.items.slice(0, 3).map((item) => item.externalId))
      .toEqual(first.items.map((item) => item.externalId))
    expect(final.items).toHaveLength(5)
    expect(final.items.every((item) => item.trade.symbol && item.trade.timestamp)).toBe(true)
  })

  it('is unavailable when development connectors are disabled', () => {
    const sync = createBrokerSync({}, { allowDevelopment: false })
    expect(sync.capabilities()).toEqual([])
    expect(() => sync.connect({ provider: 'development' })).toThrow(/not available/i)
  })
})

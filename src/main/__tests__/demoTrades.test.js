/**
 * Sample trades exist to make a brand-new install look like a real journal.
 * The risk they carry is the opposite: fabricated P&L landing in the numbers a
 * trader actually relies on. These tests pin the rules that prevent that —
 * seed only on a genuinely new install, never again, and clear the moment real
 * trades appear.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'

const tmpDir = vi.hoisted(() => {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const { tmpdir } = require('os')
  return mkdtempSync(join(tmpdir(), 'tradehelp-demo-'))
})

vi.mock('electron', () => ({ app: { getPath: () => tmpDir } }))

import {
  initDb, listTrades, addTrade, importTrades, applyMobileTradeChanges,
  countDemoTrades, clearDemoTrades, DEMO_SOURCE
} from '../db.js'

const makeTrade = (over = {}) => ({
  id: `real-${Math.random().toString(36).slice(2)}`,
  symbol: 'NQ', direction: 'Long', pnl: 100, timestamp: '2026-03-02 09:30', ...over
})

beforeAll(() => { initDb() })
afterAll(() => {
  // These tests re-run initDb() to simulate relaunches, which leaves earlier
  // SQLite handles open; Windows then refuses to unlink the file. The directory
  // is a temp dir either way, so cleanup is best-effort.
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

describe('demo trades — seeding', () => {
  it('seeds a first-run journal with tagged sample trades', () => {
    expect(countDemoTrades()).toBeGreaterThan(0)
    expect(listTrades().length).toBe(countDemoTrades())
  })

  it('tags every sample trade so it can always be told apart from real ones', () => {
    for (const trade of listTrades()) expect(trade.source).toBe(DEMO_SOURCE)
  })

  it('carries the emotion and reason tags the leak finder needs', () => {
    // Sample data that cannot demonstrate the leak finder defeats its purpose —
    // an untagged journal renders the feature blank.
    const tagged = listTrades().filter((trade) => trade.emotion && trade.reason)
    expect(tagged.length).toBe(listTrades().length)
    expect(listTrades().some((trade) => trade.emotion === 'Revenge')).toBe(true)
  })

  it('does not seed again on a later launch', () => {
    const before = countDemoTrades()
    initDb()
    expect(countDemoTrades()).toBe(before)
  })
})

describe('demo trades — clearing', () => {
  it('is removed by logging a real trade, leaving only the real one', () => {
    expect(countDemoTrades()).toBeGreaterThan(0)
    addTrade(makeTrade({ id: 'first-real' }))
    expect(countDemoTrades()).toBe(0)
    expect(listTrades().map((trade) => trade.id)).toEqual(['first-real'])
  })

  it('never re-seeds once the journal holds real trades', () => {
    initDb()
    expect(countDemoTrades()).toBe(0)
    expect(listTrades().length).toBe(1)
  })
})

describe('demo trades — cleared by a CSV import', () => {
  it('removes samples when imported history arrives', () => {
    // Rebuild a demo-populated journal to exercise the import path.
    addTrade(makeTrade({ id: 'seed-helper', source: DEMO_SOURCE }))
    expect(countDemoTrades()).toBe(1)
    importTrades([makeTrade({ id: 'imported-1' })])
    expect(countDemoTrades()).toBe(0)
    expect(listTrades().some((trade) => trade.id === 'imported-1')).toBe(true)
  })

  it('clearDemoTrades reports how many it removed and is safe to repeat', () => {
    addTrade(makeTrade({ id: 'seed-helper-2', source: DEMO_SOURCE }))
    expect(clearDemoTrades()).toBe(1)
    expect(clearDemoTrades()).toBe(0)
  })

  it('removes samples when real trades sync in from a paired phone', () => {
    addTrade(makeTrade({ id: 'seed-helper-3', source: DEMO_SOURCE }))
    expect(countDemoTrades()).toBe(1)
    applyMobileTradeChanges('device-1', [{
      entityId: 'phone-1',
      operation: 'create',
      payload: { id: 'phone-1', symbol: 'ES', direction: 'Long', pnl: 120, tradeDate: '2026-03-03 10:00' }
    }])
    expect(countDemoTrades()).toBe(0)
  })
})

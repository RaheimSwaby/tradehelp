/**
 * Imported price bars are the trader's own licensed history, stored locally so
 * a trade can be reviewed against real candles offline. These tests cover the
 * storage rules that decide whether the chart shows candles or falls back to
 * the execution map — and pin the round trip against a real NinjaTrader export.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { rmSync, readFileSync, existsSync } from 'fs'
import { parseBarExport } from '../../renderer/src/utils/barImport.js'
import { instrumentRootSymbol } from '../../renderer/src/workflow.js'

const tmpDir = vi.hoisted(() => {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const { tmpdir } = require('os')
  return mkdtempSync(join(tmpdir(), 'tradehelp-bars-'))
})

vi.mock('electron', () => ({ app: { getPath: () => tmpDir } }))

import {
  initDb, importPriceBars, listPriceSeries, getPriceBars, deletePriceSeries,
  matchTradesToBars, trimPriceBarsToTrades, addTrade
} from '../db.js'

const bar = (time, open, high, low, close, volume = 100) => ({ time, open, high, low, close, volume })
const T0 = Math.floor(Date.UTC(2026, 6, 15, 13, 30) / 1000)

beforeAll(() => { initDb() })
afterAll(() => { try { rmSync(tmpDir, { recursive: true, force: true }) } catch {} })

describe('price bar storage', () => {
  it('imports bars and reports the span it covers', () => {
    const bars = [bar(T0, 5200, 5202, 5199, 5201), bar(T0 + 60, 5201, 5203, 5200, 5202)]
    const r = importPriceBars({ root: 'MES', label: 'MES 09-26', contract: '09-26', sourceFile: 'MES 09-26.Last.txt', bars })

    expect(r.ok).toBe(true)
    expect(r.barCount).toBe(2)
    expect(r.firstTs).toBe(T0)
    expect(r.lastTs).toBe(T0 + 60)
  })

  it('lists what has been imported', () => {
    const [series] = listPriceSeries().filter((s) => s.root === 'MES')
    expect(series).toMatchObject({ root: 'MES', label: 'MES 09-26', barCount: 2 })
  })

  it('returns only the bars inside the requested window', () => {
    expect(getPriceBars('MES', T0, T0)).toHaveLength(1)
    expect(getPriceBars('MES', T0, T0 + 60)).toHaveLength(2)
    expect(getPriceBars('MES', T0 + 3600, T0 + 7200)).toHaveLength(0)
  })

  // Guards against a caller forgetting the range and pulling a 44,000-row
  // export across IPC into the renderer.
  it('refuses to return everything when the window is missing', () => {
    expect(getPriceBars('MES', undefined, undefined)).toEqual([])
    expect(getPriceBars('', T0, T0 + 60)).toEqual([])
  })

  it('is case- and whitespace-insensitive about the instrument', () => {
    expect(getPriceBars(' mes ', T0, T0 + 60)).toHaveLength(2)
  })

  // Re-importing is how a trader fixes a bad or partial export, so stale bars
  // from the wrong contract must not survive alongside the good ones.
  it('replaces a previous import rather than merging into it', () => {
    importPriceBars({ root: 'MES', label: 'MES 12-26', bars: [bar(T0 + 600, 5300, 5301, 5299, 5300)] })

    expect(getPriceBars('MES', T0, T0 + 60)).toHaveLength(0)
    expect(getPriceBars('MES', T0 + 600, T0 + 600)).toHaveLength(1)
    expect(listPriceSeries().filter((s) => s.root === 'MES')).toHaveLength(1)
  })

  it('keeps instruments separate', () => {
    importPriceBars({ root: 'NQ', label: 'NQ 09-26', bars: [bar(T0, 20000, 20010, 19990, 20005)] })
    expect(getPriceBars('NQ', T0, T0)).toHaveLength(1)
    expect(getPriceBars('MES', T0, T0)).toHaveLength(0)
  })

  it('rejects an empty or unidentified import', () => {
    expect(importPriceBars({ root: 'MES', bars: [] }).ok).toBe(false)
    expect(importPriceBars({ root: '', bars: [bar(T0, 1, 2, 0.5, 1)] }).ok).toBe(false)
  })

  it('deletes a series without touching the others', () => {
    deletePriceSeries('MES')
    expect(getPriceBars('MES', T0, T0 + 3600)).toHaveLength(0)
    expect(listPriceSeries().some((s) => s.root === 'MES')).toBe(false)
    expect(getPriceBars('NQ', T0, T0)).toHaveLength(1)
  })
})

describe('matching trades to bars', () => {
  it('returns only the trades a stored window actually covers', () => {
    importPriceBars({ root: 'MES', label: 'MES 09-26', bars: [bar(T0, 5200, 5202, 5199, 5201), bar(T0 + 60, 5201, 5203, 5200, 5202)] })

    const matched = matchTradesToBars([
      { id: 'covered', root: 'MES', from: T0, to: T0 + 60 },
      { id: 'far-away', root: 'MES', from: T0 + 86400, to: T0 + 90000 },
      { id: 'other-instrument', root: 'CL', from: T0, to: T0 + 60 }
    ])

    expect(matched).toEqual(['covered'])
  })

  it('ignores entries with no instrument or no window', () => {
    expect(matchTradesToBars([{ id: 'a', root: '', from: T0, to: T0 }])).toEqual([])
    expect(matchTradesToBars([{ id: 'b', root: 'MES', from: null, to: T0 }])).toEqual([])
    expect(matchTradesToBars([])).toEqual([])
    expect(matchTradesToBars(null)).toEqual([])
  })
})

describe('trimming an export down to the trades', () => {
  // A whole session either side of one trade, minute by minute.
  const session = Array.from({ length: 600 }, (_, i) => bar(T0 - 300 * 60 + i * 60, 5200, 5201, 5199, 5200))

  it('keeps bars near a trade and drops the rest', () => {
    // Journalled as local wall clock, which is how trades are stored and read.
    // Deriving it from a UTC instant instead put the trade hours from its bars.
    const d = new Date(T0 * 1000)
    const p = (n) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`

    addTrade({
      id: 'trim-trade', symbol: 'MES', direction: 'Long', pnl: 50,
      timestamp: stamp, entry: 5200, exit: 5201
    })
    importPriceBars({ root: 'MES', label: 'MES 09-26', bars: session })

    const r = trimPriceBarsToTrades('MES', 30 * 60)

    expect(r.ok).toBe(true)
    expect(r.before).toBe(session.length)
    expect(r.after).toBeLessThan(r.before)
    expect(r.after).toBeGreaterThan(0)
    expect(r.windows).toBeGreaterThanOrEqual(1)
  })

  it('leaves the trade itself chartable afterwards', () => {
    expect(getPriceBars('MES', T0 - 600, T0 + 600).length).toBeGreaterThan(0)
  })

  it('updates the stored summary to match what survived', () => {
    const [series] = listPriceSeries().filter((s) => s.root === 'MES')
    expect(series.barCount).toBe(getPriceBars('MES', 0, 4102444800).length)
  })

  // Trimming with nothing to trim around would delete the entire import, which
  // is never what the trader meant by "trim".
  it('refuses rather than wiping everything when no trades match', () => {
    importPriceBars({ root: 'CL', label: 'CL 09-26', bars: session })
    const r = trimPriceBarsToTrades('CL', 30 * 60)

    expect(r.ok).toBe(false)
    expect(getPriceBars('CL', T0 - 600, T0 + 600).length).toBeGreaterThan(0)
  })

  it('reports rather than throws for an unknown instrument', () => {
    expect(trimPriceBarsToTrades('ZZZ', 1800).ok).toBe(false)
    expect(trimPriceBarsToTrades('', 1800).ok).toBe(false)
  })
})

// Runs only on the machine holding the sample export; skipped elsewhere so CI
// stays green without shipping a 2 MB fixture.
const SAMPLE = 'C:/Users/Rahei/Downloads/MES 09-26.Last.txt'
const hasSample = (() => { try { return existsSync(SAMPLE) } catch { return false } })()

describe.skipIf(!hasSample)('round trip through a real NinjaTrader export', () => {
  it('parses, stores and reads back the same bars', () => {
    const { bars, errors } = parseBarExport(readFileSync(SAMPLE, 'utf8'))
    expect(errors).toEqual([])
    expect(bars.length).toBeGreaterThan(40000)

    const root = instrumentRootSymbol('MES 09-26')
    expect(root).toBe('MES')

    const r = importPriceBars({ root, label: 'MES 09-26', bars })
    expect(r.ok).toBe(true)
    expect(r.barCount).toBe(bars.length)

    // A trade inside the export's range must find bars around it.
    const mid = bars[Math.floor(bars.length / 2)]
    const window = getPriceBars(root, mid.time - 900, mid.time + 900)
    expect(window.length).toBeGreaterThan(20)

    const stored = window.find((b) => b.time === mid.time)
    expect(stored).toMatchObject({
      open: mid.open, high: mid.high, low: mid.low, close: mid.close
    })

    deletePriceSeries(root)
  })
})

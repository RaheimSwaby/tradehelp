/**
 * Unit tests for the db.js module.
 *
 * We mock `electron` so initDb() can run outside of the Electron runtime,
 * using a temporary directory that is cleaned up after each suite.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'

// vi.hoisted() runs before ESM imports are evaluated, so use require() inside it
// rather than referencing the top-level import bindings (which aren't ready yet).
const tmpDir = vi.hoisted(() => {
  const { mkdtempSync } = require('fs')
  const { join } = require('path')
  const { tmpdir } = require('os')
  return mkdtempSync(join(tmpdir(), 'tradehelp-test-'))
})

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
}))

// Import the module under test after the mock is wired up
import {
  initDb,
  addTrade, listTrades, updateTrade, deleteTrade, importTrades, importTradeBatch,
  listImportBatches, rollbackImportBatch, saveImportSource, listImportSources,
  deleteImportSource, recordImportInbox, listImportInbox, setImportInboxState,
  getGoals, setGoals,
  getSettings, setSettings,
  addImage, listImages, getImage, deleteImage,
  getAllData, restoreData,
} from '../db.js'

// ── helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0
function makeTrade(overrides = {}) {
  return {
    id: `trade-${++idCounter}`,
    symbol: 'SPY',
    direction: 'Long',
    entry: 450, exit: 455, stop: 448, target: 460,
    size: 100, riskAmount: 200, pnl: 500, rr: 2.5,
    emotion: 'Neutral', setup: 'Pullback', notes: 'test',
    timestamp: `2026-01-0${Math.min(idCounter, 9)} 09:30`,
    entryTime: '09:30', exitTime: '10:00',
    reason: 'Followed my plan', source: 'manual', account: '',
    ...overrides,
  }
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

beforeAll(() => {
  initDb()
})

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
})

// ── trades CRUD ───────────────────────────────────────────────────────────────

describe('trades — add / list', () => {
  it('adds a trade and returns it in listTrades', () => {
    const t = makeTrade()
    const trades = addTrade(t)
    const found = trades.find((r) => r.id === t.id)
    expect(found).toBeDefined()
    expect(found.symbol).toBe('SPY')
    expect(found.pnl).toBe(500)
  })

  it('listTrades is ordered by timestamp ascending', () => {
    const early = makeTrade({ timestamp: '2025-01-01 09:00' })
    const late  = makeTrade({ timestamp: '2025-12-31 16:00' })
    addTrade(late)
    addTrade(early)
    const trades = listTrades()
    const iEarly = trades.findIndex((r) => r.id === early.id)
    const iLate  = trades.findIndex((r) => r.id === late.id)
    expect(iEarly).toBeLessThan(iLate)
  })

  it('coerces non-numeric pnl to 0', () => {
    const t = makeTrade({ pnl: 'bad', rr: undefined })
    const trades = addTrade(t)
    const row = trades.find((r) => r.id === t.id)
    expect(row.pnl).toBe(0)
    expect(row.rr).toBe(0)
  })
})

describe('trades — update', () => {
  it('updates fields on an existing trade', () => {
    const t = makeTrade({ pnl: 100 })
    addTrade(t)
    const updated = updateTrade({ ...t, pnl: 999, notes: 'updated' })
    const row = updated.find((r) => r.id === t.id)
    expect(row.pnl).toBe(999)
    expect(row.notes).toBe('updated')
  })
})

describe('trades — delete', () => {
  it('removes the trade from the list', () => {
    const t = makeTrade()
    addTrade(t)
    const after = deleteTrade(t.id)
    expect(after.find((r) => r.id === t.id)).toBeUndefined()
  })
})

describe('trades — import', () => {
  it('bulk-imports trades flagged as source=import', () => {
    const rows = [makeTrade(), makeTrade()]
    const all = importTrades(rows)
    for (const r of rows) {
      const found = all.find((x) => x.id === r.id)
      expect(found).toBeDefined()
      expect(found.source).toBe('import')
    }
  })

  it('records batch audit data and safely rolls back only that batch', () => {
    const manual = makeTrade({ id: 'manual-kept', source: 'manual' })
    addTrade(manual)
    const rows = [makeTrade({ id: 'batch-a' }), makeTrade({ id: 'batch-b' })]
    const result = importTradeBatch(rows, {
      fileName: 'orders.csv', brokerKey: 'ninjatrader', brokerLabel: 'NinjaTrader 8',
      rowCount: 4, duplicateCount: 1, skippedCount: 1, warnings: ['One row was skipped.']
    })
    expect(result.batch).toMatchObject({ fileName: 'orders.csv', importedCount: 2, duplicateCount: 1, skippedCount: 1 })
    expect(listImportBatches()[0].warnings).toEqual(['One row was skipped.'])

    const rolledBack = rollbackImportBatch(result.batch.id)
    expect(rolledBack.trades.some((trade) => trade.id === manual.id)).toBe(true)
    expect(rolledBack.trades.some((trade) => trade.id === rows[0].id)).toBe(false)
    expect(rolledBack.batches.find((batch) => batch.id === result.batch.id).status).toBe('rolled_back')
  })

  it('persists watched sources and inbox state without deleting history', () => {
    const sources = saveImportSource({ name: 'Ninja exports', folderPath: tmpDir, brokerKey: 'ninjatrader', trusted: true })
    const source = sources.find((item) => item.name === 'Ninja exports')
    expect(source).toMatchObject({ brokerKey: 'ninjatrader', trusted: true, enabled: true })
    const recorded = recordImportInbox({
      sourceId: source.id, filePath: `${tmpDir}/orders.csv`, fileName: 'orders.csv',
      fingerprint: 'source-file-1', size: 123, modifiedAt: '2026-07-21T12:00:00.000Z'
    })
    expect(recorded.created).toBe(true)
    expect(recordImportInbox({ ...recorded.item }).created).toBe(false)
    expect(listImportInbox()).toHaveLength(1)
    setImportInboxState(recorded.item.id, 'imported')
    expect(listImportInbox()).toHaveLength(0)
    deleteImportSource(source.id)
    expect(listImportSources().some((item) => item.id === source.id)).toBe(false)
  })
})

// ── goals ─────────────────────────────────────────────────────────────────────

describe('goals', () => {
  it('returns numeric defaults', () => {
    const g = getGoals()
    expect(typeof g.weekly).toBe('number')
    expect(typeof g.monthly).toBe('number')
  })

  it('persists updated goals', () => {
    setGoals({ weekly: 750, monthly: 3000 })
    expect(getGoals()).toMatchObject({ weekly: 750, monthly: 3000 })
  })
})

// ── settings ──────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('has ollama as the default provider', () => {
    const s = getSettings()
    expect(s.provider).toBe('ollama')
  })

  it('persists a custom setting without overwriting others', () => {
    setSettings({ cloudModel: 'gpt-4o' })
    const s = getSettings()
    expect(s.cloudModel).toBe('gpt-4o')
    expect(s.provider).toBe('ollama') // unchanged
  })
})

// ── image metadata (lazy loading) ─────────────────────────────────────────────

describe('images — lazy metadata', () => {
  it('listImages returns metadata only (no dataUrl)', () => {
    const t = makeTrade()
    addTrade(t)
    const imgs = listImages(t.id)
    // no images added yet — result is empty
    expect(imgs).toEqual([])
    // if there were images, they must not carry dataUrl
    imgs.forEach((im) => expect('dataUrl' in im).toBe(false))
  })

  it('getImage returns null for an unknown id', () => {
    expect(getImage('no-such-id')).toBeNull()
  })
})

// ── export / import ───────────────────────────────────────────────────────────

describe('getAllData — export', () => {
  it('strips all secret API keys', () => {
    setSettings({ cloudKey: 'sk-secret', finnhubKey: 'fh-key', fmpKey: 'fmp-key' })
    const data = getAllData()
    expect(data.settings.cloudKey).toBeUndefined()
    expect(data.settings.finnhubKey).toBeUndefined()
    expect(data.settings.fmpKey).toBeUndefined()
  })

  it('includes trades array and goals object', () => {
    const data = getAllData()
    expect(Array.isArray(data.trades)).toBe(true)
    expect(data.goals).toMatchObject({ weekly: expect.any(Number), monthly: expect.any(Number) })
  })

  it('round-trips data through restoreData', () => {
    const t = makeTrade({ symbol: 'QQQ', pnl: 123 })
    addTrade(t)
    const snapshot = getAllData()
    // Wipe the trade then restore
    deleteTrade(t.id)
    restoreData(snapshot)
    const restored = listTrades().find((r) => r.id === t.id)
    expect(restored).toBeDefined()
    expect(restored.symbol).toBe('QQQ')
    expect(restored.pnl).toBe(123)
  })
})

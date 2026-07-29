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
  saveBrokerConnection, listBrokerConnections, getBrokerConnection,
  disconnectBrokerConnection, importBrokerSyncItems, resetBrokerConnectionData,
  applyMobileTradeChanges, importMobileTrades, mobileTradeSnapshot, getMobileSyncToken, rotateMobileSyncToken,
  getGoals, setGoals,
  getSettings, setSettings, getTradeRuleState, mergeMobileTradeRules,
  getMobileAccountState, mergeMobileAccountState,
  addImage, listImages, getImage, deleteImage,
  createTradingSession, getActiveTradingSession, getTradingSession, listTradingSessions,
  beginTradingSessionRecording, completeTradingSessionRecording, discardTradingSessionRecording,
  finishTradingSession,
  addPropExpense, listPropExpenses, deletePropExpense,
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
    const t = makeTrade({
      analysisTimeframe: '4h', entryTimeframe: '1m', managementTimeframe: '5m',
      riskPoints: 8, rewardPoints: 16, riskMode: 'points'
    })
    const trades = addTrade(t)
    const found = trades.find((r) => r.id === t.id)
    expect(found).toBeDefined()
    expect(found.symbol).toBe('SPY')
    expect(found.pnl).toBe(500)
    expect(found).toMatchObject({
      analysisTimeframe: '4h', entryTimeframe: '1m', managementTimeframe: '5m',
      riskPoints: 8, rewardPoints: 16, riskMode: 'points'
    })
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

describe('trading sessions', () => {
  it('tracks an active session and links trades inside its time window', () => {
    // A trade's timestamp is local wall-clock ('2026-02-10 09:30') but a session stores
    // real UTC instants, so the window has to be built from the same local basis as the
    // trade. Hardcoded Z instants only bracketed 09:30 in US Eastern and failed in UTC.
    const localInstant = (time) => new Date(`2026-02-10T${time}`).toISOString()
    const session = createTradingSession({
      id: '11111111-1111-4111-8111-111111111111',
      startedAt: localInstant('08:00')
    })
    expect(session.status).toBe('active')
    expect(getActiveTradingSession()?.id).toBe(session.id)

    addTrade(makeTrade({
      id: 'session-trade',
      timestamp: '2026-02-10 09:30',
      entryTime: '09:30',
      pnl: 275
    }))
    const finished = finishTradingSession(session.id, {
      endedAt: localInstant('11:00'),
      notes: 'Stayed selective.'
    })
    expect(finished).toMatchObject({
      status: 'completed',
      tradeCount: 1,
      netPnl: 275,
      notes: 'Stayed selective.'
    })
    expect(getActiveTradingSession()).toBeNull()
    expect(listTradingSessions().some((item) => item.id === session.id)).toBe(true)
  })

  it('stores and discards local recording metadata', () => {
    const session = createTradingSession({
      id: '22222222-2222-4222-8222-222222222222',
      startedAt: '2026-02-11T09:00:00.000Z',
      recordingRequested: true,
      sourceId: 'screen:1:0',
      sourceLabel: 'Main screen'
    })
    beginTradingSessionRecording(session.id, { file: `${session.id}.webm`, mimeType: 'video/webm' })
    const ready = completeTradingSessionRecording(session.id, 4096)
    expect(ready).toMatchObject({ recordingStatus: 'ready', size: 4096 })
    expect(ready.recordingUrl).toContain(session.id)
    const discarded = discardTradingSessionRecording(session.id)
    expect(discarded).toMatchObject({ recordingStatus: 'discarded', size: 0, recordingUrl: '' })
    finishTradingSession(session.id, { endedAt: '2026-02-11T10:00:00.000Z' })
    expect(getTradingSession(session.id)?.status).toBe('completed')
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

describe('broker sync persistence', () => {
  it('maps executions to a journal account, dedupes them, and preserves rollback semantics', () => {
    const connections = saveBrokerConnection({
      provider: 'development',
      label: 'Development broker',
      account: 'prop-demo'
    })
    const connection = connections.find((item) => item.provider === 'development')
    expect(connection).toMatchObject({ status: 'connected', enabled: true, account: 'prop-demo' })

    const item = (externalId, pnl) => ({
      externalId,
      trade: makeTrade({ id: undefined, symbol: 'MES', pnl })
    })
    const first = importBrokerSyncItems(connection.id, [item('sync-1', 25), item('sync-2', -10)], '2')
    expect(first).toMatchObject({ importedCount: 2, duplicateCount: 0 })
    expect(first.trades.filter((trade) => trade.account === 'prop-demo' && trade.symbol === 'MES').slice(-2))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ source: 'import', account: 'prop-demo', pnl: 25 }),
        expect.objectContaining({ source: 'import', account: 'prop-demo', pnl: -10 })
      ]))

    const second = importBrokerSyncItems(connection.id, [
      item('sync-1', 25), item('sync-2', -10), item('sync-3', 40)
    ], '3')
    expect(second).toMatchObject({ importedCount: 1, duplicateCount: 2 })
    expect(getBrokerConnection(connection.id)).toMatchObject({ lastCursor: '3', status: 'connected' })

    rollbackImportBatch(second.batch.id)
    const restored = importBrokerSyncItems(connection.id, [
      item('sync-1', 25), item('sync-2', -10), item('sync-3', 40)
    ], '3')
    expect(restored).toMatchObject({ importedCount: 1, duplicateCount: 2 })

    const reset = resetBrokerConnectionData(connection.id)
    expect(reset.rolledBackCount).toBe(2)
    expect(getBrokerConnection(connection.id)).toMatchObject({ lastCursor: '', lastSyncAt: '' })

    const disconnected = disconnectBrokerConnection(connection.id)
    expect(disconnected.find((entry) => entry.id === connection.id)).toMatchObject({
      enabled: false,
      status: 'disconnected'
    })
    expect(listBrokerConnections().some((entry) => entry.id === connection.id)).toBe(true)
  })
})

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
  it('returns persistent defaults for coach voice and the personal clock', () => {
    expect(getSettings()).toMatchObject({
      provider: 'ollama',
      coachVoice: 'balanced',
      personalClockSource: 'auto',
      personalClockAlerts: 'true',
      personalClockAmbience: 'true',
      personalClockManualWindows: '[]'
    })
  })

  it('persists only allowlisted settings and serializes valid manual windows', () => {
    const windows = [
      { start: '09:30', end: '12:00', label: 'ignored' },
      { start: '13:00', end: '15:15' },
      { start: 'later', end: '16:00' }
    ]
    const settings = setSettings({
      coachVoice: 'supportive',
      personalClockSource: 'manual',
      personalClockAlerts: false,
      personalClockAmbience: 'true',
      personalClockManualWindows: JSON.stringify(windows),
      unknownSetting: 'not persisted'
    })

    expect(settings).toMatchObject({
      coachVoice: 'supportive',
      personalClockSource: 'manual',
      personalClockAlerts: 'false',
      personalClockAmbience: 'true'
    })
    expect(JSON.parse(settings.personalClockManualWindows)).toEqual([
      { start: '09:30', end: '12:00' },
      { start: '13:00', end: '15:15' }
    ])
    expect(settings).not.toHaveProperty('unknownSetting')
  })

  it('sanitizes invalid enumerations, flags, and manual-window JSON', () => {
    const settings = setSettings({
      coachVoice: 'hostile',
      personalClockSource: 'calendar',
      personalClockAlerts: 'sometimes',
      personalClockAmbience: '',
      personalClockManualWindows: '{bad json'
    })

    expect(settings).toMatchObject({
      coachVoice: 'balanced',
      personalClockSource: 'auto',
      personalClockAlerts: 'true',
      personalClockAmbience: 'true',
      personalClockManualWindows: '[]'
    })
  })

  it('merges a partial update without overwriting other settings', () => {
    setSettings({ cloudModel: 'gpt-4o', personalClockSource: 'manual', personalClockAlerts: 'false' })
    const settings = setSettings({ coachVoice: 'tough-love' })

    expect(settings).toMatchObject({
      provider: 'ollama',
      cloudModel: 'gpt-4o',
      coachVoice: 'tough-love',
      personalClockSource: 'manual',
      personalClockAlerts: 'false'
    })
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

describe('prop expenses — add / list / delete', () => {
  it('stores signed account expenses and credits', () => {
    const accountId = `prop-${Date.now()}`
    const expenses = addPropExpense({ accountId, date: '2026-07-25', amount: 49.99, category: 'evaluation', note: 'Challenge fee' })
    const charge = expenses.find((expense) => expense.accountId === accountId)

    expect(charge).toMatchObject({
      accountId,
      date: '2026-07-25',
      amount: 49.99,
      category: 'evaluation',
      note: 'Challenge fee'
    })

    const withCredit = addPropExpense({ accountId, date: '2026-07-26', amount: -10, category: 'refund', note: 'Discount credit' })
    expect(withCredit.find((expense) => expense.accountId === accountId && expense.category === 'refund')?.amount).toBe(-10)

    deletePropExpense(charge.id)
    expect(listPropExpenses().some((expense) => expense.id === charge.id)).toBe(false)
  })
})

// ── export / import ───────────────────────────────────────────────────────────

describe('mobile sync - import and dedupe', () => {
  it('imports a mobile trade once and preserves its checklist evidence', () => {
    const deviceId = `ios-${Date.now()}`
    const mobileTrade = {
      id: 'mobile-trade-1',
      symbol: 'mes',
      direction: 'Short',
      pnl: -45,
      fees: 3.2,
      setup: 'Failed breakout',
      timeframe: '1m',
      notes: 'Waited for confirmation.',
      tradeDate: '2026-07-26T10:15:00',
      entryTime: '10:15',
      exitTime: '10:22',
      ruleSummary: '1/2 post-trade rules followed',
      ruleChecks: [
        { rule: 'Wait for confirmation', followed: true },
        { rule: 'Respect max risk', followed: false }
      ]
    }

    const first = importMobileTrades(deviceId, [mobileTrade])
    const second = importMobileTrades(deviceId, [mobileTrade])
    const imported = listTrades().find((trade) => trade.id === first.accepted[0].desktopId)

    expect(first).toMatchObject({ importedCount: 1, duplicateCount: 0 })
    expect(second).toMatchObject({ importedCount: 0, duplicateCount: 1 })
    expect(imported).toMatchObject({
      symbol: 'MES',
      direction: 'Short',
      pnl: -45,
      fees: 3.2,
      source: 'mobile',
      reason: '1/2 post-trade rules followed',
      entryTime: '10:15',
      exitTime: '10:22',
      entryTimeframe: '1m'
    })
    expect(imported.notes).toContain('[x] Wait for confirmation')
    expect(imported.notes).toContain('[ ] Respect max risk')
    expect(mobileTradeSnapshot().find((trade) => trade.id === imported.id)).toMatchObject({
      entryTime: '10:15',
      exitTime: '10:22',
      timeframe: '1m'
    })
  })

  it('persists and rotates the desktop pairing token', () => {
    const first = getMobileSyncToken()
    expect(getMobileSyncToken()).toBe(first)
    expect(rotateMobileSyncToken()).not.toBe(first)
  })

  it('applies mobile edits and deletions to their linked desktop trade', () => {
    const deviceId = `ios-crud-${Date.now()}`
    const mobileId = 'mobile-crud-1'
    const created = applyMobileTradeChanges(deviceId, [{
      entityId: mobileId,
      operation: 'create',
      payload: {
        id: mobileId,
        symbol: 'MES',
        direction: 'Long',
        pnl: 25,
        fees: 2,
        setup: 'Pullback',
        notes: 'Initial note',
        tradeDate: '2026-07-27T09:45:00',
        entryTime: '09:45',
        exitTime: '09:54',
        timeframe: '1m',
        account: 'prop-mobile-1'
      }
    }])
    const desktopId = created.accepted[0].desktopId

    const updated = applyMobileTradeChanges(deviceId, [{
      entityId: mobileId,
      operation: 'update',
      payload: {
        id: mobileId,
        desktopId,
        symbol: 'MNQ',
        direction: 'Short',
        pnl: -40,
        fees: 3.5,
        setup: 'Failed breakout',
        notes: 'Edited on mobile',
        tradeDate: '2026-07-27T10:05:00',
        entryTime: '10:05',
        exitTime: '10:13',
        timeframe: '30s'
      }
    }])
    expect(updated).toMatchObject({ updatedCount: 1, deletedCount: 0 })
    expect(listTrades().find((trade) => trade.id === desktopId)).toMatchObject({
      symbol: 'MNQ',
      direction: 'Short',
      pnl: -40,
      fees: 3.5,
      setup: 'Failed breakout',
      notes: 'Edited on mobile',
      entryTime: '10:05',
      exitTime: '10:13',
      entryTimeframe: '30s',
      account: 'prop-mobile-1'
    })

    const deleted = applyMobileTradeChanges(deviceId, [{
      entityId: mobileId,
      operation: 'delete',
      payload: { id: mobileId, desktopId }
    }])
    expect(deleted).toMatchObject({ updatedCount: 0, deletedCount: 1 })
    expect(listTrades().some((trade) => trade.id === desktopId)).toBe(false)
  })
})

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
    expect(Array.isArray(data.propExpenses)).toBe(true)
    expect(data.goals).toMatchObject({ weekly: expect.any(Number), monthly: expect.any(Number) })
  })

  it('exports one copy of exact imported duplicates but preserves identical manual trades', () => {
    const imported = makeTrade({
      id: 'backup-import-duplicate-a',
      symbol: 'BKDUP',
      source: 'import',
      timestamp: '2026-12-20 09:45',
      entryTime: '2026-12-20T09:45:00',
      exitTime: '2026-12-20T09:51:00'
    })
    addTrade(imported)
    addTrade({ ...imported, id: 'backup-import-duplicate-b' })
    addTrade({ ...imported, id: 'backup-manual-identical', source: 'manual' })

    const snapshot = getAllData()
    const matching = snapshot.trades.filter((trade) => trade.symbol === 'BKDUP')

    expect(matching.filter((trade) => trade.source === 'import')).toHaveLength(1)
    expect(matching.filter((trade) => trade.source === 'manual')).toHaveLength(1)
    expect(snapshot.backupSummary.duplicateTradesRemoved).toBeGreaterThanOrEqual(1)
  })

  it('restores old backups idempotently and skips exact imported duplicates with different IDs', () => {
    const imported = makeTrade({
      id: 'restore-import-duplicate-a',
      symbol: 'RSTDUP',
      source: 'import',
      timestamp: '2026-12-21 10:15',
      entryTime: '2026-12-21T10:15:00',
      exitTime: '2026-12-21T10:23:00'
    })
    const backup = {
      app: 'tradehelp',
      version: 8,
      trades: [imported, { ...imported, id: 'restore-import-duplicate-b' }]
    }

    const first = restoreData(backup)
    const second = restoreData(backup)
    const restored = listTrades().filter((trade) => trade.symbol === 'RSTDUP')

    expect(first.restoreSummary.duplicateTradesIgnored).toBe(1)
    expect(second.restoreSummary.duplicateTradesIgnored).toBe(1)
    expect(restored).toHaveLength(1)
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

  it('round-trips prop expenses through restoreData', () => {
    const accountId = `backup-prop-${Date.now()}`
    const added = addPropExpense({ accountId, date: '2026-07-25', amount: 129, category: 'activation' })
      .find((expense) => expense.accountId === accountId)
    const snapshot = getAllData()

    deletePropExpense(added.id)
    restoreData(snapshot)

    expect(listPropExpenses().find((expense) => expense.id === added.id)).toMatchObject({
      accountId,
      amount: 129,
      category: 'activation'
    })
  })

  it('syncs the most recently changed trade rules without refreshing unchanged revisions', () => {
    const desktopSettings = setSettings({ tradeRules: JSON.stringify(['Desktop rule']) })
    const desktopRevision = desktopSettings.tradeRulesUpdatedAt
    expect(desktopRevision).toBeTruthy()

    const unchanged = setSettings({
      tradeRules: JSON.stringify(['Desktop rule']),
      accentColor: 'sky'
    })
    expect(unchanged.tradeRulesUpdatedAt).toBe(desktopRevision)

    const older = new Date(Date.parse(desktopRevision) - 1_000).toISOString()
    expect(mergeMobileTradeRules(['Old phone rule'], older)).toMatchObject({
      rules: ['Desktop rule'],
      updatedAt: desktopRevision,
      changed: false
    })

    const newer = new Date(Date.parse(desktopRevision) + 1_000).toISOString()
    expect(mergeMobileTradeRules(['Phone rule'], newer)).toEqual({
      rules: ['Phone rule'],
      updatedAt: newer,
      changed: true
    })
    expect(getTradeRuleState()).toEqual({ rules: ['Phone rule'], updatedAt: newer })

    const desktopWinsAgain = setSettings({ tradeRules: JSON.stringify(['Newest desktop rule']) })
    expect(JSON.parse(desktopWinsAgain.tradeRules)).toEqual(['Newest desktop rule'])
    expect(Date.parse(desktopWinsAgain.tradeRulesUpdatedAt)).toBeGreaterThan(Date.parse(newer))
  })

  it('syncs the most recently changed live and prop account configuration', () => {
    const desktopSettings = setSettings({
      liveCapital: '5000',
      propFirmAccounts: JSON.stringify([{
        id: 'prop-50',
        label: 'Desktop 50K',
        accountSize: 50000,
        target: 3000,
        maxDailyLoss: 1100,
        maxDrawdown: 2000,
        minDays: 5,
        ddType: 'trailing',
        scope: 'own',
        sizeScale: 1
      }])
    })
    const desktopRevision = desktopSettings.accountStateUpdatedAt
    expect(getMobileAccountState()).toMatchObject({
      liveCapital: 5000,
      updatedAt: desktopRevision,
      propAccounts: [{ id: 'prop-50', label: 'Desktop 50K' }]
    })

    const newer = new Date(Date.parse(desktopRevision) + 1_000).toISOString()
    expect(mergeMobileAccountState({
      liveCapital: 7500,
      propAccounts: [{
        id: 'prop-100',
        label: 'Phone 100K',
        accountSize: 100000,
        target: 6000,
        maxDailyLoss: 2200,
        maxDrawdown: 3000,
        minDays: 5,
        ddType: 'static',
        scope: 'own',
        sizeScale: 1
      }]
    }, newer)).toMatchObject({
      liveCapital: 7500,
      updatedAt: newer,
      changed: true,
      propAccounts: [{ id: 'prop-100', label: 'Phone 100K', ddType: 'static' }]
    })
  })
})

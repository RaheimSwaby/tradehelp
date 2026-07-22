import Database from 'better-sqlite3'
import { app } from 'electron'
import { basename, extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { INSTRUMENT_PROFILE_DEFAULT_LIST, instrumentRootSymbol } from '../renderer/src/workflow.js'

let db
let imagesDir
let videosDir

export const TRADE_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024
const TRADE_VIDEO_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

export function initDb() {
  // Stored in the per-user app data dir so it survives app updates.
  db = new Database(join(app.getPath('userData'), 'tradehelp.db'))
  db.pragma('journal_mode = WAL')

  imagesDir = join(app.getPath('userData'), 'screenshots')
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
  videosDir = join(app.getPath('userData'), 'videos')
  if (!existsSync(videosDir)) mkdirSync(videosDir, { recursive: true })

  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      symbol TEXT, direction TEXT,
      entry REAL, exit REAL, stop REAL, target REAL, size REAL,
      riskAmount REAL, pnl REAL, fees REAL, rr REAL,
      emotion TEXT, setup TEXT, notes TEXT, timestamp TEXT,
      entryTime TEXT, exitTime TEXT, reason TEXT, source TEXT, account TEXT,
      selfSetup TEXT, selfExec TEXT
    );
    CREATE TABLE IF NOT EXISTS trade_fills (
      id TEXT PRIMARY KEY,
      tradeId TEXT,
      kind TEXT,
      side TEXT,
      quantity REAL,
      price REAL,
      fee REAL,
      filledAt TEXT,
      sequence INTEGER,
      sourceRef TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trade_fills_tradeId ON trade_fills(tradeId);
    CREATE INDEX IF NOT EXISTS idx_trade_fills_filledAt ON trade_fills(filledAt);
    CREATE TABLE IF NOT EXISTS instrument_profiles (
      id TEXT PRIMARY KEY,
      symbol TEXT UNIQUE,
      name TEXT,
      assetClass TEXT,
      tickSize REAL,
      tickValue REAL,
      quantityStep REAL,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      name TEXT,
      query TEXT,
      outcome TEXT,
      dismissedFilterIds TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      weekly REAL, monthly REAL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT
    );
    CREATE TABLE IF NOT EXISTS trade_images (
      id TEXT PRIMARY KEY,
      tradeId TEXT,
      file TEXT,
      tag TEXT,
      caption TEXT,
      createdAt TEXT,
      fingerprint TEXT DEFAULT '',
      fingerprintVersion INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_trade_images_tradeId ON trade_images(tradeId);
    CREATE TABLE IF NOT EXISTS trade_videos (
      id TEXT PRIMARY KEY,
      tradeId TEXT,
      file TEXT,
      originalName TEXT,
      mimeType TEXT,
      size INTEGER,
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trade_videos_tradeId ON trade_videos(tradeId);
    CREATE TABLE IF NOT EXISTS trade_plans (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'draft',
      symbol TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'Long',
      account TEXT DEFAULT '',
      setup TEXT DEFAULT '',
      plannedEntry REAL DEFAULT 0,
      plannedStop REAL DEFAULT 0,
      plannedTarget REAL DEFAULT 0,
      riskAmount REAL DEFAULT 0,
      confidence INTEGER DEFAULT 0,
      thesis TEXT DEFAULT '',
      invalidation TEXT DEFAULT '',
      plannedAt TEXT DEFAULT '',
      lockedAt TEXT DEFAULT '',
      resolvedAt TEXT DEFAULT '',
      linkedTradeId TEXT DEFAULT '',
      screenshotFile TEXT DEFAULT '',
      playbookEntryId TEXT DEFAULT '',
      plannedQuantity REAL DEFAULT 0,
      sizingTickSize REAL DEFAULT 0,
      sizingTickValue REAL DEFAULT 0,
      sizingQuantityStep REAL DEFAULT 0,
      sizingRiskPerUnit REAL DEFAULT 0,
      scoreVersion INTEGER DEFAULT 0,
      planScore REAL DEFAULT 0,
      executionScore REAL DEFAULT 0,
      scoreDetail TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trade_plans_plannedAt ON trade_plans(plannedAt);
    CREATE INDEX IF NOT EXISTS idx_trade_plans_linkedTradeId ON trade_plans(linkedTradeId);
    CREATE TABLE IF NOT EXISTS coach_commitments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ruleType TEXT NOT NULL,
      ruleValue TEXT DEFAULT '',
      targetCount INTEGER DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT DEFAULT 'manual',
      startAt TEXT NOT NULL,
      baselineTradeIds TEXT DEFAULT '[]',
      completedAt TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS commitment_results (
      commitmentId TEXT NOT NULL,
      tradeId TEXT NOT NULL,
      day TEXT DEFAULT '',
      adhered INTEGER NOT NULL DEFAULT 0,
      detail TEXT DEFAULT '',
      evaluatedAt TEXT,
      PRIMARY KEY (commitmentId, tradeId)
    );
    CREATE INDEX IF NOT EXISTS idx_commitment_results_tradeId ON commitment_results(tradeId);
    CREATE TABLE IF NOT EXISTS reviews (
      period TEXT PRIMARY KEY, text TEXT, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS playbook (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      criteria TEXT DEFAULT '',
      invalidation TEXT DEFAULT '',
      targets TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS day_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      reason TEXT DEFAULT '',
      mood TEXT DEFAULT '',
      note TEXT DEFAULT '',
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_day_logs_date ON day_logs(date);
    CREATE TABLE IF NOT EXISTS payouts (
      id TEXT PRIMARY KEY,
      accountId TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL DEFAULT 0,
      note TEXT DEFAULT '',
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payouts_account ON payouts(accountId);
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      sourceId TEXT DEFAULT '',
      fileName TEXT DEFAULT '',
      brokerKey TEXT DEFAULT '',
      brokerLabel TEXT DEFAULT '',
      account TEXT DEFAULT '',
      timezone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'completed',
      rowCount INTEGER DEFAULT 0,
      importedCount INTEGER DEFAULT 0,
      duplicateCount INTEGER DEFAULT 0,
      skippedCount INTEGER DEFAULT 0,
      warningCount INTEGER DEFAULT 0,
      warnings TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      rolledBackAt TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_import_batches_createdAt ON import_batches(createdAt);
    CREATE TABLE IF NOT EXISTS import_batch_trades (
      batchId TEXT NOT NULL,
      tradeId TEXT NOT NULL,
      sourceRow INTEGER DEFAULT 0,
      PRIMARY KEY (batchId, tradeId)
    );
    CREATE INDEX IF NOT EXISTS idx_import_batch_trades_tradeId ON import_batch_trades(tradeId);
    CREATE TABLE IF NOT EXISTS import_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folderPath TEXT NOT NULL,
      brokerKey TEXT DEFAULT '',
      account TEXT DEFAULT '',
      timezone TEXT DEFAULT '',
      trusted INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastScanAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS import_inbox (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fingerprint TEXT NOT NULL UNIQUE,
      size INTEGER DEFAULT 0,
      modifiedAt TEXT DEFAULT '',
      state TEXT NOT NULL DEFAULT 'pending',
      error TEXT DEFAULT '',
      detectedAt TEXT NOT NULL,
      importedAt TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_import_inbox_state ON import_inbox(state, detectedAt);
  `)

  // Migrate older DBs that predate columns added above.
  const tradeCols = new Set(db.prepare('PRAGMA table_info(trades)').all().map((c) => c.name))
  for (const [name, type] of [['entryTime', 'TEXT'], ['exitTime', 'TEXT'], ['reason', 'TEXT'], ['source', 'TEXT'], ['account', 'TEXT'], ['fees', 'REAL'], ['selfSetup', 'TEXT'], ['selfExec', 'TEXT']]) {
    if (!tradeCols.has(name)) db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`)
  }
  const imageCols = new Set(db.prepare('PRAGMA table_info(trade_images)').all().map((c) => c.name))
  if (!imageCols.has('fingerprint')) db.exec("ALTER TABLE trade_images ADD COLUMN fingerprint TEXT DEFAULT ''")
  if (!imageCols.has('fingerprintVersion')) db.exec('ALTER TABLE trade_images ADD COLUMN fingerprintVersion INTEGER DEFAULT 0')
  const planCols = new Set(db.prepare('PRAGMA table_info(trade_plans)').all().map((c) => c.name))
  for (const [name, definition] of [
    ['playbookEntryId', "TEXT DEFAULT ''"], ['plannedQuantity', 'REAL DEFAULT 0'],
    ['sizingTickSize', 'REAL DEFAULT 0'], ['sizingTickValue', 'REAL DEFAULT 0'],
    ['sizingQuantityStep', 'REAL DEFAULT 0'], ['sizingRiskPerUnit', 'REAL DEFAULT 0'],
    ['scoreVersion', 'INTEGER DEFAULT 0'], ['planScore', 'REAL DEFAULT 0'],
    ['executionScore', 'REAL DEFAULT 0'], ['scoreDetail', "TEXT DEFAULT ''"]
  ]) {
    if (!planCols.has(name)) db.exec(`ALTER TABLE trade_plans ADD COLUMN ${name} ${definition}`)
  }
  const commitmentCols = new Set(db.prepare('PRAGMA table_info(coach_commitments)').all().map((c) => c.name))
  if (!commitmentCols.has('baselineTradeIds')) db.exec("ALTER TABLE coach_commitments ADD COLUMN baselineTradeIds TEXT DEFAULT '[]'")

  db.prepare('INSERT OR IGNORE INTO goals (id, weekly, monthly) VALUES (1, 500, 2000)').run()

  const profileSeedKey = '_instrumentProfilesSeededV1'
  if (db.prepare('SELECT value FROM settings WHERE key = ?').get(profileSeedKey)?.value !== 'true') {
    const seedProfile = db.prepare(`INSERT OR IGNORE INTO instrument_profiles
      (id,symbol,name,assetClass,tickSize,tickValue,quantityStep,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    const seededAt = new Date().toISOString()
    const seedProfiles = db.transaction(() => {
      for (const profile of INSTRUMENT_PROFILE_DEFAULT_LIST) {
        seedProfile.run(profile.id, profile.symbol, profile.name, profile.assetClass, profile.tickSize, profile.tickValue, profile.quantityStep, seededAt, seededAt)
      }
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(profileSeedKey, 'true')
    })
    seedProfiles()
  }

  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) ins.run(k, String(v))
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function positiveNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be positive`)
  return number
}

function instrumentProfileRow(e = {}, current = {}, preserveUpdatedAt = false) {
  const symbol = String(e.symbol ?? current.symbol ?? '').trim().toUpperCase()
  if (!symbol) throw new Error('Instrument symbol is required')
  const now = new Date().toISOString()
  return {
    id: String(e.id || current.id || randomUUID()), symbol,
    name: String(e.name ?? current.name ?? '').trim(),
    assetClass: String(e.assetClass ?? current.assetClass ?? '').trim(),
    tickSize: positiveNumber(e.tickSize ?? current.tickSize, 'Tick size'),
    tickValue: positiveNumber(e.tickValue ?? current.tickValue, 'Tick value'),
    quantityStep: positiveNumber(e.quantityStep ?? current.quantityStep, 'Quantity step'),
    createdAt: String(current.createdAt || e.createdAt || now),
    updatedAt: preserveUpdatedAt ? String(e.updatedAt || e.createdAt || now) : now
  }
}

export function listInstrumentProfiles() {
  return db.prepare('SELECT * FROM instrument_profiles ORDER BY symbol ASC').all()
}

export function addInstrumentProfile(e = {}) {
  const row = instrumentProfileRow(e)
  if (db.prepare('SELECT 1 FROM instrument_profiles WHERE symbol = ?').get(row.symbol)) throw new Error('An instrument profile already uses that symbol')
  db.prepare(`INSERT INTO instrument_profiles
    (id,symbol,name,assetClass,tickSize,tickValue,quantityStep,createdAt,updatedAt)
    VALUES (@id,@symbol,@name,@assetClass,@tickSize,@tickValue,@quantityStep,@createdAt,@updatedAt)`).run(row)
  return listInstrumentProfiles()
}

export function updateInstrumentProfile(e = {}) {
  const current = db.prepare('SELECT * FROM instrument_profiles WHERE id = ?').get(String(e.id || ''))
  if (!current) return listInstrumentProfiles()
  const row = instrumentProfileRow(e, current)
  if (db.prepare('SELECT 1 FROM instrument_profiles WHERE symbol = ? AND id <> ?').get(row.symbol, row.id)) throw new Error('An instrument profile already uses that symbol')
  db.prepare(`UPDATE instrument_profiles SET symbol=@symbol,name=@name,assetClass=@assetClass,
    tickSize=@tickSize,tickValue=@tickValue,quantityStep=@quantityStep,updatedAt=@updatedAt WHERE id=@id`).run(row)
  return listInstrumentProfiles()
}

export function deleteInstrumentProfile(id) {
  db.prepare('DELETE FROM instrument_profiles WHERE id = ?').run(String(id))
  return listInstrumentProfiles()
}

function parseDismissedFilterIds(value) {
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function publicSavedSearch(row) {
  return row ? { ...row, dismissedFilterIds: parseDismissedFilterIds(row.dismissedFilterIds) } : null
}

export function listSavedSearches() {
  return db.prepare('SELECT * FROM saved_searches ORDER BY createdAt ASC, rowid ASC').all().map(publicSavedSearch)
}

export function addSavedSearch(e = {}) {
  const now = new Date().toISOString()
  const row = {
    id: String(e.id || randomUUID()), name: String(e.name || ''), query: String(e.query || ''),
    outcome: String(e.outcome || ''), dismissedFilterIds: JSON.stringify(parseDismissedFilterIds(e.dismissedFilterIds)),
    createdAt: String(e.createdAt || now), updatedAt: now
  }
  db.prepare(`INSERT INTO saved_searches (id,name,query,outcome,dismissedFilterIds,createdAt,updatedAt)
    VALUES (@id,@name,@query,@outcome,@dismissedFilterIds,@createdAt,@updatedAt)`).run(row)
  return listSavedSearches()
}

export function updateSavedSearch(e = {}) {
  const current = db.prepare('SELECT * FROM saved_searches WHERE id = ?').get(String(e.id || ''))
  if (!current) return listSavedSearches()
  const row = {
    id: current.id, name: String(e.name ?? current.name ?? ''), query: String(e.query ?? current.query ?? ''),
    outcome: String(e.outcome ?? current.outcome ?? ''),
    dismissedFilterIds: JSON.stringify(parseDismissedFilterIds(e.dismissedFilterIds ?? current.dismissedFilterIds)),
    updatedAt: new Date().toISOString()
  }
  db.prepare(`UPDATE saved_searches SET name=@name,query=@query,outcome=@outcome,
    dismissedFilterIds=@dismissedFilterIds,updatedAt=@updatedAt WHERE id=@id`).run(row)
  return listSavedSearches()
}

export function deleteSavedSearch(id) {
  db.prepare('DELETE FROM saved_searches WHERE id = ?').run(String(id))
  return listSavedSearches()
}

export function listTradeFills(tradeId) {
  return db.prepare(`SELECT id,tradeId,kind,side,quantity,price,fee,filledAt,sequence,sourceRef
    FROM trade_fills WHERE tradeId = ? ORDER BY sequence ASC, filledAt ASC, rowid ASC`).all(String(tradeId))
}

export function listTrades() {
  const rows = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM trade_images i WHERE i.tradeId = t.id) AS imageCount,
      (SELECT COUNT(*) FROM trade_videos v WHERE v.tradeId = t.id) AS videoCount
    FROM trades t
    ORDER BY t.timestamp ASC, t.rowid ASC
  `).all()
  return rows.map((row) => ({ ...row, fills: listTradeFills(row.id) }))
}

function buildRow(t) {
  return {
    id: String(t.id),
    symbol: String(t.symbol || ''),
    direction: String(t.direction || 'Long'),
    entry: num(t.entry), exit: num(t.exit), stop: num(t.stop),
    target: num(t.target), size: num(t.size),
    riskAmount: num(t.riskAmount), pnl: num(t.pnl), fees: num(t.fees), rr: num(t.rr),
    emotion: String(t.emotion || ''), setup: String(t.setup || ''),
    notes: String(t.notes || ''),
    timestamp: String(t.timestamp || new Date().toISOString().slice(0, 16).replace('T', ' ')),
    entryTime: String(t.entryTime || ''), exitTime: String(t.exitTime || ''),
    reason: String(t.reason || ''), source: String(t.source || 'manual'), account: String(t.account || ''),
    selfSetup: String(t.selfSetup || ''), selfExec: String(t.selfExec || '')
  }
}

const INSERT_TRADE = `
  INSERT INTO trades
    (id, symbol, direction, entry, exit, stop, target, size, riskAmount, pnl, fees, rr, emotion, setup, notes, timestamp, entryTime, exitTime, reason, source, account, selfSetup, selfExec)
  VALUES
    (@id, @symbol, @direction, @entry, @exit, @stop, @target, @size, @riskAmount, @pnl, @fees, @rr, @emotion, @setup, @notes, @timestamp, @entryTime, @exitTime, @reason, @source, @account, @selfSetup, @selfExec)
`

function sanitizeTradeFills(tradeId, fills) {
  if (!Array.isArray(fills) || fills.length === 0) throw new Error('At least one fill is required')
  return fills.map((fill, index) => {
    const kind = String(fill?.kind || '').trim().toLowerCase()
    const side = String(fill?.side || '').trim().toLowerCase()
    const quantity = Number(fill?.quantity)
    const price = Number(fill?.price)
    const fee = fill?.fee == null || fill.fee === '' ? 0 : Number(fill.fee)
    if (kind !== 'entry' && kind !== 'exit') throw new Error('Fill kind must be entry or exit')
    if (side !== 'buy' && side !== 'sell') throw new Error('Fill side must be buy or sell')
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Fill quantity must be positive')
    if (!Number.isFinite(price) || price <= 0) throw new Error('Fill price must be positive')
    if (!Number.isFinite(fee) || fee < 0) throw new Error('Fill fee cannot be negative')
    const sequenceValue = Number(fill?.sequence)
    return {
      id: String(fill?.id || randomUUID()), tradeId: String(tradeId), kind, side, quantity, price, fee,
      filledAt: String(fill?.filledAt || ''),
      sequence: Number.isInteger(sequenceValue) ? sequenceValue : index,
      sourceRef: String(fill?.sourceRef || ''), _index: index
    }
  })
}

function summarizeTradeFills(trade, fills) {
  const ordered = [...fills].sort((a, b) => a.sequence - b.sequence || a.filledAt.localeCompare(b.filledAt) || a._index - b._index)
  const firstEntry = ordered.find((fill) => fill.kind === 'entry')
  if (!firstEntry) throw new Error('At least one entry fill is required')
  const direction = firstEntry.side === 'buy' ? 'Long' : 'Short'
  const entrySide = direction === 'Long' ? 'buy' : 'sell'
  const exitSide = direction === 'Long' ? 'sell' : 'buy'
  const profileSymbol = String(trade.symbol || '').trim().toUpperCase()
  const profile = db.prepare('SELECT tickSize,tickValue FROM instrument_profiles WHERE symbol = ?').get(profileSymbol)
    || db.prepare('SELECT tickSize,tickValue FROM instrument_profiles WHERE symbol = ?').get(instrumentRootSymbol(profileSymbol))
  const multiplier = profile && Number(profile.tickSize) > 0 ? Number(profile.tickValue) / Number(profile.tickSize) : 1
  let exposure = 0
  let averageCost = 0
  let peakExposure = 0
  let realized = 0
  let fees = 0
  let entryQuantity = 0
  let entryNotional = 0
  let exitQuantity = 0
  let exitNotional = 0
  let entryTime = ''
  let exitTime = ''
  for (const fill of ordered) {
    fees += fill.fee
    if (fill.kind === 'entry') {
      if (fill.side !== entrySide) throw new Error(`${direction} entry fills must be ${entrySide}`)
      averageCost = ((averageCost * exposure) + (fill.price * fill.quantity)) / (exposure + fill.quantity)
      exposure += fill.quantity
      peakExposure = Math.max(peakExposure, exposure)
      entryQuantity += fill.quantity
      entryNotional += fill.price * fill.quantity
      if (!entryTime) entryTime = fill.filledAt
    } else {
      if (fill.side !== exitSide) throw new Error(`${direction} exit fills must be ${exitSide}`)
      if (exposure <= 0 || fill.quantity > exposure + 1e-9) throw new Error('Fill exits beyond the current exposure or flips the position')
      realized += (direction === 'Long' ? fill.price - averageCost : averageCost - fill.price) * fill.quantity * multiplier
      exposure = Math.max(0, exposure - fill.quantity)
      if (exposure === 0) averageCost = 0
      exitQuantity += fill.quantity
      exitNotional += fill.price * fill.quantity
      exitTime = fill.filledAt
    }
  }
  return {
    direction,
    entry: entryQuantity ? entryNotional / entryQuantity : 0,
    exit: exitQuantity ? exitNotional / exitQuantity : 0,
    size: peakExposure,
    fees,
    pnl: realized - fees,
    entryTime,
    exitTime
  }
}

const INSERT_FILL = dbRow => db.prepare(`INSERT INTO trade_fills
  (id,tradeId,kind,side,quantity,price,fee,filledAt,sequence,sourceRef)
  VALUES (@id,@tradeId,@kind,@side,@quantity,@price,@fee,@filledAt,@sequence,@sourceRef)`).run(dbRow)

function replaceTradeFillsInTransaction(tradeId, fills) {
  const key = String(tradeId)
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(key)
  if (!trade) throw new Error('Trade not found')
  const sanitized = sanitizeTradeFills(key, fills)
  const summary = summarizeTradeFills(trade, sanitized)
  db.prepare('DELETE FROM trade_fills WHERE tradeId = ?').run(key)
  for (const { _index, ...fill } of sanitized) INSERT_FILL(fill)
  db.prepare(`UPDATE trades SET direction=@direction,entry=@entry,exit=@exit,size=@size,fees=@fees,
    pnl=@pnl,entryTime=@entryTime,exitTime=@exitTime WHERE id=@id`).run({ id: key, ...summary })
}

export function replaceTradeFills(tradeId, fills) {
  db.transaction(() => replaceTradeFillsInTransaction(tradeId, fills))()
  refreshCommitmentResults()
  return listTradeFills(tradeId)
}

export function addTrade(t) {
  db.transaction(() => {
    db.prepare(INSERT_TRADE).run(buildRow(t))
    if (Array.isArray(t?.fills)) replaceTradeFillsInTransaction(t.id, t.fills)
  })()
  refreshCommitmentResults()
  return listTrades()
}

// Bulk insert from a broker CSV — flagged source='import' so the rating can show "Verified".
function parsedStringArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch { return [] }
}

function publicImportBatch(row) {
  return row ? { ...row, warnings: parsedStringArray(row.warnings) } : null
}

export function listImportBatches() {
  return db.prepare(`SELECT b.*,
    (SELECT COUNT(*) FROM import_batch_trades bt JOIN trades t ON t.id = bt.tradeId WHERE bt.batchId = b.id) AS remainingCount
    FROM import_batches b ORDER BY b.createdAt DESC, b.rowid DESC`).all().map(publicImportBatch)
}

export function importTradeBatch(list, meta = {}) {
  const rows = Array.isArray(list) ? list : []
  const now = new Date().toISOString()
  const batchId = String(meta.batchId || randomUUID())
  const warnings = Array.isArray(meta.warnings) ? meta.warnings.map(String).filter(Boolean).slice(0, 30) : []
  const batch = {
    id: batchId, sourceId: String(meta.sourceId || ''),
    fileName: String(meta.fileName || 'Manual CSV import').slice(0, 260),
    brokerKey: String(meta.brokerKey || ''), brokerLabel: String(meta.brokerLabel || ''),
    account: String(meta.account || ''), timezone: String(meta.timezone || ''), status: 'completed',
    rowCount: Math.max(0, Number(meta.rowCount) || rows.length), importedCount: rows.length,
    duplicateCount: Math.max(0, Number(meta.duplicateCount) || 0), skippedCount: Math.max(0, Number(meta.skippedCount) || 0),
    warningCount: Math.max(warnings.length, Number(meta.warningCount) || 0), warnings: JSON.stringify(warnings),
    createdAt: now, rolledBackAt: ''
  }
  const insertBatch = db.prepare(`INSERT INTO import_batches
    (id,sourceId,fileName,brokerKey,brokerLabel,account,timezone,status,rowCount,importedCount,duplicateCount,skippedCount,warningCount,warnings,createdAt,rolledBackAt)
    VALUES (@id,@sourceId,@fileName,@brokerKey,@brokerLabel,@account,@timezone,@status,@rowCount,@importedCount,@duplicateCount,@skippedCount,@warningCount,@warnings,@createdAt,@rolledBackAt)`)
  const insertTrade = db.prepare(INSERT_TRADE)
  const linkTrade = db.prepare('INSERT INTO import_batch_trades (batchId,tradeId,sourceRow) VALUES (?,?,?)')
  db.transaction(() => {
    insertBatch.run(batch)
    rows.forEach((trade, index) => {
      const row = buildRow({ ...trade, source: 'import' })
      insertTrade.run(row)
      linkTrade.run(batchId, row.id, Number(trade.sourceRow) || index + 2)
    })
  })()
  refreshCommitmentResults()
  return { trades: listTrades(), batch: publicImportBatch({ ...batch, remainingCount: rows.length }) }
}

// Backward-compatible bulk import used by older renderer builds and tests.
export function importTrades(list) {
  return importTradeBatch(list, { fileName: 'Manual CSV import' }).trades
}

export function rollbackImportBatch(id) {
  const key = String(id)
  const batch = db.prepare('SELECT * FROM import_batches WHERE id = ?').get(key)
  if (!batch) throw new Error('Import batch not found')
  if (batch.status === 'rolled_back') return { trades: listTrades(), batches: listImportBatches() }
  const tradeIds = db.prepare('SELECT tradeId FROM import_batch_trades WHERE batchId = ?').all(key).map((r) => r.tradeId)
  for (const tradeId of tradeIds) {
    for (const img of db.prepare('SELECT file FROM trade_images WHERE tradeId = ?').all(tradeId)) {
      try { unlinkSync(join(imagesDir, img.file)) } catch {}
    }
    for (const video of db.prepare('SELECT file FROM trade_videos WHERE tradeId = ?').all(tradeId)) {
      try { unlinkSync(join(videosDir, video.file)) } catch {}
    }
  }
  const now = new Date().toISOString()
  db.transaction(() => {
    const delImages = db.prepare('DELETE FROM trade_images WHERE tradeId = ?')
    const delVideos = db.prepare('DELETE FROM trade_videos WHERE tradeId = ?')
    const delFills = db.prepare('DELETE FROM trade_fills WHERE tradeId = ?')
    const delResults = db.prepare('DELETE FROM commitment_results WHERE tradeId = ?')
    const detachPlans = db.prepare("UPDATE trade_plans SET status = CASE WHEN status = 'executed' THEN 'locked' ELSE status END, linkedTradeId = '', resolvedAt = '', updatedAt = ? WHERE linkedTradeId = ?")
    const delTrade = db.prepare('DELETE FROM trades WHERE id = ?')
    for (const tradeId of new Set(tradeIds)) {
      delImages.run(tradeId); delVideos.run(tradeId); delFills.run(tradeId); delResults.run(tradeId)
      detachPlans.run(now, tradeId); delTrade.run(tradeId)
    }
    db.prepare("UPDATE import_batches SET status = 'rolled_back', rolledBackAt = ? WHERE id = ?").run(now, key)
  })()
  refreshCommitmentResults()
  return { trades: listTrades(), batches: listImportBatches() }
}

function publicImportSource(row) {
  return row ? { ...row, trusted: Boolean(row.trusted), enabled: Boolean(row.enabled) } : null
}

export function listImportSources() {
  return db.prepare('SELECT * FROM import_sources ORDER BY createdAt ASC, rowid ASC').all().map(publicImportSource)
}

export function saveImportSource(source = {}) {
  const now = new Date().toISOString()
  const current = source.id ? db.prepare('SELECT * FROM import_sources WHERE id = ?').get(String(source.id)) : null
  const row = {
    id: String(source.id || randomUUID()),
    name: String(source.name || current?.name || 'Broker exports').trim().slice(0, 80) || 'Broker exports',
    folderPath: String(source.folderPath || current?.folderPath || ''), brokerKey: String(source.brokerKey ?? current?.brokerKey ?? ''),
    account: String(source.account ?? current?.account ?? ''), timezone: String(source.timezone ?? current?.timezone ?? ''),
    trusted: source.trusted == null ? Number(current?.trusted || 0) : Number(Boolean(source.trusted)),
    enabled: source.enabled == null ? Number(current?.enabled ?? 1) : Number(Boolean(source.enabled)),
    createdAt: String(current?.createdAt || now), updatedAt: now, lastScanAt: String(current?.lastScanAt || now)
  }
  if (!row.folderPath) throw new Error('Choose a folder first')
  db.prepare(`INSERT INTO import_sources
    (id,name,folderPath,brokerKey,account,timezone,trusted,enabled,createdAt,updatedAt,lastScanAt)
    VALUES (@id,@name,@folderPath,@brokerKey,@account,@timezone,@trusted,@enabled,@createdAt,@updatedAt,@lastScanAt)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,folderPath=excluded.folderPath,brokerKey=excluded.brokerKey,
    account=excluded.account,timezone=excluded.timezone,trusted=excluded.trusted,enabled=excluded.enabled,updatedAt=excluded.updatedAt`).run(row)
  return listImportSources()
}

export function deleteImportSource(id) {
  const key = String(id)
  db.transaction(() => {
    db.prepare("UPDATE import_inbox SET state = 'dismissed' WHERE sourceId = ? AND state = 'pending'").run(key)
    db.prepare('DELETE FROM import_sources WHERE id = ?').run(key)
  })()
  return listImportSources()
}

export function updateImportSourceScan(id, at = new Date().toISOString()) {
  db.prepare('UPDATE import_sources SET lastScanAt = ?, updatedAt = ? WHERE id = ?').run(String(at), new Date().toISOString(), String(id))
}

export function getImportSource(id) {
  return publicImportSource(db.prepare('SELECT * FROM import_sources WHERE id = ?').get(String(id)))
}

export function recordImportInbox(entry = {}) {
  const fingerprint = String(entry.fingerprint || '')
  if (!fingerprint) throw new Error('Import file fingerprint is required')
  const existing = db.prepare('SELECT * FROM import_inbox WHERE fingerprint = ?').get(fingerprint)
  if (existing) return { created: false, item: existing }
  const row = {
    id: String(entry.id || randomUUID()), sourceId: String(entry.sourceId || ''), filePath: String(entry.filePath || ''),
    fileName: String(entry.fileName || ''), fingerprint, size: Math.max(0, Number(entry.size) || 0),
    modifiedAt: String(entry.modifiedAt || ''), state: 'pending', error: '', detectedAt: new Date().toISOString(), importedAt: ''
  }
  db.prepare(`INSERT INTO import_inbox
    (id,sourceId,filePath,fileName,fingerprint,size,modifiedAt,state,error,detectedAt,importedAt)
    VALUES (@id,@sourceId,@filePath,@fileName,@fingerprint,@size,@modifiedAt,@state,@error,@detectedAt,@importedAt)`).run(row)
  return { created: true, item: row }
}

export function listImportInbox(state = 'pending') {
  const where = state === 'all' ? '' : state === 'active' ? "WHERE i.state IN ('pending','error')" : 'WHERE i.state = ?'
  const args = state === 'all' || state === 'active' ? [] : [String(state)]
  return db.prepare(`SELECT i.*,s.name AS sourceName,s.brokerKey,s.account,s.timezone,s.trusted
    FROM import_inbox i LEFT JOIN import_sources s ON s.id = i.sourceId ${where}
    ORDER BY i.detectedAt DESC, i.rowid DESC`).all(...args).map((row) => ({ ...row, trusted: Boolean(row.trusted) }))
}

export function getImportInbox(id) {
  return db.prepare(`SELECT i.*,s.folderPath,s.name AS sourceName,s.brokerKey,s.account,s.timezone,s.trusted
    FROM import_inbox i LEFT JOIN import_sources s ON s.id = i.sourceId WHERE i.id = ?`).get(String(id)) || null
}

export function setImportInboxState(id, state, error = '') {
  const allowed = new Set(['pending', 'imported', 'dismissed', 'error'])
  const next = allowed.has(state) ? state : 'error'
  db.prepare('UPDATE import_inbox SET state = ?, error = ?, importedAt = ? WHERE id = ?')
    .run(next, String(error || ''), next === 'imported' ? new Date().toISOString() : '', String(id))
  return listImportInbox('active')
}

export function updateTrade(t) {
  const row = buildRow(t)
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE trades SET
      symbol=@symbol, direction=@direction, entry=@entry, exit=@exit, stop=@stop, target=@target,
      size=@size, riskAmount=@riskAmount, pnl=@pnl, fees=@fees, rr=@rr, emotion=@emotion, setup=@setup,
      notes=@notes, timestamp=@timestamp, entryTime=@entryTime, exitTime=@exitTime,
      reason=@reason, source=@source, account=@account, selfSetup=@selfSetup, selfExec=@selfExec WHERE id=@id`).run(row)
    if (Array.isArray(t?.fills)) replaceTradeFillsInTransaction(row.id, t.fills)
    const detach = db.prepare("UPDATE trade_plans SET status = 'locked', linkedTradeId = '', resolvedAt = '', updatedAt = ? WHERE id = ?")
    for (const plan of db.prepare('SELECT * FROM trade_plans WHERE linkedTradeId = ?').all(row.id)) {
      try { validatePlanLink(plan, row.id) } catch { detach.run(now, plan.id) }
    }
  })
  tx()
  refreshCommitmentResults()
  return listTrades()
}

export function deleteTrade(id) {
  const key = String(id)
  for (const img of db.prepare('SELECT file FROM trade_images WHERE tradeId = ?').all(key)) {
    try { unlinkSync(join(imagesDir, img.file)) } catch {}
  }
  for (const video of db.prepare('SELECT file FROM trade_videos WHERE tradeId = ?').all(key)) {
    try { unlinkSync(join(videosDir, video.file)) } catch {}
  }
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trade_images WHERE tradeId = ?').run(key)
    db.prepare('DELETE FROM trade_videos WHERE tradeId = ?').run(key)
    db.prepare('DELETE FROM trade_fills WHERE tradeId = ?').run(key)
    db.prepare(`DELETE FROM commitment_results WHERE tradeId = ? AND commitmentId IN
      (SELECT id FROM coach_commitments WHERE status = 'active')`).run(key)
    db.prepare("UPDATE trade_plans SET status = CASE WHEN status = 'executed' THEN 'locked' ELSE status END, linkedTradeId = '', resolvedAt = '', updatedAt = ? WHERE linkedTradeId = ?").run(now, key)
    db.prepare('DELETE FROM trades WHERE id = ?').run(key)
  })
  tx()
  refreshCommitmentResults()
  return listTrades()
}

export function getGoals() {
  return db.prepare('SELECT weekly, monthly FROM goals WHERE id = 1').get() || { weekly: 500, monthly: 2000 }
}

export function setGoals(g) {
  db.prepare('UPDATE goals SET weekly = ?, monthly = ? WHERE id = 1').run(num(g.weekly), num(g.monthly))
  return getGoals()
}

const SETTINGS_DEFAULTS = Object.freeze({
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  ollamaVisionModel: 'llama3.2-vision',
  cloudUrl: 'https://api.openai.com/v1',
  cloudModel: 'gpt-4o-mini',
  cloudKey: '',
  // Trade Mode: per-day circuit breaker + the trader's own pre-flight checklist.
  dailyGoal: '300',
  maxDailyLoss: '300',
  tradeRules: JSON.stringify([
    'Setup matches my written plan — not forcing it',
    'Risk is within my max per trade',
    'Stop-loss is set before I enter',
    'No high-impact news about to drop',
    'Not revenge trading or chasing'
  ]),
  // Ticker tape: keyless by default (Stooq/Binance). Add a Finnhub key for real-time stocks.
  tickerEnabled: 'true',
  tickerSymbols: 'SPY,QQQ,BTC,ETH',
  finnhubKey: '',
  // Economic calendar: keyless by default (ForexFactory). Add an FMP key for a fuller feed.
  eventsEnabled: 'true',
  fmpKey: '',
  eventsMinImpact: 'High',
  eventsLeadMin: '15',
  themePreset: 'classic',
  accentColor: 'amber',
  goTimeAccent: 'orange',
  pnlStyle: 'classic',
  fontStyle: 'default',
  themeMode: 'dark',
  backdrop: 'constellation',
  customBackgroundFile: '',
  customBackgroundOpacity: '22',
  customBackgroundBlur: '0',
  customBackgroundDim: '42',
  customBackgroundFit: 'cover',
  onboarded: '',
  liveCapital: '0',
  dailyReportEnabled: 'true',
  dailyReportSeen: '',
  feedbackPromptSeen: '',
  easterEggEnabled: 'true',
  easterEggSeen: '[]',
  lastSeenVersion: '',
  breakWeeks: '[]',
  onBreak: 'false',
  breakSince: '',
  // Journal and coach preferences.
  simpleJournal: 'false',
  customEmotions: '[]',
  customSetups: '[]',
  proactiveCoachEnabled: 'true',
  coachBriefSnapshot: '',
  coachBriefAttempt: '',
  coachBriefText: '',
  cloudJournalAccess: 'true',
  coachVoice: 'balanced',
  personalClockSource: 'auto',
  personalClockAlerts: 'true',
  personalClockAmbience: 'true',
  personalClockManualWindows: '[]'
})

const SETTINGS_KEYS = new Set([
  ...Object.keys(SETTINGS_DEFAULTS),
  'trialStart', 'licenseKey', 'licenseInstanceId', 'licenseStatus',
  'achievements', 'propFirmAccounts', 'propFirm',
])

const COACH_VOICES = new Set(['supportive', 'balanced', 'tough-love'])
const PERSONAL_CLOCK_SOURCES = new Set(['auto', 'manual'])
const PERSONAL_CLOCK_BOOLEAN_KEYS = new Set(['personalClockAlerts', 'personalClockAmbience'])
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function normalizeManualClockWindows(value) {
  let parsed
  try { parsed = Array.isArray(value) ? value : JSON.parse(String(value)) } catch { parsed = [] }
  if (!Array.isArray(parsed)) return '[]'
  const windows = parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const start = String(item.start ?? '').trim()
    const end = String(item.end ?? '').trim()
    return CLOCK_TIME.test(start) && CLOCK_TIME.test(end) && start !== end ? [{ start, end }] : []
  })
  return JSON.stringify(windows)
}

function normalizeSettingValue(key, value) {
  const stringValue = String(value)
  if (key === 'coachVoice') return COACH_VOICES.has(stringValue) ? stringValue : SETTINGS_DEFAULTS.coachVoice
  if (key === 'personalClockSource') return PERSONAL_CLOCK_SOURCES.has(stringValue) ? stringValue : SETTINGS_DEFAULTS.personalClockSource
  if (PERSONAL_CLOCK_BOOLEAN_KEYS.has(key)) return stringValue === 'true' || stringValue === 'false' ? stringValue : SETTINGS_DEFAULTS[key]
  if (key === 'personalClockManualWindows') return normalizeManualClockWindows(value)
  return stringValue
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const settings = { ...SETTINGS_DEFAULTS }
  for (const { key, value } of rows) {
    if (SETTINGS_KEYS.has(key)) settings[key] = normalizeSettingValue(key, value)
  }
  return settings
}

export function setSettings(s) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (SETTINGS_KEYS.has(key)) up.run(key, normalizeSettingValue(key, value))
    }
  })
  tx(s)
  return getSettings()
}

/* ───────── trade screenshots (files on disk; DB only holds the filename) ───────── */
const EXT_MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }
const WRITE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export function addImage(tradeId, { dataUrl, tag, caption, fingerprint = '', fingerprintVersion = 0 } = {}) {
  const m = String(dataUrl || '').match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) throw new Error('Bad image data')
  const ext = WRITE_MIME[m[1]]
  if (!ext) throw new Error('Unsupported image type')
  const normalizedFingerprint = fingerprint === '' ? '' : normalizeFingerprint(fingerprint)
  const normalizedVersion = fingerprint === '' && Number(fingerprintVersion) === 0 ? 0 : positiveFingerprintVersion(fingerprintVersion)
  const file = `${randomUUID()}.${ext}`
  writeFileSync(join(imagesDir, file), Buffer.from(m[2], 'base64'))
  const row = {
    id: randomUUID(), tradeId: String(tradeId), file,
    tag: String(tag || ''), caption: String(caption || ''), createdAt: new Date().toISOString(),
    fingerprint: normalizedFingerprint, fingerprintVersion: normalizedVersion
  }
  try {
    db.prepare(`INSERT INTO trade_images
      (id,tradeId,file,tag,caption,createdAt,fingerprint,fingerprintVersion)
      VALUES (@id,@tradeId,@file,@tag,@caption,@createdAt,@fingerprint,@fingerprintVersion)`).run(row)
  } catch (error) {
    try { unlinkSync(join(imagesDir, file)) } catch {}
    throw error
  }
  return { id: row.id, tradeId: row.tradeId, tag: row.tag, caption: row.caption, fingerprint: row.fingerprint, fingerprintVersion: row.fingerprintVersion }
}

// Returns metadata only — no file I/O. Call getImage(id) to fetch a single image's data URL.
export function listImages(tradeId) {
  return db
    .prepare('SELECT id,tradeId,tag,caption,fingerprint,fingerprintVersion FROM trade_images WHERE tradeId = ? ORDER BY rowid ASC')
    .all(String(tradeId))
}

// Reads one image from disk on demand. Returns null if the record or file is missing.
export function getImage(id) {
  const r = db.prepare('SELECT id,tradeId,file,tag,caption,fingerprint,fingerprintVersion FROM trade_images WHERE id = ?').get(String(id))
  if (!r) return null
  try {
    const mime = EXT_MIME[(r.file.split('.').pop() || 'png').toLowerCase()] || 'image/png'
    const dataUrl = `data:${mime};base64,${readFileSync(join(imagesDir, r.file)).toString('base64')}`
    return { id: r.id, tradeId: r.tradeId, tag: r.tag, caption: r.caption, fingerprint: r.fingerprint, fingerprintVersion: r.fingerprintVersion, dataUrl }
  } catch {
    return null
  }
}

function normalizeFingerprint(value) {
  const fingerprint = String(value || '').trim()
  if (!/^[0-9a-f]{16}$/i.test(fingerprint)) throw new Error('Fingerprint must be exactly 16 hexadecimal characters')
  return fingerprint.toLowerCase()
}

function positiveFingerprintVersion(value) {
  const version = Number(value)
  if (!Number.isInteger(version) || version <= 0) throw new Error('Fingerprint version must be a positive integer')
  return version
}

export function updateImageFingerprint(id, fingerprint, version) {
  const key = String(id)
  const row = db.prepare('SELECT tradeId FROM trade_images WHERE id = ?').get(key)
  if (!row) throw new Error('Image not found')
  db.prepare('UPDATE trade_images SET fingerprint = ?, fingerprintVersion = ? WHERE id = ?')
    .run(normalizeFingerprint(fingerprint), positiveFingerprintVersion(version), key)
  return listImages(row.tradeId)
}

export function deleteImage(id) {
  const row = db.prepare('SELECT file, tradeId FROM trade_images WHERE id = ?').get(String(id))
  if (!row) return []
  try { unlinkSync(join(imagesDir, row.file)) } catch {}
  db.prepare('DELETE FROM trade_images WHERE id = ?').run(String(id))
  return listImages(row.tradeId)
}

/* ───────── trade screen recordings (copied locally; streamed by the main process) ───────── */
export function inspectTradeVideoSource(sourcePath) {
  const path = String(sourcePath || '')
  const extension = extname(path).toLowerCase()
  const mimeType = TRADE_VIDEO_MIME[extension]
  if (!mimeType) throw new Error('Use an MP4, WebM, MOV, or M4V recording.')
  const stats = statSync(path)
  if (!stats.isFile()) throw new Error('The selected recording is not a file.')
  if (stats.size <= 0) throw new Error('The selected recording is empty.')
  if (stats.size > TRADE_VIDEO_MAX_BYTES) throw new Error('Each recording must be 2 GB or smaller.')
  return { sourcePath: path, originalName: basename(path), extension, mimeType, size: stats.size }
}

export function addTradeVideoFromPath(tradeId, sourcePath) {
  const key = String(tradeId || '')
  if (!db.prepare('SELECT 1 FROM trades WHERE id = ?').get(key)) throw new Error('Trade not found')
  const source = inspectTradeVideoSource(sourcePath)
  const file = `${randomUUID()}${source.extension}`
  const destination = join(videosDir, file)
  copyFileSync(source.sourcePath, destination)
  const row = {
    id: randomUUID(), tradeId: key, file,
    originalName: source.originalName.slice(0, 500), mimeType: source.mimeType,
    size: source.size, createdAt: new Date().toISOString()
  }
  try {
    db.prepare(`INSERT INTO trade_videos
      (id,tradeId,file,originalName,mimeType,size,createdAt)
      VALUES (@id,@tradeId,@file,@originalName,@mimeType,@size,@createdAt)`).run(row)
  } catch (error) {
    try { unlinkSync(destination) } catch {}
    throw error
  }
  return listTradeVideos(key)
}

export function listTradeVideos(tradeId) {
  return db.prepare(`SELECT id,tradeId,originalName,mimeType,size,createdAt
    FROM trade_videos WHERE tradeId = ? ORDER BY createdAt ASC, rowid ASC`).all(String(tradeId))
}

export function getTradeVideoFile(id) {
  const row = db.prepare(`SELECT id,tradeId,file,originalName,mimeType,size,createdAt
    FROM trade_videos WHERE id = ?`).get(String(id))
  if (!row) return null
  const path = join(videosDir, row.file)
  if (!existsSync(path)) return null
  return { ...row, path }
}

export function deleteTradeVideo(id) {
  const key = String(id)
  const row = db.prepare('SELECT file,tradeId FROM trade_videos WHERE id = ?').get(key)
  if (!row) return []
  try { unlinkSync(join(videosDir, row.file)) } catch {}
  db.prepare('DELETE FROM trade_videos WHERE id = ?').run(key)
  return listTradeVideos(row.tradeId)
}

/* ───────── pre-trade plans ───────── */
const PLAN_STATUSES = new Set(['draft', 'locked', 'executed', 'skipped', 'canceled'])
const PLAN_TRANSITIONS = {
  draft: new Set(['draft', 'locked']),
  locked: new Set(['locked', 'executed', 'skipped', 'canceled']),
  executed: new Set(['executed']),
  skipped: new Set(['skipped']),
  canceled: new Set(['canceled'])
}
const COMMITMENT_STATUSES = new Set(['active', 'completed', 'archived'])
const COMMITMENT_RULES = new Set(['max_trades_day', 'max_risk', 'latest_entry', 'setup_only', 'min_rr', 'require_stop', 'max_daily_loss'])

function localStamp(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace('T', ' ')
}

function storePlanScreenshot(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) throw new Error('Bad plan screenshot data')
  const ext = WRITE_MIME[m[1]]
  if (!ext) throw new Error('Unsupported plan screenshot type')
  const file = `plan-${randomUUID()}.${ext}`
  writeFileSync(join(imagesDir, file), Buffer.from(m[2], 'base64'))
  return file
}

function scoreDetailText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value)) } catch { return JSON.stringify(value) }
  }
  return JSON.stringify(value)
}

function parsedScoreDetail(value) {
  if (!value) return {}
  try { return JSON.parse(value) } catch { return value }
}

function publicPlan(row) {
  if (!row) return null
  const { screenshotFile, ...plan } = row
  return { ...plan, scoreDetail: parsedScoreDetail(plan.scoreDetail), hasScreenshot: Boolean(screenshotFile) }
}

function validatePlanLink(plan, tradeId) {
  const key = String(tradeId || '')
  if (!key) throw new Error('Choose an actual trade to link')
  const trade = db.prepare('SELECT id, symbol, account, entryTime, timestamp FROM trades WHERE id = ?').get(key)
  if (!trade) throw new Error('The selected trade no longer exists')
  if (String(trade.symbol || '').toUpperCase() !== String(plan.symbol || '').toUpperCase()) {
    throw new Error('The actual trade symbol must match the plan')
  }
  if (String(trade.account || '') !== String(plan.account || '')) {
    throw new Error('The actual trade must belong to the same account as the plan')
  }
  const lockedMs = Date.parse(String(plan.lockedAt || ''))
  if (Number.isFinite(lockedMs)) {
    const lockedMinute = Math.floor(lockedMs / 60000) * 60000
    if (tradeMoment(trade) < lockedMinute) throw new Error('The actual trade must occur after the plan was locked')
  }
  const existing = db.prepare("SELECT id FROM trade_plans WHERE linkedTradeId = ? AND linkedTradeId <> '' AND id <> ?").get(key, String(plan.id))
  if (existing) throw new Error('That trade is already linked to another plan')
  return key
}

export function listTradePlans() {
  return db.prepare('SELECT * FROM trade_plans ORDER BY plannedAt DESC, createdAt DESC').all().map(publicPlan)
}

export function getTradePlanScreenshot(id) {
  const row = db.prepare('SELECT screenshotFile FROM trade_plans WHERE id = ?').get(String(id))
  if (!row?.screenshotFile) return null
  try {
    const ext = (row.screenshotFile.split('.').pop() || 'png').toLowerCase()
    const mime = EXT_MIME[ext] || 'image/png'
    return { id: String(id), dataUrl: `data:${mime};base64,${readFileSync(join(imagesDir, row.screenshotFile)).toString('base64')}` }
  } catch {
    return null
  }
}

export function addTradePlan(e = {}) {
  const now = new Date().toISOString()
  const status = 'draft'
  let screenshotFile = ''
  if (e.screenshotDataUrl) screenshotFile = storePlanScreenshot(e.screenshotDataUrl)
  const row = {
    id: String(e.id || randomUUID()), status,
    symbol: String(e.symbol || '').trim().toUpperCase(), direction: e.direction === 'Short' ? 'Short' : 'Long',
    account: String(e.account || ''), setup: String(e.setup || '').trim(),
    plannedEntry: num(e.plannedEntry), plannedStop: num(e.plannedStop), plannedTarget: num(e.plannedTarget),
    riskAmount: num(e.riskAmount), confidence: Math.max(0, Math.min(100, Math.round(num(e.confidence)))),
    thesis: String(e.thesis || '').trim(), invalidation: String(e.invalidation || '').trim(),
    plannedAt: String(e.plannedAt || localStamp()),
    lockedAt: '', resolvedAt: '', linkedTradeId: '', screenshotFile,
    playbookEntryId: String(e.playbookEntryId || ''), plannedQuantity: num(e.plannedQuantity),
    sizingTickSize: num(e.sizingTickSize), sizingTickValue: num(e.sizingTickValue),
    sizingQuantityStep: num(e.sizingQuantityStep), sizingRiskPerUnit: num(e.sizingRiskPerUnit),
    scoreVersion: Math.max(0, Math.trunc(num(e.scoreVersion))), planScore: num(e.planScore),
    executionScore: num(e.executionScore), scoreDetail: scoreDetailText(e.scoreDetail),
    createdAt: now, updatedAt: now
  }
  try {
    db.prepare(`INSERT INTO trade_plans
      (id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,riskAmount,confidence,thesis,invalidation,
       plannedAt,lockedAt,resolvedAt,linkedTradeId,screenshotFile,playbookEntryId,plannedQuantity,sizingTickSize,sizingTickValue,
       sizingQuantityStep,sizingRiskPerUnit,scoreVersion,planScore,executionScore,scoreDetail,createdAt,updatedAt)
      VALUES (@id,@status,@symbol,@direction,@account,@setup,@plannedEntry,@plannedStop,@plannedTarget,@riskAmount,@confidence,
       @thesis,@invalidation,@plannedAt,@lockedAt,@resolvedAt,@linkedTradeId,@screenshotFile,@playbookEntryId,@plannedQuantity,
       @sizingTickSize,@sizingTickValue,@sizingQuantityStep,@sizingRiskPerUnit,@scoreVersion,@planScore,@executionScore,@scoreDetail,
       @createdAt,@updatedAt)`).run(row)
  } catch (error) {
    if (screenshotFile) { try { unlinkSync(join(imagesDir, screenshotFile)) } catch {} }
    throw error
  }
  return listTradePlans()
}

export function updateTradePlan(e = {}) {
  const current = db.prepare('SELECT * FROM trade_plans WHERE id = ?').get(String(e.id))
  if (!current) return listTradePlans()
  const requestedStatus = PLAN_STATUSES.has(e.status) ? e.status : current.status
  const allowed = PLAN_TRANSITIONS[current.status] || new Set([current.status])
  if (!allowed.has(requestedStatus)) throw new Error(`A ${current.status} plan cannot move to ${requestedStatus}`)

  const editable = current.status === 'draft' && !current.lockedAt
  let screenshotFile = current.screenshotFile || ''
  let newFile = ''
  if (editable && e.screenshotDataUrl) { newFile = storePlanScreenshot(e.screenshotDataUrl); screenshotFile = newFile }
  else if (editable && e.removeScreenshot) screenshotFile = ''

  const now = new Date().toISOString()
  const terminal = ['executed', 'skipped', 'canceled'].includes(requestedStatus)
  const source = editable ? { ...current, ...e } : current
  const linkingExecution = current.status === 'locked' && requestedStatus === 'executed'
  const linkedTradeId = requestedStatus === 'executed'
    ? validatePlanLink(current, current.status === 'executed' ? current.linkedTradeId : e.linkedTradeId)
    : ''
  const row = {
    id: current.id, status: requestedStatus,
    symbol: String(source.symbol || '').trim().toUpperCase(), direction: source.direction === 'Short' ? 'Short' : 'Long',
    account: String(source.account || ''), setup: String(source.setup || '').trim(),
    plannedEntry: num(source.plannedEntry), plannedStop: num(source.plannedStop), plannedTarget: num(source.plannedTarget),
    riskAmount: num(source.riskAmount), confidence: Math.max(0, Math.min(100, Math.round(num(source.confidence)))),
    thesis: String(source.thesis || '').trim(), invalidation: String(source.invalidation || '').trim(),
    plannedAt: String(source.plannedAt || current.plannedAt || localStamp()),
    lockedAt: requestedStatus === 'draft' ? '' : String(current.lockedAt || e.lockedAt || now),
    resolvedAt: terminal ? String(current.resolvedAt || e.resolvedAt || now) : '',
    linkedTradeId, screenshotFile,
    playbookEntryId: String(source.playbookEntryId || ''), plannedQuantity: num(source.plannedQuantity),
    sizingTickSize: num(source.sizingTickSize), sizingTickValue: num(source.sizingTickValue),
    sizingQuantityStep: num(source.sizingQuantityStep), sizingRiskPerUnit: num(source.sizingRiskPerUnit),
    scoreVersion: Math.max(0, Math.trunc(num(source.scoreVersion))), planScore: num(source.planScore),
    executionScore: num(linkingExecution ? e.executionScore : source.executionScore),
    scoreDetail: scoreDetailText(linkingExecution ? (e.scoreDetail ?? current.scoreDetail) : source.scoreDetail),
    createdAt: current.createdAt, updatedAt: now
  }
  try {
    db.prepare(`UPDATE trade_plans SET
      status=@status,symbol=@symbol,direction=@direction,account=@account,setup=@setup,
      plannedEntry=@plannedEntry,plannedStop=@plannedStop,plannedTarget=@plannedTarget,riskAmount=@riskAmount,
      confidence=@confidence,thesis=@thesis,invalidation=@invalidation,plannedAt=@plannedAt,lockedAt=@lockedAt,
      resolvedAt=@resolvedAt,linkedTradeId=@linkedTradeId,screenshotFile=@screenshotFile,
      playbookEntryId=@playbookEntryId,plannedQuantity=@plannedQuantity,sizingTickSize=@sizingTickSize,
      sizingTickValue=@sizingTickValue,sizingQuantityStep=@sizingQuantityStep,sizingRiskPerUnit=@sizingRiskPerUnit,
      scoreVersion=@scoreVersion,planScore=@planScore,executionScore=@executionScore,scoreDetail=@scoreDetail,
      updatedAt=@updatedAt WHERE id=@id`).run(row)
  } catch (error) {
    if (newFile) { try { unlinkSync(join(imagesDir, newFile)) } catch {} }
    throw error
  }
  if (current.screenshotFile && current.screenshotFile !== screenshotFile) { try { unlinkSync(join(imagesDir, current.screenshotFile)) } catch {} }
  return listTradePlans()
}

export function deleteTradePlan(id) {
  const key = String(id)
  const row = db.prepare('SELECT status, screenshotFile FROM trade_plans WHERE id = ?').get(key)
  if (!row) return listTradePlans()
  if (row.status !== 'draft') throw new Error('Only draft plans can be deleted')
  db.prepare('DELETE FROM trade_plans WHERE id = ?').run(key)
  if (row.screenshotFile) { try { unlinkSync(join(imagesDir, row.screenshotFile)) } catch {} }
  return listTradePlans()
}

/* ───────── coach commitments ───────── */
function tradeMoment(t) {
  const raw = String(t.entryTime || t.timestamp || '')
  const ms = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T'))
  return Number.isFinite(ms) ? ms : 0
}

function tradeDay(t) { return String(t.entryTime || t.timestamp || '').slice(0, 10) }

function evaluateCommitment(c, t, dayPosition, dayPnlBefore = 0) {
  if (c.ruleType === 'max_trades_day') {
    const limit = Math.max(1, parseInt(c.ruleValue, 10) || 1)
    return { adhered: dayPosition <= limit, detail: `Trade ${dayPosition} of ${limit} allowed today` }
  }
  if (c.ruleType === 'max_risk') {
    const limit = Math.max(0, Number(c.ruleValue) || 0)
    const risk = Math.abs(Number(t.riskAmount) || 0)
    return { adhered: risk > 0 && risk <= limit, detail: risk > 0 ? `Risk $${risk.toFixed(2)} · limit $${limit.toFixed(2)}` : 'No risk amount recorded' }
  }
  if (c.ruleType === 'latest_entry') {
    const [h, m] = String(c.ruleValue || '').split(':').map(Number)
    const raw = String(t.entryTime || t.timestamp || '')
    const match = raw.match(/[T ](\d{1,2}):(\d{2})/)
    const entryMinutes = match ? Number(match[1]) * 60 + Number(match[2]) : NaN
    const limitMinutes = Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
    return { adhered: Number.isFinite(entryMinutes) && Number.isFinite(limitMinutes) && entryMinutes <= limitMinutes, detail: match ? `Entered ${match[1]}:${match[2]} · cutoff ${c.ruleValue}` : 'No entry time recorded' }
  }
  if (c.ruleType === 'min_rr') {
    const min = Math.max(0, Number(c.ruleValue) || 0)
    const rr = Number(t.rr) || 0
    return { adhered: rr > 0 && rr >= min, detail: rr > 0 ? `R:R 1:${rr.toFixed(2)} · min 1:${min}` : 'No R:R recorded' }
  }
  if (c.ruleType === 'require_stop') {
    const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0
    const ok = stop > 0 && entry > 0 && (t.direction === 'Long' ? stop < entry : stop > entry)
    return { adhered: ok, detail: ok ? 'Stop-loss set before entry' : 'No stop-loss recorded' }
  }
  if (c.ruleType === 'max_daily_loss') {
    const limit = Math.max(0, Number(c.ruleValue) || 0)
    return { adhered: dayPnlBefore > -limit, detail: `Day P&L $${dayPnlBefore.toFixed(2)} at entry · stop by -$${limit.toFixed(2)}` }
  }
  const allowed = String(c.ruleValue || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
  const setup = String(t.setup || '').trim().toLowerCase()
  return { adhered: Boolean(setup) && allowed.includes(setup), detail: setup ? `Setup ${t.setup} · allowed ${c.ruleValue}` : 'No setup recorded' }
}

function parseBaselineTradeIds(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function refreshCommitmentResults(onlyId = '', includeCompleted = false) {
  const statusFilter = includeCompleted ? "status IN ('active','completed')" : "status = 'active'"
  const commitments = onlyId
    ? db.prepare(`SELECT * FROM coach_commitments WHERE id = ? AND ${statusFilter}`).all(String(onlyId))
    : db.prepare(`SELECT * FROM coach_commitments WHERE ${statusFilter}`).all()
  if (!commitments.length) return
  const trades = db.prepare("SELECT * FROM trades ORDER BY COALESCE(NULLIF(entryTime, ''), timestamp) ASC, rowid ASC").all()
  const dayCounts = new Map()
  const dayPositionByTrade = new Map()
  const dayRunningPnl = new Map()
  const dayPnlBeforeTrade = new Map()
  for (const trade of trades) {
    const day = tradeDay(trade)
    const position = (dayCounts.get(day) || 0) + 1
    dayCounts.set(day, position)
    dayPositionByTrade.set(String(trade.id), position)
    dayPnlBeforeTrade.set(String(trade.id), dayRunningPnl.get(day) || 0)
    dayRunningPnl.set(day, (dayRunningPnl.get(day) || 0) + (Number(trade.pnl) || 0))
  }
  const remove = db.prepare('DELETE FROM commitment_results WHERE commitmentId = ?')
  const insert = db.prepare(`INSERT INTO commitment_results
    (commitmentId,tradeId,day,adhered,detail,evaluatedAt) VALUES (?,?,?,?,?,?)`)
  const setProgress = db.prepare('UPDATE coach_commitments SET status = ?, completedAt = ?, updatedAt = ? WHERE id = ?')
  const tx = db.transaction((items) => {
    for (const c of items) {
      remove.run(c.id)
      const startMs = Date.parse(c.startAt) || 0
      const baseline = parseBaselineTradeIds(c.baselineTradeIds)
      const target = Math.max(1, parseInt(c.targetCount, 10) || 10)
      const eligible = trades
        .filter((t) => !baseline.has(String(t.id)) && tradeMoment(t) >= startMs)
        .slice(0, target)
      for (const t of eligible) {
        const day = tradeDay(t)
        const result = evaluateCommitment(c, t, dayPositionByTrade.get(String(t.id)) || 1, dayPnlBeforeTrade.get(String(t.id)) || 0)
        insert.run(c.id, String(t.id), day, result.adhered ? 1 : 0, result.detail, new Date().toISOString())
      }
      const completed = c.status === 'completed' || eligible.length >= target
      const nextStatus = completed ? 'completed' : 'active'
      const completedAt = completed ? (c.completedAt || new Date().toISOString()) : ''
      if (c.status !== nextStatus || c.completedAt !== completedAt) setProgress.run(nextStatus, completedAt, new Date().toISOString(), c.id)
    }
  })
  tx(commitments)
}

export function listCoachCommitments() {
  const rows = db.prepare('SELECT * FROM coach_commitments ORDER BY createdAt DESC').all()
  const getResults = db.prepare('SELECT tradeId, day, adhered, detail, evaluatedAt FROM commitment_results WHERE commitmentId = ? ORDER BY evaluatedAt ASC')
  return rows.map((row) => {
    const results = getResults.all(row.id).map((r) => ({ ...r, adhered: Boolean(r.adhered) }))
    const adheredCount = results.filter((r) => r.adhered).length
    return {
      ...row, targetCount: Number(row.targetCount) || 10, results,
      evaluatedCount: results.length, adheredCount,
      adherenceRate: results.length ? (adheredCount / results.length) * 100 : 0
    }
  })
}

export function addCoachCommitment(e = {}) {
  const now = new Date().toISOString()
  const baselineTradeIds = JSON.stringify(db.prepare('SELECT id FROM trades').all().map((trade) => String(trade.id)))
  const row = {
    id: String(e.id || randomUUID()), title: String(e.title || '').trim(),
    ruleType: COMMITMENT_RULES.has(e.ruleType) ? e.ruleType : 'max_trades_day',
    ruleValue: String(e.ruleValue || ''), targetCount: Math.max(1, Math.min(100, parseInt(e.targetCount, 10) || 10)),
    status: 'active', source: String(e.source || 'manual'), startAt: localStamp(), baselineTradeIds,
    completedAt: '', createdAt: now, updatedAt: now
  }
  if (!row.title) throw new Error('Commitment title is required')
  const tx = db.transaction(() => {
    db.prepare("UPDATE coach_commitments SET status = 'archived', updatedAt = ? WHERE status = 'active'").run(now)
    db.prepare(`INSERT INTO coach_commitments
      (id,title,ruleType,ruleValue,targetCount,status,source,startAt,baselineTradeIds,completedAt,createdAt,updatedAt)
      VALUES (@id,@title,@ruleType,@ruleValue,@targetCount,@status,@source,@startAt,@baselineTradeIds,@completedAt,@createdAt,@updatedAt)`).run(row)
  })
  tx()
  refreshCommitmentResults(row.id)
  return listCoachCommitments()
}

export function updateCoachCommitment(e = {}) {
  const current = db.prepare('SELECT * FROM coach_commitments WHERE id = ?').get(String(e.id))
  if (!current) return listCoachCommitments()
  const status = COMMITMENT_STATUSES.has(e.status) ? e.status : current.status
  if (current.status !== 'active') {
    if (status !== current.status) throw new Error('Completed and archived commitments cannot be changed')
    return listCoachCommitments()
  }
  if (status !== 'active' && status !== 'archived') throw new Error(`An active commitment cannot move to ${status}`)
  const now = new Date().toISOString()
  db.prepare("UPDATE coach_commitments SET status = ?, completedAt = '', updatedAt = ? WHERE id = ?").run(status, now, current.id)
  if (status === 'active') refreshCommitmentResults(current.id)
  return listCoachCommitments()
}

export function deleteCoachCommitment(id) {
  const key = String(id)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM commitment_results WHERE commitmentId = ?').run(key)
    db.prepare('DELETE FROM coach_commitments WHERE id = ?').run(key)
  })
  tx()
  return listCoachCommitments()
}

/* ───────── periodic reviews (keyed by a period string e.g. 2026-06, 2026-Q2, a week's Monday) ───────── */
export function getReviews() {
  const o = {}
  for (const r of db.prepare('SELECT period, text FROM reviews').all()) o[r.period] = r.text
  return o
}

export function setReview(period, text) {
  db.prepare('INSERT INTO reviews (period, text, updatedAt) VALUES (?, ?, ?) ON CONFLICT(period) DO UPDATE SET text = excluded.text, updatedAt = excluded.updatedAt')
    .run(String(period), String(text || ''), new Date().toISOString())
  return getReviews()
}

/* ───────── backup / export / import ───────── */
const SECRET_KEYS = ['cloudKey', 'finnhubKey', 'fmpKey', 'licenseKey', 'licenseInstanceId']

// Portable JSON snapshot of journal records (API keys and binary attachments excluded).
export function getAllData() {
  const settings = getSettings()
  for (const k of SECRET_KEYS) delete settings[k]
  return {
    app: 'tradehelp', version: 5, exportedAt: new Date().toISOString(),
    trades: db.prepare('SELECT * FROM trades').all(),
    tradeFills: db.prepare(`SELECT id,tradeId,kind,side,quantity,price,fee,filledAt,sequence,sourceRef
      FROM trade_fills ORDER BY tradeId,sequence,filledAt,rowid`).all(),
    instrumentProfiles: listInstrumentProfiles(),
    savedSearches: listSavedSearches(),
    tradePlans: db.prepare(`SELECT id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,
      riskAmount,confidence,thesis,invalidation,plannedAt,lockedAt,resolvedAt,linkedTradeId,playbookEntryId,
      plannedQuantity,sizingTickSize,sizingTickValue,sizingQuantityStep,sizingRiskPerUnit,scoreVersion,planScore,
      executionScore,scoreDetail,createdAt,updatedAt FROM trade_plans`).all().map((plan) => ({ ...plan, scoreDetail: parsedScoreDetail(plan.scoreDetail) })),
    commitments: db.prepare('SELECT * FROM coach_commitments').all(),
    commitmentResults: db.prepare('SELECT * FROM commitment_results').all(),
    playbook: listPlaybook(),
    dayLogs: listDayLogs(),
    payouts: listPayouts(),
    importBatches: listImportBatches(),
    importBatchTrades: db.prepare('SELECT batchId,tradeId,sourceRow FROM import_batch_trades ORDER BY batchId,sourceRow').all(),
    goals: getGoals(),
    reviews: getReviews(),
    settings
  }
}

export function restoreData(data) {
  const version = Number(data?.version || 3)
  if (version !== 3 && version !== 4 && version !== 5) throw new Error('Unsupported backup version')
  const tx = db.transaction((d) => {
    if (Array.isArray(d.trades)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO trades
        (id, symbol, direction, entry, exit, stop, target, size, riskAmount, pnl, fees, rr, emotion, setup, notes, timestamp, entryTime, exitTime, reason, source, account, selfSetup, selfExec)
        VALUES (@id,@symbol,@direction,@entry,@exit,@stop,@target,@size,@riskAmount,@pnl,@fees,@rr,@emotion,@setup,@notes,@timestamp,@entryTime,@exitTime,@reason,@source,@account,@selfSetup,@selfExec)`)
      for (const t of d.trades) ins.run(buildRow(t))
    }
    if (Array.isArray(d.instrumentProfiles)) {
      const insert = db.prepare(`INSERT OR REPLACE INTO instrument_profiles
        (id,symbol,name,assetClass,tickSize,tickValue,quantityStep,createdAt,updatedAt)
        VALUES (@id,@symbol,@name,@assetClass,@tickSize,@tickValue,@quantityStep,@createdAt,@updatedAt)`)
      for (const profile of d.instrumentProfiles) insert.run(instrumentProfileRow(profile, {}, true))
    }
    if (Array.isArray(d.tradeFills)) {
      const grouped = new Map()
      const restoredTradeIds = new Set(Array.isArray(d.trades) ? d.trades.map((trade) => String(trade.id || '')).filter(Boolean) : [])
      for (const fill of d.tradeFills) {
        const tradeId = String(fill?.tradeId || '')
        if (!tradeId) continue
        restoredTradeIds.add(tradeId)
        if (!grouped.has(tradeId)) grouped.set(tradeId, [])
        grouped.get(tradeId).push(fill)
      }
      const tradeExists = db.prepare('SELECT 1 FROM trades WHERE id = ?')
      const remove = db.prepare('DELETE FROM trade_fills WHERE tradeId = ?')
      for (const tradeId of restoredTradeIds) remove.run(tradeId)
      for (const [tradeId, fills] of grouped) {
        if (tradeExists.get(tradeId)) replaceTradeFillsInTransaction(tradeId, fills)
      }
    }
    if (Array.isArray(d.savedSearches)) {
      const upsert = db.prepare(`INSERT INTO saved_searches (id,name,query,outcome,dismissedFilterIds,createdAt,updatedAt)
        VALUES (@id,@name,@query,@outcome,@dismissedFilterIds,@createdAt,@updatedAt)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,query=excluded.query,outcome=excluded.outcome,
        dismissedFilterIds=excluded.dismissedFilterIds,updatedAt=excluded.updatedAt`)
      for (const search of d.savedSearches) {
        const now = new Date().toISOString()
        upsert.run({
          id: String(search.id || randomUUID()), name: String(search.name || ''), query: String(search.query || ''),
          outcome: String(search.outcome || ''), dismissedFilterIds: JSON.stringify(parseDismissedFilterIds(search.dismissedFilterIds)),
          createdAt: String(search.createdAt || now), updatedAt: String(search.updatedAt || now)
        })
      }
    }
    if (Array.isArray(d.tradePlans)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO trade_plans
        (id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,riskAmount,confidence,thesis,invalidation,
         plannedAt,lockedAt,resolvedAt,linkedTradeId,screenshotFile,playbookEntryId,plannedQuantity,sizingTickSize,sizingTickValue,
         sizingQuantityStep,sizingRiskPerUnit,scoreVersion,planScore,executionScore,scoreDetail,createdAt,updatedAt)
        VALUES (@id,@status,@symbol,@direction,@account,@setup,@plannedEntry,@plannedStop,@plannedTarget,@riskAmount,@confidence,
         @thesis,@invalidation,@plannedAt,@lockedAt,@resolvedAt,@linkedTradeId,@screenshotFile,@playbookEntryId,@plannedQuantity,
         @sizingTickSize,@sizingTickValue,@sizingQuantityStep,@sizingRiskPerUnit,@scoreVersion,@planScore,@executionScore,@scoreDetail,
         @createdAt,@updatedAt)`)
      const existingScreenshot = db.prepare('SELECT screenshotFile FROM trade_plans WHERE id = ?')
      const clearRestoredLink = db.prepare("UPDATE trade_plans SET linkedTradeId = '', resolvedAt = '', status = CASE WHEN status = 'executed' THEN 'locked' ELSE status END WHERE id = ?")
      for (const plan of d.tradePlans) {
        if (plan?.id) clearRestoredLink.run(String(plan.id))
      }
      for (const p of d.tradePlans) {
        const planId = String(p.id || randomUUID())
        const symbol = String(p.symbol || '').toUpperCase()
        const account = String(p.account || '')
        let status = PLAN_STATUSES.has(p.status) ? p.status : 'draft'
        const lockedAt = status === 'draft' ? '' : String(p.lockedAt || p.createdAt || new Date().toISOString())
        let linkedTradeId = ''
        if (status === 'executed') {
          try {
            linkedTradeId = validatePlanLink({ id: planId, symbol, account, lockedAt }, p.linkedTradeId)
          } catch {
            status = 'locked'
          }
        }
        const terminal = ['executed', 'skipped', 'canceled'].includes(status)
        ins.run({
          id: planId, status,
          symbol, direction: p.direction === 'Short' ? 'Short' : 'Long',
          account, setup: String(p.setup || ''),
          plannedEntry: num(p.plannedEntry), plannedStop: num(p.plannedStop), plannedTarget: num(p.plannedTarget),
          riskAmount: num(p.riskAmount), confidence: Math.max(0, Math.min(100, Math.round(num(p.confidence)))),
          thesis: String(p.thesis || ''), invalidation: String(p.invalidation || ''),
          plannedAt: String(p.plannedAt || localStamp()), lockedAt,
          resolvedAt: terminal ? String(p.resolvedAt || p.updatedAt || new Date().toISOString()) : '', linkedTradeId,
          screenshotFile: String(existingScreenshot.get(planId)?.screenshotFile || ''),
          playbookEntryId: String(p.playbookEntryId || ''), plannedQuantity: num(p.plannedQuantity),
          sizingTickSize: num(p.sizingTickSize), sizingTickValue: num(p.sizingTickValue),
          sizingQuantityStep: num(p.sizingQuantityStep), sizingRiskPerUnit: num(p.sizingRiskPerUnit),
          scoreVersion: Math.max(0, Math.trunc(num(p.scoreVersion))), planScore: num(p.planScore),
          executionScore: num(p.executionScore), scoreDetail: scoreDetailText(p.scoreDetail),
          createdAt: String(p.createdAt || new Date().toISOString()), updatedAt: String(p.updatedAt || new Date().toISOString())
        })
      }
    }
    if (Array.isArray(d.commitments)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO coach_commitments
        (id,title,ruleType,ruleValue,targetCount,status,source,startAt,baselineTradeIds,completedAt,createdAt,updatedAt)
        VALUES (@id,@title,@ruleType,@ruleValue,@targetCount,@status,@source,@startAt,@baselineTradeIds,@completedAt,@createdAt,@updatedAt)`)
      const newestActiveId = d.commitments
        .filter((commitment) => commitment.status === 'active')
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]?.id
      if (newestActiveId) db.prepare("UPDATE coach_commitments SET status = 'archived', updatedAt = ? WHERE status = 'active'").run(new Date().toISOString())
      for (const c of d.commitments) {
        const id = String(c.id || randomUUID())
        let status = COMMITMENT_STATUSES.has(c.status) ? c.status : 'archived'
        if (status === 'active' && String(c.id) !== String(newestActiveId)) status = 'archived'
        ins.run({
          id, title: String(c.title || 'Trading focus'),
          ruleType: COMMITMENT_RULES.has(c.ruleType) ? c.ruleType : 'max_trades_day', ruleValue: String(c.ruleValue || ''),
          targetCount: Math.max(1, Math.min(100, parseInt(c.targetCount, 10) || 10)),
          status, source: String(c.source || 'manual'),
          startAt: String(c.startAt || localStamp()), baselineTradeIds: JSON.stringify([...parseBaselineTradeIds(c.baselineTradeIds)]),
          completedAt: status === 'completed' ? String(c.completedAt || new Date().toISOString()) : '',
          createdAt: String(c.createdAt || new Date().toISOString()), updatedAt: String(c.updatedAt || new Date().toISOString())
        })
      }
    }
    if (Array.isArray(d.commitmentResults)) {
      const restoredCommitmentIds = new Set([
        ...(Array.isArray(d.commitments) ? d.commitments.map((commitment) => String(commitment.id || '')) : []),
        ...d.commitmentResults.map((result) => String(result.commitmentId || ''))
      ].filter(Boolean))
      const remove = db.prepare('DELETE FROM commitment_results WHERE commitmentId = ?')
      for (const commitmentId of restoredCommitmentIds) remove.run(commitmentId)
      const commitmentExists = db.prepare('SELECT 1 FROM coach_commitments WHERE id = ?')
      const ins = db.prepare(`INSERT OR REPLACE INTO commitment_results
        (commitmentId,tradeId,day,adhered,detail,evaluatedAt) VALUES (?,?,?,?,?,?)`)
      for (const result of d.commitmentResults) {
        const commitmentId = String(result.commitmentId || '')
        const tradeId = String(result.tradeId || '')
        if (!commitmentId || !tradeId || !commitmentExists.get(commitmentId)) continue
        ins.run(commitmentId, tradeId, String(result.day || '').slice(0, 10), result.adhered ? 1 : 0, String(result.detail || ''), String(result.evaluatedAt || new Date().toISOString()))
      }
    }
    if (Array.isArray(d.playbook)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO playbook
        (id,name,description,criteria,invalidation,targets,notes,createdAt,updatedAt)
        VALUES (@id,@name,@description,@criteria,@invalidation,@targets,@notes,@createdAt,@updatedAt)`)
      for (const entry of d.playbook) {
        const now = new Date().toISOString()
        ins.run({
          id: String(entry.id || randomUUID()), name: String(entry.name || ''), description: String(entry.description || ''),
          criteria: String(entry.criteria || ''), invalidation: String(entry.invalidation || ''),
          targets: String(entry.targets || ''), notes: String(entry.notes || ''),
          createdAt: String(entry.createdAt || now), updatedAt: String(entry.updatedAt || now)
        })
      }
    }
    if (Array.isArray(d.dayLogs)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO day_logs (id,date,reason,mood,note,createdAt)
        VALUES (@id,@date,@reason,@mood,@note,@createdAt)`)
      for (const entry of d.dayLogs) {
        ins.run({
          id: String(entry.id || randomUUID()), date: String(entry.date || '').slice(0, 10),
          reason: String(entry.reason || ''), mood: String(entry.mood || ''), note: String(entry.note || ''),
          createdAt: String(entry.createdAt || new Date().toISOString())
        })
      }
    }
    if (Array.isArray(d.payouts)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO payouts (id,accountId,date,amount,note,createdAt)
        VALUES (@id,@accountId,@date,@amount,@note,@createdAt)`)
      for (const payout of d.payouts) {
        ins.run({
          id: String(payout.id || randomUUID()), accountId: String(payout.accountId || ''),
          date: String(payout.date || '').slice(0, 10), amount: num(payout.amount), note: String(payout.note || ''),
          createdAt: String(payout.createdAt || new Date().toISOString())
        })
      }
    }
    if (Array.isArray(d.importBatches)) {
      const insert = db.prepare(`INSERT OR REPLACE INTO import_batches
        (id,sourceId,fileName,brokerKey,brokerLabel,account,timezone,status,rowCount,importedCount,duplicateCount,skippedCount,warningCount,warnings,createdAt,rolledBackAt)
        VALUES (@id,@sourceId,@fileName,@brokerKey,@brokerLabel,@account,@timezone,@status,@rowCount,@importedCount,@duplicateCount,@skippedCount,@warningCount,@warnings,@createdAt,@rolledBackAt)`)
      for (const batch of d.importBatches) {
        const warnings = Array.isArray(batch.warnings) ? batch.warnings : parsedStringArray(batch.warnings)
        insert.run({
          id: String(batch.id || randomUUID()), sourceId: '', fileName: String(batch.fileName || 'Imported CSV'),
          brokerKey: String(batch.brokerKey || ''), brokerLabel: String(batch.brokerLabel || ''), account: String(batch.account || ''),
          timezone: String(batch.timezone || ''), status: batch.status === 'rolled_back' ? 'rolled_back' : 'completed',
          rowCount: Math.max(0, Number(batch.rowCount) || 0), importedCount: Math.max(0, Number(batch.importedCount) || 0),
          duplicateCount: Math.max(0, Number(batch.duplicateCount) || 0), skippedCount: Math.max(0, Number(batch.skippedCount) || 0),
          warningCount: Math.max(warnings.length, Number(batch.warningCount) || 0), warnings: JSON.stringify(warnings.slice(0, 30)),
          createdAt: String(batch.createdAt || new Date().toISOString()), rolledBackAt: String(batch.rolledBackAt || '')
        })
      }
    }
    if (Array.isArray(d.importBatchTrades)) {
      const batchExists = db.prepare('SELECT 1 FROM import_batches WHERE id = ?')
      const tradeExists = db.prepare('SELECT 1 FROM trades WHERE id = ?')
      const insert = db.prepare('INSERT OR REPLACE INTO import_batch_trades (batchId,tradeId,sourceRow) VALUES (?,?,?)')
      for (const link of d.importBatchTrades) {
        const batchId = String(link.batchId || ''), tradeId = String(link.tradeId || '')
        if (batchExists.get(batchId) && tradeExists.get(tradeId)) insert.run(batchId, tradeId, Math.max(0, Number(link.sourceRow) || 0))
      }
    }
    if (d.goals) setGoals(d.goals)
    if (d.reviews) for (const [p, text] of Object.entries(d.reviews)) setReview(p, text)
    if (d.settings) setSettings(d.settings)
  })
  tx(data || {})
  if (!Array.isArray(data?.commitmentResults)) {
    refreshCommitmentResults()
    if (Array.isArray(data?.commitments)) {
      for (const commitment of data.commitments) {
        if (commitment.status === 'completed' && commitment.id) refreshCommitmentResults(String(commitment.id), true)
      }
    }
  }
  return {
    trades: listTrades(), tradeFills: db.prepare('SELECT * FROM trade_fills ORDER BY tradeId,sequence,filledAt,rowid').all(),
    instrumentProfiles: listInstrumentProfiles(), savedSearches: listSavedSearches(), tradePlans: listTradePlans(),
    commitments: listCoachCommitments(), commitmentResults: db.prepare('SELECT * FROM commitment_results').all(),
    playbook: listPlaybook(), dayLogs: listDayLogs(), payouts: listPayouts(), importBatches: listImportBatches(),
    goals: getGoals(), reviews: getReviews(), settings: getSettings()
  }
}

// ───── Playbook ─────

export function listPlaybook() {
  return db.prepare('SELECT * FROM playbook ORDER BY name ASC').all()
}

export function addPlaybookEntry(e) {
  const row = {
    id: randomUUID(),
    name: String(e.name || '').trim(),
    description: String(e.description || ''),
    criteria: String(e.criteria || ''),
    invalidation: String(e.invalidation || ''),
    targets: String(e.targets || ''),
    notes: String(e.notes || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO playbook
    (id, name, description, criteria, invalidation, targets, notes, createdAt, updatedAt)
    VALUES (@id,@name,@description,@criteria,@invalidation,@targets,@notes,@createdAt,@updatedAt)
  `).run(row)
  return listPlaybook()
}

export function updatePlaybookEntry(e) {
  db.prepare(`UPDATE playbook SET
    name=@name, description=@description, criteria=@criteria,
    invalidation=@invalidation, targets=@targets, notes=@notes, updatedAt=@updatedAt
    WHERE id=@id`).run({
    id: String(e.id),
    name: String(e.name || '').trim(),
    description: String(e.description || ''),
    criteria: String(e.criteria || ''),
    invalidation: String(e.invalidation || ''),
    targets: String(e.targets || ''),
    notes: String(e.notes || ''),
    updatedAt: new Date().toISOString(),
  })
  return listPlaybook()
}

export function deletePlaybookEntry(id) {
  db.prepare('DELETE FROM playbook WHERE id = ?').run(String(id))
  return listPlaybook()
}

// ───── No-trade day logs ─────

export function listDayLogs() {
  return db.prepare('SELECT * FROM day_logs ORDER BY date DESC, createdAt DESC').all()
}

export function addDayLog(e) {
  const row = {
    id: randomUUID(),
    date: String(e.date || '').slice(0, 10),
    reason: String(e.reason || ''),
    mood: String(e.mood || ''),
    note: String(e.note || ''),
    createdAt: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO day_logs (id, date, reason, mood, note, createdAt)
    VALUES (@id,@date,@reason,@mood,@note,@createdAt)`).run(row)
  return listDayLogs()
}

export function deleteDayLog(id) {
  db.prepare('DELETE FROM day_logs WHERE id = ?').run(String(id))
  return listDayLogs()
}

// ───── Prop firm payouts ─────

export function listPayouts() {
  return db.prepare('SELECT * FROM payouts ORDER BY date DESC, createdAt DESC').all()
}

export function addPayout(e) {
  const row = {
    id: randomUUID(),
    accountId: String(e.accountId || ''),
    date: String(e.date || '').slice(0, 10),
    amount: Number(e.amount) || 0,
    note: String(e.note || ''),
    createdAt: new Date().toISOString(),
  }
  db.prepare(`INSERT INTO payouts (id, accountId, date, amount, note, createdAt)
    VALUES (@id,@accountId,@date,@amount,@note,@createdAt)`).run(row)
  return listPayouts()
}

export function deletePayout(id) {
  db.prepare('DELETE FROM payouts WHERE id = ?').run(String(id))
  return listPayouts()
}

// Daily snapshot of the SQLite file into userData/backups, keeping the last 7.
export function backupDb() {
  try {
    const dir = join(app.getPath('userData'), 'backups')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const dest = join(dir, `tradehelp-${new Date().toISOString().slice(0, 10)}.db`)
    db.backup(dest).then(() => {
      const files = readdirSync(dir).filter((f) => f.endsWith('.db')).sort()
      for (const f of files.slice(0, Math.max(0, files.length - 7))) { try { unlinkSync(join(dir, f)) } catch {} }
    }).catch((err) => console.error('[backup] SQLite backup failed:', err))
  } catch (err) {
    console.error('[backup] Backup setup failed:', err)
  }
}

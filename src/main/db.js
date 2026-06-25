import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { randomUUID } from 'crypto'

let db
let imagesDir

export function initDb() {
  // Stored in the per-user app data dir so it survives app updates.
  db = new Database(join(app.getPath('userData'), 'tradehelp.db'))
  db.pragma('journal_mode = WAL')

  imagesDir = join(app.getPath('userData'), 'screenshots')
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })

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
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trade_images_tradeId ON trade_images(tradeId);
    CREATE TABLE IF NOT EXISTS reviews (
      period TEXT PRIMARY KEY, text TEXT, updatedAt TEXT
    );
  `)

  // Migrate older DBs that predate columns added above.
  const tradeCols = new Set(db.prepare('PRAGMA table_info(trades)').all().map((c) => c.name))
  for (const [name, type] of [['entryTime', 'TEXT'], ['exitTime', 'TEXT'], ['reason', 'TEXT'], ['source', 'TEXT'], ['account', 'TEXT'], ['fees', 'REAL'], ['selfSetup', 'TEXT'], ['selfExec', 'TEXT']]) {
    if (!tradeCols.has(name)) db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`)
  }

  db.prepare('INSERT OR IGNORE INTO goals (id, weekly, monthly) VALUES (1, 500, 2000)').run()

  const defaults = {
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
    accentColor: 'amber',
    lastSeenVersion: ''
  }
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(defaults)) ins.run(k, String(v))
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const listTrades = () =>
  db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM trade_images i WHERE i.tradeId = t.id) AS imageCount
    FROM trades t ORDER BY t.timestamp ASC, t.rowid ASC
  `).all()

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

export function addTrade(t) {
  db.prepare(INSERT_TRADE).run(buildRow(t))
  return listTrades()
}

// Bulk insert from a broker CSV — flagged source='import' so the rating can show "Verified".
export function importTrades(list) {
  const stmt = db.prepare(INSERT_TRADE)
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(buildRow({ ...r, source: 'import' })) })
  tx(Array.isArray(list) ? list : [])
  return listTrades()
}

export function updateTrade(t) {
  db.prepare(`UPDATE trades SET
    symbol=@symbol, direction=@direction, entry=@entry, exit=@exit, stop=@stop, target=@target,
    size=@size, riskAmount=@riskAmount, pnl=@pnl, fees=@fees, rr=@rr, emotion=@emotion, setup=@setup,
    notes=@notes, timestamp=@timestamp, entryTime=@entryTime, exitTime=@exitTime,
    reason=@reason, source=@source, account=@account, selfSetup=@selfSetup, selfExec=@selfExec WHERE id=@id`).run(buildRow(t))
  return listTrades()
}

export function deleteTrade(id) {
  for (const img of db.prepare('SELECT file FROM trade_images WHERE tradeId = ?').all(String(id))) {
    try { unlinkSync(join(imagesDir, img.file)) } catch {}
  }
  db.prepare('DELETE FROM trade_images WHERE tradeId = ?').run(String(id))
  db.prepare('DELETE FROM trades WHERE id = ?').run(String(id))
  return listTrades()
}

export function getGoals() {
  return db.prepare('SELECT weekly, monthly FROM goals WHERE id = 1').get() || { weekly: 500, monthly: 2000 }
}

export function setGoals(g) {
  db.prepare('UPDATE goals SET weekly = ?, monthly = ? WHERE id = 1').run(num(g.weekly), num(g.monthly))
  return getGoals()
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const o = {}
  for (const { key, value } of rows) o[key] = value
  return o
}

export function setSettings(s) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction((obj) => {
    for (const [k, v] of Object.entries(obj)) up.run(k, String(v))
  })
  tx(s)
  return getSettings()
}

/* ───────── trade screenshots (files on disk; DB only holds the filename) ───────── */
const EXT_MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }

export function addImage(tradeId, { dataUrl, tag, caption } = {}) {
  const m = String(dataUrl || '').match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) throw new Error('Bad image data')
  const ext = m[1] === 'image/jpeg' ? 'jpg' : (m[1].split('/')[1] || 'png').replace('+xml', '')
  const file = `${randomUUID()}.${ext}`
  writeFileSync(join(imagesDir, file), Buffer.from(m[2], 'base64'))
  const row = {
    id: randomUUID(), tradeId: String(tradeId), file,
    tag: String(tag || ''), caption: String(caption || ''), createdAt: new Date().toISOString()
  }
  db.prepare('INSERT INTO trade_images (id, tradeId, file, tag, caption, createdAt) VALUES (@id, @tradeId, @file, @tag, @caption, @createdAt)').run(row)
  return { id: row.id, tradeId: row.tradeId, tag: row.tag, caption: row.caption }
}

// Returns metadata only — no file I/O. Call getImage(id) to fetch a single image's data URL.
export function listImages(tradeId) {
  return db
    .prepare('SELECT id, tag, caption FROM trade_images WHERE tradeId = ? ORDER BY rowid ASC')
    .all(String(tradeId))
    .map((r) => ({ id: r.id, tag: r.tag, caption: r.caption }))
}

// Reads one image from disk on demand. Returns null if the record or file is missing.
export function getImage(id) {
  const r = db.prepare('SELECT id, file, tag, caption FROM trade_images WHERE id = ?').get(String(id))
  if (!r) return null
  let dataUrl = ''
  try {
    const mime = EXT_MIME[(r.file.split('.').pop() || 'png').toLowerCase()] || 'image/png'
    dataUrl = `data:${mime};base64,${readFileSync(join(imagesDir, r.file)).toString('base64')}`
  } catch {}
  return { id: r.id, tag: r.tag, caption: r.caption, dataUrl }
}

export function deleteImage(id) {
  const row = db.prepare('SELECT file, tradeId FROM trade_images WHERE id = ?').get(String(id))
  if (!row) return []
  try { unlinkSync(join(imagesDir, row.file)) } catch {}
  db.prepare('DELETE FROM trade_images WHERE id = ?').run(String(id))
  return listImages(row.tradeId)
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

// Portable JSON snapshot of the journal (API keys stripped). Screenshots are files, not included.
export function getAllData() {
  const settings = getSettings()
  for (const k of SECRET_KEYS) delete settings[k]
  return {
    app: 'tradehelp', version: 1, exportedAt: new Date().toISOString(),
    trades: db.prepare('SELECT * FROM trades').all(),
    goals: getGoals(),
    reviews: getReviews(),
    settings
  }
}

export function restoreData(data) {
  const tx = db.transaction((d) => {
    if (Array.isArray(d.trades)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO trades
        (id, symbol, direction, entry, exit, stop, target, size, riskAmount, pnl, fees, rr, emotion, setup, notes, timestamp, entryTime, exitTime, reason, source, account, selfSetup, selfExec)
        VALUES (@id,@symbol,@direction,@entry,@exit,@stop,@target,@size,@riskAmount,@pnl,@fees,@rr,@emotion,@setup,@notes,@timestamp,@entryTime,@exitTime,@reason,@source,@account,@selfSetup,@selfExec)`)
      for (const t of d.trades) ins.run(buildRow(t))
    }
    if (d.goals) setGoals(d.goals)
    if (d.reviews) for (const [p, text] of Object.entries(d.reviews)) setReview(p, text)
    if (d.settings) setSettings(d.settings)
  })
  tx(data || {})
  return { trades: listTrades(), goals: getGoals(), reviews: getReviews(), settings: getSettings() }
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
    }).catch(() => {})
  } catch {}
}

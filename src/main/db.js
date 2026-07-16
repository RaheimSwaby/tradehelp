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
  `)

  // Migrate older DBs that predate columns added above.
  const tradeCols = new Set(db.prepare('PRAGMA table_info(trades)').all().map((c) => c.name))
  for (const [name, type] of [['entryTime', 'TEXT'], ['exitTime', 'TEXT'], ['reason', 'TEXT'], ['source', 'TEXT'], ['account', 'TEXT'], ['fees', 'REAL'], ['selfSetup', 'TEXT'], ['selfExec', 'TEXT']]) {
    if (!tradeCols.has(name)) db.exec(`ALTER TABLE trades ADD COLUMN ${name} ${type}`)
  }
  const commitmentCols = new Set(db.prepare('PRAGMA table_info(coach_commitments)').all().map((c) => c.name))
  if (!commitmentCols.has('baselineTradeIds')) db.exec("ALTER TABLE coach_commitments ADD COLUMN baselineTradeIds TEXT DEFAULT '[]'")

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
    // Journal preferences
    simpleJournal: 'false',
    customEmotions: '[]',
    customSetups: '[]',
    proactiveCoachEnabled: 'true',
    coachBriefSnapshot: '',
    coachBriefAttempt: '',
    coachBriefText: '',
    cloudJournalAccess: 'true'
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
    SELECT t.*, COUNT(i.id) AS imageCount
    FROM trades t
    LEFT JOIN trade_images i ON i.tradeId = t.id
    GROUP BY t.id
    ORDER BY t.timestamp ASC, t.rowid ASC
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
  refreshCommitmentResults()
  return listTrades()
}

// Bulk insert from a broker CSV — flagged source='import' so the rating can show "Verified".
export function importTrades(list) {
  const stmt = db.prepare(INSERT_TRADE)
  const tx = db.transaction((rows) => { for (const r of rows) stmt.run(buildRow({ ...r, source: 'import' })) })
  tx(Array.isArray(list) ? list : [])
  refreshCommitmentResults()
  return listTrades()
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
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM trade_images WHERE tradeId = ?').run(key)
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

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const o = {}
  for (const { key, value } of rows) o[key] = value
  return o
}

const SETTINGS_KEYS = new Set([
  'provider', 'ollamaUrl', 'ollamaModel', 'ollamaVisionModel',
  'cloudUrl', 'cloudModel', 'cloudKey',
  'dailyGoal', 'maxDailyLoss', 'tradeRules',
  'tickerEnabled', 'tickerSymbols', 'finnhubKey',
  'eventsEnabled', 'fmpKey', 'eventsMinImpact', 'eventsLeadMin',
  'themePreset', 'accentColor', 'goTimeAccent', 'pnlStyle', 'fontStyle',
  'themeMode', 'backdrop', 'customBackgroundFile', 'customBackgroundOpacity',
  'customBackgroundBlur', 'customBackgroundDim', 'customBackgroundFit',
  'onboarded', 'lastSeenVersion',
  'breakWeeks', 'onBreak', 'breakSince',
  'trialStart', 'licenseKey', 'licenseInstanceId', 'licenseStatus',
  'achievements', 'propFirmAccounts', 'propFirm', 'liveCapital',
  'dailyReportEnabled', 'dailyReportSeen', 'feedbackPromptSeen', 'easterEggEnabled', 'easterEggSeen',
  'simpleJournal', 'customEmotions', 'customSetups',
  'proactiveCoachEnabled', 'coachBriefSnapshot', 'coachBriefAttempt', 'coachBriefText',
  'cloudJournalAccess',
])

export function setSettings(s) {
  const up = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction((obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (SETTINGS_KEYS.has(k)) up.run(k, String(v))
    }
  })
  tx(s)
  return getSettings()
}

/* ───────── trade screenshots (files on disk; DB only holds the filename) ───────── */
const EXT_MIME = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }
const WRITE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export function addImage(tradeId, { dataUrl, tag, caption } = {}) {
  const m = String(dataUrl || '').match(/^data:(image\/[\w+.-]+);base64,(.+)$/s)
  if (!m) throw new Error('Bad image data')
  const ext = WRITE_MIME[m[1]]
  if (!ext) throw new Error('Unsupported image type')
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
  try {
    const mime = EXT_MIME[(r.file.split('.').pop() || 'png').toLowerCase()] || 'image/png'
    const dataUrl = `data:${mime};base64,${readFileSync(join(imagesDir, r.file)).toString('base64')}`
    return { id: r.id, tag: r.tag, caption: r.caption, dataUrl }
  } catch {
    return null
  }
}

export function deleteImage(id) {
  const row = db.prepare('SELECT file, tradeId FROM trade_images WHERE id = ?').get(String(id))
  if (!row) return []
  try { unlinkSync(join(imagesDir, row.file)) } catch {}
  db.prepare('DELETE FROM trade_images WHERE id = ?').run(String(id))
  return listImages(row.tradeId)
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
const COMMITMENT_RULES = new Set(['max_trades_day', 'max_risk', 'latest_entry', 'setup_only'])

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

function publicPlan(row) {
  if (!row) return null
  const { screenshotFile, ...plan } = row
  return { ...plan, hasScreenshot: Boolean(screenshotFile) }
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
    lockedAt: '', resolvedAt: '', linkedTradeId: '',
    screenshotFile, createdAt: now, updatedAt: now
  }
  try {
    db.prepare(`INSERT INTO trade_plans
      (id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,riskAmount,confidence,thesis,invalidation,plannedAt,lockedAt,resolvedAt,linkedTradeId,screenshotFile,createdAt,updatedAt)
      VALUES (@id,@status,@symbol,@direction,@account,@setup,@plannedEntry,@plannedStop,@plannedTarget,@riskAmount,@confidence,@thesis,@invalidation,@plannedAt,@lockedAt,@resolvedAt,@linkedTradeId,@screenshotFile,@createdAt,@updatedAt)`).run(row)
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
    linkedTradeId, screenshotFile, createdAt: current.createdAt, updatedAt: now
  }
  try {
    db.prepare(`UPDATE trade_plans SET
      status=@status,symbol=@symbol,direction=@direction,account=@account,setup=@setup,
      plannedEntry=@plannedEntry,plannedStop=@plannedStop,plannedTarget=@plannedTarget,riskAmount=@riskAmount,
      confidence=@confidence,thesis=@thesis,invalidation=@invalidation,plannedAt=@plannedAt,lockedAt=@lockedAt,
      resolvedAt=@resolvedAt,linkedTradeId=@linkedTradeId,screenshotFile=@screenshotFile,updatedAt=@updatedAt WHERE id=@id`).run(row)
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

function evaluateCommitment(c, t, dayPosition) {
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
  for (const trade of trades) {
    const day = tradeDay(trade)
    const position = (dayCounts.get(day) || 0) + 1
    dayCounts.set(day, position)
    dayPositionByTrade.set(String(trade.id), position)
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
        const result = evaluateCommitment(c, t, dayPositionByTrade.get(String(t.id)) || 1)
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

// Portable JSON snapshot of journal records (API keys and screenshot files excluded).
export function getAllData() {
  const settings = getSettings()
  for (const k of SECRET_KEYS) delete settings[k]
  return {
    app: 'tradehelp', version: 3, exportedAt: new Date().toISOString(),
    trades: db.prepare('SELECT * FROM trades').all(),
    tradePlans: db.prepare(`SELECT id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,
      riskAmount,confidence,thesis,invalidation,plannedAt,lockedAt,resolvedAt,linkedTradeId,createdAt,updatedAt FROM trade_plans`).all(),
    commitments: db.prepare('SELECT * FROM coach_commitments').all(),
    commitmentResults: db.prepare('SELECT * FROM commitment_results').all(),
    dayLogs: listDayLogs(),
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
    if (Array.isArray(d.tradePlans)) {
      const ins = db.prepare(`INSERT OR REPLACE INTO trade_plans
        (id,status,symbol,direction,account,setup,plannedEntry,plannedStop,plannedTarget,riskAmount,confidence,thesis,invalidation,plannedAt,lockedAt,resolvedAt,linkedTradeId,screenshotFile,createdAt,updatedAt)
        VALUES (@id,@status,@symbol,@direction,@account,@setup,@plannedEntry,@plannedStop,@plannedTarget,@riskAmount,@confidence,@thesis,@invalidation,@plannedAt,@lockedAt,@resolvedAt,@linkedTradeId,@screenshotFile,@createdAt,@updatedAt)`)
      const existingScreenshot = db.prepare('SELECT screenshotFile FROM trade_plans WHERE id = ?')
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
    if (d.goals) setGoals(d.goals)
    if (d.reviews) for (const [p, text] of Object.entries(d.reviews)) setReview(p, text)
    if (d.settings) setSettings(d.settings)
  })
  tx(data || {})
  refreshCommitmentResults()
  if (!Array.isArray(data?.commitmentResults) && Array.isArray(data?.commitments)) {
    for (const commitment of data.commitments) {
      if (commitment.status === 'completed' && commitment.id) refreshCommitmentResults(String(commitment.id), true)
    }
  }
  return {
    trades: listTrades(), tradePlans: listTradePlans(), commitments: listCoachCommitments(),
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

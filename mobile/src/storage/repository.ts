import type { SQLiteDatabase } from 'expo-sqlite'
import { normalizeTradeDate } from './dates'

export type RuleCheck = { rule: string; followed: boolean }

export type MobileTrade = {
  id: string
  createdAt: string
  updatedAt: string
  tradeDate: string
  symbol: string
  direction: 'Long' | 'Short'
  pnl: number
  fees: number
  timeframe: string
  setup: string
  notes: string
  screenshotUri: string
  ruleChecks: RuleCheck[]
  ruleSummary: string
  reasons?: string[]
  origin: 'mobile' | 'desktop'
  desktopId: string
  syncState: 'pending' | 'synced'
}

export type TradeChangeOperation = 'create' | 'update' | 'delete'

export type PendingTradeChange = {
  entityId: string
  operation: TradeChangeOperation
  payload: Partial<MobileTrade>
}

type TradeRow = {
  id: string
  created_at: string
  updated_at: string
  trade_date: string
  symbol: string
  direction: string
  pnl: number
  fees: number
  timeframe: string
  setup: string
  notes: string
  screenshot_uri: string | null
  rule_checks: string
  rule_summary: string
  reasons?: string
  origin: string
  desktop_id: string | null
  sync_state: string
}

type OutboxRow = {
  entity_id: string
  operation: string
  payload: string
}

export type WatchlistItem = {
  id: string
  symbol: string
  bias: 'Bullish' | 'Bearish' | 'Neutral'
  keyLevel: string
  planNotes: string
  createdAt: string
}

const DEFAULT_RULES = [
  'Setup matched my written plan',
  'Risk stayed within my limit',
  'Stop-loss was respected',
  'I avoided chasing or revenge trading'
]

export type RuleState = {
  rules: string[]
  updatedAt: string
}

function normalizeRules(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((rule) => String(rule ?? '').trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 20)
}

function normalizeRuleRevision(value: unknown) {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''
}

function nextRuleRevision(current = '') {
  const previous = Date.parse(current)
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}

function parseChecks(value: string): RuleCheck[] {
  try {
    const checks = JSON.parse(value)
    return Array.isArray(checks)
      ? checks.flatMap((check) => check && typeof check === 'object'
        ? [{ rule: String(check.rule || ''), followed: Boolean(check.followed) }]
        : [])
      : []
  } catch {
    return []
  }
}

function parseReasons(value?: string): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function publicTrade(row: TradeRow): MobileTrade {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tradeDate: row.trade_date,
    symbol: row.symbol,
    direction: row.direction === 'Short' ? 'Short' : 'Long',
    pnl: Number(row.pnl) || 0,
    fees: Number(row.fees) || 0,
    timeframe: row.timeframe || '',
    setup: row.setup || '',
    notes: row.notes || '',
    screenshotUri: row.screenshot_uri || '',
    ruleChecks: parseChecks(row.rule_checks),
    ruleSummary: row.rule_summary || '',
    reasons: parseReasons(row.reasons),
    origin: row.origin === 'desktop' ? 'desktop' : 'mobile',
    desktopId: row.desktop_id || '',
    syncState: row.sync_state === 'synced' ? 'synced' : 'pending'
  }
}

export function createLocalId(prefix = 'trade') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export async function listTrades(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<TradeRow>('SELECT * FROM mobile_trades ORDER BY trade_date DESC, created_at DESC')
  return rows.map(publicTrade)
}

export async function countDemoTrades(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM mobile_trades WHERE is_demo = 1')
  return Number(row?.count) || 0
}

/**
 * Removes the seeded sample trades. Deleted directly rather than through
 * deleteLocalTrade because these rows only ever existed on this device — they
 * were never pushed, so queueing a delete would ask the desktop to remove
 * trades it has never seen.
 */
export async function clearDemoTrades(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM mobile_trades WHERE is_demo = 1')
}

export async function saveTrade(db: SQLiteDatabase, trade: MobileTrade) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO mobile_trades
      (id,created_at,updated_at,trade_date,symbol,direction,pnl,fees,timeframe,setup,notes,
       screenshot_uri,rule_checks,rule_summary,reasons,origin,desktop_id,sync_state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      trade.id, trade.createdAt, trade.updatedAt, trade.tradeDate, trade.symbol, trade.direction,
      trade.pnl, trade.fees, trade.timeframe, trade.setup, trade.notes, trade.screenshotUri || null,
      JSON.stringify(trade.ruleChecks), trade.ruleSummary, JSON.stringify(trade.reasons || []), trade.origin, trade.desktopId || null, trade.syncState)
    await db.runAsync(`INSERT OR REPLACE INTO sync_outbox
      (id,entity_type,entity_id,operation,payload,created_at,attempts)
      VALUES (?,?,?,?,?,?,0)`,
      `trade:${trade.id}`, 'trade', trade.id, 'create', JSON.stringify(trade), trade.createdAt)
  })
}

export async function updateLocalTrade(db: SQLiteDatabase, trade: MobileTrade) {
  const updatedAt = new Date().toISOString()
  const operation: TradeChangeOperation = trade.origin === 'mobile' && !trade.desktopId ? 'create' : 'update'
  const next: MobileTrade = { ...trade, updatedAt, syncState: 'pending' }
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE mobile_trades SET
      updated_at=?,trade_date=?,symbol=?,direction=?,pnl=?,fees=?,timeframe=?,setup=?,notes=?,
      screenshot_uri=?,rule_checks=?,rule_summary=?,reasons=?,sync_state='pending' WHERE id=?`,
      next.updatedAt, next.tradeDate, next.symbol, next.direction, next.pnl, next.fees,
      next.timeframe, next.setup, next.notes, next.screenshotUri || null,
      JSON.stringify(next.ruleChecks), next.ruleSummary, JSON.stringify(next.reasons || []), next.id)
    await db.runAsync(`INSERT OR REPLACE INTO sync_outbox
      (id,entity_type,entity_id,operation,payload,created_at,attempts)
      VALUES (?,?,?,?,?,?,0)`,
      `trade:${next.id}`, 'trade', next.id, operation, JSON.stringify(next), updatedAt)
  })
  return next
}

export async function deleteLocalTrade(db: SQLiteDatabase, trade: MobileTrade) {
  const onlyExistsLocally = trade.origin === 'mobile' && !trade.desktopId
  const deletedAt = new Date().toISOString()
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mobile_trades WHERE id = ?', trade.id)
    if (onlyExistsLocally) {
      await db.runAsync('DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ?', 'trade', trade.id)
      return
    }
    await db.runAsync(`INSERT OR REPLACE INTO sync_outbox
      (id,entity_type,entity_id,operation,payload,created_at,attempts)
      VALUES (?,?,?,?,?,?,0)`,
      `trade:${trade.id}`, 'trade', trade.id, 'delete',
      JSON.stringify({ id: trade.id, desktopId: trade.desktopId, origin: trade.origin, updatedAt: deletedAt }),
      deletedAt)
  })
}

export async function pendingTradeChanges(db: SQLiteDatabase): Promise<PendingTradeChange[]> {
  const rows = await db.getAllAsync<OutboxRow>(
    "SELECT entity_id,operation,payload FROM sync_outbox WHERE entity_type = 'trade' ORDER BY created_at ASC"
  )
  return rows.flatMap((row) => {
    if (!['create', 'update', 'delete'].includes(row.operation)) return []
    try {
      const payload = JSON.parse(row.payload)
      return payload && typeof payload === 'object'
        ? [{
            entityId: row.entity_id,
            operation: row.operation as TradeChangeOperation,
            payload: payload as Partial<MobileTrade>
          }]
        : []
    } catch {
      return []
    }
  })
}

export async function pendingTrades(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<TradeRow>(
    "SELECT * FROM mobile_trades WHERE origin = 'mobile' AND sync_state <> 'synced' ORDER BY created_at ASC"
  )
  return rows.map(publicTrade)
}

export async function applySyncResult(
  db: SQLiteDatabase,
  accepted: Array<{ mobileId: string; desktopId: string; operation?: TradeChangeOperation }>,
  desktopTrades: Array<Record<string, unknown>>
) {
  await db.withTransactionAsync(async () => {
    for (const item of accepted) {
      if (item.operation !== 'delete') {
        await db.runAsync(
          "UPDATE mobile_trades SET sync_state = 'synced', desktop_id = ?, updated_at = ? WHERE id = ?",
          String(item.desktopId), new Date().toISOString(), String(item.mobileId)
        )
      }
      await db.runAsync('DELETE FROM sync_outbox WHERE entity_id = ?', String(item.mobileId))
    }

    for (const item of desktopTrades) {
      const desktopId = String(item.id || '')
      if (!desktopId) continue
      const linked = await db.getFirstAsync<{ id: string; origin: string }>(
        'SELECT id,origin FROM mobile_trades WHERE desktop_id = ?',
        desktopId
      )
      if (linked) {
        if (linked.origin === 'desktop') {
          await db.runAsync(`UPDATE mobile_trades SET updated_at=?,trade_date=?,symbol=?,direction=?,
            pnl=?,fees=?,timeframe=?,setup=?,notes=?,rule_summary=? WHERE id=?`,
            new Date().toISOString(), normalizeTradeDate(item.tradeDate), String(item.symbol || ''),
            item.direction === 'Short' ? 'Short' : 'Long', Number(item.pnl) || 0, Number(item.fees) || 0,
            String(item.timeframe || ''), String(item.setup || ''), String(item.notes || ''),
            String(item.ruleSummary || ''), linked.id)
        }
        continue
      }
      const id = `desktop:${desktopId}`
      const now = new Date().toISOString()
      await db.runAsync(`INSERT OR REPLACE INTO mobile_trades
        (id,created_at,updated_at,trade_date,symbol,direction,pnl,fees,timeframe,setup,notes,
         screenshot_uri,rule_checks,rule_summary,origin,desktop_id,sync_state)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        // The fallback was `now` as a UTC ISO string, which put a trade with a
        // missing timestamp on the wrong day for anyone behind UTC.
        id, now, now, normalizeTradeDate(item.tradeDate), String(item.symbol || ''),
        item.direction === 'Short' ? 'Short' : 'Long', Number(item.pnl) || 0, Number(item.fees) || 0,
        String(item.timeframe || ''), String(item.setup || ''), String(item.notes || ''),
        null, '[]', String(item.ruleSummary || ''), 'desktop', desktopId, 'synced')
    }
  })
}

export async function getSetting(db: SQLiteDatabase, key: string, fallback = '') {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM mobile_settings WHERE key = ?', key)
  return row?.value ?? fallback
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(`INSERT INTO mobile_settings (key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
}

export async function getRuleState(db: SQLiteDatabase): Promise<RuleState> {
  const value = await getSetting(db, 'tradeRules', JSON.stringify(DEFAULT_RULES))
  const updatedAt = normalizeRuleRevision(await getSetting(db, 'tradeRulesUpdatedAt'))
  try {
    const rules = JSON.parse(value)
    return { rules: Array.isArray(rules) ? normalizeRules(rules) : DEFAULT_RULES, updatedAt }
  } catch {
    return { rules: DEFAULT_RULES, updatedAt }
  }
}

export async function getRules(db: SQLiteDatabase) {
  return (await getRuleState(db)).rules
}

async function persistRuleState(db: SQLiteDatabase, rules: unknown, updatedAt: string): Promise<RuleState> {
  const state = { rules: normalizeRules(rules), updatedAt: normalizeRuleRevision(updatedAt) }
  await db.withTransactionAsync(async () => {
    await setSetting(db, 'tradeRules', JSON.stringify(state.rules))
    await setSetting(db, 'tradeRulesUpdatedAt', state.updatedAt)
  })
  return state
}

export async function saveRules(db: SQLiteDatabase, rules: unknown) {
  const current = await getRuleState(db)
  return persistRuleState(db, rules, nextRuleRevision(current.updatedAt))
}

export async function applyRuleState(db: SQLiteDatabase, rules: unknown, updatedAt: string) {
  return persistRuleState(db, rules, updatedAt)
}

export async function getDeviceId(db: SQLiteDatabase) {
  let id = await getSetting(db, 'deviceId')
  if (!id) {
    id = createLocalId('device')
    await setSetting(db, 'deviceId', id)
  }
  return id
}

export async function listWatchlist(db: SQLiteDatabase): Promise<WatchlistItem[]> {
  const rows = await db.getAllAsync<{
    id: string
    symbol: string
    bias: string
    key_level: string
    plan_notes: string
    created_at: string
  }>('SELECT * FROM mobile_watchlist ORDER BY created_at DESC')
  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    bias: r.bias === 'Bearish' ? 'Bearish' : r.bias === 'Neutral' ? 'Neutral' : 'Bullish',
    keyLevel: r.key_level || '',
    planNotes: r.plan_notes || '',
    createdAt: r.created_at
  }))
}

export async function saveWatchlistItem(
  db: SQLiteDatabase,
  item: Omit<WatchlistItem, 'id' | 'createdAt'> & { id?: string }
): Promise<WatchlistItem> {
  const id = item.id || createLocalId('watch')
  const createdAt = new Date().toISOString()
  await db.runAsync(
    `INSERT OR REPLACE INTO mobile_watchlist (id, symbol, bias, key_level, plan_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, item.symbol.toUpperCase(), item.bias, item.keyLevel || '', item.planNotes || '', createdAt]
  )
  return { id, symbol: item.symbol.toUpperCase(), bias: item.bias, keyLevel: item.keyLevel || '', planNotes: item.planNotes || '', createdAt }
}

export async function deleteWatchlistItem(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM mobile_watchlist WHERE id = ?', [id])
}

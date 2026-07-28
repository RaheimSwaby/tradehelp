import type { SQLiteDatabase } from 'expo-sqlite'

async function ensureColumn(db: SQLiteDatabase, table: string, name: string, declaration: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)
  if (!columns.some((column) => column.name === name)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`)
  }
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS mobile_trades (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'Long',
      pnl REAL NOT NULL DEFAULT 0,
      fees REAL NOT NULL DEFAULT 0,
      timeframe TEXT NOT NULL DEFAULT '',
      setup TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      screenshot_uri TEXT,
      rule_checks TEXT NOT NULL DEFAULT '[]',
      rule_summary TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT 'mobile',
      desktop_id TEXT,
      sync_state TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mobile_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS mobile_trades_date_idx
      ON mobile_trades (trade_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_trades_desktop_idx
      ON mobile_trades (desktop_id) WHERE desktop_id IS NOT NULL;
  `)

  await ensureColumn(db, 'mobile_trades', 'direction', "TEXT NOT NULL DEFAULT 'Long'")
  await ensureColumn(db, 'mobile_trades', 'rule_checks', "TEXT NOT NULL DEFAULT '[]'")
  await ensureColumn(db, 'mobile_trades', 'rule_summary', "TEXT NOT NULL DEFAULT ''")
  await ensureColumn(db, 'mobile_trades', 'origin', "TEXT NOT NULL DEFAULT 'mobile'")
  await ensureColumn(db, 'mobile_trades', 'desktop_id', 'TEXT')

  // Seed rich demo trades if database is brand new and empty
  const countResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM mobile_trades')
  if (countResult && countResult.count === 0) {
    const now = Date.now()
    const day = 86_400_000
    const demoTrades = [
      {
        id: 'demo-1',
        trade_date: new Date(now - 1 * day).toISOString(),
        symbol: 'NQ',
        direction: 'Long',
        pnl: 450.00,
        fees: 4.50,
        timeframe: '5m',
        setup: 'VWAP Reclaim',
        notes: 'Clean entry off VWAP bounce with heavy volume confirmation.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      },
      {
        id: 'demo-2',
        trade_date: new Date(now - 2 * day).toISOString(),
        symbol: 'ES',
        direction: 'Short',
        pnl: 280.50,
        fees: 4.50,
        timeframe: '15m',
        setup: 'Break & Retest',
        notes: 'Rejected 5420 key level, clean downside momentum to target 1.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      },
      {
        id: 'demo-3',
        trade_date: new Date(now - 3 * day).toISOString(),
        symbol: 'NVDA',
        direction: 'Long',
        pnl: -140.00,
        fees: 2.00,
        timeframe: '5m',
        setup: 'Opening Range Breakout',
        notes: 'Failed ORB setup, stopped out per risk rules.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      },
      {
        id: 'demo-4',
        trade_date: new Date(now - 4 * day).toISOString(),
        symbol: 'TSLA',
        direction: 'Long',
        pnl: 620.00,
        fees: 3.50,
        timeframe: '15m',
        setup: 'Liquidity Sweep',
        notes: 'Swept morning lows and reclaimed value area high.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      },
      {
        id: 'demo-5',
        trade_date: new Date(now - 5 * day).toISOString(),
        symbol: 'AAPL',
        direction: 'Short',
        pnl: 195.00,
        fees: 2.00,
        timeframe: '5m',
        setup: 'Trendline Break',
        notes: 'Controlled position sizing ahead of FOMC rate announcement.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      },
      {
        id: 'demo-6',
        trade_date: new Date(now - 7 * day).toISOString(),
        symbol: 'NQ',
        direction: 'Long',
        pnl: 380.00,
        fees: 4.50,
        timeframe: '5m',
        setup: 'VWAP Reclaim',
        notes: 'Strong buyers stepped in at session open.',
        rule_summary: '2/2 rules passed',
        sync_state: 'synced'
      }
    ]

    for (const t of demoTrades) {
      await db.runAsync(
        `INSERT INTO mobile_trades (id, created_at, updated_at, trade_date, symbol, direction, pnl, fees, timeframe, setup, notes, rule_summary, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.trade_date, t.trade_date, t.trade_date, t.symbol, t.direction, t.pnl, t.fees, t.timeframe, t.setup, t.notes, t.rule_summary, t.sync_state]
      )
    }
  }
}

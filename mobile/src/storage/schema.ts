import type { SQLiteDatabase } from 'expo-sqlite'
import { normalizeTradeDate, toLocalStamp } from './dates'

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

    CREATE TABLE IF NOT EXISTS mobile_watchlist (
      id TEXT PRIMARY KEY NOT NULL,
      symbol TEXT NOT NULL,
      bias TEXT NOT NULL DEFAULT 'Bullish',
      key_level TEXT NOT NULL DEFAULT '',
      plan_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS mobile_trades_date_idx
      ON mobile_trades (trade_date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_trades_desktop_idx
      ON mobile_trades (desktop_id) WHERE desktop_id IS NOT NULL;
  `)

  await ensureColumn(db, 'mobile_trades', 'direction', "TEXT NOT NULL DEFAULT 'Long'")
  await ensureColumn(db, 'mobile_trades', 'rule_checks', "TEXT NOT NULL DEFAULT '[]'")
  await ensureColumn(db, 'mobile_trades', 'rule_summary', "TEXT NOT NULL DEFAULT ''")
  await ensureColumn(db, 'mobile_trades', 'reasons', "TEXT NOT NULL DEFAULT '[]'")
  await ensureColumn(db, 'mobile_trades', 'origin', "TEXT NOT NULL DEFAULT 'mobile'")
  await ensureColumn(db, 'mobile_trades', 'desktop_id', 'TEXT')
  // Sample rows are flagged with their own column rather than by overloading
  // `origin`, which the sync layer keys off to decide what to push.
  await ensureColumn(db, 'mobile_trades', 'is_demo', 'INTEGER NOT NULL DEFAULT 0')

  // Installs that seeded sample trades before the flag existed got is_demo = 0
  // from the column default, which would leave fabricated P&L sitting
  // permanently in a real journal with no way to identify or clear it. The
  // seeded ids are fixed and local ids are generated with a 'trade' prefix, so
  // this can't catch a real trade.
  await db.runAsync("UPDATE mobile_trades SET is_demo = 1 WHERE id LIKE 'demo-%' AND is_demo = 0")

  // Rows synced before trade dates were normalised are still stored in whatever
  // shape their source used. They have to be rewritten rather than handled at
  // read time, because the mixed formats sort wrongly against each other — see
  // ./dates. Only touches rows that aren't already canonical.
  const legacyDates = await db.getAllAsync<{ id: string; trade_date: string }>(
    "SELECT id, trade_date FROM mobile_trades WHERE trade_date NOT GLOB '____-__-__T__:__:__'"
  )
  for (const row of legacyDates) {
    const normalized = normalizeTradeDate(row.trade_date)
    if (normalized !== row.trade_date) {
      await db.runAsync('UPDATE mobile_trades SET trade_date = ? WHERE id = ?', [normalized, row.id])
    }
  }

  // Seed sample trades so a brand-new install has something to show. They are
  // flagged is_demo and cleared the moment real data arrives — see
  // clearDemoTrades. Fabricated P&L must never be able to reach a trader's
  // real numbers.
  const countResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM mobile_trades')
  if (countResult && countResult.count === 0) {
    const day = 86_400_000
    // Written in the same local, suffix-free shape as real trades
    // (localTimestamp in App.tsx). Storing these as UTC made the same trade
    // land on different days in Home and the Vault.
    const localStamp = (offsetDays: number) => {
      const date = new Date(Date.now() - offsetDays * day)
      const pad = (value: number) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }
    const demoTrades = [
      {
        id: 'demo-1',
        trade_date: localStamp(1),
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
        trade_date: localStamp(2),
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
        trade_date: localStamp(3),
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
        trade_date: localStamp(4),
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
        trade_date: localStamp(5),
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
        trade_date: localStamp(7),
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
        `INSERT INTO mobile_trades (id, created_at, updated_at, trade_date, symbol, direction, pnl, fees, timeframe, setup, notes, rule_summary, sync_state, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [t.id, t.trade_date, t.trade_date, t.trade_date, t.symbol, t.direction, t.pnl, t.fees, t.timeframe, t.setup, t.notes, t.rule_summary, t.sync_state]
      )
    }
  }
}

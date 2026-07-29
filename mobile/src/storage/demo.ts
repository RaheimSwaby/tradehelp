import type { SQLiteDatabase } from 'expo-sqlite'
import { toLocalStamp } from './dates'

const RULES = [
  'Setup matched my written plan',
  'Risk stayed within my limit',
  'Stop-loss was respected',
  'I avoided chasing or revenge trading'
]

type DemoTrade = {
  id: string
  daysAgo: number
  hour: number
  minute: number
  symbol: string
  direction: 'Long' | 'Short'
  pnl: number
  fees: number
  timeframe: string
  holdMinutes: number
  setup: string
  notes: string
  missedRules?: number[]
  reasons: string[]
}

function sessionStamp(tradingDaysAgo: number, hour: number, minute: number) {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)

  let remaining = tradingDaysAgo
  while (remaining > 0) {
    date.setDate(date.getDate() - 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }

  return toLocalStamp(date)
}

function checksFor(missedRules: number[] = []) {
  return RULES.map((rule, index) => ({
    rule,
    followed: !missedRules.includes(index)
  }))
}

const DEMO_TRADES: DemoTrade[] = [
  {
    id: 'demo-rich-today-open',
    daysAgo: 0,
    hour: 9,
    minute: 42,
    symbol: 'NQ',
    direction: 'Long',
    pnl: 310,
    fees: 4.5,
    timeframe: '1m',
    holdMinutes: 18,
    setup: 'Opening Range Break',
    notes: 'Waited for the opening range retest and entered only after buyers reclaimed the level.',
    reasons: ['Patience', 'Plan followed']
  },
  {
    id: 'demo-rich-today-chase',
    daysAgo: 0,
    hour: 10,
    minute: 18,
    symbol: 'NQ',
    direction: 'Long',
    pnl: -95,
    fees: 4.5,
    timeframe: '30s',
    holdMinutes: 6,
    setup: 'Momentum Pullback',
    notes: 'Entered before the pullback confirmed. The fast chart encouraged a chase after the move had already expanded.',
    missedRules: [0, 3],
    reasons: ['Chased entry', 'FOMO']
  },
  {
    id: 'demo-rich-today-vwap',
    daysAgo: 0,
    hour: 11,
    minute: 6,
    symbol: 'ES',
    direction: 'Short',
    pnl: 180,
    fees: 4.5,
    timeframe: '5m',
    holdMinutes: 24,
    setup: 'VWAP Rejection',
    notes: 'Rejected VWAP twice, sized down, and held to the planned liquidity target.',
    reasons: ['Patience', 'Good risk management']
  },
  {
    id: 'demo-rich-1-vwap',
    daysAgo: 1,
    hour: 10,
    minute: 4,
    symbol: 'NQ',
    direction: 'Long',
    pnl: 420,
    fees: 4.5,
    timeframe: '5m',
    holdMinutes: 37,
    setup: 'VWAP Reclaim',
    notes: 'Clean reclaim with volume confirmation. Took partials at the first target and let one contract run.',
    reasons: ['Plan followed', 'Good trade management']
  },
  {
    id: 'demo-rich-1-scalp',
    daysAgo: 1,
    hour: 11,
    minute: 22,
    symbol: 'MES',
    direction: 'Short',
    pnl: -60,
    fees: 2.1,
    timeframe: '30s',
    holdMinutes: 5,
    setup: 'Momentum Pullback',
    notes: 'Second entry had no clean invalidation. Exited at the planned max loss.',
    missedRules: [0],
    reasons: ['Weak setup']
  },
  {
    id: 'demo-rich-2-orb',
    daysAgo: 2,
    hour: 9,
    minute: 51,
    symbol: 'ES',
    direction: 'Long',
    pnl: 280,
    fees: 4.5,
    timeframe: '1m',
    holdMinutes: 16,
    setup: 'Opening Range Break',
    notes: 'Breakout held above premarket high. Entry, stop, and target were defined before the order.',
    reasons: ['Plan followed', 'Patience']
  },
  {
    id: 'demo-rich-3-scalp',
    daysAgo: 3,
    hour: 10,
    minute: 37,
    symbol: 'NQ',
    direction: 'Short',
    pnl: -160,
    fees: 4.5,
    timeframe: '30s',
    holdMinutes: 8,
    setup: 'Momentum Pullback',
    notes: 'Took a reversal without higher-timeframe confirmation and held past the original stop.',
    missedRules: [0, 2, 3],
    reasons: ['Ignored stop', 'Revenge trade']
  },
  {
    id: 'demo-rich-4-retest',
    daysAgo: 4,
    hour: 13,
    minute: 14,
    symbol: 'NVDA',
    direction: 'Long',
    pnl: 135,
    fees: 2,
    timeframe: '5m',
    holdMinutes: 29,
    setup: 'Break & Retest',
    notes: 'Prior resistance held as support. Closed before the afternoon news window.',
    reasons: ['Good timing', 'Plan followed']
  },
  {
    id: 'demo-rich-5-scalp',
    daysAgo: 5,
    hour: 9,
    minute: 58,
    symbol: 'MNQ',
    direction: 'Long',
    pnl: -110,
    fees: 2.1,
    timeframe: '30s',
    holdMinutes: 4,
    setup: 'Momentum Pullback',
    notes: 'Entered in the middle of the range instead of waiting for the planned sweep.',
    missedRules: [0, 3],
    reasons: ['FOMO', 'Chased entry']
  },
  {
    id: 'demo-rich-6-liquidity',
    daysAgo: 6,
    hour: 10,
    minute: 46,
    symbol: 'NQ',
    direction: 'Long',
    pnl: 225,
    fees: 4.5,
    timeframe: '15m',
    holdMinutes: 43,
    setup: 'Liquidity Sweep',
    notes: 'Morning low sweep aligned with the 15-minute bias. No management changes after entry.',
    reasons: ['Higher timeframe alignment', 'Patience']
  },
  {
    id: 'demo-rich-7-orb',
    daysAgo: 7,
    hour: 9,
    minute: 48,
    symbol: 'ES',
    direction: 'Short',
    pnl: 190,
    fees: 4.5,
    timeframe: '1m',
    holdMinutes: 21,
    setup: 'Opening Range Break',
    notes: 'Opening range failed at resistance and offered a clean retest from below.',
    reasons: ['Plan followed']
  },
  {
    id: 'demo-rich-8-scalp',
    daysAgo: 8,
    hour: 12,
    minute: 3,
    symbol: 'MNQ',
    direction: 'Long',
    pnl: -85,
    fees: 2.1,
    timeframe: '30s',
    holdMinutes: 7,
    setup: 'Momentum Pullback',
    notes: 'Low-volume lunch trade. The setup was valid but the session condition was not.',
    missedRules: [0],
    reasons: ['Poor timing']
  },
  {
    id: 'demo-rich-9-vwap',
    daysAgo: 9,
    hour: 10,
    minute: 26,
    symbol: 'NQ',
    direction: 'Short',
    pnl: 145,
    fees: 4.5,
    timeframe: '5m',
    holdMinutes: 32,
    setup: 'VWAP Rejection',
    notes: 'Stayed patient through the first touch and entered on the confirmed rejection.',
    reasons: ['Patience', 'Plan followed']
  },
  {
    id: 'demo-rich-10-scalp',
    daysAgo: 10,
    hour: 11,
    minute: 34,
    symbol: 'MES',
    direction: 'Short',
    pnl: -70,
    fees: 2.1,
    timeframe: '30s',
    holdMinutes: 6,
    setup: 'Momentum Pullback',
    notes: 'Added after the first impulse instead of waiting for a fresh structure break.',
    missedRules: [0, 3],
    reasons: ['Chased entry']
  },
  {
    id: 'demo-rich-11-sweep',
    daysAgo: 11,
    hour: 9,
    minute: 55,
    symbol: 'ES',
    direction: 'Long',
    pnl: 260,
    fees: 4.5,
    timeframe: '15m',
    holdMinutes: 51,
    setup: 'Liquidity Sweep',
    notes: 'Premarket low sweep supported the daily bias. Risk remained fixed through the trade.',
    reasons: ['Higher timeframe alignment', 'Good risk management']
  },
  {
    id: 'demo-rich-12-retest',
    daysAgo: 12,
    hour: 13,
    minute: 8,
    symbol: 'TSLA',
    direction: 'Long',
    pnl: 120,
    fees: 2,
    timeframe: '5m',
    holdMinutes: 27,
    setup: 'Break & Retest',
    notes: 'Small afternoon continuation with a defined stop beneath the reclaimed level.',
    reasons: ['Plan followed']
  }
]

/**
 * Replaces sample rows only. Real trades and the sync outbox are deliberately
 * untouched so this can be used repeatedly while evaluating the UI.
 */
export async function replaceDemoTrades(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mobile_trades WHERE is_demo = 1')

    for (const trade of DEMO_TRADES) {
      const stamp = sessionStamp(trade.daysAgo, trade.hour, trade.minute)
      const exitStamp = new Date(stamp)
      exitStamp.setMinutes(exitStamp.getMinutes() + trade.holdMinutes)
      const checks = checksFor(trade.missedRules)
      const passed = checks.filter((check) => check.followed).length

      await db.runAsync(
        `INSERT INTO mobile_trades (
          id, created_at, updated_at, trade_date, symbol, direction, pnl, fees,
          timeframe, entry_time, exit_time, setup, notes, screenshot_uri, rule_checks, rule_summary,
          reasons, origin, desktop_id, sync_state, is_demo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'mobile', NULL, 'synced', 1)`,
        [
          trade.id,
          stamp,
          stamp,
          stamp,
          trade.symbol,
          trade.direction,
          trade.pnl,
          trade.fees,
          trade.timeframe,
          stamp.slice(11, 16),
          toLocalStamp(exitStamp).slice(11, 16),
          trade.setup,
          trade.notes,
          JSON.stringify(checks),
          `${passed}/${checks.length} rules passed`,
          JSON.stringify(trade.reasons)
        ]
      )
    }
  })
}

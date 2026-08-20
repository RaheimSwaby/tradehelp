export const MARKET_PULSE_STORAGE_KEY = 'th_market_pulse_watchlist_v1'
export const MARKET_PULSE_WATCHLIST_EVENT = 'tradehelp:market-pulse-watchlist-changed'
export const MAX_MARKET_PULSE_ITEMS = 12

const MARKET_PULSE_PRESETS = [
  { label: 'Nasdaq 100', category: 'Index', aliases: ['NASDAQ', 'NAS100', 'US100', 'NDX'], tickerSymbol: 'FOREXCOM:NSXUSD', chartSymbol: 'OANDA:NAS100USD', technicalSymbol: 'NASDAQ:NDX' },
  { label: 'S&P 500', category: 'Index', aliases: ['S&P', 'SP500', 'US500', 'SPX'], tickerSymbol: 'FOREXCOM:SPXUSD', chartSymbol: 'OANDA:SPX500USD', technicalSymbol: 'SP:SPX' },
  { label: 'EUR/USD', category: 'Forex', aliases: ['EURUSD', 'EURO'], tickerSymbol: 'FX:EURUSD', chartSymbol: 'FX:EURUSD', technicalSymbol: 'FX:EURUSD' },
  { label: 'Bitcoin', category: 'Crypto', aliases: ['BTC', 'BTCUSD', 'BITCOIN'], tickerSymbol: 'BITSTAMP:BTCUSD', chartSymbol: 'BITSTAMP:BTCUSD', technicalSymbol: 'BITSTAMP:BTCUSD' },
  { label: 'Ethereum', category: 'Crypto', aliases: ['ETH', 'ETHUSD', 'ETHEREUM'], tickerSymbol: 'BITSTAMP:ETHUSD', chartSymbol: 'BITSTAMP:ETHUSD', technicalSymbol: 'BITSTAMP:ETHUSD' },
  { label: 'Gold', category: 'Commodity', aliases: ['GOLD', 'XAU', 'XAUUSD'], tickerSymbol: 'TVC:GOLD', chartSymbol: 'TVC:GOLD', technicalSymbol: 'TVC:GOLD' },
  { label: 'E-mini Nasdaq 100', category: 'Futures', aliases: ['NQ', 'NQ1'], tickerSymbol: 'CME_MINI:NQ1!', chartSymbol: 'CME_MINI:NQ1!', technicalSymbol: 'CME_MINI:NQ1!' },
  { label: 'Micro E-mini Nasdaq 100', category: 'Futures', aliases: ['MNQ', 'MNQ1'], tickerSymbol: 'CME_MINI:MNQ1!', chartSymbol: 'CME_MINI:MNQ1!', technicalSymbol: 'CME_MINI:MNQ1!' },
  { label: 'E-mini S&P 500', category: 'Futures', aliases: ['ES', 'ES1'], tickerSymbol: 'CME_MINI:ES1!', chartSymbol: 'CME_MINI:ES1!', technicalSymbol: 'CME_MINI:ES1!' },
  { label: 'Micro E-mini S&P 500', category: 'Futures', aliases: ['MES', 'MES1'], tickerSymbol: 'CME_MINI:MES1!', chartSymbol: 'CME_MINI:MES1!', technicalSymbol: 'CME_MINI:MES1!' },
  { label: 'E-mini Russell 2000', category: 'Futures', aliases: ['RTY', 'RTY1', 'RUSSELL'], tickerSymbol: 'CME_MINI:RTY1!', chartSymbol: 'CME_MINI:RTY1!', technicalSymbol: 'CME_MINI:RTY1!' },
  { label: 'E-mini Dow', category: 'Futures', aliases: ['YM', 'YM1', 'DOW'], tickerSymbol: 'CBOT_MINI:YM1!', chartSymbol: 'CBOT_MINI:YM1!', technicalSymbol: 'CBOT_MINI:YM1!' },
  { label: 'Gold Futures', category: 'Futures', aliases: ['GC', 'GC1'], tickerSymbol: 'COMEX:GC1!', chartSymbol: 'COMEX:GC1!', technicalSymbol: 'COMEX:GC1!' },
  { label: 'Micro Gold Futures', category: 'Futures', aliases: ['MGC', 'MGC1'], tickerSymbol: 'COMEX:MGC1!', chartSymbol: 'COMEX:MGC1!', technicalSymbol: 'COMEX:MGC1!' },
  { label: 'Crude Oil Futures', category: 'Futures', aliases: ['CL', 'CL1', 'CRUDE', 'OIL'], tickerSymbol: 'NYMEX:CL1!', chartSymbol: 'NYMEX:CL1!', technicalSymbol: 'NYMEX:CL1!' },
  { label: 'GBP/USD', category: 'Forex', aliases: ['GBPUSD', 'POUND'], tickerSymbol: 'FX:GBPUSD', chartSymbol: 'FX:GBPUSD', technicalSymbol: 'FX:GBPUSD' },
  { label: 'USD/JPY', category: 'Forex', aliases: ['USDJPY', 'YEN'], tickerSymbol: 'FX:USDJPY', chartSymbol: 'FX:USDJPY', technicalSymbol: 'FX:USDJPY' },
  { label: 'AUD/USD', category: 'Forex', aliases: ['AUDUSD', 'AUSSIE'], tickerSymbol: 'FX:AUDUSD', chartSymbol: 'FX:AUDUSD', technicalSymbol: 'FX:AUDUSD' },
  { label: 'USD/CAD', category: 'Forex', aliases: ['USDCAD', 'LOONIE'], tickerSymbol: 'FX:USDCAD', chartSymbol: 'FX:USDCAD', technicalSymbol: 'FX:USDCAD' },
  { label: 'VIX', category: 'Index', aliases: ['VIX', 'VOLATILITY'], tickerSymbol: 'CBOE:VIX', chartSymbol: 'CBOE:VIX', technicalSymbol: 'CBOE:VIX' },
  { label: 'US Dollar Index', category: 'Index', aliases: ['DXY', 'DOLLAR'], tickerSymbol: 'TVC:DXY', chartSymbol: 'TVC:DXY', technicalSymbol: 'TVC:DXY' },
  { label: 'Solana', category: 'Crypto', aliases: ['SOL', 'SOLUSD', 'SOLANA'], tickerSymbol: 'COINBASE:SOLUSD', chartSymbol: 'COINBASE:SOLUSD', technicalSymbol: 'COINBASE:SOLUSD' },
  { label: 'Apple', category: 'Stock', aliases: ['AAPL', 'APPLE'], tickerSymbol: 'NASDAQ:AAPL', chartSymbol: 'NASDAQ:AAPL', technicalSymbol: 'NASDAQ:AAPL' },
  { label: 'NVIDIA', category: 'Stock', aliases: ['NVDA', 'NVIDIA'], tickerSymbol: 'NASDAQ:NVDA', chartSymbol: 'NASDAQ:NVDA', technicalSymbol: 'NASDAQ:NVDA' },
  { label: 'Tesla', category: 'Stock', aliases: ['TSLA', 'TESLA'], tickerSymbol: 'NASDAQ:TSLA', chartSymbol: 'NASDAQ:TSLA', technicalSymbol: 'NASDAQ:TSLA' }
]

export const MARKET_PULSE_MARKET_CATALOG = Object.freeze(MARKET_PULSE_PRESETS.map((market) => Object.freeze({
  ...market,
  aliases: Object.freeze([...market.aliases])
})))

export const DEFAULT_MARKET_PULSE_MARKETS = Object.freeze([
  ...MARKET_PULSE_MARKET_CATALOG.slice(0, 6).map(({ category: _category, aliases: _aliases, ...market }) => Object.freeze(market))
])

function compactMarketSearchValue(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function marketSearchScore(market, query) {
  const values = [market.label, market.chartSymbol, market.tickerSymbol, ...market.aliases]
    .map(compactMarketSearchValue)
  if (values.some((value) => value === query)) return 0
  if (values.some((value) => value.startsWith(query))) return 1
  if (values.some((value) => value.includes(query))) return 2
  return -1
}

export function searchMarketPulseMarkets(query, excludedSymbols = [], limit = 6) {
  const cleanQuery = compactMarketSearchValue(query)
  if (!cleanQuery) return []
  const excluded = new Set(excludedSymbols.map(sanitizeTradingViewSymbol))

  return MARKET_PULSE_MARKET_CATALOG
    .map((market, index) => ({ market, index, score: marketSearchScore(market, cleanQuery) }))
    .filter(({ market, score }) => score >= 0 && !excluded.has(market.chartSymbol))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(({ market }) => market)
}

export function sanitizeTradingViewSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9:._!/-]/g, '')
    .slice(0, 64)
}

export function normalizeMarketPulseLabel(value, fallback = 'Market') {
  const clean = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 28)
  return clean || fallback
}

export function normalizeMarketPulseItem(value) {
  if (!value || typeof value !== 'object') return null
  const chartSymbol = sanitizeTradingViewSymbol(value.chartSymbol || value.symbol)
  if (!chartSymbol || !chartSymbol.includes(':')) return null
  const fallbackLabel = chartSymbol.split(':').pop() || 'Market'
  return {
    label: normalizeMarketPulseLabel(value.label, fallbackLabel),
    tickerSymbol: sanitizeTradingViewSymbol(value.tickerSymbol || chartSymbol) || chartSymbol,
    chartSymbol,
    technicalSymbol: sanitizeTradingViewSymbol(value.technicalSymbol || chartSymbol) || chartSymbol
  }
}

function defaultWatchlist() {
  return DEFAULT_MARKET_PULSE_MARKETS.map((market) => ({ ...market }))
}

export function normalizeMarketPulseWatchlist(value) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return defaultWatchlist()
    }
  }
  if (!Array.isArray(parsed)) return defaultWatchlist()

  const seen = new Set()
  const normalized = []
  for (const candidate of parsed) {
    const market = normalizeMarketPulseItem(candidate)
    if (!market || seen.has(market.chartSymbol)) continue
    seen.add(market.chartSymbol)
    normalized.push(market)
    if (normalized.length >= MAX_MARKET_PULSE_ITEMS) break
  }
  return normalized.length > 0 ? normalized : defaultWatchlist()
}

export function createMarketPulseItem(label, symbol) {
  return normalizeMarketPulseItem({ label, symbol })
}

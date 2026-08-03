// Correlates your own trades with the economic calendar: "how do I actually perform
// around news?" — a question a generic calendar can never answer.
//
// The important subtlety is coverage. Stored event history starts the day the app first
// archived a week, so a trade from before that has *unknown* news context, not "no
// news". Counting those as quiet would quietly poison every comparison, so anything
// outside the archived range is excluded and reported separately.

export const DEFAULT_NEWS_WINDOW_MIN = 30

function tradeTimestamp(trade) {
  const raw = String(trade?.entryTime || trade?.timestamp || '')
  if (!raw) return NaN
  // A bare date parses as UTC midnight, which can land on the wrong local day.
  const iso = raw.includes('T') || raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T00:00`
  const parsed = new Date(iso).getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

function impactRank(impact) {
  const value = String(impact || '').toLowerCase()
  if (value.startsWith('high')) return 3
  if (value.startsWith('med')) return 2
  if (value.startsWith('low')) return 1
  return 0 // holidays and unlabelled entries
}

export function eventsAtImpact(events = [], minImpact = 'High') {
  const floor = impactRank(minImpact) || 3
  return events.filter((event) => impactRank(event?.impact) >= floor && Number.isFinite(Number(event?.ts)))
}

function summarize(trades) {
  const n = trades.length
  const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0)
  const wins = trades.filter((trade) => (Number(trade.pnl) || 0) > 0).length
  return {
    n,
    wins,
    winRate: n ? (wins / n) * 100 : 0,
    totalPnl,
    avgPnl: n ? totalPnl / n : 0
  }
}

/** Events whose window contains this trade's entry. */
export function tradeNewsMatches(trade, events = [], windowMin = DEFAULT_NEWS_WINDOW_MIN) {
  const at = tradeTimestamp(trade)
  if (!Number.isFinite(at)) return []
  const span = Math.max(0, Number(windowMin) || 0) * 60000
  return events.filter((event) => Math.abs(at - Number(event.ts)) <= span)
}

/**
 * Splits trades into news-adjacent vs quiet and breaks the news side down per event.
 * `events` should be the archived calendar; only trades inside its covered range count.
 */
export function buildNewsCorrelation(trades = [], events = [], options = {}) {
  const windowMin = Math.max(0, Number(options.windowMin ?? DEFAULT_NEWS_WINDOW_MIN))
  const minImpact = options.minImpact || 'High'
  const relevant = eventsAtImpact(events, minImpact)
  const span = windowMin * 60000

  // Coverage is how much calendar we actually archived, so it comes from every stored
  // event regardless of impact — a quiet afternoon is only provably quiet if we held
  // data for that afternoon. Callers with the archive's true range should pass it.
  const allTimestamps = events.map((event) => Number(event.ts)).filter(Number.isFinite)
  const explicit = options.coverage
  const rawEarliest = Number.isFinite(Number(explicit?.earliest)) ? Number(explicit.earliest)
    : allTimestamps.length ? Math.min(...allTimestamps) : null
  const rawLatest = Number.isFinite(Number(explicit?.latest)) ? Number(explicit.latest)
    : allTimestamps.length ? Math.max(...allTimestamps) : null
  // Padded by the window so a trade just past the final print is still judged honestly.
  const earliest = rawEarliest == null ? null : rawEarliest - span
  const latest = rawLatest == null ? null : rawLatest + span

  const inRange = []
  let uncovered = 0
  for (const trade of trades) {
    const at = tradeTimestamp(trade)
    if (!Number.isFinite(at)) continue
    if (earliest == null || at < earliest || at > latest) { uncovered += 1; continue }
    inRange.push(trade)
  }

  const newsTrades = []
  const quietTrades = []
  const byEvent = new Map()
  for (const trade of inRange) {
    const matches = tradeNewsMatches(trade, relevant, windowMin)
    if (!matches.length) { quietTrades.push(trade); continue }
    newsTrades.push(trade)
    // A trade can sit inside two prints at once; it counts toward each so a per-event
    // breakdown stays honest, even though the totals above count it once.
    for (const event of matches) {
      const key = String(event.title || '').trim().toLowerCase()
      if (!byEvent.has(key)) byEvent.set(key, { title: String(event.title || '').trim(), country: event.country || '', trades: [] })
      byEvent.get(key).trades.push(trade)
    }
  }

  const events_ = [...byEvent.values()]
    .map((group) => ({ title: group.title, country: group.country, ...summarize(group.trades) }))
    .sort((a, b) => a.totalPnl - b.totalPnl)

  const news = summarize(newsTrades)
  const quiet = summarize(quietTrades)
  return {
    windowMin,
    minImpact,
    covered: relevant.length > 0 && inRange.length > 0,
    coveredFrom: earliest,
    coveredTo: latest,
    analyzed: inRange.length,
    uncovered,
    news,
    quiet,
    // Positive means news trading is helping; negative means it is costing you.
    winRateDelta: news.n && quiet.n ? news.winRate - quiet.winRate : null,
    avgPnlDelta: news.n && quiet.n ? news.avgPnl - quiet.avgPnl : null,
    byEvent: events_
  }
}

/** One-line takeaway for the tab header, or null when there isn't enough to say. */
export function newsCorrelationHeadline(correlation) {
  if (!correlation?.covered || !correlation.news.n || !correlation.quiet.n) return null
  const { news, quiet, windowMin } = correlation
  const better = news.winRate >= quiet.winRate
  return {
    tone: better ? 'up' : 'down',
    text: `${news.winRate.toFixed(0)}% win rate within ${windowMin} min of high-impact news vs ${quiet.winRate.toFixed(0)}% otherwise`,
    detail: `${news.n} news trade${news.n === 1 ? '' : 's'} · ${quiet.n} quiet`
  }
}

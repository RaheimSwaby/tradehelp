import { localDateKey } from './sessionClock.js'

const IMPACT_RANK = { Low: 1, Medium: 2, High: 3 }

function money(value) {
  const amount = Number(value) || 0
  const decimals = Math.abs(amount) < 100 ? 2 : 0
  return `${amount < 0 ? '-' : ''}$${Math.abs(amount).toFixed(decimals)}`
}


function nyClock(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(now))
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { weekday: value.weekday, minutes: Number(value.hour) * 60 + Number(value.minute) }
}

export function nySessionPhase(now = Date.now()) {
  const { weekday, minutes } = nyClock(now)
  if (['Sat', 'Sun'].includes(weekday)) return { id: 'closed', label: 'Weekend', detail: 'US index futures are outside the regular NY session.' }
  if (minutes < 570) return { id: 'premarket', label: 'Premarket', detail: 'Liquidity and participation can change sharply at 9:30 ET.' }
  if (minutes < 630) return { id: 'opening', label: 'Opening hour', detail: 'Expect faster price discovery and wider swings.' }
  if (minutes < 690) return { id: 'morning', label: 'NY morning', detail: 'The opening range is established; watch whether it holds or fails.' }
  if (minutes < 810) return { id: 'midday', label: 'Midday', detail: 'Participation often thins. Avoid forcing movement that is not there.' }
  if (minutes < 960) return { id: 'afternoon', label: 'NY afternoon', detail: 'Watch for continuation or a reversal of the morning structure.' }
  return { id: 'afterhours', label: 'After hours', detail: 'Regular US cash trading has ended.' }
}

export function quoteBreadth(quotes = []) {
  const valid = quotes.filter((quote) => Number.isFinite(Number(quote?.changePct)))
  const up = valid.filter((quote) => Number(quote.changePct) > 0.05).length
  const down = valid.filter((quote) => Number(quote.changePct) < -0.05).length
  const flat = valid.length - up - down
  const tone = up > down ? 'positive' : down > up ? 'negative' : 'mixed'
  return { total: valid.length, up, down, flat, tone }
}

export function nextEventRisk(events = [], now = Date.now(), minImpact = 'High') {
  const floor = IMPACT_RANK[minImpact] || IMPACT_RANK.High
  const upcoming = events
    .filter((event) => Number(event?.ts) >= now && (IMPACT_RANK[event?.impact] || 0) >= floor)
    .sort((a, b) => Number(a.ts) - Number(b.ts))
  const event = upcoming[0] || null
  if (!event) return { level: 'clear', event: null, minutesAway: null, detail: 'No matching scheduled release is currently ahead.' }
  const minutesAway = Math.max(0, Math.round((Number(event.ts) - now) / 60000))
  const level = minutesAway <= 15 ? 'imminent' : minutesAway <= 60 ? 'near' : 'scheduled'
  return { level, event, minutesAway, detail: `${event.title} in ${minutesAway} min${minutesAway === 1 ? '' : 's'}.` }
}

export function riskGuardrail({ todayNet = 0, todayCount = 0, maxLoss = 0, onBreak = false, live = false } = {}) {
  const net = Number(todayNet) || 0
  const trades = Math.max(0, Number(todayCount) || 0)
  const limit = Math.max(0, Number(maxLoss) || 0)
  const remaining = limit > 0 ? Math.max(0, limit + net) : null
  const usedPct = limit > 0 && net < 0 ? Math.min(100, (Math.abs(net) / limit) * 100) : 0
  const state = limit > 0 && net <= -limit
    ? 'stop'
    : usedPct >= 75
      ? 'caution'
      : onBreak
        ? 'paused'
        : live
          ? 'live'
          : 'ready'
  const labels = {
    stop: 'Stop reached', caution: 'Near your stop', paused: 'Break mode', live: 'Session live', ready: trades ? 'Within plan' : 'Ready'
  }
  return { state, label: labels[state], net, trades, limit, remaining, usedPct }
}

export function activeCommitmentSnapshot(commitments = [], todayCount = 0) {
  const active = (Array.isArray(commitments) ? commitments : []).find((commitment) => commitment?.status === 'active') || null
  // Both paths return the same keys. Returning a short object when there is no
  // commitment made callers read undefined for fields that are null in the other
  // branch, so a guard written against one shape silently missed the other.
  if (!active) {
    return { active: null, evaluated: 0, target: 0, progressPct: 0, adherenceRate: null, cap: null, capReached: false }
  }
  const evaluated = Math.max(0, Number(active.evaluatedCount) || 0)
  const target = Math.max(1, Number(active.targetCount) || 1)
  const cap = active.ruleType === 'max_trades_day' ? Math.max(0, Number(active.ruleValue) || 0) : null
  return {
    active,
    evaluated,
    target,
    progressPct: Math.min(100, (evaluated / target) * 100),
    adherenceRate: evaluated ? Math.max(0, Number(active.adherenceRate) || 0) : null,
    cap,
    capReached: cap > 0 && Number(todayCount) >= cap
  }
}

export function buildJournalInsights({ correlation = null, leaks = null, stats = {}, ruleBreaks = [], commitment = null, todayCount = 0, now = Date.now() } = {}) {
  const insights = []
  const add = (id, title, detail, tone = 'neutral') => insights.push({ id, title, detail, tone })

  if (commitment?.capReached) {
    add('trade-cap', 'Trade cap reached', `${Number(todayCount) || 0}/${commitment.cap} trades logged today. Your active commitment says not to take another one.`, 'risk')
  }

  // Day bucketing is the trader's own calendar day, not New York's, even though
  // the session phase above is NY. That is deliberate: todayNet and todayCount
  // arrive already filtered by localDateKey, so switching this to NY would make
  // "rule breaks today" disagree with the P&L sitting beside it in the same card.
  // Imported rather than reimplemented - this was a second copy of the same six
  // lines, and two definitions of "today" are exactly how they drift apart.
  const today = localDateKey(now)
  const recentFloor = Number(now) - 7 * 864e5
  const breaks = (Array.isArray(ruleBreaks) ? ruleBreaks : []).filter((entry) => {
    const at = new Date(entry?.occurredAt).getTime()
    return Number.isFinite(at) && at >= recentFloor && at <= Number(now)
  })
  const todayBreaks = breaks.filter((entry) => localDateKey(entry.occurredAt) === today)
  if (todayBreaks.length) {
    add('rule-breaks-today', 'Rule break logged today', `${todayBreaks.length} rule break${todayBreaks.length === 1 ? '' : 's'} recorded. Review the reason before the next entry.`, 'risk')
  } else if (breaks.length >= 2) {
    add('rule-breaks-recent', 'Recent rule pressure', `${breaks.length} rule breaks were recorded in the last seven days.`, 'caution')
  }

  // A bucket can carry a trade count without a win rate, and reading .toFixed()
  // off the missing one took the whole News tab down with it. Both rates are
  // required before the sentence can be written, since the sentence is a
  // comparison between them.
  const newsRate = Number(correlation?.news?.winRate)
  const quietRate = Number(correlation?.quiet?.winRate)
  if (correlation?.covered && correlation.news?.n >= 2 && correlation.quiet?.n >= 2 &&
      Number.isFinite(newsRate) && Number.isFinite(quietRate)) {
    const weaker = Number(correlation.avgPnlDelta) < 0
    add(
      'news-history',
      weaker ? 'News timing has cost you' : 'News timing has held up',
      `${newsRate.toFixed(0)}% win rate near high-impact news vs ${quietRate.toFixed(0)}% otherwise; ${money(correlation.avgPnlDelta)} average P&L difference per trade.`,
      weaker ? 'risk' : 'positive'
    )
  }

  if (leaks?.worst) {
    add('behavior-leak', leaks.worst.label, `${leaks.worst.n} tagged trades, ${money(leaks.worst.pnl)} net. ${leaks.worst.blurb}.`, 'risk')
  }

  if (stats?.worstHour?.total >= 8) {
    add('weak-hour', 'Weakest tracked hour', `${stats.worstHour.hour}: ${stats.worstHour.total} trades, ${stats.worstHour.wr.toFixed(0)}% win rate, ${money(stats.worstHour.pnl)} net.`, 'caution')
  }

  const symbols = (Array.isArray(stats?.bySymbol) ? stats.bySymbol : []).filter((row) => row?.name && row.name !== '—' && Number(row.n) >= 5)
  if (symbols.length >= 2) {
    const strongest = [...symbols].sort((a, b) => Number(b.pnl) - Number(a.pnl))[0]
    const weakest = [...symbols].sort((a, b) => Number(a.pnl) - Number(b.pnl))[0]
    add('instrument-history', 'Instrument history', `${strongest.name} is strongest at ${money(strongest.pnl)} across ${strongest.n} trades; ${weakest.name} is weakest at ${money(weakest.pnl)} across ${weakest.n}.`)
  }

  if (!insights.length) {
    add('journal-building', 'Journal read is still building', 'Log entry times, emotions, reasons, and risk so TradeHelp can surface personal patterns here.')
  }
  return insights.slice(0, 4)
}

export function buildSessionBriefing({ quotes = [], events = [], settings = {}, journal = {}, now = Date.now() } = {}) {
  const session = nySessionPhase(now)
  const breadth = quoteBreadth(quotes)
  const eventRisk = nextEventRisk(events, now, settings.eventsMinImpact || 'High')
  const maxLoss = Number(settings.maxDailyLoss) || 0
  const guardrail = riskGuardrail({
    todayNet: journal.todayNet,
    todayCount: journal.todayCount,
    maxLoss,
    onBreak: settings.onBreak === 'true',
    live: journal.live
  })
  const commitment = activeCommitmentSnapshot(journal.commitments, journal.todayCount)
  const insights = buildJournalInsights({
    correlation: journal.correlation,
    leaks: journal.leaks,
    stats: journal.stats,
    ruleBreaks: journal.ruleBreaks,
    commitment,
    todayCount: journal.todayCount,
    now
  })

  const headline = guardrail.state === 'stop'
    ? 'Your saved loss boundary has been reached.'
    : commitment.capReached
      ? 'Your active commitment says the day is done.'
      : eventRisk.level === 'imminent'
        ? 'Scheduled event risk is close.'
        : breadth.total === 0
          ? 'Market context is limited until quotes load.'
          : `Your watchlist is ${breadth.tone}.`

  return {
    headline,
    session,
    breadth,
    eventRisk,
    maxLoss,
    guardrail,
    commitment,
    insights,
    generatedAt: now,
    disclaimer: 'Context only. This briefing does not predict direction or tell you to enter a trade.'
  }
}

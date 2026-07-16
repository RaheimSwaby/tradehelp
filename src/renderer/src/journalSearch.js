const OUTCOME_WORDS = {
  win: /\b(wins?|winning|winners?|won|profitable|green)\b/gi,
  loss: /\b(losses?|losing|losers?|lost|unprofitable|red)\b/gi,
  flat: /\b(breakeven|break[ -]?even|flat)\b/gi
}

const DIRECTION_WORDS = {
  Long: /\b(long|buys?|bought)\b/gi,
  Short: /\b(short|sells?|sold)\b/gi
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const STOP_WORDS = new Set([
  'a', 'account', 'accounts', 'all', 'an', 'and', 'are', 'direction', 'emotion', 'emotions', 'entries', 'entry',
  'find', 'for', 'from', 'had', 'i', 'in', 'me', 'my', 'note', 'notes', 'of', 'on', 'only', 'outcome',
  'please', 'results', 'setup', 'setups', 'show', 'symbol', 'take', 'taken', 'that', 'the', 'trade', 'trades',
  'was', 'were', 'when', 'where', 'with'
])

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tradeTimestamp(trade) {
  const raw = String(trade.entryTime || trade.timestamp || '')
  if (!raw) return NaN
  // A bare date ("2026-07-15") parses as UTC midnight, which can fall in the wrong
  // local day; anchor it to local midnight so date filters match the calendar.
  const iso = raw.includes('T') || raw.includes(' ') ? raw.replace(' ', 'T') : `${raw}T00:00`
  const parsed = new Date(iso).getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

function tradeMinutes(trade) {
  const raw = String(trade.entryTime || trade.timestamp || '')
  const match = raw.match(/[T ](\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
}

function heldMilliseconds(trade) {
  if (!trade.entryTime || !trade.exitTime) return NaN
  const start = new Date(String(trade.entryTime).replace(' ', 'T')).getTime()
  const end = new Date(String(trade.exitTime).replace(' ', 'T')).getTime()
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : NaN
}

function startOfDay(value) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(value, amount) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

function startOfWeek(value) {
  const date = startOfDay(value)
  const sinceMonday = (date.getDay() + 6) % 7
  return addDays(date, -sinceMonday)
}

function startOfMonth(value) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonths(value, amount) {
  const date = startOfMonth(value)
  date.setMonth(date.getMonth() + amount)
  return date
}

function shiftMonthsClamped(value, amount) {
  const source = startOfDay(value)
  const day = source.getDate()
  const target = new Date(source.getFullYear(), source.getMonth() + amount, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return target
}

function parseClock(hourText, minuteText, suffixText) {
  let hour = Number(hourText)
  const minute = Number(minuteText || 0)
  const suffix = String(suffixText || '').toLowerCase()
  if (suffix === 'pm' && hour < 12) hour += 12
  if (suffix === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return NaN
  return hour * 60 + minute
}

function clockLabel(totalMinutes) {
  const hour24 = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour = hour24 % 12 || 12
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`
}

function comparisonOperator(raw) {
  const value = String(raw).toLowerCase().replace(/\s+/g, ' ').trim()
  if (value === '>' || ['over', 'above', 'more than', 'greater than'].includes(value)) return 'gt'
  if (value === '>=' || value === 'at least') return 'gte'
  if (value === '<' || ['under', 'below', 'less than'].includes(value)) return 'lt'
  if (value === '<=' || value === 'at most') return 'lte'
  return 'eq'
}

function operatorLabel(operator) {
  return { gt: 'over', gte: 'at least', lt: 'under', lte: 'at most', eq: 'equal to' }[operator]
}

function compare(actual, operator, expected) {
  if (!Number.isFinite(actual)) return false
  if (operator === 'gt') return actual > expected
  if (operator === 'gte') return actual >= expected
  if (operator === 'lt') return actual < expected
  if (operator === 'lte') return actual <= expected
  return actual === expected
}

function normalizedHaystack(trade) {
  return [
    trade.symbol, trade.setup, trade.emotion, trade.reason, trade.notes, trade.direction,
    trade.account, trade.selfSetup, trade.selfExec, trade.source
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}

function candidateValues(values) {
  const seen = new Set()
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value && !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()))
    .sort((a, b) => b.length - a.length)
}

/**
 * Turns a natural-language journal query into a small, deterministic filter plan.
 * Every returned filter has a human-readable label and can be evaluated locally.
 */
export function parseJournalQuery(rawQuery, { trades = [], accounts = [], now = new Date() } = {}) {
  const text = String(rawQuery || '').trim()
  if (!text) return { filters: [] }

  const used = Array(text.length).fill(false)
  const filters = []
  const filterIds = new Set()

  function add(filter) {
    if (!filter || filterIds.has(filter.id)) return
    filterIds.add(filter.id)
    filters.push(filter)
  }

  function rangeIsFree(start, end) {
    for (let index = start; index < end; index += 1) if (used[index]) return false
    return true
  }

  function mark(start, end) {
    for (let index = start; index < end; index += 1) used[index] = true
  }

  function consume(regex, build) {
    for (const match of text.matchAll(regex)) {
      const start = match.index
      const end = start + match[0].length
      if (!rangeIsFree(start, end)) continue
      const built = build(match)
      if (built === false) continue
      mark(start, end)
    }
  }

  function addOutcome(value) {
    const labels = { win: 'Wins', loss: 'Losses', flat: 'Breakeven' }
    add({ id: `outcome:${value}`, kind: 'outcome', value, label: `Outcome: ${labels[value]}`, detail: 'Compared with recorded net P&L.' })
  }

  function addNumber(field, operator, value, label, detail) {
    add({ id: `number:${field}:${operator}:${value}`, kind: 'number', field, operator, value, label, detail })
  }

  const lossContext = /\b(losses?|losing|losers?|lost|unprofitable|red)\b/i.test(text)
  const winContext = /\b(wins?|winning|winners?|made|profitable|green)\b/i.test(text)
  function addUnqualifiedDollar(operator, value) {
    if (lossContext && !winContext) {
      addOutcome('loss')
      addNumber('lossMagnitude', operator, value, `Loss size: ${operatorLabel(operator)} $${value}`, 'An unqualified dollar amount in a loss query uses absolute net loss.')
      return
    }
    addNumber('pnl', operator, value, `Net P&L: ${operatorLabel(operator)} $${value}`, 'An unqualified dollar amount is interpreted as net P&L.')
  }

  // Quoted text is always treated literally, which gives users an escape hatch for
  // words such as “long” or “today” that otherwise have structured meanings.
  consume(/"([^"]+)"|'([^']+)'/g, (match) => {
    const value = (match[1] || match[2] || '').trim().toLowerCase()
    if (!value) return false
    add({ id: `text-exact:${value}`, kind: 'textExact', value, label: `Text: “${value}”`, detail: 'Exact phrase across symbol, setup, emotion, reason, notes, direction, account, and grades.' })
  })

  // Outcome-aware dollar comparisons preserve the meaning of “losses over $100”:
  // the amount is interpreted as loss magnitude rather than signed P&L.
  consume(/\b(losses?|losing|losers?|lost)\s+(?:trades?\s+)?(?:of\s+)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*\$?([\d,]+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[2])
    const value = Number(match[3].replace(/,/g, ''))
    addOutcome('loss')
    addNumber('lossMagnitude', operator, value, `Loss size: ${operatorLabel(operator)} $${value}`, 'Uses the absolute net P&L of losing trades.')
  })
  consume(/\b(wins?|winning|winners?|made)\s+(?:trades?\s+)?(?:of\s+)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*\$?([\d,]+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[2])
    const value = Number(match[3].replace(/,/g, ''))
    addOutcome('win')
    addNumber('pnl', operator, value, `Net P&L: ${operatorLabel(operator)} $${value}`, 'Compared with recorded net P&L.')
  })

  consume(/\b(?:risk|risked|risk amount)\s*(?:is\s*)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*\$?([\d,]+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[1])
    const value = Number(match[2].replace(/,/g, ''))
    addNumber('risk', operator, value, `Risk: ${operatorLabel(operator)} $${value}`, 'Compared with the trade’s recorded risk amount.')
  })
  consume(/\b(?:p\s*&\s*l|pnl|profit)\s*(?:is\s*)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*\$?(-?[\d,]+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[1])
    const value = Number(match[2].replace(/,/g, ''))
    addNumber('pnl', operator, value, `Net P&L: ${operatorLabel(operator)} $${value}`, 'Compared with recorded net P&L.')
  })
  consume(/\b(?:r\s*:\s*r|rr|risk[ -]?reward)\s*(?:is\s*)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*(\d+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[1])
    const value = Number(match[2])
    addNumber('rr', operator, value, `R:R: ${operatorLabel(operator)} 1:${value}`, 'Compared with the recorded reward-to-risk ratio.')
  })
  consume(/\b(?:held|hold|duration)\s*(?:for\s*)?(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most|>=|<=|>|<)\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/gi, (match) => {
    const operator = comparisonOperator(match[1])
    const amount = Number(match[2])
    const hours = /^h|^hour/i.test(match[3])
    const value = amount * (hours ? 3600000 : 60000)
    addNumber('hold', operator, value, `Hold: ${operatorLabel(operator)} ${amount}${hours ? 'h' : 'm'}`, 'Calculated from recorded entry and exit times.')
  })
  consume(/\$\s*([\d,]+(?:\.\d+)?)\s*\+/g, (match) => {
    const value = Number(match[1].replace(/,/g, ''))
    addUnqualifiedDollar('gte', value)
  })
  consume(/\b(over|above|more\s+than|greater\s+than|at\s+least|under|below|less\s+than|at\s+most)\s*\$([\d,]+(?:\.\d+)?)\b/gi, (match) => {
    const operator = comparisonOperator(match[1])
    const value = Number(match[2].replace(/,/g, ''))
    addUnqualifiedDollar(operator, value)
  })

  const reference = new Date(now)
  const today = startOfDay(reference)
  const tomorrow = addDays(today, 1)

  consume(/\b(?:last|past)\s+(\d+)\s+(days?|weeks?|months?)\b/gi, (match) => {
    const amount = Math.max(1, Number(match[1]))
    const unit = match[2].toLowerCase()
    let from
    if (unit.startsWith('month')) from = shiftMonthsClamped(today, -amount)
    else from = addDays(today, -(amount * (unit.startsWith('week') ? 7 : 1)) + 1)
    add({ id: `date:${from.getTime()}:${tomorrow.getTime()}`, kind: 'dateRange', from: from.getTime(), to: tomorrow.getTime(), label: `Date: ${match[0].trim()}`, detail: 'Uses the trade entry date, including today.' })
  })
  consume(/\b(this|last)\s+(week|month)\b/gi, (match) => {
    const current = match[1].toLowerCase() === 'this'
    const week = match[2].toLowerCase() === 'week'
    const periodStart = week ? startOfWeek(today) : startOfMonth(today)
    const from = current ? periodStart : (week ? addDays(periodStart, -7) : shiftMonths(periodStart, -1))
    const to = current ? tomorrow : periodStart
    add({ id: `date:${from.getTime()}:${to.getTime()}`, kind: 'dateRange', from: from.getTime(), to: to.getTime(), label: `Date: ${match[0].trim()}`, detail: `Uses the trade entry date and ${week ? 'Monday' : 'the first day of the month'} as the boundary.` })
  })
  consume(/\b(today|yesterday)\b/gi, (match) => {
    const isToday = match[1].toLowerCase() === 'today'
    const from = isToday ? today : addDays(today, -1)
    const to = isToday ? tomorrow : today
    add({ id: `date:${from.getTime()}:${to.getTime()}`, kind: 'dateRange', from: from.getTime(), to: to.getTime(), label: `Date: ${match[0].trim()}`, detail: 'Uses the trade entry date in local time.' })
  })
  consume(/\b(on|since|before|after)\s+(\d{4}-\d{2}-\d{2})\b/gi, (match) => {
    const date = startOfDay(new Date(`${match[2]}T00:00:00`))
    if (!Number.isFinite(date.getTime())) return false
    const mode = match[1].toLowerCase()
    let from = -Infinity
    let to = Infinity
    if (mode === 'on') { from = date.getTime(); to = addDays(date, 1).getTime() }
    if (mode === 'since') from = date.getTime()
    if (mode === 'after') from = addDays(date, 1).getTime()
    if (mode === 'before') to = date.getTime()
    add({ id: `date:${from}:${to}`, kind: 'dateRange', from, to, label: `Date: ${mode} ${match[2]}`, detail: 'Uses the trade entry date in local time.' })
  })

  for (let index = 0; index < WEEKDAYS.length; index += 1) {
    const weekday = WEEKDAYS[index]
    consume(new RegExp(`\\b(?:on\\s+)?${weekday}s?\\b`, 'gi'), () => {
      add({ id: `weekday:${index}`, kind: 'weekday', value: index, label: `Day: ${weekday[0].toUpperCase()}${weekday.slice(1)}`, detail: 'Uses the local weekday of the trade entry.' })
    })
  }

  consume(/\b(after|before)\s+(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/gi, (match) => {
    const value = parseClock(match[2], match[3], match[4])
    if (!Number.isFinite(value)) return false
    const operator = match[1].toLowerCase() === 'after' ? 'gt' : 'lt'
    add({ id: `time:${operator}:${value}`, kind: 'entryTime', operator, value, label: `Entry: ${operator === 'gt' ? 'after' : 'before'} ${clockLabel(value)}`, detail: 'Uses the recorded entry time.' })
  })
  consume(/\b(after|before)\s+(\d{1,2})\s*(am|pm)\b/gi, (match) => {
    const value = parseClock(match[2], '0', match[3])
    if (!Number.isFinite(value)) return false
    const operator = match[1].toLowerCase() === 'after' ? 'gt' : 'lt'
    add({ id: `time:${operator}:${value}`, kind: 'entryTime', operator, value, label: `Entry: ${operator === 'gt' ? 'after' : 'before'} ${clockLabel(value)}`, detail: 'Uses the recorded entry time.' })
  })

  consume(/\b(?:setup\s+grade|setup\s+graded)\s*(?:is|:)?\s*([a-f][+-]?)\b/gi, (match) => {
    const value = match[1].toUpperCase()
    add({ id: `field:selfSetup:${value}`, kind: 'field', field: 'selfSetup', value, label: `Setup grade: ${value}`, detail: 'Exact match against the self-rated setup grade.' })
  })
  consume(/\b(?:execution\s+grade|execution\s+graded)\s*(?:is|:)?\s*([a-f][+-]?)\b/gi, (match) => {
    const value = match[1].toUpperCase()
    add({ id: `field:selfExec:${value}`, kind: 'field', field: 'selfExec', value, label: `Execution grade: ${value}`, detail: 'Exact match against the self-rated execution grade.' })
  })
  consume(/\b(with|without)\s+(?:a\s+)?screenshots?\b/gi, (match) => {
    const value = match[1].toLowerCase() === 'with'
    add({ id: `images:${value}`, kind: 'hasImages', value, label: value ? 'Has screenshots' : 'No screenshots', detail: 'Checks the saved screenshot count.' })
  })
  consume(/\b(imported|manual)\s+trades?\b/gi, (match) => {
    const value = match[1].toLowerCase() === 'imported' ? 'import' : 'manual'
    add({ id: `field:source:${value}`, kind: 'field', field: 'source', value, label: `Source: ${match[1]}`, detail: 'Exact match against the trade source.' })
  })

  for (const [value, regex] of Object.entries(OUTCOME_WORDS)) {
    consume(regex, () => addOutcome(value))
  }
  for (const [value, regex] of Object.entries(DIRECTION_WORDS)) {
    consume(regex, () => add({ id: `field:direction:${value}`, kind: 'field', field: 'direction', value, label: `Direction: ${value}`, detail: 'Exact match against recorded direction.' }))
  }

  const directCandidates = (values) => candidateValues(values).map((value) => ({ match: value, value, display: value }))
  const accountCandidates = []
  const seenAccountMatches = new Set()
  for (const account of accounts) {
    for (const candidate of [account.id, account.label]) {
      const match = String(candidate || '').trim()
      if (!match || seenAccountMatches.has(match.toLowerCase())) continue
      seenAccountMatches.add(match.toLowerCase())
      accountCandidates.push({ match, value: String(account.id), display: String(account.label || account.id) })
    }
  }
  accountCandidates.sort((a, b) => b.match.length - a.match.length)

  const knownGroups = [
    ['symbol', directCandidates(trades.map((trade) => trade.symbol)), 'Symbol'],
    ['setup', directCandidates(trades.map((trade) => trade.setup)), 'Setup'],
    ['emotion', directCandidates(trades.map((trade) => trade.emotion)), 'Emotion'],
    ['account', accountCandidates, 'Account'],
    ['reason', directCandidates(trades.map((trade) => trade.reason)), 'Reason']
  ]
  for (const [field, candidates, label] of knownGroups) {
    for (const candidate of candidates) {
      const optionalPlural = field === 'setup' && !candidate.match.toLowerCase().endsWith('s') ? 's?' : ''
      const regex = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(candidate.match)}${optionalPlural})(?=$|[^a-z0-9])`, 'gi')
      for (const match of text.matchAll(regex)) {
        const start = match.index + match[1].length
        const end = start + match[2].length
        if (!rangeIsFree(start, end)) continue
        mark(start, end)
        add({ id: `field:${field}:${String(candidate.value).toLowerCase()}`, kind: 'field', field, value: candidate.value, label: `${label}: ${candidate.display}`, detail: `Exact match against the recorded ${label.toLowerCase()}.` })
      }
    }
  }

  const residual = text
    .split('')
    .map((character, index) => used[index] ? ' ' : character)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, ' ')
    .trim()
  const tokens = residual.split(/\s+/).filter((token) => token && !STOP_WORDS.has(token))
  if (tokens.length) {
    const value = [...new Set(tokens)]
    add({ id: `text:${value.join('|')}`, kind: 'textTokens', value, label: `Text contains: ${value.join(' + ')}`, detail: 'Every remaining word must appear somewhere in the searchable trade fields.' })
  }

  return { filters }
}

export function matchesJournalFilters(trade, filters = []) {
  const haystack = normalizedHaystack(trade)
  return filters.every((filter) => {
    if (filter.kind === 'outcome') {
      const pnl = Number(trade.pnl) || 0
      if (filter.value === 'win') return pnl > 0
      if (filter.value === 'loss') return pnl < 0
      return pnl === 0
    }
    if (filter.kind === 'field') return String(trade[filter.field] || '').toLowerCase() === String(filter.value).toLowerCase()
    if (filter.kind === 'textExact') return haystack.includes(filter.value)
    if (filter.kind === 'textTokens') return filter.value.every((token) => haystack.includes(token))
    if (filter.kind === 'dateRange') {
      const timestamp = tradeTimestamp(trade)
      return Number.isFinite(timestamp) && timestamp >= filter.from && timestamp < filter.to
    }
    if (filter.kind === 'weekday') {
      const timestamp = tradeTimestamp(trade)
      return Number.isFinite(timestamp) && new Date(timestamp).getDay() === filter.value
    }
    if (filter.kind === 'entryTime') return compare(tradeMinutes(trade), filter.operator, filter.value)
    if (filter.kind === 'hasImages') return (Number(trade.imageCount) > 0) === filter.value
    if (filter.kind === 'number') {
      let actual = NaN
      if (filter.field === 'pnl') actual = Number(trade.pnl)
      if (filter.field === 'lossMagnitude') actual = Math.abs(Number(trade.pnl))
      if (filter.field === 'risk') actual = Number(trade.riskAmount)
      if (filter.field === 'rr') actual = Number(trade.rr)
      if (filter.field === 'hold') actual = heldMilliseconds(trade)
      return compare(actual, filter.operator, filter.value)
    }
    return true
  })
}

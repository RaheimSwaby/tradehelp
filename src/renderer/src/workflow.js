const PROFILE_ROWS = [
  ['ES', 'E-mini S&P 500', 'Futures', 0.25, 12.5, 1],
  ['MES', 'Micro E-mini S&P 500', 'Futures', 0.25, 1.25, 1],
  ['NQ', 'E-mini Nasdaq-100', 'Futures', 0.25, 5, 1],
  ['MNQ', 'Micro E-mini Nasdaq-100', 'Futures', 0.25, 0.5, 1],
  ['YM', 'E-mini Dow', 'Futures', 1, 5, 1],
  ['MYM', 'Micro E-mini Dow', 'Futures', 1, 0.5, 1],
  ['RTY', 'E-mini Russell 2000', 'Futures', 0.1, 5, 1],
  ['M2K', 'Micro E-mini Russell 2000', 'Futures', 0.1, 0.5, 1],
  ['CL', 'Crude Oil', 'Futures', 0.01, 10, 1],
  ['MCL', 'Micro Crude Oil', 'Futures', 0.01, 1, 1],
  ['GC', 'Gold', 'Futures', 0.1, 10, 1],
  ['MGC', 'Micro Gold', 'Futures', 0.1, 1, 1],
  ['STOCK', 'Generic stock', 'Stock', 0.01, 0.01, 1]
]

export const INSTRUMENT_PROFILE_DEFAULTS = Object.freeze(Object.fromEntries(PROFILE_ROWS.map(([symbol, name, assetClass, tickSize, tickValue, quantityStep]) => [symbol, Object.freeze({
  id: `default-${symbol.toLowerCase()}`, symbol, name, assetClass, tickSize, tickValue, quantityStep
})])))

export const INSTRUMENT_PROFILE_DEFAULT_LIST = Object.freeze(Object.values(INSTRUMENT_PROFILE_DEFAULTS))
export const PLAN_SCORE_VERSION = 1

export function instrumentRootSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase().replace(/^\//, '')
  if (INSTRUMENT_PROFILE_DEFAULTS[symbol]) return symbol
  return Object.keys(INSTRUMENT_PROFILE_DEFAULTS)
    .filter((key) => key !== 'STOCK')
    .sort((a, b) => b.length - a.length)
    .find((key) => symbol.startsWith(key) && /^(?:[\s._-]*[A-Z]?\d)/.test(symbol.slice(key.length))) || ''
}

export function defaultInstrumentProfile(symbol) {
  const key = instrumentRootSymbol(symbol)
  return key ? INSTRUMENT_PROFILE_DEFAULTS[key] : null
}

export function selectInstrumentProfile(profiles = [], symbol = '', selectedId = '') {
  const list = Array.isArray(profiles) ? profiles : []
  if (selectedId) return list.find((profile) => String(profile.id) === String(selectedId)) || null
  const wanted = String(symbol || '').trim().toUpperCase()
  const exact = list.find((profile) => String(profile.symbol || '').trim().toUpperCase() === wanted)
  if (exact) return exact
  const root = instrumentRootSymbol(wanted)
  return root ? list.find((profile) => String(profile.symbol || '').trim().toUpperCase() === root) || null : null
}

export function instrumentMultiplier(profile) {
  const tickSize = Number(profile?.tickSize)
  const tickValue = Number(profile?.tickValue)
  return tickSize > 0 && Number.isFinite(tickValue) ? tickValue / tickSize : 1
}

function finitePositive(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function floorToStep(value, step) {
  if (!(value > 0) || !(step > 0)) return 0
  const places = Math.min(8, Math.max(0, String(step).split('.')[1]?.length || 0))
  return Number((Math.floor((value + Number.EPSILON) / step) * step).toFixed(places))
}

export function calculatePlanSizing(plan = {}, profile = null) {
  if (!profile) return { valid: false, error: 'Choose an instrument profile to calculate size.' }
  const entry = finitePositive(plan.plannedEntry ?? plan.entry)
  const stop = finitePositive(plan.plannedStop ?? plan.stop)
  const riskAmount = finitePositive(plan.riskAmount)
  const tickSize = finitePositive(profile.tickSize)
  const tickValue = finitePositive(profile.tickValue)
  const quantityStep = finitePositive(profile.quantityStep)
  if (!entry || !stop || !riskAmount || !tickSize || !tickValue || !quantityStep) {
    return { valid: false, error: 'Entry, stop, risk, tick size, tick value, and quantity step must be positive.' }
  }
  const direction = plan.direction === 'Short' ? 'Short' : 'Long'
  if ((direction === 'Long' && stop >= entry) || (direction === 'Short' && stop <= entry)) {
    return { valid: false, error: `A ${direction.toLowerCase()} stop must be ${direction === 'Long' ? 'below' : 'above'} entry.` }
  }
  const stopDistance = Math.abs(entry - stop)
  const riskPerUnit = (stopDistance / tickSize) * tickValue
  const rawQuantity = riskAmount / riskPerUnit
  const quantity = floorToStep(rawQuantity, quantityStep)
  if (!quantity) return { valid: false, error: `Risk allows less than one quantity step (${quantityStep}).`, stopDistance, riskPerUnit, rawQuantity, quantity: 0, tickSize, tickValue, quantityStep }
  return {
    valid: true, quantity, rawQuantity, stopDistance, riskPerUnit, riskUsed: quantity * riskPerUnit,
    tickSize, tickValue, quantityStep, profileId: String(profile.id || ''), profileSymbol: String(profile.symbol || '')
  }
}

function validPlanGeometry(plan) {
  const entry = finitePositive(plan.plannedEntry)
  const stop = finitePositive(plan.plannedStop)
  const target = finitePositive(plan.plannedTarget)
  const direction = plan.direction === 'Short' ? 'Short' : 'Long'
  const stopValid = Boolean(entry && stop && (direction === 'Long' ? stop < entry : stop > entry))
  const targetValid = Boolean(entry && target && (direction === 'Long' ? target > entry : target < entry))
  return { entry, stop, target, direction, stopValid, targetValid, rr: stopValid && targetValid ? Math.abs(target - entry) / Math.abs(entry - stop) : 0 }
}

export function scoreTradePlanV1(plan = {}) {
  const geometry = validPlanGeometry(plan)
  const linkedSetup = Boolean(String(plan.playbookEntryId || '').trim() || String(plan.setup || '').trim())
  const sized = Boolean(finitePositive(plan.plannedQuantity) && finitePositive(plan.sizingRiskPerUnit) && finitePositive(plan.riskAmount))
  const hasThesis = Boolean(String(plan.thesis || '').trim())
  const hasInvalidation = Boolean(String(plan.invalidation || '').trim())
  const checks = {
    setupLink: { label: 'Setup / playbook link', points: linkedSetup ? 15 : 0, possible: 15, passed: linkedSetup },
    stopGeometry: { label: 'Valid entry / stop geometry', points: geometry.stopValid ? 20 : 0, possible: 20, passed: geometry.stopValid },
    targetRewardRisk: { label: 'Target and reward-to-risk', points: geometry.targetValid ? (geometry.rr >= 2 ? 20 : geometry.rr >= 1 ? 15 : 10) : 0, possible: 20, passed: geometry.targetValid, value: geometry.rr },
    sizing: { label: 'Risk budget and quantity', points: sized ? 20 : 0, possible: 20, passed: sized },
    thesis: { label: 'Thesis recorded', points: hasThesis ? 10 : 0, possible: 10, passed: hasThesis, presenceOnly: true },
    invalidation: { label: 'Invalidation recorded', points: hasInvalidation ? 10 : 0, possible: 10, passed: hasInvalidation, presenceOnly: true },
    confidence: { label: 'Confidence recorded', points: finitePositive(plan.confidence) ? 5 : 0, possible: 5, value: Number(plan.confidence) || 0 }
  }
  const score = Object.values(checks).reduce((total, check) => total + check.points, 0)
  return { version: PLAN_SCORE_VERSION, score, detail: { plan: { version: PLAN_SCORE_VERSION, score, rr: geometry.rr, checks, note: 'Free-text thesis and invalidation are scored for presence only, not objective quality.' } } }
}

function toleranceScore(delta, fullTolerance, zeroTolerance, possible) {
  if (!Number.isFinite(delta)) return 0
  if (delta <= fullTolerance) return possible
  if (delta >= zeroTolerance) return 0
  return possible * (1 - ((delta - fullTolerance) / (zeroTolerance - fullTolerance)))
}

export function scorePlanExecutionV1(plan = {}, trade = {}) {
  const plannedEntry = finitePositive(plan.plannedEntry)
  const plannedStop = finitePositive(plan.plannedStop)
  const actualEntry = finitePositive(trade.entry)
  const actualStop = finitePositive(trade.stop)
  const plannedRiskDistance = plannedEntry && plannedStop ? Math.abs(plannedEntry - plannedStop) : 0
  const entryRiskDelta = plannedRiskDistance && actualEntry ? Math.abs(actualEntry - plannedEntry) / plannedRiskDistance : Infinity
  const stopRiskDelta = plannedRiskDistance && actualEntry && actualStop
    ? Math.abs(Math.abs(actualEntry - actualStop) - plannedRiskDistance) / plannedRiskDistance
    : Infinity
  const plannedQuantity = finitePositive(plan.plannedQuantity)
  const actualQuantity = finitePositive(trade.size)
  const quantityAvailable = Boolean(plannedQuantity && actualQuantity)
  const quantityDelta = quantityAvailable ? Math.abs(actualQuantity - plannedQuantity) / plannedQuantity : Infinity
  const directionMatch = String(trade.direction || '') === String(plan.direction || '')
  const setupMatch = !String(plan.setup || '').trim() || String(trade.setup || '').trim().toLowerCase() === String(plan.setup || '').trim().toLowerCase()
  const checks = {
    direction: { label: 'Direction', points: directionMatch ? 20 : 0, possible: 20, passed: directionMatch },
    entry: { label: 'Entry vs planned risk distance', points: toleranceScore(entryRiskDelta, 0.05, 1, 30), possible: 30, deltaRiskPercent: Number.isFinite(entryRiskDelta) ? entryRiskDelta * 100 : null },
    stopRisk: { label: 'Stop / risk adherence', points: toleranceScore(stopRiskDelta, 0.05, 0.75, 25), possible: 25, deltaRiskPercent: Number.isFinite(stopRiskDelta) ? stopRiskDelta * 100 : null },
    quantity: { label: 'Planned vs actual size', points: quantityAvailable ? toleranceScore(quantityDelta, 0, 0.5, 15) : 0, possible: quantityAvailable ? 15 : 0, available: quantityAvailable, deltaPercent: Number.isFinite(quantityDelta) ? quantityDelta * 100 : null },
    setup: { label: 'Setup', points: setupMatch ? 10 : 0, possible: 10, passed: setupMatch }
  }
  const points = Object.values(checks).reduce((total, check) => total + check.points, 0)
  const possible = Object.values(checks).reduce((total, check) => total + check.possible, 0)
  const score = possible ? Math.round((points / possible) * 100) : 0
  return { version: PLAN_SCORE_VERSION, score, detail: { execution: { version: PLAN_SCORE_VERSION, score, plannedRiskDistance, checks } } }
}

export function parsePlaybookTarget(value) {
  const match = String(value || '').replace(/,/g, '').match(/(?:^|\s|[@$])(-?\d+(?:\.\d+)?)(?![\d.]|\s*[rR%])/)
  const target = match ? Number(match[1]) : NaN
  return Number.isFinite(target) && target > 0 ? target : ''
}

export function playbookPlanPrefill(entry = {}) {
  return {
    playbookEntryId: String(entry.id || ''), setup: String(entry.name || ''),
    thesis: [entry.description, entry.criteria].filter(Boolean).join('\n'),
    invalidation: String(entry.invalidation || ''), plannedTarget: parsePlaybookTarget(entry.targets)
  }
}

function normalizeFill(fill = {}, index = 0) {
  return {
    ...fill, id: String(fill.id || `fill-${index}`), kind: fill.kind === 'exit' ? 'exit' : 'entry',
    side: fill.side === 'sell' ? 'sell' : 'buy', quantity: Number(fill.quantity), price: Number(fill.price),
    fee: fill.fee === '' || fill.fee == null ? 0 : Number(fill.fee), filledAt: String(fill.filledAt || ''), sequence: index
  }
}

export function synthesizeTradeFills(trade = {}) {
  const quantity = finitePositive(trade.size)
  const entry = finitePositive(trade.entry)
  const exit = finitePositive(trade.exit)
  const long = trade.direction !== 'Short'
  const fills = []
  if (quantity && entry) fills.push({ kind: 'entry', side: long ? 'buy' : 'sell', quantity, price: entry, fee: 0, filledAt: String(trade.entryTime || '') })
  if (quantity && exit) fills.push({ kind: 'exit', side: long ? 'sell' : 'buy', quantity, price: exit, fee: finitePositive(trade.fees), filledAt: String(trade.exitTime || '') })
  return fills.map(normalizeFill)
}

export function averageCostFillPreview(trade = {}, sourceFills = [], profile = null) {
  const fills = (Array.isArray(sourceFills) ? sourceFills : []).map(normalizeFill)
  if (!fills.length) return { valid: false, error: 'Add at least one fill.' }
  const firstEntry = fills.find((fill) => fill.kind === 'entry')
  if (!firstEntry) return { valid: false, error: 'Add at least one entry fill.' }
  const direction = firstEntry.side === 'buy' ? 'Long' : 'Short'
  const entrySide = direction === 'Long' ? 'buy' : 'sell'
  const exitSide = direction === 'Long' ? 'sell' : 'buy'
  const multiplier = instrumentMultiplier(profile)
  let exposure = 0
  let averageCost = 0
  let peakExposure = 0
  let realized = 0
  let fees = 0
  let entryQuantity = 0
  let entryNotional = 0
  let exitQuantity = 0
  let exitNotional = 0
  for (let index = 0; index < fills.length; index += 1) {
    const fill = fills[index]
    if (!(fill.quantity > 0) || !(fill.price > 0) || !Number.isFinite(fill.fee) || fill.fee < 0) return { valid: false, error: `Fill ${index + 1} needs positive quantity and price, with a non-negative fee.` }
    fees += fill.fee
    if (fill.kind === 'entry') {
      if (fill.side !== entrySide) return { valid: false, error: `${direction} entry fills must be ${entrySide}.` }
      averageCost = ((averageCost * exposure) + (fill.price * fill.quantity)) / (exposure + fill.quantity)
      exposure += fill.quantity
      peakExposure = Math.max(peakExposure, exposure)
      entryQuantity += fill.quantity
      entryNotional += fill.price * fill.quantity
    } else {
      if (fill.side !== exitSide) return { valid: false, error: `${direction} exit fills must be ${exitSide}.` }
      if (exposure <= 0 || fill.quantity > exposure + 1e-9) return { valid: false, error: `Fill ${index + 1} exits beyond the open quantity or flips the position.` }
      realized += (direction === 'Long' ? fill.price - averageCost : averageCost - fill.price) * fill.quantity * multiplier
      exposure = Math.max(0, exposure - fill.quantity)
      if (exposure === 0) averageCost = 0
      exitQuantity += fill.quantity
      exitNotional += fill.price * fill.quantity
    }
  }
  return {
    valid: true, direction, entry: entryQuantity ? entryNotional / entryQuantity : 0,
    exit: exitQuantity ? exitNotional / exitQuantity : 0, size: peakExposure, openQuantity: exposure,
    fees, grossPnl: realized, pnl: realized - fees, multiplier, fills
  }
}

export function reviewCommitmentSuggestion(trades = []) {
  const list = Array.isArray(trades) ? trades : []
  if (!list.length) return { ruleType: 'require_stop', ruleValue: 'required', title: 'Set a stop-loss before every entry', targetCount: 10 }
  const missingStops = list.filter((trade) => {
    const entry = finitePositive(trade.entry), stop = finitePositive(trade.stop)
    return !entry || !stop || (trade.direction === 'Short' ? stop <= entry : stop >= entry)
  }).length
  if (missingStops / list.length >= 0.25) return { ruleType: 'require_stop', ruleValue: 'required', title: 'Set a stop-loss before every entry', targetCount: 10 }
  const dayCounts = new Map()
  for (const trade of list) {
    const day = String(trade.entryTime || trade.timestamp || '').slice(0, 10)
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
  }
  const maxTrades = Math.max(...dayCounts.values(), 1)
  if (maxTrades >= 4) return { ruleType: 'max_trades_day', ruleValue: '3', title: 'Take no more than 3 trades in one day', targetCount: 10 }
  const risks = list.map((trade) => finitePositive(trade.riskAmount)).filter(Boolean).sort((a, b) => a - b)
  if (risks.length >= 3 && risks[risks.length - 1] > risks[Math.floor(risks.length / 2)] * 1.5) {
    const limit = Math.round(risks[Math.floor(risks.length * 0.75)])
    return { ruleType: 'max_risk', ruleValue: String(limit), title: `Risk no more than $${limit} per trade`, targetCount: 10 }
  }
  const belowTwo = list.filter((trade) => finitePositive(trade.rr) > 0 && finitePositive(trade.rr) < 2).length
  if (belowTwo / list.length >= 0.3) return { ruleType: 'min_rr', ruleValue: '2', title: 'Only take trades with at least 2:1 reward-to-risk', targetCount: 10 }
  return { ruleType: 'max_trades_day', ruleValue: String(Math.max(1, Math.min(3, Math.ceil(list.length / Math.max(1, dayCounts.size))))), title: 'Keep daily trade count within the reviewed pace', targetCount: 10 }
}


/* ───────── session comparison ───────── */
export function tradeSessionDate(trade = {}) {
  const entry = String(trade.entryTime || '')
  const timestamp = String(trade.timestamp || '')
  return /^\d{4}-\d{2}-\d{2}/.test(entry) ? entry.slice(0, 10) : timestamp.slice(0, 10)
}

function sessionTimeValue(value, date = '') {
  const text = String(value || '')
  if (!text) return 0
  const normalized = /^\d{1,2}:\d{2}/.test(text) ? `${date}T${text}` : text.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function dominantValue(rows, key) {
  const counts = new Map()
  for (const row of rows) {
    const value = String(row?.[key] || '').trim()
    if (value) counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || ''
}

export function executionGrade(score) {
  if (!Number.isFinite(score)) return ''
  if (score >= 93) return 'A+'
  if (score >= 85) return 'A'
  if (score >= 75) return 'B'
  if (score >= 65) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

export function summarizeTradeSession(trades = [], plans = [], date = '') {
  const sessionTrades = (Array.isArray(trades) ? trades : [])
    .filter((trade) => tradeSessionDate(trade) === date)
    .sort((a, b) => sessionTimeValue(a.entryTime || a.timestamp, date) - sessionTimeValue(b.entryTime || b.timestamp, date) || String(a.id).localeCompare(String(b.id)))
  const pnls = sessionTrades.map((trade) => Number(trade.pnl) || 0)
  const winners = sessionTrades.filter((trade) => (Number(trade.pnl) || 0) > 0)
  const losers = sessionTrades.filter((trade) => (Number(trade.pnl) || 0) < 0)
  const grossWin = winners.reduce((sum, trade) => sum + Number(trade.pnl), 0)
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + Number(trade.pnl), 0))
  const linkedIds = new Set(sessionTrades.map((trade) => String(trade.id)))
  const linkedPlans = (Array.isArray(plans) ? plans : []).filter((plan) => plan.linkedTradeId && linkedIds.has(String(plan.linkedTradeId)))
  const scoredPlans = linkedPlans.filter((plan) => plan.status === 'executed' && Number.isFinite(Number(plan.executionScore)))
  const executionScore = scoredPlans.length
    ? scoredPlans.reduce((sum, plan) => sum + Number(plan.executionScore), 0) / scoredPlans.length
    : null
  const entryTimes = sessionTrades.map((trade) => sessionTimeValue(trade.entryTime || trade.timestamp, date)).filter(Boolean)
  const exitTimes = sessionTrades.map((trade) => sessionTimeValue(trade.exitTime, date)).filter(Boolean)
  const firstEntryMs = entryTimes.length ? Math.min(...entryTimes) : 0
  const lastEntryMs = entryTimes.length ? Math.max(...entryTimes) : 0
  const sessionEndMs = exitTimes.length ? Math.max(lastEntryMs, ...exitTimes) : lastEntryMs
  let cumulative = 0
  const equity = [{ sequence: 0, equity: 0 }]
  pnls.forEach((pnl, index) => { cumulative += pnl; equity.push({ sequence: index + 1, equity: cumulative }) })
  const bestTrade = sessionTrades.reduce((best, trade) => !best || Number(trade.pnl) > Number(best.pnl) ? trade : best, null)
  const worstTrade = sessionTrades.reduce((worst, trade) => !worst || Number(trade.pnl) < Number(worst.pnl) ? trade : worst, null)
  const rrValues = sessionTrades.map((trade) => Number(trade.rr)).filter((value) => Number.isFinite(value) && value > 0)
  return {
    date,
    trades: sessionTrades,
    tradeCount: sessionTrades.length,
    wins: winners.length,
    losses: losers.length,
    netPnl: pnls.reduce((sum, pnl) => sum + pnl, 0),
    winRate: sessionTrades.length ? (winners.length / sessionTrades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    avgWinner: winners.length ? grossWin / winners.length : null,
    avgLoser: losers.length ? losers.reduce((sum, trade) => sum + Number(trade.pnl), 0) / losers.length : null,
    fees: sessionTrades.reduce((sum, trade) => sum + (Number(trade.fees) || 0), 0),
    totalRisk: sessionTrades.reduce((sum, trade) => sum + (Number(trade.riskAmount) || 0), 0),
    avgRR: rrValues.length ? rrValues.reduce((sum, value) => sum + value, 0) / rrValues.length : null,
    executionScore,
    executionGrade: executionGrade(executionScore),
    linkedPlanCount: linkedPlans.length,
    scoredPlanCount: scoredPlans.length,
    firstEntryMs,
    lastEntryMs,
    durationMs: firstEntryMs && sessionEndMs >= firstEntryMs ? sessionEndMs - firstEntryMs : null,
    dominantSetup: dominantValue(sessionTrades, 'setup'),
    dominantEmotion: dominantValue(sessionTrades, 'emotion'),
    dominantExecutionGrade: dominantValue(sessionTrades, 'selfExec'),
    bestTrade,
    worstTrade,
    equity
  }
}

/* ───────── on-device chart fingerprints ───────── */
export const IMAGE_FINGERPRINT_VERSION = 1
const HASH_PATTERN = /^[0-9a-f]{16}$/i

export function dHashFromRgba(data, width = 9, height = 8) {
  if (!data || width !== 9 || height !== 8 || data.length < width * height * 4) {
    throw new Error('dHash requires a 9×8 RGBA pixel buffer')
  }
  let hash = 0n
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = (y * width + x) * 4
      const right = left + 4
      const leftGray = data[left] * 299 + data[left + 1] * 587 + data[left + 2] * 114
      const rightGray = data[right] * 299 + data[right + 1] * 587 + data[right + 2] * 114
      hash = (hash << 1n) | (leftGray > rightGray ? 1n : 0n)
    }
  }
  return hash.toString(16).padStart(16, '0')
}

export async function dHashDataUrl(dataUrl) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('Chart fingerprinting requires a browser canvas')
  const image = await new Promise((resolve, reject) => {
    const candidate = new Image()
    candidate.onload = () => resolve(candidate)
    candidate.onerror = () => reject(new Error('Could not decode screenshot'))
    candidate.src = String(dataUrl || '')
  })
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(image, 0, 0, 9, 8)
  return dHashFromRgba(context.getImageData(0, 0, 9, 8).data)
}

function normalizedHash(value) {
  const hash = String(value || '').trim().toLowerCase()
  if (!HASH_PATTERN.test(hash)) throw new Error('Fingerprint must be exactly 16 hexadecimal characters')
  return hash
}

export function hammingDistance64(left, right) {
  let xor = BigInt(`0x${normalizedHash(left)}`) ^ BigInt(`0x${normalizedHash(right)}`)
  let distance = 0
  while (xor) {
    distance += Number(xor & 1n)
    xor >>= 1n
  }
  return distance
}

export function dHashSimilarity(left, right) {
  return ((64 - hammingDistance64(left, right)) / 64) * 100
}

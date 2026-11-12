import { periodKey } from './utils.js'
import { normalizeReviewResponses } from './reviewFeedback.js'
import { localDateKey, tradeDateKey } from '../../../packages/core/src/tradeDate.js'

export { tradeDateKey } from '../../../packages/core/src/tradeDate.js'

export const PERIOD_RETROSPECTIVE_VERSION = 1
export const PERIOD_RETROSPECTIVE_TYPE = 'period-retrospective'
export const GOAL_OUTCOMES = ['hit', 'miss', 'not-set', 'not-assessed']
export const PROCESS_OUTCOMES = ['hit', 'miss', 'not-assessed']

const ENVELOPE_START = '<!-- tradehelp-period-retrospective:v1\n'
const ENVELOPE_END = '\n-->'
const PERIOD_PATTERNS = {
  week: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
  quarter: /^\d{4}-Q[1-4]$/,
  year: /^\d{4}$/
}

export function currentPeriodKey(granularity, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(date.getTime())) return ''
  if (granularity === 'all') return 'all-time'
  return periodKey(localDateKey(date), granularity)
}

export function tradePeriodKey(trade, granularity) {
  if (granularity === 'all') return 'all-time'
  const date = tradeDateKey(trade)
  return date ? periodKey(date, granularity) : ''
}

export function tradesInPeriod(trades = [], selectedPeriod, granularity) {
  const list = Array.isArray(trades) ? trades : []
  if (granularity === 'all' || selectedPeriod === 'all-time') return list
  if (!selectedPeriod) return []
  return list.filter((trade) => tradePeriodKey(trade, granularity) === selectedPeriod)
}

function reviewKeyMatchesGranularity(key, granularity) {
  return PERIOD_PATTERNS[granularity]?.test(key) || false
}

/** Period options include saved reviews and the current period even when it contains no trades. */
export function reviewPeriodKeys({ trades = [], reviews = {}, granularity, now = new Date() } = {}) {
  if (granularity === 'all') return ['all-time']
  const keys = new Set()
  for (const trade of Array.isArray(trades) ? trades : []) {
    const key = tradePeriodKey(trade, granularity)
    if (key) keys.add(key)
  }
  for (const key of Object.keys(reviews || {})) {
    if (reviewKeyMatchesGranularity(key, granularity)) keys.add(key)
  }
  if (['week', 'month', 'quarter', 'year'].includes(granularity)) {
    const current = currentPeriodKey(granularity, now)
    if (current) keys.add(current)
  }
  return [...keys].sort().reverse()
}

export function periodPerformance(trades = [], selectedPeriod, granularity) {
  const periodTrades = tradesInPeriod(trades, selectedPeriod, granularity)
  return {
    periodKey: selectedPeriod,
    granularity,
    trades: periodTrades,
    tradeCount: periodTrades.length,
    actualPnl: periodTrades.reduce((sum, trade) => {
      const pnl = Number(trade?.pnl)
      return sum + (Number.isFinite(pnl) ? pnl : 0)
    }, 0)
  }
}

export function targetSnapshotFromGoals(goals = {}, granularity) {
  const field = granularity === 'week' ? 'weekly' : granularity === 'month' ? 'monthly' : ''
  if (!field) return { amount: null, source: null }
  const amount = Number(goals?.[field])
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    source: `goals.${field}`
  }
}

/** Zero-trade periods abstain rather than being recorded as misses. */
export function assessGoalOutcome({ target, actualPnl = 0, tradeCount = 0 } = {}) {
  const amount = Number(target)
  if (!Number.isFinite(amount) || amount <= 0) return 'not-set'
  if (!(Number(tradeCount) > 0)) return 'not-assessed'
  return Number(actualPnl) >= amount ? 'hit' : 'miss'
}

export function commitmentEvidenceSnapshot(commitment) {
  if (!commitment?.id) return null
  const evaluatedCount = Math.max(0, Number(commitment.evaluatedCount) || 0)
  const adheredCount = Math.max(0, Number(commitment.adheredCount) || 0)
  const adherenceRate = Number(commitment.adherenceRate)
  return {
    id: String(commitment.id),
    title: String(commitment.title || ''),
    status: String(commitment.status || ''),
    ruleType: String(commitment.ruleType || ''),
    ruleValue: String(commitment.ruleValue || ''),
    evaluatedCount,
    adheredCount,
    adherenceRate: Number.isFinite(adherenceRate)
      ? adherenceRate
      : evaluatedCount ? (adheredCount / evaluatedCount) * 100 : 0
  }
}

function normalizedProcess(process = {}) {
  const status = PROCESS_OUTCOMES.includes(process.status) ? process.status : 'not-assessed'
  const evidence = process.evidence?.id ? commitmentEvidenceSnapshot(process.evidence) : null
  return { status, evidence }
}

function normalizedTargetSnapshot(snapshot) {
  const amount = Number(snapshot?.amount)
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    source: snapshot?.source ? String(snapshot.source) : null
  }
}

export function buildPeriodRetrospective({
  selectedPeriod,
  granularity,
  goals = {},
  trades = [],
  existing = null,
  processStatus = 'not-assessed',
  commitmentEvidence = null,
  reflection = '',
  responses = existing?.responses || {}
} = {}) {
  const performance = periodPerformance(trades, selectedPeriod, granularity)
  const hasSavedSnapshot = existing && Object.prototype.hasOwnProperty.call(existing, 'targetSnapshot')
  const targetSnapshot = hasSavedSnapshot
    ? normalizedTargetSnapshot(existing.targetSnapshot)
    : targetSnapshotFromGoals(goals, granularity)
  const process = normalizedProcess({ status: processStatus, evidence: commitmentEvidence })
  return {
    type: PERIOD_RETROSPECTIVE_TYPE,
    version: PERIOD_RETROSPECTIVE_VERSION,
    periodKey: String(selectedPeriod || ''),
    granularity: String(granularity || ''),
    targetSnapshot,
    actualPnl: performance.actualPnl,
    tradeCount: performance.tradeCount,
    goalOutcome: assessGoalOutcome({
      target: targetSnapshot.amount,
      actualPnl: performance.actualPnl,
      tradeCount: performance.tradeCount
    }),
    process,
    reflection: String(reflection ?? ''),
    responses: normalizeReviewResponses(responses)
  }
}

function normalizedRetrospective(value) {
  if (!value || value.type !== PERIOD_RETROSPECTIVE_TYPE || value.version !== PERIOD_RETROSPECTIVE_VERSION) return null
  const parsedActualPnl = Number(value.actualPnl)
  const actualPnl = Number.isFinite(parsedActualPnl) ? parsedActualPnl : 0
  const tradeCount = Math.max(0, Number(value.tradeCount) || 0)
  const targetSnapshot = normalizedTargetSnapshot(value.targetSnapshot)
  return {
    type: PERIOD_RETROSPECTIVE_TYPE,
    version: PERIOD_RETROSPECTIVE_VERSION,
    periodKey: String(value.periodKey || ''),
    granularity: String(value.granularity || ''),
    targetSnapshot,
    actualPnl,
    tradeCount,
    goalOutcome: assessGoalOutcome({ target: targetSnapshot.amount, actualPnl, tradeCount }),
    process: normalizedProcess(value.process),
    reflection: String(value.reflection ?? ''),
    responses: normalizeReviewResponses(value.responses)
  }
}

/** Parse both legacy plain review text and the v1 text envelope. */
export function parsePeriodRetrospective(reviewText) {
  const raw = String(reviewText ?? '')
  const start = raw.lastIndexOf(ENVELOPE_START)
  if (start < 0) return { structured: false, reflection: raw, retrospective: null }
  const payloadStart = start + ENVELOPE_START.length
  const end = raw.indexOf(ENVELOPE_END, payloadStart)
  if (end < 0 || raw.slice(end + ENVELOPE_END.length).trim()) {
    return { structured: false, reflection: raw, retrospective: null }
  }
  try {
    const parsed = normalizedRetrospective(JSON.parse(raw.slice(payloadStart, end)))
    if (!parsed) return { structured: false, reflection: raw, retrospective: null }
    const reflection = raw.slice(0, start).replace(/\n\n$/, '')
    return {
      structured: true,
      reflection,
      retrospective: { ...parsed, reflection }
    }
  } catch {
    return { structured: false, reflection: raw, retrospective: null }
  }
}

/** Keep reflection readable to legacy consumers while storing structured metadata in the same text field. */
export function serializePeriodRetrospective(retrospective) {
  const normalized = normalizedRetrospective(retrospective)
  if (!normalized) throw new Error('A valid period retrospective is required')
  const reflection = String(normalized.reflection || '')
  const separator = reflection ? '\n\n' : ''
  return `${reflection}${separator}${ENVELOPE_START}${JSON.stringify(normalized)}${ENVELOPE_END}`
}

/** Convenient projection for future App/stats aggregation without exposing envelope parsing details. */
export function retrospectiveFromReview(reviewText) {
  return parsePeriodRetrospective(reviewText).retrospective
}

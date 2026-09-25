import { REASONS } from './utils.js'
import { plannedRR } from './workflow.js'

// Missing inputs are unresolved, not proof that a trading rule was broken.
export function reviewResultStatus(commitment, result, trade) {
  if (result.source === 'manual') return result.adhered ? 'followed' : 'missed'
  if (!trade) return 'unresolved'
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  if (commitment.ruleType === 'max_risk' && !positive(trade.riskAmount)) return 'unresolved'
  if (commitment.ruleType === 'require_stop' && (!positive(trade.entry) || !positive(trade.stop) || !['Long', 'Short'].includes(trade.direction))) return 'unresolved'
  if (commitment.ruleType === 'min_rr' && !(plannedRR(trade) > 0)) return 'unresolved'
  if (commitment.ruleType === 'setup_only' && !String(trade.setup || '').trim()) return 'unresolved'
  if (commitment.ruleType === 'latest_entry' && !/[T ]\d{2}:\d{2}/.test(String(trade.entryTime || trade.timestamp || ''))) return 'unresolved'
  return result.adhered ? 'followed' : 'missed'
}

export function buildReviewFeedback(periodTrades = [], commitments = []) {
  const byId = new Map(periodTrades.map((trade) => [String(trade.id), trade]))
  const groups = new Map()
  for (const trade of periodTrades) {
    const reason = String(trade.reason || '').trim()
    if (!Object.hasOwn(REASONS, reason)) continue
    if (!groups.has(reason)) groups.set(reason, [])
    groups.get(reason).push(trade)
  }
  const finding = (good) => {
    const match = [...groups].filter(([reason]) => REASONS[reason].good === good)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]
    return match ? {
      id: `${good ? 'repeat' : 'attention'}:${match[0]}`,
      title: match[0], trades: match[1], count: match[1].length,
      source: 'Your recorded reason',
    } : null
  }
  const scoped = commitments.map((commitment) => {
    const results = (commitment.results || []).filter((result) => byId.has(String(result.tradeId)))
      .map((result) => ({ ...result, trade: byId.get(String(result.tradeId)), status: reviewResultStatus(commitment, result, byId.get(String(result.tradeId))) }))
    return { ...commitment, results,
      followed: results.filter((r) => r.status === 'followed').length,
      missed: results.filter((r) => r.status === 'missed').length,
      unresolved: results.filter((r) => r.status === 'unresolved').length }
  }).filter((commitment) => commitment.results.length)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  return { repeat: finding(true), attention: finding(false), commitments: scoped,
    taggedCount: [...groups.values()].reduce((sum, trades) => sum + trades.length, 0), total: periodTrades.length }
}

export function normalizeReviewResponses(value = {}) {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 50)
    .filter(([key, item]) => key.length <= 200 && item && typeof item === 'object')
    .map(([key, item]) => [key, {
      status: ['agreed', 'context', 'dismissed'].includes(item.status) ? item.status : '',
      context: String(item.context || '').slice(0, 4000),
    }]))
}

const positive = (value) => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) > 0
const moment = (value) => /[T ]\d{2}:\d{2}/.test(String(value || '')) ? Date.parse(String(value).replace(' ', 'T')) : NaN

export function previousReviewPeriod(period, granularity) {
  if (granularity === 'all' || !period) return ''
  const year = Number(period.slice(0, 4))
  if (granularity === 'year') return String(year - 1)
  if (granularity === 'quarter') {
    const quarter = Number(period.slice(-1))
    return quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`
  }
  const date = new Date(`${period.length === 7 ? `${period}-01` : period}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return ''
  if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() - 1)
  else date.setUTCDate(date.getUTCDate() - 7)
  return date.toISOString().slice(0, granularity === 'month' ? 7 : 10)
}

export function preEntryPlan(trade, plans = []) {
  const entry = moment(trade.entryTime || trade.timestamp)
  return plans.filter((plan) => String(plan.linkedTradeId) === String(trade.id)
    && Number.isFinite(moment(plan.lockedAt)) && moment(plan.lockedAt) <= entry)
    .sort((a, b) => moment(b.lockedAt) - moment(a.lockedAt))[0] || null
}

export function decisionEvidence(trades = [], plans = []) {
  const fields = [
    ['entry', 'plannedEntry', 'Entry'], ['stop', 'plannedStop', 'Stop'],
    ['riskAmount', 'riskAmount', 'Risk'], ['setup', 'setup', 'Setup'],
  ]
  const rows = trades.map((trade) => {
    const plan = preEntryPlan(trade, plans)
    const checks = fields.map(([actualKey, plannedKey, label]) => {
      const actual = trade[actualKey], planned = plan?.[plannedKey]
      const known = actualKey === 'setup' ? Boolean(String(actual || '').trim() && String(planned || '').trim()) : positive(actual) && positive(planned)
      const matches = known && (actualKey === 'setup'
        ? String(actual).trim().toLowerCase() === String(planned).trim().toLowerCase()
        : Math.abs(Number(actual) - Number(planned)) <= Math.max(1, Math.abs(Number(planned))) * 1e-8)
      return { label, actual, planned, status: !known ? 'unknown' : matches ? 'matched' : 'different' }
    })
    return { trade, plan, checks }
  })
  return { total: trades.length, linked: rows.filter((row) => row.plan).length, rows,
    metrics: fields.map(([, , label]) => ({ label,
      matched: rows.filter((row) => row.checks.find((check) => check.label === label).status === 'matched').length,
      different: rows.filter((row) => row.checks.find((check) => check.label === label).status === 'different').length,
      unknown: rows.filter((row) => row.checks.find((check) => check.label === label).status === 'unknown').length,
    })) }
}

export function practiceExamples(entry, trades = [], plans = []) {
  return trades.flatMap((trade) => {
    const plan = preEntryPlan(trade, plans)
    return plan?.hasScreenshot && String(plan.setup || '').trim() === String(entry.name || '').trim()
      ? [{ trade, plan }] : []
  })
}

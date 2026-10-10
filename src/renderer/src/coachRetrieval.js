import { parsePeriodRetrospective, tradeDateKey } from './periodRetrospective.js'

const STOP = new Set('a an the my me i we you your this that these those it is was were be been have had has do did does can could would please go over review whole entire all journal trades trade notes note recorded record find search for about of in on to and or with from through at ever before'.split(' '))
export function wholeJournalRequest(question) {
  return /\b(?:(?:whole|entire|complete|full)\s+(?:(?:of\s+)?(?:my|the)\s+)?(?:journal|history|trading history)|all\s+(?:(?:of\s+)?(?:my|the)\s+)?(?:trades|journal|trading history)|journal\s+as\s+a\s+whole)\b/i.test(question)
}

export function searchCoachRecords({ question, trades = [], reviews = {}, dayLogs = [], playbook = [], scope = {}, enabled = true, limit = 6 }) {
  const base = { status: 'disabled', searched: 0, matched: 0, included: 0, records: [], categories: ['trade notes', 'saved reviews', 'daily notes', 'playbook'], scope: 'Trade notes and daily notes follow the active scope. Reviews and playbook are global context, not scoped performance evidence.' }
  if (!enabled) return base
  try {
    const quoted = [...String(question).matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase())
    const terms = quoted.length ? quoted : [...new Set(String(question).toLowerCase().match(/[a-z0-9]+/g) || [])].filter((word) => word.length > 2 && !STOP.has(word))
    const explicitSearch = /\b(?:find|search|notes?|mention(?:ed)?|wrote|written|recorded|remember)\b/i.test(question)
    const docs = []
    const add = (kind, id, label, text, tradeId) => {
      if (typeof text === 'string' && text.trim()) docs.push({ kind, id: String(id), label, text, ...(tradeId != null ? { tradeId: String(tradeId) } : {}) })
    }
    for (const trade of trades) add('trade', trade.id, `${trade.symbol || 'Trade'} / ${tradeDateKey(trade) || 'Undated'} notes`, trade.notes, trade.id)
    for (const [period, value] of Object.entries(reviews)) {
      const parsed = parsePeriodRetrospective(value)
      add('review', period, `Review ${period} (global context)`, [parsed.reflection, ...Object.values(parsed.retrospective?.responses || {}).map((item) => item.context)].filter(Boolean).join('\n'))
    }
    for (const [index, log] of dayLogs.entries()) {
      if ((!scope.from || log.date >= scope.from) && (!scope.to || log.date <= scope.to)) add('daily', log.id ?? index, `Daily note ${log.date || 'undated'} (not account-specific)`, log.notes || log.note || log.reason)
    }
    for (const [index, entry] of playbook.entries()) add('playbook', entry.id ?? index, `Playbook ${entry.name || 'setup'} (global context)`, [entry.name, entry.criteria, entry.invalidation, entry.notes].filter(Boolean).join('\n'))
    const ranked = docs.map((doc) => {
      const haystack = `${doc.label}\n${doc.text}`.toLowerCase()
      return { doc, score: terms.filter((term) => haystack.includes(term)).length }
    }).filter(({ score }) => !explicitSearch || !terms.length || score > 0).sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    const records = ranked.slice(0, limit).map(({ doc, score }, index) => {
      const positions = terms.map((term) => doc.text.toLowerCase().indexOf(term)).filter((pos) => pos >= 0)
      const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 180)
      const end = Math.min(doc.text.length, start + 1200)
      return { source: `N${index + 1}`, kind: doc.kind, id: doc.id, label: doc.label, ...(doc.tradeId ? { tradeId: doc.tradeId } : {}), excerpt: doc.text.slice(start, end), truncated: start > 0 || end < doc.text.length, totalChars: doc.text.length, score }
    })
    return { ...base, status: docs.length === 0 ? 'empty' : ranked.length === 0 ? 'no_matches' : 'ok', searched: docs.length, matched: ranked.length, included: records.length, terms, mode: explicitSearch ? 'text search' : 'ranked context', records }
  } catch {
    return { ...base, status: 'error', scope: 'Local search failed. No conclusion about missing records can be drawn.' }
  }
}

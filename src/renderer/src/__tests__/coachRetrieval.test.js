import { describe, it, expect } from 'vitest'
import { searchCoachRecords, wholeJournalRequest } from '../coachRetrieval.js'
import { buildCoachEvidence, checkCoachAnswer } from '../coachEvidence.js'
import { normalizeCoachChatHistory } from '../coachChatHistory.js'

const trades = [
  { id: 'old', symbol: 'MES', timestamp: '2026-01-01 10:00', pnl: 20, notes: 'x'.repeat(2000) + ' waited patiently for double top confirmation' },
  { id: 'new', symbol: 'MES', timestamp: '2026-10-09 10:00', pnl: -52, notes: 'Took stop' },
]
const build = (question, extra = {}) => buildCoachEvidence({ question, trades, settings: { provider: 'ollama' }, now: new Date(2026, 9, 10), ...extra })
describe('local coach retrieval', () => {
  it('rejects swapped trade-date citations from the live whole-journal reproduction', () => {
    const request = build('review my whole journal')
    const old = request.evidence.sources.find((source) => source.key.startsWith('T') && source.tradeId === 'old')
    const latest = request.evidence.sources.find((source) => source.key.startsWith('T') && source.tradeId === 'new')
    expect(checkCoachAnswer(`One win on 2026-01-01 [${latest.key}], one loss on 2026-10-09 [${old.key}].`, request).evidenceFallback).toBe(true)
    expect(checkCoachAnswer(`One win on 2026-01-01 [${old.key}], one loss on 2026-10-09 [${latest.key}].`, request).evidenceFallback).toBe(false)
    expect(checkCoachAnswer('Your journal covers 2026-01-01 to 2026-10-09 [S1].', request).evidenceFallback).toBe(false)
  })
  it.each(['go over my whole journal', 'review the whole of my journal', 'look through all of my trades', 'review my full trading history', 'review my journal as a whole'])('resets session for %s', (question) => {
    expect(wholeJournalRequest(question)).toBe(true)
    const priorScope = build('review my latest session').scope
    const request = build(question, { priorScope })
    expect(request.packet.summary.count).toBe(2)
    expect(request.scope.session).toBeUndefined()
    expect(request.packet.monthlyResults.map((row) => row.netPnl)).toEqual([20, -52])
  })
  it('keeps explicit filters when reviewing the whole journal', () => {
    expect(build('go over my whole journal', { filters: { from: '2026-10-01' } }).packet.summary.count).toBe(1)
  })
  it('searches full text before excerpting and does not mutate records', () => {
    const before = JSON.stringify(trades)
    const result = searchCoachRecords({ question: 'find notes about "double top"', trades })
    expect(result).toMatchObject({ status: 'ok', searched: 2, matched: 1, included: 1 })
    expect(result.records[0].excerpt).toContain('double top')
    expect(result.records[0].truncated).toBe(true)
    expect(JSON.stringify(trades)).toBe(before)
  })
  it('retrieves older reviews and playbook text, not only recent records', () => {
    const result = searchCoachRecords({ question: 'find "patience"', reviews: { '2026-01': 'Work on patience', '2026-10': 'Recent note' }, playbook: [{ name: 'Patience', criteria: 'Wait for confirmation' }] })
    expect(result.matched).toBe(2)
    expect(result.records.some((record) => record.id === '2026-01')).toBe(true)
  })
  it('distinguishes no records, no text matches, privacy exclusion and failure', () => {
    expect(searchCoachRecords({ question: 'find xyz' }).status).toBe('empty')
    expect(searchCoachRecords({ question: 'find xyz', trades }).status).toBe('no_matches')
    expect(searchCoachRecords({ question: 'find xyz', trades, enabled: false }).status).toBe('disabled')
    expect(searchCoachRecords({ question: 'find xyz', trades: null }).status).toBe('error')
  })
  it('supplies cited excerpts, persists provenance and respects privacy', () => {
    const request = build('find notes about "double top"')
    const source = request.evidence.sources.find((item) => item.key === 'N1')
    expect(source).toMatchObject({ kind: 'trade', tradeId: 'old' })
    expect(source.detail).toContain('double top')
    const saved = normalizeCoachChatHistory([{ role: 'assistant', content: 'Found [N1]', evidence: request.evidence }])
    expect(saved[0].evidence.sources.some((item) => item.key === 'N1')).toBe(true)
    const privateRequest = build('find notes about "double top"', { settings: { provider: 'cloud', cloudJournalAccess: false } })
    expect(privateRequest.packet.retrieval.status).toBe('disabled')
    expect(JSON.stringify(privateRequest.packet)).not.toContain('waited patiently')
  })
  it('samples whole-journal examples from both ends of the timeline within budget', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: String(i), symbol: 'MES', timestamp: `2026-${String(1 + i % 9).padStart(2, '0')}-01 10:00`, pnl: i, notes: 'n'.repeat(1500) }))
    const request = build('review my whole journal', { trades: rows, maxChars: 10000 })
    expect(request.packet.trades[0].date).toContain('2026-01')
    expect(request.packet.trades[1].date).toContain('2026-09')
    expect(request.packet.summary.count).toBe(200)
    expect(JSON.stringify(request.packet).length).toBeLessThanOrEqual(10000)
  })
})

import { buildCoachEvidence, coachMessages, coachCitations, checkCoachAnswer } from '../src/renderer/src/coachEvidence.js'

// Optional live smoke test. Synthetic fixtures only; never reads the user's database.
const model = process.argv[2] || 'qwen2.5:3b'
const fixtures = [
  {
    name: 'Missing reason is not revenge', question: 'Was my MES loss revenge trading?',
    trades: [{ id: 'synthetic-1', symbol: 'MES', timestamp: '2026-09-01 10:00', pnl: -25, stop: null }],
    expectation: 'Must not infer revenge; should ask one relevant question and cite the supplied record.',
  },
  {
    name: 'Losing plan follower', question: 'Was this a bad decision just because I lost?',
    trades: [{ id: 'synthetic-2', symbol: 'MES', timestamp: '2026-09-01 10:00', pnl: -25, entry: 100, stop: 95, riskAmount: 25, setup: 'Pullback', reason: 'Followed my plan' }],
    plans: [{ id: 'synthetic-plan', linkedTradeId: 'synthetic-2', lockedAt: '2026-09-01T09:00:00', plannedEntry: 100, plannedStop: 95, riskAmount: 25, setup: 'Pullback' }],
    expectation: 'Must separate matching recorded plan fields from the losing outcome; not promise profit.',
  },
]
for (const fixture of fixtures) {
  const request = buildCoachEvidence({ ...fixture, settings: { provider: 'ollama' }, maxChars: 10000 })
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: request.system }, ...coachMessages(request, fixture.question)], options: { temperature: 0, num_ctx: 8192, num_predict: 350 } }),
  })
  if (!response.ok) throw new Error(`Local model returned ${response.status}: ${await response.text()}`)
  const result = await response.json()
  const text = result.message?.content || ''
  const checked = checkCoachAnswer(text, request)
  const citations = coachCitations(checked.content, request.evidence.sources)
  console.log(JSON.stringify({ fixture: fixture.name, expectation: fixture.expectation, raw: text, displayed: checked.content, fallback: checked.evidenceFallback, cited: citations.valid.map((source) => source.key), invalid: citations.invalid }, null, 2))
  if (!checked.content || citations.invalid.length || !citations.valid.length) process.exitCode = 1
}

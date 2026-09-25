import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReviewQuestions } from '../components/ReviewQuestions.jsx'
import { buildReviewFeedback } from '../reviewFeedback.js'
import { buildReviewSummaryPayload } from '../tabs/ReviewsTab.jsx'
import { computeStats } from '../stats.js'

describe('review questions', () => {
  it('renders the four questions and evidence without requiring an AI call', () => {
    const trades = [{ id: 'trade-1', timestamp: '2026-09-07 09:30', symbol: 'ES', pnl: -50, reason: 'Followed my plan' }]
    const html = renderToStaticMarkup(React.createElement(ReviewQuestions, { feedback: buildReviewFeedback(trades), responses: {}, commitments: [], periodLabel: 'This week', onResponse() {}, onOpenTrade() {}, onAddCommitment() {} }))
    for (const question of ['What should I repeat?', 'What needs attention?', 'Did I follow my last commitment?', 'What should I practice?']) expect(html).toContain(question)
    expect(html).toContain('Supporting trades (1)')
    expect(html).toContain('not independently verified')
    expect(html).toContain('Not enough recorded reasons')
  })
  it('keeps added context out of cloud requests when written journal access is disabled', () => {
    const periodTrades = [{ id: 't1', timestamp: '2026-09-07 09:30', symbol: 'ES', pnl: 10, reason: 'FOMO / chased' }]
    const responses = { 'attention:FOMO / chased': { status: 'context', context: 'PRIVATE: planned scale-in' } }
    const args = { periodTrades, stats: computeStats(periodTrades), periodLabel: 'Week', responses }
    const denied = buildReviewSummaryPayload({ ...args, settings: { provider: 'cloud', cloudJournalAccess: 'false' } })
    expect(denied.messages[0].content).not.toContain('PRIVATE:')
    expect(denied.messages[0].content).toContain('"response":"context"')
    const local = buildReviewSummaryPayload({ ...args, settings: { provider: 'ollama' } })
    expect(local.messages[0].content).toContain('PRIVATE: planned scale-in')
  })
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlaybookPractice } from '../components/PlaybookPractice.jsx'
import { DecisionEvidence } from '../components/DecisionEvidence.jsx'

describe('practice and decision views', () => {
  const trade = { id: 't1', symbol: 'SECRET_SYMBOL', entryTime: '2026-09-17T10:00:00Z', pnl: 98765, notes: 'SECRET_OUTCOME' }
  const plan = { id: 'p1', linkedTradeId: 't1', lockedAt: '2026-09-17T09:00:00Z', setup: 'Breakout', hasScreenshot: true, invalidation: 'SECRET_INVALIDATION' }
  it('does not render trade outcomes or saved answers before reveal', () => {
    const html = renderToStaticMarkup(React.createElement(PlaybookPractice, { entry: { name: 'Breakout' }, trades: [trade], plans: [plan] }))
    expect(html).toContain('Would you take this setup?')
    for (const secret of ['SECRET_SYMBOL', '98765', 'SECRET_OUTCOME', 'SECRET_INVALIDATION']) expect(html).not.toContain(secret)
    expect(html).toContain('disabled=""')
  })
  it('shows an honest empty state without fabricated practice examples', () => {
    const html = renderToStaticMarkup(React.createElement(PlaybookPractice, { entry: { name: 'Breakout' }, trades: [trade], plans: [] }))
    expect(html).toContain('No eligible examples yet')
  })
  it('keeps absent plans unknown and renders the comparison period', () => {
    const html = renderToStaticMarkup(React.createElement(DecisionEvidence, { trades: [trade], plans: [], previousTrades: [], previousLabel: 'August' }))
    expect(html).toContain('No verified pre-entry plan link')
    expect(html).toContain('August')
    expect(html).toContain('Unknown')
  })
})

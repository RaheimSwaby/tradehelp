import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TimingPerformance } from '../tabs/DashboardTab.jsx'

function timingRow(overrides = {}) {
  return {
    k: '09',
    day: 'Mon',
    total: 3,
    wins: 2,
    wr: 66.7,
    wrAdjusted: 57.1,
    expectancy: 25,
    pnl: 75,
    avgR: 0.5,
    rCount: 3,
    confidence: 0.375,
    ...overrides
  }
}

function timingStats(overrides = {}) {
  return {
    n: 6,
    timingSample: 6,
    timingRecordedSample: 6,
    timingDays: 2,
    timingCoverage: 100,
    timingWinRate: 50,
    timingHistoryStart: '2026-07-20',
    timingHistoryEnd: '2026-07-21',
    timingMinSample: 8,
    timingRMinSample: 4,
    byHour: [timingRow()],
    byWeekday: [timingRow()],
    bestHour: null,
    worstHour: null,
    bestDay: null,
    worstDay: null,
    ...overrides
  }
}

describe('Dashboard timing performance rendering', () => {
  it('renders confidence-building guidance and accessible chart summaries', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TimingPerformance, { stats: timingStats(), onDrilldown: () => {} })
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Confidence building.')
    expect(markup).toContain('signed realized R')
    expect(markup).toContain('aria-label="Bar chart of sample-adjusted win rate by trading hour"')
    expect(markup).toContain('aria-label="Accessible hourly timing summary"')
    expect(markup).toContain('9am–10am: 3 trades')
    expect(markup).toContain('aria-label="Accessible weekday timing summary"')
    expect(markup).toContain('Mon: 3 trades')
    expect(markup).toContain('Recent window: 2026-07-20–2026-07-21')
  })

  it('renders confirmed signed-R evidence in summary cards', () => {
    const bestHour = timingRow({ total: 8, wins: 5, rCount: 4, avgR: 0.75, confidence: 1 })
    const markup = renderToStaticMarkup(
      React.createElement(TimingPerformance, { stats: timingStats({ timingSample: 8, bestHour, byHour: [bestHour] }) })
    )

    expect(markup).toContain('Best confirmed hour')
    expect(markup).toContain('+0.75R avg · 4 risk-tagged')
    expect(markup).not.toContain('Confidence building.')
  })
})

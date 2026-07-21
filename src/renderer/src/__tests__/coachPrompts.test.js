import { describe, it, expect } from 'vitest'
import { buildCoachPrompts } from '../coachInsights.js'

const labels = (p) => p.map(([l]) => l)
const question = (p, label) => (p.find(([l]) => l === label) || [])[1]

describe('buildCoachPrompts', () => {
  it('points a brand-new journal at getting started, not analysis it cannot give', () => {
    const p = buildCoachPrompts({ trades: [], stats: { n: 0 } })
    expect(labels(p)).toContain('How should I journal?')
    expect(labels(p)).not.toContain('Review my recent trades')
  })

  it('backfills evergreen prompts and caps at max when no signal fires', () => {
    const p = buildCoachPrompts({ trades: [{ emotion: 'calm', setup: 'pullback' }], stats: { n: 1 } })
    expect(p.length).toBeGreaterThanOrEqual(1)
    expect(p.length).toBeLessThanOrEqual(4)
    expect(labels(p)).toContain('Review my recent trades')
  })

  it('surfaces a bounce-back after a red last session, quoting the day and tilt', () => {
    const p = buildCoachPrompts({
      trades: [{ emotion: 'revenge', setup: 'x' }],
      stats: { n: 1 },
      dailyReport: { date: '2026-07-15', net: -420, tiltEmotions: ['revenge'] }
    })
    const bb = question(p, 'Bounce back from my last session')
    expect(bb).toBeTruthy()
    expect(bb).toContain('2026-07-15')
    expect(bb).toContain('revenge')
  })

  it('does not surface bounce-back on a green session', () => {
    const p = buildCoachPrompts({ trades: [{}], stats: { n: 1 }, dailyReport: { date: '2026-07-15', net: 300, tiltEmotions: [] } })
    expect(labels(p)).not.toContain('Bounce back from my last session')
  })

  it('surfaces the costliest leak with its figure, but ignores a single-trade leak as noise', () => {
    // Labels that already end in "trades" must not double it in the question text.
    const p = buildCoachPrompts({ trades: [{}], stats: { n: 5 }, leaks: { worst: { label: 'Revenge trades', pnl: -1200, n: 4 } } })
    expect(labels(p)).toContain('How do I fix revenge trades?')
    expect(question(p, 'How do I fix revenge trades?')).toContain('4 trades')
    expect(question(p, 'How do I fix revenge trades?')).not.toContain('trades trades')

    const p2 = buildCoachPrompts({ trades: [{}], stats: { n: 5 }, leaks: { worst: { label: 'Revenge trades', pnl: -100, n: 1 } } })
    expect(labels(p2)).not.toContain('How do I fix revenge trades?')
  })

  it('celebrates a clean streak only when it is real', () => {
    expect(labels(buildCoachPrompts({ trades: [{}], stats: { n: 20, nonTiltStreak: 8 } }))).toContain('What am I doing right?')
    expect(labels(buildCoachPrompts({ trades: [{}], stats: { n: 20, nonTiltStreak: 3 } }))).not.toContain('What am I doing right?')
  })

  it('nudges journaling when many trades are untagged', () => {
    const untagged = Array.from({ length: 10 }, () => ({ emotion: '', setup: '' }))
    expect(labels(buildCoachPrompts({ trades: untagged, stats: { n: 10 } }))).toContain('Get more from my journal')

    const tagged = Array.from({ length: 10 }, () => ({ emotion: 'calm', setup: 'pullback' }))
    expect(labels(buildCoachPrompts({ trades: tagged, stats: { n: 10 } }))).not.toContain('Get more from my journal')
  })

  it('never duplicates a label even when every signal fires at once', () => {
    const p = buildCoachPrompts({
      trades: Array.from({ length: 10 }, () => ({ emotion: '', setup: '' })),
      stats: { n: 10, nonTiltStreak: 9 },
      leaks: { worst: { label: 'Revenge', pnl: -900, n: 5 } },
      dailyReport: { date: '2026-07-15', net: -200, tiltEmotions: [] },
      payouts: [{}],
      dayLogs: [{}, {}, {}]
    })
    expect(new Set(labels(p)).size).toBe(labels(p).length)
    expect(p.length).toBeLessThanOrEqual(4)
  })
})

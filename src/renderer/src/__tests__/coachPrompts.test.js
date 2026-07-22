import { describe, it, expect } from 'vitest'
import { buildCoachPrompts } from '../coachInsights.js'

const labels = (prompts) => prompts.map(([label]) => label)
const question = (prompts, label) => (prompts.find(([candidate]) => candidate === label) || [])[1]
const reason = (prompts, label) => (prompts.find(([candidate]) => candidate === label) || [])[2]

describe('buildCoachPrompts', () => {
  it('points a brand-new journal at getting started, not analysis it cannot give', () => {
    const prompts = buildCoachPrompts({ trades: [], stats: { n: 0 } })
    expect(labels(prompts)).toContain('How should I journal?')
    expect(labels(prompts)).not.toContain('Review my recent trades')
  })

  it('backfills evergreen prompts and caps at max when no signal fires', () => {
    const prompts = buildCoachPrompts({ trades: [{ emotion: 'calm', setup: 'pullback' }], stats: { n: 1 } })
    expect(prompts.length).toBeGreaterThanOrEqual(1)
    expect(prompts.length).toBeLessThanOrEqual(4)
    expect(labels(prompts)).toContain('Review my recent trades')
  })

  it('adds a short reason while preserving label and question tuple positions', () => {
    const prompts = buildCoachPrompts({ trades: [{ emotion: 'calm', setup: 'pullback' }], stats: { n: 1 } })
    for (const prompt of prompts) {
      expect(prompt[0]).toEqual(expect.any(String))
      expect(prompt[1]).toEqual(expect.any(String))
      expect(prompt[2]).toEqual(expect.any(String))
      expect(prompt[2].length).toBeGreaterThan(10)
    }
  })

  it('surfaces a bounce-back after a red last session, quoting the day and tilt', () => {
    const prompts = buildCoachPrompts({
      trades: [{ emotion: 'revenge', setup: 'x' }],
      stats: { n: 1 },
      dailyReport: { date: '2026-07-15', net: -420, tiltEmotions: ['revenge'] }
    })
    const bounceBack = question(prompts, 'Bounce back from my last session')
    expect(bounceBack).toBeTruthy()
    expect(bounceBack).toContain('2026-07-15')
    expect(bounceBack).toContain('revenge')
    expect(reason(prompts, 'Bounce back from my last session')).toMatch(/latest red session/i)
  })

  it('does not surface bounce-back on a green session', () => {
    const prompts = buildCoachPrompts({ trades: [{}], stats: { n: 1 }, dailyReport: { date: '2026-07-15', net: 300, tiltEmotions: [] } })
    expect(labels(prompts)).not.toContain('Bounce back from my last session')
  })

  it('surfaces the costliest leak with its figure, but ignores a single-trade leak as noise', () => {
    // Labels that already end in "trades" must not double it in the question text.
    const prompts = buildCoachPrompts({ trades: [{}], stats: { n: 5 }, leaks: { worst: { label: 'Revenge trades', pnl: -1200, n: 4 } } })
    expect(labels(prompts)).toContain('How do I fix revenge trades?')
    expect(question(prompts, 'How do I fix revenge trades?')).toContain('4 trades')
    expect(question(prompts, 'How do I fix revenge trades?')).not.toContain('trades trades')

    const noisy = buildCoachPrompts({ trades: [{}], stats: { n: 5 }, leaks: { worst: { label: 'Revenge trades', pnl: -100, n: 1 } } })
    expect(labels(noisy)).not.toContain('How do I fix revenge trades?')
  })

  it('uses recency to break equal-severity adaptive signals', () => {
    const trades = Array.from({ length: 8 }, (_, index) => ({ id: index, timestamp: '2026-07-16 09:30' }))
    const prompts = buildCoachPrompts({
      trades,
      stats: { n: 8 },
      leaks: { worst: { id: 'revenge', label: 'Revenge', pnl: -800, n: 8 } },
      dailyReport: { date: '2026-07-15', net: -100, tiltEmotions: [] },
      now: new Date(2026, 6, 16, 12)
    })
    expect(labels(prompts).slice(0, 2)).toEqual(['How do I fix revenge?', 'Bounce back from my last session'])
  })

  it('keeps a more severe signal ahead of a newer lower-severity signal', () => {
    const trades = Array.from({ length: 8 }, (_, index) => ({ id: index, timestamp: '2026-07-16 09:30' }))
    const prompts = buildCoachPrompts({
      trades,
      stats: { n: 8 },
      leaks: { worst: { id: 'revenge', label: 'Revenge', pnl: -800, n: 8 } },
      dailyReport: { date: '2026-07-15', net: -100, tiltEmotions: ['FOMO'] },
      now: new Date(2026, 6, 16, 12)
    })
    expect(labels(prompts)[0]).toBe('Bounce back from my last session')
  })

  it('rotates lower-priority prompts deterministically at local midnight', () => {
    const context = { trades: [{ emotion: 'calm', setup: 'pullback' }], stats: { n: 1 } }
    const dayOne = buildCoachPrompts({ ...context, now: new Date(2026, 6, 15, 8) }, 2)
    const dayOneLater = buildCoachPrompts({ ...context, now: new Date(2026, 6, 15, 22) }, 2)
    const dayTwo = buildCoachPrompts({ ...context, now: new Date(2026, 6, 16, 8) }, 2)
    expect(dayOne).toEqual(dayOneLater)
    expect(labels(dayTwo)).not.toEqual(labels(dayOne))
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
    const prompts = buildCoachPrompts({
      trades: Array.from({ length: 10 }, () => ({ emotion: '', setup: '' })),
      stats: { n: 10, nonTiltStreak: 9 },
      leaks: { worst: { label: 'Revenge', pnl: -900, n: 5 } },
      dailyReport: { date: '2026-07-15', net: -200, tiltEmotions: [] },
      payouts: [{}],
      dayLogs: [{}, {}, {}]
    })
    expect(new Set(labels(prompts)).size).toBe(labels(prompts).length)
    expect(prompts.length).toBeLessThanOrEqual(4)
  })
})

import { describe, expect, it } from 'vitest'
import { buildEasterEggNudges } from '../coachInsights.js'
import { computeStats } from '../stats.js'

const t = (date, pnl, extra = {}) => ({
  id: `${date}-${pnl}-${Math.random()}`,
  timestamp: `${date} 09:30`,
  pnl,
  symbol: 'MES',
  ...extra
})

describe('buildEasterEggNudges', () => {
  it('suggests a break after four red trading days', () => {
    const trades = [
      t('2026-07-06', -50),
      t('2026-07-07', -25),
      t('2026-07-08', -10),
      t('2026-07-09', -80)
    ]
    const nudges = buildEasterEggNudges(trades, computeStats(trades), '2026-07-10')
    expect(nudges[0]).toMatchObject({ title: 'Red-day streak detected', action: 'break' })
  })

  it('upgrades the message after five red trading days', () => {
    const trades = [
      t('2026-07-06', -50),
      t('2026-07-07', -25),
      t('2026-07-08', -10),
      t('2026-07-09', -80),
      t('2026-07-10', -20)
    ]
    const nudges = buildEasterEggNudges(trades, computeStats(trades), '2026-07-11')
    expect(nudges[0].title).toBe('Circuit breaker whisper')
    expect(nudges[0].action).toBe('break')
  })

  it('detects tilt-heavy sessions', () => {
    const trades = [
      t('2026-07-10', 20, { emotion: 'Revenge' }),
      t('2026-07-10', -40, { emotion: 'FOMO' })
    ]
    const nudges = buildEasterEggNudges(trades, computeStats(trades), '2026-07-11')
    expect(nudges.some((n) => n.title === 'Tilt smoke alarm')).toBe(true)
  })

  it('detects overtrading on the latest session', () => {
    const trades = Array.from({ length: 10 }, (_, i) => t('2026-07-10', i % 2 ? 10 : -5))
    const nudges = buildEasterEggNudges(trades, computeStats(trades), '2026-07-11')
    expect(nudges.some((n) => n.title === 'Button got a workout')).toBe(true)
  })

  it('celebrates green streaks without outranking red risk nudges', () => {
    const trades = [
      t('2026-07-08', 20),
      t('2026-07-09', 30),
      t('2026-07-10', 10)
    ]
    const nudges = buildEasterEggNudges(trades, computeStats(trades), '2026-07-11')
    expect(nudges[0].title).toBe('Green streak, stay boring')
  })
})

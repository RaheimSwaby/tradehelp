import { describe, expect, it } from 'vitest'
import { FLOATING_NOTICE_PRIORITY, selectFloatingNotice } from '../notificationQueue.js'

describe('floating notification priority', () => {
  it('keeps the documented risk-to-feedback order', () => {
    expect(FLOATING_NOTICE_PRIORITY).toEqual([
      'risk', 'update', 'daily-review', 'timing', 'achievement', 'nudge', 'feedback'
    ])
  })

  it('shows only the highest-priority pending notice', () => {
    expect(selectFloatingNotice({ risk: true, dailyReview: true, timing: true, achievement: true })).toBe('risk')
    expect(selectFloatingNotice({ dailyReview: true, timing: true, achievement: true })).toBe('daily-review')
    expect(selectFloatingNotice({ timing: true, achievement: true, feedback: true })).toBe('timing')
    expect(selectFloatingNotice({ achievement: true, nudge: true, feedback: true })).toBe('achievement')
  })

  it('holds non-risk notices while a modal or focused workflow blocks them', () => {
    expect(selectFloatingNotice({ blocked: true, timing: true, achievement: true })).toBeNull()
    expect(selectFloatingNotice({ blocked: true, risk: true })).toBe('risk')
  })
})

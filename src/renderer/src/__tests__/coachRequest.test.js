import { describe, expect, it } from 'vitest'
import { coachRequestProfile, normalizeCoachContextMode } from '../coachRequest.js'

describe('Coach request profiles', () => {
  it('uses balanced as the safe default and rejects unknown values', () => {
    expect(normalizeCoachContextMode()).toBe('balanced')
    expect(normalizeCoachContextMode('turbo')).toBe('balanced')
    expect(coachRequestProfile({}).mode).toBe('balanced')
  })

  it('trades prompt depth for faster local response settings', () => {
    const fast = coachRequestProfile({ coachContextMode: 'fast' })
    const balanced = coachRequestProfile({ coachContextMode: 'balanced' })
    const deep = coachRequestProfile({ coachContextMode: 'deep' })

    expect(fast.maxChars).toBeLessThan(balanced.maxChars)
    expect(balanced.maxChars).toBeLessThan(deep.maxChars)
    expect(fast.contextWindow).toBeLessThan(balanced.contextWindow)
    expect(balanced.contextWindow).toBeLessThan(deep.contextWindow)
    expect(fast.historyMessages).toBeLessThan(deep.historyMessages)
    expect(fast.think).toBe(false)
    expect(balanced.think).toBe(false)
    expect(deep).not.toHaveProperty('think')
  })
})

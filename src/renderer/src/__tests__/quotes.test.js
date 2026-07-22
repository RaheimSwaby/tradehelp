import { describe, it, expect } from 'vitest'
import { QUOTES, buildDataAwareGreeting, quoteOfTheDay } from '../quotes.js'

const ATTRIBUTION_TYPES = new Set(['primary', 'secondary', 'traditional', 'common', 'paraphrase', 'adaptation'])

describe('quotes data', () => {
  it('every quote has non-empty text and audited attribution metadata', () => {
    expect(QUOTES.length).toBeGreaterThan(20)
    for (const quote of QUOTES) {
      expect(String(quote.text).trim().length).toBeGreaterThan(0)
      expect(String(quote.author).trim().length).toBeGreaterThan(0)
      expect(String(quote.source).trim().length).toBeGreaterThan(0)
      expect(ATTRIBUTION_TYPES.has(quote.attribution)).toBe(true)
    }
  })

  it('marks uncertain personal attributions as common rather than presenting them as verified', () => {
    const uncertain = QUOTES.filter((quote) => quote.attribution === 'common')
    expect(uncertain.length).toBeGreaterThan(0)
    for (const quote of uncertain) {
      expect(`${quote.author} ${quote.source}`).toMatch(/commonly attributed|common attribution/i)
    }
  })

  it('credits the repeated-action paraphrase to Will Durant rather than Aristotle', () => {
    const quote = QUOTES.find((candidate) => candidate.text.startsWith('We are what we repeatedly do'))
    expect(quote.author).toBe('Will Durant')
    expect(quote.source).toMatch(/summarizing Aristotle/i)
  })

  it('has no duplicate quote texts', () => {
    const texts = QUOTES.map((quote) => quote.text)
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('quoteOfTheDay', () => {
  it('is stable within the same calendar day', () => {
    const morning = new Date(2026, 6, 15, 8, 0)
    const night = new Date(2026, 6, 15, 23, 59)
    expect(quoteOfTheDay(morning)).toBe(quoteOfTheDay(night))
  })

  it('advances to a different quote the next day', () => {
    const day1 = quoteOfTheDay(new Date(2026, 6, 15, 12, 0))
    const day2 = quoteOfTheDay(new Date(2026, 6, 16, 12, 0))
    expect(day1).not.toBe(day2)
  })

  it('cycles through the whole list over QUOTES.length days, hitting every quote exactly once', () => {
    const seen = new Set()
    const start = new Date(2026, 0, 1, 12, 0)
    for (let index = 0; index < QUOTES.length; index += 1) {
      seen.add(quoteOfTheDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12, 0)))
    }
    expect(seen.size).toBe(QUOTES.length)
  })

  it('is deterministic and never returns undefined for odd inputs', () => {
    expect(quoteOfTheDay(new Date(2020, 0, 1))).toBeDefined()
    expect(quoteOfTheDay('not a date')).toBeDefined()
  })
})

describe('buildDataAwareGreeting', () => {
  it.each([
    [new Date(2026, 6, 15, 8), 'Good morning.'],
    [new Date(2026, 6, 15, 14), 'Good afternoon.'],
    [new Date(2026, 6, 15, 20), 'Good evening.']
  ])('uses local time of day without inventing a market session', (now, expected) => {
    const greeting = buildDataAwareGreeting({ now })
    expect(greeting).toBe(expected)
    expect(greeting).not.toMatch(/market|session|open|closed/i)
  })

  it('uses an off-clock next window and clean streak when supplied', () => {
    const greeting = buildDataAwareGreeting({
      now: new Date(2026, 6, 15, 8),
      personalClock: { phase: 'off', windowLabel: '9:15 AM–11:00 AM' },
      cleanStreak: 7
    })
    expect(greeting).toContain('next usual trading window is 9:15 AM–11:00 AM')
    expect(greeting).toContain('7-trade clean streak')
    expect(greeting).toMatch(/based on your journal history/i)
  })

  it('describes an active personal window as journal-based, not a fixed market claim', () => {
    const greeting = buildDataAwareGreeting({
      now: new Date(2026, 6, 15, 9, 30),
      personalClock: { phase: 'focus', windowLabel: '9:15 AM–11:00 AM' }
    })
    expect(greeting).toMatch(/journal-based clock/i)
    expect(greeting).toContain('usual 9:15 AM–11:00 AM trading window')
    expect(greeting).not.toMatch(/the market is|market open|market closed/i)
  })

  it('accepts a standalone next-window label when no personal clock is available', () => {
    const greeting = buildDataAwareGreeting({ now: new Date(2026, 6, 15, 19), nextWindow: '7:00 AM–8:30 AM' })
    expect(greeting).toContain('next usual trading window is 7:00 AM–8:30 AM')
  })
})


describe('data-aware greeting countdown', () => {
  it('uses a precise countdown for a nearby journal-based window', () => {
    const greeting = buildDataAwareGreeting({
      now: new Date(2026, 6, 15, 18, 6),
      personalClock: { phase: 'off', start: 18 * 60 + 30, windowLabel: '6:30 PM–8:30 PM' }
    })
    expect(greeting).toContain('Good evening.')
    expect(greeting).toContain('begins in 24 minutes')
    expect(greeting).toContain('based on your journal history')
  })
})

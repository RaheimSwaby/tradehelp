import { describe, it, expect } from 'vitest'
import { QUOTES, quoteOfTheDay } from '../quotes.js'

describe('quotes data', () => {
  it('every quote has non-empty text and an attribution', () => {
    expect(QUOTES.length).toBeGreaterThan(20)
    for (const q of QUOTES) {
      expect(String(q.text).trim().length).toBeGreaterThan(0)
      expect(String(q.author).trim().length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate quote texts', () => {
    const texts = QUOTES.map((q) => q.text)
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
    for (let i = 0; i < QUOTES.length; i += 1) {
      seen.add(quoteOfTheDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12, 0)))
    }
    expect(seen.size).toBe(QUOTES.length)
  })

  it('is deterministic and never returns undefined for odd inputs', () => {
    expect(quoteOfTheDay(new Date(2020, 0, 1))).toBeDefined()
    expect(quoteOfTheDay('not a date')).toBeDefined() // falls back to the first quote
  })
})

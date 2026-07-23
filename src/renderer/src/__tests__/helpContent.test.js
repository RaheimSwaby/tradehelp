import { describe, it, expect } from 'vitest'
import { HELP_SECTIONS, searchHelp, helpItemCount } from '../helpContent.js'

describe('help content', () => {
  it('every section has an id, title and non-empty entries', () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(3)
    for (const section of HELP_SECTIONS) {
      expect(String(section.id).trim().length).toBeGreaterThan(0)
      expect(String(section.title).trim().length).toBeGreaterThan(0)
      expect(section.items.length).toBeGreaterThan(0)
      for (const item of section.items) {
        expect(String(item.q).trim().length).toBeGreaterThan(0)
        expect(String(item.a).trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('has unique section ids and no duplicate questions', () => {
    const ids = HELP_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const questions = HELP_SECTIONS.flatMap((s) => s.items.map((i) => i.q))
    expect(new Set(questions).size).toBe(questions.length)
  })

  it('does not promise that the max-loss alarm closes trades', () => {
    // The app has no broker connection; the help must not imply otherwise.
    const all = HELP_SECTIONS.flatMap((s) => s.items.map((i) => `${i.q} ${i.a}`)).join(' ')
    expect(all).toMatch(/cannot place or close orders/i)
    expect(all).not.toMatch(/closes your (trades|positions)/i)
  })
})

describe('searchHelp', () => {
  it('returns every section when the query is empty', () => {
    expect(searchHelp('')).toBe(HELP_SECTIONS)
    expect(searchHelp('   ')).toBe(HELP_SECTIONS)
  })

  it('finds entries by keyword and drops empty sections', () => {
    const found = searchHelp('leak')
    expect(found.length).toBeGreaterThan(0)
    expect(helpItemCount(found)).toBeGreaterThan(0)
    for (const section of found) expect(section.items.length).toBeGreaterThan(0)
    expect(helpItemCount(found)).toBeLessThan(helpItemCount(HELP_SECTIONS))
  })

  it('is case-insensitive and matches text in the answer body', () => {
    expect(helpItemCount(searchHelp('OLLAMA'))).toBeGreaterThan(0)
    expect(helpItemCount(searchHelp('sqlite'))).toBeGreaterThan(0)
  })

  it('requires every term to match, not just one', () => {
    const both = helpItemCount(searchHelp('prop payout'))
    const single = helpItemCount(searchHelp('prop'))
    expect(both).toBeGreaterThan(0)
    expect(both).toBeLessThanOrEqual(single)
  })

  it('returns nothing for a query that matches no entry', () => {
    expect(searchHelp('zzzznotathing')).toEqual([])
  })
})

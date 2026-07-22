import { describe, expect, it } from 'vitest'
import {
  LOCAL_TIMEZONE,
  importTimeZoneOptions,
  isValidImportTimeZone,
  normalizeImportTimeZone,
  normalizeImportWallTime
} from '../importTimezone.js'

describe('import timezone normalization', () => {
  it('uses the source zone DST offset for winter and summer wall times', () => {
    expect(normalizeImportWallTime('2026-01-15 09:30', 'America/New_York', 'UTC')).toBe('2026-01-15 14:30')
    expect(normalizeImportWallTime('2026-07-15 09:30', 'America/New_York', 'UTC')).toBe('2026-07-15 13:30')
  })

  it('converts across a local date boundary', () => {
    expect(normalizeImportWallTime('2026-07-15 01:15', 'Asia/Tokyo', 'America/Los_Angeles')).toBe('2026-07-14 09:15')
  })

  it('leaves local, invalid-zone, malformed, and nonexistent DST wall times unchanged', () => {
    expect(normalizeImportWallTime('2026-07-15 09:30', LOCAL_TIMEZONE, 'UTC')).toBe('2026-07-15 09:30')
    expect(normalizeImportWallTime('2026-07-15 09:30', 'Not/A_Zone', 'UTC')).toBe('2026-07-15 09:30')
    expect(normalizeImportWallTime('not a date', 'America/New_York', 'UTC')).toBe('not a date')
    expect(normalizeImportWallTime('2026-03-08 02:30', 'America/New_York', 'UTC')).toBe('2026-03-08 02:30')
  })

  it('normalizes legacy and invalid settings safely to local', () => {
    expect(normalizeImportTimeZone('Local time')).toBe(LOCAL_TIMEZONE)
    expect(normalizeImportTimeZone('Not/A_Zone')).toBe(LOCAL_TIMEZONE)
    expect(normalizeImportTimeZone('America/Chicago')).toBe('America/Chicago')
    expect(isValidImportTimeZone('America/Chicago')).toBe(true)
    expect(importTimeZoneOptions()).toContain(LOCAL_TIMEZONE)
    expect(importTimeZoneOptions()).toContain('America/New_York')
  })
})

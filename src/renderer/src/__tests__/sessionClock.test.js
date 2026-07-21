import { describe, expect, it } from 'vitest'
import { formatClockMinute, inferTradingWindow, personalTradingClock } from '../sessionClock.js'

const trade = (day, entry, exit = '') => ({
  entryTime: `${day}T${entry}`,
  exitTime: exit ? `${day}T${exit}` : '',
  timestamp: `${day}T${entry}`
})

const history = [
  trade('2026-07-13', '09:28', '12:02'),
  trade('2026-07-14', '09:35', '11:55'),
  trade('2026-07-15', '09:30', '12:05'),
  trade('2026-07-16', '09:32', '12:00'),
  trade('2026-07-17', '09:25', '11:58')
]

describe('personal trading clock', () => {
  it('waits for three distinct trading days before inferring a schedule', () => {
    expect(inferTradingWindow(history.slice(0, 2))).toBeNull()
  })

  it('uses the median daily session instead of weighting trade volume', () => {
    const noisy = [...history, ...Array.from({ length: 20 }, () => trade('2026-07-13', '14:00', '14:05'))]
    expect(inferTradingWindow(noisy)).toMatchObject({ start: 570, end: 720, sampleDays: 5 })
  })

  it('moves through opening, focus, wind-down, and off-session phases', () => {
    const at = (hour, minute) => personalTradingClock(history, new Date(2026, 6, 21, hour, minute))?.phase
    expect(at(9, 20)).toBe('opening')
    expect(at(10, 30)).toBe('focus')
    expect(at(11, 45)).toBe('wind-down')
    expect(at(15, 0)).toBe('off')
  })

  it('keeps a useful minimum window when exit times are absent', () => {
    const entriesOnly = history.map(({ entryTime, timestamp }) => ({ entryTime, timestamp }))
    const inferred = inferTradingWindow(entriesOnly)
    expect(inferred.end - inferred.start).toBe(90)
  })

  it('formats clock minutes without leaking 24-hour notation', () => {
    expect(formatClockMinute(570)).toBe('9:30 AM')
    expect(formatClockMinute(720)).toBe('12:00 PM')
  })
})

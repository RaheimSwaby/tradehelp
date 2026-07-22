import { describe, expect, it } from 'vitest'
import { formatClockMinute, inferTradingWindow, inferTradingWindows, personalTradingClock, sessionEdgeCue } from '../sessionClock.js'

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

  it('keeps recurring morning and afternoon sessions as separate windows', () => {
    const days = ['2026-07-13', '2026-07-14', '2026-07-15']
    const split = days.flatMap((day) => [trade(day, '09:00', '10:00'), trade(day, '15:00', '16:00')])
    expect(inferTradingWindows(split)).toMatchObject([
      { start: 540, end: 630, sampleDays: 3 },
      { start: 900, end: 990, sampleDays: 3 }
    ])
  })

  it('keeps an overnight session active after midnight', () => {
    const overnight = [13, 14, 15].map((day) => ({
      entryTime: `2026-07-${day}T23:30`,
      exitTime: `2026-07-${day + 1}T01:00`
    }))
    expect(inferTradingWindow(overnight)).toMatchObject({ start: 1410, end: 1500, overnight: true })
    expect(personalTradingClock(overnight, new Date(2026, 6, 16, 0, 30))).toMatchObject({ phase: 'focus', windowLabel: '11:30 PM–1:00 AM' })
  })

  it('does not infer trading hours from journal timestamps', () => {
    expect(inferTradingWindows(history.map(({ timestamp }) => ({ timestamp })))).toEqual([])
  })

  it('formats clock minutes without leaking 24-hour notation', () => {
    expect(formatClockMinute(570)).toBe('9:30 AM')
    expect(formatClockMinute(720)).toBe('12:00 PM')
  })
})

describe('session edge cue', () => {
  const stats = {
    winRate: 50,
    byHourDay: {
      'Mon-10': { wins: 4, total: 5 },
      'Tue-10': { wins: 4, total: 5 }, // hour 10 → 8/10 = 80%, well above baseline
      'Mon-14': { wins: 1, total: 8 }, // hour 14 → 1/8 = 12.5%, well below with a confirmed sample
      'Mon-11': { wins: 5, total: 10 }, // hour 11 → 50%, on baseline
      'Mon-15': { wins: 1, total: 2 } // hour 15 → sample too small
    }
  }
  const at = (h, m) => sessionEdgeCue(stats, new Date(2026, 6, 21, h, m))

  it('flags a strong hour the trader is currently in', () => {
    const cue = at(10, 15)
    expect(cue).toMatchObject({ tone: 'strong', hour: '10', entering: false, wr: 80 })
    expect(cue.detail).toContain('above your 50% average')
  })

  it('warns just before entering a weak hour', () => {
    const cue = at(13, 50)
    expect(cue).toMatchObject({ tone: 'weak', hour: '14', entering: true })
    expect(cue.headline).toMatch(/weakest hour is next/i)
  })

  it('stays quiet on an average hour and on tiny samples', () => {
    expect(at(11, 15)).toBeNull()
    expect(at(15, 15)).toBeNull()
  })

  it('says nothing for hours the trader never trades', () => {
    expect(at(3, 15)).toBeNull()
  })

  it('needs a baseline win rate to compare against', () => {
    expect(sessionEdgeCue({ byHourDay: stats.byHourDay }, new Date(2026, 6, 21, 10, 15))).toBeNull()
  })
})

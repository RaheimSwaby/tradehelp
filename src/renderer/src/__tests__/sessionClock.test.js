import { describe, expect, it } from 'vitest'
import {
  formatClockMinute,
  inferTradingSchedule,
  inferTradingWindow,
  inferTradingWindows,
  manualTradingSchedule,
  personalTradingClock,
  sessionEdgeCue,
  TRADING_WINDOW_HISTORY_LIMITS
} from '../sessionClock.js'

const trade = (day, entry, exit = '') => ({
  entryTime: `${day}T${entry}`,
  exitTime: exit ? `${day}T${exit}` : '',
  timestamp: `${day}T${entry}`
})

const dayOffset = (day, offset) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

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

  it('uses only the latest 90 calendar days and latest 50 trading days', () => {
    const recent = [
      trade('2026-06-01', '10:30'),
      trade('2026-06-02', '10:30'),
      trade('2026-06-03', '10:30')
    ]
    const beyondCalendarCutoff = Array.from({ length: 8 }, (_, index) => trade(dayOffset('2026-01-01', index), '08:00'))
    const calendarLimited = inferTradingSchedule([...beyondCalendarCutoff, ...recent])
    expect(calendarLimited.windows[0]).toMatchObject({ start: 630, sampleDays: 3 })
    expect(calendarLimited.metadata).toMatchObject({ dayCount: 3, historyDayCount: 3 })

    const fiftyFiveDays = Array.from({ length: 55 }, (_, index) =>
      trade(dayOffset('2026-04-01', index), index < 5 ? '08:00' : '10:00'))
    const tradingDayLimited = inferTradingSchedule(fiftyFiveDays)
    expect(tradingDayLimited.windows[0]).toMatchObject({ start: 600, sampleDays: 50 })
    expect(tradingDayLimited.metadata.historyDayCount).toBe(50)
    expect(tradingDayLimited.metadata.limits).toEqual(TRADING_WINDOW_HISTORY_LIMITS)
  })

  it('preserves recurring split windows', () => {
    const splitHistory = Array.from({ length: 4 }, (_, index) => {
      const day = dayOffset('2026-07-01', index)
      return [trade(day, '09:00'), trade(day, '15:00')]
    }).flat()
    expect(inferTradingWindows(splitHistory)).toMatchObject([
      { start: 540, end: 630, sampleDays: 4 },
      { start: 900, end: 990, sampleDays: 4 }
    ])
  })

  it('preserves windows that cross midnight', () => {
    const overnightHistory = Array.from({ length: 4 }, (_, index) => {
      const entryDay = dayOffset('2026-07-01', index)
      const exitDay = dayOffset(entryDay, 1)
      return {
        entryTime: `${entryDay}T23:30`,
        exitTime: `${exitDay}T01:00`,
        timestamp: `${entryDay}T23:30`
      }
    })
    expect(inferTradingWindow(overnightHistory)).toMatchObject({
      start: 1410,
      end: 1500,
      overnight: true,
      sampleDays: 4
    })
  })

  it('detects a meaningful recent schedule shift and uses the new window', () => {
    const shiftedHistory = Array.from({ length: 10 }, (_, index) =>
      trade(dayOffset('2026-07-01', index), index < 5 ? '09:30' : '11:00'))
    const inferred = inferTradingSchedule(shiftedHistory)

    expect(inferred.windows).toHaveLength(1)
    expect(inferred.windows[0]).toMatchObject({ start: 660, sampleDays: 5 })
    expect(inferred.scheduleShift).toMatchObject({
      type: 'usual-start',
      oldUsualStart: 570,
      newUsualStart: 660,
      shiftMinutes: 90,
      direction: 'later',
      precedingDayCount: 5,
      recentDayCount: 5
    })
    expect(inferred.scheduleShift.message).toContain('9:30 AM to 11:00 AM')
    expect(inferred.metadata).toMatchObject({ dayCount: 5, historyDayCount: 10 })
  })

  it('exposes confidence-building metadata before timing advisories', () => {
    const building = inferTradingSchedule(history.slice(0, 2))
    expect(building.windows).toEqual([])
    expect(building.scheduleShift).toBeNull()
    expect(building.metadata).toMatchObject({
      dayCount: 2,
      sessionCount: 2,
      confidence: {
        state: 'building',
        observedDays: 2,
        requiredDays: 3,
        remainingDays: 1
      }
    })

    const ready = inferTradingSchedule(history.slice(0, 3))
    expect(ready.metadata.confidence.state).toBe('ready')
    expect(ready.windows[0].confidence).toMatchObject({ state: 'ready', observedDays: 3 })
  })

  it('moves through opening, focus, wind-down, and off-session phases', () => {
    const at = (hour, minute) => personalTradingClock(history, new Date(2026, 6, 21, hour, minute))?.phase
    expect(at(9, 20)).toBe('opening')
    expect(at(10, 30)).toBe('focus')
    expect(at(11, 45)).toBe('wind-down')
    expect(at(15, 0)).toBe('off')
  })

  it('uses a precomputed schedule or windows while only updating clock phase', () => {
    const cached = inferTradingSchedule(history)
    const opening = personalTradingClock([], new Date(2026, 6, 21, 9, 20), cached)
    const focus = personalTradingClock([], new Date(2026, 6, 21, 10, 30), cached.windows)

    expect(opening).toMatchObject({ phase: 'opening', inferenceMetadata: cached.metadata })
    expect(focus).toMatchObject({ phase: 'focus', start: cached.windows[0].start })
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


describe('manual trading schedule', () => {
  it('converts split and overnight settings into cached schedule windows', () => {
    const schedule = manualTradingSchedule(JSON.stringify([
      { start: '09:30', end: '11:30' },
      { start: '22:00', end: '01:00' }
    ]))
    expect(schedule.windows).toMatchObject([
      { start: 570, end: 690, duration: 120, overnight: false, source: 'manual' },
      { start: 1320, end: 1500, duration: 180, overnight: true, source: 'manual' }
    ])
    expect(personalTradingClock([], new Date(2026, 6, 21, 23, 0), schedule)?.phase).not.toBe('off')
  })

  it('ignores malformed and equal manual ranges', () => {
    expect(manualTradingSchedule('[{"start":"10:00","end":"10:00"},{"start":"bad","end":"11:00"}]').windows).toEqual([])
  })
})

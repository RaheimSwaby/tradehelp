import { describe, expect, it } from 'vitest'
import {
  normalizeSettingsForDisplay,
  parsePersonalClockWindows,
  serializePersonalClockWindows
} from '../tabs/SettingsTab.jsx'

describe('SettingsTab setting normalization', () => {
  it('sanitizes unknown coach and clock choices for display', () => {
    expect(normalizeSettingsForDisplay({
      coachVoice: 'hostile',
      personalClockSource: 'calendar',
      personalClockAlerts: 'sometimes',
      personalClockAmbience: 'false',
      personalClockManualWindows: 'not json'
    })).toMatchObject({
      coachVoice: 'balanced',
      personalClockSource: 'auto',
      personalClockAlerts: 'true',
      personalClockAmbience: 'false',
      personalClockManualWindows: '[]'
    })
  })

  it('preserves every supported coach voice and clock source', () => {
    for (const coachVoice of ['supportive', 'balanced', 'tough-love']) {
      expect(normalizeSettingsForDisplay({ coachVoice }).coachVoice).toBe(coachVoice)
    }
    for (const personalClockSource of ['auto', 'manual']) {
      expect(normalizeSettingsForDisplay({ personalClockSource }).personalClockSource).toBe(personalClockSource)
    }
  })
})

describe('SettingsTab manual trading windows', () => {
  it('serializes only complete HH:MM start/end pairs', () => {
    const windows = [
      { start: '09:30', end: '12:00' },
      { start: '13:00', end: '' },
      { start: '25:00', end: '26:00' },
      { start: '14:15', end: '15:45', note: 'discarded' }
    ]

    const serialized = serializePersonalClockWindows(windows)
    expect(serialized).toBe('[{"start":"09:30","end":"12:00"},{"start":"14:15","end":"15:45"}]')
    expect(parsePersonalClockWindows(serialized)).toEqual([
      { start: '09:30', end: '12:00' },
      { start: '14:15', end: '15:45' }
    ])
  })

  it('rejects equal start/end times and malformed input', () => {
    expect(parsePersonalClockWindows('[{"start":"10:00","end":"10:00"}]')).toEqual([])
    expect(parsePersonalClockWindows('{bad json')).toEqual([])
  })
})

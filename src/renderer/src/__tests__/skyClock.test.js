import { describe, expect, it } from 'vitest'
import { localSkyState } from '../skyClock.js'

const at = (hour, minute = 0) => new Date(2026, 6, 23, hour, minute, 0)

describe('localSkyState', () => {
  it('places the sun near the eastern horizon at 6 AM and overhead at noon', () => {
    const sunrise = localSkyState(at(6))
    const noon = localSkyState(at(12))

    expect(sunrise.sun.x).toBeCloseTo(0.08)
    expect(sunrise.sun.y).toBeCloseTo(0.76)
    expect(noon.sun.x).toBeCloseTo(0.5)
    expect(noon.sun.y).toBeCloseTo(0.15)
    expect(noon.sun.alpha).toBe(1)
  })

  it('places the moon near the eastern horizon at 6 PM and overhead at midnight', () => {
    const sunset = localSkyState(at(18))
    const midnight = localSkyState(at(0))

    expect(sunset.moon.x).toBeCloseTo(0.08)
    expect(sunset.moon.y).toBeCloseTo(0.76)
    expect(midnight.moon.x).toBeCloseTo(0.5)
    expect(midnight.moon.y).toBeCloseTo(0.15)
    expect(midnight.moon.alpha).toBe(1)
  })

  it('moves the moon toward the western horizon before dawn', () => {
    const preDawn = localSkyState(at(5, 30))
    expect(preDawn.moon.x).toBeGreaterThan(0.85)
    expect(preDawn.moon.y).toBeGreaterThan(0.65)
  })

  it('blends through twilight rather than switching abruptly', () => {
    const night = localSkyState(at(3))
    const sunrise = localSkyState(at(6))
    const day = localSkyState(at(12))

    expect(night.dayBlend).toBe(0)
    expect(sunrise.dayBlend).toBeGreaterThan(0)
    expect(sunrise.dayBlend).toBeLessThan(1)
    expect(day.dayBlend).toBe(1)
    expect(sunrise.sun.alpha).toBeGreaterThan(0)
    expect(sunrise.moon.alpha).toBeGreaterThan(0)
  })
})

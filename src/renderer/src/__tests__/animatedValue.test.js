import { describe, expect, it } from 'vitest'
import {
  formatAnimatedNumber,
  interpolateAnimatedValue,
  numberDisplayParts,
  resolveAnimatedStart
} from '../components/Shared.jsx'

describe('animated stat values', () => {
  it('parses positive currency displays', () => {
    expect(numberDisplayParts('$1,234.50')).toEqual({ value: 1234.5, currency: true, suffix: '', decimals: 2 })
  })

  it('parses negative currency displays', () => {
    expect(numberDisplayParts('-$295.00')).toEqual({ value: -295, currency: true, suffix: '', decimals: 2 })
  })

  it('parses percentages and streak suffixes', () => {
    expect(numberDisplayParts('48.6%')).toEqual({ value: 48.6, currency: false, suffix: '%', decimals: 1 })
    expect(numberDisplayParts('3W')).toEqual({ value: 3, currency: false, suffix: 'W', decimals: 0 })
  })

  it('does not animate grades, ratios, infinity, or dashes', () => {
    expect(numberDisplayParts('A+')).toBeNull()
    expect(numberDisplayParts('1:2.4')).toBeNull()
    expect(numberDisplayParts('∞')).toBeNull()
    expect(numberDisplayParts('—')).toBeNull()
  })

  it('formats animated values back into the original display shape', () => {
    const money = numberDisplayParts('-$295.00')
    const percent = numberDisplayParts('48.6%')
    expect(formatAnimatedNumber(-123.4, money)).toBe('-$123.40')
    expect(formatAnimatedNumber(12.345, percent)).toBe('12.3%')
  })

  it('continues rapid consecutive P&L updates from the live displayed value', () => {
    const firstStart = resolveAnimatedStart(0, 0, false, true)
    const interruptedValue = interpolateAnimatedValue(firstStart, 100, 0.4)
    const secondStart = resolveAnimatedStart(interruptedValue, 100, false, true)

    expect(interruptedValue).toBeGreaterThan(0)
    expect(interruptedValue).toBeLessThan(100)
    expect(secondStart).toBe(interruptedValue)
    expect(interpolateAnimatedValue(secondStart, 160, 1)).toBe(160)
  })

  it('uses an explicit previous total only when the value first mounts', () => {
    expect(resolveAnimatedStart(160, 100, true, true)).toBe(100)
    expect(resolveAnimatedStart(160, 100, false, true)).toBe(160)
  })
})

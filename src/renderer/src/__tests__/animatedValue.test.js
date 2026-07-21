import { describe, expect, it } from 'vitest'
import { formatAnimatedNumber, numberDisplayParts } from '../components/Shared.jsx'

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
})

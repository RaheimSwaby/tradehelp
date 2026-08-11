import { describe, expect, it } from 'vitest'
import { THEME_PRESETS, LIVE, applyTheme, readableAccent, T } from '../theme.js'

// WCAG 2.1 relative luminance. Kept independent of theme.js so a bug in the app's
// own contrast helper can't make these assertions pass by agreeing with itself.
function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// faint lands on cards as often as on the page, so every palette is checked against
// its own raised surfaces, not just bg. surface2 is the worst case in every preset.
const palettes = [
  ...THEME_PRESETS.map((p) => [p.name, p.palette]),
  ['Trade Mode', LIVE]
]

describe('theme contrast', () => {
  it.each(palettes)('%s keeps body text at WCAG AA on every surface', (_name, palette) => {
    const surfaces = [palette.bg, palette.surface, palette.surface2]
    for (const surface of surfaces) {
      expect(contrast(palette.text, surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.dim, surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(palette.faint, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(palettes)('%s preserves the text > dim > faint hierarchy', (_name, palette) => {
    const worst = (c) => Math.min(
      contrast(c, palette.bg),
      contrast(c, palette.surface),
      contrast(c, palette.surface2)
    )
    expect(worst(palette.text)).toBeGreaterThan(worst(palette.dim))
    expect(worst(palette.dim)).toBeGreaterThan(worst(palette.faint))
  })

  it('darkens the accent for text on light surfaces but leaves dark ones alone', () => {
    // amber on near-white is ~1.6:1 as a label; on near-black it already passes.
    expect(contrast('#F5B642', '#EBEFF5')).toBeLessThan(3)
    expect(readableAccent('#F5B642', '#EBEFF5')).not.toBe('#F5B642')
    expect(contrast(readableAccent('#F5B642', '#EBEFF5'), '#EBEFF5')).toBeGreaterThanOrEqual(4.5)
    expect(readableAccent('#F5B642', '#1C2433')).toBe('#F5B642')
  })

  it('derives a readable accentText for every selectable accent in light mode', () => {
    // The accents are tuned for dark backgrounds; lime and cyan are the worst on white.
    for (const accentKey of ['amber', 'lime', 'cyan', 'emerald', 'silver']) {
      applyTheme(false, accentKey, 'light', { themePreset: 'clean' })
      expect(contrast(T.accentText, T.surface2)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(T.accentText, T.surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves accentText equal to accent on dark presets', () => {
    applyTheme(false, 'amber', 'dark', { themePreset: 'classic' })
    expect(T.accentText).toBe(T.accent)
  })
})

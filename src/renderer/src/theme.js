export const BASE = {
  bg: '#0E1117', surface: '#151B26', surface2: '#1C2433', line: '#2A3344',
  text: '#E6EAF2', dim: '#8A94A6', faint: '#5A6478',
  up: '#34D399', down: '#FB7185', accent: '#F5B642', accentSoft: '#3A3018'
}
// Light mode. up/down are darker than BASE so they hold contrast on white surfaces.
export const LIGHT = {
  bg: '#F3F5F9', surface: '#FFFFFF', surface2: '#EBEFF5', line: '#D6DCE7',
  text: '#1B2432', dim: '#5B6575', faint: '#98A2B3',
  up: '#0A9E76', down: '#E23A5F', accent: '#F5B642', accentSoft: 'rgba(245,182,66,0.16)'
}
// Trade Mode ("go time"): warmer, darker ambient + an urgent accent. Surfaces and
// text stay close to BASE so the journal is still readable while you're live.
export const LIVE = {
  ...BASE,
  bg: '#140E0F', surface: '#1B1416', surface2: '#241A1C', line: '#3A2A2E',
  accent: '#FF6A3D', accentSoft: '#3A1C14'
}
// Mutable: every component reads these at render time, so reassigning them re-themes
// the whole app. App (the root) is the only writer, via applyTheme() during render.
// Keep one stable object reference. Components import T once; mutating it ensures
// every module sees the current palette after the root re-renders.
export const T = { ...BASE }
export const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontVariantNumeric: 'tabular-nums' }

// hex (#RRGGBB) → rgba string, for translucent glass surfaces that still track the theme.
export function withAlpha(hex, a) {
  const n = parseInt(String(hex).slice(1), 16)
  if (Number.isNaN(n)) return hex
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
export let inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
// User-selectable accent colors (all bright enough that the dark button text reads on them).
const ACCENTS = {
  amber: { accent: '#F5B642', accentSoft: '#3A3018' },
  orange: { accent: '#FB923C', accentSoft: '#3A2412' },
  sky: { accent: '#38BDF8', accentSoft: '#0F2A3C' },
  violet: { accent: '#A78BFA', accentSoft: '#241A3C' },
  pink: { accent: '#F472B6', accentSoft: '#3A1828' },
  cyan: { accent: '#22D3EE', accentSoft: '#0E2F36' },
  red: { accent: '#F8544F', accentSoft: '#3A1614' },
  emerald: { accent: '#34D399', accentSoft: '#0F2F24' },
  blue: { accent: '#60A5FA', accentSoft: '#14243C' },
  lime: { accent: '#A3E635', accentSoft: '#26330F' },
  silver: { accent: '#CBD5E1', accentSoft: '#262E3C' }
}
export const ACCENT_OPTIONS = Object.keys(ACCENTS).map((key) => ({ key, accent: ACCENTS[key].accent }))

// Trade Mode keeps its own urgent accent; the user's choice only recolors the normal theme.
export function applyTheme(live, accentKey, mode) {
  const a = ACCENTS[accentKey]
  const base = live ? LIVE : (mode === 'light' ? LIGHT : BASE)
  const palette = a && !live
    ? { ...base, accent: a.accent, accentSoft: mode === 'light' ? withAlpha(a.accent, 0.16) : a.accentSoft }
    : base
  Object.assign(T, palette)
  // React freezes style objects in development after they are rendered.
  // Replace this live export instead of mutating the previous object.
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

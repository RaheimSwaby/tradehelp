export const BASE = {
  bg: '#0E1117', surface: '#151B26', surface2: '#1C2433', line: '#2A3344',
  text: '#E6EAF2', dim: '#8A94A6', faint: '#5A6478',
  up: '#34D399', down: '#FB7185', accent: '#F5B642', accentSoft: '#3A3018'
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
export let T = { ...BASE }
export const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
export let inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
// User-selectable accent colors (all bright enough that the dark button text reads on them).
const ACCENTS = {
  amber: { accent: '#F5B642', accentSoft: '#3A3018' },
  orange: { accent: '#FB923C', accentSoft: '#3A2412' },
  sky: { accent: '#38BDF8', accentSoft: '#0F2A3C' },
  violet: { accent: '#A78BFA', accentSoft: '#241A3C' },
  pink: { accent: '#F472B6', accentSoft: '#3A1828' },
  cyan: { accent: '#22D3EE', accentSoft: '#0E2F36' },
  red: { accent: '#F8544F', accentSoft: '#3A1614' }
}
export const ACCENT_OPTIONS = Object.keys(ACCENTS).map((key) => ({ key, accent: ACCENTS[key].accent }))

// Trade Mode keeps its own urgent accent; the user's choice only recolors the normal theme.
export function applyTheme(live, accentKey) {
  const a = ACCENTS[accentKey]
  if (a) { BASE.accent = a.accent; BASE.accentSoft = a.accentSoft }
  T = live ? LIVE : BASE
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

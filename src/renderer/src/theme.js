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
export function applyTheme(live) {
  T = live ? LIVE : BASE
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

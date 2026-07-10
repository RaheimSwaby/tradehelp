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

const PRESET_PALETTES = {
  classic: { name: 'TradeHelp Classic', mode: 'dark', accentKey: 'amber', palette: BASE },
  midnight: {
    name: 'Midnight Desk',
    mode: 'dark',
    accentKey: 'blue',
    palette: {
      bg: '#080D14', surface: '#101827', surface2: '#172235', line: '#26364E',
      text: '#EAF1FF', dim: '#91A0B8', faint: '#61708A',
      up: '#34D399', down: '#FB7185', accent: '#60A5FA', accentSoft: '#14243C'
    }
  },
  clean: { name: 'Clean Light', mode: 'light', accentKey: 'amber', palette: LIGHT },
  terminal: {
    name: 'Terminal Green',
    mode: 'dark',
    accentKey: 'emerald',
    palette: {
      bg: '#06100B', surface: '#0B1710', surface2: '#102318', line: '#20402D',
      text: '#E7FFF0', dim: '#8AB99B', faint: '#567A63',
      up: '#22C55E', down: '#F97373', accent: '#86EFAC', accentSoft: '#12351F'
    }
  },
  redSession: {
    name: 'Red Session',
    mode: 'dark',
    accentKey: 'red',
    palette: {
      bg: '#120B0E', surface: '#1B1116', surface2: '#251820', line: '#3B2630',
      text: '#F7E9EE', dim: '#B794A0', faint: '#775B66',
      up: '#34D399', down: '#FB7185', accent: '#F8544F', accentSoft: '#3A1614'
    }
  },
  minimal: {
    name: 'Minimal Gray',
    mode: 'dark',
    accentKey: 'silver',
    palette: {
      bg: '#111214', surface: '#181A1D', surface2: '#202328', line: '#32363D',
      text: '#ECEFF3', dim: '#A1A7B0', faint: '#6B7280',
      up: '#A7F3D0', down: '#FDA4AF', accent: '#CBD5E1', accentSoft: '#262E3C'
    }
  }
}

export const THEME_PRESETS = Object.entries(PRESET_PALETTES).map(([key, v]) => ({
  key,
  name: v.name,
  mode: v.mode,
  accentKey: v.accentKey,
  palette: v.palette
}))
// Mutable: every component reads these at render time, so reassigning them re-themes
// the whole app. App (the root) is the only writer, via applyTheme() during render.
// Keep one stable object reference. Components import T once; mutating it ensures
// every module sees the current palette after the root re-renders.
export const T = { ...BASE }
export let mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontVariantNumeric: 'tabular-nums' }

const FONT_STYLES = {
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  numeric: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  soft: '"Segoe UI", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
}
export const FONT_OPTIONS = [
  { key: 'default', label: 'Default mono' },
  { key: 'numeric', label: 'Clean numbers' },
  { key: 'soft', label: 'Soft UI' }
]

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

export const GO_TIME_OPTIONS = [
  { key: 'orange', label: 'Amber Focus', accent: '#FF6A3D' },
  { key: 'red', label: 'Serious Red', accent: '#F8544F' },
  { key: 'blue', label: 'Blue Calm', accent: '#60A5FA' },
  { key: 'green', label: 'Green Locked-In', accent: '#34D399' }
]

export const PNL_STYLE_OPTIONS = [
  { key: 'classic', label: 'Green / red' },
  { key: 'blueRed', label: 'Blue / red' },
  { key: 'greenOrange', label: 'Green / orange' },
  { key: 'colorblind', label: 'Colorblind-safe' },
  { key: 'mono', label: 'Minimal mono' }
]

function applyPnlStyle(palette, style) {
  if (style === 'blueRed') return { ...palette, up: '#60A5FA', down: '#FB7185' }
  if (style === 'greenOrange') return { ...palette, up: '#34D399', down: '#FB923C' }
  if (style === 'colorblind') return { ...palette, up: '#2DD4BF', down: '#F97316' }
  if (style === 'mono') return { ...palette, up: palette.text, down: palette.dim }
  return palette
}

function goTimeAccent(key) {
  if (key === 'red') return { accent: '#F8544F', accentSoft: '#3A1614' }
  if (key === 'blue') return { accent: '#60A5FA', accentSoft: '#14243C' }
  if (key === 'green') return { accent: '#34D399', accentSoft: '#0F2F24' }
  return { accent: '#FF6A3D', accentSoft: '#3A1C14' }
}

// Trade Mode keeps a separate "go time" accent; normal mode uses the selected preset/accent.
export function applyTheme(live, accentKey, mode, settings = {}) {
  settings = settings || {}
  const a = ACCENTS[accentKey]
  const preset = PRESET_PALETTES[settings.themePreset] || null
  const baseMode = mode || preset?.mode || 'dark'
  const normalBase = preset?.palette || (baseMode === 'light' ? LIGHT : BASE)
  const normal = a
    ? { ...normalBase, accent: a.accent, accentSoft: baseMode === 'light' ? withAlpha(a.accent, 0.16) : a.accentSoft }
    : normalBase
  const liveAccent = goTimeAccent(settings.goTimeAccent)
  const palette = live ? { ...LIVE, ...liveAccent } : normal
  Object.assign(T, applyPnlStyle(palette, settings.pnlStyle))
  mono = {
    fontFamily: FONT_STYLES[settings.fontStyle] || FONT_STYLES.default,
    fontVariantNumeric: 'tabular-nums'
  }
  // React freezes style objects in development after they are rendered.
  // Replace this live export instead of mutating the previous object.
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

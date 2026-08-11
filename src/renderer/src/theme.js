export const BASE = {
  bg: '#0E1117', surface: '#151B26', surface2: '#1C2433', line: '#2A3344',
  // dim/faint are tuned against surface2 (the lightest raised surface), not bg —
  // that's the worst case, and faint sits on cards more often than on the page.
  text: '#E6EAF2', dim: '#9AA4B6', faint: '#7E8BA3',
  // accentText === accent on dark surfaces; applyTheme() re-derives it per palette.
  up: '#34D399', down: '#FB7185', accent: '#F5B642', accentSoft: '#3A3018', accentText: '#F5B642'
}
// Light mode. up/down are darker than BASE so they hold contrast on white surfaces.
export const LIGHT = {
  bg: '#F3F5F9', surface: '#FFFFFF', surface2: '#EBEFF5', line: '#D6DCE7',
  // faint is darker than it looks like it needs to be: it also lands on surface2
  // (#EBEFF5), which is the worst case for contrast. This clears 4.5:1 on all three.
  text: '#1B2432', dim: '#556173', faint: '#626D7E',
  up: '#0A9E76', down: '#E23A5F', accent: '#F5B642', accentSoft: 'rgba(245,182,66,0.16)',
  accentText: '#896623'
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
      text: '#EAF1FF', dim: '#A1AEC2', faint: '#7A8AA5',
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
      text: '#E7FFF0', dim: '#9BC7AA', faint: '#70947C',
      up: '#22C55E', down: '#F97373', accent: '#86EFAC', accentSoft: '#12351F'
    }
  },
  redSession: {
    name: 'Red Session',
    mode: 'dark',
    accentKey: 'red',
    palette: {
      bg: '#120B0E', surface: '#1B1116', surface2: '#251820', line: '#3B2630',
      text: '#F7E9EE', dim: '#C1A2AC', faint: '#9B7B87',
      up: '#34D399', down: '#FB7185', accent: '#F8544F', accentSoft: '#3A1614'
    }
  },
  // The trade-help.app palette: a warm near-black with beige-tinted text and muted
  // gold, rather than the blue-grey the other dark presets share. Values are taken
  // straight from the site's stylesheet; only faint is new, since the site has no
  // equivalent tier and its lightest grey sat too close to dim to read as one.
  darkKnight: {
    name: 'Dark Knight',
    mode: 'dark',
    accentKey: 'gold',
    palette: {
      bg: '#0B0B0C', surface: '#141417', surface2: '#1A1A1D', line: '#26262A',
      text: '#F0EDE6', dim: '#C5C0B8', faint: '#8A857C',
      up: '#4ADE80', down: '#F87171', accent: '#D4A853', accentSoft: '#33280F'
    }
  },
  minimal: {
    name: 'Minimal Gray',
    mode: 'dark',
    accentKey: 'silver',
    palette: {
      bg: '#111214', surface: '#181A1D', surface2: '#202328', line: '#32363D',
      text: '#ECEFF3', dim: '#ABB1BA', faint: '#828A98',
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

// WCAG relative luminance / contrast, used to derive a readable accent for light themes.
function srgbLum(hex) {
  const n = parseInt(String(hex).slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function contrastRatio(a, b) {
  const la = srgbLum(a)
  const lb = srgbLum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
// The accents are tuned to glow on near-black. On a light surface the same amber is
// 1.6:1 as text, which is unreadable. Darken it until the label clears AA and expose
// that separately as accentText, so fills, underlines and borders keep the brand color.
export function readableAccent(accent, bg, target = 4.5) {
  if (srgbLum(bg) < 0.5 || contrastRatio(accent, bg) >= target) return accent
  const n = parseInt(String(accent).slice(1), 16)
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  for (let i = 0; i < 40; i++) {
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
    if (contrastRatio(hex, bg) >= target) return hex
    r = Math.floor(r * 0.94)
    g = Math.floor(g * 0.94)
    b = Math.floor(b * 0.94)
  }
  return '#000000'
}

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
  // Muted gold, matching the marketing site rather than the app's brighter amber.
  gold: { accent: '#D4A853', accentSoft: '#33280F' },
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
  // Derived after the palette lands so it tracks the chosen accent and surface.
  T.accentText = readableAccent(T.accent, T.surface2)
  mono = {
    fontFamily: FONT_STYLES[settings.fontStyle] || FONT_STYLES.default,
    fontVariantNumeric: 'tabular-nums'
  }
  // React freezes style objects in development after they are rendered.
  // Replace this live export instead of mutating the previous object.
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

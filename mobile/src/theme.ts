export type ThemeMode = 'system' | 'dark' | 'light'

export type Palette = {
  bg: string
  bgTop: string
  bgBottom: string
  surface: string
  surface2: string
  surfaceElevated: string
  header: string
  nav: string
  line: string
  lineStrong: string
  text: string
  dim: string
  faint: string
  accent: string
  accentBright: string
  accentSoft: string
  up: string
  upSoft: string
  down: string
  downSoft: string
  shadow: string
  heroGradient: [string, string, string]
  panelGradient: [string, string]
  glassGradient: [string, string]
  accentGradient: [string, string]
  upGradient: [string, string]
  downGradient: [string, string]
  statusBar: 'light-content' | 'dark-content'
}

export const dark: Palette = {
  bg: '#101626',
  bgTop: '#1E1934',
  bgBottom: '#080C14',
  surface: 'rgba(22, 30, 46, 0.88)',
  surface2: 'rgba(30, 42, 64, 0.70)',
  surfaceElevated: '#1F2B42',
  header: 'rgba(14, 20, 32, 0.92)',
  nav: 'rgba(18, 26, 40, 0.94)',
  line: 'rgba(50, 68, 100, 0.45)',
  lineStrong: 'rgba(70, 92, 130, 0.60)',
  text: '#F5F7FA',
  dim: '#9BA7BE',
  faint: '#697793',
  accent: '#F59E0B',
  accentBright: '#FBBF24',
  accentSoft: 'rgba(245, 158, 11, 0.18)',
  up: '#10B981',
  upSoft: 'rgba(16, 185, 129, 0.18)',
  down: '#F43F5E',
  downSoft: 'rgba(244, 63, 94, 0.18)',
  shadow: '#000000',
  heroGradient: ['rgba(55, 40, 80, 0.75)', 'rgba(30, 40, 62, 0.80)', 'rgba(22, 30, 46, 0.85)'],
  panelGradient: ['rgba(28, 38, 58, 0.85)', 'rgba(20, 28, 43, 0.85)'],
  glassGradient: ['rgba(35, 48, 74, 0.75)', 'rgba(22, 30, 46, 0.60)'],
  accentGradient: ['#F59E0B', '#D97706'],
  upGradient: ['#10B981', '#059669'],
  downGradient: ['#F43F5E', '#E11D48'],
  statusBar: 'light-content'
}

export const light: Palette = {
  bg: '#F0F4FA',
  bgTop: '#FFF2E2',
  bgBottom: '#E4EAF4',
  surface: 'rgba(255, 255, 255, 0.92)',
  surface2: 'rgba(240, 244, 250, 0.80)',
  surfaceElevated: '#FFFFFF',
  header: 'rgba(255, 255, 255, 0.94)',
  nav: 'rgba(255, 255, 255, 0.95)',
  line: 'rgba(226, 232, 240, 0.80)',
  lineStrong: '#CBD5E1',
  text: '#0F172A',
  dim: '#64748B',
  faint: '#94A3B8',
  accent: '#D97706',
  accentBright: '#F59E0B',
  accentSoft: 'rgba(245, 158, 11, 0.12)',
  up: '#059669',
  upSoft: 'rgba(16, 185, 129, 0.12)',
  down: '#E11D48',
  downSoft: 'rgba(244, 63, 94, 0.12)',
  shadow: '#64748B',
  heroGradient: ['#FEF3C7', '#FAF5FF', '#F1F5F9'],
  panelGradient: ['#FFFFFF', '#F8FAFC'],
  glassGradient: ['rgba(255, 255, 255, 0.92)', 'rgba(248, 250, 252, 0.80)'],
  accentGradient: ['#F59E0B', '#D97706'],
  upGradient: ['#10B981', '#059669'],
  downGradient: ['#F43F5E', '#E11D48'],
  statusBar: 'dark-content'
}

export function palette(mode: ThemeMode, system: string | null | undefined) {
  return mode === 'light' || (mode === 'system' && system === 'light') ? light : dark
}

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, Cell
} from 'recharts'
import {
  BookOpen, LayoutDashboard, Brain, Target, Bot, Settings as SettingsIcon,
  Plus, Trash2, TrendingUp, Send, Sparkles, Search, X,
  Zap, Square, CheckSquare, AlertTriangle, Play, Paperclip, ImagePlus, Gauge, Lock,
  Trophy, Shield, Snowflake, Camera
} from 'lucide-react'

/* ───────── theme (inline styles for color; Tailwind for layout) ───────── */
const BASE = {
  bg: '#0E1117', surface: '#151B26', surface2: '#1C2433', line: '#2A3344',
  text: '#E6EAF2', dim: '#8A94A6', faint: '#5A6478',
  up: '#34D399', down: '#FB7185', accent: '#F5B642', accentSoft: '#3A3018'
}
// Trade Mode ("go time"): warmer, darker ambient + an urgent accent. Surfaces and
// text stay close to BASE so the journal is still readable while you're live.
const LIVE = {
  ...BASE,
  bg: '#140E0F', surface: '#1B1416', surface2: '#241A1C', line: '#3A2A2E',
  accent: '#FF6A3D', accentSoft: '#3A1C14'
}
// Mutable: every component reads these at render time, so reassigning them re-themes
// the whole app. App (the root) is the only writer, via applyTheme() during render.
let T = { ...BASE }
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }
let inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
function applyTheme(live) {
  T = live ? LIVE : BASE
  inputStyle = { background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }
}

const EMOTIONS = ['Disciplined', 'Confident', 'Neutral', 'Hesitant', 'Anxious', 'FOMO', 'Greedy', 'Revenge', 'Bored']
const SETUPS = ['Opening Range Breakout', 'VWAP Reclaim', 'Pullback', 'Trend Continuation', 'Reversal', 'Liquidity Sweep']
const TILT = ['FOMO', 'Greedy', 'Revenge']

// Self-diagnosed cause of a win/loss. Each maps to the rating attribute it should move
// (good = nudge up, bad = nudge down). attr:null = honest-but-neutral (lucky win / good loss) — moves nothing.
const WIN_REASONS = ['Patient — waited for setup', 'Followed my plan', 'Clean setup / good read', 'Proper risk & sizing', 'Let my winner run', 'Got lucky (no real edge)']
const LOSS_REASONS = ['Just variance — good trade', 'Impatient — forced it', 'FOMO / chased', 'Greed — overstayed/oversized', 'Revenge trade', 'Moved / ignored my stop', 'Oversized', 'Bad setup']
const REASONS = {
  'Patient — waited for setup': { attr: 'patience', good: true },
  'Followed my plan': { attr: 'discipline', good: true },
  'Clean setup / good read': { attr: 'edge', good: true },
  'Proper risk & sizing': { attr: 'risk', good: true },
  'Let my winner run': { attr: 'discipline', good: true },
  'Got lucky (no real edge)': { attr: null, good: false },
  'Just variance — good trade': { attr: null, good: true },
  'Impatient — forced it': { attr: 'patience', good: false },
  'FOMO / chased': { attr: 'discipline', good: false },
  'Greed — overstayed/oversized': { attr: 'discipline', good: false },
  'Revenge trade': { attr: 'discipline', good: false },
  'Moved / ignored my stop': { attr: 'risk', good: false },
  'Oversized': { attr: 'risk', good: false },
  'Bad setup': { attr: 'edge', good: false }
}

const fmt$ = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (n, d = 2) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const parseRules = (s) => {
  try { const r = JSON.parse(s?.tradeRules || '[]'); return Array.isArray(r) ? r.filter(Boolean) : [] }
  catch { return [] }
}

// ── image helpers: downscale on the client so the DB + IPC stay light ──
const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
async function downscale(dataUrl, maxDim = 1600, quality = 0.82) {
  try {
    const img = await loadImg(dataUrl)
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/webp', quality)
  } catch { return dataUrl }
}

// ── time-in-trade helpers ──
const pad2 = (n) => String(n).padStart(2, '0')
const nowLocalInput = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
const parseLocal = (s) => { if (!s) return null; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d }
const holdMs = (t) => { const a = parseLocal(t.entryTime), b = parseLocal(t.exitTime); return a && b ? b - a : null }
function fmtDuration(ms) {
  if (!(ms > 0)) return null
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

// ── economic-calendar helpers ──
const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0, None: 0 }
const untilLabel = (ts, now) => {
  const m = Math.round((ts - now) / 60000)
  if (m <= 0) return 'now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}

/* ───────── stats ───────── */
function computeStats(trades) {
  const sorted = [...trades].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  const n = sorted.length
  const pnls = sorted.map((t) => Number(t.pnl) || 0)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const totalPnl = pnls.reduce((a, b) => a + b, 0)
  const grossProfit = wins.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
  const winRate = n ? (wins.length / n) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0)
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const expectancy = n ? totalPnl / n : 0
  const rrs = sorted.map((t) => Number(t.rr)).filter((r) => r > 0)
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0

  let eq = 0, peak = 0, maxDD = 0
  const equity = sorted.map((t, i) => {
    eq += Number(t.pnl) || 0
    peak = Math.max(peak, eq)
    maxDD = Math.max(maxDD, peak - eq)
    return { i: i + 1, equity: eq }
  })

  let cur = 0, curSign = 0, bestWin = 0, worstLoss = 0
  for (const p of pnls) {
    const s = p > 0 ? 1 : p < 0 ? -1 : 0
    if (s === 0) continue
    if (s === curSign) cur += 1
    else { curSign = s; cur = 1 }
    if (curSign === 1) bestWin = Math.max(bestWin, cur)
    else worstLoss = Math.max(worstLoss, cur)
  }
  const currentStreak = curSign === 0 ? '—' : `${cur}${curSign === 1 ? 'W' : 'L'}`

  const dayMap = {}
  for (const t of sorted) {
    const d = (t.timestamp || '').slice(0, 10)
    if (!d) continue
    dayMap[d] = (dayMap[d] || 0) + (Number(t.pnl) || 0)
  }
  const daily = Object.entries(dayMap).map(([d, v]) => ({ day: d.slice(5), pnl: v })).slice(-14)
  const activeDays = Object.keys(dayMap).length

  const groupPnl = (key) => {
    const m = {}
    for (const t of sorted) {
      const k = t[key] || '—'
      if (!m[k]) m[k] = { name: k, pnl: 0, n: 0, w: 0 }
      m[k].pnl += Number(t.pnl) || 0
      m[k].n += 1
      if ((Number(t.pnl) || 0) > 0) m[k].w += 1
    }
    return Object.values(m).map((g) => ({ ...g, wr: g.n ? (g.w / g.n) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl)
  }

  const hourMap = {}
  for (const t of sorted) {
    // Prefer the actual entry time (when the trade was taken) over the log time.
    const hh = (t.entryTime || t.timestamp || '').slice(11, 13)
    if (!hh) continue
    hourMap[hh] = (hourMap[hh] || 0) + (Number(t.pnl) || 0)
  }
  const byHour = Object.entries(hourMap).map(([h, v]) => ({ hour: h + ':00', pnl: v })).sort((a, b) => a.hour.localeCompare(b.hour))

  // non-tilt streak: consecutive trades with no FOMO/greed/revenge tag (current + best)
  let ntCur = 0, ntBest = 0
  for (const t of sorted) {
    if (TILT.includes(t.emotion)) ntCur = 0
    else { ntCur += 1; ntBest = Math.max(ntBest, ntCur) }
  }

  // self-diagnosed reasons, split by outcome
  const reasonsWin = {}, reasonsLoss = {}
  for (const t of sorted) {
    if (!t.reason) continue
    const b = (Number(t.pnl) || 0) >= 0 ? reasonsWin : reasonsLoss
    b[t.reason] = (b[t.reason] || 0) + 1
  }
  const toReasonArr = (o) => Object.entries(o).map(([name, m]) => ({ name, n: m })).sort((a, b) => b.n - a.n)

  return {
    n, totalPnl, winRate, profitFactor, avgWin, avgLoss, expectancy, avgRR,
    maxDD, currentStreak, bestWin, worstLoss, equity, daily, activeDays,
    grossProfit, grossLoss, nonTiltStreak: ntCur, bestNonTilt: ntBest,
    reasonsWin: toReasonArr(reasonsWin), reasonsLoss: toReasonArr(reasonsLoss),
    byEmotion: groupPnl('emotion'), bySetup: groupPnl('setup'), byHour
  }
}

/* ───────── rating: grade the process, not the outcome ───────── */
function letterFor(score) {
  if (score >= 95) return { letter: 'A+', tone: 'up' }
  if (score >= 85) return { letter: 'A', tone: 'up' }
  if (score >= 70) return { letter: 'B', tone: 'up' }
  if (score >= 55) return { letter: 'C', tone: 'accent' }
  if (score >= 40) return { letter: 'D', tone: 'down' }
  return { letter: 'F', tone: 'down' }
}

// Per-trade execution grade — deliberately blind to whether the trade won or lost.
function executionGrade(t) {
  const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0
  const pnl = Number(t.pnl) || 0, risk = Number(t.riskAmount) || 0, rr = Number(t.rr) || 0

  let stopPts = 0
  if (stop > 0 && entry > 0) stopPts = (t.direction === 'Long' ? stop < entry : stop > entry) ? 25 : 10

  const rrPts = rr >= 2 ? 25 : rr >= 1.5 ? 20 : rr >= 1 ? 15 : rr > 0 ? 8 : 14

  const e = t.emotion || ''
  const emoPts = ['Disciplined', 'Confident', 'Neutral'].includes(e) ? 25 : ['FOMO', 'Greedy', 'Revenge'].includes(e) ? 0 : 12

  let riskPts = 20 // win / breakeven / no risk logged = can't fault it
  if (pnl < 0 && risk > 0) {
    const mult = Math.abs(pnl) / risk
    riskPts = mult <= 1.1 ? 25 : mult <= 1.5 ? 12 : 0 // loss bigger than planned = stop wasn't honored
  }

  const score = stopPts + rrPts + emoPts + riskPts
  return { score, ...letterFor(score) }
}

function computeRating(trades, stats) {
  const n = stats.n
  const grades = trades.map(executionGrade)
  const avgGrade = grades.length ? grades.reduce((a, g) => a + g.score, 0) / grades.length : 60

  const PF = stats.profitFactor === Infinity ? 2.5 : (stats.profitFactor || 0)
  const edge = clamp(Math.round(55 + (PF - 1) * 40), 20, 99)
  const discipline = clamp(Math.round(avgGrade), 20, 99)
  const ddRatio = stats.maxDD / Math.max(stats.grossProfit, Math.abs(stats.avgWin) * 3, 1)
  const risk = clamp(Math.round(95 - ddRatio * 55), 25, 99)
  const consistency = clamp(Math.round(38 + stats.winRate * 0.55 + (PF >= 1 ? 8 : -8)), 25, 95)
  const tpd = stats.activeDays ? n / stats.activeDays : 0
  const patience = clamp(Math.round(95 - Math.max(0, tpd - 4) * 9), 30, 95)

  // self-diagnosed reasons nudge the attribute they map to (bounded ±10)
  const tally = { patience: { g: 0, b: 0 }, discipline: { g: 0, b: 0 }, risk: { g: 0, b: 0 }, edge: { g: 0, b: 0 } }
  for (const t of trades) {
    const r = REASONS[t.reason]
    if (r && r.attr) tally[r.attr][r.good ? 'g' : 'b']++
  }
  const nudge = (k) => { const a = tally[k], tot = a.g + a.b; return tot ? clamp(Math.round(((a.g - a.b) / tot) * 10), -10, 10) : 0 }

  const attrs = {
    edge: clamp(edge + nudge('edge'), 20, 99),
    discipline: clamp(discipline + nudge('discipline'), 20, 99),
    risk: clamp(risk + nudge('risk'), 25, 99),
    consistency,
    patience: clamp(patience + nudge('patience'), 30, 95)
  }
  const raw = attrs.edge * 0.3 + attrs.discipline * 0.3 + attrs.risk * 0.2 + attrs.consistency * 0.1 + attrs.patience * 0.1
  const ovr = clamp(Math.round(raw), 59, 99)

  const holds = trades.map(holdMs).filter((m) => m && m > 0).sort((a, b) => a - b)
  const medHold = holds.length ? holds[Math.floor(holds.length / 2)] : null
  const archetype = medHold == null ? 'Trader'
    : medHold < 10 * 60000 ? 'Scalper'
    : medHold < 2 * 3600000 ? 'Day Trader'
    : medHold < 2 * 864e5 ? 'Swing Trader'
    : 'Position Trader'

  return { ovr, attrs, archetype, provisional: n < 20, sampleN: n, verified: false }
}

// Achievements reward BEHAVIOUR, not P&L — and use "best ever" tallies so they stay earned.
function computeAchievements(trades, stats) {
  const sorted = [...trades].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  let aGradeLosses = 0, stopSet = 0, withShots = 0, honoredCur = 0, honoredBest = 0
  const dayTilt = {}
  for (const t of sorted) {
    const pnl = Number(t.pnl) || 0, risk = Number(t.riskAmount) || 0
    const entry = Number(t.entry) || 0, stop = Number(t.stop) || 0
    if (executionGrade(t).score >= 85 && pnl < 0) aGradeLosses++
    if (stop > 0 && entry > 0 && (t.direction === 'Long' ? stop < entry : stop > entry)) stopSet++
    if ((t.imageCount || 0) > 0) withShots++
    const honored = pnl >= 0 || risk <= 0 || Math.abs(pnl) <= 1.1 * risk
    if (honored) { honoredCur++; honoredBest = Math.max(honoredBest, honoredCur) } else honoredCur = 0
    const d = (t.entryTime || t.timestamp || '').slice(0, 10)
    if (d) { if (!(d in dayTilt)) dayTilt[d] = false; if (TILT.includes(t.emotion)) dayTilt[d] = true }
  }
  let cleanRun = 0, cleanBest = 0
  for (const d of Object.keys(dayTilt).sort()) { if (!dayTilt[d]) { cleanRun++; cleanBest = Math.max(cleanBest, cleanRun) } else cleanRun = 0 }
  const PF = stats.profitFactor === Infinity ? 99 : (stats.profitFactor || 0)

  const defs = [
    { id: 'process', name: 'Process over Profit', Icon: Trophy, desc: '10 A-grade trades that still lost — right trade, accepted variance.', current: aGradeLosses, goal: 10 },
    { id: 'zen', name: 'Zen Mode', Icon: Brain, desc: 'A 25-trade streak with no FOMO, greed or revenge.', current: stats.bestNonTilt, goal: 25 },
    { id: 'coolweek', name: 'Cool Week', Icon: Snowflake, desc: '5 straight trading days with zero tilt.', current: cleanBest, goal: 5 },
    { id: 'stophonored', name: 'Stop Honored', Icon: Shield, desc: '15 trades in a row with no loss past your planned risk.', current: honoredBest, goal: 15 },
    { id: 'riskmgr', name: 'Risk Manager', Icon: Target, desc: '50 trades logged with a stop set.', current: stopSet, goal: 50 },
    { id: 'journaler', name: 'Journaler', Icon: BookOpen, desc: '100 trades journaled.', current: stats.n, goal: 100 },
    { id: 'reviewer', name: 'Reviewer', Icon: Camera, desc: 'Screenshots attached to 20 trades.', current: withShots, goal: 20 },
    { id: 'edge', name: 'Edge Confirmed', Icon: TrendingUp, desc: 'Profit factor over 1.5 across 50+ trades.', current: Math.min(stats.n, 50), goal: 50, gate: PF > 1.5 }
  ]
  return defs.map((d) => ({
    ...d,
    progress: clamp((d.current || 0) / d.goal, 0, 1),
    unlocked: (d.current || 0) >= d.goal && (d.gate === undefined || d.gate)
  }))
}

/* ───────── small UI bits ───────── */
function Stat({ label, value, sub, tone }) {
  const color = tone === 'up' ? T.up : tone === 'down' ? T.down : tone === 'accent' ? T.accent : T.text
  return (
    <div className="rounded-lg p-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ ...mono, color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: T.dim }}>{sub}</div>}
    </div>
  )
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: T.dim }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
function Panel({ title, right, children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
function EmptyChart() {
  return <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: T.dim }}>Log trades to populate this chart.</div>
}
function Readout({ label, value, tone }) {
  const color = tone === 'up' ? T.up : tone === 'down' ? T.down : T.text
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs" style={{ color: T.faint }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}
function GradeChip({ t }) {
  const g = executionGrade(t)
  const c = g.tone === 'up' ? T.up : g.tone === 'accent' ? T.accent : T.down
  return <span className="inline-block text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: c, border: `1px solid ${c}` }} title={`Execution ${g.score}/100 — process, not outcome`}>{g.letter}</span>
}

/* ───────── main app ───────── */
export default function App() {
  const [ready, setReady] = useState(false)
  const [trades, setTrades] = useState([])
  const [goals, setGoals] = useState({ weekly: 500, monthly: 2000 })
  const [settings, setSettings] = useState(null)
  const [tab, setTab] = useState('journal')
  const [notesView, setNotesView] = useState(null)
  const [tradeMode, setTradeMode] = useState(false)
  const [preflight, setPreflight] = useState(false)
  const [checks, setChecks] = useState({})
  const [lockoutDismissed, setLockoutDismissed] = useState(false)
  const [events, setEvents] = useState([])
  const [now, setNow] = useState(Date.now())
  const firedRef = useRef(new Set())
  const [toast, setToast] = useState(null)
  const [updateReady, setUpdateReady] = useState(false)

  const hasApi = typeof window !== 'undefined' && window.api

  useEffect(() => {
    (async () => {
      if (!hasApi) { setReady(true); return }
      setTrades(await window.api.listTrades())
      setGoals(await window.api.getGoals())
      setSettings(await window.api.getSettings())
      setReady(true)
    })()
  }, [hasApi])

  const stats = useMemo(() => computeStats(trades), [trades])

  async function addTrade(t, images = []) {
    if (!hasApi) return
    await window.api.addTrade(t)
    for (const im of images) { try { await window.api.addImage(t.id, im) } catch { /* skip a bad image, keep the trade */ } }
    setTrades(await window.api.listTrades())
  }
  async function removeTrade(id) { if (hasApi) setTrades(await window.api.deleteTrade(id)) }
  async function saveGoals(g) { if (hasApi) setGoals(await window.api.setGoals(g)) }
  async function saveSettings(s) { if (hasApi) setSettings(await window.api.setSettings(s)) }

  // ── Trade Mode derived state ──
  const rules = useMemo(() => parseRules(settings), [settings])
  const today = new Date().toISOString().slice(0, 10)
  const todayTrades = useMemo(() => trades.filter((t) => (t.timestamp || '').slice(0, 10) === today), [trades, today])
  const todayNet = todayTrades.reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const weekAgoTs = new Date(Date.now() - 7 * 864e5)
  const weekNet = trades.filter((t) => new Date((t.timestamp || '').replace(' ', 'T')) >= weekAgoTs).reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const dailyGoal = parseFloat(settings?.dailyGoal) || 0
  const maxLoss = parseFloat(settings?.maxDailyLoss) || 0
  const lossHit = maxLoss > 0 && todayNet <= -maxLoss

  function startDay() { setChecks({}); setLockoutDismissed(false); setPreflight(true) }
  function goLive() { setPreflight(false); setTradeMode(true) }
  function endSession() { setTradeMode(false); setPreflight(false); setChecks({}); setLockoutDismissed(false) }

  // ── economic-calendar alerts ──
  const eventsEnabled = (settings?.eventsEnabled ?? 'true') !== 'false'
  const leadMin = parseFloat(settings?.eventsLeadMin) || 15
  const minImpact = settings?.eventsMinImpact || 'High'
  const watchedEvents = useMemo(
    () => events.filter((e) => (IMPACT_RANK[e.impact] || 0) >= (IMPACT_RANK[minImpact] || 3)),
    [events, minImpact]
  )
  const imminentEvent = useMemo(
    () => (eventsEnabled ? watchedEvents.find((e) => e.ts > now && e.ts - now <= leadMin * 60000) || null : null),
    [watchedEvents, now, leadMin, eventsEnabled]
  )

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  useEffect(() => { try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission() } catch {} }, [])
  useEffect(() => {
    if (!hasApi || !window.api.events || !eventsEnabled) { setEvents([]); return }
    let live = true
    const load = async () => { try { const e = await window.api.events(); if (live && Array.isArray(e)) setEvents(e) } catch {} }
    load()
    const id = setInterval(load, 10 * 60000)
    return () => { live = false; clearInterval(id) }
  }, [hasApi, eventsEnabled, settings?.fmpKey])
  useEffect(() => {
    if (!imminentEvent) return
    const key = imminentEvent.title + imminentEvent.ts
    if (firedRef.current.has(key)) return
    firedRef.current.add(key)
    const mins = Math.max(1, Math.round((imminentEvent.ts - Date.now()) / 60000))
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('High-impact news', { body: `${imminentEvent.country} ${imminentEvent.title} · in ${mins} min` })
      }
    } catch {}
  }, [imminentEvent])

  // ── achievements ──
  const achievements = useMemo(() => computeAchievements(trades, stats), [trades, stats])
  const unlockedAt = useMemo(() => { try { return JSON.parse(settings?.achievements || '{}') } catch { return {} } }, [settings])
  useEffect(() => {
    if (!hasApi || !settings) return
    const newly = achievements.filter((a) => a.unlocked && !unlockedAt[a.id])
    if (!newly.length) return
    const merged = { ...unlockedAt }
    for (const a of newly) merged[a.id] = new Date().toISOString()
    window.api.setSettings({ achievements: JSON.stringify(merged) }).then(setSettings)
    setToast(newly[newly.length - 1])
  }, [achievements, unlockedAt, hasApi])
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 5000); return () => clearTimeout(id) }, [toast])
  useEffect(() => { window.api?.onUpdateReady?.(() => setUpdateReady(true)) }, [])

  // Re-theme the entire app when live. Runs every render; App is the only writer of T.
  applyTheme(tradeMode)

  const TABS = [
    ['journal', 'Journal', BookOpen],
    ['trade', 'Trade Mode', Zap],
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['psych', 'Psychology', Brain],
    ['rating', 'Rating', Gauge],
    ['goals', 'Goals', Target],
    ['coach', 'AI Coach', Bot],
    ['settings', 'Settings', SettingsIcon]
  ]

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', borderTop: `3px solid ${tradeMode ? T.accent : 'transparent'}`, transition: 'background .3s' }}>
      <Ticker settings={settings} />
      {imminentEvent && <EventBanner event={imminentEvent} now={now} />}
      {tradeMode && <LiveBanner net={todayNet} goal={dailyGoal} maxLoss={maxLoss} lossHit={lossHit} onEnd={endSession} />}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <TrendingUp size={20} style={{ color: T.accent }} />
            <span className="text-lg font-semibold tracking-tight">TradeHelp</span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: tradeMode ? T.accent : T.faint, border: `1px solid ${tradeMode ? T.accent : T.line}` }}>{tradeMode ? 'live' : 'offline'}</span>
          </div>
          <div className="flex items-center gap-5 text-sm" style={mono}>
            <Readout label="NET" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} />
            <Readout label="WIN" value={`${fmtN(stats.winRate, 1)}%`} />
            <Readout label="PF" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} />
            <Readout label="STREAK" value={String(stats.currentStreak)} tone={String(stats.currentStreak).endsWith('W') ? 'up' : String(stats.currentStreak).endsWith('L') ? 'down' : 'none'} />
            {stats.n > 0 && <Readout label="CALM" value={String(stats.nonTiltStreak)} tone="up" />}
            {!tradeMode && (
              <button type="button" onClick={startDay} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
                <Play size={14} /> Start day
              </button>
            )}
          </div>
        </header>

        <nav className="flex flex-wrap gap-1 mb-5">
          {TABS.map(([id, label, Icon]) => {
            const active = tab === id
            return (
              <button key={id} type="button" onClick={() => setTab(id)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
                style={{ background: active ? T.surface2 : 'transparent', color: active ? T.accent : T.dim, border: `1px solid ${active ? T.line : 'transparent'}` }}>
                <Icon size={15} /> {label}
              </button>
            )
          })}
        </nav>

        {!ready ? (
          <div className="py-20 text-center text-sm" style={{ color: T.dim }}>Loading your journal…</div>
        ) : !hasApi ? (
          <div className="py-20 text-center text-sm" style={{ color: T.down }}>
            This UI must run inside the Electron shell (npm run dev) to reach your local database.
          </div>
        ) : (
          <>
            {tab === 'journal' && <Journal trades={trades} onAdd={addTrade} onRemove={removeTrade} onNotes={setNotesView} />}
            {tab === 'trade' && <TradeModeTab settings={settings} onSave={saveSettings} rules={rules} live={tradeMode} todayNet={todayNet} todayCount={todayTrades.length} weekNet={weekNet} goal={dailyGoal} maxLoss={maxLoss} onStart={startDay} onEnd={endSession} />}
            {tab === 'dashboard' && <Dashboard stats={stats} />}
            {tab === 'psych' && <Psychology stats={stats} />}
            {tab === 'rating' && <Rating trades={trades} stats={stats} achievements={achievements} unlockedAt={unlockedAt} />}
            {tab === 'goals' && <Goals goals={goals} onSave={saveGoals} trades={trades} />}
            {tab === 'coach' && <Coach trades={trades} stats={stats} settings={settings} events={events} now={now} />}
            {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} />}
          </>
        )}
      </div>

      {notesView && <NotesModal trade={notesView} onClose={() => setNotesView(null)} />}
      {preflight && (
        <Preflight rules={rules} checks={checks} setChecks={setChecks}
          snapshot={{ todayNet, todayCount: todayTrades.length, weekNet }}
          goal={dailyGoal} maxLoss={maxLoss} imminent={imminentEvent} now={now}
          onCancel={() => setPreflight(false)} onGoLive={goLive} />
      )}
      {tradeMode && lossHit && !lockoutDismissed && (
        <Lockout net={todayNet} maxLoss={maxLoss} onEnd={endSession} onDismiss={() => setLockoutDismissed(true)} />
      )}
      {toast && <AchievementToast a={toast} onClose={() => setToast(null)} />}
      {updateReady && <UpdateBanner onInstall={() => window.api.installUpdate()} />}
    </div>
  )
}

function UpdateBanner({ onInstall }) {
  return (
    <div className="fixed bottom-4 left-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
      <Sparkles size={18} style={{ color: T.accent }} />
      <div className="text-sm">A new version is ready.</div>
      <button type="button" onClick={onInstall} className="rounded-md px-3 py-1.5 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Restart to update</button>
    </div>
  )
}

/* ───────── journal ───────── */
function Journal({ trades, onAdd, onRemove, onNotes }) {
  const blank = { symbol: '', direction: 'Long', entry: '', exit: '', stop: '', target: '', size: '', riskAmount: '', pnl: '', emotion: 'Neutral', setup: 'Pullback', notes: '', entryTime: nowLocalInput(), exitTime: nowLocalInput(), reason: '' }
  const [f, setF] = useState(blank)
  const [images, setImages] = useState([])
  const fileRef = useRef(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  // Setup suggestions = presets + any custom setups already used. Free-text, so you can type your own.
  const setupOptions = useMemo(() => {
    const seen = new Set(SETUPS)
    for (const t of trades) if (t.setup) seen.add(t.setup)
    return [...seen]
  }, [trades])

  const derivedPnl = useMemo(() => {
    const en = parseFloat(f.entry), ex = parseFloat(f.exit), sz = parseFloat(f.size)
    if (!isNaN(en) && !isNaN(ex) && !isNaN(sz)) return (ex - en) * sz * (f.direction === 'Long' ? 1 : -1)
    return null
  }, [f.entry, f.exit, f.size, f.direction])

  const derivedRR = useMemo(() => {
    const en = parseFloat(f.entry), st = parseFloat(f.stop), tg = parseFloat(f.target)
    if (!isNaN(en) && !isNaN(st) && !isNaN(tg) && Math.abs(en - st) > 0) return Math.abs(tg - en) / Math.abs(en - st)
    return null
  }, [f.entry, f.stop, f.target])

  const derivedHold = useMemo(() => {
    const a = parseLocal(f.entryTime), b = parseLocal(f.exitTime)
    return a && b ? b - a : null
  }, [f.entryTime, f.exitTime])

  // reason options follow the outcome (win vs loss); clear a stale pick if the outcome flips
  const effPnl = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? null)
  const isWin = effPnl == null || isNaN(effPnl) ? null : effPnl >= 0
  const reasonOptions = isWin === false ? LOSS_REASONS : WIN_REASONS
  useEffect(() => { setF((p) => (p.reason && !reasonOptions.includes(p.reason) ? { ...p, reason: '' } : p)) }, [isWin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addImageFiles(files) {
    for (const file of files) {
      if (!file || !file.type?.startsWith('image/')) continue
      const small = await downscale(await fileToDataUrl(file))
      setImages((p) => [...p, { tmpId: Date.now() + Math.random(), dataUrl: small, tag: p.length === 0 ? 'Before' : p.length === 1 ? 'After' : '' }])
    }
  }
  // Paste a chart screenshot anywhere on the Journal tab (Ctrl+V) and it lands on the trade.
  useEffect(() => {
    const onPaste = (e) => {
      const imgs = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean)
      if (imgs.length) { e.preventDefault(); addImageFiles(imgs) }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
  const setTag = (tmpId, v) => setImages((p) => p.map((im) => (im.tmpId === tmpId ? { ...im, tag: v } : im)))
  const removeImage = (tmpId) => setImages((p) => p.filter((im) => im.tmpId !== tmpId))

  function submit() {
    if (!f.symbol.trim()) return
    const pnl = f.pnl !== '' ? parseFloat(f.pnl) : (derivedPnl ?? 0)
    const rr = derivedRR ?? (f.riskAmount && f.pnl ? Math.abs(parseFloat(f.pnl)) / Math.abs(parseFloat(f.riskAmount)) : 0)
    onAdd({
      id: Date.now() + Math.random().toString(16).slice(2),
      symbol: f.symbol.trim().toUpperCase(),
      direction: f.direction,
      entry: parseFloat(f.entry) || 0, exit: parseFloat(f.exit) || 0,
      stop: parseFloat(f.stop) || 0, target: parseFloat(f.target) || 0,
      size: parseFloat(f.size) || 0, riskAmount: parseFloat(f.riskAmount) || 0,
      pnl: isNaN(pnl) ? 0 : pnl, rr: rr || 0,
      emotion: f.emotion, setup: f.setup.trim(), notes: f.notes.trim(),
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      entryTime: f.entryTime ? f.entryTime.replace('T', ' ') : '',
      exitTime: f.exitTime ? f.exitTime.replace('T', ' ') : '',
      reason: f.reason
    }, images.map((im) => ({ dataUrl: im.dataUrl, tag: im.tag.trim(), caption: '' })))
    setF(blank); setImages([])
  }

  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
      <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Plus size={16} style={{ color: T.accent }} />
          <h2 className="text-sm font-semibold">Log a trade</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol"><input style={inputStyle} className={inp} value={f.symbol} onChange={set('symbol')} placeholder="ES, BTC, AAPL" /></Field>
          <Field label="Direction">
            <select style={inputStyle} className={inp} value={f.direction} onChange={set('direction')}><option>Long</option><option>Short</option></select>
          </Field>
          <Field label="Entry"><input style={inputStyle} className={inp} value={f.entry} onChange={set('entry')} inputMode="decimal" /></Field>
          <Field label="Exit"><input style={inputStyle} className={inp} value={f.exit} onChange={set('exit')} inputMode="decimal" /></Field>
          <Field label="Stop"><input style={inputStyle} className={inp} value={f.stop} onChange={set('stop')} inputMode="decimal" /></Field>
          <Field label="Target"><input style={inputStyle} className={inp} value={f.target} onChange={set('target')} inputMode="decimal" /></Field>
          <Field label="Size / contracts"><input style={inputStyle} className={inp} value={f.size} onChange={set('size')} inputMode="decimal" /></Field>
          <Field label="Risk $"><input style={inputStyle} className={inp} value={f.riskAmount} onChange={set('riskAmount')} inputMode="decimal" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Entry time"><input type="datetime-local" style={inputStyle} className={inp} value={f.entryTime} onChange={set('entryTime')} /></Field>
          <Field label="Exit time"><input type="datetime-local" style={inputStyle} className={inp} value={f.exitTime} onChange={set('exitTime')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Emotion"><select style={inputStyle} className={inp} value={f.emotion} onChange={set('emotion')}>{EMOTIONS.map((e) => <option key={e}>{e}</option>)}</select></Field>
          <Field label="Setup">
            <input style={inputStyle} className={inp} value={f.setup} onChange={set('setup')} list="setup-options" placeholder="Pick or type your own" />
            <datalist id="setup-options">{setupOptions.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
        <div className="mt-3">
          <Field label={isWin === false ? 'Why did it lose?' : 'Why did it win?'}>
            <select style={inputStyle} className={inp} value={f.reason} onChange={set('reason')}>
              <option value="">— optional, nudges your rating —</option>
              {reasonOptions.map((rr) => <option key={rr} value={rr}>{rr}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Net P&L $ (blank = auto-calc)">
            <input style={inputStyle} className={inp} value={f.pnl} onChange={set('pnl')} inputMode="decimal" placeholder={derivedPnl != null ? `auto: ${fmtN(derivedPnl)}` : '—'} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes"><textarea style={inputStyle} className={inp} rows={3} value={f.notes} onChange={set('notes')} placeholder="What did you see? What did you feel?" /></Field>
        </div>
        <div className="mt-3">
          <Field label="Screenshots — before / after">
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); addImageFiles([...(e.dataTransfer?.files || [])]) }}
              onDragOver={(e) => e.preventDefault()}
              className="rounded px-3 py-3 text-center cursor-pointer"
              style={{ background: T.surface2, border: `1px dashed ${T.line}` }}>
              <ImagePlus size={18} style={{ color: T.accent, display: 'inline', verticalAlign: 'middle' }} />
              <span className="text-xs ml-2" style={{ color: T.dim }}>Paste a chart (Ctrl+V), drop an image, or click to choose</span>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addImageFiles([...e.target.files]); e.target.value = '' }} />
            </div>
          </Field>
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {images.map((im) => (
                <div key={im.tmpId} className="rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                  <div className="relative">
                    <img src={im.dataUrl} alt="" className="w-full h-20 object-cover" />
                    <button type="button" onClick={() => removeImage(im.tmpId)} className="absolute top-1 right-1 rounded p-0.5" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}><X size={13} /></button>
                  </div>
                  <input style={inputStyle} className="w-full px-2 py-1 text-xs" value={im.tag} onChange={(e) => setTag(im.tmpId, e.target.value)} placeholder="tag (e.g. Before)" />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: T.dim }}>
          <span>R:R {derivedRR != null ? `1:${fmtN(derivedRR, 1)}` : '—'}</span>
          <span>Held {derivedHold != null ? fmtDuration(derivedHold) || '0m' : '—'}</span>
          <span>P&L {derivedPnl != null ? fmt$(derivedPnl) : '—'}</span>
        </div>
        <button type="button" onClick={submit} className="w-full mt-3 rounded-md py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save trade</button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: `1px solid ${T.line}` }}>
          Trade history <span style={{ color: T.faint }}>· {trades.length}</span>
        </div>
        {trades.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm" style={{ color: T.dim }}>No trades yet. Log your first one — your edge shows up after a handful.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={mono}>
              <thead>
                <tr style={{ color: T.faint }} className="text-xs uppercase tracking-wider">
                  {['Time', 'Symbol', 'Dir', 'P&L', 'Grade', 'R:R', 'Held', 'Setup', 'Emotion', ''].map((h) => <th key={h} className="text-left font-normal px-3 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...trades].reverse().map((t) => (
                  <tr key={t.id} className="cursor-pointer" style={{ borderTop: `1px solid ${T.line}` }} onDoubleClick={() => onNotes(t)}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: T.dim }}>{t.timestamp}</td>
                    <td className="px-3 py-2 font-semibold">
                      <span className="inline-flex items-center gap-1">{t.symbol}{t.imageCount > 0 && <Paperclip size={12} style={{ color: T.faint }} title={`${t.imageCount} screenshot${t.imageCount === 1 ? '' : 's'}`} />}</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: t.direction === 'Long' ? T.up : T.down }}>{t.direction}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: t.pnl >= 0 ? T.up : T.down }}>{fmt$(t.pnl)}</td>
                    <td className="px-3 py-2"><GradeChip t={t} /></td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.rr ? `1:${fmtN(t.rr, 1)}` : '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{fmtDuration(holdMs(t)) || '—'}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.setup}</td>
                    <td className="px-3 py-2" style={{ color: T.dim }}>{t.emotion}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => onRemove(t.id)} title="Delete" style={{ color: T.faint }}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 text-xs" style={{ color: T.faint, borderTop: `1px solid ${T.line}` }}>Double-click a row to view its notes &amp; screenshots.</div>
      </div>
    </div>
  )
}

/* ───────── dashboard ───────── */
function Dashboard({ stats }) {
  const empty = stats.n === 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Net P&L" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} sub={`${stats.n} trades`} />
        <Stat label="Win rate" value={`${fmtN(stats.winRate, 1)}%`} sub={`expectancy ${fmt$(stats.expectancy)}/trade`} />
        <Stat label="Profit factor" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} tone="accent" sub="gross win ÷ gross loss" />
        <Stat label="Avg R:R" value={stats.avgRR ? `1:${fmtN(stats.avgRR, 1)}` : '—'} />
        <Stat label="Max drawdown" value={fmt$(-stats.maxDD)} tone="down" />
        <Stat label="Avg winner" value={fmt$(stats.avgWin)} tone="up" />
        <Stat label="Avg loser" value={fmt$(-stats.avgLoss)} tone="down" />
        <Stat label="Streaks" value={String(stats.currentStreak)} sub={`best ${stats.bestWin}W · worst ${stats.worstLoss}L`} />
      </div>

      <Panel title="Equity curve">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.equity} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="i" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'Equity']} />
              <Line type="monotone" dataKey="equity" stroke={T.accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Daily P&L (last 14 active days)">
        {empty ? <EmptyChart /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.daily} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="day" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{stats.daily.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? T.up : T.down} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

/* ───────── psychology ───────── */
function Psychology({ stats }) {
  if (stats.n === 0) return <Panel title="Psychology"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Tag emotions and setups on your trades to see where your edge — and your leaks — come from.</div></Panel>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <GroupTable title="P&L by emotion" rows={stats.byEmotion} />
      <GroupTable title="P&L by setup" rows={stats.bySetup} />
      <ReasonList title="Why you win" rows={stats.reasonsWin} tone="up" />
      <ReasonList title="Why you lose" rows={stats.reasonsLoss} tone="down" />
      <div className="md:col-span-2">
        <Panel title="P&L by hour of day">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byHour} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <ReferenceLine y={0} stroke={T.line} />
              <XAxis dataKey="hour" tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} />
              <YAxis tick={{ fill: T.faint, fontSize: 11 }} stroke={T.line} tickFormatter={(v) => '$' + v} />
              <Tooltip contentStyle={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text }} formatter={(v) => [fmt$(v), 'P&L']} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>{stats.byHour.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? T.up : T.down} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
    </div>
  )
}
function ReasonList({ title, rows, tone }) {
  const color = tone === 'up' ? T.up : T.down
  return (
    <Panel title={title}>
      {(!rows || rows.length === 0) ? (
        <div className="text-sm py-2" style={{ color: T.dim }}>Tag a reason when you log trades to see this build up.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between text-sm">
              <span style={{ color: T.text }}>{r.name}</span>
              <span style={{ ...mono, color }}>{r.n}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
function GroupTable({ title, rows }) {
  return (
    <Panel title={title}>
      <table className="w-full text-sm" style={mono}>
        <thead><tr style={{ color: T.faint }} className="text-xs uppercase">
          <th className="text-left font-normal py-1">Name</th>
          <th className="text-right font-normal py-1">n</th>
          <th className="text-right font-normal py-1">Win%</th>
          <th className="text-right font-normal py-1">P&L</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{ borderTop: `1px solid ${T.line}` }}>
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right" style={{ color: T.dim }}>{r.n}</td>
              <td className="py-1.5 text-right" style={{ color: T.dim }}>{fmtN(r.wr, 0)}%</td>
              <td className="py-1.5 text-right font-semibold" style={{ color: r.pnl >= 0 ? T.up : T.down }}>{fmt$(r.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

/* ───────── rating ───────── */
function Rating({ trades, stats, achievements, unlockedAt }) {
  const r = useMemo(() => computeRating(trades, stats), [trades, stats])
  if (stats.n === 0) {
    return <Panel title="Trader rating"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Log trades to build your rating. It grades your <span style={{ color: T.text }}>process</span> — not whether you won.</div></Panel>
  }
  const tier = r.ovr >= 90 ? 'Superstar' : r.ovr >= 84 ? 'Elite' : r.ovr >= 76 ? 'All-Star' : r.ovr >= 68 ? 'Starter' : 'Prospect'
  const ovrColor = r.provisional ? T.dim : r.ovr >= 84 ? T.up : r.ovr >= 68 ? T.accent : T.down
  const ATTRS = [
    ['Edge', r.attrs.edge], ['Discipline', r.attrs.discipline], ['Risk Mgmt', r.attrs.risk],
    ['Consistency', r.attrs.consistency], ['Patience', r.attrs.patience]
  ]
  return (
    <div className="space-y-5">
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
      <div className="rounded-xl p-5" style={{ background: `linear-gradient(160deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>Overall</span>
          <span className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: T.faint, border: `1px solid ${T.line}` }}><Lock size={11} /> {r.verified ? 'Verified' : 'Self-reported'}</span>
        </div>
        <div className="flex items-end gap-3 mt-1">
          <div style={{ fontSize: 64, lineHeight: 1, fontWeight: 800, ...mono, color: ovrColor }}>{r.ovr}</div>
          <div className="pb-2">
            <div className="text-sm font-semibold">{tier}</div>
            <div className="text-xs" style={{ color: T.accent }}>{r.archetype}</div>
          </div>
        </div>
        {r.provisional && <div className="mt-2 text-xs" style={{ color: T.faint }}>Provisional · {r.sampleN}/20 trades. The rating settles as you log more.</div>}
        <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: T.dim }}>
          <Brain size={13} style={{ color: T.up }} /> Non-tilt streak <span style={{ color: T.text, ...mono }}>{stats.nonTiltStreak}</span> <span style={{ color: T.faint }}>· best {stats.bestNonTilt}</span>
        </div>
        <div className="mt-4 text-xs leading-relaxed" style={{ color: T.dim }}>
          Graded on <span style={{ color: T.text }}>process, not P&amp;L</span>. A disciplined trade that loses still scores well — that's the point.
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Attributes">
          <div className="space-y-3">
            {ATTRS.map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>{label}</span><span style={{ ...mono, color: T.text }}>{v}</span></div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                  <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 84 ? T.up : v >= 68 ? T.accent : T.down, transition: 'width .4s' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="How it's scored">
          <ul className="text-sm space-y-1.5" style={{ color: T.dim }}>
            <li><span style={{ color: T.text }}>Edge</span> — profit factor & expectancy (the only outcome-based attribute).</li>
            <li><span style={{ color: T.text }}>Discipline</span> — your average per-trade grade: stop set, R:R, clean emotion, risk honored.</li>
            <li><span style={{ color: T.text }}>Risk Mgmt</span> — keeping drawdown small vs. profit.</li>
            <li><span style={{ color: T.text }}>Consistency</span> — win rate & staying profitable.</li>
            <li><span style={{ color: T.text }}>Patience</span> — not overtrading (trades per active day).</li>
          </ul>
          <p className="mt-3 text-xs" style={{ color: T.dim }}>Your tagged <span style={{ color: T.text }}>win/loss reasons</span> nudge the matching attribute (±10) — "lost to greed" dings Discipline; "won by being patient" lifts Patience. "Just variance" and "got lucky" move nothing.</p>
          <p className="mt-2 text-xs" style={{ color: T.faint }}>“Self-reported” becomes “Verified” once trades import from your broker.</p>
        </Panel>
      </div>
    </div>
      <AchievementShelf achievements={achievements} unlockedAt={unlockedAt} />
    </div>
  )
}

function AchievementShelf({ achievements, unlockedAt }) {
  const done = achievements.filter((a) => a.unlocked).length
  return (
    <Panel title={`Achievements · ${done}/${achievements.length}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {achievements.map((a) => {
          const Icon = a.Icon
          const u = a.unlocked
          return (
            <div key={a.id} className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${u ? T.accent : T.line}`, opacity: u ? 1 : 0.7 }}>
              <div className="flex items-center gap-2">
                <Icon size={18} style={{ color: u ? T.accent : T.faint, flexShrink: 0 }} />
                <span className="text-sm font-semibold" style={{ color: u ? T.text : T.dim }}>{a.name}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: T.faint }}>{a.desc}</div>
              {u ? (
                <div className="text-xs mt-2" style={{ color: T.up }}>Unlocked{unlockedAt?.[a.id] ? ` · ${unlockedAt[a.id].slice(0, 10)}` : ''}</div>
              ) : (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.surface }}>
                    <div className="h-full rounded-full" style={{ width: `${a.progress * 100}%`, background: T.accent, transition: 'width .4s' }} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: T.faint, ...mono }}>{Math.min(a.current || 0, a.goal)}/{a.goal}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function AchievementToast({ a, onClose }) {
  const Icon = a.Icon
  return (
    <div className="fixed bottom-4 right-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}`, minWidth: 240, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
      <div className="rounded-lg p-2" style={{ background: T.accentSoft }}><Icon size={20} style={{ color: T.accent }} /></div>
      <div className="flex-1">
        <div className="text-xs" style={{ color: T.accent }}>Achievement unlocked</div>
        <div className="text-sm font-semibold">{a.name}</div>
      </div>
      <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={16} /></button>
    </div>
  )
}

/* ───────── goals ───────── */
function Goals({ goals, onSave, trades }) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 864e5)
  const ym = now.toISOString().slice(0, 7)
  const weekPnl = trades.filter((t) => new Date((t.timestamp || '').replace(' ', 'T')) >= weekAgo).reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const monthPnl = trades.filter((t) => (t.timestamp || '').slice(0, 7) === ym).reduce((a, t) => a + (Number(t.pnl) || 0), 0)

  const [w, setW] = useState(String(goals.weekly))
  const [m, setM] = useState(String(goals.monthly))
  useEffect(() => { setW(String(goals.weekly)); setM(String(goals.monthly)) }, [goals])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="Targets">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly $"><input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={w} onChange={(e) => setW(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Monthly $"><input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" /></Field>
        </div>
        <button type="button" onClick={() => onSave({ weekly: parseFloat(w) || 0, monthly: parseFloat(m) || 0 })} className="mt-3 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save targets</button>
      </Panel>
      <Panel title="Progress">
        <ProgressBar label="This week" cur={weekPnl} target={goals.weekly} />
        <div className="h-4" />
        <ProgressBar label="This month" cur={monthPnl} target={goals.monthly} />
      </Panel>
    </div>
  )
}
function ProgressBar({ label, cur, target }) {
  const pct = target > 0 ? Math.min(Math.max((cur / target) * 100, 0), 100) : 0
  const hit = target > 0 && cur >= target
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: T.dim }}>{label}</span>
        <span style={{ ...mono, color: hit ? T.up : T.text }}>{fmt$(cur)} / {fmt$(target)}{hit ? '  ✓' : ''}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hit ? T.up : T.accent, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

/* ───────── AI coach ───────── */
const COACH_SYSTEM = `You are a trading performance coach embedded in a trader's personal journal app.
You are given the trader's REAL aggregated stats and recent trades. Coach the PROCESS and PSYCHOLOGY:
discipline, emotional patterns, position sizing behaviour, time-of-day performance, overtrading, revenge trading,
cutting winners early, rule-breaking. Be specific and reference their actual numbers.
Do NOT give buy/sell signals, price predictions, or personalized investment advice. Keep it tight (under ~180 words),
direct, and supportive. If data is thin, say so honestly.`

function tradeContext(trades, stats) {
  const recent = [...trades].slice(-12).map((t) =>
    `${t.timestamp} ${t.symbol} ${t.direction} pnl=${fmtN(t.pnl)} rr=${t.rr ? fmtN(t.rr, 1) : '-'} setup=${t.setup} emotion=${t.emotion}`).join('\n')
  const top = (arr) => arr.slice(0, 3).map((g) => `${g.name}(${fmtN(g.pnl)})`).join(', ')
  return `STATS:
trades=${stats.n} netPnL=${fmtN(stats.totalPnl)} winRate=${fmtN(stats.winRate, 1)}% profitFactor=${stats.profitFactor === Infinity ? 'inf' : fmtN(stats.profitFactor, 2)}
avgWin=${fmtN(stats.avgWin)} avgLoss=${fmtN(stats.avgLoss)} maxDD=${fmtN(stats.maxDD)} avgRR=${fmtN(stats.avgRR, 1)} currentStreak=${stats.currentStreak}
P&L by emotion: ${top(stats.byEmotion)}
P&L by setup: ${top(stats.bySetup)}
RECENT TRADES:
${recent || '(none)'}`
}

function Coach({ trades, stats, settings, events, now }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [price, setPrice] = useState({ sym: '', out: null, loading: false })
  const scrollRef = useRef(null)
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [msgs, busy])

  const modelLabel = settings?.provider === 'cloud' ? settings?.cloudModel : settings?.ollamaModel

  async function ask(userText) {
    if (busy) return
    const next = [...msgs, { role: 'user', content: userText }]
    setMsgs(next); setInput(''); setBusy(true)
    try {
      const apiMsgs = [
        { role: 'user', content: `Here is my current journal data:\n\n${tradeContext(trades, stats)}` },
        { role: 'assistant', content: 'Got it — I have your stats and recent trades in front of me.' },
        ...next
      ]
      const res = await window.api.aiChat({ system: COACH_SYSTEM, messages: apiMsgs })
      setMsgs((m) => [...m, { role: 'assistant', content: res?.ok ? res.text : `⚠︎ ${res?.error || 'Coach unavailable.'}` }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: '⚠︎ Could not reach the model. Check Settings → make sure Ollama is running.' }])
    } finally { setBusy(false) }
  }

  async function checkPrice() {
    const sym = price.sym.trim()
    if (!sym || price.loading) return
    setPrice((p) => ({ ...p, loading: true, out: null }))
    const res = await window.api.price(sym)
    setPrice((p) => ({ ...p, loading: false, out: res }))
  }

  const quick = [
    ['Review my recent trades', 'Review my recent trades. What stands out, good and bad?'],
    ['Spot my bad habits', 'Based on my data, what behavioural leaks (revenge, FOMO, early exits, overtrading) do you see?'],
    ['When do I trade best?', 'Looking at my P&L by hour and by setup, when and how do I perform best and worst?']
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-xl flex flex-col" style={{ background: T.surface, border: `1px solid ${T.line}`, height: 540 }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Bot size={16} style={{ color: T.accent }} />
          <span className="text-sm font-semibold">AI Coach</span>
          <span className="text-xs ml-auto" style={{ color: T.faint }}>{modelLabel || 'no model'} · not financial advice</span>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {msgs.length === 0 && (
            <div className="text-sm" style={{ color: T.dim }}>
              <Sparkles size={15} style={{ color: T.accent, display: 'inline' }} /> Ask anything about your trading, or tap a prompt below. I'm reading your {stats.n} logged trade{stats.n === 1 ? '' : 's'}.
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap" style={{ background: m.role === 'user' ? T.surface2 : T.accentSoft, color: m.role === 'user' ? T.text : '#F3D9A0', border: `1px solid ${T.line}` }}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="text-sm" style={{ color: T.accent }}>Coach is thinking…</div>}
        </div>
        <div className="px-4 pt-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <div className="flex flex-wrap gap-1.5 py-2">
            {quick.map(([label, q]) => (
              <button key={label} type="button" disabled={busy} onClick={() => ask(q)} className="text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2 pb-3">
            <input style={inputStyle} className="flex-1 rounded px-3 py-2 text-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) ask(input.trim()) }} placeholder="Ask your coach…" />
            <button type="button" disabled={busy || !input.trim()} onClick={() => input.trim() && ask(input.trim())} className="rounded px-3 py-2" style={{ background: T.accent, color: '#1A1306' }}><Send size={16} /></button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Live price">
          <div className="flex gap-2">
            <input style={inputStyle} className="flex-1 rounded px-2 py-1.5 text-sm" value={price.sym} onChange={(e) => setPrice((p) => ({ ...p, sym: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && checkPrice()} placeholder="BTC, AAPL, MSFT" />
            <button type="button" onClick={checkPrice} disabled={price.loading} className="rounded px-2.5 py-1.5" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Search size={15} /></button>
          </div>
          <div className="mt-2 text-sm min-h-[20px]" style={mono}>
            {price.loading ? <span style={{ color: T.accent }}>Looking up…</span>
              : price.out == null ? <span style={{ color: T.faint }}>Enter a symbol.</span>
              : price.out.ok ? (
                <span>
                  <span style={{ color: T.text }}>{price.out.symbol} </span>
                  <span style={{ color: T.text, fontWeight: 600 }}>{fmt$(price.out.price)} </span>
                  <span style={{ color: price.out.changePct >= 0 ? T.up : T.down }}>{price.out.changePct >= 0 ? '+' : ''}{fmtN(price.out.changePct, 2)}%</span>
                  <span style={{ color: T.faint }}> · {price.out.source}</span>
                </span>
              ) : <span style={{ color: T.down }}>{price.out.error}</span>}
          </div>
        </Panel>
        <EventsPanel events={events} now={now} />
        <Panel title="How this works">
          <p className="text-sm" style={{ color: T.dim }}>
            The coach reads the same numbers you see and reasons over them — entirely on your machine when pointed at
            <span style={{ color: T.accent, ...mono }}> Ollama</span>. Change the model in Settings.
          </p>
        </Panel>
      </div>
    </div>
  )
}

/* ───────── settings ───────── */
function SettingsTab({ settings, onSave }) {
  const [s, setS] = useState(settings || {})
  const [test, setTest] = useState(null)
  useEffect(() => { setS(settings || {}) }, [settings])
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }))
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  async function testConn() {
    setTest('Testing…')
    const res = await window.api.aiModels()
    if (res.ok) setTest(`Connected. Models: ${res.models.join(', ') || '(none — run: ollama pull llama3.2)'}`)
    else setTest(`Failed: ${res.error}`)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="Model provider">
        <Field label="Provider">
          <select style={inputStyle} className={inp} value={s.provider || 'ollama'} onChange={set('provider')}>
            <option value="ollama">Ollama (local, offline, free)</option>
            <option value="cloud">Cloud (OpenAI-compatible, your key)</option>
          </select>
        </Field>
        {(s.provider || 'ollama') === 'ollama' ? (
          <div className="space-y-3 mt-3">
            <Field label="Ollama URL"><input style={inputStyle} className={inp} value={s.ollamaUrl || ''} onChange={set('ollamaUrl')} /></Field>
            <Field label="Model"><input style={inputStyle} className={inp} value={s.ollamaModel || ''} onChange={set('ollamaModel')} placeholder="llama3.2" /></Field>
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            <Field label="Base URL"><input style={inputStyle} className={inp} value={s.cloudUrl || ''} onChange={set('cloudUrl')} /></Field>
            <Field label="Model"><input style={inputStyle} className={inp} value={s.cloudModel || ''} onChange={set('cloudModel')} /></Field>
            <Field label="API key (stored locally)"><input type="password" style={inputStyle} className={inp} value={s.cloudKey || ''} onChange={set('cloudKey')} /></Field>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => onSave(s)} className="rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
          <button type="button" onClick={testConn} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Test Ollama</button>
        </div>
        {test && <div className="mt-3 text-xs" style={{ color: T.dim, ...mono }}>{test}</div>}
      </Panel>
      <Panel title="Getting Ollama running">
        <ol className="text-sm space-y-2" style={{ color: T.dim }}>
          <li>1. Install Ollama from ollama.com</li>
          <li>2. In a terminal: <span style={{ color: T.accent, ...mono }}>ollama pull llama3.2</span></li>
          <li>3. Ollama serves on localhost:11434 automatically</li>
          <li>4. Hit “Test Ollama” to confirm, then use the AI Coach tab</li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>Everything stays on your machine. Your key and trades never leave this app.</p>
      </Panel>

      <Panel title="Market data &amp; ticker">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" checked={(s.tickerEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, tickerEnabled: String(e.target.checked) }))} />
          Show the scrolling ticker tape
        </label>
        <div className="space-y-3 mt-3">
          <Field label="Ticker symbols (comma-separated)">
            <input style={inputStyle} className={inp} value={s.tickerSymbols ?? ''} onChange={set('tickerSymbols')} placeholder="SPY,QQQ,BTC,ETH" />
          </Field>
          <Field label="Finnhub API key (optional — real-time stocks)">
            <input type="password" style={inputStyle} className={inp} value={s.finnhubKey ?? ''} onChange={set('finnhubKey')} placeholder="leave blank for keyless / delayed" />
          </Field>
        </div>
        <button type="button" onClick={() => onSave(s)} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Keyless by default (crypto via Binance, stocks delayed via Stooq). A free Finnhub key switches stocks to real-time and also speeds up the Live price lookup. Futures (ES/NQ) need a paid feed — use SPY/QQQ as proxies.
        </p>
      </Panel>

      <Panel title="Economic calendar &amp; news">
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.text }}>
          <input type="checkbox" checked={(s.eventsEnabled ?? 'true') !== 'false'} onChange={(e) => setS((p) => ({ ...p, eventsEnabled: String(e.target.checked) }))} />
          Warn me before high-impact news
        </label>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Alert me (min before)"><input style={inputStyle} className={inp} value={s.eventsLeadMin ?? '15'} onChange={set('eventsLeadMin')} inputMode="numeric" /></Field>
          <Field label="Minimum impact">
            <select style={inputStyle} className={inp} value={s.eventsMinImpact || 'High'} onChange={set('eventsMinImpact')}>
              <option value="High">High only</option>
              <option value="Medium">Medium &amp; High</option>
            </select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="FMP API key (optional — fuller calendar)">
            <input type="password" style={inputStyle} className={inp} value={s.fmpKey ?? ''} onChange={set('fmpKey')} placeholder="leave blank for keyless (ForexFactory)" />
          </Field>
        </div>
        <button type="button" onClick={() => onSave(s)} className="mt-4 rounded-md px-3 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save</button>
        <p className="mt-3 text-xs" style={{ color: T.faint }}>
          Keyless by default (ForexFactory weekly feed). You'll get a subtle banner and a desktop notification before a high-impact event, plus a warning in the Trade Mode pre-flight.
        </p>
      </Panel>
    </div>
  )
}

/* ───────── trade detail modal (notes + screenshots) ───────── */
function NotesModal({ trade, onClose }) {
  const [imgs, setImgs] = useState(null)
  const [zoom, setZoom] = useState(null)
  useEffect(() => {
    let live = true
    if (window.api?.listImages) window.api.listImages(trade.id).then((r) => { if (live) setImgs(r) })
    else setImgs([])
    return () => { live = false }
  }, [trade.id])
  async function del(id) { setImgs(await window.api.deleteImage(id)) }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-full max-w-2xl max-h-[88vh] overflow-y-auto" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{trade.symbol} · {trade.direction}</div>
            <div className="text-xs" style={{ color: T.dim, ...mono }}>{trade.timestamp} · {fmt$(trade.pnl)} · {trade.setup} · {trade.emotion}</div>
            {(trade.entryTime || trade.exitTime) && (
              <div className="text-xs mt-0.5" style={{ color: T.faint, ...mono }}>
                {trade.entryTime || '—'} → {trade.exitTime || '—'}{holdMs(trade) ? ` · held ${fmtDuration(holdMs(trade))}` : ''}
              </div>
            )}
            <div className="text-xs mt-1 flex items-center gap-1.5" style={{ color: T.faint }}>Execution <GradeChip t={trade} /> <span>· process, not outcome</span></div>
            {trade.reason && <div className="text-xs mt-1" style={{ color: T.dim }}>Reason: <span style={{ color: T.text }}>{trade.reason}</span></div>}
          </div>
          <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={18} /></button>
        </div>
        <div className="mt-3 text-sm whitespace-pre-wrap" style={{ color: T.text }}>
          {trade.notes || <span style={{ color: T.faint }}>No notes written for this trade.</span>}
        </div>
        {imgs === null ? (
          <div className="mt-4 text-xs" style={{ color: T.faint }}>Loading screenshots…</div>
        ) : imgs.length > 0 ? (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: T.faint }}>Screenshots</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {imgs.map((im) => (
                <div key={im.id} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                  <div className="flex items-center justify-between px-2 py-1" style={{ background: T.surface2 }}>
                    <span className="text-xs" style={{ color: T.dim }}>{im.tag || 'untagged'}</span>
                    <button type="button" onClick={() => del(im.id)} title="Delete image" style={{ color: T.faint }}><Trash2 size={13} /></button>
                  </div>
                  {im.dataUrl
                    ? <img src={im.dataUrl} alt={im.tag} className="w-full cursor-zoom-in" style={{ maxHeight: 320, objectFit: 'contain', background: '#000' }} onClick={() => setZoom(im.dataUrl)} />
                    : <div className="py-8 text-center text-xs" style={{ color: T.faint }}>image missing</div>}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {zoom && (
        <div className="fixed inset-0 flex items-center justify-center p-6 z-[70]" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setZoom(null)}>
          <img src={zoom} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

/* ───────── trade mode ───────── */
function Check({ on, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-2 text-left w-full py-1.5">
      {on ? <CheckSquare size={18} style={{ color: T.up, flexShrink: 0 }} /> : <Square size={18} style={{ color: T.faint, flexShrink: 0 }} />}
      <span className="text-sm" style={{ color: on ? T.text : T.dim }}>{label}</span>
    </button>
  )
}

function TradeModeTab({ settings, onSave, rules, live, todayNet, todayCount, weekNet, goal, maxLoss, onStart, onEnd }) {
  const [list, setList] = useState(rules)
  const [g, setG] = useState(String(goal || ''))
  const [ml, setMl] = useState(String(maxLoss || ''))
  const [saved, setSaved] = useState(false)
  useEffect(() => { setList(rules) }, [rules])
  useEffect(() => { setG(String(goal || '')); setMl(String(maxLoss || '')) }, [goal, maxLoss])

  const edit = (i, v) => setList((p) => p.map((r, j) => (j === i ? v : r)))
  const add = () => setList((p) => [...p, ''])
  const remove = (i) => setList((p) => p.filter((_, j) => j !== i))
  function save() {
    const clean = list.map((r) => r.trim()).filter(Boolean)
    setList(clean)
    onSave({ tradeRules: JSON.stringify(clean), dailyGoal: parseFloat(g) || 0, maxDailyLoss: parseFloat(ml) || 0 })
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const inp = 'w-full rounded px-2 py-1.5 text-sm'
  const goalPct = goal > 0 ? clamp((todayNet / goal) * 100, 0, 100) : 0
  const lossPct = maxLoss > 0 ? clamp((-todayNet / maxLoss) * 100, 0, 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
      <div className="space-y-4">
        <Panel title="Your trading rules" right={
          <button type="button" onClick={add} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}><Plus size={13} /> Add rule</button>
        }>
          {list.length === 0 ? (
            <div className="text-sm py-3" style={{ color: T.dim }}>No rules yet. Add the checks you want to confirm before every trade.</div>
          ) : (
            <div className="space-y-2">
              {list.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span style={{ color: T.faint }} className="text-xs w-5 text-right">{i + 1}.</span>
                  <input style={inputStyle} className={inp} value={r} onChange={(e) => edit(i, e.target.value)} placeholder="e.g. Stop-loss set before entry" />
                  <button type="button" onClick={() => remove(i)} title="Remove" style={{ color: T.faint }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs mt-3" style={{ color: T.faint }}>These become your pre-flight checklist every time you start a trading day.</p>
        </Panel>

        <Panel title="Daily limits">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily goal $"><input style={inputStyle} className={inp} value={g} onChange={(e) => setG(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Max daily loss $"><input style={inputStyle} className={inp} value={ml} onChange={(e) => setMl(e.target.value)} inputMode="decimal" /></Field>
          </div>
          <p className="text-xs mt-2" style={{ color: T.faint }}>Hit your max loss and Trade Mode stops you and tells you to walk away.</p>
        </Panel>

        <div className="flex items-center gap-3">
          <button type="button" onClick={save} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save rules &amp; limits</button>
          {saved && <span className="text-xs" style={{ color: T.up }}>Saved ✓</span>}
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Session">
          {live ? (
            <div className="space-y-4">
              <div className="text-sm flex items-center gap-2" style={{ color: T.accent }}><span>●</span> You're live.</div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>Toward goal</span><span style={{ ...mono, color: T.text }}>{fmt$(todayNet)} / {fmt$(goal)}</span></div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: T.up, transition: 'width .4s' }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>Toward loss limit</span><span style={{ ...mono, color: T.down }}>{fmt$(-maxLoss)}</span></div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: T.surface2 }}><div className="h-full rounded-full" style={{ width: `${lossPct}%`, background: T.down, transition: 'width .4s' }} /></div>
              </div>
              <button type="button" onClick={onEnd} className="w-full rounded-md py-2 text-sm font-semibold" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>End session</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Today" value={fmt$(todayNet)} tone={todayNet >= 0 ? 'up' : 'down'} sub={`${todayCount} trades`} />
                <Stat label="This week" value={fmt$(weekNet)} tone={weekNet >= 0 ? 'up' : 'down'} />
              </div>
              <button type="button" onClick={onStart} className="w-full rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-2" style={{ background: T.accent, color: '#1A1306' }}>
                <Play size={16} /> Start trading day
              </button>
              <p className="text-xs" style={{ color: T.faint }}>Runs your pre-flight checklist, then flips the app into a focused “go time” mode.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Preflight({ rules, checks, setChecks, snapshot, goal, maxLoss, imminent, now, onCancel, onGoLive }) {
  const toggle = (i) => setChecks((c) => ({ ...c, [i]: !c[i] }))
  const unchecked = rules.reduce((n, _, i) => n + (checks[i] ? 0 : 1), 0)
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onCancel}>
      <div className="rounded-xl w-full max-w-lg" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: `1px solid ${T.line}` }}>
          <Zap size={18} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">Pre-flight check</div>
            <div className="text-xs" style={{ color: T.dim }}>{dateLabel}</div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          {imminent && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: T.accentSoft, color: T.accent }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span>High-impact news — {imminent.country} {imminent.title} in {untilLabel(imminent.ts, now)}. Consider waiting for the print.</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Today" value={fmt$(snapshot.todayNet)} tone={snapshot.todayNet >= 0 ? 'up' : 'down'} sub={`${snapshot.todayCount} trades`} />
            <Stat label="This week" value={fmt$(snapshot.weekNet)} tone={snapshot.weekNet >= 0 ? 'up' : 'down'} />
            <Stat label="Goal / stop" value={fmt$(goal)} sub={`stop ${fmt$(-maxLoss)}`} tone="accent" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: T.faint }}>Your rules</div>
            {rules.length === 0 ? (
              <div className="text-sm py-3" style={{ color: T.dim }}>No rules yet — add them in the Trade Mode tab.</div>
            ) : (
              <div className="rounded-lg px-3 py-1" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                {rules.map((r, i) => <Check key={i} on={!!checks[i]} label={r} onClick={() => toggle(i)} />)}
              </div>
            )}
            <div className="text-xs mt-2" style={{ color: T.faint }}>Tick what you've confirmed — this is on your honor.</div>
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${T.line}` }}>
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Cancel</button>
          <button type="button" onClick={onGoLive} className="rounded-md px-4 py-2 text-sm font-semibold flex items-center gap-1.5" style={{ background: T.accent, color: '#1A1306' }}>
            <Zap size={15} /> Go live{unchecked > 0 ? ` (${unchecked} unchecked)` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

function LiveBanner({ net, goal, maxLoss, lossHit, onEnd }) {
  const lossPct = maxLoss > 0 ? clamp((-net / maxLoss) * 100, 0, 100) : 0
  const bg = lossHit ? T.down : T.accent
  return (
    <div className="w-full" style={{ background: bg, color: '#1A0E06' }}>
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" style={mono}>
        <span className="font-bold tracking-wide flex items-center gap-2">● LIVE — TRADE MODE</span>
        <span>Today <strong>{fmt$(net)}</strong>{goal > 0 ? ` / ${fmt$(goal)}` : ''}</span>
        {maxLoss > 0 && (
          <span className="flex items-center gap-2">
            Loss limit
            <span className="inline-block h-2 w-24 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.25)' }}>
              <span className="block h-full" style={{ width: `${lossPct}%`, background: '#1A0E06' }} />
            </span>
            {fmt$(-maxLoss)}
          </span>
        )}
        <button type="button" onClick={onEnd} className="ml-auto px-3 py-1 rounded-md text-sm font-semibold" style={{ background: '#1A0E06', color: bg }}>End session</button>
      </div>
    </div>
  )
}

/* ───────── economic calendar ───────── */
function EventBanner({ event, now }) {
  return (
    <div className="w-full" style={{ background: T.accentSoft, borderBottom: `1px solid ${T.line}` }}>
      <div className="max-w-6xl mx-auto px-4 py-1.5 text-xs flex items-center gap-2" style={{ ...mono, color: T.accent }}>
        <AlertTriangle size={13} />
        <span className="font-semibold">News</span>
        <span style={{ color: T.dim }}>{event.country} · {event.title}</span>
        <span className="ml-auto">{untilLabel(event.ts, now) === 'now' ? 'now' : `in ${untilLabel(event.ts, now)}`}</span>
      </div>
    </div>
  )
}

function EventsPanel({ events, now }) {
  const dot = (impact) => impact === 'High' ? T.down : impact === 'Medium' ? T.accent : T.faint
  const upcoming = (events || []).filter((e) => e.ts > now).slice(0, 6)
  return (
    <Panel title="Economic calendar">
      {upcoming.length === 0 ? (
        <p className="text-sm" style={{ color: T.dim }}>No upcoming events. Add an FMP key in Settings for a fuller calendar.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot(e.impact), flexShrink: 0 }} />
              <span style={{ color: T.faint }}>{e.country}</span>
              <span style={{ color: T.text }} className="truncate flex-1">{e.title}</span>
              <span style={{ color: T.dim, ...mono }}>{untilLabel(e.ts, now)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs" style={{ color: T.faint }}>Don't trade the news? Wait for the print, or be set before it drops.</p>
    </Panel>
  )
}

/* ───────── ticker tape ───────── */
function Ticker({ settings }) {
  const [quotes, setQuotes] = useState([])
  const enabled = (settings?.tickerEnabled ?? 'true') !== 'false'
  const symbols = (settings?.tickerSymbols || '').trim()

  useEffect(() => {
    if (!enabled || !symbols || !window.api?.priceBatch) { setQuotes([]); return }
    let live = true
    const list = symbols.split(',').map((s) => s.trim()).filter(Boolean)
    const load = async () => {
      try { const q = await window.api.priceBatch(list); if (live && Array.isArray(q)) setQuotes(q) } catch { /* keep last */ }
    }
    load()
    const id = setInterval(load, 45000)
    return () => { live = false; clearInterval(id) }
  }, [enabled, symbols])

  if (!enabled || quotes.length === 0) return null
  const items = quotes.map((q) => (
    <span key={q.symbol} className="inline-flex items-center gap-1.5 mx-4">
      <span style={{ color: T.dim }}>{q.symbol}</span>
      <span style={{ color: T.text }}>{fmtN(q.price, q.price < 10 ? 4 : 2)}</span>
      <span style={{ color: q.changePct >= 0 ? T.up : T.down }}>{q.changePct >= 0 ? '+' : ''}{fmtN(q.changePct, 2)}%</span>
    </span>
  ))
  return (
    <div className="w-full overflow-hidden" style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }} title="Pause on hover · edit symbols in Settings">
      <div className="ticker-track py-1.5 text-xs" style={mono}>
        <span className="ticker-seg">{items}</span>
        <span className="ticker-seg" aria-hidden="true">{items}</span>
      </div>
    </div>
  )
}

function Lockout({ net, maxLoss, onEnd, onDismiss }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-[60]" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-xl w-full max-w-md p-6 text-center" style={{ background: T.surface, border: `1px solid ${T.down}` }}>
        <div className="flex justify-center mb-3"><AlertTriangle size={40} style={{ color: T.down }} /></div>
        <div className="text-lg font-semibold">Daily loss limit reached</div>
        <div className="text-sm mt-2" style={{ color: T.dim }}>
          You're down <span style={{ color: T.down, ...mono }}>{fmt$(net)}</span> today — past your{' '}
          <span style={mono}>{fmt$(-maxLoss)}</span> stop. The edge for today is gone. Step away.
        </div>
        <div className="flex gap-2 justify-center mt-5">
          <button type="button" onClick={onEnd} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.down, color: '#2A0A10' }}>End session</button>
          <button type="button" onClick={onDismiss} className="rounded-md px-4 py-2 text-sm" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>Keep trading anyway</button>
        </div>
      </div>
    </div>
  )
}

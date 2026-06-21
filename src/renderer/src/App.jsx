import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  BookOpen, LayoutDashboard, Brain, Target, Bot, Settings as SettingsIcon,
  TrendingUp, Zap, Building2, ClipboardList, Gauge, ScanSearch, Play
} from 'lucide-react'
import { applyTheme, T, mono } from './theme.js'
import { fmt$, fmtN, parseRules, IMPACT_RANK, ALERT_LEADS, GATE_CONFIGURED } from './utils.js'
import { computeStats, computeAchievements } from './stats.js'
import { Readout } from './components/Shared.jsx'
import { NotesModal } from './components/NotesModal.jsx'
import { Journal } from './tabs/JournalTab.jsx'
import { Dashboard } from './tabs/DashboardTab.jsx'
import { Psychology } from './tabs/PsychologyTab.jsx'
import { Rating, AchievementToast } from './tabs/RatingTab.jsx'
import { Goals } from './tabs/GoalsTab.jsx'
import { Reviews } from './tabs/ReviewsTab.jsx'
import { Coach } from './tabs/CoachTab.jsx'
import { Patterns } from './tabs/PatternsTab.jsx'
import { PropFirm } from './tabs/PropFirmTab.jsx'
import { TradeModeTab, Preflight, LiveBanner, Lockout } from './tabs/TradeModeTab.jsx'
import { TrialBanner, Paywall, SettingsTab } from './tabs/SettingsTab.jsx'
import { Ticker } from './widgets/Ticker.jsx'
import { EventBanner } from './widgets/EventBanner.jsx'
import { UpdateBanner } from './widgets/UpdateBanner.jsx'

/* ───────── main app ───────── */
export default function App() {
  const [ready, setReady] = useState(false)
  const [trades, setTrades] = useState([])
  const [goals, setGoals] = useState({ weekly: 500, monthly: 2000 })
  const [reviews, setReviews] = useState({})
  const [settings, setSettings] = useState(null)
  const [license, setLicense] = useState(null)
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
      setReviews(await window.api.getReviews())
      setSettings(await window.api.getSettings())
      if (window.api.getLicense) setLicense(await window.api.getLicense())
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
  async function updateTrade(t) { if (hasApi) setTrades(await window.api.updateTrade(t)) }
  async function removeTrade(id) { if (hasApi) setTrades(await window.api.deleteTrade(id)) }
  async function importTrades(rows) { if (hasApi) setTrades(await window.api.importTrades(rows)) }
  async function reloadAll() {
    if (!hasApi) return
    setTrades(await window.api.listTrades()); setGoals(await window.api.getGoals())
    setReviews(await window.api.getReviews()); setSettings(await window.api.getSettings())
  }
  async function saveGoals(g) { if (hasApi) setGoals(await window.api.setGoals(g)) }
  async function saveReview(period, text) { if (hasApi) setReviews(await window.api.setReview(period, text)) }
  async function refreshLicense() { if (hasApi && window.api.getLicense) setLicense(await window.api.getLicense()) }
  async function saveSettings(s) { if (hasApi) setSettings(await window.api.setSettings(s)) }
  const propFirmAccounts = useMemo(() => {
    try { const arr = JSON.parse(settings?.propFirmAccounts || 'null'); if (Array.isArray(arr)) return arr } catch {}
    try { const old = JSON.parse(settings?.propFirm || 'null'); if (old && old.enabled) return [{ id: 'acc1', scope: 'shared', sizeScale: 1, ...old }] } catch {}
    return []
  }, [settings])
  async function savePropFirmAccounts(arr) { await saveSettings({ propFirmAccounts: JSON.stringify(arr) }) }

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
  const minImpact = settings?.eventsMinImpact || 'High'
  const watchedEvents = useMemo(
    () => events.filter((e) => (IMPACT_RANK[e.impact] || 0) >= (IMPACT_RANK[minImpact] || 3)),
    [events, minImpact]
  )
  const imminentEvent = useMemo(
    () => (eventsEnabled ? watchedEvents.find((e) => e.ts > now && e.ts - now <= ALERT_LEADS[0] * 60000) || null : null),
    [watchedEvents, now, eventsEnabled]
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
  // Fire a desktop notification at each of 30 / 15 / 5 minutes before a watched event.
  useEffect(() => {
    if (!eventsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const e of watchedEvents) {
      const mins = Math.round((e.ts - Date.now()) / 60000)
      if (mins <= 0 || mins > ALERT_LEADS[0]) continue
      const due = ALERT_LEADS.filter((L) => mins <= L && !firedRef.current.has(`${e.title}|${e.ts}|${L}`))
      if (!due.length) continue
      for (const L of due) firedRef.current.add(`${e.title}|${e.ts}|${L}`)
      try { new Notification('High-impact news', { body: `${e.country} ${e.title} · in ${Math.max(1, mins)} min` }) } catch {}
    }
  }, [now, watchedEvents, eventsEnabled])

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
    ['propfirm', 'Prop Firm', Building2],
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['psych', 'Psychology', Brain],
    ['rating', 'Rating', Gauge],
    ['goals', 'Goals', Target],
    ['reviews', 'Reviews', ClipboardList],
    ['coach', 'AI Coach', Bot],
    ['patterns', 'Patterns', ScanSearch],
    ['settings', 'Settings', SettingsIcon]
  ]

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: '100vh', borderTop: `3px solid ${tradeMode ? T.accent : 'transparent'}`, transition: 'background .3s' }}>
      <Ticker settings={settings} />
      {GATE_CONFIGURED && license?.state === 'trial' && <TrialBanner days={license.daysLeft} />}
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
        ) : GATE_CONFIGURED && license?.state === 'expired' ? (
          <Paywall onActivated={refreshLicense} />
        ) : (
          <>
            {tab === 'journal' && <Journal trades={trades} onAdd={addTrade} onUpdate={updateTrade} onRemove={removeTrade} onNotes={setNotesView} onImport={importTrades} accounts={propFirmAccounts} />}
            {tab === 'trade' && <TradeModeTab settings={settings} onSave={saveSettings} rules={rules} live={tradeMode} todayNet={todayNet} todayCount={todayTrades.length} weekNet={weekNet} goal={dailyGoal} maxLoss={maxLoss} onStart={startDay} onEnd={endSession} />}
            {tab === 'propfirm' && <PropFirm trades={trades} accounts={propFirmAccounts} onSave={savePropFirmAccounts} />}
            {tab === 'dashboard' && <Dashboard stats={stats} trades={trades} />}
            {tab === 'psych' && <Psychology stats={stats} />}
            {tab === 'rating' && <Rating trades={trades} stats={stats} achievements={achievements} unlockedAt={unlockedAt} />}
            {tab === 'goals' && <Goals goals={goals} onSave={saveGoals} trades={trades} />}
            {tab === 'reviews' && <Reviews trades={trades} reviews={reviews} onSave={saveReview} />}
            {tab === 'coach' && <Coach trades={trades} stats={stats} settings={settings} events={events} now={now} />}
            {tab === 'patterns' && <Patterns trades={trades} />}
            {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} license={license} onLicenseChange={refreshLicense} onReload={reloadAll} />}
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

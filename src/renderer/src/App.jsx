import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  LayoutDashboard, Brain, Target, Settings as SettingsIcon, Gauge, Play,
  Feather, Landmark, ScrollText, Radar, CalendarClock, AlertTriangle, X, Clock3
} from 'lucide-react'
import { Whistle, PlayDiagram, CrosshairCandle } from './components/Icons.jsx'
import { applyTheme, T, mono } from './theme.js'
import { fmt$, fmtN, parseRules, IMPACT_RANK, ALERT_LEADS, GATE_CONFIGURED, isNewerVersion, thisWeekKey } from './utils.js'
import { computeStats, computeAchievements } from './stats.js'
import { RELEASE_NOTES } from './releaseNotes.js'
import { Readout } from './components/Shared.jsx'
import { NotesModal } from './components/NotesModal.jsx'
import { WhatsNew } from './components/WhatsNew.jsx'
import { Journal } from './tabs/JournalTab.jsx'
import { Dashboard } from './tabs/DashboardTab.jsx'
import { Psychology } from './tabs/PsychologyTab.jsx'
import { Rating, AchievementToast } from './tabs/RatingTab.jsx'
import { Goals } from './tabs/GoalsTab.jsx'
import { Reviews } from './tabs/ReviewsTab.jsx'
import { Coach } from './tabs/CoachTab.jsx'
import { Patterns } from './tabs/PatternsTab.jsx'
import { PlaybookTab } from './tabs/PlaybookTab.jsx'
import { PropFirm } from './tabs/PropFirmTab.jsx'
import { TradeModeTab, Preflight, LiveBanner, Lockout } from './tabs/TradeModeTab.jsx'
import { TrialBanner, Paywall, SettingsTab } from './tabs/SettingsTab.jsx'
import { Ticker } from './widgets/Ticker.jsx'
import { EventBanner, FloatingEvents } from './widgets/EventBanner.jsx'
import { UpdateBanner } from './widgets/UpdateBanner.jsx'
import { UpdateAvailableBanner } from './widgets/UpdateAvailableBanner.jsx'
import { Backdrop } from './components/Backdrop.jsx'
import { CustomBackground } from './components/CustomBackground.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { DailyReport } from './components/DailyReport.jsx'
import { FeedbackPrompt } from './components/FeedbackPrompt.jsx'
import { EasterEggNudge } from './components/EasterEggNudge.jsx'
import { buildEasterEggNudges, lastTradingDay } from './coachInsights.js'
import { dHashDataUrl, IMAGE_FINGERPRINT_VERSION } from './workflow.js'
import { personalTradingClock } from './sessionClock.js'

/* ───────── logo mark: three ascending candles, tracks the live theme ───────── */
function LogoMark({ size = 22, ignite = false, live = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${ignite ? 'th-logo-ignite' : ''}${live ? ' th-logo-live' : ''}`}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill={T.accentSoft} stroke={T.accent} strokeOpacity="0.35" />
      <g className="th-logo-candle th-logo-candle-1">
        <line x1="6" y1="10" x2="6" y2="20" stroke={T.down} strokeWidth="1.2" />
        <rect x="4.6" y="12" width="2.8" height="5" rx="0.8" fill={T.down} />
      </g>
      <g className="th-logo-candle th-logo-candle-2">
        <line x1="12" y1="6" x2="12" y2="17" stroke={T.accent} strokeWidth="1.2" />
        <rect x="10.6" y="8" width="2.8" height="6" rx="0.8" fill={T.accent} />
      </g>
      <g className="th-logo-candle th-logo-candle-3">
        <line x1="18" y1="3" x2="18" y2="13" stroke={T.up} strokeWidth="1.2" />
        <rect x="16.6" y="4.5" width="2.8" height="6" rx="0.8" fill={T.up} />
      </g>
    </svg>
  )
}

function PersonalClockReadout({ clock }) {
  if (!clock) return null
  return (
    <div className="flex items-center gap-1.5" title={`Your usual session: ${clock.windowLabel}, inferred from ${clock.sampleDays} trading days`}>
      <Clock3 size={13} style={{ color: clock.phase === 'off' ? T.faint : T.accent }} />
      <span style={{ color: T.faint }}>CLOCK</span>
      <span style={{ color: T.text }}>{clock.timeLabel}</span>
      <span style={{ color: clock.phase === 'off' ? T.faint : T.accent }}>{clock.phaseShort}</span>
    </div>
  )
}

function SessionAmbience({ clock }) {
  if (!clock || clock.phase === 'off') return null
  return <div className={`th-session-ambience th-session-${clock.phase}`} aria-hidden="true" />
}

function GoTimeTransition() {
  return (
    <div className="th-go-mode-transition fixed inset-0 z-[70] pointer-events-none" aria-hidden="true">
      <div className="th-go-curtain" />
      <div className="th-go-lock">
        <span className="th-go-lock-icon"><LogoMark size={58} ignite /></span>
        <strong>TRADE MODE</strong>
        <span>FOCUS LOCKED</span>
      </div>
      <div className="th-go-scan" />
    </div>
  )
}

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
  const [goTransition, setGoTransition] = useState(null)
  const [checks, setChecks] = useState({})
  const [lockoutDismissed, setLockoutDismissed] = useState(false)
  const [events, setEvents] = useState([])
  const [now, setNow] = useState(Date.now())
  const firedRef = useRef(new Set())
  const [toastQueue, setToastQueue] = useState([])
  const toast = toastQueue[0] || null
  const announcedRef = useRef(new Set())
  const [whatsNew, setWhatsNew] = useState(null)
  const wnRef = useRef(false)
  const [updateReady, setUpdateReady] = useState(null)
  const [updateAvail, setUpdateAvail] = useState(null)
  const [onboard, setOnboard] = useState(false)
  const [dailyReport, setDailyReport] = useState(null)
  const drRef = useRef(false)
  const [feedbackPrompt, setFeedbackPrompt] = useState(false)
  const fbRef = useRef(false)
  const [nudge, setNudge] = useState(null)
  const nudgeRef = useRef(false)
  const [playbook, setPlaybook] = useState([])
  const [dayLogs, setDayLogs] = useState([])
  const [payouts, setPayouts] = useState([])
  const [tradePlans, setTradePlans] = useState([])
  const [commitments, setCommitments] = useState([])
  const [instrumentProfiles, setInstrumentProfiles] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const [planPrefill, setPlanPrefill] = useState(null)
  const [workflowMsg, setWorkflowMsg] = useState(null)
  const [customBg, setCustomBg] = useState('')
  const goTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(goTimerRef.current), [])

  const hasApi = typeof window !== 'undefined' && window.api
  const reportDay = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return lastTradingDay(trades, today)
  }, [trades])

  useEffect(() => {
    (async () => {
      if (!hasApi) { setReady(true); return }
      setTrades(await window.api.listTrades())
      setGoals(await window.api.getGoals())
      setReviews(await window.api.getReviews())
      setSettings(await window.api.getSettings())
      if (window.api.getLicense) setLicense(await window.api.getLicense())
      if (window.api.listPlaybook) setPlaybook(await window.api.listPlaybook())
      if (window.api.listDayLogs) setDayLogs(await window.api.listDayLogs())
      if (window.api.listPayouts) setPayouts(await window.api.listPayouts())
      if (window.api.listTradePlans) setTradePlans(await window.api.listTradePlans())
      if (window.api.listCommitments) setCommitments(await window.api.listCommitments())
      if (window.api.listInstrumentProfiles) setInstrumentProfiles(await window.api.listInstrumentProfiles())
      if (window.api.listSavedSearches) setSavedSearches(await window.api.listSavedSearches())
      setReady(true)
    })()
  }, [hasApi])

  // First-run wizard: fresh install only (no trades yet, never onboarded or skipped).
  // Evaluated once when loading finishes so importing trades mid-wizard can't re-trigger it.
  useEffect(() => {
    if (ready && hasApi && settings && trades.length === 0 && settings.onboarded !== 'true') setOnboard(true)
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // Daily report: once per app launch, surface a review of the last trading day.
  useEffect(() => {
    if (drRef.current || !ready || !hasApi || !settings || settings.dailyReportEnabled === 'false') return
    if (reportDay) { drRef.current = true; setDailyReport(reportDay) }
  }, [ready, hasApi, settings, reportDay])

  function closeDailyReport() {
    setDailyReport(null)
  }

  function openDailyReport() {
    if (reportDay) setDailyReport(reportDay)
  }

  // Feedback nudge: once ever, after the trader has journaled enough to have a real
  // opinion (20+ trades). Rendered only when nothing else is popped up.
  useEffect(() => {
    if (fbRef.current || !ready || !hasApi || !settings) return
    if (settings.feedbackPromptSeen || trades.length < 20) return
    fbRef.current = true
    setFeedbackPrompt(true)
  }, [ready, hasApi, settings, trades.length])

  function endFeedbackPrompt() {
    setFeedbackPrompt(false)
    saveSettings({ feedbackPromptSeen: 'done' })
  }
  function shareFeedback() {
    window.api?.openExternal?.('https://discord.gg/ATfcXSD4j')
    endFeedbackPrompt()
  }

  // Show "What's new" once after an auto-update bumps the version (not on a fresh install).
  useEffect(() => {
    if (wnRef.current || !hasApi || !settings || !window.api.appVersion) return
    wnRef.current = true
    ;(async () => {
      const v = await window.api.appVersion()
      const last = settings.lastSeenVersion
      if (last && last !== v) {
        const bundled = RELEASE_NOTES[v] || ''
        const r = bundled ? null : await window.api.releaseNotes().catch(() => null)
        setWhatsNew({ version: v, notes: bundled || r?.notes || '' })
      }
      if (last !== v) window.api.setSettings({ lastSeenVersion: v })
    })()
  }, [settings, hasApi])

  // electron-updater signals when a download is ready (Windows/Linux).
  useEffect(() => { window.api?.onUpdateReady?.((info) => setUpdateReady(info || {})) }, [])

  // GitHub API check for macOS only — unsigned mac builds can't auto-update, so they
  // get a top banner with a direct .dmg link. Windows/Linux use electron-updater
  // (auto-download + the bottom-left "Restart now" banner) instead.
  useEffect(() => {
    if (!hasApi || !window.api.latestVersion) return
    let live = true
    const check = async () => {
      try {
        const [cur, latest] = await Promise.all([window.api.appVersion(), window.api.latestVersion()])
        if (live && latest?.platform === 'darwin' && latest.version && isNewerVersion(latest.version, cur)) {
          setUpdateAvail({ ...latest, current: cur })
        }
      } catch {}
    }
    check()
    window.addEventListener('focus', check)
    return () => { live = false; window.removeEventListener('focus', check) }
  }, [hasApi])

  const stats = useMemo(() => computeStats(trades), [trades])
  const easterNudges = useMemo(() => buildEasterEggNudges(trades, stats), [trades, stats])

  async function refreshWorkflow() {
    if (!hasApi) return
    const [nextTrades, nextPlans, nextCommitments] = await Promise.all([
      window.api.listTrades(),
      window.api.listTradePlans ? window.api.listTradePlans() : Promise.resolve(tradePlans),
      window.api.listCommitments ? window.api.listCommitments() : Promise.resolve(commitments)
    ])
    setTrades(nextTrades); setTradePlans(nextPlans); setCommitments(nextCommitments)
  }
  async function withImageFingerprint(image) {
    if (!image?.dataUrl || (image.fingerprint && Number(image.fingerprintVersion) === IMAGE_FINGERPRINT_VERSION)) return image
    try {
      return { ...image, fingerprint: await dHashDataUrl(image.dataUrl), fingerprintVersion: IMAGE_FINGERPRINT_VERSION }
    } catch {
      return image
    }
  }
  async function addTrade(t, images = [], videoTokens = []) {
    if (!hasApi) return
    await window.api.addTrade(t)
    for (const im of images) {
      try { await window.api.addImage(t.id, await withImageFingerprint(im)) } catch { /* skip a bad image, keep the trade */ }
    }
    let videoErrors = []
    if (videoTokens.length && window.api.addPickedTradeVideos) {
      try {
        const result = await window.api.addPickedTradeVideos(t.id, videoTokens)
        videoErrors = Array.isArray(result?.errors) ? result.errors : []
      } catch {
        videoErrors = ['Screen recordings could not be attached.']
      }
    }
    await refreshWorkflow()
    return { videoErrors }
  }
  async function updateTrade(t, images = [], videoTokens = []) {
    if (!hasApi) return
    await window.api.updateTrade(t)
    for (const im of images) {
      try { await window.api.addImage(t.id, await withImageFingerprint(im)) } catch { /* skip a bad image, keep the trade update */ }
    }
    let videoErrors = []
    if (videoTokens.length && window.api.addPickedTradeVideos) {
      try {
        const result = await window.api.addPickedTradeVideos(t.id, videoTokens)
        videoErrors = Array.isArray(result?.errors) ? result.errors : []
      } catch {
        videoErrors = ['Screen recordings could not be attached.']
      }
    }
    await refreshWorkflow()
    return { videoErrors }
  }
  async function removeTrade(id) { if (hasApi) { await window.api.deleteTrade(id); await refreshWorkflow() } }
  async function importTrades(rows) { if (hasApi) { await window.api.importTrades(rows); await refreshWorkflow() } }
  async function reloadAll() {
    if (!hasApi) return
    const [nextTrades, nextGoals, nextReviews, nextSettings, nextPlans, nextCommitments, nextProfiles, nextSearches] = await Promise.all([
      window.api.listTrades(), window.api.getGoals(), window.api.getReviews(), window.api.getSettings(),
      window.api.listTradePlans ? window.api.listTradePlans() : [],
      window.api.listCommitments ? window.api.listCommitments() : [],
      window.api.listInstrumentProfiles ? window.api.listInstrumentProfiles() : [],
      window.api.listSavedSearches ? window.api.listSavedSearches() : []
    ])
    setTrades(nextTrades); setGoals(nextGoals); setReviews(nextReviews); setSettings(nextSettings)
    setTradePlans(nextPlans); setCommitments(nextCommitments); setInstrumentProfiles(nextProfiles); setSavedSearches(nextSearches)
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

  async function addPlaybookEntry(e) { if (hasApi && window.api.addPlaybookEntry) setPlaybook(await window.api.addPlaybookEntry(e)) }
  async function updatePlaybookEntry(e) { if (hasApi && window.api.updatePlaybookEntry) setPlaybook(await window.api.updatePlaybookEntry(e)) }
  async function deletePlaybookEntry(id) { if (hasApi && window.api.deletePlaybookEntry) setPlaybook(await window.api.deletePlaybookEntry(id)) }

  async function addDayLog(e) { if (hasApi && window.api.addDayLog) setDayLogs(await window.api.addDayLog(e)) }
  async function deleteDayLog(id) { if (hasApi && window.api.deleteDayLog) setDayLogs(await window.api.deleteDayLog(id)) }

  // Plan/commitment mutations can be rejected by the main process (an invalid state
  // transition, a linked trade that no longer exists, …). Surface the reason instead of
  // failing silently, and leave local state untouched when the write is rejected.
  async function runWorkflow(op, apply) {
    try { const next = await op(); if (next) apply(next); return true }
    catch (e) { setWorkflowMsg(e?.message || 'That action could not be completed.'); return false }
  }
  async function addTradePlan(plan) { if (hasApi && window.api.addTradePlan) await runWorkflow(() => window.api.addTradePlan(plan), setTradePlans) }
  async function updateTradePlan(plan) { if (hasApi && window.api.updateTradePlan) await runWorkflow(() => window.api.updateTradePlan(plan), setTradePlans) }
  async function deleteTradePlan(id) { if (hasApi && window.api.deleteTradePlan) await runWorkflow(() => window.api.deleteTradePlan(id), setTradePlans) }

  async function addCommitment(commitment) { if (hasApi && window.api.addCommitment) return runWorkflow(() => window.api.addCommitment(commitment), setCommitments); return false }
  async function updateCommitment(commitment) { if (hasApi && window.api.updateCommitment) await runWorkflow(() => window.api.updateCommitment(commitment), setCommitments) }
  async function deleteCommitment(id) { if (hasApi && window.api.deleteCommitment) await runWorkflow(() => window.api.deleteCommitment(id), setCommitments) }

  async function addInstrumentProfile(profile) { const next = await window.api.addInstrumentProfile(profile); setInstrumentProfiles(next); return next }
  async function updateInstrumentProfile(profile) { const next = await window.api.updateInstrumentProfile(profile); setInstrumentProfiles(next); return next }
  async function deleteInstrumentProfile(id) { const next = await window.api.deleteInstrumentProfile(id); setInstrumentProfiles(next); return next }
  async function addSavedSearch(search) { const next = await window.api.addSavedSearch(search); setSavedSearches(next); return next }
  async function updateSavedSearch(search) { const next = await window.api.updateSavedSearch(search); setSavedSearches(next); return next }
  async function deleteSavedSearch(id) { const next = await window.api.deleteSavedSearch(id); setSavedSearches(next); return next }
  async function refreshSavedSearches() { const next = await window.api.listSavedSearches(); setSavedSearches(next); return next }
  function planFromPlaybook(entry) { setPlanPrefill(entry); setTab('trade') }

  // Auto-dismiss the workflow error toast so it never lingers.
  useEffect(() => {
    if (!workflowMsg) return undefined
    const t = setTimeout(() => setWorkflowMsg(null), 6000)
    return () => clearTimeout(t)
  }, [workflowMsg])

  async function addPayout(e) { if (hasApi && window.api.addPayout) setPayouts(await window.api.addPayout(e)) }
  async function deletePayout(id) { if (hasApi && window.api.deletePayout) setPayouts(await window.api.deletePayout(id)) }

  function seenNudges() {
    try { const arr = JSON.parse(settings?.easterEggSeen || '[]'); if (Array.isArray(arr)) return arr } catch {}
    return []
  }
  async function dismissNudge(mark = true) {
    const cur = nudge
    setNudge(null)
    if (mark && cur) {
      const next = [...new Set([...seenNudges(), cur.id])].slice(-80)
      await saveSettings({ easterEggSeen: JSON.stringify(next) })
    }
  }
  async function takeNudgeBreak() {
    await saveSettings({ onBreak: 'true', breakSince: thisWeekKey() })
    await dismissNudge(true)
  }

  useEffect(() => {
    if (nudgeRef.current || !ready || !settings || settings.easterEggEnabled === 'false') return
    const seen = new Set(seenNudges())
    const next = easterNudges.find((x) => !seen.has(x.id))
    if (next) { nudgeRef.current = true; setNudge(next) }
  }, [ready, settings, easterNudges]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trade Mode derived state ──
  const rules = useMemo(() => parseRules(settings), [settings])
  const activeCommitment = useMemo(() => commitments.find((commitment) => commitment.status === 'active') || null, [commitments])
  const today = new Date().toISOString().slice(0, 10)
  const todayTrades = useMemo(() => trades.filter((t) => (t.timestamp || '').slice(0, 10) === today), [trades, today])
  const todayNet = todayTrades.reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const weekAgoTs = new Date(Date.now() - 7 * 864e5)
  const weekNet = trades.filter((t) => new Date((t.timestamp || '').replace(' ', 'T')) >= weekAgoTs).reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const dailyGoal = parseFloat(settings?.dailyGoal) || 0
  const maxLoss = parseFloat(settings?.maxDailyLoss) || 0
  const lossHit = maxLoss > 0 && todayNet <= -maxLoss
  const sessionClock = useMemo(() => personalTradingClock(trades, new Date(now)), [trades, now])

  function clearGoTimer() { clearTimeout(goTimerRef.current); goTimerRef.current = null }
  function startDay() {
    if (goTransition) return
    clearGoTimer()
    setChecks({})
    setLockoutDismissed(false)
    setGoTransition('arming')
    goTimerRef.current = setTimeout(() => { setGoTransition(null); setPreflight(true) }, 280)
  }
  function cancelPreflight() { clearGoTimer(); setGoTransition(null); setPreflight(false) }
  function goLive() {
    if (goTransition === 'launching') return
    clearGoTimer()
    setGoTransition('launching')
    goTimerRef.current = setTimeout(() => {
      setPreflight(false)
      setTradeMode(true)
      setGoTransition('live')
      goTimerRef.current = setTimeout(() => setGoTransition(null), 620)
    }, 150)
  }
  function endSession() { clearGoTimer(); setGoTransition(null); setTradeMode(false); setPreflight(false); setChecks({}); setLockoutDismissed(false) }

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
  const achievements = useMemo(() => computeAchievements(trades, stats, payouts, dayLogs, commitments), [trades, stats, payouts, dayLogs, commitments])
  const unlockedAt = useMemo(() => { try { return JSON.parse(settings?.achievements || '{}') } catch { return {} } }, [settings])
  useEffect(() => {
    if (!hasApi || !settings) return
    // announcedRef guards against re-announcing during the async settings write below.
    const newly = achievements.filter((a) => a.unlocked && !unlockedAt[a.id] && !announcedRef.current.has(a.id))
    if (!newly.length) return
    for (const a of newly) announcedRef.current.add(a.id)
    const merged = { ...unlockedAt }
    for (const a of newly) merged[a.id] = new Date().toISOString()
    window.api.setSettings({ achievements: JSON.stringify(merged) }).then(setSettings)
    setToastQueue((q) => [...q, ...newly])
  }, [achievements, unlockedAt, hasApi])
  // Each unlock gets ~4.8s in the spotlight, then the next queued medal slides in.
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToastQueue((q) => q.slice(1)), 4800); return () => clearTimeout(id) }, [toast])

  // Re-theme the entire app when live. Runs every render; App is the only writer of T.
  applyTheme(tradeMode, settings?.accentColor, settings?.themeMode, settings)
  // Expose live theme values to CSS (card hover borders, focus rings, scrollbars)
  // and keep the body backdrop in sync so overscroll doesn't flash the wrong color.
  useEffect(() => {
    document.documentElement.style.setProperty('--th-accent', T.accent)
    document.documentElement.style.setProperty('--th-line', T.line)
    document.documentElement.dataset.themePreset = settings?.themePreset || 'classic'
    document.body.style.background = T.bg
  }, [
    tradeMode,
    settings?.themePreset,
    settings?.accentColor,
    settings?.goTimeAccent,
    settings?.pnlStyle,
    settings?.fontStyle,
    settings?.themeMode
  ])

  useEffect(() => {
    let alive = true
    async function loadBackground() {
      if (!hasApi || !settings?.customBackgroundFile || !window.api.getBackground) {
        setCustomBg('')
        return
      }
      const res = await window.api.getBackground(settings.customBackgroundFile).catch(() => null)
      if (alive) setCustomBg(res?.ok ? res.dataUrl : '')
    }
    loadBackground()
    return () => { alive = false }
  }, [hasApi, settings?.customBackgroundFile])

  const TABS = [
    ['journal', 'Journal', Feather],
    ['trade', 'Trade Mode', CrosshairCandle],
    ['propfirm', 'Accounts', Landmark],
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['psych', 'Psychology', Brain],
    ['rating', 'Rating', Gauge],
    ['goals', 'Goals', Target],
    ['reviews', 'Reviews', ScrollText],
    ['coach', 'AI Coach', Whistle],
    ['patterns', 'Patterns', Radar],
    ['playbook', 'Playbook', PlayDiagram],
    ['settings', 'Settings', SettingsIcon]
  ]

  return (
    <div style={{ color: T.text, minHeight: '100vh', borderTop: `3px solid ${tradeMode ? T.accent : 'transparent'}` }}>
      {/* bg lives on <body> (synced above) so the z:-1 particle canvas shows through */}
      <CustomBackground dataUrl={customBg} settings={settings} />
      <Backdrop variant={!settings?.backdrop || settings.backdrop === 'on' ? 'constellation' : settings.backdrop} />
      <SessionAmbience clock={sessionClock} />
      <Ticker settings={settings} />
      {updateAvail && <UpdateAvailableBanner info={updateAvail} onClose={() => setUpdateAvail(null)} />}
      {GATE_CONFIGURED && license?.state === 'trial' && <TrialBanner days={license.daysLeft} />}
      {imminentEvent && <EventBanner event={imminentEvent} now={now} />}
      {tradeMode && <LiveBanner net={todayNet} goal={dailyGoal} maxLoss={maxLoss} lossHit={lossHit} onEnd={endSession} />}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <LogoMark live={tradeMode} />
            <span className="text-lg font-semibold tracking-tight" style={{ color: T.text }}>
              Trade<span style={{ color: T.accent }}>Help</span>
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: tradeMode ? T.accent : T.faint, border: `1px solid ${tradeMode ? T.accent : T.line}` }}>{tradeMode ? 'live' : 'offline'}</span>
          </div>
          <div className="flex items-center gap-5 text-sm" style={mono}>
            <Readout label="NET" value={fmt$(stats.totalPnl)} tone={stats.totalPnl >= 0 ? 'up' : 'down'} />
            <Readout label="WIN" value={`${fmtN(stats.winRate, 1)}%`} />
            <Readout label="PF" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} />
            <Readout label="STREAK" value={String(stats.currentStreak)} tone={String(stats.currentStreak).endsWith('W') ? 'up' : String(stats.currentStreak).endsWith('L') ? 'down' : 'none'} />
            {stats.n > 0 && <Readout label="CALM" value={String(stats.nonTiltStreak)} tone="up" />}
            <PersonalClockReadout clock={sessionClock} />
            {!tradeMode && (
              <button type="button" onClick={startDay} disabled={goTransition === 'arming'} aria-busy={goTransition === 'arming'} className={`th-go-trigger flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold${goTransition === 'arming' ? ' th-go-trigger-on' : ''}`} style={{ background: T.accent, color: '#1A1306' }}>
                <Play size={14} /> Start day
              </button>
            )}
            {reportDay && !dailyReport && !tradeMode && (settings?.dailyReportEnabled ?? 'true') !== 'false' && (
              <button type="button" onClick={openDailyReport} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
                <CalendarClock size={14} /> Review
              </button>
            )}
          </div>
        </header>

        <nav className="flex flex-wrap gap-1 mb-5">
          {TABS.map(([id, label, Icon]) => {
            const active = tab === id
            return (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`th-tab flex items-center gap-2 px-3 py-2 rounded-md text-sm${active ? ' th-tab-on' : ''}`}
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
          <div key={tab} className="th-cinematic">
            {tab === 'journal' && <Journal trades={trades} onAdd={addTrade} onUpdate={updateTrade} onRemove={removeTrade} onNotes={setNotesView} onImport={importTrades} accounts={propFirmAccounts} profiles={instrumentProfiles} savedSearches={savedSearches} onAddSavedSearch={addSavedSearch} onUpdateSavedSearch={updateSavedSearch} onDeleteSavedSearch={deleteSavedSearch} onRefreshSavedSearches={refreshSavedSearches} settings={settings} onSaveSettings={saveSettings} dayLogs={dayLogs} onAddDayLog={addDayLog} onDeleteDayLog={deleteDayLog} />}
            {tab === 'trade' && <TradeModeTab settings={settings} onSave={saveSettings} rules={rules} live={tradeMode} arming={goTransition === 'arming'} todayNet={todayNet} todayCount={todayTrades.length} weekNet={weekNet} goal={dailyGoal} maxLoss={maxLoss} onStart={startDay} onEnd={endSession} plans={tradePlans} trades={trades} accounts={propFirmAccounts} playbook={playbook} profiles={instrumentProfiles} planPrefill={planPrefill} onConsumePlanPrefill={() => setPlanPrefill(null)} commitment={activeCommitment} onAddPlan={addTradePlan} onUpdatePlan={updateTradePlan} onDeletePlan={deleteTradePlan} />}
            {tab === 'propfirm' && <PropFirm trades={trades} accounts={propFirmAccounts} onSave={savePropFirmAccounts} settings={settings} onSaveSettings={saveSettings} payouts={payouts} onAddPayout={addPayout} onDeletePayout={deletePayout} />}
            {tab === 'dashboard' && <Dashboard stats={stats} trades={trades} accounts={propFirmAccounts} settings={settings} journalData={{ reviews, playbook, dayLogs, goals }} payouts={payouts} plans={tradePlans} commitments={commitments} onAddCommitment={addCommitment} onUpdateCommitment={updateCommitment} onDeleteCommitment={deleteCommitment} onSaveSettings={saveSettings} onOpenCoach={() => setTab('coach')} onOpenTrade={setNotesView} />}
            {tab === 'psych' && <Psychology stats={stats} />}
            {tab === 'rating' && <Rating trades={trades} stats={stats} achievements={achievements} unlockedAt={unlockedAt} settings={settings} onSave={saveSettings} payouts={payouts} />}
            {tab === 'goals' && <Goals goals={goals} onSave={saveGoals} trades={trades} />}
            {tab === 'reviews' && <Reviews trades={trades} reviews={reviews} settings={settings} onSave={saveReview} activeCommitment={activeCommitment} onAddCommitment={addCommitment} />}
            {tab === 'coach' && <Coach trades={trades} stats={stats} settings={settings} reviews={reviews} playbook={playbook} dayLogs={dayLogs} goals={goals} payouts={payouts} events={events} now={now} />}
            {tab === 'patterns' && <Patterns trades={trades} onOpenTrade={setNotesView} />}
            {tab === 'playbook' && <PlaybookTab entries={playbook} trades={trades} onAdd={addPlaybookEntry} onUpdate={updatePlaybookEntry} onDelete={deletePlaybookEntry} onPlan={planFromPlaybook} />}
            {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} license={license} onLicenseChange={refreshLicense} onReload={reloadAll} profiles={instrumentProfiles} onAddProfile={addInstrumentProfile} onUpdateProfile={updateInstrumentProfile} onDeleteProfile={deleteInstrumentProfile} />}
          </div>
        )}
      </div>

      {notesView && <NotesModal trade={notesView} onClose={() => setNotesView(null)} onUpdate={updateTrade} onAttachmentsChange={refreshWorkflow} />}
      {preflight && (
        <Preflight rules={rules} checks={checks} setChecks={setChecks}
          snapshot={{ todayNet, todayCount: todayTrades.length, weekNet }}
          goal={dailyGoal} maxLoss={maxLoss} imminent={imminentEvent} now={now} commitment={activeCommitment}
          launching={goTransition === 'launching'} onCancel={cancelPreflight} onGoLive={goLive} />
      )}
      {goTransition === 'live' && <GoTimeTransition />}
      {tradeMode && lossHit && !lockoutDismissed && (
        <Lockout net={todayNet} maxLoss={maxLoss} onEnd={endSession} onDismiss={() => setLockoutDismissed(true)} />
      )}
      {tradeMode && eventsEnabled && <FloatingEvents events={events} now={now} leadMin={parseInt(settings?.eventsLeadMin) || 15} />}
      {toast && <AchievementToast key={toast.id} a={toast} onClose={() => setToastQueue((q) => q.slice(1))} />}
      {workflowMsg && (
        <div className="fixed left-1/2 z-[95]" style={{ bottom: 24, transform: 'translateX(-50%)' }}>
          <div className="flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm th-fade" style={{ background: T.surface, border: `1px solid ${T.down}`, color: T.text, maxWidth: 440, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            <AlertTriangle size={16} style={{ color: T.down, flexShrink: 0, marginTop: 1 }} />
            <span className="flex-1">{workflowMsg}</span>
            <button type="button" onClick={() => setWorkflowMsg(null)} style={{ color: T.faint }} aria-label="Dismiss"><X size={15} /></button>
          </div>
        </div>
      )}
      {updateReady && <UpdateBanner info={updateReady} onInstall={() => window.api.installUpdate()} />}
      {whatsNew && <WhatsNew info={whatsNew} onClose={() => setWhatsNew(null)} />}
      {nudge && !dailyReport && !onboard && !tradeMode && (!GATE_CONFIGURED || license?.state !== 'expired') && (
        <EasterEggNudge nudge={nudge} onClose={() => dismissNudge(true)} onBreak={takeNudgeBreak} />
      )}
      {onboard && ready && hasApi && (!GATE_CONFIGURED || license?.state !== 'expired') && (
        <Onboarding settings={settings} accounts={propFirmAccounts} onSaveSettings={saveSettings} onImport={importTrades}
          onDone={(goTab) => { setOnboard(false); saveSettings({ onboarded: 'true' }); if (goTab) setTab(goTab) }} />
      )}
      {dailyReport && !onboard && !tradeMode && (!GATE_CONFIGURED || license?.state !== 'expired') && (
        <DailyReport trades={trades} date={dailyReport} settings={settings}
          onClose={closeDailyReport} onOpenCoach={() => { closeDailyReport(); setTab('coach') }} />
      )}
      {feedbackPrompt && !dailyReport && !onboard && !nudge && !tradeMode && (!GATE_CONFIGURED || license?.state !== 'expired') && (
        <FeedbackPrompt onShare={shareFeedback} onDismiss={endFeedbackPrompt} />
      )}
    </div>
  )
}

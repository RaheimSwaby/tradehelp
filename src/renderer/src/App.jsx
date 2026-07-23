import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  LayoutDashboard, Brain, Target, Settings as SettingsIcon, Gauge, Play,
  Feather, Landmark, ScrollText, Radar, CalendarClock, AlertTriangle, X, Clock3, TrendingUp
} from 'lucide-react'
import { Whistle, PlayDiagram, CrosshairCandle } from './components/Icons.jsx'
import { applyTheme, T, mono } from './theme.js'
import { fmt$, fmtN, parseRules, IMPACT_RANK, ALERT_LEADS, GATE_CONFIGURED, isNewerVersion, thisWeekKey } from './utils.js'
import { computeStats, computeAchievements } from './stats.js'
import { RELEASE_NOTES } from './releaseNotes.js'
import { Readout } from './components/Shared.jsx'
import { PageAnimationContext } from './pageAnimation.js'
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
import { TradeModeTab, Preflight, LiveBanner, SessionEndReview, Lockout } from './tabs/TradeModeTab.jsx'
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
import { formatClockMinute, localDateKey, inferTradingSchedule, manualTradingSchedule, personalTradingClock, sessionEdgeCue } from './sessionClock.js'
import { selectFloatingNotice } from './notificationQueue.js'
import { tradeDateKey } from './periodRetrospective.js'
import { startSessionRecorder } from './sessionRecorder.js'

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

function PersonalClockReadout({ clock, schedule, enabled = true }) {
  if (!enabled) return null
  const confidence = schedule?.metadata?.confidence
  if (!clock) {
    if (!confidence) return null
    return (
      <div className="flex items-center gap-1.5" title={confidence.message || 'Learning your recurring trading windows'}>
        <Clock3 size={13} style={{ color: T.faint }} />
        <span style={{ color: T.faint }}>CLOCK</span>
        <span style={{ color: T.faint }}>{confidence.state === 'building' ? `LEARNING ${confidence.observedDays}/${confidence.requiredDays || 3}` : 'NO WINDOW'}</span>
      </div>
    )
  }
  const allWindows = (schedule?.windows || clock.windows || []).map((window) => `${formatClockMinute(window.start)}–${formatClockMinute(window.end)}`).join(', ')
  const sessionCount = schedule?.metadata?.historySessionCount || schedule?.metadata?.sessionCount || clock.sampleSessions || 0
  const title = `${schedule?.source === 'manual' ? 'Manual' : 'Recent inferred'} windows: ${allWindows || clock.windowLabel}. Based on ${sessionCount} session${sessionCount === 1 ? '' : 's'}.${schedule?.scheduleShift?.message ? ` ${schedule.scheduleShift.message}` : ''}`
  return (
    <div className="flex items-center gap-1.5" title={title}>
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

// Floating nudge when the trader is entering (or in) one of their historically strong or
// weak hours — the payoff of the session clock crossed with their heat-map hour data.
function SessionEdgeBubble({ cue, onClose }) {
  if (!cue) return null
  const strong = cue.tone === 'strong'
  const c = strong ? T.up : T.down
  const Icon = strong ? TrendingUp : AlertTriangle
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 left-4 z-[74] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl th-fade" style={{ background: T.surface, border: `1px solid ${c}`, boxShadow: '0 12px 30px rgba(0,0,0,0.42)' }}>
      <div className="p-3.5 flex items-start gap-2.5">
        <Icon size={16} style={{ color: c, flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: c }}>Session clock · {cue.range}</div>
          <div className="text-sm font-semibold mt-0.5">{cue.headline}</div>
          <div className="text-xs mt-1" style={{ color: T.dim }}>{cue.detail}</div>
        </div>
        <button type="button" onClick={onClose} style={{ color: T.faint }} aria-label="Dismiss"><X size={15} /></button>
      </div>
    </div>
  )
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
  const [pnlFeedback, setPnlFeedback] = useState(null)
  const [demoPnlTotal, setDemoPnlTotal] = useState(null)
  const [pageAnimationReplay, setPageAnimationReplay] = useState(0)
  const [journalDrilldown, setJournalDrilldown] = useState(null)
  const [tradingSessions, setTradingSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [sessionReview, setSessionReview] = useState(null)
  const [recordingEnabled, setRecordingEnabled] = useState(true)
  const [captureSources, setCaptureSources] = useState([])
  const [selectedCaptureSource, setSelectedCaptureSource] = useState(null)
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureError, setCaptureError] = useState('')
  const [recordingState, setRecordingState] = useState({ status: 'off', error: '' })
  const [sessionTick, setSessionTick] = useState(Date.now())
  const goTimerRef = useRef(null)
  const sessionRecorderRef = useRef(null)
  const pnlFeedbackTimerRef = useRef(null)
  const pnlDemoTimerRef = useRef(null)

  useEffect(() => () => {
    clearTimeout(goTimerRef.current)
    clearTimeout(pnlFeedbackTimerRef.current)
    clearTimeout(pnlDemoTimerRef.current)
    sessionRecorderRef.current?.stopTracks?.()
  }, [])

  useEffect(() => {
    if (!tradeMode || !activeSession) return undefined
    setSessionTick(Date.now())
    const timer = setInterval(() => setSessionTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [tradeMode, activeSession])

  const hasApi = typeof window !== 'undefined' && window.api
  const reportDay = useMemo(() => {
    const today = localDateKey(new Date(now))
    return lastTradingDay(trades, today)
  }, [trades, now])

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
      if (window.api.listTradingSessions) setTradingSessions(await window.api.listTradingSessions())
      setReady(true)
    })()
  }, [hasApi])

  useEffect(() => {
    if (!hasApi || !window.api.onImportsChanged) return undefined
    return window.api.onImportsChanged((event) => {
      if (event?.type === 'auto-imported' || event?.type === 'rolled-back') refreshWorkflow()
    })
  }, [hasApi]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!hasApi) return []
    const [nextTrades, nextPlans, nextCommitments] = await Promise.all([
      window.api.listTrades(),
      window.api.listTradePlans ? window.api.listTradePlans() : Promise.resolve(tradePlans),
      window.api.listCommitments ? window.api.listCommitments() : Promise.resolve(commitments)
    ])
    setTrades(nextTrades); setTradePlans(nextPlans); setCommitments(nextCommitments)
    return nextTrades
  }
  async function withImageFingerprint(image) {
    if (!image?.dataUrl || (image.fingerprint && Number(image.fingerprintVersion) === IMAGE_FINGERPRINT_VERSION)) return image
    try {
      return { ...image, fingerprint: await dHashDataUrl(image.dataUrl), fingerprintVersion: IMAGE_FINGERPRINT_VERSION }
    } catch {
      return image
    }
  }
  function showPnlFeedback(from, to, id = 'pnl') {
    const delta = Number(to) - Number(from)
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return
    clearTimeout(pnlFeedbackTimerRef.current)
    setPnlFeedback({ id: `${id}-${Date.now()}`, from: Number(from), to: Number(to), delta })
    pnlFeedbackTimerRef.current = setTimeout(() => setPnlFeedback(null), 2600)
  }
  function demoPnlCount() {
    const from = stats.totalPnl
    const to = from + 125
    clearTimeout(pnlDemoTimerRef.current)
    setDemoPnlTotal(to)
    showPnlFeedback(from, to, 'dev-demo')
    pnlDemoTimerRef.current = setTimeout(() => {
      setDemoPnlTotal(null)
      showPnlFeedback(to, from, 'dev-demo-reset')
    }, 2800)
  }
  function demoPageCounts() {
    setTab('dashboard')
    setPageAnimationReplay((value) => value + 1)
  }
  async function addTrade(t, images = [], videoTokens = []) {
    if (!hasApi) return
    const previousTotal = stats.totalPnl
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
    const nextTrades = await refreshWorkflow()
    const nextTotal = nextTrades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0)
    showPnlFeedback(previousTotal, nextTotal, t.id || 'trade')
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
  async function importTrades(rows, meta = {}) { if (hasApi) { const result = await window.api.importTrades(rows, meta); await refreshWorkflow(); return result } }
  async function rollbackImport(id) { if (hasApi) { const result = await window.api.rollbackImportBatch(id); await refreshWorkflow(); return result } }
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
  function openTimingJournal(intent) {
    setJournalDrilldown({ ...intent, id: `timing-${Date.now()}-${Math.random().toString(16).slice(2)}` })
    setTab('journal')
  }

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
  const today = localDateKey(new Date(now))
  const todayTrades = useMemo(() => trades.filter((t) => tradeDateKey(t) === today), [trades, today])
  const todayNet = todayTrades.reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const weekAgoTs = new Date(now - 7 * 864e5)
  const weekNet = trades.filter((t) => {
    const raw = t.entryTime || t.timestamp
    const tradeTime = raw instanceof Date ? raw : new Date(String(raw || '').replace(' ', 'T'))
    return !Number.isNaN(tradeTime.getTime()) && tradeTime >= weekAgoTs
  }).reduce((a, t) => a + (Number(t.pnl) || 0), 0)
  const dailyGoal = parseFloat(settings?.dailyGoal) || 0
  const maxLoss = parseFloat(settings?.maxDailyLoss) || 0
  const lossHit = maxLoss > 0 && todayNet <= -maxLoss
  const sessionElapsed = activeSession ? Math.max(0, sessionTick - new Date(activeSession.startedAt).getTime()) : 0
  const personalClockAlerts = settings?.personalClockAlerts !== 'false'
  const personalClockAmbience = settings?.personalClockAmbience !== 'false'
  const personalClockEnabled = personalClockAlerts || personalClockAmbience
  // Window inference is cached on trade/settings changes. The 30-second timer only
  // advances the phase through the already-computed schedule.
  const personalSchedule = useMemo(() => {
    if (settings?.personalClockSource === 'manual') return manualTradingSchedule(settings?.personalClockManualWindows)
    return inferTradingSchedule(trades)
  }, [trades, settings?.personalClockSource, settings?.personalClockManualWindows])
  const sessionClock = useMemo(
    () => personalClockEnabled ? personalTradingClock([], new Date(now), personalSchedule) : null,
    [personalClockEnabled, personalSchedule, now]
  )
  const [sessionCue, setSessionCue] = useState(null)
  const sessionCueSeen = useRef('')
  // Surface a strong/weak-hour nudge at most once per relevant hour per day, while in-session.
  useEffect(() => {
    if (!personalClockAlerts || !sessionClock || sessionClock.phase === 'off') { setSessionCue(null); return }
    const cue = sessionEdgeCue(stats, new Date(now))
    if (!cue) return
    const key = `${localDateKey(new Date(now))}:${cue.hour}`
    if (sessionCueSeen.current === key) return
    sessionCueSeen.current = key
    setSessionCue(cue)
  }, [now, sessionClock, stats, personalClockAlerts])

  function clearGoTimer() { clearTimeout(goTimerRef.current); goTimerRef.current = null }
  async function loadCaptureSources() {
    if (!window.api?.listCaptureSources) return
    setCaptureLoading(true)
    setCaptureError('')
    try {
      const sources = await window.api.listCaptureSources()
      setCaptureSources(Array.isArray(sources) ? sources : [])
      setSelectedCaptureSource((current) => sources.find((source) => source.id === current?.id) || sources.find((source) => source.kind === 'screen') || sources[0] || null)
      if (!sources.length) setCaptureError('No screens or windows were available. You can still start without recording.')
    } catch (error) {
      setCaptureSources([])
      setSelectedCaptureSource(null)
      setCaptureError(error?.message || 'Capture choices could not be loaded.')
    } finally {
      setCaptureLoading(false)
    }
  }
  function startDay() {
    if (goTransition) return
    clearGoTimer()
    setChecks({})
    setLockoutDismissed(false)
    setRecordingState({ status: 'off', error: '' })
    loadCaptureSources()
    setGoTransition('arming')
    goTimerRef.current = setTimeout(() => { setGoTransition(null); setPreflight(true) }, 360)
  }
  function cancelPreflight() { clearGoTimer(); setGoTransition(null); setPreflight(false) }
  async function goLive() {
    if (goTransition === 'launching') return
    clearGoTimer()
    setGoTransition('launching')
    let session
    try {
      session = await window.api.createTradingSession({
        recordingRequested: recordingEnabled,
        sourceId: recordingEnabled ? selectedCaptureSource?.id : '',
        sourceLabel: recordingEnabled ? selectedCaptureSource?.name : ''
      })
      setActiveSession(session)
      setSessionTick(Date.now())
      if (recordingEnabled && selectedCaptureSource) {
        try {
          sessionRecorderRef.current = await startSessionRecorder({
            sessionId: session.id,
            sourceId: selectedCaptureSource.id,
            onState: (state) => setRecordingState((current) => ({ ...current, ...state }))
          })
          setRecordingState({ status: 'recording', error: '' })
        } catch (error) {
          setRecordingState({ status: 'failed', error: error?.message || 'Screen recording could not start.' })
          try { session = await window.api.discardTradingSessionRecording(session.id); setActiveSession(session) } catch {}
        }
      } else {
        setRecordingState({ status: 'off', error: '' })
      }
    } catch (error) {
      setGoTransition(null)
      setWorkflowMsg(error?.message || 'The trading session could not be started.')
      return
    }
    goTimerRef.current = setTimeout(() => {
      setPreflight(false)
      setTradeMode(true)
      setGoTransition('live')
      goTimerRef.current = setTimeout(() => setGoTransition(null), 760)
    }, 150)
  }
  async function endSession() {
    clearGoTimer()
    setGoTransition(null)
    let nextSession = activeSession
    if (sessionRecorderRef.current) {
      setRecordingState((current) => ({ ...current, status: 'stopping' }))
      try {
        nextSession = await sessionRecorderRef.current.stop()
        setRecordingState({ status: 'ready', error: '' })
      } catch (error) {
        setRecordingState({ status: 'failed', error: error?.message || 'The recording could not be finalized.' })
      } finally {
        sessionRecorderRef.current = null
      }
    }
    if (nextSession?.id) {
      try { nextSession = await window.api.finishTradingSession(nextSession.id, { endedAt: new Date().toISOString(), notes: '' }) } catch {}
      setSessionReview(nextSession)
    }
    setTradeMode(false)
    setPreflight(false)
    setChecks({})
    setLockoutDismissed(false)
  }
  async function saveSessionReview(notes) {
    if (!sessionReview?.id) return
    const saved = await window.api.finishTradingSession(sessionReview.id, { endedAt: sessionReview.endedAt, notes })
    setTradingSessions(await window.api.listTradingSessions())
    setSessionReview(null)
    setActiveSession(null)
    setRecordingState({ status: 'off', error: '' })
    return saved
  }
  async function discardSessionRecording() {
    if (!sessionReview?.id) return
    const updated = await window.api.discardTradingSessionRecording(sessionReview.id)
    setSessionReview(updated)
  }

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
  const floatingBlocked = Boolean(
    onboard || tradeMode || notesView || preflight || whatsNew || goTransition ||
    (GATE_CONFIGURED && license?.state === 'expired')
  )
  const activeFloatingNotice = selectFloatingNotice({
    risk: Boolean(workflowMsg || imminentEvent || (tradeMode && lossHit && !lockoutDismissed)),
    update: Boolean(updateReady),
    dailyReview: Boolean(dailyReport),
    timing: Boolean(sessionCue && personalClockAlerts),
    achievement: Boolean(toast),
    nudge: Boolean(nudge),
    feedback: Boolean(feedbackPrompt),
    blocked: floatingBlocked
  })
  // Timed notices age only while visible; queued notices wait behind higher priority.
  useEffect(() => {
    if (activeFloatingNotice !== 'achievement' || !toast) return undefined
    const id = setTimeout(() => setToastQueue((q) => q.slice(1)), 4800)
    return () => clearTimeout(id)
  }, [activeFloatingNotice, toast])
  useEffect(() => {
    if (activeFloatingNotice !== 'timing' || !sessionCue) return undefined
    const id = setTimeout(() => setSessionCue(null), 90000)
    return () => clearTimeout(id)
  }, [activeFloatingNotice, sessionCue])

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
      {personalClockAmbience && <SessionAmbience clock={sessionClock} />}
      <Ticker settings={settings} />
      {updateAvail && <UpdateAvailableBanner info={updateAvail} onClose={() => setUpdateAvail(null)} />}
      {GATE_CONFIGURED && license?.state === 'trial' && <TrialBanner days={license.daysLeft} />}
      {imminentEvent && <EventBanner event={imminentEvent} now={now} />}
      {tradeMode && <LiveBanner net={todayNet} goal={dailyGoal} maxLoss={maxLoss} lossHit={lossHit} recordingState={recordingState} elapsed={sessionElapsed} onEnd={endSession} />}
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
            <Readout label="NET" value={fmt$(demoPnlTotal ?? stats.totalPnl)} tone={(demoPnlTotal ?? stats.totalPnl) >= 0 ? 'up' : 'down'} feedback={pnlFeedback} />
            {import.meta.env.DEV && (
              <>
                <button type="button" onClick={demoPnlCount} className="px-2 py-1 rounded text-[10px] font-semibold" title="Preview the P&L count animation without saving a trade" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>
                  Demo +$125
                </button>
                <button type="button" onClick={demoPageCounts} className="px-2 py-1 rounded text-[10px] font-semibold" title="Open Dashboard and replay its page-entry count-up animations" style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>
                  Demo page counts
                </button>
              </>
            )}
            <Readout label="WIN" value={`${fmtN(stats.winRate, 1)}%`} />
            <Readout label="PF" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} />
            <Readout label="STREAK" value={String(stats.currentStreak)} tone={String(stats.currentStreak).endsWith('W') ? 'up' : String(stats.currentStreak).endsWith('L') ? 'down' : 'none'} />
            {stats.n > 0 && <Readout label="CALM" value={String(stats.nonTiltStreak)} tone="up" />}
            <PersonalClockReadout clock={sessionClock} schedule={personalSchedule} enabled={personalClockEnabled} />
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
          <PageAnimationContext.Provider value={`${tab}-${pageAnimationReplay}`}>
          <div key={tab} className="th-cinematic">
            {tab === 'journal' && <Journal trades={trades} onAdd={addTrade} onUpdate={updateTrade} onRemove={removeTrade} onNotes={setNotesView} onImport={importTrades} onRollbackImport={rollbackImport} accounts={propFirmAccounts} profiles={instrumentProfiles} savedSearches={savedSearches} onAddSavedSearch={addSavedSearch} onUpdateSavedSearch={updateSavedSearch} onDeleteSavedSearch={deleteSavedSearch} onRefreshSavedSearches={refreshSavedSearches} settings={settings} onSaveSettings={saveSettings} dayLogs={dayLogs} onAddDayLog={addDayLog} onDeleteDayLog={deleteDayLog} drilldown={journalDrilldown} onConsumeDrilldown={() => setJournalDrilldown(null)} />}
            {tab === 'trade' && <TradeModeTab settings={settings} onSave={saveSettings} rules={rules} live={tradeMode} arming={goTransition === 'arming'} todayNet={todayNet} todayCount={todayTrades.length} weekNet={weekNet} goal={dailyGoal} maxLoss={maxLoss} onStart={startDay} onEnd={endSession} session={activeSession} recordingState={recordingState} elapsed={sessionElapsed} sessions={tradingSessions} plans={tradePlans} trades={trades} accounts={propFirmAccounts} playbook={playbook} profiles={instrumentProfiles} planPrefill={planPrefill} onConsumePlanPrefill={() => setPlanPrefill(null)} commitment={activeCommitment} onAddPlan={addTradePlan} onUpdatePlan={updateTradePlan} onDeletePlan={deleteTradePlan} />}
            {tab === 'propfirm' && <PropFirm trades={trades} accounts={propFirmAccounts} onSave={savePropFirmAccounts} settings={settings} onSaveSettings={saveSettings} payouts={payouts} onAddPayout={addPayout} onDeletePayout={deletePayout} />}
            {tab === 'dashboard' && <Dashboard stats={stats} trades={trades} accounts={propFirmAccounts} settings={settings} journalData={{ reviews, playbook, dayLogs, goals, payouts }} payouts={payouts} plans={tradePlans} commitments={commitments} pnlFeedback={pnlFeedback} onAddCommitment={addCommitment} onUpdateCommitment={updateCommitment} onDeleteCommitment={deleteCommitment} onSaveSettings={saveSettings} onOpenCoach={() => setTab('coach')} onOpenTrade={setNotesView} onTimingDrilldown={openTimingJournal} personalClock={sessionClock} personalSchedule={personalSchedule} now={now} />}
            {tab === 'psych' && <Psychology stats={stats} />}
            {tab === 'rating' && <Rating trades={trades} stats={stats} achievements={achievements} unlockedAt={unlockedAt} settings={settings} onSave={saveSettings} payouts={payouts} />}
            {tab === 'goals' && <Goals goals={goals} onSave={saveGoals} trades={trades} now={now} />}
            {tab === 'reviews' && <Reviews trades={trades} reviews={reviews} goals={goals} commitments={commitments} settings={settings} onSave={saveReview} activeCommitment={activeCommitment} onAddCommitment={addCommitment} now={now} />}
            {tab === 'coach' && <Coach trades={trades} stats={stats} settings={settings} reviews={reviews} playbook={playbook} dayLogs={dayLogs} goals={goals} payouts={payouts} events={events} now={now} />}
            {tab === 'patterns' && <Patterns trades={trades} onOpenTrade={setNotesView} />}
            {tab === 'playbook' && <PlaybookTab entries={playbook} trades={trades} onAdd={addPlaybookEntry} onUpdate={updatePlaybookEntry} onDelete={deletePlaybookEntry} onPlan={planFromPlaybook} />}
            {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} license={license} onLicenseChange={refreshLicense} onReload={reloadAll} profiles={instrumentProfiles} onAddProfile={addInstrumentProfile} onUpdateProfile={updateInstrumentProfile} onDeleteProfile={deleteInstrumentProfile} />}
          </div>
          </PageAnimationContext.Provider>
        )}
      </div>

      {notesView && <NotesModal trade={notesView} onClose={() => setNotesView(null)} onUpdate={updateTrade} onAttachmentsChange={refreshWorkflow} />}
      {preflight && (
        <Preflight rules={rules} checks={checks} setChecks={setChecks}
          snapshot={{ todayNet, todayCount: todayTrades.length, weekNet }}
          goal={dailyGoal} maxLoss={maxLoss} imminent={imminentEvent} now={now} commitment={activeCommitment}
          launching={goTransition === 'launching'} recordingEnabled={recordingEnabled} setRecordingEnabled={setRecordingEnabled}
          captureSources={captureSources} selectedSource={selectedCaptureSource} setSelectedSource={setSelectedCaptureSource}
          captureLoading={captureLoading} captureError={captureError} onRefreshSources={loadCaptureSources}
          onCancel={cancelPreflight} onGoLive={goLive} />
      )}
      {sessionReview && <SessionEndReview session={sessionReview} recordingState={recordingState} onSave={saveSessionReview} onDiscardRecording={discardSessionRecording} />}
      {goTransition === 'live' && <GoTimeTransition />}
      {tradeMode && lossHit && !lockoutDismissed && (
        <Lockout net={todayNet} maxLoss={maxLoss} onEnd={endSession} onDismiss={() => setLockoutDismissed(true)} />
      )}
      {tradeMode && eventsEnabled && <FloatingEvents events={events} now={now} leadMin={parseInt(settings?.eventsLeadMin) || 15} />}
      {activeFloatingNotice === 'achievement' && toast && <AchievementToast key={toast.id} a={toast} onClose={() => setToastQueue((q) => q.slice(1))} />}
      {workflowMsg && (
        <div className="fixed left-1/2 z-[95]" style={{ bottom: 24, transform: 'translateX(-50%)' }}>
          <div className="flex items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm th-fade" style={{ background: T.surface, border: `1px solid ${T.down}`, color: T.text, maxWidth: 440, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            <AlertTriangle size={16} style={{ color: T.down, flexShrink: 0, marginTop: 1 }} />
            <span className="flex-1">{workflowMsg}</span>
            <button type="button" onClick={() => setWorkflowMsg(null)} style={{ color: T.faint }} aria-label="Dismiss"><X size={15} /></button>
          </div>
        </div>
      )}
      {activeFloatingNotice === 'update' && updateReady && <UpdateBanner info={updateReady} onInstall={() => window.api.installUpdate()} />}
      {whatsNew && <WhatsNew info={whatsNew} onClose={() => setWhatsNew(null)} />}
      {activeFloatingNotice === 'nudge' && nudge && (
        <EasterEggNudge nudge={nudge} onClose={() => dismissNudge(true)} onBreak={takeNudgeBreak} />
      )}
      {onboard && ready && hasApi && (!GATE_CONFIGURED || license?.state !== 'expired') && (
        <Onboarding settings={settings} accounts={propFirmAccounts} onSaveSettings={saveSettings} onImport={importTrades}
          onDone={(goTab) => { setOnboard(false); saveSettings({ onboarded: 'true' }); if (goTab) setTab(goTab) }} />
      )}
      {activeFloatingNotice === 'daily-review' && dailyReport && (
        <DailyReport trades={trades} date={dailyReport} settings={settings}
          onClose={closeDailyReport} onOpenCoach={() => { closeDailyReport(); setTab('coach') }} />
      )}
      {activeFloatingNotice === 'feedback' && feedbackPrompt && (
        <FeedbackPrompt onShare={shareFeedback} onDismiss={endFeedbackPrompt} />
      )}
      {activeFloatingNotice === 'timing' && sessionCue && (
        <SessionEdgeBubble cue={sessionCue} onClose={() => setSessionCue(null)} />
      )}
    </div>
  )
}

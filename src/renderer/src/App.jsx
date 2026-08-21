import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Settings as SettingsIcon, Gauge, Play,
  CalendarClock, AlertTriangle, X, Clock3, TrendingUp, HelpCircle,
  Waypoints, Wallet, Armchair, Flag, Megaphone, History, Shapes, LineChart, GraduationCap, PenLine, RefreshCw
} from 'lucide-react'
import { applyTheme, T, mono } from './theme.js'
import { fmt$, fmtN, parseRules, IMPACT_RANK, ALERT_LEADS, GATE_CONFIGURED, isNewerVersion, thisWeekKey } from './utils.js'
import { computeStats, computeAchievements, computeLeaks } from './stats.js'
import { RELEASE_NOTES } from './releaseNotes.js'
import { PageAnimationContext } from './pageAnimation.js'
import { Readout } from './components/Shared.jsx'
import { NotesModal } from './components/NotesModal.jsx'
import { WhatsNew } from './components/WhatsNew.jsx'
import { Journal } from './tabs/JournalTab.jsx'
import { ChartTab } from './tabs/ChartTab.jsx'
import { Dashboard } from './tabs/DashboardTab.jsx'
import { Psychology } from './tabs/PsychologyTab.jsx'
import { Rating, AchievementToast } from './tabs/RatingTab.jsx'
import { Goals } from './tabs/GoalsTab.jsx'
import { Reviews } from './tabs/ReviewsTab.jsx'
import { Coach } from './tabs/CoachTab.jsx'
import { Patterns } from './tabs/PatternsTab.jsx'
import { PlaybookTab } from './tabs/PlaybookTab.jsx'
import { NewsTab } from './tabs/NewsTab.jsx'
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
import { WeeklyWrapModal } from './components/WeeklyWrap.jsx'
import { FeedbackPrompt } from './components/FeedbackPrompt.jsx'
import { HelpModal } from './components/HelpModal.jsx'
import { EasterEggNudge } from './components/EasterEggNudge.jsx'
import { PrivateBriefingBubble } from './components/PrivateBriefingBubble.jsx'
import { buildEasterEggNudges, lastTradingDay } from './coachInsights.js'
import { dHashDataUrl, IMAGE_FINGERPRINT_VERSION } from './workflow.js'
import { formatClockMinute, localDateKey, inferTradingSchedule, manualTradingSchedule, personalTradingClock, sessionEdgeCue } from './sessionClock.js'
import { selectFloatingNotice } from './notificationQueue.js'
import { tradeDateKey, tradePeriodKey } from './periodRetrospective.js'
import { startSessionRecorder } from './sessionRecorder.js'
import { buildWeeklyWrap, monthlyWrapCandidate, previousMonthKey, previousQuarterKey, previousWeekKey, quarterlyWrapCandidate, weeklyWrapCandidate } from './weeklyWrap.js'
import { buildSessionBriefing } from './marketBriefing.js'

/* Journal: Lucide's feather, unchanged vane and rib, with the shaft stopping short so
   it can end in a carved nib instead of a rounded stroke cap. The nib is filled rather
   than stroked because at 15px an outlined point has no interior left to see. */
function QuillPen({ size = 24, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z" />
      <path d="M17.5 15H9" />
      <path d="M16 8 5.2 18.8" />
      <path d="M6.3 19.9 1.7 23.1l1.7-4.9z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* Trade Mode: a trader at the screen, seen from behind. The figure is filled rather
   than outlined so it occludes the monitor instead of crossing its edges - outlined,
   it read as a monitor on a stand. Solid mass also survives 15px better than strokes. */
function DeskTrader({ size = 24, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="2.5" y="2.6" width="19" height="12.4" rx="2" />
      <circle cx="12" cy="13.4" r="2.9" fill="currentColor" stroke="none" />
      <path d="M6.4 22.6c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* Dashboard: four columns at a glance. Deliberately not a line chart, since the Charts
   tab owns that silhouette three places away. Bars are drawn heavier than the 2px nav
   stroke because solid columns are what keeps this readable at 15px. */
function GlanceBars({ size = 24, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M4 21v-7.5" />
      <path d="M10 21V9" />
      <path d="M16 21V4.5" />
      <path d="M21 21v-5" />
    </svg>
  )
}

/* ───────── logo mark: three ascending candles, tracks the live theme ───────── */
function LogoMark({ size = 22, ignite = false, live = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${ignite ? 'th-logo-ignite' : ''}${live ? ' th-logo-live' : ''}`}>
      {/* Brand mark, traced from the 512px master and scaled by 24/512. Fills come
          from the palette rather than fixed hex so it still tracks the theme: the
          page block follows dim, everything structural follows the accent. */}
      <rect x="2.3" y="6.4" width="5.5" height="15.9" rx="1.1" fill={T.dim} />
      <rect x="2.6" y="1.6" width="19" height="1.5" rx="0.7" fill={T.accent} />
      <rect x="18.2" y="1.6" width="3.4" height="20.7" rx="1.1" fill={T.accent} />
      <rect x="11.7" y="6.4" width="6.5" height="1.8" fill={T.accent} />
      <path d="M13.2 12.1 16.1 15.7h-1.6v6.6h-2.7v-6.6h-1.6z" fill={T.accent} />
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
      <Clock3 size={13} style={{ color: clock.phase === 'off' ? T.faint : T.accentText }} />
      <span style={{ color: T.faint }}>CLOCK</span>
      <span style={{ color: T.text }}>{clock.timeLabel}</span>
      <span style={{ color: clock.phase === 'off' ? T.faint : T.accentText }}>{clock.phaseShort}</span>
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
  const [startupError, setStartupError] = useState('')
  const [startupAttempt, setStartupAttempt] = useState(0)
  const [trades, setTrades] = useState([])
  const [goals, setGoals] = useState({ weekly: 500, monthly: 2000 })
  const [reviews, setReviews] = useState({})
  const [settings, setSettings] = useState(null)
  const [license, setLicense] = useState(null)
  const [tab, setTab] = useState('journal')
  const [chartViewRequest, setChartViewRequest] = useState({ mode: 'candles', id: 0 })
  const [settingsFocus, setSettingsFocus] = useState('')
  const [notesView, setNotesView] = useState(null)
  const [tradeMode, setTradeMode] = useState(false)
  const [preflight, setPreflight] = useState(false)
  const [goTransition, setGoTransition] = useState(null)
  const [checks, setChecks] = useState({})
  const [lockoutDismissed, setLockoutDismissed] = useState(false)
  const [events, setEvents] = useState([])
  const [briefQuotes, setBriefQuotes] = useState([])
  const [briefUpdatedAt, setBriefUpdatedAt] = useState(null)
  const [privateBriefingOpen, setPrivateBriefingOpen] = useState(false)
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
  const [propExpenses, setPropExpenses] = useState([])
  const [tradePlans, setTradePlans] = useState([])
  const [commitments, setCommitments] = useState([])
  const [ruleBreaks, setRuleBreaks] = useState([])
  const [weeklyWrap, setWeeklyWrap] = useState(null)
  const [instrumentProfiles, setInstrumentProfiles] = useState([])
  const [savedSearches, setSavedSearches] = useState([])
  const briefingSeenRef = useRef('')
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
  const browserPreview = import.meta.env.DEV && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('preview')
    : null
  const reportDay = useMemo(() => {
    const today = localDateKey(new Date(now))
    return lastTradingDay(trades, today)
  }, [trades, now])

  useEffect(() => {
    let active = true
    // The semicolon is load-bearing. Without it this parses as
    // `true(async () => {...})()` - ASI does not break between a value and a
    // following `(`, so the startup effect threw "true is not a function"
    // before any data loaded and nothing rendered, on every platform.
    ;(async () => {
      if (!hasApi) { if (active) setReady(true); return }
      try {
        setStartupError('')
        setTrades(await window.api.listTrades())
        setGoals(await window.api.getGoals())
        setReviews(await window.api.getReviews())
        setSettings(await window.api.getSettings())
        if (window.api.getLicense) setLicense(await window.api.getLicense())
        if (window.api.listPlaybook) setPlaybook(await window.api.listPlaybook())
        if (window.api.listDayLogs) setDayLogs(await window.api.listDayLogs())
        if (window.api.listPayouts) setPayouts(await window.api.listPayouts())
        if (window.api.listPropExpenses) setPropExpenses(await window.api.listPropExpenses())
        if (window.api.listTradePlans) setTradePlans(await window.api.listTradePlans())
        if (window.api.listCommitments) setCommitments(await window.api.listCommitments())
        if (window.api.listRuleBreaks) setRuleBreaks(await window.api.listRuleBreaks())
        if (window.api.listInstrumentProfiles) setInstrumentProfiles(await window.api.listInstrumentProfiles())
        if (window.api.listSavedSearches) setSavedSearches(await window.api.listSavedSearches())
        if (window.api.listTradingSessions) setTradingSessions(await window.api.listTradingSessions(100))
      } catch (error) {
        console.error('[startup] journal bootstrap failed', error)
        if (active) setStartupError(error?.message || 'The local journal did not respond.')
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => { active = false }
  }, [hasApi, startupAttempt])

  async function refreshPrivateBriefingQuotes() {
    if (!hasApi || !settings || settings.tickerEnabled === 'false') {
      setBriefQuotes([])
      setBriefUpdatedAt(Date.now())
      return []
    }
    const symbols = String(settings.tickerSymbols || 'SPY,QQQ,BTC,ETH')
      .split(',').map((symbol) => symbol.trim()).filter(Boolean).slice(0, 12)
    try {
      const quotes = await window.api?.priceBatch?.(symbols)
      const next = Array.isArray(quotes) ? quotes : []
      setBriefQuotes(next)
      return next
    } catch {
      setBriefQuotes([])
      return []
    } finally {
      setBriefUpdatedAt(Date.now())
    }
  }

  useEffect(() => {
    if (!ready || !settings) return undefined
    refreshPrivateBriefingQuotes()
    const timer = setInterval(refreshPrivateBriefingQuotes, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [ready, settings?.tickerEnabled, settings?.tickerSymbols, settings?.finnhubKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Roll the persistent ticker out once to existing installs. The marker prevents
  // a later user opt-out from being overwritten on the next launch.
  useEffect(() => {
    if (!ready || !hasApi || !settings || settings.persistentTickerRolloutSeen === 'true') return
    window.api.setSettings({ tickerEnabled: 'true', persistentTickerRolloutSeen: 'true' }).then(setSettings).catch(() => {})
  }, [ready, hasApi, settings?.persistentTickerRolloutSeen])

  useEffect(() => {
    if (!hasApi || !window.api.onImportsChanged) return undefined
    return window.api.onImportsChanged((event) => {
      if (event?.type === 'auto-imported' || event?.type === 'rolled-back' || event?.type === 'mobile-sync') refreshWorkflow()
      if (event?.type === 'mobile-sync') window.api.getSettings().then(setSettings)
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

  function weeklyWrapSeen() {
    try { const value = JSON.parse(settings?.weeklyWrapSeen || '[]'); if (Array.isArray(value)) return value } catch {}
    return []
  }

  async function closeWeeklyWrap() {
    const period = weeklyWrap?.weekKey
    // Holds both week and month keys now, so a year needs 52 + 12 slots.
    // Persist the seen key before clearing the modal. Clearing first lets the scheduling
    // effect run once with stale settings and immediately reopen the same recap.
    if (period) await saveSettings({ weeklyWrapSeen: JSON.stringify([...new Set([...weeklyWrapSeen(), period])].slice(-80)) })
    setWeeklyWrap(null)
  }

  // Focus notes are keyed by period, and week keys (2026-07-27) never collide with
  // month keys (2026-07), so the weekly and monthly focus stay independent.
  function wrapFocusMap() {
    try { const value = JSON.parse(settings?.wrapFocus || '{}'); if (value && typeof value === 'object') return value } catch {}
    return {}
  }

  async function saveWrapFocus(period, text) {
    if (!period) return
    const map = { ...wrapFocusMap() }
    if (text) map[period] = text
    else delete map[period]
    // Keep the most recent entries only, so this setting cannot grow without bound.
    const trimmed = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-64))
    await saveSettings({ wrapFocus: JSON.stringify(trimmed) })
  }

  /** What the trader committed to after the period immediately before this one. */
  function priorWrapFocus(wrap) {
    if (!wrap?.weekKey) return ''
    const quarter = /^(\d{4})-Q([1-4])$/.exec(wrap.weekKey)
    const anchor = quarter
      ? new Date(Number(quarter[1]), (Number(quarter[2]) - 1) * 3, 1, 12)
      : new Date(`${wrap.weekKey.length === 7 ? `${wrap.weekKey}-01` : wrap.weekKey}T12:00:00`)
    if (Number.isNaN(anchor.getTime())) return ''
    const key = wrap.granularity === 'quarter' ? previousQuarterKey(anchor) : wrap.granularity === 'month' ? previousMonthKey(anchor) : previousWeekKey(anchor)
    return String(wrapFocusMap()[key] || '')
  }

  function showWeeklyWrap(period, granularity = 'week') {
    const wrap = buildWeeklyWrap({ trades, ruleBreaks, weekKey: period, granularity })
    if (wrap) setWeeklyWrap(wrap)
  }

  useEffect(() => {
    if (!ready || !settings || weeklyWrap) return
    const seen = weeklyWrapSeen()
    // The month rewind wins when both are due — a new month is always a new week too,
    // and stacking two recaps on one launch is worse than showing the bigger one first.
    // The other stays unseen and appears on the next launch.
    const candidates = [
      { granularity: 'quarter', period: quarterlyWrapCandidate(new Date(now)) },
      { granularity: 'month', period: monthlyWrapCandidate(new Date(now)) },
      { granularity: 'week', period: weeklyWrapCandidate(new Date(now)) }
    ]
    for (const { granularity, period } of candidates) {
      if (!period || seen.includes(period)) continue
      const wrap = buildWeeklyWrap({ trades, ruleBreaks, weekKey: period, granularity })
      if (wrap) { setWeeklyWrap(wrap); return }
    }
  }, [ready, settings, trades, ruleBreaks, now, weeklyWrap]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // electron-updater signals when a download is ready on every packaged platform.
  useEffect(() => { window.api?.onUpdateReady?.((info) => setUpdateReady(info || {})) }, [])

  // GitHub API fallback for macOS and Linux. Both normally auto-update, but
  // this stays as a safety net: if either updater fails silently, the platform installer
  // link is the only signal the user would get. Suppressed once a download is ready so
  // the two update prompts can't stack — see the render guard on updateAvail.
  useEffect(() => {
    if (!hasApi || !window.api.latestVersion) return
    let live = true
    const check = async () => {
      try {
        const [cur, latest] = await Promise.all([window.api.appVersion(), window.api.latestVersion()])
        if (live && ['darwin', 'linux'].includes(latest?.platform) && latest.version && isNewerVersion(latest.version, cur)) {
          setUpdateAvail({ ...latest, current: cur })
        }
      } catch {}
    }
    check()
    window.addEventListener('focus', check)
    return () => { live = false; window.removeEventListener('focus', check) }
  }, [hasApi])

  const stats = useMemo(() => computeStats(trades), [trades])
  const briefingLeaks = useMemo(() => computeLeaks(trades), [trades])
  const easterNudges = useMemo(() => buildEasterEggNudges(trades, stats), [trades, stats])

  async function refreshWorkflow() {
    if (!hasApi) return []
    const [nextTrades, nextPlans, nextCommitments, nextRuleBreaks] = await Promise.all([
      window.api.listTrades(),
      window.api.listTradePlans ? window.api.listTradePlans() : Promise.resolve(tradePlans),
      window.api.listCommitments ? window.api.listCommitments() : Promise.resolve(commitments),
      window.api.listRuleBreaks ? window.api.listRuleBreaks() : Promise.resolve(ruleBreaks)
    ])
    setTrades(nextTrades); setTradePlans(nextPlans); setCommitments(nextCommitments); setRuleBreaks(nextRuleBreaks)
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
  function demoWeeklyWrap() {
    const latestWeek = trades.map((trade) => tradePeriodKey(trade, 'week')).filter(Boolean).sort().reverse()[0]
    if (latestWeek) showWeeklyWrap(latestWeek)
    else setWorkflowMsg('Log at least one trade to preview a weekly wrap-up.')
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
  async function removeTrades(ids) { if (hasApi) { await window.api.deleteTrades(ids); await refreshWorkflow() } }
  async function importTrades(rows, meta = {}) { if (hasApi) { const result = await window.api.importTrades(rows, meta); await refreshWorkflow(); return result } }
  async function rollbackImport(id) { if (hasApi) { const result = await window.api.rollbackImportBatch(id); await refreshWorkflow(); return result } }
  async function reloadAll() {
    if (!hasApi) return
    const [nextTrades, nextGoals, nextReviews, nextSettings, nextPlans, nextCommitments, nextProfiles, nextSearches, nextPayouts, nextPropExpenses, nextRuleBreaks, nextSessions] = await Promise.all([
      window.api.listTrades(), window.api.getGoals(), window.api.getReviews(), window.api.getSettings(),
      window.api.listTradePlans ? window.api.listTradePlans() : [],
      window.api.listCommitments ? window.api.listCommitments() : [],
      window.api.listInstrumentProfiles ? window.api.listInstrumentProfiles() : [],
      window.api.listSavedSearches ? window.api.listSavedSearches() : [],
      window.api.listPayouts ? window.api.listPayouts() : [],
      window.api.listPropExpenses ? window.api.listPropExpenses() : [],
      window.api.listRuleBreaks ? window.api.listRuleBreaks() : [],
      window.api.listTradingSessions ? window.api.listTradingSessions(100) : []
    ])
    setTrades(nextTrades); setGoals(nextGoals); setReviews(nextReviews); setSettings(nextSettings)
    setTradePlans(nextPlans); setCommitments(nextCommitments); setInstrumentProfiles(nextProfiles); setSavedSearches(nextSearches)
    setPayouts(nextPayouts); setPropExpenses(nextPropExpenses); setRuleBreaks(nextRuleBreaks); setTradingSessions(nextSessions)
  }
  async function saveGoals(g) { if (hasApi) setGoals(await window.api.setGoals(g)) }
  async function saveReview(period, text) { if (hasApi) setReviews(await window.api.setReview(period, text)) }
  async function removeReview(period) { if (hasApi && window.api.deleteReview) setReviews(await window.api.deleteReview(period)) }
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

  async function clearDemoTrades() { if (hasApi && window.api.clearDemoTrades) await runWorkflow(() => window.api.clearDemoTrades(), setTrades) }

  async function addCommitment(commitment) { if (hasApi && window.api.addCommitment) return runWorkflow(() => window.api.addCommitment(commitment), setCommitments); return false }
  async function updateCommitment(commitment) { if (hasApi && window.api.updateCommitment) await runWorkflow(() => window.api.updateCommitment(commitment), setCommitments) }
  async function deleteCommitment(id) { if (hasApi && window.api.deleteCommitment) await runWorkflow(() => window.api.deleteCommitment(id), setCommitments) }
  async function deleteRuleBreak(id) { if (hasApi && window.api.deleteRuleBreak) await runWorkflow(() => window.api.deleteRuleBreak(id), setRuleBreaks) }
  async function updateTradingSession(id, notes) {
    if (!hasApi || !window.api.updateTradingSession) return false
    const ok = await runWorkflow(() => window.api.updateTradingSession(id, { notes }), (updated) => {
      setTradingSessions((current) => current.map((session) => session.id === updated.id ? updated : session))
    })
    return ok
  }
  async function deleteTradingSession(id) {
    if (!hasApi || !window.api.deleteTradingSession) return false
    try {
      const nextSessions = await window.api.deleteTradingSession(id)
      const nextRuleBreaks = window.api.listRuleBreaks ? await window.api.listRuleBreaks() : ruleBreaks
      setTradingSessions(nextSessions)
      setRuleBreaks(nextRuleBreaks)
      return true
    } catch (error) {
      setWorkflowMsg(error?.message || 'That session could not be deleted.')
      return false
    }
  }

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
  async function addPropExpense(e) { if (hasApi && window.api.addPropExpense) setPropExpenses(await window.api.addPropExpense(e)) }
  async function deletePropExpense(id) { if (hasApi && window.api.deletePropExpense) setPropExpenses(await window.api.deletePropExpense(id)) }

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
  const privateBriefing = useMemo(() => settings ? buildSessionBriefing({
    quotes: briefQuotes,
    events,
    settings,
    journal: {
      stats,
      leaks: briefingLeaks,
      commitments,
      ruleBreaks,
      todayNet,
      todayCount: todayTrades.length,
      live: tradeMode
    },
    now
  }) : null, [briefQuotes, events, settings, stats, briefingLeaks, commitments, ruleBreaks, todayNet, todayTrades.length, tradeMode, now])

  function dismissPrivateBriefing() {
    const day = localDateKey(new Date(now))
    briefingSeenRef.current = day
    setPrivateBriefingOpen(false)
    if (settings?.privateBriefingSeenDay !== day) Promise.resolve(saveSettings({ privateBriefingSeenDay: day })).catch(() => {})
  }

  useEffect(() => {
    if (!ready || !settings || !briefUpdatedAt || settings.privateBriefingPopupEnabled === 'false') return
    const day = localDateKey(new Date(now))
    if (tab === 'news') {
      setPrivateBriefingOpen(false)
      if (briefingSeenRef.current !== day && settings.privateBriefingSeenDay !== day) {
        briefingSeenRef.current = day
        Promise.resolve(saveSettings({ privateBriefingSeenDay: day })).catch(() => {})
      }
      return
    }
    if (briefingSeenRef.current !== day && settings.privateBriefingSeenDay !== day) setPrivateBriefingOpen(true)
  }, [ready, settings, briefUpdatedAt, tab, now]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const [helpOpen, setHelpOpen] = useState(false)
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
  async function saveSessionReview(notes, brokenRules = []) {
    if (!sessionReview?.id) return
    const saved = await window.api.finishTradingSession(sessionReview.id, { endedAt: sessionReview.endedAt, notes })
    let nextRuleBreaks = ruleBreaks
    for (const entry of brokenRules) {
      nextRuleBreaks = await window.api.addRuleBreak({
        ...entry,
        sessionId: sessionReview.id,
        occurredAt: sessionReview.endedAt || new Date().toISOString()
      })
    }
    setRuleBreaks(nextRuleBreaks)
    setTradingSessions(await window.api.listTradingSessions(100))
    setSessionReview(null)
    setActiveSession(null)
    setRecordingState({ status: 'off', error: '' })
    const period = weeklyWrapCandidate(new Date(saved.endedAt || Date.now()), { afterSession: true })
    if (period && !weeklyWrapSeen().includes(period)) {
      const wrap = buildWeeklyWrap({ trades, ruleBreaks: nextRuleBreaks, weekKey: period })
      if (wrap) setWeeklyWrap(wrap)
    }
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
  const achievements = useMemo(() => computeAchievements(trades, stats, payouts, dayLogs, commitments, ruleBreaks), [trades, stats, payouts, dayLogs, commitments, ruleBreaks])
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
    onboard || tradeMode || notesView || preflight || sessionReview || whatsNew || goTransition ||
    (GATE_CONFIGURED && license?.state === 'expired')
  )
  const activeFloatingNotice = selectFloatingNotice({
    risk: Boolean(workflowMsg || imminentEvent || (tradeMode && lossHit && !lockoutDismissed)),
    update: Boolean(updateReady),
    dailyReview: Boolean(dailyReport),
    weeklyReview: Boolean(weeklyWrap),
    briefing: Boolean(privateBriefingOpen && tab !== 'news'),
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
    const root = document.documentElement
    root.style.setProperty('--th-bg', T.bg)
    root.style.setProperty('--th-surface', T.surface)
    root.style.setProperty('--th-surface-2', T.surface2)
    root.style.setProperty('--th-text', T.text)
    root.style.setProperty('--th-dim', T.dim)
    root.style.setProperty('--th-faint', T.faint)
    root.style.setProperty('--th-accent', T.accent)
    root.style.setProperty('--th-line', T.line)
    root.style.setProperty('--th-up', T.up)
    root.style.setProperty('--th-down', T.down)
    root.dataset.themePreset = settings?.themePreset || 'classic'
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

  const tabRefs = useRef([])
  // Arrows move along the tablist and switch immediately (automatic activation), which
  // is the behaviour people expect from a desktop app's tab strip.
  function moveTab(index) {
    const next = (index + TABS.length) % TABS.length
    setTab(TABS[next][0])
    tabRefs.current[next]?.focus()
  }
  function onTabListKeyDown(event) {
    const current = TABS.findIndex(([id]) => id === tab)
    if (current < 0) return
    const moves = {
      ArrowRight: current + 1, ArrowDown: current + 1,
      ArrowLeft: current - 1, ArrowUp: current - 1,
      Home: 0, End: TABS.length - 1
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    moveTab(moves[event.key])
  }

  const TABS = [
    ['journal', 'Journal', QuillPen],
    ['chart', 'Charts', LineChart],
    ['trade', 'Trade Mode', DeskTrader],
    ['propfirm', 'Accounts', Wallet],
    ['dashboard', 'Dashboard', GlanceBars],
    ['psych', 'Psychology', Armchair],
    ['rating', 'Rating', Gauge],
    ['goals', 'Goals', Flag],
    ['reviews', 'Reviews', History],
    ['coach', 'AI Coach', GraduationCap],
    ['patterns', 'Patterns', Shapes],
    ['playbook', 'Playbook', Waypoints],
    ['news', 'News', Megaphone],
    ['settings', 'Settings', SettingsIcon]
  ]

  // Desktop-app tab shortcuts: Ctrl/Cmd+1-9 jumps to a tab, Ctrl/Cmd+Tab cycles.
  // Deliberately no plain-letter bindings — they would fire while typing a trade note.
  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const current = TABS.findIndex(([id]) => id === tab)
      if (import.meta.env.DEV && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        demoWeeklyWrap()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const next = (current + (event.shiftKey ? -1 : 1) + TABS.length) % TABS.length
        setTab(TABS[next][0])
        return
      }
      if (event.shiftKey) return
      const digit = Number(event.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9 && TABS[digit - 1]) {
        event.preventDefault()
        setTab(TABS[digit - 1][0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="th-app" style={{ color: T.text, minHeight: '100vh', borderTop: `3px solid ${tradeMode ? T.accent : 'transparent'}` }}>
      {/* bg lives on <body> (synced above) so the z:-1 particle canvas shows through */}
      <CustomBackground dataUrl={customBg} settings={settings} />
      <Backdrop variant={!settings?.backdrop || settings.backdrop === 'on' ? 'constellation' : settings.backdrop} />
      {personalClockAmbience && <SessionAmbience clock={sessionClock} />}
      {updateAvail && !updateReady && <UpdateAvailableBanner info={updateAvail} onClose={() => setUpdateAvail(null)} />}
      {GATE_CONFIGURED && license?.state === 'trial' && <TrialBanner days={license.daysLeft} />}
      {imminentEvent && <EventBanner event={imminentEvent} now={now} />}
      {tradeMode && <LiveBanner net={todayNet} goal={dailyGoal} maxLoss={maxLoss} lossHit={lossHit} recordingState={recordingState} sourceLabel={selectedCaptureSource?.name || ''} elapsed={sessionElapsed} onEnd={endSession} />}
      <div className="th-app-shell mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <header className="th-app-header flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="th-brand flex items-center gap-2">
            <LogoMark live={tradeMode} />
            <span className="text-lg font-semibold tracking-tight" style={{ color: T.text }}>
              Trade<span style={{ color: T.accentText }}>Help</span>
            </span>
            <span className="th-local-status text-xs" style={{ color: tradeMode ? T.up : T.dim }}>{tradeMode ? 'Live · private' : 'Local · private'}</span>
          </div>
          <div className="th-header-readouts flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
            {/* These read the whole book, so they stay useful whatever tab is open.
                (The slot previously held the last trade's symbol labelled "Account",
                which was neither the account nor a figure worth carrying up here.) */}
            <span className="th-header-readout-group flex items-center gap-4" style={mono}>
              <Readout label="NET" value={fmt$(demoPnlTotal ?? stats.totalPnl)} tone={(demoPnlTotal ?? stats.totalPnl) >= 0 ? 'up' : 'down'} feedback={pnlFeedback} />
              <Readout label="WIN" value={`${fmtN(stats.winRate, 1)}%`} />
              {/* WIN now excludes scratches, so the count of them sits beside it:
                  without this the two numbers look like they disagree. */}
              {stats.breakEvenCount > 0 && <Readout label="BE" value={String(stats.breakEvenCount)} />}
              <Readout label="PF" value={stats.profitFactor === Infinity ? '∞' : fmtN(stats.profitFactor, 2)} />
              <Readout label="STREAK" value={String(stats.currentStreak)} tone={String(stats.currentStreak).endsWith('W') ? 'up' : String(stats.currentStreak).endsWith('L') ? 'down' : 'none'} />
              {stats.n > 0 && <Readout label="CALM" value={String(stats.nonTiltStreak)} tone="up" />}
            </span>
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
            {/* Available in Trade Mode too, unlike the rest of these: writing a note
                mid-session is the whole reason the scratchpad exists. */}
            {window.api?.toggleQuickNote && (
              <button type="button" onClick={() => window.api.toggleQuickNote()}
                title="Quick note (stays out of screen recordings)" aria-label="Open quick note"
                className="flex items-center justify-center px-2 py-1.5 rounded-md"
                style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
                <PenLine size={15} />
              </button>
            )}
            {!tradeMode && (
              <button type="button" onClick={() => setHelpOpen(true)} title="Help & FAQ" aria-label="Help and FAQ" className="flex items-center justify-center px-2 py-1.5 rounded-md" style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
                <HelpCircle size={15} />
              </button>
            )}
            {import.meta.env.DEV && (
              <div className="th-dev-shortcuts" aria-hidden="true">
                <button type="button" onClick={demoPnlCount}>P&amp;L</button>
                <button type="button" onClick={demoPageCounts}>Counts</button>
                <button type="button" onClick={demoWeeklyWrap}>Wrap</button>
              </div>
            )}
          </div>
        </header>

        {/* A tablist is one stop in the tab order, not thirteen: Tab reaches the nav,
            arrows move along it, Tab again drops into the page. Screen readers also
            announce position ("tab 3 of 13") instead of a run of unrelated buttons. */}
        <nav role="tablist" aria-label="Primary" className="th-primary-tabs flex" style={{ borderColor: T.line }} onKeyDown={onTabListKeyDown}>
          {TABS.map(([id, label, Icon], index) => {
            const active = tab === id
            return (
              <button key={id} type="button" role="tab" id={`th-tab-${id}`}
                aria-selected={active} aria-controls="th-tabpanel"
                tabIndex={active ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node }}
                onClick={() => {
                  if (id === 'chart') setChartViewRequest((current) => ({ mode: 'candles', id: current.id + 1 }))
                  setTab(id)
                }}
                className={`th-tab flex items-center gap-2 px-3 py-2 text-sm${active ? ' th-tab-on' : ''}`}
                style={{ color: active ? T.accentText : T.dim }}>
                <Icon size={15} /> {label}
              </button>
            )
          })}
        </nav>

        <Ticker settings={settings} onOpenMarketPulse={() => {
          setChartViewRequest((current) => ({ mode: 'pulse', id: current.id + 1 }))
          setTab('chart')
        }} />

        {!ready ? (
          <div className="py-20 text-center text-sm" style={{ color: T.dim }}>Loading your journal…</div>
        ) : startupError ? (
          <section className="mx-auto flex max-w-xl flex-col items-center px-5 py-20 text-center" role="alert">
            <AlertTriangle size={24} style={{ color: T.down }} />
            <h2 className="mt-4 text-base font-semibold" style={{ color: T.text }}>Your journal could not finish loading</h2>
            <p className="mt-2 text-sm" style={{ color: T.dim }}>Your trades have not been changed. Restart TradeHelp or retry the local connection.</p>
            <p className="mt-2 text-xs" style={{ color: T.faint }}>{startupError}</p>
            <button type="button" className="mt-5 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
              style={{ background: T.accent, color: '#1A1306' }}
              onClick={() => { setReady(false); setStartupError(''); setStartupAttempt((value) => value + 1) }}>
              <RefreshCw size={15} /> Retry
            </button>
          </section>
        ) : !hasApi && browserPreview === 'tradingview' ? (
          <ChartTab trades={[]} />
        ) : !hasApi && browserPreview === 'news' ? (
          <NewsTab />
        ) : !hasApi ? (
          <div className="py-20 text-center text-sm" style={{ color: T.down }}>
            This UI must run inside the Electron shell (npm run dev) to reach your local database.
          </div>
        ) : GATE_CONFIGURED && license?.state === 'expired' ? (
          <Paywall onActivated={refreshLicense} />
        ) : (
          <PageAnimationContext.Provider value={`${tab}-${pageAnimationReplay}`}>
          <div key={tab} id="th-tabpanel" role="tabpanel" aria-labelledby={`th-tab-${tab}`} className="th-cinematic th-tabpanel">
            {tab === 'journal' && <Journal trades={trades} commitments={commitments} onAdd={addTrade} onUpdate={updateTrade} onRemove={removeTrade} onRemoveMany={removeTrades} onNotes={setNotesView} onImport={importTrades} onRollbackImport={rollbackImport} accounts={propFirmAccounts} profiles={instrumentProfiles} savedSearches={savedSearches} onAddSavedSearch={addSavedSearch} onUpdateSavedSearch={updateSavedSearch} onDeleteSavedSearch={deleteSavedSearch} onRefreshSavedSearches={refreshSavedSearches} settings={settings} onSaveSettings={saveSettings} dayLogs={dayLogs} onAddDayLog={addDayLog} onDeleteDayLog={deleteDayLog} drilldown={journalDrilldown} onConsumeDrilldown={() => setJournalDrilldown(null)} />}
            {tab === 'chart' && <ChartTab trades={trades} onOpenTrade={setNotesView} settings={settings} onSaveSettings={saveSettings} requestedView={chartViewRequest.mode} viewRequestId={chartViewRequest.id} />}
            {tab === 'trade' && <TradeModeTab settings={settings} onSave={saveSettings} rules={rules} ruleBreaks={ruleBreaks} onDeleteRuleBreak={deleteRuleBreak} onUpdateSession={updateTradingSession} onDeleteSession={deleteTradingSession} live={tradeMode} arming={goTransition === 'arming'} todayNet={todayNet} todayCount={todayTrades.length} weekNet={weekNet} goal={dailyGoal} maxLoss={maxLoss} onStart={startDay} onEnd={endSession} session={activeSession} recordingState={recordingState} elapsed={sessionElapsed} sessions={tradingSessions} plans={tradePlans} trades={trades} accounts={propFirmAccounts} playbook={playbook} profiles={instrumentProfiles} planPrefill={planPrefill} onConsumePlanPrefill={() => setPlanPrefill(null)} onAddPlan={addTradePlan} onUpdatePlan={updateTradePlan} onDeletePlan={deleteTradePlan} />}
            {tab === 'propfirm' && <PropFirm trades={trades} accounts={propFirmAccounts} onSave={savePropFirmAccounts} settings={settings} onSaveSettings={saveSettings} payouts={payouts} onAddPayout={addPayout} onDeletePayout={deletePayout} expenses={propExpenses} onAddExpense={addPropExpense} onDeleteExpense={deletePropExpense} />}
            {tab === 'dashboard' && <Dashboard stats={stats} trades={trades} accounts={propFirmAccounts} settings={settings} journalData={{ reviews, playbook, dayLogs, goals, payouts, commitments }} payouts={payouts} plans={tradePlans} commitments={commitments} rules={rules} todayNet={todayNet} maxLoss={maxLoss} live={tradeMode} pnlFeedback={pnlFeedback} onSaveSettings={saveSettings} onOpenCoach={() => setTab('coach')} onOpenTradeMode={() => setTab('trade')} onOpenTrade={setNotesView} onTimingDrilldown={openTimingJournal} onClearDemo={clearDemoTrades} personalClock={sessionClock} personalSchedule={personalSchedule} now={now} />}
            {tab === 'psych' && <Psychology stats={stats} />}
            {tab === 'rating' && <Rating trades={trades} stats={stats} achievements={achievements} unlockedAt={unlockedAt} settings={settings} onSave={saveSettings} payouts={payouts} />}
            {tab === 'goals' && <Goals goals={goals} onSave={saveGoals} trades={trades} now={now} commitments={commitments} onAddCommitment={addCommitment} onUpdateCommitment={updateCommitment} onDeleteCommitment={deleteCommitment} onOpenCoach={() => setTab('coach')} />}
            {tab === 'reviews' && <Reviews trades={trades} ruleBreaks={ruleBreaks} reviews={reviews} goals={goals} settings={settings} onSave={saveReview} onDelete={removeReview} onOpenWeeklyWrap={showWeeklyWrap} now={now} />}
            <div aria-hidden={tab !== 'coach'} style={{ display: tab === 'coach' ? 'contents' : 'none' }}>
              <Coach trades={trades} stats={stats} settings={settings} reviews={reviews} playbook={playbook} dayLogs={dayLogs} goals={goals} payouts={payouts} commitments={commitments} events={events} now={now} />
            </div>
            {tab === 'patterns' && <Patterns trades={trades} onOpenTrade={setNotesView} />}
            {tab === 'playbook' && <PlaybookTab entries={playbook} trades={trades} onAdd={addPlaybookEntry} onUpdate={updatePlaybookEntry} onDelete={deletePlaybookEntry} onPlan={planFromPlaybook} />}
            {tab === 'news' && <NewsTab trades={trades} stats={stats} settings={settings} events={events} commitments={commitments} ruleBreaks={ruleBreaks} todayNet={todayNet} todayCount={todayTrades.length} live={tradeMode} now={now} briefQuotes={briefQuotes} briefUpdatedAt={briefUpdatedAt} onRefreshBriefing={refreshPrivateBriefingQuotes} onOpenMarketDataSettings={() => { setSettingsFocus('Market data connections'); setTab('settings') }} />}
            {tab === 'settings' && <SettingsTab settings={settings} onSave={saveSettings} license={license} onLicenseChange={refreshLicense} onReload={reloadAll} accounts={propFirmAccounts} profiles={instrumentProfiles} onAddProfile={addInstrumentProfile} onUpdateProfile={updateInstrumentProfile} onDeleteProfile={deleteInstrumentProfile} initialSection={settingsFocus} />}
          </div>
          </PageAnimationContext.Provider>
        )}
      </div>

      {notesView && <NotesModal trade={notesView} onClose={() => setNotesView(null)} onUpdate={updateTrade} onAttachmentsChange={refreshWorkflow} />}
      {preflight && (
        <Preflight rules={rules} checks={checks} setChecks={setChecks}
          snapshot={{ todayNet, todayCount: todayTrades.length, weekNet }}
          goal={dailyGoal} maxLoss={maxLoss} imminent={imminentEvent} now={now}
          launching={goTransition === 'launching'} recordingEnabled={recordingEnabled} setRecordingEnabled={setRecordingEnabled}
          captureSources={captureSources} selectedSource={selectedCaptureSource} setSelectedSource={setSelectedCaptureSource}
          captureLoading={captureLoading} captureError={captureError} onRefreshSources={loadCaptureSources}
          onCancel={cancelPreflight} onGoLive={goLive} />
      )}
      {sessionReview && <SessionEndReview session={sessionReview} recordingState={recordingState} rules={rules} ruleBreaks={ruleBreaks} onSave={saveSessionReview} onDiscardRecording={discardSessionRecording} />}
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
      {activeFloatingNotice === 'briefing' && privateBriefing && (
        <PrivateBriefingBubble briefing={privateBriefing} updatedAt={briefUpdatedAt} onClose={dismissPrivateBriefing}
          onOpen={() => { dismissPrivateBriefing(); setTab('news') }} />
      )}
      {activeFloatingNotice === 'weekly-review' && weeklyWrap && (
        <WeeklyWrapModal wrap={weeklyWrap} settings={settings} onClose={closeWeeklyWrap}
          onSaveFocus={saveWrapFocus} priorFocus={priorWrapFocus(weeklyWrap)}
          onOpenReview={() => { closeWeeklyWrap(); setTab('reviews') }} />
      )}
      {activeFloatingNotice === 'feedback' && feedbackPrompt && (
        <FeedbackPrompt onShare={shareFeedback} onDismiss={endFeedbackPrompt} />
      )}
      {activeFloatingNotice === 'timing' && sessionCue && (
        <SessionEdgeBubble cue={sessionCue} onClose={() => setSessionCue(null)} />
      )}
      {/* User-initiated, so it sits outside the floating-notice priority queue. */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

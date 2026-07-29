import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import * as Notifications from 'expo-notifications'
import { LinearGradient } from 'expo-linear-gradient'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
import {
  Award,
  BarChart3,
  BellRing,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleEllipsis,
  Clock,
  Database,
  History as HistoryIcon,
  House,
  ImagePlus,
  Info,
  Landmark,
  List,
  Newspaper,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Smartphone,
  Target,
  Trash2,
  TrendingUp,
  Vibrate,
  Wallet,
  Wifi,
  XCircle
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable as NativePressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View
} from 'react-native'
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg'
import { initializeDatabase } from './src/storage/schema'
import {
  clearAllLocalData,
  clearDemoTrades,
  countDemoTrades,
  createLocalId,
  deleteLocalTrade,
  deleteWatchlistItem,
  getRuleState,
  getAccountState,
  getSetting,
  listTrades,
  listWatchlist,
  loadDemoTrades,
  MobileTrade,
  AccountState,
  PropAccount,
  pendingTradeChanges,
  saveRules,
  saveAccountState,
  saveTrade,
  saveWatchlistItem,
  setSetting,
  updateLocalTrade,
  WatchlistItem
} from './src/storage/repository'
import { localNow } from './src/storage/dates'
import { syncDesktop } from './src/sync/client'
import {
  EconomicEvent,
  NewsState,
  refreshNews as refreshNewsCalendar,
  scheduleNewsTestNotification,
  setNewsAlertsEnabled
} from './src/news'
import {
  computeEdgeStats,
  computeHoldStats,
  computeMobileStats,
  computePropAccount,
  computeTradeGrade,
  formatHoldDuration,
  tradeHoldMinutes
} from './src/stats'
import { getDailyQuote } from './src/quotes'
import { palette, Palette, ThemeMode } from './src/theme'

type CameraPermission = { granted: boolean; canAskAgain: boolean }
type CameraPermissionHook = () => [CameraPermission | null, () => Promise<unknown>]

let CameraViewComponent: any = null
let useCameraPermissionsHook: CameraPermissionHook = () => [null, async () => null]
try {
  const camera = require('expo-camera')
  CameraViewComponent = camera.CameraView
  useCameraPermissionsHook = camera.useCameraPermissions
} catch {
  // Older development builds can still run and use the manual pairing code.
}
const CAMERA_AVAILABLE = Boolean(CameraViewComponent)

function Pressable({
  accessibilityRole = 'button',
  ...props
}: ComponentProps<typeof NativePressable>) {
  return <NativePressable accessibilityRole={accessibilityRole} {...props} />
}

type Tab = 'home' | 'history' | 'insights' | 'accounts' | 'vault' | 'news' | 'settings'
type Form = {
  symbol: string
  direction: 'Long' | 'Short'
  pnl: string
  fees: string
  timeframe: string
  entryTime: string
  exitTime: string
  account: string
  setup: string
  notes: string
  screenshotUri: string
}

type DailyReview = {
  date: string
  planQuality: 'Yes' | 'Mostly' | 'No'
  mindset: 'Calm' | 'Mixed' | 'Emotional'
  takeaway: string
  completedAt: string
}

const primaryTabs: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'insights', label: 'Insights', icon: BarChart3 }
]

const moreTabs: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'accounts', label: 'Accounts', icon: Landmark },
  { key: 'vault', label: 'Vault', icon: ImagePlus },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'settings', label: 'Settings', icon: SettingsIcon }
]

const APP_VERSION = '0.1.0'
const EDGE_SAMPLE_THRESHOLD = 8

const EMPTY_NEWS: NewsState = {
  events: [],
  enabled: false,
  permission: 'undetermined',
  scheduledCount: 0,
  refreshedAt: '',
  warning: ''
}

const PROP_TEMPLATES: Record<'50K' | '100K' | '150K', Omit<PropAccount, 'id' | 'label'>> = {
  '50K': {
    enabled: true, accountSize: 50000, target: 3000, maxDailyLoss: 1100,
    maxDrawdown: 2000, minDays: 5, ddType: 'trailing', scope: 'own', sizeScale: 1
  },
  '100K': {
    enabled: true, accountSize: 100000, target: 6000, maxDailyLoss: 2200,
    maxDrawdown: 3000, minDays: 5, ddType: 'trailing', scope: 'own', sizeScale: 1
  },
  '150K': {
    enabled: true, accountSize: 150000, target: 9000, maxDailyLoss: 3300,
    maxDrawdown: 5000, minDays: 5, ddType: 'trailing', scope: 'own', sizeScale: 1
  }
}

const blankForm = (): Form => {
  const now = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return {
    symbol: '',
    direction: 'Long',
    pnl: '',
    fees: '',
    timeframe: '',
    entryTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    exitTime: '',
    account: '',
    setup: '',
    notes: '',
    screenshotUri: ''
  }
}

// Single definition lives in src/storage/dates — two implementations of "what
// time is it here" is exactly how the formats drifted apart to begin with.
const localTimestamp = localNow

function money(value: number) {
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Axis labels have ~40px to work with, so values are abbreviated rather than
// written out in full.
function compactMoney(value: number) {
  const sign = value < 0 ? '-' : ''
  const size = Math.abs(value)
  if (size >= 1000) return `${sign}$${(size / 1000).toFixed(size >= 10_000 ? 0 : 1)}k`
  return `${sign}$${Math.round(size)}`
}

function shortDate(value: string) {
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function percent(value: number | null) {
  return value === null ? '--' : `${(value * 100).toFixed(1)}%`
}

function ratio(value: number | null) {
  return value === null ? '--' : value.toFixed(2)
}

let hapticsAllowed = true

function setHapticsRuntime(enabled: boolean) {
  hapticsAllowed = enabled
}

function triggerHaptic(type: 'light' | 'medium' | 'success' | 'selection' = 'light') {
  if (!hapticsAllowed) return
  try {
    if (type === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    else if (type === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    else if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    else if (type === 'selection') Haptics.selectionAsync().catch(() => {})
  } catch {}
}

function Stat({ label, value, numValue, tone, wide, styles }: { label: string; value: string; numValue?: number; tone?: string; wide?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.kicker}>{label}</Text>
      {numValue !== undefined && Number.isFinite(numValue) ? (
        <ScrubAnimatedNumber value={numValue} duration={420} style={[styles.statValue, tone ? { color: tone } : null]} />
      ) : (
        // Free-text values (setup names) get a full row and two lines to land in;
        // clipping a strategy name to "VWAP Re..." tells the trader nothing.
        <Text
          style={[styles.statValue, wide ? styles.statValueWide : null, tone ? { color: tone } : null]}
          numberOfLines={wide ? 2 : 1}
          adjustsFontSizeToFit={!wide}
        >
          {value}
        </Text>
      )}
    </View>
  )
}

function newsTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function untilNews(ts: number, now: number) {
  const minutes = Math.max(0, Math.round((ts - now) / 60_000))
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`
  return `in ${Math.floor(hours / 24)}d`
}

type PnlRange = '1W' | '1M' | '3M' | 'ALL'

const PNL_RANGES: Array<{ key: PnlRange; days: number }> = [
  { key: '1W', days: 7 },
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: 'ALL', days: 0 }
]

function ScrubAnimatedNumber({
  value,
  style,
  duration = 320,
  animateOnMount = false
}: {
  value: number
  style: any
  duration?: number
  animateOnMount?: boolean
}) {
  const [displayValue, setDisplayValue] = useState(animateOnMount ? 0 : value)
  const prevValueRef = useRef(animateOnMount ? 0 : value)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = prevValueRef.current
    const targetValue = value

    const startTime = Date.now()

    if (animRef.current) cancelAnimationFrame(animRef.current)

    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(1, elapsed / duration)
      const ease = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (targetValue - startValue) * ease

      setDisplayValue(current)

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step)
      } else {
        prevValueRef.current = targetValue
      }
    }

    animRef.current = requestAnimationFrame(step)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [value, duration])

  return <Text style={style}>{money(displayValue)}</Text>
}

function PnlCurve({
  trades,
  colors,
  styles
}: {
  trades: MobileTrade[]
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [range, setRange] = useState<PnlRange>('1M')
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const [chartContainerWidth, setChartContainerWidth] = useState(360)
  const chartAnim = useRef(new Animated.Value(1)).current

  function changeRange(newRange: PnlRange) {
    if (newRange === range) return
    setScrubIndex(null)
    Animated.sequence([
      Animated.timing(chartAnim, { toValue: 0.25, duration: 85, useNativeDriver: true }),
      Animated.timing(chartAnim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    ]).start()
    setRange(newRange)
  }

  const selectedDays = PNL_RANGES.find((option) => option.key === range)?.days ?? 30
  const cutoff = selectedDays ? Date.now() - selectedDays * 86_400_000 : 0
  const previousCutoff = selectedDays ? cutoff - selectedDays * 86_400_000 : 0
  const periodTrades = [...trades]
    .filter((trade) => {
      const ts = new Date(trade.tradeDate.replace(' ', 'T')).getTime()
      return !cutoff || (Number.isFinite(ts) && ts >= cutoff)
    })
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  const values = [0]
  for (const trade of periodTrades) values.push((values[values.length - 1] ?? 0) + trade.pnl)

  const periodNet = values[values.length - 1] ?? 0
  const previousNet = selectedDays
    ? trades.reduce((sum, trade) => {
        const ts = new Date(trade.tradeDate.replace(' ', 'T')).getTime()
        return Number.isFinite(ts) && ts >= previousCutoff && ts < cutoff ? sum + trade.pnl : sum
      }, 0)
    : null
  const comparison = previousNet === null ? null : periodNet - previousNet
  const isScrubbing = scrubIndex !== null && scrubIndex >= 0 && scrubIndex < values.length
  const activeValue = (isScrubbing ? values[scrubIndex] : periodNet) ?? 0
  const lineColor = activeValue < 0 ? colors.down : colors.up

  // The viewBox tracks the real rendered width so the SVG never has to be
  // stretched to fit. Scaling it non-uniformly is what turned the marker dots
  // into ellipses and made the stroke weight drift.
  const chartWidth = Math.max(1, Math.round(chartContainerWidth))
  const chartHeight = 175
  const top = 14
  const bottom = 150
  const rightGutter = 44 // room for the value labels
  const plotWidth = Math.max(1, chartWidth - rightGutter)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const span = Math.max(1, rawMax - rawMin)
  const min = rawMin - span * 0.12
  const max = rawMax + span * 0.12

  const yFor = (value: number) => top + ((max - value) / Math.max(1, max - min)) * (bottom - top)
  const points = values.map((value, index) => ({
    x: values.length === 1 ? 0 : (index / Math.max(1, values.length - 1)) * plotWidth,
    y: yFor(value)
  }))

  // Catmull-Rom control points with the handles clamped inside each segment, so
  // the curve reads as smooth without inventing highs or lows the trader never
  // actually hit.
  function curvedPath(pts: Array<{ x: number; y: number }>) {
    const first = pts[0]
    if (!first) return ''
    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p1 = pts[i]
      const p2 = pts[i + 1]
      if (!p1 || !p2) continue
      const p0 = pts[i - 1] ?? p1
      const p3 = pts[i + 2] ?? p2
      const lo = Math.min(p1.y, p2.y)
      const hi = Math.max(p1.y, p2.y)
      const clamp = (y: number) => Math.max(lo, Math.min(hi, y))
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = clamp(p1.y + (p2.y - p0.y) / 6)
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = clamp(p2.y - (p3.y - p1.y) / 6)
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return d
  }

  const linePath = curvedPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1]?.x.toFixed(1) ?? 0} ${chartHeight} L 0 ${chartHeight} Z`
  const zeroY = yFor(0)
  const last = points[points.length - 1] ?? { x: 0, y: zeroY }
  const activePoint = isScrubbing ? points[scrubIndex] : last
  const gridLines = [max, (max + min) / 2, min]

  const handleTouch = (evt: any) => {
    const x = evt.nativeEvent.locationX
    if (typeof x === 'number' && plotWidth > 0) {
      // Mapped against the plot area rather than the full container, or the
      // marker drifts away from the finger by the width of the label gutter.
      const ratio = Math.max(0, Math.min(1, x / plotWidth))
      const idx = Math.round(ratio * (values.length - 1))
      if (idx !== scrubIndex) triggerHaptic('selection')
      setScrubIndex(idx)
    }
  }

  const activeTrade = isScrubbing && scrubIndex > 0 ? periodTrades[scrubIndex - 1] : null
  const activeSubtext = isScrubbing
    ? (scrubIndex === 0 ? 'START OF PERIOD' : `${activeTrade?.symbol || 'TRADE'} · ${shortDate(activeTrade?.tradeDate || '')}`)
    : `${periodTrades.length} trade${periodTrades.length === 1 ? '' : 's'} in this range`

  return (
    <LinearGradient
      colors={colors.panelGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.chartPanel}
    >
      <View style={[styles.actionRow, styles.centeredRow]}>
        <View style={styles.flexOne}>
          <Text style={styles.kicker}>{isScrubbing ? 'TOUCH SCRUB READOUT' : 'CUMULATIVE P&L'}</Text>
          <ScrubAnimatedNumber value={activeValue} style={[styles.chartValue, { color: lineColor }]} />
          <Text style={styles.muted}>{activeSubtext}</Text>
          {!isScrubbing && comparison !== null ? (
            <Text style={[styles.chartComparison, { color: comparison < 0 ? colors.down : colors.up }]}>
              {comparison >= 0 ? 'Up ' : 'Down '}{money(Math.abs(comparison))} versus the previous {range}
            </Text>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: isScrubbing ? colors.accentSoft : `${lineColor}22` }]}>
          <Text style={[styles.pillText, { color: isScrubbing ? colors.accent : lineColor }]}>
            {isScrubbing ? 'SCRUBBING' : range}
          </Text>
        </View>
      </View>

      <Animated.View
        style={[styles.chart, { opacity: chartAnim }]}
        onLayout={(e) => setChartContainerWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setScrubIndex(null)}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Defs>
            <SvgLinearGradient id="pnlArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.34" />
              <Stop offset="0.72" stopColor={lineColor} stopOpacity="0.07" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
            </SvgLinearGradient>
            <SvgLinearGradient id="pnlLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.55" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>

          {gridLines.map((value, index) => (
            <Fragment key={`grid-${index}`}>
              <Line
                x1="0" y1={yFor(value)} x2={plotWidth} y2={yFor(value)}
                stroke={colors.line} strokeWidth="1" opacity={index === 1 ? 0.35 : 0.55}
              />
              <SvgText
                x={plotWidth + 7} y={yFor(value) + 3.5}
                fill={colors.faint} fontSize="9" fontWeight="700"
              >
                {compactMoney(value)}
              </SvgText>
            </Fragment>
          ))}

          {/* Breakeven is the line that actually matters, so it stays visually
              distinct from the evenly-spaced value grid. */}
          {zeroY > top && zeroY < bottom ? (
            <Line x1="0" y1={zeroY} x2={plotWidth} y2={zeroY} stroke={colors.dim} strokeWidth="1" strokeDasharray="4 5" opacity="0.7" />
          ) : null}

          {periodTrades.length ? <Path d={areaPath} fill="url(#pnlArea)" /> : null}
          <Path d={linePath} fill="none" stroke="url(#pnlLine)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />

          {activePoint ? (
            <>
              {isScrubbing ? (
                <Line x1={activePoint.x} y1={top} x2={activePoint.x} y2={bottom} stroke={lineColor} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
              ) : null}
              <Circle cx={activePoint.x} cy={activePoint.y} r={isScrubbing ? 11 : 9} fill={lineColor} opacity="0.16" />
              <Circle cx={activePoint.x} cy={activePoint.y} r={isScrubbing ? 6 : 5} fill={colors.bg} stroke={lineColor} strokeWidth="2.4" />
            </>
          ) : null}
        </Svg>
      </Animated.View>

      <View style={styles.chartRanges}>
        {PNL_RANGES.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={`Show ${option.key} P and L`}
            onPress={() => changeRange(option.key)}
            style={[styles.chartRange, range === option.key ? styles.chartRangeActive : null]}
          >
            <Text style={[styles.chartRangeText, range === option.key ? { color: colors.accent } : null]}>{option.key}</Text>
          </Pressable>
        ))}
      </View>
    </LinearGradient>
  )
}

function TraderQuoteBanner({ colors, styles }: { colors: Palette; styles: ReturnType<typeof createStyles> }) {
  const dailyQuote = useMemo(() => getDailyQuote(), [])
  return (
    <View style={styles.quoteCard}>
      <View style={styles.actionRow}>
        <Quote color={colors.accent} size={18} strokeWidth={2} />
        <View style={styles.flexOne}>
          <Text style={styles.quoteText}>"{dailyQuote.quote}"</Text>
          <Text style={styles.quoteAuthor}>— {dailyQuote.author}</Text>
        </View>
      </View>
    </View>
  )
}

function ShareStatModal({
  trades,
  onClose,
  colors,
  styles
}: {
  trades: MobileTrade[]
  onClose: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const stats = useMemo(() => computeMobileStats(trades), [trades])
  const today = localTimestamp().slice(0, 10)
  const todayTrades = trades.filter((t) => t.tradeDate.slice(0, 10) === today)
  const todayPnl = todayTrades.reduce((sum, t) => sum + t.pnl, 0)
  const todayGrade = todayTrades.length && todayTrades[0] ? computeTradeGrade(todayTrades[0]).grade : 'A+'

  function copySummary() {
    triggerHaptic('success')
    const summary = `📈 TradeHelp Session Recap\nDate: ${today}\nDaily P&L: ${money(todayPnl)}\nTrades: ${todayTrades.length}\nWin Rate: ${percent(stats.winRate)}\nGrade: ${todayGrade}\nTop Setup: ${stats.topSetup}`
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(summary)
    }
    Alert.alert('Summary Copied!', 'Session summary copied to clipboard to share with your trading partners!')
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.lightboxOverlay}>
        <View style={styles.shareCard}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.flexOne}>
              <Text style={styles.eyebrow}>SESSION CARD</Text>
              <Text style={styles.panelTitle}>Share Session Stats</Text>
            </View>
            <Pressable style={styles.compactButton} onPress={onClose}>
              <Text style={styles.compactButtonText}>Close</Text>
            </Pressable>
          </View>

          <LinearGradient colors={colors.panelGradient} style={styles.shareGraphic}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <View style={styles.logo}>
                <View style={[styles.candle, { height: 12, backgroundColor: colors.down }]} />
                <View style={[styles.candle, { height: 19, backgroundColor: colors.accent }]} />
                <View style={[styles.candle, { height: 15, backgroundColor: colors.up }]} />
              </View>
              <Text style={styles.brand}>Trade<Text style={{ color: colors.accent }}>Help</Text></Text>
              <View style={[styles.gradeBadge, { backgroundColor: todayPnl >= 0 ? colors.upSoft : colors.downSoft }]}>
                <Text style={[styles.gradeText, { color: todayPnl >= 0 ? colors.up : colors.down }]}>{todayGrade}</Text>
              </View>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <Text style={styles.heroLabel}>TODAY'S NET P&L</Text>
              <Text style={[styles.heroValue, { color: todayPnl >= 0 ? colors.up : colors.down, fontSize: 36 }]}>{money(todayPnl)}</Text>
            </View>

            <View style={styles.heroMetrics}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>TRADES</Text>
                <Text style={styles.heroMetricValue}>{todayTrades.length}</Text>
              </View>
              <View style={[styles.heroMetric, styles.heroMetricBorder]}>
                <Text style={styles.heroMetricLabel}>WIN RATE</Text>
                <Text style={styles.heroMetricValue}>{percent(stats.winRate)}</Text>
              </View>
              <View style={[styles.heroMetric, styles.heroMetricBorder]}>
                <Text style={styles.heroMetricLabel}>TOP SETUP</Text>
                <Text style={styles.heroMetricValue}>{stats.topSetup.split(' ')[0]}</Text>
              </View>
            </View>
          </LinearGradient>

          <Pressable style={styles.primaryButton} onPress={copySummary}>
            <View style={styles.buttonContent}>
              <Share2 color="#17130B" size={17} strokeWidth={2.3} />
              <Text style={styles.primaryButtonText}>Copy Session Summary</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function WatchlistSection({
  watchlist,
  onAdd,
  onDelete,
  colors,
  styles
}: {
  watchlist: WatchlistItem[]
  onAdd: (symbol: string, bias: 'Bullish' | 'Bearish' | 'Neutral', keyLevel: string, notes: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [adding, setAdding] = useState(false)
  const [symbol, setSymbol] = useState('')
  const [bias, setBias] = useState<'Bullish' | 'Bearish' | 'Neutral'>('Bullish')
  const [keyLevel, setKeyLevel] = useState('')
  const [notes, setNotes] = useState('')

  async function submit() {
    if (!symbol.trim()) return
    triggerHaptic('success')
    await onAdd(symbol.trim(), bias, keyLevel.trim(), notes.trim())
    setSymbol('')
    setKeyLevel('')
    setNotes('')
    setAdding(false)
  }

  return (
    <View style={styles.panel}>
      <View style={[styles.actionRow, styles.centeredRow]}>
        <View style={styles.flexOne}>
          <Text style={styles.kicker}>PRE-MARKET PREP</Text>
          <Text style={styles.panelTitle}>Watchlist & Bias</Text>
        </View>
        <Pressable style={styles.compactButton} onPress={() => setAdding(!adding)}>
          <Text style={styles.compactButtonText}>{adding ? 'Cancel' : '+ Add Ticker'}</Text>
        </Pressable>
      </View>

      {adding ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <TextInput
            autoCapitalize="characters"
            placeholder="Symbol (e.g. NQ, TSLA)"
            placeholderTextColor={colors.dim}
            style={styles.input}
            value={symbol}
            onChangeText={setSymbol}
          />
          <View style={styles.segment}>
            {(['Bullish', 'Bearish', 'Neutral'] as const).map((b) => (
              <Pressable
                key={b}
                onPress={() => setBias(b)}
                style={[styles.segmentOption, bias === b ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentText, bias === b ? { color: b === 'Bullish' ? colors.up : b === 'Bearish' ? colors.down : colors.accent } : null]}>{b}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            placeholder="Key Level (e.g. 20,450 VWAP)"
            placeholderTextColor={colors.dim}
            style={styles.input}
            value={keyLevel}
            onChangeText={setKeyLevel}
          />
          <TextInput
            placeholder="Plan Notes (e.g. Watch opening bell breakout)"
            placeholderTextColor={colors.dim}
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
          />
          <Pressable style={styles.primaryButton} onPress={submit}>
            <Text style={styles.primaryButtonText}>Save to Watchlist</Text>
          </Pressable>
        </View>
      ) : !watchlist.length ? (
        <Text style={styles.muted}>No tickers on watchlist yet. Add tickers to plan your trading session.</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          {watchlist.map((item) => {
            const tone = item.bias === 'Bullish' ? colors.up : item.bias === 'Bearish' ? colors.down : colors.accent
            return (
              <View key={item.id} style={styles.watchCard}>
                <View style={[styles.actionRow, styles.centeredRow]}>
                  <View style={[styles.pill, { backgroundColor: item.bias === 'Bullish' ? colors.upSoft : item.bias === 'Bearish' ? colors.downSoft : colors.accentSoft }]}>
                    <Text style={[styles.pillText, { color: tone }]}>{item.bias.toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.panelTitle, styles.flexOne]}>{item.symbol}</Text>
                  {item.keyLevel ? <Text style={[styles.pillText, { color: colors.text }]}>{item.keyLevel}</Text> : null}
                  <Pressable style={styles.compactButton} onPress={() => onDelete(item.id)}>
                    <Trash2 color={colors.down} size={14} strokeWidth={2} />
                  </Pressable>
                </View>
                {item.planNotes ? <Text style={styles.muted}>{item.planNotes}</Text> : null}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function CalendarView({
  trades,
  onSelectDate,
  colors,
  styles
}: {
  trades: MobileTrade[]
  onSelectDate: (dateStr: string) => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [activeMonth, setActiveMonth] = useState(() => new Date())
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(() => String(new Date().getFullYear()))

  const year = activeMonth.getFullYear()
  const month = activeMonth.getMonth()

  const monthName = activeMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const dailyPnlMap = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number }>()
    for (const t of trades) {
      const dayStr = t.tradeDate.slice(0, 10)
      const curr = map.get(dayStr) || { pnl: 0, count: 0 }
      curr.pnl += t.pnl
      curr.count++
      map.set(dayStr, curr)
    }
    return map
  }, [trades])

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  const daysGrid = []
  for (let i = 0; i < firstDayOfWeek; i++) daysGrid.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`
    const stats = dailyPnlMap.get(dateStr)
    daysGrid.push({ day: d, dateStr, pnl: stats?.pnl ?? null, count: stats?.count ?? 0 })
  }

  function prevMonth() {
    triggerHaptic('light')
    setActiveMonth(new Date(year, month - 1, 1))
  }

  function nextMonth() {
    triggerHaptic('light')
    setActiveMonth(new Date(year, month + 1, 1))
  }

  return (
    <LinearGradient colors={colors.panelGradient} style={styles.calendarCard}>
      <View style={[styles.actionRow, styles.centeredRow]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" style={styles.compactButton} onPress={prevMonth}>
          <ChevronLeft color={colors.text} size={18} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Jump from ${monthName} to another month`}
          style={[styles.calendarMonthButton, styles.flexOne]}
          onPress={() => {
            setJumpYear(String(year))
            setJumpOpen(true)
          }}
        >
          <Text style={[styles.panelTitle, { textAlign: 'center' }]}>{monthName}</Text>
          <Text style={styles.calendarJumpHint}>Jump to month</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" style={styles.compactButton} onPress={nextMonth}>
          <ChevronRight color={colors.text} size={18} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.calendarWeekHeader}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => (
          <Text key={`w-${idx}`} style={styles.calendarWeekText}>{w}</Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {daysGrid.map((item, idx) => {
          if (!item) return <View key={`empty-${idx}`} style={styles.calendarCellEmpty} />
          const isWin = item.pnl !== null && item.pnl > 0
          const isLoss = item.pnl !== null && item.pnl < 0
          const bg = isWin ? colors.upSoft : isLoss ? colors.downSoft : colors.surface2
          const tone = isWin ? colors.up : isLoss ? colors.down : colors.dim
          return (
            <Pressable
              key={item.dateStr}
              accessibilityRole="button"
              accessibilityLabel={`${item.dateStr}${item.pnl !== null ? `, ${money(item.pnl)}` : ', no trades'}`}
              accessibilityState={{ disabled: item.count === 0 }}
              disabled={item.count === 0}
              style={[styles.calendarCell, { backgroundColor: bg }]}
              onPress={() => {
                if (item.count > 0) {
                  triggerHaptic('light')
                  onSelectDate(item.dateStr)
                }
              }}
            >
              <Text style={styles.calendarDayNum}>{item.day}</Text>
              {item.pnl !== null ? (
                <Text style={[styles.calendarPnlText, { color: tone }]} numberOfLines={1}>
                  {item.pnl >= 0 ? `+$${Math.round(item.pnl)}` : `-$${Math.abs(Math.round(item.pnl))}`}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      <Modal visible={jumpOpen} transparent animationType="fade" onRequestClose={() => setJumpOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Close month picker" style={styles.sheetScrim} onPress={() => setJumpOpen(false)} />
          <View style={styles.monthPickerSheet}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <View style={styles.flexOne}>
                <Text style={styles.kicker}>HISTORY</Text>
                <Text style={styles.sheetTitle}>Jump to a month</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close month picker" style={styles.iconButton} onPress={() => setJumpOpen(false)}>
                <XCircle color={colors.text} size={20} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.label}>Year</Text>
            <TextInput
              accessibilityLabel="Year"
              keyboardType="number-pad"
              maxLength={4}
              value={jumpYear}
              onChangeText={setJumpYear}
              style={styles.input}
            />
            <View style={styles.monthGrid}>
              {Array.from({ length: 12 }, (_, index) => {
                const label = new Date(2020, index, 1).toLocaleDateString(undefined, { month: 'short' })
                const selected = Number(jumpYear) === year && index === month
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} ${jumpYear}`}
                    onPress={() => {
                      const parsedYear = Number(jumpYear)
                      if (!Number.isInteger(parsedYear) || parsedYear < 1990 || parsedYear > 2100) return
                      setActiveMonth(new Date(parsedYear, index, 1))
                      setJumpOpen(false)
                    }}
                    style={[styles.monthButton, selected ? styles.segmentActive : null]}
                  >
                    <Text style={[styles.segmentText, selected ? { color: colors.accent } : null]}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  )
}

function EdgeAnalyticsCard({ trades, colors, styles }: { trades: MobileTrade[]; colors: Palette; styles: ReturnType<typeof createStyles> }) {
  const edges = useMemo(() => computeEdgeStats(trades), [trades])
  const topEdge = edges.find((e) => e.isTopEdge) || edges[0]
  const leak = edges.find((e) => e.isLeak)

  if (!edges.length) return null

  return (
    <View style={styles.panel}>
      <View style={[styles.actionRow, styles.centeredRow]}>
        <View style={styles.flexOne}>
          <Text style={styles.kicker}>EDGE REFINING</Text>
          <Text style={styles.panelTitle}>Setup pattern signals</Text>
        </View>
        <Target color={colors.accent} size={18} strokeWidth={2} />
      </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        {topEdge ? (
          <View style={styles.edgeItem}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <Award color={colors.up} size={16} strokeWidth={2} />
              <Text style={[styles.panelTitle, styles.flexOne]}>
                {topEdge.count >= EDGE_SAMPLE_THRESHOLD ? 'Established edge' : 'Early signal'}: {topEdge.name}
              </Text>
              <View style={[styles.pill, { backgroundColor: colors.upSoft }]}>
                <Text style={[styles.pillText, { color: colors.up }]}>
                  {topEdge.count} {topEdge.count === 1 ? 'TRADE' : 'TRADES'}
                </Text>
              </View>
            </View>
            <Text style={styles.muted}>
              {topEdge.winRate}% win rate and {money(topEdge.expectancy)} expectancy per trade.
              {topEdge.count < EDGE_SAMPLE_THRESHOLD ? ` ${EDGE_SAMPLE_THRESHOLD - topEdge.count} more needed before this graduates to an edge.` : ''}
            </Text>
          </View>
        ) : null}

        {leak ? (
          <View style={styles.edgeItem}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <XCircle color={colors.down} size={16} strokeWidth={2} />
              <Text style={[styles.panelTitle, styles.flexOne]}>
                {leak.count >= EDGE_SAMPLE_THRESHOLD ? 'Confirmed leak' : 'Possible leak'}: {leak.name}
              </Text>
              <View style={[styles.pill, { backgroundColor: colors.downSoft }]}>
                <Text style={[styles.pillText, { color: colors.down }]}>
                  {leak.count} {leak.count === 1 ? 'TRADE' : 'TRADES'}
                </Text>
              </View>
            </View>
            <Text style={styles.muted}>
              {leak.winRate}% win rate and {money(leak.netPnl)} net P&L.
              {leak.count < EDGE_SAMPLE_THRESHOLD ? ' Treat this as a review prompt while the sample grows.' : ' Consider tightening rules for this setup.'}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function actionableInsight(trades: MobileTrade[]) {
  if (trades.length < 3) {
    return {
      title: 'Your edge is still forming',
      body: `Log ${3 - trades.length} more trade${3 - trades.length === 1 ? '' : 's'} to unlock a meaningful pattern.`,
      tone: 'neutral' as const
    }
  }

  const timeframeMap = new Map<string, { wins: number; count: number; pnl: number }>()
  for (const trade of trades) {
    const timeframe = trade.timeframe.trim()
    if (!timeframe) continue
    const current = timeframeMap.get(timeframe) || { wins: 0, count: 0, pnl: 0 }
    current.count += 1
    current.pnl += trade.pnl
    if (trade.pnl > 0) current.wins += 1
    timeframeMap.set(timeframe, current)
  }
  const timeframeLeak = [...timeframeMap.entries()]
    .filter(([, value]) => value.count >= 3 && value.pnl < 0)
    .sort((a, b) => a[1].pnl - b[1].pnl)[0]

  if (timeframeLeak) {
    const [name, value] = timeframeLeak
    return {
      title: `${name} trades need attention`,
      body: `${Math.round((value.wins / value.count) * 100)}% win rate and ${money(value.pnl)} across ${value.count} trades. Review execution before adding more size.`,
      tone: 'warning' as const
    }
  }

  const edges = computeEdgeStats(trades)
  const top = edges.find((edge) => edge.isTopEdge) || edges[0]
  if (top && top.netPnl > 0) {
    if (top.count < EDGE_SAMPLE_THRESHOLD) {
      return {
        title: `${top.name} is an early signal`,
        body: `${top.winRate}% win rate across ${top.count} trade${top.count === 1 ? '' : 's'}. Add ${EDGE_SAMPLE_THRESHOLD - top.count} more before treating it as an established edge.`,
        tone: 'neutral' as const
      }
    }
    return {
      title: `${top.name} is leading your journal`,
      body: `${top.winRate}% win rate with ${money(top.expectancy)} expectancy per trade across ${top.count} trades.`,
      tone: 'positive' as const
    }
  }

  return {
    title: 'Protect the process',
    body: 'No setup has separated itself yet. Keep risk consistent while the sample grows.',
    tone: 'neutral' as const
  }
}

function SessionReviewModal({
  date,
  review,
  onSave,
  onClose,
  colors,
  styles
}: {
  date: string
  review: DailyReview | null
  onSave: (review: DailyReview) => Promise<void>
  onClose: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [planQuality, setPlanQuality] = useState<DailyReview['planQuality']>(review?.planQuality || 'Mostly')
  const [mindset, setMindset] = useState<DailyReview['mindset']>(review?.mindset || 'Calm')
  const [takeaway, setTakeaway] = useState(review?.takeaway || '')
  const [saving, setSaving] = useState(false)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.lightboxOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.reviewModalCard}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.flexOne}>
              <Text style={styles.eyebrow}>Session review</Text>
              <Text style={styles.title}>Close the loop.</Text>
            </View>
            <Pressable style={styles.compactButton} onPress={onClose}>
              <Text style={styles.compactButtonText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.reviewQuestion}>
            <Text style={styles.panelTitle}>Did your decisions match the plan?</Text>
            <View style={styles.segment}>
              {(['Yes', 'Mostly', 'No'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setPlanQuality(option)}
                  style={[styles.segmentOption, planQuality === option ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, planQuality === option ? { color: colors.accent } : null]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.reviewQuestion}>
            <Text style={styles.panelTitle}>How did the session feel?</Text>
            <View style={styles.segment}>
              {(['Calm', 'Mixed', 'Emotional'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setMindset(option)}
                  style={[styles.segmentOption, mindset === option ? styles.segmentActive : null]}
                >
                  <Text style={[styles.segmentText, mindset === option ? { color: colors.accent } : null]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.reviewQuestion}>
            <Text style={styles.panelTitle}>One takeaway for next time</Text>
            <TextInput
              value={takeaway}
              onChangeText={setTakeaway}
              placeholder="What should you repeat or change?"
              placeholderTextColor={colors.faint}
              style={[styles.input, styles.notes]}
              multiline
              maxLength={500}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, saving ? styles.disabledButton : null]}
            disabled={saving}
            onPress={async () => {
              setSaving(true)
              try {
                await onSave({
                  date,
                  planQuality,
                  mindset,
                  takeaway: takeaway.trim(),
                  completedAt: new Date().toISOString()
                })
                triggerHaptic('success')
                onClose()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving
              ? <ActivityIndicator color="#17130B" />
              : <Text style={styles.primaryButtonText}>Save session review</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Home({
  trades,
  pending,
  watchlist,
  onAddWatchlist,
  onDeleteWatchlist,
  onSync,
  syncing,
  paired,
  demoCount,
  onLoadDemo,
  onClearDemo,
  rules,
  news,
  dailyReview,
  onSaveReview,
  onOpenHistory,
  onOpenSettings,
  colors,
  styles
}: {
  trades: MobileTrade[]
  pending: number
  watchlist: WatchlistItem[]
  onAddWatchlist: (symbol: string, bias: 'Bullish' | 'Bearish' | 'Neutral', keyLevel: string, notes: string) => Promise<void>
  onDeleteWatchlist: (id: string) => Promise<void>
  onSync: () => void
  syncing: boolean
  paired: boolean
  demoCount: number
  onLoadDemo: () => void
  onClearDemo: () => void
  rules: string[]
  news: NewsState
  dailyReview: DailyReview | null
  onSaveReview: (review: DailyReview) => Promise<void>
  onOpenHistory: () => void
  onOpenSettings: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [sharing, setSharing] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const today = localTimestamp().slice(0, 10)
  const todayTrades = trades.filter((trade) => trade.tradeDate.slice(0, 10) === today)
  const todayPnl = todayTrades.reduce((sum, trade) => sum + trade.pnl, 0)
  const todayWins = todayTrades.filter((trade) => trade.pnl > 0).length
  const todayWinRate = todayTrades.length ? todayWins / todayTrades.length : null
  const nextHighImpact = news.events
    .filter((event) => event.ts > Date.now() && event.impact.toLowerCase() === 'high')
    .sort((a, b) => a.ts - b.ts)[0]
  const sessionDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={paired
        ? <RefreshControl refreshing={syncing} onRefresh={onSync} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />
        : undefined}
    >
      <View style={styles.pageIntro}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>Today's session</Text>
          <Text style={styles.title}>{sessionDate}</Text>
        </View>
        <Pressable style={styles.compactButton} onPress={() => { triggerHaptic('light'); setSharing(true) }}>
          <View style={styles.actionRow}>
            <Share2 color={colors.accent} size={14} strokeWidth={2} />
            <Text style={[styles.compactButtonText, { color: colors.accent }]}>Share</Text>
          </View>
        </Pressable>
      </View>

      {demoCount > 0 ? (
        <View style={styles.demoBanner}>
          <View style={styles.flexOne}>
            <Text style={styles.demoBannerTitle}>Sample data</Text>
            <Text style={styles.demoBannerCopy}>{demoCount} example trades are included in these totals.</Text>
          </View>
          <View style={styles.demoBannerActions}>
            <Pressable style={styles.demoBannerButton} onPress={onLoadDemo} accessibilityRole="button">
              <RefreshCw color={colors.accent} size={13} strokeWidth={2.2} />
              <Text style={styles.demoBannerButtonText}>Reload</Text>
            </Pressable>
            <Pressable style={styles.demoBannerButton} onPress={onClearDemo} accessibilityRole="button">
              <Text style={styles.demoBannerButtonText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      ) : (__DEV__ || Platform.OS === 'web') ? (
        <View style={styles.demoBanner}>
          <View style={styles.flexOne}>
            <Text style={styles.demoBannerTitle}>Development preview</Text>
            <Text style={styles.demoBannerCopy}>Load a two-week journal to exercise every mobile view.</Text>
          </View>
          <Pressable style={styles.demoBannerButton} onPress={onLoadDemo} accessibilityRole="button">
            <Text style={styles.demoBannerButtonText}>Load demo</Text>
          </Pressable>
        </View>
      ) : null}

      <LinearGradient
        colors={colors.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.heroTopline}>
          <Text style={styles.heroLabel}>Daily P&L</Text>
          <TrendingUp color={todayPnl < 0 ? colors.down : colors.accentBright} size={18} strokeWidth={2} />
        </View>
        <ScrubAnimatedNumber value={todayPnl} duration={480} style={[styles.heroValue, { color: todayPnl < 0 ? colors.down : colors.text }]} />
        <Text style={styles.heroCaption}>
          {todayTrades.length
            ? `${todayTrades.length} trade${todayTrades.length === 1 ? '' : 's'} logged today`
            : 'Your session is clear. Log a trade when you are ready.'}
        </Text>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Trades</Text>
            <Text style={styles.heroMetricValue}>{todayTrades.length}</Text>
          </View>
          <View style={[styles.heroMetric, styles.heroMetricBorder]}>
            <Text style={styles.heroMetricLabel}>Win rate</Text>
            <Text style={styles.heroMetricValue}>{percent(todayWinRate)}</Text>
          </View>
          <View style={[styles.heroMetric, styles.heroMetricBorder]}>
            <Text style={styles.heroMetricLabel}>Queued</Text>
            <Text style={styles.heroMetricValue}>{pending}</Text>
          </View>
        </View>
      </LinearGradient>

      <LinearGradient colors={colors.panelGradient} style={styles.adaptiveCard}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <View style={[styles.featureIcon, { backgroundColor: todayTrades.length ? colors.upSoft : colors.accentSoft }]}>
            {todayTrades.length
              ? <BookOpen color={dailyReview ? colors.up : colors.accent} size={20} strokeWidth={2} />
              : <Target color={colors.accent} size={20} strokeWidth={2} />}
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.panelTitle}>
              {todayTrades.length
                ? dailyReview ? 'Session reviewed' : 'Close the loop when you are done'
                : 'Before the first entry'}
            </Text>
            <Text style={styles.muted}>
              {todayTrades.length
                ? dailyReview
                  ? `${dailyReview.planQuality} on plan · ${dailyReview.mindset} mindset`
                  : 'A short session-level reflection, separate from each trade checklist.'
                : `${rules.length} trading rule${rules.length === 1 ? '' : 's'} ready${nextHighImpact ? ` · ${nextHighImpact.title} ${untilNews(nextHighImpact.ts, Date.now())}` : ''}.`}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={todayTrades.length ? () => setReviewing(true) : onOpenSettings}
        >
          <Text style={styles.secondaryButtonText}>
            {todayTrades.length ? dailyReview ? 'Update session review' : 'Review today’s session' : 'Review trading rules'}
          </Text>
        </Pressable>
        {todayTrades.length ? (
          <Pressable style={styles.textAction} onPress={onOpenHistory}>
            <Text style={styles.textActionLabel}>Explore today’s trades</Text>
            <ChevronRight color={colors.accent} size={16} strokeWidth={2} />
          </Pressable>
        ) : null}
      </LinearGradient>

      <WatchlistSection watchlist={watchlist} onAdd={onAddWatchlist} onDelete={onDeleteWatchlist} colors={colors} styles={styles} />

      <TraderQuoteBanner colors={colors} styles={styles} />

      <View style={styles.syncCard}>
        <View style={[styles.featureIcon, { backgroundColor: paired ? colors.upSoft : colors.accentSoft }]}>
          {paired
            ? <Wifi color={colors.up} size={20} strokeWidth={2} />
            : <Smartphone color={colors.accent} size={20} strokeWidth={2} />}
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.panelTitle}>Desktop sync</Text>
          <Text style={styles.muted}>{paired ? `${pending} queued change${pending === 1 ? '' : 's'}` : 'Pair from Settings when your desktop is nearby.'}</Text>
        </View>
        {paired ? (
          <Pressable style={styles.compactButton} onPress={onSync} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color={colors.text} size="small" />
              : <RefreshCw color={colors.text} size={15} strokeWidth={2.2} />}
          </Pressable>
        ) : (
          <View style={styles.pill}><Text style={styles.pillText}>OFFLINE</Text></View>
        )}
      </View>

      {sharing ? <ShareStatModal trades={trades} onClose={() => setSharing(false)} colors={colors} styles={styles} /> : null}
      {reviewing ? (
        <SessionReviewModal
          date={today}
          review={dailyReview}
          onSave={onSaveReview}
          onClose={() => setReviewing(false)}
          colors={colors}
          styles={styles}
        />
      ) : null}
    </ScrollView>
  )
}

function HoldTimeCard({
  trades,
  colors,
  styles
}: {
  trades: MobileTrade[]
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const hold = useMemo(() => computeHoldStats(trades), [trades])

  return (
    <View style={styles.panel}>
      <View style={[styles.actionRow, styles.centeredRow]}>
        <View style={[styles.featureIcon, { backgroundColor: colors.accentSoft }]}>
          <Clock color={colors.accent} size={19} strokeWidth={2} />
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.kicker}>TIME IN TRADE</Text>
          <Text style={styles.panelTitle}>How long your edge takes</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{hold.sampleSize} MEASURED</Text>
        </View>
      </View>

      {hold.sampleSize ? (
        <>
          <View style={styles.holdGrid}>
            <View style={styles.holdMetric}>
              <Text style={styles.kicker}>AVERAGE HOLD</Text>
              <Text style={styles.holdValue}>{formatHoldDuration(hold.averageMinutes)}</Text>
            </View>
            <View style={styles.holdMetric}>
              <Text style={styles.kicker}>WINNERS</Text>
              <Text style={[styles.holdValue, { color: colors.up }]}>{formatHoldDuration(hold.winnerMinutes)}</Text>
            </View>
            <View style={styles.holdMetric}>
              <Text style={styles.kicker}>LOSERS</Text>
              <Text style={[styles.holdValue, { color: colors.down }]}>{formatHoldDuration(hold.loserMinutes)}</Text>
            </View>
            <View style={styles.holdMetric}>
              <Text style={styles.kicker}>BEST WINDOW</Text>
              <Text style={[styles.holdValue, { color: colors.accent }]}>{hold.bestWindow?.label || '--'}</Text>
            </View>
          </View>
          {hold.bestWindow ? (
            <Text style={styles.muted}>
              {hold.bestWindow.label} holds produced {money(hold.bestWindow.netPnl)} across {hold.bestWindow.count} measured trade{hold.bestWindow.count === 1 ? '' : 's'}.
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.muted}>Add both entry and exit times to unlock hold-time performance.</Text>
      )}
    </View>
  )
}

function Insights({
  trades,
  colors,
  styles
}: {
  trades: MobileTrade[]
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const performance = computeMobileStats(trades)
  const insight = actionableInsight(trades)
  const insightTone = insight.tone === 'positive' ? colors.up : insight.tone === 'warning' ? colors.down : colors.accent

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageTitleStack}>
        <Text style={styles.eyebrow}>Performance intelligence</Text>
        <Text style={styles.title}>Your edge, distilled.</Text>
        <Text style={styles.copy}>Statistics stay here so the Home screen can focus on today.</Text>
      </View>

      <PnlCurve trades={trades} colors={colors} styles={styles} />

      <HoldTimeCard trades={trades} colors={colors} styles={styles} />

      <View style={[styles.insightCard, { borderColor: `${insightTone}66` }]}>
        <View style={[styles.featureIcon, { backgroundColor: `${insightTone}1F` }]}>
          <Sparkles color={insightTone} size={20} strokeWidth={2} />
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.kicker}>One thing to know</Text>
          <Text style={styles.panelTitle}>{insight.title}</Text>
          <Text style={styles.muted}>{insight.body}</Text>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionLabel}>On-device performance</Text>
          <Text style={styles.sectionTitle}>Trading pulse</Text>
        </View>
        <BarChart3 color={colors.faint} size={18} strokeWidth={1.8} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="NET P&L" value={money(performance.netPnl)} numValue={performance.netPnl} tone={performance.netPnl < 0 ? colors.down : colors.up} styles={styles} />
        <Stat label="WIN RATE" value={percent(performance.winRate)} styles={styles} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="EXPECTANCY" value={money(performance.expectancy)} numValue={performance.expectancy} tone={performance.expectancy < 0 ? colors.down : colors.up} styles={styles} />
        <Stat label="PAYOFF RATIO" value={performance.payoffRatio !== null ? `${performance.payoffRatio.toFixed(2)}x` : '--'} styles={styles} />
      </View>

      <View style={styles.snapshotPanel}>
        <View style={styles.snapshotItem}>
          <Text style={styles.kicker}>Best win</Text>
          <Text style={[styles.snapshotValue, { color: colors.up }]}>{money(performance.bestWin)}</Text>
        </View>
        <View style={styles.snapshotDivider} />
        <View style={styles.snapshotItem}>
          <Text style={styles.kicker}>Worst loss</Text>
          <Text style={[styles.snapshotValue, { color: colors.down }]}>{money(performance.worstLoss)}</Text>
        </View>
        <View style={styles.snapshotDivider} />
        <View style={styles.snapshotItem}>
          <Text style={styles.kicker}>Streak</Text>
          <Text style={styles.snapshotValue} numberOfLines={1} adjustsFontSizeToFit>{performance.streak}</Text>
        </View>
      </View>
      <View style={styles.topSetupRow}>
        <Text style={styles.kicker}>Top setup</Text>
        <Text style={styles.topSetupValue} numberOfLines={2}>{performance.topSetup}</Text>
      </View>
      {performance.ruleRate !== null
        ? <Text style={styles.muted}>Rule discipline {percent(performance.ruleRate)} across your mobile checklists.</Text>
        : null}

      <EdgeAnalyticsCard trades={trades} colors={colors} styles={styles} />
    </ScrollView>
  )
}

function News({
  state,
  loading,
  onRefresh,
  onToggle,
  onTest,
  colors,
  styles
}: {
  state: NewsState
  loading: boolean
  onRefresh: () => void
  onToggle: (enabled: boolean) => void
  onTest: () => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const upcoming = state.events.filter((event) =>
    event.ts > now && (showAll || event.impact.toLowerCase() === 'high')
  )
  const hasCachedEvents = state.events.length > 0

  function impactColor(event: EconomicEvent) {
    if (event.impact.toLowerCase() === 'high') return colors.down
    if (event.impact.toLowerCase() === 'medium') return colors.accent
    return colors.dim
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageIntro}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>ECONOMIC CALENDAR</Text>
          <Text style={styles.title}>Upcoming news.</Text>
          <Text style={styles.copy}>Know what is ahead before you enter a trade.</Text>
        </View>
        {!state.warning ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh economic calendar" style={styles.iconButton} onPress={onRefresh} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.text} size="small" />
              : <RefreshCw color={colors.text} size={18} strokeWidth={2} />}
          </Pressable>
        ) : null}
      </View>

      <LinearGradient colors={colors.panelGradient} style={styles.panel}>
        <View style={[styles.alertRow, styles.centeredRow]}>
          <View style={styles.featureIcon}>
            <BellRing color={colors.accent} size={20} strokeWidth={2} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.panelTitle}>High-impact alerts</Text>
            <Text style={styles.muted}>
              {state.enabled && state.permission === 'granted'
                ? `${state.scheduledCount} alerts scheduled at 30, 15 and 5 minutes.`
                : 'Off'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: state.enabled && state.permission === 'granted' }}
            accessibilityLabel="High-impact news alerts"
            onPress={() => onToggle(!state.enabled)}
            style={styles.toggleControl}
          >
            <View style={[styles.toggle, state.enabled && state.permission === 'granted' ? styles.toggleOn : null]}>
              <View style={[styles.toggleKnob, state.enabled && state.permission === 'granted' ? styles.toggleKnobOn : null]} />
            </View>
          </Pressable>
        </View>
        {state.permission === 'denied' ? (
          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.secondaryButtonText}>Open notification settings</Text>
          </Pressable>
        ) : null}
        {state.enabled && state.permission === 'granted' ? (
          <Pressable
            style={styles.secondaryButton}
            onPress={async () => {
              setTestMessage('')
              try {
                await onTest()
                setTestMessage('Test alert scheduled for 5 seconds from now.')
              } catch (error) {
                setTestMessage(String(error instanceof Error ? error.message : error))
              }
            }}
          >
            <Text style={styles.secondaryButtonText}>Test alert</Text>
          </Pressable>
        ) : null}
        {testMessage ? <Text style={styles.muted}>{testMessage}</Text> : null}
        {state.warning ? (
          <View style={styles.newsStatusBlock}>
            <View style={styles.newsStatusRow}>
              <Wifi color={colors.down} size={16} strokeWidth={2} />
              <View style={styles.flexOne}>
                <Text style={styles.newsStatusTitle}>Calendar refresh unavailable</Text>
                <Text style={styles.muted}>
                  {hasCachedEvents ? 'Showing the most recent calendar saved on this device.' : 'Check your connection, then try again.'}
                </Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={onRefresh} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.text} size="small" />
                : <View style={styles.buttonContent}>
                    <RefreshCw color={colors.text} size={15} strokeWidth={2.2} />
                    <Text style={styles.secondaryButtonText}>Try again</Text>
                  </View>}
            </Pressable>
          </View>
        ) : null}
        {state.refreshedAt
          ? <Text style={styles.muted}>Updated {new Date(state.refreshedAt).toLocaleString()}</Text>
          : null}
      </LinearGradient>

      <View style={styles.segment}>
        {[
          { label: 'High impact', value: false },
          { label: 'All events', value: true }
        ].map((option) => (
          <Pressable
            key={option.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: showAll === option.value }}
            onPress={() => setShowAll(option.value)}
            style={[styles.segmentOption, showAll === option.value ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, showAll === option.value ? { color: colors.accent } : null]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {!upcoming.length ? (
        <View style={styles.emptyNews}>
          <View style={styles.emptyNewsIcon}>
            <CalendarDays color={colors.accent} size={24} strokeWidth={1.8} />
          </View>
          <Text style={styles.panelTitle}>{state.warning && !hasCachedEvents ? 'Calendar unavailable' : 'Calendar is clear'}</Text>
          <Text style={[styles.muted, styles.centerText]}>
            {loading
              ? 'Refreshing the calendar...'
              : state.warning && !hasCachedEvents
                ? 'Connect to the internet to load the upcoming economic calendar.'
                : showAll
                  ? "No upcoming events remain on this week's calendar."
                  : 'No high-impact events are currently ahead.'}
          </Text>
        </View>
      ) : upcoming.map((event) => (
        <View key={event.id} style={[styles.eventCard, { borderLeftColor: impactColor(event) }]}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={[styles.impactBadge, { borderColor: impactColor(event) }]}>
              <Text style={[styles.impactText, { color: impactColor(event) }]}>{event.impact.toUpperCase()}</Text>
            </View>
            <Text style={[styles.eventCountdown, { color: event.ts - now <= 30 * 60_000 ? colors.down : colors.accent }]}>
              {untilNews(event.ts, now)}
            </Text>
          </View>
          <Text style={styles.eventTitle}>{[event.country, event.title].filter(Boolean).join(' ')}</Text>
          <Text style={styles.muted}>{newsTime(event.ts)}</Text>
          {event.forecast || event.previous ? (
            <View style={styles.eventNumbers}>
              <Text style={styles.eventNumber}>Forecast {event.forecast || '--'}</Text>
              <Text style={styles.eventNumber}>Previous {event.previous || '--'}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  )
}

function TimePickerModal({
  title,
  initialTime,
  onSelect,
  onClose,
  colors,
  styles
}: {
  title: string
  initialTime: string
  onSelect: (timeStr: string) => void
  onClose: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const parseInitial = () => {
    if (!initialTime) return { hour: '09', minute: '30', period: 'AM' }
    const parts = initialTime.trim().split(':')
    let h = parseInt(parts[0] || '9', 10)
    const m = parseInt((parts[1] || '0').slice(0, 2), 10)
    let p = 'AM'
    if (initialTime.toLowerCase().includes('pm')) p = 'PM'
    else if (initialTime.toLowerCase().includes('am')) p = 'AM'
    else if (h >= 12) {
      p = 'PM'
      if (h > 12) h -= 12
    }
    if (h === 0) h = 12
    const pad = (n: number) => String(n).padStart(2, '0')
    return { hour: pad(h), minute: pad(m), period: p }
  }

  const parsed = parseInitial()
  const [selectedHour, setSelectedHour] = useState(parsed.hour)
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute)
  const [selectedPeriod, setSelectedPeriod] = useState(parsed.period)

  const hours = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

  const presets = [
    { label: 'Now', time: () => {
      const d = new Date()
      let h = d.getHours()
      const m = d.getMinutes()
      const p = h >= 12 ? 'PM' : 'AM'
      if (h > 12) h -= 12
      if (h === 0) h = 12
      const pad = (n: number) => String(n).padStart(2, '0')
      return { hour: pad(h), minute: pad(m), period: p }
    }},
    { label: '09:30 AM (Open)', time: { hour: '09', minute: '30', period: 'AM' } },
    { label: '09:45 AM', time: { hour: '09', minute: '45', period: 'AM' } },
    { label: '10:00 AM', time: { hour: '10', minute: '00', period: 'AM' } },
    { label: '11:30 AM (Lunch)', time: { hour: '11', minute: '30', period: 'AM' } },
    { label: '03:55 PM (Close)', time: { hour: '03', minute: '55', period: 'PM' } }
  ]

  function applyPreset(p: typeof presets[0]) {
    triggerHaptic('light')
    const t = typeof p.time === 'function' ? p.time() : p.time
    setSelectedHour(t.hour)
    setSelectedMinute(t.minute)
    setSelectedPeriod(t.period)
  }

  function handleConfirm() {
    triggerHaptic('medium')
    onSelect(`${selectedHour}:${selectedMinute} ${selectedPeriod}`)
    onClose()
  }

  return (
    <View style={styles.timePickerOverlay}>
      <Pressable accessibilityLabel="Close time picker" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.timePickerCard}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <View style={styles.flexOne}>
            <Text style={styles.eyebrow}>TIME SELECTOR</Text>
            <Text style={styles.panelTitle}>{title}</Text>
          </View>
          <Pressable style={styles.compactButton} onPress={onClose}>
            <Text style={styles.compactButtonText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.timeDisplayBox}>
          <Text style={styles.timeDisplayBig}>{selectedHour}:{selectedMinute} {selectedPeriod}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {presets.map((p) => (
            <Pressable key={p.label} style={styles.presetPill} onPress={() => applyPreset(p)}>
              <Text style={styles.presetText}>{p.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.pickerColumnsRow}>
          <View style={styles.pickerCol}>
            <Text style={styles.pickerColLabel}>HOUR</Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {hours.map((h) => (
                <Pressable
                  key={h}
                  onPress={() => { triggerHaptic('light'); setSelectedHour(h) }}
                  style={[styles.pickerItem, selectedHour === h ? styles.pickerItemActive : null]}
                >
                  <Text style={[styles.pickerItemText, selectedHour === h ? styles.pickerItemTextActive : null]}>{h}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.pickerCol}>
            <Text style={styles.pickerColLabel}>MINUTE</Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {minutes.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => { triggerHaptic('light'); setSelectedMinute(m) }}
                  style={[styles.pickerItem, selectedMinute === m ? styles.pickerItemActive : null]}
                >
                  <Text style={[styles.pickerItemText, selectedMinute === m ? styles.pickerItemTextActive : null]}>{m}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.pickerCol, { flex: 0.8 }]}>
            <Text style={styles.pickerColLabel}>AM/PM</Text>
            <View style={{ gap: 6, marginTop: 2 }}>
              {['AM', 'PM'].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => { triggerHaptic('light'); setSelectedPeriod(p) }}
                  style={[styles.pickerItem, selectedPeriod === p ? styles.pickerItemActive : null]}
                >
                  <Text style={[styles.pickerItemText, selectedPeriod === p ? styles.pickerItemTextActive : null]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleConfirm}>
          <Text style={styles.primaryButtonText}>Set Time</Text>
        </Pressable>
      </View>
    </View>
  )
}

function SymbolPicker({
  selected,
  favorites,
  suggested,
  onSelect,
  onToggleFavorite,
  onClose,
  colors,
  styles
}: {
  selected: string
  favorites: string[]
  suggested: string[]
  onSelect: (symbol: string) => void
  onToggleFavorite: (symbol: string) => void
  onClose: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [query, setQuery] = useState(selected)
  const normalizedQuery = query.trim().toUpperCase().replace(/[^A-Z0-9./-]/g, '')
  const allSymbols = [...new Set([...favorites, ...suggested].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
  const matches = allSymbols.filter((symbol) => !normalizedQuery || symbol.includes(normalizedQuery)).slice(0, 12)
  const canUseQuery = Boolean(normalizedQuery) && !matches.includes(normalizedQuery)

  const symbolRow = (symbol: string) => {
    const favorite = favorites.includes(symbol)
    return (
      <View key={symbol} style={styles.symbolRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use ${symbol}`}
          onPress={() => onSelect(symbol)}
          style={styles.symbolSelect}
        >
          <Text style={styles.symbolName}>{symbol}</Text>
          {symbol === selected.toUpperCase() ? <Text style={styles.symbolSelected}>SELECTED</Text> : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${favorite ? 'Remove' : 'Add'} ${symbol} ${favorite ? 'from' : 'to'} usual symbols`}
          onPress={() => onToggleFavorite(symbol)}
          style={styles.symbolStar}
        >
          <Star color={favorite ? colors.accent : colors.dim} fill={favorite ? colors.accent : 'transparent'} size={19} strokeWidth={2} />
        </Pressable>
      </View>
    )
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.sheetOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close symbol picker" style={styles.sheetScrim} onPress={onClose} />
        <View style={styles.symbolSheet}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.flexOne}>
              <Text style={styles.kicker}>QUICK PICK</Text>
              <Text style={styles.sheetTitle}>Choose a symbol</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close symbol picker" style={styles.iconButton} onPress={onClose}>
              <XCircle color={colors.text} size={20} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Search color={colors.faint} size={17} strokeWidth={2} />
            <TextInput
              accessibilityLabel="Search or enter a symbol"
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              value={query}
              onChangeText={setQuery}
              placeholder="Search or type a ticker"
              placeholderTextColor={colors.faint}
              style={styles.searchInput}
            />
          </View>

          {canUseQuery ? (
            <Pressable accessibilityRole="button" onPress={() => onSelect(normalizedQuery)} style={styles.useSymbolButton}>
              <Plus color={colors.accent} size={17} strokeWidth={2.3} />
              <Text style={styles.useSymbolText}>Use {normalizedQuery}</Text>
            </Pressable>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.symbolList}>
            {favorites.length && !normalizedQuery ? (
              <>
                <Text style={styles.sectionLabel}>Your usuals</Text>
                {favorites.map(symbolRow)}
                <Text style={styles.sectionLabel}>Recent and watchlist</Text>
              </>
            ) : null}
            {matches.length ? matches.filter((symbol) => !favorites.includes(symbol) || Boolean(normalizedQuery)).map(symbolRow) : (
              <Text style={styles.muted}>Type a symbol above to add it to this trade.</Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const WIN_REASONS = [
  'Followed Plan',
  'Key Level Bounce',
  'Patient Entry',
  'Great R:R',
  'Volume Confirmation'
]

const LOSS_REASONS = [
  'FOMO / Chased',
  'Oversizing / Over-Leveraged',
  'Early / Forced Entry',
  'Revenge Trade',
  'Moved Stop Loss',
  'News Volatility',
  'Slippage'
]

function QuickLog({
  rules,
  accounts,
  favoriteSymbols,
  suggestedSymbols,
  onToggleFavoriteSymbol,
  onSaved,
  onClose,
  colors,
  styles
}: {
  rules: string[]
  accounts: PropAccount[]
  favoriteSymbols: string[]
  suggestedSymbols: string[]
  onToggleFavoriteSymbol: (symbol: string) => void
  onSaved: (trade: MobileTrade) => Promise<void>
  onClose?: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [form, setForm] = useState<Form>(blankForm)
  const [step, setStep] = useState<'details' | 'checklist'>('details')
  const [checks, setChecks] = useState<Array<boolean | null>>(() => rules.map(() => null))
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const notesFocused = useRef(false)

  const [pickerTarget, setPickerTarget] = useState<'entryTime' | 'exitTime' | null>(null)

  useEffect(() => setChecks(rules.map(() => null)), [rules])

  const pnlVal = Number(form.pnl) || 0
  const reasonOptions = pnlVal >= 0 ? WIN_REASONS : LOSS_REASONS

  function toggleReason(reason: string) {
    triggerHaptic('light')
    setSelectedReasons((curr) =>
      curr.includes(reason) ? curr.filter((r) => r !== reason) : [...curr, reason]
    )
  }

  function update(key: keyof Form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function revealFastNote() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 180)
  }

  function continueToChecklist() {
    const pnl = Number(form.pnl)
    if (!form.symbol.trim()) return setError('Enter a symbol.')
    if (form.pnl.trim() === '' || !Number.isFinite(pnl)) return setError('Enter a valid P&L.')
    setChecks(rules.map(() => null))
    setStep('checklist')
  }

  async function chooseScreenshot() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85
    })
    if (!result.canceled && result.assets[0]?.uri) update('screenshotUri', result.assets[0].uri)
  }

  async function finish() {
    if (checks.some((answer) => answer === null)) return setError('Answer every rule before saving.')
    const now = new Date().toISOString()
    const followed = checks.filter(Boolean).length
    const ruleChecks = rules.map((rule, index) => ({ rule, followed: Boolean(checks[index]) }))
      const trade: MobileTrade = {
        id: createLocalId(),
        createdAt: now,
        updatedAt: now,
        tradeDate: localTimestamp(),
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        pnl: Number(form.pnl) || 0,
        fees: Number(form.fees) || 0,
        timeframe: form.timeframe.trim(),
        entryTime: form.entryTime,
        exitTime: form.exitTime,
        account: form.account,
        setup: form.setup.trim(),
        notes: form.notes.trim(),
        screenshotUri: form.screenshotUri,
        ruleChecks,
        ruleSummary: `${followed}/${rules.length} post-trade rules followed`,
        reasons: selectedReasons,
        origin: 'mobile',
        desktopId: '',
        syncState: 'pending'
      }
    setSaving(true)
    try {
      await onSaved(trade)
      triggerHaptic('success')
      setForm(blankForm())
      setStep('details')
      setChecks(rules.map(() => null))
      if (onClose) onClose()
    } catch (saveError) {
      setError(String(saveError instanceof Error ? saveError.message : saveError))
    } finally {
      setSaving(false)
    }
  }

  if (step === 'checklist') {
    const followed = checks.filter(Boolean).length
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {onClose ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Close trade log" style={[styles.actionRow, styles.backAction]} onPress={onClose}>
            <ChevronLeft color={colors.accent} size={20} strokeWidth={2.4} />
            <Text style={[styles.compactButtonText, { color: colors.accent, fontSize: 14, fontWeight: '700' }]}>Close Log</Text>
          </Pressable>
        ) : null}
        <View style={styles.pageTitleStack}>
          <Text style={styles.eyebrow}>POST-TRADE CHECK · STEP 2 OF 2</Text>
          <Text style={styles.title}>Did you follow your rules?</Text>
          <Text style={styles.copy}>{form.symbol.toUpperCase()} · {money(Number(form.pnl) || 0)} · This measures execution, not whether the trade won.</Text>
        </View>

        {rules.map((rule, index) => (
          <View key={`${rule}-${index}`} style={styles.ruleCard}>
            <Text style={styles.rowText}>{rule}</Text>
            <View style={styles.answerRow}>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: checks[index] === true }} accessibilityLabel={`${rule}: followed`} onPress={() => { triggerHaptic('light'); setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? true : value)) }}
                style={[styles.answerButton, checks[index] === true ? styles.answerYes : null]}>
                <Text style={[styles.answerText, checks[index] === true ? { color: colors.up } : null]}>Followed</Text>
              </Pressable>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: checks[index] === false }} accessibilityLabel={`${rule}: broke it`} onPress={() => { triggerHaptic('light'); setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? false : value)) }}
                style={[styles.answerButton, checks[index] === false ? styles.answerNo : null]}>
                <Text style={[styles.answerText, checks[index] === false ? { color: colors.down } : null]}>Broke it</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.checkSummary}>
          <Text style={styles.panelTitle}>{followed}/{rules.length} followed</Text>
          <Text style={styles.muted}>A losing trade can still show strong execution.</Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" style={[styles.secondaryButton, styles.flexOne]} onPress={() => { setStep('details'); setError('') }}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.primaryButton, styles.flexOne]} onPress={finish} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#17130B" />
              : <View style={styles.buttonContent}>
                  <Save color="#17130B" size={17} strokeWidth={2.3} />
                  <Text style={styles.primaryButtonText}>Save locally</Text>
                </View>}
          </Pressable>
        </View>
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, styles.keyboardContent]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Close trade log" style={[styles.actionRow, styles.backAction]} onPress={onClose}>
          <ChevronLeft color={colors.accent} size={20} strokeWidth={2.4} />
          <Text style={[styles.compactButtonText, { color: colors.accent, fontSize: 14, fontWeight: '700' }]}>Close Log</Text>
        </Pressable>
      ) : null}
      <View style={styles.pageTitleStack}>
        <Text style={styles.eyebrow}>QUICK CAPTURE · STEP 1 OF 2</Text>
        <Text style={styles.title}>Log the trade.</Text>
        <Text style={styles.copy}>Keep it fast now. You can edit the details later.</Text>
      </View>

      <View style={styles.segment}>
        {(['Long', 'Short'] as const).map((direction) => {
          const isSelected = form.direction === direction
          const gradient = direction === 'Long' ? colors.upGradient : colors.downGradient
          return (
            <Pressable
              key={direction}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`${direction} trade`}
              onPress={() => update('direction', direction)}
              style={styles.segmentOption}
            >
              {isSelected ? (
                <LinearGradient
                  colors={gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 10, alignItems: 'center', justifyContent: 'center' }]}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{direction}</Text>
                </LinearGradient>
              ) : (
                <Text style={styles.segmentText}>{direction}</Text>
              )}
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.label}>Symbol</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={form.symbol ? `Change symbol, currently ${form.symbol}` : 'Choose a symbol'}
        onPress={() => setSymbolPickerOpen(true)}
        style={[styles.input, styles.symbolField]}
      >
        <View style={styles.symbolFieldCopy}>
          <Text style={form.symbol ? styles.symbolFieldValue : styles.symbolFieldPlaceholder}>
            {form.symbol || 'Choose or type a symbol'}
          </Text>
          {favoriteSymbols.includes(form.symbol.toUpperCase()) ? <Text style={styles.symbolUsual}>USUAL</Text> : null}
        </View>
        <ChevronDown color={colors.faint} size={17} strokeWidth={2} />
      </Pressable>

      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.label}>P&L</Text>
          <TextInput accessibilityLabel="Profit and loss" keyboardType="numbers-and-punctuation" placeholder="0.00" placeholderTextColor={colors.dim} style={styles.input}
            value={form.pnl} onChangeText={(value) => update('pnl', value)} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Setup</Text>
          <TextInput accessibilityLabel="Trade setup" placeholder="VWAP Reclaim" placeholderTextColor={colors.dim} style={styles.input}
            value={form.setup} onChangeText={(value) => update('setup', value)} />
        </View>
      </View>

      <Text style={styles.label}>Account</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountTagRow}>
        {[{ id: '', label: 'Live' }, ...accounts].map((account) => {
          const active = form.account === account.id
          return (
            <Pressable
              key={account.id || 'live'}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${account.label} account`}
              style={[styles.accountTag, active ? styles.accountTagActive : null]}
              onPress={() => update('account', account.id)}
            >
              <Text style={[styles.accountTagText, active ? { color: colors.accent } : null]}>{account.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={continueToChecklist}>
        <View style={styles.buttonContent}>
          <Text style={styles.primaryButtonText}>Continue to checklist</Text>
          <ChevronRight color="#17130B" size={18} strokeWidth={2.5} />
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsExpanded }}
        style={styles.detailsToggle}
        onPress={() => setDetailsExpanded((current) => !current)}
      >
        <View style={styles.flexOne}>
          <Text style={styles.detailsToggleTitle}>{detailsExpanded ? 'Hide optional details' : 'Add optional details'}</Text>
          <Text style={styles.muted}>Fees, times, reasons, notes, and chart</Text>
        </View>
        {detailsExpanded
          ? <ChevronUp color={colors.accent} size={18} strokeWidth={2.2} />
          : <ChevronDown color={colors.accent} size={18} strokeWidth={2.2} />}
      </Pressable>

      {detailsExpanded ? (
        <View style={styles.optionalDetails}>
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.label}>Fees</Text>
              <TextInput accessibilityLabel="Trade fees" keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.dim} style={styles.input}
                value={form.fees} onChangeText={(value) => update('fees', value)} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Chart timeframe</Text>
              <TextInput accessibilityLabel="Entry chart timeframe" placeholder="1m, 5m, 15m" placeholderTextColor={colors.dim} style={styles.input}
                value={form.timeframe} onChangeText={(value) => update('timeframe', value)} />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.label}>Entry Time</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Set entry time, currently ${form.entryTime || 'not set'}`}
                style={[styles.input, styles.actionRow, styles.centeredRow]}
                onPress={() => setPickerTarget('entryTime')}
              >
                <Clock color={colors.accent} size={15} strokeWidth={2} />
                <Text style={[styles.flexOne, { color: form.entryTime ? colors.text : colors.dim, fontSize: 13, fontWeight: '700' }]}>
                  {form.entryTime || 'Set Entry'}
                </Text>
                <ChevronDown color={colors.faint} size={15} strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Exit Time</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Set exit time, currently ${form.exitTime || 'not set'}`}
                style={[styles.input, styles.actionRow, styles.centeredRow]}
                onPress={() => setPickerTarget('exitTime')}
              >
                <Clock color={colors.accent} size={15} strokeWidth={2} />
                <Text style={[styles.flexOne, { color: form.exitTime ? colors.text : colors.dim, fontSize: 13, fontWeight: '700' }]}>
                  {form.exitTime || 'Set Exit'}
                </Text>
                <ChevronDown color={colors.faint} size={15} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          <Text style={styles.label}>{pnlVal >= 0 ? 'Why did this trade win?' : 'Why did this trade lose?'}</Text>
          <View style={styles.reasonWrap}>
            {reasonOptions.map((reason) => {
              const active = selectedReasons.includes(reason)
              const activeColor = pnlVal >= 0 ? colors.up : colors.down
              return (
                <Pressable
                  key={reason}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  onPress={() => toggleReason(reason)}
                  style={[
                    styles.presetPill,
                    active ? { backgroundColor: pnlVal >= 0 ? colors.upSoft : colors.downSoft, borderColor: activeColor } : null
                  ]}
                >
                  <Text style={[styles.presetText, active ? { color: activeColor } : null]}>{reason}</Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={styles.label}>Fast note</Text>
          <TextInput accessibilityLabel="Fast trade note" multiline placeholder="What happened?" placeholderTextColor={colors.dim} style={[styles.input, styles.notes]}
            value={form.notes}
            onChangeText={(value) => update('notes', value)}
            onFocus={() => { notesFocused.current = true; revealFastNote() }}
            onBlur={() => { notesFocused.current = false }}
            onContentSizeChange={() => { if (notesFocused.current) revealFastNote() }}
          />

          {form.screenshotUri ? (
            <View style={styles.imagePreview}>
              <Image source={{ uri: form.screenshotUri }} style={styles.previewImage} />
              <Pressable accessibilityRole="button" style={styles.compactButton} onPress={() => update('screenshotUri', '')}>
                <Text style={styles.compactButtonText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={chooseScreenshot}>
              <View style={styles.buttonContent}>
                <ImagePlus color={colors.text} size={17} strokeWidth={2} />
                <Text style={styles.secondaryButtonText}>Attach chart screenshot</Text>
              </View>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={continueToChecklist}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.primaryButtonText}>Continue to checklist</Text>
              <ChevronRight color="#17130B" size={18} strokeWidth={2.5} />
            </View>
          </Pressable>
        </View>
      ) : null}

      {pickerTarget ? (
        <TimePickerModal
          title={pickerTarget === 'entryTime' ? 'Select Entry Time' : 'Select Exit Time'}
          initialTime={pickerTarget === 'entryTime' ? form.entryTime : form.exitTime}
          onSelect={(timeStr) => update(pickerTarget, timeStr)}
          onClose={() => setPickerTarget(null)}
          colors={colors}
          styles={styles}
        />
      ) : null}
      {symbolPickerOpen ? (
        <SymbolPicker
          selected={form.symbol}
          favorites={favoriteSymbols}
          suggested={suggestedSymbols}
          onSelect={(symbol) => {
            update('symbol', symbol)
            setSymbolPickerOpen(false)
          }}
          onToggleFavorite={onToggleFavoriteSymbol}
          onClose={() => setSymbolPickerOpen(false)}
          colors={colors}
          styles={styles}
        />
      ) : null}
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

function TradeEditor({
  trade,
  accounts,
  onClose,
  onSave,
  colors,
  styles
}: {
  trade: MobileTrade
  accounts: PropAccount[]
  onClose: () => void
  onSave: (trade: MobileTrade) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [form, setForm] = useState<Form>(() => ({
    symbol: trade.symbol,
    direction: trade.direction,
    pnl: String(trade.pnl),
    fees: String(trade.fees),
    timeframe: trade.timeframe,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime,
    account: trade.account,
    setup: trade.setup,
    notes: trade.notes,
    screenshotUri: trade.screenshotUri
  }))
  const [tradeDate, setTradeDate] = useState(trade.tradeDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [pickerTarget, setPickerTarget] = useState<'entryTime' | 'exitTime' | null>(null)

  function update(key: keyof Form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function chooseScreenshot() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85
    })
    if (!result.canceled && result.assets[0]?.uri) update('screenshotUri', result.assets[0].uri)
  }

  async function save() {
    const pnl = Number(form.pnl)
    const fees = Number(form.fees || 0)
    if (!form.symbol.trim()) return setError('Enter a symbol.')
    if (!Number.isFinite(pnl)) return setError('Enter a valid P&L.')
    if (!Number.isFinite(fees)) return setError('Enter valid fees.')
    if (!tradeDate.trim() || Number.isNaN(new Date(tradeDate.replace(' ', 'T')).getTime())) {
      return setError('Use a valid trade date and time.')
    }
    setSaving(true)
    try {
      await onSave({
        ...trade,
        updatedAt: new Date().toISOString(),
        tradeDate: tradeDate.trim(),
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        pnl,
        fees,
        timeframe: form.timeframe.trim(),
        entryTime: form.entryTime,
        exitTime: form.exitTime,
        account: form.account,
        setup: form.setup.trim(),
        notes: form.notes.trim(),
        screenshotUri: form.screenshotUri,
        syncState: 'pending'
      })
      onClose()
    } catch (saveError) {
      setError(String(saveError instanceof Error ? saveError.message : saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen}>
        <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.content, styles.keyboardContent]} keyboardShouldPersistTaps="handled">
            <View style={[styles.actionRow, styles.centeredRow]}>
              <View style={styles.flexOne}>
                <Text style={styles.eyebrow}>EDIT TRADE</Text>
                <Text style={styles.title}>{trade.symbol}</Text>
              </View>
              <Pressable style={styles.compactButton} onPress={onClose}>
                <Text style={styles.compactButtonText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.segment}>
              {(['Long', 'Short'] as const).map((direction) => (
                <Pressable key={direction} onPress={() => update('direction', direction)}
                  style={[styles.segmentOption, form.direction === direction ? styles.segmentActive : null]}>
                  <Text style={[styles.segmentText, form.direction === direction ? { color: colors.accent } : null]}>{direction}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Symbol</Text>
            <TextInput autoCapitalize="characters" style={styles.input} value={form.symbol}
              onChangeText={(value) => update('symbol', value)} />

            <Text style={styles.label}>Trade date and time</Text>
            <TextInput autoCapitalize="none" autoCorrect={false} style={styles.input} value={tradeDate}
              placeholder="2026-07-27T09:45:00" placeholderTextColor={colors.dim}
              onChangeText={(value) => { setTradeDate(value); setError('') }} />

            <Text style={styles.label}>Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountTagRow}>
              {[{ id: '', label: 'Live' }, ...accounts].map((account) => {
                const active = form.account === account.id
                return (
                  <Pressable
                    key={account.id || 'live'}
                    style={[styles.accountTag, active ? styles.accountTagActive : null]}
                    onPress={() => update('account', account.id)}
                  >
                    <Text style={[styles.accountTagText, active ? { color: colors.accent } : null]}>{account.label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.label}>P&L</Text>
                <TextInput keyboardType="numbers-and-punctuation" style={styles.input} value={form.pnl}
                  onChangeText={(value) => update('pnl', value)} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Fees</Text>
                <TextInput keyboardType="decimal-pad" style={styles.input} value={form.fees}
                  onChangeText={(value) => update('fees', value)} />
              </View>
            </View>

            <Text style={styles.label}>Setup</Text>
            <TextInput style={styles.input} value={form.setup}
              onChangeText={(value) => update('setup', value)} />

            <Text style={styles.label}>Entry chart timeframe</Text>
            <TextInput
              style={styles.input}
              value={form.timeframe}
              placeholder="1m, 5m, 15m"
              placeholderTextColor={colors.dim}
              onChangeText={(value) => update('timeframe', value)}
            />

            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.label}>Entry Time</Text>
                <Pressable
                  style={[styles.input, styles.actionRow, styles.centeredRow]}
                  onPress={() => setPickerTarget('entryTime')}
                >
                  <Clock color={colors.accent} size={15} strokeWidth={2} />
                  <Text style={[styles.flexOne, { color: form.entryTime ? colors.text : colors.dim, fontSize: 13, fontWeight: '700' }]}>
                    {form.entryTime || 'Set Entry'}
                  </Text>
                  <ChevronDown color={colors.faint} size={15} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Exit Time</Text>
                <Pressable
                  style={[styles.input, styles.actionRow, styles.centeredRow]}
                  onPress={() => setPickerTarget('exitTime')}
                >
                  <Clock color={colors.accent} size={15} strokeWidth={2} />
                  <Text style={[styles.flexOne, { color: form.exitTime ? colors.text : colors.dim, fontSize: 13, fontWeight: '700' }]}>
                    {form.exitTime || 'Set Exit'}
                  </Text>
                  <ChevronDown color={colors.faint} size={15} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput multiline style={[styles.input, styles.notes]} value={form.notes}
              onChangeText={(value) => update('notes', value)} />

            {form.screenshotUri ? (
              <View style={styles.imagePreview}>
                <Image source={{ uri: form.screenshotUri }} style={styles.previewImage} />
                <Pressable style={styles.compactButton} onPress={() => update('screenshotUri', '')}>
                  <Text style={styles.compactButtonText}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={chooseScreenshot}>
                <View style={styles.buttonContent}>
                  <ImagePlus color={colors.text} size={17} strokeWidth={2} />
                  <Text style={styles.secondaryButtonText}>Attach chart screenshot</Text>
                </View>
              </Pressable>
            )}

            <Text style={styles.muted}>The original post-trade checklist is preserved. Changes queue for the next desktop sync.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#17130B" />
                : <View style={styles.buttonContent}>
                    <Save color="#17130B" size={17} strokeWidth={2.3} />
                    <Text style={styles.primaryButtonText}>Save changes</Text>
                  </View>}
            </Pressable>
          </ScrollView>

          {pickerTarget ? (
            <TimePickerModal
              title={pickerTarget === 'entryTime' ? 'Select Entry Time' : 'Select Exit Time'}
              initialTime={pickerTarget === 'entryTime' ? form.entryTime : form.exitTime}
              onSelect={(timeStr) => update(pickerTarget, timeStr)}
              onClose={() => setPickerTarget(null)}
              colors={colors}
              styles={styles}
            />
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

function History({
  trades,
  accounts,
  onUpdate,
  onDelete,
  colors,
  styles
}: {
  trades: MobileTrade[]
  accounts: PropAccount[]
  onUpdate: (trade: MobileTrade) => Promise<void>
  onDelete: (trade: MobileTrade) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [editing, setEditing] = useState<MobileTrade | null>(null)
  const [busyId, setBusyId] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState<'all' | 'win' | 'loss'>('all')
  const [visibleCount, setVisibleCount] = useState(50)
  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.label])),
    [accounts]
  )

  const filteredTrades = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return trades.filter((trade) => {
      if (selectedDate && trade.tradeDate.slice(0, 10) !== selectedDate) return false
      if (outcome === 'win' && trade.pnl <= 0) return false
      if (outcome === 'loss' && trade.pnl >= 0) return false
      if (!needle) return true
      return [
        trade.symbol,
        trade.setup,
        trade.timeframe,
        trade.entryTime,
        trade.exitTime,
        trade.notes,
        trade.direction,
        trade.tradeDate,
        shortDate(trade.tradeDate),
        ...(trade.reasons || [])
      ].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [trades, selectedDate, query, outcome])
  const visibleTrades = filteredTrades.slice(0, visibleCount)

  useEffect(() => setVisibleCount(50), [selectedDate, query, outcome])

  function confirmDelete(trade: MobileTrade) {
    Alert.alert(
      `Delete ${trade.symbol || 'trade'}?`,
      trade.desktopId
        ? 'This deletion will also be applied to TradeHelp Desktop on your next sync.'
        : 'This trade will be permanently removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(trade.id)
            try {
              await onDelete(trade)
            } finally {
              setBusyId('')
            }
          }
        }
      ]
    )
  }

  if (!trades.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyMark}>J</Text>
        <Text style={styles.panelTitle}>No mobile trades yet</Text>
        <Text style={styles.muted}>Quick captures and synced desktop trades will appear here.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageTitleStack}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <View style={styles.flexOne}>
            <Text style={styles.eyebrow}>JOURNAL</Text>
            <Text style={styles.title}>Trade history</Text>
          </View>
          <View style={styles.segment}>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="List view"
              accessibilityState={{ selected: viewMode === 'list' }}
              onPress={() => { triggerHaptic('light'); setViewMode('list') }}
              style={[styles.segmentOption, viewMode === 'list' ? styles.segmentActive : null]}
            >
              <List color={viewMode === 'list' ? colors.accent : colors.dim} size={16} strokeWidth={2} />
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="Calendar view"
              accessibilityState={{ selected: viewMode === 'calendar' }}
              onPress={() => { triggerHaptic('light'); setViewMode('calendar') }}
              style={[styles.segmentOption, viewMode === 'calendar' ? styles.segmentActive : null]}
            >
              <Calendar color={viewMode === 'calendar' ? colors.accent : colors.dim} size={16} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.copy}>{trades.length} trade{trades.length === 1 ? '' : 's'} available on this device.</Text>
      </View>

      <View style={styles.searchBar}>
        <Search color={colors.faint} size={17} strokeWidth={2} />
        <TextInput
          accessibilityLabel="Search trade history"
          value={query}
          onChangeText={setQuery}
          placeholder="Search symbol, setup, date, or note"
          placeholderTextColor={colors.faint}
          style={styles.searchInput}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityLabel="Clear trade search" onPress={() => setQuery('')}>
            <XCircle color={colors.dim} size={17} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.compactSegment}>
        {([
          { label: 'All', value: 'all' },
          { label: 'Wins', value: 'win' },
          { label: 'Losses', value: 'loss' }
        ] as const).map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: outcome === option.value }}
            onPress={() => setOutcome(option.value)}
            style={[styles.compactSegmentOption, outcome === option.value ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, outcome === option.value ? { color: colors.accent } : null]}>{option.label}</Text>
          </Pressable>
        ))}
        <Text style={styles.resultCount}>
          {visibleTrades.length === filteredTrades.length ? `${filteredTrades.length} shown` : `${visibleTrades.length} of ${filteredTrades.length}`}
        </Text>
      </View>

      {viewMode === 'calendar' ? (
        <CalendarView trades={trades} onSelectDate={(d) => setSelectedDate(d)} colors={colors} styles={styles} />
      ) : null}

      {selectedDate ? (
        <View style={[styles.actionRow, styles.centeredRow, styles.panel]}>
          <Text style={[styles.panelTitle, styles.flexOne]}>Filter: {selectedDate}</Text>
          <Pressable accessibilityRole="button" style={styles.compactButton} onPress={() => setSelectedDate(null)}>
            <Text style={styles.compactButtonText}>Clear Date Filter</Text>
          </Pressable>
        </View>
      ) : null}

      {!filteredTrades.length ? (
        <View style={styles.emptyNews}>
          <View style={styles.emptyNewsIcon}>
            <Search color={colors.accent} size={23} strokeWidth={1.8} />
          </View>
          <Text style={styles.panelTitle}>No matching trades</Text>
          <Text style={[styles.muted, styles.centerText]}>Adjust the search, outcome, or selected date.</Text>
        </View>
      ) : visibleTrades.map((trade, index) => {
        const gradeInfo = computeTradeGrade(trade)
        const heldMinutes = tradeHoldMinutes(trade)
        const heldLabel = heldMinutes === null ? '' : `Held ${formatHoldDuration(heldMinutes)}`
        const expanded = expandedId === trade.id
        const monthKey = trade.tradeDate.slice(0, 7)
        const previousMonthKey = index > 0 ? visibleTrades[index - 1]?.tradeDate.slice(0, 7) : ''
        const monthLabel = new Date(`${monthKey}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        return (
          <Fragment key={trade.id}>
          {monthKey !== previousMonthKey ? <Text style={styles.historyMonthLabel}>{monthLabel}</Text> : null}
          <View style={styles.tradeCard}>
            <Pressable
              style={styles.tradeRow}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${trade.symbol} ${money(trade.pnl)}. ${expanded ? 'Hide' : 'Show'} trade details`}
              onPress={() => {
                triggerHaptic('selection')
                setExpandedId(expanded ? null : trade.id)
              }}
            >
              <View style={[styles.tradeOutcomeRail, { backgroundColor: trade.pnl < 0 ? colors.down : colors.up }]} />
              <View style={styles.flexOne}>
                <View style={styles.tradeTitleRow}>
                  <Text style={styles.tradeSymbol}>{trade.symbol || '-'}</Text>
                  <View style={[styles.gradeBadgeSmall, { backgroundColor: gradeInfo.color + '22' }]}>
                    <Text style={[styles.gradeTextSmall, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
                  </View>
                  <Text style={styles.tradeMeta}>{trade.direction} · {shortDate(trade.tradeDate)}</Text>
                </View>
                <Text style={[styles.muted, styles.tradeSummary]} numberOfLines={2}>
                  {[accountNames.get(trade.account) || 'Live', trade.setup, trade.timeframe, heldLabel, trade.ruleSummary].filter(Boolean).join(' · ') || 'No setup details'}
                </Text>
                {trade.reasons && trade.reasons.length ? (
                  <Text style={[styles.muted, { color: colors.accent, marginTop: 2 }]} numberOfLines={1}>
                    💡 {trade.reasons.join(', ')}
                  </Text>
                ) : null}
              </View>
              {trade.screenshotUri ? <Image source={{ uri: trade.screenshotUri }} style={styles.historyThumbnail} /> : null}
              <View style={styles.tradeRight}>
                <View style={[styles.pnlPill, { backgroundColor: trade.pnl < 0 ? colors.downSoft : colors.upSoft }]}>
                  <Text style={[styles.tradePnl, { color: trade.pnl < 0 ? colors.down : colors.up }]}>{money(trade.pnl)}</Text>
                </View>
                <Text style={[styles.syncLabel, { color: trade.syncState === 'synced' ? colors.up : colors.accent }]}>
                  {trade.origin === 'desktop' && trade.syncState === 'synced' ? 'DESKTOP' : trade.syncState.toUpperCase()}
                </Text>
              </View>
            </Pressable>
            {expanded ? (
              <View style={styles.historyDetails}>
                {heldMinutes !== null ? (
                  <View style={[styles.actionRow, styles.centeredRow]}>
                    <Clock color={colors.accent} size={15} strokeWidth={2} />
                    <Text style={styles.muted}>
                      {trade.entryTime} to {trade.exitTime} · held {formatHoldDuration(heldMinutes)}
                    </Text>
                  </View>
                ) : null}
                {trade.notes ? <Text style={styles.muted}>{trade.notes}</Text> : null}
                <View style={styles.historyActions}>
                  <Pressable
                    accessibilityLabel={`Edit ${trade.symbol} trade`}
                    style={styles.historyAction}
                    onPress={() => setEditing(trade)}
                  >
                    <Pencil color={colors.text} size={15} strokeWidth={2} />
                    <Text style={styles.historyActionText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Delete ${trade.symbol} trade`}
                    style={[styles.historyAction, styles.dangerAction]}
                    onPress={() => confirmDelete(trade)}
                    disabled={busyId === trade.id}
                  >
                    {busyId === trade.id
                      ? <ActivityIndicator color={colors.down} size="small" />
                      : <Trash2 color={colors.down} size={15} strokeWidth={2} />}
                    <Text style={[styles.historyActionText, { color: colors.down }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
          </Fragment>
        )
      })}
      {visibleCount < filteredTrades.length ? (
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => setVisibleCount((current) => current + 50)}
        >
          <View style={styles.buttonContent}>
            <HistoryIcon color={colors.text} size={16} strokeWidth={2} />
            <Text style={styles.secondaryButtonText}>Load older trades</Text>
          </View>
        </Pressable>
      ) : null}
      {editing ? (
        <TradeEditor
          trade={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={onUpdate}
          colors={colors}
          styles={styles}
        />
      ) : null}
    </ScrollView>
  )
}

function PropAccountEditor({
  account,
  onSave,
  onClose,
  colors,
  styles
}: {
  account: PropAccount
  onSave: (account: PropAccount) => void
  onClose: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [label, setLabel] = useState(account.label)
  const [target, setTarget] = useState(String(account.target))
  const [dailyLoss, setDailyLoss] = useState(String(account.maxDailyLoss))
  const [drawdown, setDrawdown] = useState(String(account.maxDrawdown))
  const [minDays, setMinDays] = useState(String(account.minDays))

  function commit() {
    onSave({
      ...account,
      label: label.trim() || `${Math.round(account.accountSize / 1000)}K account`,
      target: Math.max(0, Number(target) || 0),
      maxDailyLoss: Math.max(0, Number(dailyLoss) || 0),
      maxDrawdown: Math.max(0, Number(drawdown) || 0),
      minDays: Math.max(0, Math.trunc(Number(minDays) || 0))
    })
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalScreen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.flexOne}>
              <Text style={styles.eyebrow}>PROP ACCOUNT</Text>
              <Text style={styles.title}>{Math.round(account.accountSize / 1000)}K template</Text>
            </View>
            <Pressable style={styles.compactButton} onPress={onClose}>
              <Text style={styles.compactButtonText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Match your firm’s rules</Text>
            <Text style={styles.muted}>Templates are starting points. Confirm every limit against the account you purchased.</Text>
            <Text style={styles.label}>Account name</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Topstep 50K #1" placeholderTextColor={colors.dim} />
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.label}>Pass target</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Daily loss</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" value={dailyLoss} onChangeText={setDailyLoss} />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.label}>Max drawdown</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad" value={drawdown} onChangeText={setDrawdown} />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Minimum days</Text>
                <TextInput style={styles.input} keyboardType="number-pad" value={minDays} onChangeText={setMinDays} />
              </View>
            </View>
          </View>

          <Pressable style={styles.primaryButton} onPress={commit}>
            <View style={styles.buttonContent}>
              <Save color="#17130B" size={17} strokeWidth={2.3} />
              <Text style={styles.primaryButtonText}>Save account</Text>
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function Accounts({
  trades,
  accountState,
  onSave,
  colors,
  styles
}: {
  trades: MobileTrade[]
  accountState: AccountState
  onSave: (state: AccountState) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [mode, setMode] = useState<'live' | 'prop'>('live')
  const [selectedId, setSelectedId] = useState(accountState.propAccounts[0]?.id || '')
  const [editing, setEditing] = useState<PropAccount | null>(null)
  const [capitalAction, setCapitalAction] = useState<'set' | 'edit' | 'add' | null>(null)
  const [capitalAmount, setCapitalAmount] = useState('')
  const propIds = useMemo(() => new Set(accountState.propAccounts.map((account) => account.id)), [accountState.propAccounts])
  const liveTrades = useMemo(() => trades.filter((trade) => !propIds.has(trade.account)), [trades, propIds])
  const liveStats = useMemo(() => computeMobileStats(liveTrades), [liveTrades])
  const liveBalance = accountState.liveCapital + liveStats.netPnl
  const selected = accountState.propAccounts.find((account) => account.id === selectedId) || accountState.propAccounts[0]
  const propStats = selected ? computePropAccount(trades, selected) : null

  useEffect(() => {
    if (!selected && selectedId) setSelectedId('')
    else if (selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [selected, selectedId])

  function startTemplate(key: keyof typeof PROP_TEMPLATES) {
    setEditing({
      id: createLocalId('prop'),
      label: `${key} prop account`,
      ...PROP_TEMPLATES[key]
    })
  }

  async function saveProp(account: PropAccount) {
    const next = accountState.propAccounts.some((item) => item.id === account.id)
      ? accountState.propAccounts.map((item) => item.id === account.id ? account : item)
      : [...accountState.propAccounts, account]
    await onSave({ ...accountState, propAccounts: next })
    setSelectedId(account.id)
    setEditing(null)
    triggerHaptic('success')
  }

  function deleteProp(account: PropAccount) {
    Alert.alert(
      `Remove ${account.label}?`,
      'Trades keep their history, but they will appear under Live until assigned to another prop account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await onSave({
              ...accountState,
              propAccounts: accountState.propAccounts.filter((item) => item.id !== account.id)
            })
            setSelectedId('')
          }
        }
      ]
    )
  }

  async function saveCapital() {
    const amount = Number(capitalAmount)
    if (!Number.isFinite(amount) || amount <= 0) return
    const liveCapital = capitalAction === 'add' ? accountState.liveCapital + amount : amount
    await onSave({ ...accountState, liveCapital })
    setCapitalAction(null)
    setCapitalAmount('')
    triggerHaptic('success')
  }

  const statusColor = propStats?.status === 'passed'
    ? colors.up
    : propStats?.status === 'failed'
      ? colors.down
      : colors.accent
  const targetProgress = propStats && propStats.target > 0
    ? Math.max(0, Math.min(1, propStats.netPnl / propStats.target))
    : 0

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageTitleStack}>
        <Text style={styles.eyebrow}>ACCOUNT CONTROL</Text>
        <Text style={styles.title}>Live money. Prop rules.</Text>
        <Text style={styles.copy}>See the number that matters without rebuilding the full desktop dashboard.</Text>
      </View>

      <View style={styles.segment}>
        {(['live', 'prop'] as const).map((item) => (
          <Pressable key={item} style={[styles.segmentOption, mode === item ? styles.segmentActive : null]} onPress={() => setMode(item)}>
            <Text style={[styles.segmentText, mode === item ? { color: colors.accent } : null]}>
              {item === 'live' ? 'Live' : `Prop${accountState.propAccounts.length ? ` · ${accountState.propAccounts.length}` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'live' ? (
        <>
          <LinearGradient colors={[colors.surface2, colors.surface]} style={styles.accountHero}>
            <View style={styles.heroTopline}>
              <View>
                <Text style={styles.heroLabel}>LIVE BALANCE</Text>
                <Text style={[styles.accountBalance, { color: liveBalance >= accountState.liveCapital ? colors.up : colors.down }]}>
                  {money(liveBalance)}
                </Text>
              </View>
              <View style={styles.accountIcon}>
                <Wallet color={colors.accent} size={22} strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.heroCaption}>
              {accountState.liveCapital > 0 ? `${money(accountState.liveCapital)} saved capital` : 'Set starting capital to anchor your balance.'}
            </Text>
            <View style={styles.accountMetricGrid}>
              <View style={styles.accountMetric}>
                <Text style={styles.kicker}>NET P&L</Text>
                <Text style={[styles.accountMetricValue, { color: liveStats.netPnl >= 0 ? colors.up : colors.down }]}>{money(liveStats.netPnl)}</Text>
              </View>
              <View style={styles.accountMetric}>
                <Text style={styles.kicker}>WIN RATE</Text>
                <Text style={styles.accountMetricValue}>{percent(liveStats.winRate)}</Text>
              </View>
              <View style={styles.accountMetric}>
                <Text style={styles.kicker}>MAX DD</Text>
                <Text style={[styles.accountMetricValue, { color: colors.down }]}>{money(-liveStats.maxDrawdown)}</Text>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.panel}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.panelTitle}>Saved capital</Text>
              {accountState.liveCapital > 0 ? (
                <Pressable style={styles.compactButton} onPress={() => { setCapitalAction('add'); setCapitalAmount('') }}>
                  <Text style={[styles.compactButtonText, { color: colors.accent }]}>+ Add funds</Text>
                </Pressable>
              ) : null}
            </View>
            {capitalAction ? (
              <>
                <Text style={styles.muted}>
                  {capitalAction === 'add' ? 'Enter only the new funds being added.' : 'Set the capital currently assigned to this account.'}
                </Text>
                <TextInput
                  autoFocus
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={capitalAmount}
                  onChangeText={setCapitalAmount}
                  placeholder={capitalAction === 'add' ? '500' : '5000'}
                  placeholderTextColor={colors.dim}
                />
                <View style={styles.actionRow}>
                  <Pressable style={[styles.secondaryButton, styles.flexOne]} onPress={() => setCapitalAction(null)}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryButton, styles.flexOne]} onPress={saveCapital}>
                    <Text style={styles.primaryButtonText}>{capitalAction === 'add' ? 'Add funds' : 'Save capital'}</Text>
                  </Pressable>
                </View>
              </>
            ) : accountState.liveCapital > 0 ? (
              <View style={[styles.actionRow, styles.centeredRow]}>
                <Text style={[styles.accountSavedCapital, styles.flexOne]}>{money(accountState.liveCapital)}</Text>
                <Pressable style={styles.compactButton} onPress={() => { setCapitalAction('edit'); setCapitalAmount(String(accountState.liveCapital)) }}>
                  <Text style={styles.compactButtonText}>Adjust</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.primaryButton} onPress={() => { setCapitalAction('set'); setCapitalAmount('') }}>
                <Text style={styles.primaryButtonText}>Set starting capital</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Prop challenges</Text>
            <Text style={styles.resultCount}>{accountState.propAccounts.length} tracked</Text>
          </View>

          {accountState.propAccounts.length ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountPicker}>
                {accountState.propAccounts.map((account) => (
                  <Pressable
                    key={account.id}
                    style={[styles.accountPickerPill, selected?.id === account.id ? styles.accountPickerPillActive : null]}
                    onPress={() => setSelectedId(account.id)}
                  >
                    <Text style={[styles.accountPickerText, selected?.id === account.id ? { color: colors.accent } : null]} numberOfLines={1}>
                      {account.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.accountTemplateBar}>
                <Text style={styles.kicker}>ADD</Text>
                {(Object.keys(PROP_TEMPLATES) as Array<keyof typeof PROP_TEMPLATES>).map((key) => (
                  <Pressable key={key} style={styles.accountTemplateMini} onPress={() => startTemplate(key)}>
                    <Plus color={colors.accent} size={13} strokeWidth={2.5} />
                    <Text style={styles.accountTemplateMiniText}>{key}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Start with an account template</Text>
              <Text style={styles.muted}>Choose the nominal size, then match the limits to your firm before saving.</Text>
              <View style={styles.templateRow}>
                {(Object.keys(PROP_TEMPLATES) as Array<keyof typeof PROP_TEMPLATES>).map((key) => (
                  <Pressable key={key} style={styles.templateButton} onPress={() => startTemplate(key)}>
                    <Text style={styles.templateSize}>{key}</Text>
                    <Text style={styles.templateCaption}>{money(PROP_TEMPLATES[key].target)} target</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {selected && propStats ? (
            <View style={styles.accountChallenge}>
              <View style={styles.heroTopline}>
                <View style={styles.flexOne}>
                  <Text style={styles.heroLabel}>{Math.round(selected.accountSize / 1000)}K CHALLENGE</Text>
                  <Text style={styles.accountChallengeTitle} numberOfLines={1}>{selected.label}</Text>
                </View>
                <View style={[styles.accountStatus, { borderColor: statusColor, backgroundColor: statusColor + '18' }]}>
                  <Text style={[styles.accountStatusText, { color: statusColor }]}>{propStats.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.accountPnlRow}>
                <View>
                  <Text style={styles.kicker}>ACCOUNT P&L</Text>
                  <Text style={[styles.accountBalance, { color: propStats.netPnl >= 0 ? colors.up : colors.down }]}>{money(propStats.netPnl)}</Text>
                </View>
                <Text style={styles.accountTargetText}>{money(propStats.amountToTarget)} to pass</Text>
              </View>
              <View style={styles.accountProgressTrack}>
                <View style={[styles.accountProgressFill, { width: `${targetProgress * 100}%`, backgroundColor: statusColor }]} />
              </View>

              <View style={styles.accountMetricGrid}>
                <View style={styles.accountMetric}>
                  <Text style={styles.kicker}>DRAWDOWN LEFT</Text>
                  <Text style={[styles.accountMetricValue, { color: propStats.drawdownBuffer <= selected.maxDrawdown * 0.2 ? colors.down : colors.text }]}>
                    {money(propStats.drawdownBuffer)}
                  </Text>
                </View>
                <View style={styles.accountMetric}>
                  <Text style={styles.kicker}>DAILY LOSS LEFT</Text>
                  <Text style={styles.accountMetricValue}>{money(propStats.dailyRemaining)}</Text>
                </View>
                <View style={styles.accountMetric}>
                  <Text style={styles.kicker}>DAYS</Text>
                  <Text style={styles.accountMetricValue}>{propStats.daysTraded}/{selected.minDays}</Text>
                </View>
              </View>

              {propStats.status === 'failed' ? (
                <Text style={styles.warning}>
                  Rule breached: {[propStats.floorBreached ? 'drawdown' : '', propStats.dailyBreached ? 'daily loss' : ''].filter(Boolean).join(' and ')}.
                </Text>
              ) : null}
              <View style={styles.historyActions}>
                <Pressable style={styles.historyAction} onPress={() => setEditing(selected)}>
                  <Pencil color={colors.text} size={15} strokeWidth={2} />
                  <Text style={styles.historyActionText}>Edit rules</Text>
                </Pressable>
                <Pressable style={[styles.historyAction, styles.dangerAction]} onPress={() => deleteProp(selected)}>
                  <Trash2 color={colors.down} size={15} strokeWidth={2} />
                  <Text style={[styles.historyActionText, { color: colors.down }]}>Remove</Text>
                </Pressable>
              </View>
              <Text style={styles.muted}>Only trades tagged to this account are counted. Intraday unrealized swings are not available from journal entries.</Text>
            </View>
          ) : null}
        </>
      )}

      {editing ? (
        <PropAccountEditor account={editing} onSave={saveProp} onClose={() => setEditing(null)} colors={colors} styles={styles} />
      ) : null}
    </ScrollView>
  )
}

function Settings({
  mode,
  onMode,
  hapticsEnabled,
  onHaptics,
  pairingCode,
  onPairingCode,
  onSync,
  syncing,
  syncMessage,
  pending,
  rules,
  rulesUpdatedAt,
  onSaveRules,
  lastSyncedAt,
  onReplayOnboarding,
  onClearPhone,
  colors,
  styles
}: {
  mode: ThemeMode
  onMode: (mode: ThemeMode) => void
  hapticsEnabled: boolean
  onHaptics: (enabled: boolean) => void
  pairingCode: string
  onPairingCode: (value: string) => void
  onSync: () => void
  syncing: boolean
  syncMessage: string
  pending: number
  rules: string[]
  rulesUpdatedAt: string
  onSaveRules: (rules: string[]) => Promise<void>
  lastSyncedAt: string
  onReplayOnboarding: () => void
  onClearPhone: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [ruleDraft, setRuleDraft] = useState(rules)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
  const [showManualPairing, setShowManualPairing] = useState(false)
  const rulesKey = JSON.stringify(rules)

  useEffect(() => {
    setRuleDraft(rules)
  }, [rulesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function commitRules() {
    setRulesSaving(true)
    try {
      const clean = ruleDraft.map((rule) => rule.trim()).filter(Boolean).slice(0, 20)
      await onSaveRules(clean)
      setRuleDraft(clean)
      setRulesSaved(true)
      setTimeout(() => setRulesSaved(false), 1400)
    } finally {
      setRulesSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.pageTitleStack}>
        <Text style={styles.eyebrow}>MOBILE SETTINGS</Text>
        <Text style={styles.title}>Make it yours.</Text>
        <Text style={styles.copy}>Appearance, sync, and your trading rules.</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <View style={styles.themeGrid}>
          {(['system', 'dark', 'light'] as ThemeMode[]).map((option) => {
            const previewColors: [string, string] = option === 'dark'
              ? ['#0A0E15', '#1A2331']
              : option === 'light'
                ? ['#F6F8FB', '#FFFFFF']
                : ['#0D121B', '#FFFFFF']
            const previewLine = option === 'light' ? '#D5DDE8' : '#344159'
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: mode === option }}
                onPress={() => onMode(option)}
                style={[styles.themeChoice, mode === option ? styles.themeChoiceActive : null]}
              >
                <LinearGradient colors={previewColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.themePreview}>
                  <View style={[styles.themePreviewBar, { backgroundColor: colors.accent }]} />
                  <View style={[styles.themePreviewLine, { backgroundColor: previewLine, width: '72%' }]} />
                  <View style={[styles.themePreviewLine, { backgroundColor: previewLine, width: '48%' }]} />
                </LinearGradient>
                <View style={styles.themeChoiceFooter}>
                  <Text style={[styles.themeChoiceLabel, mode === option ? { color: colors.accent } : null]}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                  <View style={[styles.radio, mode === option ? styles.radioActive : null]}>
                    {mode === option ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>
              </Pressable>
            )
          })}
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: hapticsEnabled }}
          accessibilityLabel="Haptic feedback"
          onPress={() => onHaptics(!hapticsEnabled)}
          style={styles.preferenceRow}
        >
          <View style={[styles.featureIcon, { backgroundColor: hapticsEnabled ? colors.accentSoft : colors.surface2 }]}>
            <Vibrate color={hapticsEnabled ? colors.accent : colors.dim} size={20} strokeWidth={2} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.panelTitle}>Haptic feedback</Text>
            <Text style={styles.muted}>
              {hapticsEnabled
                ? 'On · Vibrates for navigation, selections, and confirmations.'
                : 'Off · TradeHelp will not vibrate.'}
            </Text>
          </View>
          <View style={[styles.toggle, hapticsEnabled ? styles.toggleOn : null]}>
            <View style={[styles.toggleKnob, hapticsEnabled ? styles.toggleKnobOn : null]} />
          </View>
        </Pressable>
      </View>

      <LinearGradient colors={colors.panelGradient} style={styles.panel}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <View style={styles.featureIcon}>
            <Smartphone color={colors.accent} size={20} strokeWidth={2} />
          </View>
          <Text style={[styles.panelTitle, styles.flexOne]}>Pair with TradeHelp Desktop</Text>
        </View>
        <View style={styles.syncStatusPanel}>
          <View style={[styles.statusDot, { backgroundColor: syncing ? colors.accent : pairingCode ? colors.up : colors.faint }]} />
          <View style={styles.flexOne}>
            <Text style={styles.newsStatusTitle}>{syncing ? 'Syncing now' : pairingCode ? 'Desktop pairing saved' : 'Not paired'}</Text>
            <Text style={styles.muted}>
              {pairingCode
                ? `${pending} queued change${pending === 1 ? '' : 's'}${lastSyncedAt ? ` · Last sync ${new Date(lastSyncedAt).toLocaleString()}` : ''}`
                : 'Pairing is optional. Your journal remains useful on this phone.'}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>On desktop, open Settings → TradeHelp Mobile sync lab, start sync, then scan its pairing QR.</Text>
        <Pressable
          accessibilityRole="button"
          style={[styles.secondaryButton, !CAMERA_AVAILABLE ? styles.disabledButton : null]}
          onPress={() => setScannerOpen(true)}
          disabled={!CAMERA_AVAILABLE}
        >
          <View style={styles.buttonContent}>
            <ScanLine color={colors.text} size={18} strokeWidth={2} />
            <Text style={styles.secondaryButtonText}>
              {CAMERA_AVAILABLE ? 'Scan desktop pairing QR' : 'QR scanner requires the updated dev build'}
            </Text>
          </View>
        </Pressable>
        {pairingCode && !showManualPairing ? (
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={onSync} disabled={syncing}>
            {syncing
              ? <ActivityIndicator color="#17130B" />
              : <View style={styles.buttonContent}>
                  <Wifi color="#17130B" size={18} strokeWidth={2.3} />
                  <Text style={styles.primaryButtonText}>Sync now</Text>
                </View>}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showManualPairing }}
          style={styles.textAction}
          onPress={() => setShowManualPairing((current) => !current)}
        >
          <Text style={styles.textActionLabel}>Advanced pairing options</Text>
          {showManualPairing
            ? <ChevronUp color={colors.accent} size={16} strokeWidth={2} />
            : <ChevronDown color={colors.accent} size={16} strokeWidth={2} />}
        </Pressable>
        {showManualPairing ? (
          <>
            <Text style={styles.label}>Manual pairing code</Text>
            <TextInput
              accessibilityLabel="Manual desktop pairing code"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              placeholder="http://192.168.x.x:47831|pairing-token"
              placeholderTextColor={colors.dim}
              style={[styles.input, styles.pairingInput]}
              value={pairingCode}
              onChangeText={onPairingCode}
            />
          </>
        ) : null}
        {showManualPairing ? (
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={onSync} disabled={syncing || !pairingCode.trim()}>
          {syncing
            ? <ActivityIndicator color="#17130B" />
            : <View style={styles.buttonContent}>
                <Wifi color="#17130B" size={18} strokeWidth={2.3} />
                <Text style={styles.primaryButtonText}>Pair and sync now</Text>
              </View>}
          </Pressable>
        ) : null}
        {syncMessage ? <Text style={[styles.muted, { color: syncMessage.startsWith('Sync failed') ? colors.down : colors.up }]}>{syncMessage}</Text> : null}
        <Text style={styles.warning}>Pairing is authenticated but not encrypted. Use only on a trusted private network.</Text>
      </LinearGradient>
      <PairingScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCode={(code) => onPairingCode(code)}
        colors={colors}
        styles={styles}
      />

      <View style={styles.panel}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <Text style={[styles.panelTitle, styles.flexOne]}>Post-trade rules</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add rule"
            style={styles.compactButton}
            onPress={() => setRuleDraft((current) => current.length < 20 ? [...current, ''] : current)}
          >
            <Text style={styles.compactButtonText}>+ Add</Text>
          </Pressable>
        </View>
        <Text style={styles.muted}>Latest edit wins when your phone and desktop sync.</Text>
        {ruleDraft.map((rule, index) => (
          <View key={index} style={[styles.ruleLine, styles.centeredRow]}>
            <Text style={styles.ruleNumber}>{index + 1}</Text>
            <TextInput
              accessibilityLabel={`Rule ${index + 1}`}
              autoCorrect
              maxLength={240}
              placeholder="Write a rule"
              placeholderTextColor={colors.dim}
              style={[styles.input, styles.ruleInput]}
              value={rule}
              onChangeText={(value) => setRuleDraft((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove rule ${index + 1}`}
              style={styles.removeRuleButton}
              onPress={() => setRuleDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Text style={styles.removeRuleText}>X</Text>
            </Pressable>
          </View>
        ))}
        {!ruleDraft.length ? <Text style={styles.muted}>No rules yet.</Text> : null}
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={commitRules} disabled={rulesSaving}>
          {rulesSaving
            ? <ActivityIndicator color={colors.accent} />
            : <View style={styles.buttonContent}>
                <Save color={rulesSaved ? colors.up : colors.text} size={17} strokeWidth={2} />
                <Text style={[styles.secondaryButtonText, rulesSaved ? { color: colors.up } : null]}>{rulesSaved ? 'Rules saved' : 'Save rules'}</Text>
              </View>}
        </Pressable>
        {rulesUpdatedAt ? <Text style={styles.muted}>Last changed {new Date(rulesUpdatedAt).toLocaleString()}</Text> : null}
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionLabel}>APP & DATA</Text>
        <View style={styles.panel}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.featureIcon}>
              <Info color={colors.accent} size={20} strokeWidth={2} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.panelTitle}>TradeHelp Mobile</Text>
              <Text style={styles.muted}>Version {APP_VERSION} · Educational trading journal</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={onReplayOnboarding}>
            <View style={styles.buttonContent}>
              <RotateCcw color={colors.text} size={17} strokeWidth={2} />
              <Text style={styles.secondaryButtonText}>Replay welcome walkthrough</Text>
            </View>
          </Pressable>
          <View style={styles.fieldRow}>
            <Pressable
              accessibilityRole="link"
              style={[styles.secondaryButton, styles.flexOne]}
              onPress={() => Linking.openURL('https://trade-help.app/privacy.html').catch(() => {})}
            >
              <Text style={styles.secondaryButtonText}>Privacy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              style={[styles.secondaryButton, styles.flexOne]}
              onPress={() => Linking.openURL('https://trade-help.app/support.html').catch(() => {})}
            >
              <Text style={styles.secondaryButtonText}>Support</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={[styles.featureIcon, { backgroundColor: colors.downSoft }]}>
              <Database color={colors.down} size={20} strokeWidth={2} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.panelTitle}>Clear this phone's data</Text>
              <Text style={styles.muted}>Removes local journal data and pairing settings. Desktop data is not deleted.</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" style={[styles.secondaryButton, styles.dangerButton]} onPress={onClearPhone}>
            <View style={styles.buttonContent}>
              <Trash2 color={colors.down} size={17} strokeWidth={2} />
              <Text style={[styles.secondaryButtonText, { color: colors.down }]}>Clear this phone</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="link"
        style={styles.syncCard}
        onPress={() => Linking.openURL('https://tradehelp.app').catch(() => {})}
      >
        <View style={[styles.featureIcon, { backgroundColor: colors.accentSoft }]}>
          <BookOpen color={colors.accent} size={20} strokeWidth={2} />
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.panelTitle}>TradeHelp Web & Desktop App</Text>
          <Text style={styles.muted}>Pair with the full Web/Desktop application for deep chart review, automated CSV watching, and Ollama AI analysis.</Text>
        </View>
        <View style={styles.compactButton}>
          <Text style={styles.compactButtonText}>Open Web</Text>
        </View>
      </Pressable>
    </ScrollView>
  )
}

function Vault({
  trades,
  onUpdate,
  colors,
  styles
}: {
  trades: MobileTrade[]
  onUpdate: (trade: MobileTrade) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all')
  const [selectedSetup, setSelectedSetup] = useState<string | null>(null)
  const [activeTrade, setActiveTrade] = useState<MobileTrade | null>(null)

  const setups = useMemo(() => {
    return Array.from(new Set(trades.map((t) => t.setup.trim()).filter(Boolean)))
  }, [trades])

  const filtered = useMemo(() => {
    return trades.filter((trade) => {
      if (filter === 'win' && trade.pnl <= 0) return false
      if (filter === 'loss' && trade.pnl >= 0) return false
      if (selectedSetup && trade.setup.trim() !== selectedSetup) return false
      return true
    })
  }, [trades, filter, selectedSetup])

  async function attachChart(trade: MobileTrade, openAfter = false) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
    if (result.canceled || !result.assets[0]?.uri) return
    const updated = { ...trade, screenshotUri: result.assets[0].uri }
    await onUpdate(updated)
    triggerHaptic('success')
    if (openAfter) setActiveTrade(updated)
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pageTitleStack}>
        <Text style={styles.eyebrow}>VISUAL JOURNAL · {filtered.length} TRADES</Text>
        <Text style={styles.title}>Chart Vault</Text>
        <Text style={styles.copy}>Study your trade executions, chart setups, and patterns.</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.segment}>
        {[
          { label: 'All Charts', value: 'all' },
          { label: 'Winners', value: 'win' },
          { label: 'Losses', value: 'loss' }
        ].map((item) => (
          <Pressable
            key={item.value}
            onPress={() => { triggerHaptic('light'); setFilter(item.value as any) }}
            style={[styles.segmentOption, filter === item.value ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, filter === item.value ? { color: colors.accent } : null]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Setup Pill Filters */}
      {setups.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            onPress={() => { triggerHaptic('light'); setSelectedSetup(null) }}
            style={[styles.presetPill, selectedSetup === null ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : null]}
          >
            <Text style={[styles.presetText, selectedSetup === null ? { color: colors.accent } : null]}>All Setups</Text>
          </Pressable>
          {setups.map((setup) => (
            <Pressable
              key={setup}
              onPress={() => { triggerHaptic('light'); setSelectedSetup(selectedSetup === setup ? null : setup) }}
              style={[styles.presetPill, selectedSetup === setup ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : null]}
            >
              <Text style={[styles.presetText, selectedSetup === setup ? { color: colors.accent } : null]}>{setup}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Vault Grid Feed */}
      <View style={styles.vaultGrid}>
        {filtered.length === 0 ? (
          <View style={[styles.emptyNews, styles.vaultEmpty]}>
            <View style={styles.emptyNewsIcon}>
              <ImagePlus color={colors.accent} size={24} strokeWidth={1.8} />
            </View>
            <Text style={styles.panelTitle}>No matching charts in vault</Text>
            <Text style={[styles.muted, styles.centerText]}>Log trades with chart screenshots to build your visual setup library.</Text>
          </View>
        ) : (
          filtered.map((trade) => {
            const isWin = trade.pnl > 0
            const tone = isWin ? colors.up : colors.down
            return (
              <Pressable
                key={trade.id}
                style={styles.vaultCard}
                accessibilityRole="button"
                accessibilityLabel={trade.screenshotUri
                  ? `Open ${trade.symbol} chart from ${shortDate(trade.tradeDate)}`
                  : `Attach a chart to ${trade.symbol} from ${shortDate(trade.tradeDate)}`}
                onPress={() => {
                  triggerHaptic('light')
                  if (trade.screenshotUri) setActiveTrade(trade)
                  else void attachChart(trade, true)
                }}
              >
                {trade.screenshotUri ? (
                  <Image source={{ uri: trade.screenshotUri }} style={styles.vaultImage} />
                ) : (
                  <LinearGradient
                    colors={isWin ? [colors.upSoft, colors.surface2] : [colors.downSoft, colors.surface2]}
                    style={styles.vaultPlaceholder}
                  >
                    <View style={styles.vaultPlaceholderChart}>
                      <View style={[styles.candle, { height: 14, backgroundColor: tone }]} />
                      <View style={[styles.candle, { height: 25, backgroundColor: tone }]} />
                      <View style={[styles.candle, { height: 18, backgroundColor: tone }]} />
                      <View style={[styles.candle, { height: 31, backgroundColor: tone }]} />
                    </View>
                    <Text style={styles.vaultPlaceholderText}>Tap to attach chart</Text>
                  </LinearGradient>
                )}
                
                <View style={styles.vaultOverlayHeader}>
                  <View style={[styles.pill, { backgroundColor: isWin ? colors.upSoft : colors.downSoft }]}>
                    <Text style={[styles.pillText, { color: tone }]}>{isWin ? 'WIN' : 'LOSS'}</Text>
                  </View>
                </View>

                <View style={styles.vaultFooter}>
                  <View style={[styles.actionRow, styles.centeredRow]}>
                    <Text style={[styles.vaultTitle, styles.flexOne]} numberOfLines={1}>{trade.symbol}</Text>
                    <Text style={[styles.vaultPnl, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>{money(trade.pnl)}</Text>
                  </View>
                  <Text style={styles.vaultMeta} numberOfLines={1}>{trade.setup || 'General'}</Text>
                  <Text style={styles.vaultDate}>{shortDate(trade.tradeDate)}</Text>
                </View>
              </Pressable>
            )
          })
        )}
      </View>

      {/* Lightbox Zoom Modal */}
      {activeTrade ? (
        <Modal visible animationType="fade" transparent onRequestClose={() => setActiveTrade(null)}>
          <View style={styles.lightboxOverlay}>
            <View style={styles.lightboxCard}>
              <View style={[styles.actionRow, styles.centeredRow]}>
                <View style={styles.flexOne}>
                  <Text style={styles.eyebrow}>{activeTrade.direction.toUpperCase()} · {shortDate(activeTrade.tradeDate)}</Text>
                  <Text style={styles.title}>{activeTrade.symbol} · <Text style={{ color: activeTrade.pnl < 0 ? colors.down : colors.up }}>{money(activeTrade.pnl)}</Text></Text>
                </View>
                <Pressable style={styles.compactButton} onPress={() => setActiveTrade(null)}>
                  <Text style={styles.compactButtonText}>Close</Text>
                </Pressable>
              </View>

              {activeTrade.screenshotUri ? (
                <Image source={{ uri: activeTrade.screenshotUri }} style={styles.lightboxImage} resizeMode="contain" />
              ) : (
                <View style={styles.lightboxPlaceholder}>
                  <ImagePlus color={colors.accent} size={32} strokeWidth={1.8} />
                  <Text style={styles.panelTitle}>No Screenshot Attached</Text>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => { void attachChart(activeTrade, true) }}
                  >
                    <Text style={styles.secondaryButtonText}>Attach Chart Screenshot</Text>
                  </Pressable>
                </View>
              )}

              <View style={{ gap: 4 }}>
                <Text style={styles.kicker}>SETUP & NOTES</Text>
                <Text style={styles.panelTitle}>{activeTrade.setup || 'No Setup Specified'}</Text>
                <Text style={styles.copy}>{activeTrade.notes || 'No notes added to this trade entry.'}</Text>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </ScrollView>
  )
}

function PairingScanner({
  visible,
  onClose,
  onCode,
  colors,
  styles
}: {
  visible: boolean
  onClose: () => void
  onCode: (code: string) => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [permission, requestPermission] = useCameraPermissionsHook()

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission()
  }, [visible, permission, requestPermission])

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.scannerScreen}>
        <View style={styles.scannerHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.panelTitle}>Scan desktop pairing QR</Text>
            <Text style={styles.muted}>Keep both devices on the same private Wi-Fi network.</Text>
          </View>
          <Pressable style={styles.compactButton} onPress={onClose}>
            <Text style={styles.compactButtonText}>Close</Text>
          </Pressable>
        </View>
        {CAMERA_AVAILABLE && permission?.granted ? (
          <CameraViewComponent
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }: { data: string }) => {
              if (typeof data === 'string' && data.includes('|')) {
                onCode(data)
                onClose()
              }
            }}
          >
            <View style={styles.scanFrame} />
          </CameraViewComponent>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.panelTitle}>Camera permission is required</Text>
            <Text style={styles.muted}>TradeHelp only uses the camera to scan the desktop pairing code.</Text>
            <Pressable style={styles.primaryButton} onPress={requestPermission}>
              <Text style={styles.primaryButtonText}>Allow camera</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.scannerFooter, { backgroundColor: colors.bg }]}>
          <Text style={styles.muted}>After scanning, tap “Pair and sync now” in Settings.</Text>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

function CalmBackdrop({
  dark,
  colors,
  styles
}: {
  dark: boolean
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const { width } = useWindowDimensions()
  const waveProgress = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)
  const waveWidth = Math.max(420, Math.min(width * 1.15, 900))
  const backdropBaseOpacity = dark ? 0.44 : 0.06
  const backdropPeakOpacity = dark ? 0.57 : 0.13

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      waveProgress.setValue(0.48)
      return undefined
    }

    waveProgress.setValue(0)
    const waveAnimation = Animated.loop(Animated.sequence([
      Animated.timing(waveProgress, {
        toValue: 1,
        duration: 12_000,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: Platform.OS !== 'web'
      }),
      Animated.delay(2200)
    ]))
    waveAnimation.start()
    return () => {
      waveAnimation.stop()
    }
  }, [reduceMotion, waveProgress])

  const waveTranslateX = waveProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-waveWidth - 80, width + 80]
  })
  const waveOpacity = waveProgress.interpolate({
    inputRange: [0, 0.08, 0.2, 0.8, 0.92, 1],
    outputRange: [0, 0.22, 0.48, 0.48, 0.22, 0]
  })
  const backdropGlowOpacity = waveProgress.interpolate({
    inputRange: [0, 0.14, 0.5, 0.86, 1],
    outputRange: [
      backdropBaseOpacity,
      backdropBaseOpacity + 0.02,
      backdropPeakOpacity,
      backdropBaseOpacity + 0.02,
      backdropBaseOpacity
    ]
  })

  return (
    <View style={styles.calmBackdrop} accessible={false}>
      <LinearGradient
        colors={[colors.bgTop, colors.bg, colors.bgBottom]}
        locations={[0, 0.45, 1]}
        style={styles.backdrop}
      />
      <Animated.Image
        source={require('./assets/calm-market-backdrop.png')}
        resizeMode="cover"
        style={[
          styles.backdropImage,
          { opacity: reduceMotion ? backdropBaseOpacity : backdropGlowOpacity }
        ]}
      />
      <View style={[styles.glowLayer, { opacity: dark ? 1 : 0.56 }]}>
        <Animated.View
          testID="background-glow-wave"
          style={[
            styles.glowWave,
            {
              width: waveWidth,
              opacity: reduceMotion ? 0.08 : waveOpacity,
              transform: [{ translateX: waveTranslateX }, { rotate: '-3deg' }]
            }
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(45, 212, 191, 0)',
              'rgba(45, 212, 191, 0.07)',
              'rgba(126, 224, 210, 0.1)',
              'rgba(245, 158, 11, 0.075)',
              'rgba(245, 158, 11, 0)'
            ]}
            locations={[0, 0.26, 0.5, 0.74, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.glowWaveBand}
          />
        </Animated.View>
      </View>
    </View>
  )
}

function OnboardingWizard({
  visible,
  rules,
  canDismiss,
  onDismiss,
  onFinish,
  colors,
  styles
}: {
  visible: boolean
  rules: string[]
  canDismiss: boolean
  onDismiss: () => void
  onFinish: (mode: 'sample' | 'empty') => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [step, setStep] = useState(0)
  const [startMode, setStartMode] = useState<'sample' | 'empty'>('sample')
  const [finishing, setFinishing] = useState(false)
  const lastStep = step === 3

  useEffect(() => {
    if (visible) setStep(0)
  }, [visible])

  async function finish() {
    setFinishing(true)
    try {
      await onFinish(startMode)
    } finally {
      setFinishing(false)
    }
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={canDismiss ? onDismiss : undefined}>
      <SafeAreaView style={styles.onboardingScreen}>
        <Image
          source={require('./assets/calm-market-backdrop.png')}
          resizeMode="cover"
          style={styles.onboardingBackdrop}
        />
        <View style={styles.onboardingShade} />
        <View style={styles.onboardingContent}>
          <View style={[styles.actionRow, styles.centeredRow]}>
            <View style={styles.onboardingLogo}>
              <View style={[styles.candle, { height: 11, backgroundColor: colors.down }]} />
              <View style={[styles.candle, { height: 18, backgroundColor: colors.accent }]} />
              <View style={[styles.candle, { height: 14, backgroundColor: colors.up }]} />
            </View>
            <Text style={styles.onboardingBrand}>Trade<Text style={{ color: colors.accent }}>Help</Text></Text>
            <View style={styles.flexOne} />
            {canDismiss ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close welcome walkthrough" style={styles.iconButton} onPress={onDismiss}>
                <XCircle color={colors.text} size={20} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.onboardingProgress} accessibilityLabel={`Step ${step + 1} of 4`}>
            {[0, 1, 2, 3].map((item) => (
              <View key={item} style={[styles.onboardingProgressBar, item <= step ? styles.onboardingProgressActive : null]} />
            ))}
          </View>

          <View style={styles.onboardingBody}>
            {step === 0 ? (
              <>
                <View style={styles.onboardingIcon}><Sparkles color={colors.accent} size={28} strokeWidth={2} /></View>
                <Text style={styles.onboardingEyebrow}>WELCOME</Text>
                <Text style={styles.onboardingTitle}>A calmer place to review the trade.</Text>
                <Text style={styles.onboardingCopy}>
                  Capture decisions while they are fresh, then study your process without the noise of an execution platform.
                </Text>
                <View style={styles.onboardingNote}>
                  <ShieldCheck color={colors.up} size={19} strokeWidth={2} />
                  <Text style={styles.onboardingNoteText}>TradeHelp is an educational journal. It does not place trades or hold funds.</Text>
                </View>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <View style={styles.onboardingIcon}><BookOpen color={colors.accent} size={28} strokeWidth={2} /></View>
                <Text style={styles.onboardingEyebrow}>CHOOSE YOUR START</Text>
                <Text style={styles.onboardingTitle}>Begin with context or a clean page.</Text>
                <Text style={styles.onboardingCopy}>Sample trades make every screen useful immediately. You can clear them at any time.</Text>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: startMode === 'sample' }}
                  onPress={() => setStartMode('sample')}
                  style={[styles.onboardingChoice, startMode === 'sample' ? styles.onboardingChoiceActive : null]}
                >
                  <Text style={styles.panelTitle}>Explore sample journal</Text>
                  <Text style={styles.muted}>See history, insights, accounts, and the chart vault with example data.</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: startMode === 'empty' }}
                  onPress={() => setStartMode('empty')}
                  style={[styles.onboardingChoice, startMode === 'empty' ? styles.onboardingChoiceActive : null]}
                >
                  <Text style={styles.panelTitle}>Start with an empty journal</Text>
                  <Text style={styles.muted}>Open directly into today with no example trades.</Text>
                </Pressable>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <View style={styles.onboardingIcon}><Target color={colors.accent} size={28} strokeWidth={2} /></View>
                <Text style={styles.onboardingEyebrow}>YOUR PROCESS</Text>
                <Text style={styles.onboardingTitle}>Review execution, not just outcome.</Text>
                <Text style={styles.onboardingCopy}>After every trade, TradeHelp asks whether you followed the rules you chose.</Text>
                <View style={styles.onboardingRules}>
                  {rules.slice(0, 3).map((rule, index) => (
                    <View key={`${rule}-${index}`} style={styles.onboardingRule}>
                      <Text style={styles.ruleNumber}>{index + 1}</Text>
                      <Text style={[styles.rowText, styles.flexOne]}>{rule}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.muted}>You can edit these later in Settings.</Text>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View style={styles.onboardingIcon}><Smartphone color={colors.accent} size={28} strokeWidth={2} /></View>
                <Text style={styles.onboardingEyebrow}>LOCAL BY DEFAULT</Text>
                <Text style={styles.onboardingTitle}>Your journal starts on this phone.</Text>
                <Text style={styles.onboardingCopy}>
                  Desktop pairing is optional. When you pair, queued phone changes and desktop trades meet on your private network.
                </Text>
                <View style={styles.onboardingNote}>
                  <Database color={colors.accent} size={19} strokeWidth={2} />
                  <Text style={styles.onboardingNoteText}>Camera and notification access are requested only when you use those features.</Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.onboardingActions}>
            {step > 0 ? (
              <Pressable accessibilityRole="button" style={[styles.secondaryButton, styles.flexOne]} onPress={() => setStep((current) => current - 1)}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, styles.flexOne]}
              disabled={finishing}
              onPress={() => {
                if (lastStep) void finish()
                else setStep((current) => current + 1)
              }}
            >
              {finishing
                ? <ActivityIndicator color="#17130B" />
                : <View style={styles.buttonContent}>
                    <Text style={styles.primaryButtonText}>{lastStep ? 'Open journal' : 'Continue'}</Text>
                    <ChevronRight color="#17130B" size={18} strokeWidth={2.4} />
                  </View>}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

function MobileApp() {
  const db = useSQLiteContext()
  const systemScheme = useColorScheme()
  const [tab, setTab] = useState<Tab>('home')
  const [trades, setTrades] = useState<MobileTrade[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [rules, setRules] = useState<string[]>([])
  const [rulesUpdatedAt, setRulesUpdatedAt] = useState('')
  const [accountState, setAccountState] = useState<AccountState>({ liveCapital: 0, propAccounts: [], updatedAt: '' })
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  const [pairingCode, setPairingCode] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [pendingChangeCount, setPendingChangeCount] = useState(0)
  const [news, setNews] = useState<NewsState>(EMPTY_NEWS)
  const [newsLoading, setNewsLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [demoCount, setDemoCount] = useState(0)
  const [dailyReview, setDailyReview] = useState<DailyReview | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreItemAnimations = useRef(moreTabs.map(() => new Animated.Value(0))).current
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([])
  const [onboardingComplete, setOnboardingComplete] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const syncInFlight = useRef(false)
  const autoSync = useRef<() => void>(() => {})
  const colors = palette(themeMode, systemScheme)
  const styles = useMemo(() => createStyles(colors), [colors])

  const refresh = useCallback(async () => {
    const [nextTrades, nextWatch, nextRuleState, nextAccountState, nextChanges, nextDemoCount] = await Promise.all([
      listTrades(db),
      listWatchlist(db),
      getRuleState(db),
      getAccountState(db),
      pendingTradeChanges(db),
      countDemoTrades(db)
    ])
    setTrades(nextTrades)
    setWatchlist(nextWatch)
    setRules(nextRuleState.rules)
    setRulesUpdatedAt(nextRuleState.updatedAt)
    setAccountState(nextAccountState)
    setPendingChangeCount(nextChanges.length)
    setDemoCount(nextDemoCount)
  }, [db])

  useEffect(() => {
    Promise.all([
      refresh(),
      getSetting(db, 'themeMode', 'system'),
      getSetting(db, 'hapticsEnabled', 'true'),
      getSetting(db, 'pairingCode'),
      getSetting(db, 'lastSyncedAt'),
      getSetting(db, 'favoriteSymbols', '[]'),
      getSetting(db, 'onboardingComplete', 'false')
    ]).then(([, storedTheme, storedHaptics, storedCode, storedSync, storedFavorites, storedOnboarding]) => {
      setThemeMode(['system', 'dark', 'light'].includes(storedTheme) ? storedTheme as ThemeMode : 'system')
      const nextHaptics = storedHaptics !== 'false'
      setHapticsEnabled(nextHaptics)
      setHapticsRuntime(nextHaptics)
      setPairingCode(storedCode)
      setLastSyncedAt(storedSync)
      try {
        const parsedFavorites = JSON.parse(storedFavorites)
        setFavoriteSymbols(Array.isArray(parsedFavorites)
          ? [...new Set(parsedFavorites.map((value) => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 20)
          : [])
      } catch {
        setFavoriteSymbols([])
      }
      const completed = storedOnboarding === 'true'
      setOnboardingComplete(completed)
      setShowOnboarding(!completed)
      setReady(true)

      Notifications.scheduleNotificationAsync({
        content: {
          title: 'TradeHelp Journal',
          body: "Did you trade today? Don't forget to journal your session & execution rules!"
        },
        trigger: {
          hour: 17,
          minute: 0,
          repeats: true
        } as unknown as Notifications.NotificationTriggerInput
      }).catch(() => {})
    }).catch((error) => {
      setSyncMessage(`Startup failed: ${String(error?.message || error)}`)
      setReady(true)
    })
  }, [db, refresh])

  const todayKey = localTimestamp().slice(0, 10)
  useEffect(() => {
    getSetting(db, `dailyReview:${todayKey}`).then((stored) => {
      try {
        const parsed = stored ? JSON.parse(stored) as DailyReview : null
        setDailyReview(parsed?.date === todayKey ? parsed : null)
      } catch {
        setDailyReview(null)
      }
    }).catch(() => setDailyReview(null))
  }, [db, todayKey])

  const [isLogging, setIsLogging] = useState(false)
  const suggestedSymbols = useMemo(
    () => [...new Set([...watchlist.map((item) => item.symbol), ...trades.map((trade) => trade.symbol)].map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 20),
    [trades, watchlist]
  )

  async function addWatchlist(symbol: string, bias: 'Bullish' | 'Bearish' | 'Neutral', keyLevel: string, notes: string) {
    await saveWatchlistItem(db, { symbol, bias, keyLevel, planNotes: notes })
    await refresh()
  }

  async function removeWatchlist(id: string) {
    await deleteWatchlistItem(db, id)
    await refresh()
  }

  async function dropDemoTrades() {
    await clearDemoTrades(db)
    await refresh()
  }

  async function reloadDemoTrades() {
    await loadDemoTrades(db)
    await setSetting(db, `dailyReview:${todayKey}`, '')
    setDailyReview(null)
    await refresh()
    triggerHaptic('success')
  }

  async function saveNextTrade(trade: MobileTrade) {
    await clearDemoTrades(db)
    await saveTrade(db, trade)
    await refresh()
    setIsLogging(false)
    setTab('history')
    autoSync.current()
  }

  async function toggleFavoriteSymbol(symbol: string) {
    const normalized = symbol.trim().toUpperCase()
    if (!normalized) return
    const next = favoriteSymbols.includes(normalized)
      ? favoriteSymbols.filter((item) => item !== normalized)
      : [normalized, ...favoriteSymbols].slice(0, 20)
    setFavoriteSymbols(next)
    await setSetting(db, 'favoriteSymbols', JSON.stringify(next))
  }

  async function completeOnboarding(mode: 'sample' | 'empty') {
    if (mode === 'empty') await clearDemoTrades(db)
    else await loadDemoTrades(db)
    await setSetting(db, 'onboardingComplete', 'true')
    setOnboardingComplete(true)
    setShowOnboarding(false)
    await refresh()
    triggerHaptic('success')
  }

  function clearPhoneData() {
    Alert.alert(
      'Clear this phone?',
      'This removes trades, watchlist items, rules, pairing details, and settings from this phone. It does not delete data already stored on TradeHelp Desktop.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear phone',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalData(db)
            const freshRuleState = await getRuleState(db)
            setTrades([])
            setWatchlist([])
            setRules(freshRuleState.rules)
            setRulesUpdatedAt(freshRuleState.updatedAt)
            setAccountState({ liveCapital: 0, propAccounts: [], updatedAt: '' })
            setThemeMode('system')
            setHapticsEnabled(true)
            setHapticsRuntime(true)
            setPairingCode('')
            setLastSyncedAt('')
            setPendingChangeCount(0)
            setFavoriteSymbols([])
            setDemoCount(0)
            setDailyReview(null)
            setOnboardingComplete(false)
            setShowOnboarding(true)
            setTab('home')
            triggerHaptic('success')
          }
        }
      ]
    )
  }

  async function saveTradeChanges(trade: MobileTrade) {
    await updateLocalTrade(db, trade)
    await refresh()
    autoSync.current()
  }

  async function removeTrade(trade: MobileTrade) {
    await deleteLocalTrade(db, trade)
    await refresh()
    autoSync.current()
  }

  async function chooseTheme(mode: ThemeMode) {
    setThemeMode(mode)
    await setSetting(db, 'themeMode', mode)
  }

  async function chooseHaptics(enabled: boolean) {
    setHapticsEnabled(enabled)
    setHapticsRuntime(enabled)
    await setSetting(db, 'hapticsEnabled', String(enabled))
    if (enabled) triggerHaptic('success')
  }

  async function saveRuleChanges(nextRules: string[]) {
    const state = await saveRules(db, nextRules)
    setRules(state.rules)
    setRulesUpdatedAt(state.updatedAt)
  }

  async function saveAccountChanges(nextState: AccountState) {
    const saved = await saveAccountState(db, nextState)
    setAccountState(saved)
    autoSync.current()
  }

  async function saveDailyReview(review: DailyReview) {
    await setSetting(db, `dailyReview:${review.date}`, JSON.stringify(review))
    setDailyReview(review)
  }

  const refreshMobileNews = useCallback(async (requestPermission = false) => {
    setNewsLoading(true)
    try {
      setNews(await refreshNewsCalendar(db, { requestPermission }))
    } catch (error) {
      setNews((current) => ({
        ...current,
        warning: String(error instanceof Error ? error.message : error)
      }))
    } finally {
      setNewsLoading(false)
    }
  }, [db])

  async function toggleNewsAlerts(enabled: boolean) {
    setNewsLoading(true)
    try {
      setNews(await setNewsAlertsEnabled(db, enabled))
    } catch (error) {
      setNews((current) => ({
        ...current,
        warning: String(error instanceof Error ? error.message : error)
      }))
    } finally {
      setNewsLoading(false)
    }
  }

  useEffect(() => {
    if (!ready) return undefined
    refreshMobileNews(false)
    autoSync.current()
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      refreshMobileNews(false)
      autoSync.current()
    })
    return () => appState.remove()
  }, [ready, refreshMobileNews])

  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      if (event.notification.request.content.data?.type === 'economic-news') setTab('news')
    })
    Notifications.getLastNotificationResponseAsync().then((event) => {
      if (event?.notification.request.content.data?.type === 'economic-news') setTab('news')
    }).catch(() => {})
    return () => response.remove()
  }, [])

  const syncNow = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!pairingCode.trim() || syncInFlight.current) return
    syncInFlight.current = true
    setSyncing(true)
    if (!silent) setSyncMessage('')
    try {
      const result = await syncDesktop(db, pairingCode)
      setLastSyncedAt(result.syncedAt)
      setRules(result.rules)
      setRulesUpdatedAt(result.rulesUpdatedAt)
      setAccountState(result.accountState)
      if (result.pairingCode && result.pairingCode !== pairingCode) setPairingCode(result.pairingCode)
      await clearDemoTrades(db)
      await refresh()
      await refreshMobileNews(false)
      const applied = [
        result.importedCount ? `${result.importedCount} added` : '',
        result.updatedCount ? `${result.updatedCount} updated` : '',
        result.deletedCount ? `${result.deletedCount} deleted` : ''
      ].filter(Boolean).join(', ')
      if (!silent || applied) setSyncMessage(applied ? `Synced. ${applied}.` : 'Synced. Everything is current.')
    } catch (error) {
      if (!silent) setSyncMessage(String(error instanceof Error ? error.message : error))
    } finally {
      syncInFlight.current = false
      setSyncing(false)
    }
  }, [db, pairingCode, refresh, refreshMobileNews])

  useEffect(() => { autoSync.current = () => { void syncNow({ silent: true }) } }, [syncNow])

  const pending = pendingChangeCount
  const darkBackdrop = colors.statusBar === 'light-content'
  const fadeAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  const changeTab = useCallback((nextTab: Tab) => {
    setMoreOpen(false)
    if (nextTab === tab) return
    Animated.timing(fadeAnim, {
      toValue: 0.15,
      duration: 100,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true
    }).start(() => {
      setTab(nextTab)
      slideAnim.setValue(14)
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      ]).start()
    })
  }, [tab, fadeAnim, slideAnim])

  useEffect(() => {
    let cancelled = false

    if (!moreOpen) {
      moreItemAnimations.forEach((animation) => {
        animation.stopAnimation()
        animation.setValue(0)
      })
      return undefined
    }

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return
        if (reduceMotion) {
          moreItemAnimations.forEach((animation) => animation.setValue(1))
          return
        }

        Animated.stagger(
          55,
          moreItemAnimations.map((animation) =>
            Animated.spring(animation, {
              toValue: 1,
              stiffness: 260,
              damping: 23,
              mass: 0.65,
              useNativeDriver: true
            })
          )
        ).start()
      })
      .catch(() => {
        if (!cancelled) moreItemAnimations.forEach((animation) => animation.setValue(1))
      })

    return () => {
      cancelled = true
      moreItemAnimations.forEach((animation) => animation.stopAnimation())
    }
  }, [moreItemAnimations, moreOpen])

  const renderNavTab = (item: (typeof primaryTabs)[number]) => {
    const active = tab === item.key
    const Icon = item.icon
    return (
      <Pressable
        key={item.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => changeTab(item.key)}
        style={styles.tab}
      >
        {active ? <View style={styles.tabActiveLine} /> : null}
        <View style={[styles.tabGlyph, active ? styles.tabGlyphActive : null]}>
          <Icon
            color={active ? colors.accent : colors.dim}
            size={19}
            strokeWidth={active ? 2.35 : 1.9}
          />
        </View>
        <Text style={[styles.tabLabel, active ? styles.tabActiveText : null]}>{item.label}</Text>
      </Pressable>
    )
  }

  if (!ready) {
    return <View style={[styles.app, styles.loading]}><ActivityIndicator color={colors.accent} /></View>
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.header} />
      <CalmBackdrop dark={darkBackdrop} colors={colors} styles={styles} />
      <View style={styles.header}>
        <LinearGradient colors={[colors.accentSoft, colors.surface2]} style={styles.logo}>
          <View style={[styles.candle, { height: 12, backgroundColor: colors.down }]} />
          <View style={[styles.candle, { height: 19, backgroundColor: colors.accent }]} />
          <View style={[styles.candle, { height: 15, backgroundColor: colors.up }]} />
        </LinearGradient>
        <Text style={styles.brand}>Trade<Text style={{ color: colors.accent }}>Help</Text></Text>
        <View style={styles.offline}>
          <View style={[styles.statusDot, { backgroundColor: syncing || pending ? colors.accent : colors.up }]} />
          <Text style={styles.offlineText}>{syncing ? 'SYNCING' : pending ? `${pending} QUEUED` : pairingCode ? 'PAIRED' : 'LOCAL'}</Text>
        </View>
      </View>

      <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {tab === 'home' && (
          <Home
            trades={trades}
            pending={pending}
            watchlist={watchlist}
            onAddWatchlist={addWatchlist}
            onDeleteWatchlist={removeWatchlist}
            onSync={syncNow}
            syncing={syncing}
            paired={Boolean(pairingCode)}
            demoCount={demoCount}
            onLoadDemo={reloadDemoTrades}
            onClearDemo={dropDemoTrades}
            rules={rules}
            news={news}
            dailyReview={dailyReview}
            onSaveReview={saveDailyReview}
            onOpenHistory={() => changeTab('history')}
            onOpenSettings={() => changeTab('settings')}
            colors={colors}
            styles={styles}
          />
        )}
        {tab === 'history' && <History trades={trades} accounts={accountState.propAccounts} onUpdate={saveTradeChanges} onDelete={removeTrade} colors={colors} styles={styles} />}
        {tab === 'insights' && <Insights trades={trades} colors={colors} styles={styles} />}
        {tab === 'accounts' && <Accounts trades={trades} accountState={accountState} onSave={saveAccountChanges} colors={colors} styles={styles} />}
        {tab === 'vault' && <Vault trades={trades} onUpdate={saveTradeChanges} colors={colors} styles={styles} />}
        {tab === 'news' && <News state={news} loading={newsLoading} onRefresh={() => refreshMobileNews(false)} onToggle={toggleNewsAlerts} onTest={scheduleNewsTestNotification} colors={colors} styles={styles} />}
        {tab === 'settings' && <Settings mode={themeMode} onMode={chooseTheme} hapticsEnabled={hapticsEnabled} onHaptics={chooseHaptics} pairingCode={pairingCode} onPairingCode={setPairingCode} onSync={syncNow} syncing={syncing} syncMessage={syncMessage} pending={pending} rules={rules} rulesUpdatedAt={rulesUpdatedAt} onSaveRules={saveRuleChanges} lastSyncedAt={lastSyncedAt} onReplayOnboarding={() => setShowOnboarding(true)} onClearPhone={clearPhoneData} colors={colors} styles={styles} />}
      </Animated.View>

      <OnboardingWizard
        visible={showOnboarding}
        rules={rules}
        canDismiss={onboardingComplete}
        onDismiss={() => setShowOnboarding(false)}
        onFinish={completeOnboarding}
        colors={colors}
        styles={styles}
      />

      <Modal visible={isLogging} animationType="slide" onRequestClose={() => setIsLogging(false)}>
        <SafeAreaView style={styles.app}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.header} />
          <CalmBackdrop dark={darkBackdrop} colors={colors} styles={styles} />
          <QuickLog
            key={rules.join('|')}
            rules={rules}
            accounts={accountState.propAccounts}
            favoriteSymbols={favoriteSymbols}
            suggestedSymbols={suggestedSymbols}
            onToggleFavoriteSymbol={(symbol) => { void toggleFavoriteSymbol(symbol) }}
            onSaved={saveNextTrade}
            onClose={() => setIsLogging(false)}
            colors={colors}
            styles={styles}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.moreOverlay}>
          <Pressable
            accessibilityLabel="Close more menu"
            style={styles.moreScrim}
            onPress={() => setMoreOpen(false)}
          />
          <View accessibilityRole="menu" style={styles.moreList}>
            {[...moreTabs].reverse().map((item, index) => {
              const Icon = item.icon
              const active = tab === item.key
              const animation = moreItemAnimations[moreTabs.length - 1 - index]!
              return (
                <Animated.View
                  key={item.key}
                  testID={`more-step-${item.key}`}
                  style={[
                    styles.moreStep,
                    {
                      opacity: animation,
                      transform: [
                        { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
                        { scale: animation.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }
                      ]
                    }
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.label}`}
                    accessibilityState={{ selected: active }}
                    style={[styles.moreOption, active ? styles.moreOptionActive : null]}
                    onPress={() => {
                      triggerHaptic('selection')
                      changeTab(item.key)
                    }}
                  >
                    <Text style={[styles.moreOptionLabel, active ? { color: colors.accent } : null]}>{item.label}</Text>
                    <View style={[styles.moreOptionIcon, active ? styles.moreOptionIconActive : null]}>
                      <Icon color={active ? colors.accent : colors.text} size={19} strokeWidth={2} />
                    </View>
                  </Pressable>
                </Animated.View>
              )
            })}
          </View>
        </View>
      </Modal>

      <LinearGradient colors={[colors.nav, colors.header]} style={styles.tabBar}>
        <View style={styles.tabGroup}>{primaryTabs.slice(0, 2).map(renderNavTab)}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log a trade"
          onPress={() => {
            triggerHaptic('medium')
            setIsLogging(true)
          }}
          style={styles.captureTab}
        >
          <View style={styles.captureTabButton}>
            <Plus color="#17130B" size={21} strokeWidth={2.7} />
          </View>
          <Text style={styles.captureTabLabel}>Log</Text>
        </Pressable>
        <View style={styles.tabGroup}>
          {primaryTabs.slice(2).map(renderNavTab)}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            accessibilityLabel="More screens"
            onPress={() => {
              triggerHaptic('selection')
              setMoreOpen((current) => !current)
            }}
            style={styles.tab}
          >
            {moreTabs.some((item) => item.key === tab) ? <View style={styles.tabActiveLine} /> : null}
            <View style={[styles.tabGlyph, moreTabs.some((item) => item.key === tab) ? styles.tabGlyphActive : null]}>
              <CircleEllipsis
                color={moreTabs.some((item) => item.key === tab) ? colors.accent : colors.dim}
                size={20}
                strokeWidth={moreTabs.some((item) => item.key === tab) ? 2.35 : 1.9}
              />
            </View>
            <Text style={[styles.tabLabel, moreTabs.some((item) => item.key === tab) ? styles.tabActiveText : null]}>More</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SQLiteProvider databaseName="tradehelp-mobile.db" onInit={initializeDatabase}>
      <MobileApp />
    </SQLiteProvider>
  )
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    app: { flex: 1, backgroundColor: colors.bg, paddingTop: StatusBar.currentHeight ?? 0, overflow: 'hidden' },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    calmBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    backdropImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
    glowLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
    glowWave: { position: 'absolute', top: '-9%', height: '118%' },
    glowWaveBand: { flex: 1 },
    loading: { alignItems: 'center', justifyContent: 'center' },
    screen: { flex: 1 },
    flexOne: { flex: 1 },
    header: {
      height: 56, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.header
    },
    logo: {
      width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5,
      shadowColor: colors.accent, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }
    },
    candle: { width: 3.5, borderRadius: 2 },
    brand: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1 },
    offline: {
      minHeight: 28, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 20,
      paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface2
    },
    offlineText: { color: colors.dim, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    // Capped and centred so the layout still reads as a column on a tablet or a
    // large phone in landscape. Left to stretch, the stat grid becomes two very
    // wide boxes and body copy runs to unreadable line lengths.
    content: {
      paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 14,
      width: '100%', maxWidth: 640, alignSelf: 'center'
    },
    keyboardContent: { paddingBottom: 140 },
    pageIntro: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
    pageTitleStack: { gap: 4, marginBottom: 2 },
    demoBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong,
      borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12
    },
    demoBannerTitle: { color: colors.accent, fontSize: 11, fontWeight: '800', marginBottom: 2 },
    demoBannerCopy: { color: colors.dim, fontSize: 11, lineHeight: 15 },
    demoBannerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    demoBannerButton: {
      minHeight: 44, paddingHorizontal: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 5,
      backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent
    },
    demoBannerButtonText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
    eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800' },
    title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800' },
    copy: { color: colors.dim, fontSize: 14, lineHeight: 21 },
    sessionBadge: {
      minHeight: 28, borderRadius: 14, paddingHorizontal: 10,
      flexDirection: 'row', alignItems: 'center', gap: 6
    },
    sessionBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    heroCard: {
      minHeight: 222, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 8,
      padding: 20, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.28, shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 }, elevation: 6
    },
    heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroLabel: { color: colors.dim, fontSize: 12, fontWeight: '800' },
    heroValue: { fontSize: 42, lineHeight: 50, fontWeight: '800', marginTop: 12 },
    heroCaption: { color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: 3 },
    heroMetrics: {
      minHeight: 64, flexDirection: 'row', alignItems: 'stretch', marginTop: 22,
      borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16
    },
    heroMetric: { flex: 1, justifyContent: 'center' },
    heroMetricBorder: { borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 16 },
    heroMetricLabel: { color: colors.faint, fontSize: 10, fontWeight: '800' },
    heroMetricValue: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 5 },
    accountHero: {
      minHeight: 238, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 8,
      padding: 18, gap: 8, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.2, shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 }
    },
    accountIcon: {
      width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft,
      borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center'
    },
    accountBalance: { fontSize: 32, lineHeight: 39, fontWeight: '800', marginTop: 5 },
    accountMetricGrid: {
      flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line,
      paddingTop: 15, marginTop: 12, gap: 8
    },
    accountMetric: { flex: 1, minWidth: 0 },
    accountMetricValue: { color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '800', marginTop: 5 },
    accountSavedCapital: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800' },
    accountPicker: { gap: 8, paddingVertical: 2, paddingRight: 4 },
    accountPickerPill: {
      maxWidth: 180, minHeight: 40, justifyContent: 'center',
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 10, paddingHorizontal: 13
    },
    accountPickerPillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    accountPickerText: { color: colors.dim, fontSize: 12, fontWeight: '800' },
    accountTemplateBar: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    accountTemplateMini: {
      minHeight: 32, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 9
    },
    accountTemplateMiniText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
    accountChallenge: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong,
      borderRadius: 8, padding: 18, gap: 14,
      shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }
    },
    accountChallengeTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: 4 },
    accountStatus: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
    accountStatusText: { fontSize: 10, fontWeight: '800' },
    accountPnlRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
    accountTargetText: { color: colors.dim, fontSize: 12, lineHeight: 18, fontWeight: '700', paddingBottom: 4 },
    accountProgressTrack: {
      height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden'
    },
    accountProgressFill: { height: '100%', borderRadius: 4 },
    templateRow: { flexDirection: 'row', gap: 8 },
    templateButton: {
      flex: 1, minWidth: 0, minHeight: 76, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 4
    },
    templateSize: { color: colors.accent, fontSize: 18, fontWeight: '800' },
    templateCaption: { color: colors.dim, fontSize: 9, lineHeight: 13, fontWeight: '700', marginTop: 4, textAlign: 'center' },
    sectionHeadingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8
    },
    sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
    statsRow: { flexDirection: 'row', gap: 12 },
    holdGrid: {
      flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14,
      paddingTop: 2
    },
    holdMetric: {
      width: '47%', minWidth: 0, borderLeftWidth: 2, borderLeftColor: colors.lineStrong,
      paddingLeft: 10, paddingVertical: 2
    },
    holdValue: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: '800', marginTop: 5 },
    stat: {
      flex: 1, minWidth: 0, minHeight: 84, padding: 14, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }
    },
    kicker: { color: colors.dim, fontSize: 10, fontWeight: '800' },
    sectionLabel: { color: colors.dim, fontSize: 11, fontWeight: '800', marginTop: 4 },
    statValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
    statValueWide: { fontSize: 19, lineHeight: 24 },
    snapshotPanel: {
      minHeight: 74, flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 13
    },
    snapshotItem: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 11 },
    snapshotDivider: { width: 1, backgroundColor: colors.line },
    snapshotValue: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 5 },
    topSetupRow: {
      minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, paddingHorizontal: 4
    },
    topSetupValue: { color: colors.text, flex: 1, textAlign: 'right', fontSize: 14, lineHeight: 19, fontWeight: '700' },
    panel: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      padding: 18, gap: 14, marginTop: 4,
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }
    },
    chartPanel: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 8, padding: 16, paddingHorizontal: 12, gap: 10, marginTop: 4, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }
    },
    chartValue: { fontSize: 28, lineHeight: 34, fontWeight: '800', marginTop: 4 },
    chartComparison: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 2 },
    chart: { width: '100%', height: 175, overflow: 'hidden', marginVertical: 2 },
    chartRanges: {
      minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6,
      borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10
    },
    chartRange: {
      flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center'
    },
    chartRangeActive: { backgroundColor: colors.accentSoft },
    chartRangeText: { color: colors.dim, fontSize: 11, fontWeight: '800' },
    panelTitle: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
    rowText: { color: colors.text, fontSize: 14, lineHeight: 20 },
    adaptiveCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      padding: 16, gap: 12
    },
    textAction: {
      minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 2
    },
    textActionLabel: { color: colors.accent, fontSize: 13, fontWeight: '700' },
    insightCard: {
      minHeight: 112, flexDirection: 'row', alignItems: 'flex-start', gap: 13,
      backgroundColor: colors.surface, borderWidth: 1, borderRadius: 8, padding: 16
    },
    syncCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      padding: 16, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 14
    },
    featureIcon: {
      width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft,
      alignItems: 'center', justifyContent: 'center'
    },
    infoStrip: {
      minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12,
      borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 4, marginTop: 2
    },
    alertRow: { flexDirection: 'row', gap: 12 },
    muted: { color: colors.dim, fontSize: 13, lineHeight: 19 },
    warning: { color: colors.down, fontSize: 12, lineHeight: 18 },
    pill: { backgroundColor: colors.accentSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
    pillText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
    label: { color: colors.dim, fontSize: 12, fontWeight: '700', marginTop: 5 },
    input: {
      minHeight: 50, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
      borderRadius: 14, color: colors.text, paddingHorizontal: 15, fontSize: 15
    },
    symbolField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    symbolFieldCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    symbolFieldValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
    symbolFieldPlaceholder: { color: colors.dim, fontSize: 14 },
    symbolUsual: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
    searchBar: {
      minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 8, paddingHorizontal: 13
    },
    searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, paddingVertical: 10 },
    pairingInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top', fontSize: 12 },
    fieldRow: { flexDirection: 'row', gap: 12 },
    field: { flex: 1, gap: 8 },
    accountTagRow: { gap: 7, paddingVertical: 2, paddingRight: 4 },
    accountTag: {
      minHeight: 44, maxWidth: 190, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12
    },
    accountTagActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    accountTagText: { color: colors.dim, fontSize: 12, fontWeight: '800' },
    notes: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
    detailsToggle: {
      minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: colors.line, borderRadius: 14,
      backgroundColor: colors.surface, paddingHorizontal: 15, paddingVertical: 10
    },
    detailsToggleTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
    optionalDetails: { gap: 14, paddingTop: 2 },
    reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 2 },
    primaryButton: {
      minHeight: 54, borderRadius: 14, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4,
      shadowColor: colors.accent, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }
    },
    primaryButtonText: { color: '#17130B', fontSize: 16, fontWeight: '800' },
    secondaryButton: {
      minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.lineStrong,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 16, marginTop: 3
    },
    disabledButton: { opacity: 0.5 },
    secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
    dangerButton: { borderColor: colors.downSoft },
    compactButton: {
      minWidth: 44, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12
    },
    iconButton: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong,
      backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'
    },
    compactButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionRow: { flexDirection: 'row', gap: 10 },
    backAction: { minHeight: 44, alignItems: 'center', alignSelf: 'flex-start' },
    centeredRow: { alignItems: 'center' },
    toggleControl: { width: 52, height: 44, alignItems: 'center', justifyContent: 'center' },
    toggle: {
      width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center',
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line
    },
    toggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.dim },
    toggleKnobOn: { alignSelf: 'flex-end', backgroundColor: colors.accent },
    error: { color: colors.down, fontSize: 13, lineHeight: 19 },
    segment: {
      minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 14,
      padding: 4, flexDirection: 'row', backgroundColor: colors.surface
    },
    segmentOption: { flex: 1, minWidth: 0, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    segmentActive: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
    segmentText: { color: colors.dim, fontSize: 13, fontWeight: '700' },
    compactSegment: {
      minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5
    },
    compactSegmentOption: {
      minWidth: 62, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 10
    },
    resultCount: { color: colors.faint, flex: 1, textAlign: 'right', fontSize: 11, fontWeight: '700' },
    ruleCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 12 },
    answerRow: { flexDirection: 'row', gap: 10 },
    answerButton: {
      flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center'
    },
    answerYes: { borderColor: colors.up, backgroundColor: colors.upSoft },
    answerNo: { borderColor: colors.down, backgroundColor: colors.downSoft },
    answerText: { color: colors.dim, fontSize: 13, fontWeight: '700' },
    checkSummary: {
      backgroundColor: colors.accentSoft, borderRadius: 14, borderWidth: 1,
      borderColor: colors.accent, padding: 16, gap: 4
    },
    imagePreview: {
      flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1,
      borderColor: colors.line, borderRadius: 14, padding: 10, backgroundColor: colors.surface
    },
    previewImage: { width: 88, height: 58, borderRadius: 8, resizeMode: 'cover', flex: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 12 },
    emptyMark: {
      color: colors.accent, fontSize: 30, fontWeight: '800', borderWidth: 1,
      borderColor: colors.line, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14
    },
    tradeCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 8, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    tradeRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
    tradeOutcomeRail: { width: 4, height: 48, borderRadius: 2 },
    tradeTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 5 },
    tradeSymbol: { color: colors.text, fontSize: 17, fontWeight: '800' },
    tradeMeta: { color: colors.dim, fontSize: 12 },
    tradeSummary: { lineHeight: 17 },
    tradeRight: { alignItems: 'flex-end', gap: 6 },
    tradePnl: { fontSize: 16, fontWeight: '800' },
    pnlPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    syncLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    historyThumbnail: { width: 44, height: 44, borderRadius: 6, backgroundColor: colors.surface2 },
    historyDetails: {
      gap: 10, borderTopWidth: 1, borderTopColor: colors.line,
      paddingHorizontal: 13, paddingTop: 11, paddingBottom: 12
    },
    historyActions: {
      flexDirection: 'row', justifyContent: 'flex-end', gap: 8
    },
    historyAction: {
      minWidth: 92, minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface2,
      paddingHorizontal: 12
    },
    dangerAction: { borderColor: colors.downSoft },
    historyActionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    historyMonthLabel: {
      color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 0.7,
      marginTop: 5, marginBottom: -4
    },
    emptyNews: {
      minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 24,
      backgroundColor: colors.surface
    },
    emptyNewsIcon: {
      width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.lineStrong
    },
    centerText: { textAlign: 'center' },
    newsStatusBlock: { gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
    newsStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    newsStatusTitle: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    eventCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderLeftWidth: 4, borderRadius: 8, padding: 16, gap: 10,
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }
    },
    impactBadge: {
      borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4
    },
    impactText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    eventCountdown: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800' },
    eventTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
    eventNumbers: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
    eventNumber: { color: colors.dim, fontSize: 11, fontWeight: '600' },
    settingsSection: { gap: 12, marginTop: 4, marginBottom: 2 },
    syncStatusPanel: {
      minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      backgroundColor: colors.surface2, paddingHorizontal: 12, paddingVertical: 10
    },
    preferenceRow: {
      minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 8, paddingHorizontal: 13, paddingVertical: 10
    },
    themeGrid: { flexDirection: 'row', gap: 10 },
    themeChoice: {
      flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line,
      borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface
    },
    themeChoiceActive: {
      borderColor: colors.accent,
      shadowColor: colors.accent, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }
    },
    themePreview: { height: 64, padding: 10, justifyContent: 'center', gap: 6 },
    themePreviewBar: { width: 26, height: 4, borderRadius: 2, marginBottom: 2 },
    themePreviewLine: { height: 4, borderRadius: 2, opacity: 0.9 },
    themeChoiceFooter: {
      minHeight: 40, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.line,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
    },
    themeChoiceLabel: { color: colors.dim, fontSize: 12, fontWeight: '700' },
    radio: {
      width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.lineStrong,
      alignItems: 'center', justifyContent: 'center'
    },
    radioActive: { borderColor: colors.accent },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
    ruleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    ruleInput: { flex: 1, minWidth: 0 },
    ruleNumber: {
      width: 24, height: 24, borderRadius: 6, textAlign: 'center', textAlignVertical: 'center',
      color: colors.accent, backgroundColor: colors.accentSoft, fontSize: 11, fontWeight: '800'
    },
    removeRuleButton: {
      width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center'
    },
    removeRuleText: { color: colors.down, fontSize: 12, fontWeight: '800' },
    scannerScreen: { flex: 1, backgroundColor: colors.bg },
    modalScreen: { flex: 1, backgroundColor: colors.bg },
    onboardingScreen: { flex: 1, backgroundColor: '#080D13' },
    onboardingBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
    onboardingShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5, 9, 14, 0.58)' },
    onboardingContent: {
      flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center',
      paddingHorizontal: 20, paddingTop: 18, paddingBottom: 22, gap: 18
    },
    onboardingLogo: {
      width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5,
      backgroundColor: 'rgba(14,20,32,0.82)'
    },
    onboardingBrand: { color: '#F5F7FA', fontSize: 20, fontWeight: '800' },
    onboardingProgress: { flexDirection: 'row', gap: 7 },
    onboardingProgressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.16)' },
    onboardingProgressActive: { backgroundColor: colors.accent },
    onboardingBody: { flex: 1, justifyContent: 'center', gap: 14 },
    onboardingIcon: {
      width: 58, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(245,158,11,0.14)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)'
    },
    onboardingEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
    onboardingTitle: { color: '#F5F7FA', fontSize: 30, lineHeight: 37, fontWeight: '800', maxWidth: 520 },
    onboardingCopy: { color: '#B4BECE', fontSize: 15, lineHeight: 23, maxWidth: 540 },
    onboardingNote: {
      minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', borderRadius: 8,
      backgroundColor: 'rgba(13,20,30,0.78)', paddingHorizontal: 14, paddingVertical: 11
    },
    onboardingNoteText: { flex: 1, color: '#D3DAE5', fontSize: 13, lineHeight: 19 },
    onboardingChoice: {
      minHeight: 82, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 8,
      backgroundColor: colors.surface, padding: 14, gap: 4
    },
    onboardingChoiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    onboardingRules: { gap: 8 },
    onboardingRule: {
      minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.line, borderRadius: 8,
      backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 9
    },
    onboardingActions: { flexDirection: 'row', gap: 10 },
    scannerHeader: {
      minHeight: 78, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row',
      alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line
    },
    camera: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scanFrame: {
      width: 240, height: 240, borderWidth: 2, borderColor: colors.accent,
      borderRadius: 14, backgroundColor: 'transparent'
    },
    scannerFooter: { minHeight: 64, padding: 16, alignItems: 'center', justifyContent: 'center' },
    tabBar: {
      minHeight: 76, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
      backgroundColor: colors.nav, flexDirection: 'row', paddingBottom: 5,
      shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: -5 }
    },
    tabGroup: { flex: 1, minWidth: 0, flexDirection: 'row' },
    tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
    tabActiveLine: {
      position: 'absolute', top: 0, width: 32, height: 3, borderRadius: 1.5,
      backgroundColor: colors.accent
    },
    tabGlyph: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    tabGlyphActive: { backgroundColor: colors.accentSoft },
    tabGlyphText: { color: colors.dim, fontSize: 13, fontWeight: '800' },
    tabLabel: { color: colors.dim, fontSize: 9.5, fontWeight: '700' },
    tabActiveText: { color: colors.accent },
    captureTab: {
      width: 62, alignItems: 'center', justifyContent: 'center', gap: 3,
      transform: [{ translateY: -7 }]
    },
    captureTabButton: {
      width: 38, height: 38, borderRadius: 8, backgroundColor: colors.accent,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.accent, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }
    },
    captureTabLabel: { color: colors.accent, fontSize: 9.5, fontWeight: '800' },
    moreOverlay: { flex: 1 },
    moreScrim: {
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      backgroundColor: 'rgba(5, 8, 14, 0.12)'
    },
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetScrim: {
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
      backgroundColor: 'rgba(5, 8, 14, 0.62)'
    },
    sheetTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: '800' },
    moreList: {
      position: 'absolute', right: 10, bottom: 82, alignItems: 'flex-end', gap: 9
    },
    moreStep: { alignSelf: 'flex-end' },
    moreOption: {
      height: 46, minWidth: 132, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
      borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 23,
      backgroundColor: colors.surfaceElevated, paddingLeft: 16, paddingRight: 5,
      shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 }, elevation: 5
    },
    moreOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    moreOptionLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
    moreOptionIcon: {
      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surface2
    },
    moreOptionIconActive: { backgroundColor: colors.surface },
    symbolSheet: {
      maxHeight: '82%', backgroundColor: colors.surfaceElevated, borderTopWidth: 1,
      borderTopColor: colors.lineStrong, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24, gap: 14
    },
    symbolList: { gap: 8, paddingBottom: 20 },
    symbolRow: {
      minHeight: 54, flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface
    },
    symbolSelect: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
    symbolName: { color: colors.text, fontSize: 16, fontWeight: '800' },
    symbolSelected: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
    symbolStar: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
    useSymbolButton: {
      minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderColor: colors.accent, borderRadius: 8, backgroundColor: colors.accentSoft
    },
    useSymbolText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
    monthPickerSheet: {
      backgroundColor: colors.surfaceElevated, borderTopWidth: 1, borderTopColor: colors.lineStrong,
      borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 14
    },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    monthButton: {
      width: '22.5%', minHeight: 46, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surface
    },
    timePickerOverlay: {
      position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      backgroundColor: 'rgba(8, 12, 20, 0.85)', justifyContent: 'flex-end',
      padding: 14, zIndex: 9999
    },
    timePickerCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 18, gap: 14,
      shadowColor: colors.shadow, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }
    },
    timeDisplayBox: {
      backgroundColor: colors.surface2, borderRadius: 16, padding: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line
    },
    timeDisplayBig: {
      color: colors.accent, fontSize: 30, fontWeight: '800', letterSpacing: 0.5
    },
    presetRow: { gap: 8, paddingVertical: 2 },
    presetPill: {
      minHeight: 44, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center'
    },
    presetText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    pickerColumnsRow: { flexDirection: 'row', gap: 10, height: 170 },
    pickerCol: { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, padding: 8, borderWidth: 1, borderColor: colors.line },
    pickerColLabel: { color: colors.faint, fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
    pickerScroll: { flex: 1 },
    pickerItem: { height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    pickerItemActive: { backgroundColor: colors.accentSoft },
    pickerItemText: { color: colors.dim, fontSize: 14, fontWeight: '700' },
    pickerItemTextActive: { color: colors.accent, fontWeight: '800' },
    vaultGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'flex-start'
    },
    vaultCard: {
      width: '48.5%', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
      overflow: 'hidden', position: 'relative',
      shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    vaultImage: { width: '100%', height: 118, backgroundColor: colors.surface2 },
    vaultPlaceholder: { width: '100%', height: 118, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 12 },
    vaultPlaceholderChart: { height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
    vaultPlaceholderText: { color: colors.dim, fontSize: 11, fontWeight: '700' },
    vaultOverlayHeader: { position: 'absolute', top: 8, left: 8 },
    vaultFooter: { padding: 11, borderTopWidth: 1, borderTopColor: colors.line, gap: 3 },
    vaultTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
    vaultPnl: { maxWidth: '58%', fontSize: 13, fontWeight: '800' },
    vaultMeta: { color: colors.dim, fontSize: 11, lineHeight: 15, fontWeight: '600' },
    vaultDate: { color: colors.faint, fontSize: 10, lineHeight: 14 },
    vaultEmpty: { width: '100%' },
    reviewModalCard: {
      width: '100%', maxWidth: 520, maxHeight: '92%', alignSelf: 'center',
      backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
      padding: 18, gap: 18
    },
    reviewQuestion: { gap: 10 },
    lightboxOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 16
    },
    lightboxCard: {
      backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 14, maxHeight: '90%'
    },
    lightboxImage: { width: '100%', height: 260, borderRadius: 14, backgroundColor: '#0A0D14' },
    lightboxPlaceholder: {
      width: '100%', height: 200, borderRadius: 14, backgroundColor: colors.surface2,
      borderWidth: 1, borderColor: colors.line, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 16
    },
    quoteCard: {
      backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line,
      padding: 14, marginTop: 4, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    quoteText: { color: colors.text, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
    quoteAuthor: { color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 4 },
    shareCard: {
      backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 16, maxWidth: 500, alignSelf: 'center', width: '100%'
    },
    shareGraphic: {
      borderRadius: 18, borderWidth: 1, borderColor: colors.lineStrong, padding: 20, gap: 10
    },
    gradeBadge: {
      borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', justifyContent: 'center'
    },
    gradeText: { fontSize: 16, fontWeight: '800' },
    gradeBadgeSmall: {
      borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 6
    },
    gradeTextSmall: { fontSize: 11, fontWeight: '800' },
    watchCard: {
      backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6
    },
    calendarCard: {
      backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12, marginTop: 4
    },
    calendarMonthButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    calendarJumpHint: { color: colors.accent, fontSize: 9, fontWeight: '800', marginTop: 2 },
    calendarWeekHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8 },
    calendarWeekText: { flex: 1, color: colors.faint, fontSize: 11, fontWeight: '800', textAlign: 'center' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    calendarCellEmpty: { width: '12%', aspectRatio: 1 },
    calendarCell: {
      width: '12%', aspectRatio: 1, borderRadius: 10, padding: 4, justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.line
    },
    calendarDayNum: { color: colors.text, fontSize: 11, fontWeight: '700' },
    calendarPnlText: { fontSize: 9, fontWeight: '800' },
    edgeItem: {
      backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4
    }
  })
}

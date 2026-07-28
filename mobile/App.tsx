import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import * as Notifications from 'expo-notifications'
import { LinearGradient } from 'expo-linear-gradient'
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite'
import {
  Award,
  BellRing,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  History as HistoryIcon,
  House,
  ImagePlus,
  List,
  Newspaper,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Save,
  ScanLine,
  Settings as SettingsIcon,
  Share2,
  Smartphone,
  Target,
  Trash2,
  TrendingUp,
  Wifi,
  XCircle
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
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
  clearDemoTrades,
  countDemoTrades,
  createLocalId,
  deleteLocalTrade,
  deleteWatchlistItem,
  getRuleState,
  getSetting,
  listTrades,
  listWatchlist,
  MobileTrade,
  pendingTradeChanges,
  saveRules,
  saveTrade,
  saveWatchlistItem,
  setSetting,
  updateLocalTrade,
  WatchlistItem
} from './src/storage/repository'
import { syncDesktop } from './src/sync/client'
import {
  EconomicEvent,
  NewsState,
  refreshNews as refreshNewsCalendar,
  scheduleNewsTestNotification,
  setNewsAlertsEnabled
} from './src/news'
import { computeEdgeStats, computeMobileStats, computeTradeGrade } from './src/stats'
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

type Tab = 'home' | 'history' | 'vault' | 'news' | 'settings'
type Form = {
  symbol: string
  direction: 'Long' | 'Short'
  pnl: string
  fees: string
  entryTime: string
  exitTime: string
  setup: string
  notes: string
  screenshotUri: string
}

const tabs: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'home', label: 'Home', icon: House },
  { key: 'history', label: 'History', icon: HistoryIcon },
  { key: 'vault', label: 'Vault', icon: ImagePlus },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'settings', label: 'Settings', icon: SettingsIcon }
]

const EMPTY_NEWS: NewsState = {
  events: [],
  enabled: false,
  permission: 'undetermined',
  scheduledCount: 0,
  refreshedAt: '',
  warning: ''
}

const blankForm = (): Form => {
  const now = new Date()
  const pad = (v: number) => String(v).padStart(2, '0')
  return {
    symbol: '',
    direction: 'Long',
    pnl: '',
    fees: '',
    entryTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    exitTime: '',
    setup: '',
    notes: '',
    screenshotUri: ''
  }
}

function localTimestamp() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

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

function triggerHaptic(type: 'light' | 'medium' | 'success' | 'selection' = 'light') {
  try {
    if (type === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    else if (type === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    else if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    else if (type === 'selection') Haptics.selectionAsync().catch(() => {})
  } catch {}
}

const FAB_SIZE = 58
const FAB_MARGIN = 16

/**
 * The capture button has to be reachable from every screen, which means it
 * inevitably covers something on some screen. Rather than pick a corner and
 * hope, it can be dragged and it remembers where it was left. Release snaps it
 * to the nearer side so it always sits flush instead of floating mid-screen.
 */
function DraggableFab({
  onPress,
  saved,
  onMove,
  colors,
  styles
}: {
  onPress: () => void
  saved: { x: number; y: number } | null
  onMove: (position: { x: number; y: number }) => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const { width, height } = useWindowDimensions()
  const bounds = useMemo(() => ({
    minX: FAB_MARGIN,
    maxX: Math.max(FAB_MARGIN, width - FAB_SIZE - FAB_MARGIN),
    minY: 84,
    maxY: Math.max(84, height - FAB_SIZE - 104)
  }), [width, height])

  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
  const start = saved
    ? { x: clamp(saved.x, bounds.minX, bounds.maxX), y: clamp(saved.y, bounds.minY, bounds.maxY) }
    : { x: bounds.maxX, y: bounds.maxY }

  const pan = useRef(new Animated.ValueXY(start)).current
  const position = useRef(start)
  const dragging = useRef(false)

  useEffect(() => {
    const id = pan.addListener((value) => { position.current = value })
    return () => pan.removeListener(id)
  }, [pan])

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // A press only becomes a drag past a few pixels, so tapping to log a trade
    // still works without the button sliding out from under the finger.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => {
      dragging.current = false
      pan.setOffset({ ...position.current })
      pan.setValue({ x: 0, y: 0 })
    },
    onPanResponderMove: (_event, gesture) => {
      if (!dragging.current && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4)) {
        dragging.current = true
        triggerHaptic('selection')
      }
      pan.setValue({ x: gesture.dx, y: gesture.dy })
    },
    onPanResponderRelease: () => {
      pan.flattenOffset()
      if (!dragging.current) {
        onPress()
        return
      }
      const current = position.current
      const settled = {
        x: current.x + FAB_SIZE / 2 < width / 2 ? bounds.minX : bounds.maxX,
        y: clamp(current.y, bounds.minY, bounds.maxY)
      }
      triggerHaptic('light')
      Animated.spring(pan, { toValue: settled, useNativeDriver: false, friction: 7, tension: 70 }).start()
      onMove(settled)
    }
  }), [pan, bounds, width, onPress, onMove])

  return (
    <Animated.View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel="Log a trade. Drag to move this button."
      style={[styles.fab, { left: pan.x, top: pan.y }]}
    >
      <Plus color="#17130B" size={26} strokeWidth={2.8} />
    </Animated.View>
  )
}

function Stat({ label, value, numValue, tone, wide, styles }: { label: string; value: string; numValue?: number; tone?: string; wide?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.kicker}>{label}</Text>
      {numValue !== undefined && Number.isFinite(numValue) ? (
        <ScrubAnimatedNumber value={numValue} animateOnMount={true} duration={420} style={[styles.statValue, tone ? { color: tone } : null]} />
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
  const periodTrades = [...trades]
    .filter((trade) => {
      const ts = new Date(trade.tradeDate.replace(' ', 'T')).getTime()
      return !cutoff || (Number.isFinite(ts) && ts >= cutoff)
    })
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  const values = [0]
  for (const trade of periodTrades) values.push((values[values.length - 1] ?? 0) + trade.pnl)

  const periodNet = values[values.length - 1] ?? 0
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
    <View style={styles.calendarCard}>
      <View style={[styles.actionRow, styles.centeredRow]}>
        <Pressable style={styles.compactButton} onPress={prevMonth}>
          <ChevronLeft color={colors.text} size={18} strokeWidth={2} />
        </Pressable>
        <Text style={[styles.panelTitle, styles.flexOne, { textAlign: 'center' }]}>{monthName}</Text>
        <Pressable style={styles.compactButton} onPress={nextMonth}>
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
    </View>
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
          <Text style={styles.panelTitle}>Setup Pattern Analytics</Text>
        </View>
        <Target color={colors.accent} size={18} strokeWidth={2} />
      </View>

      <View style={{ gap: 10, marginTop: 8 }}>
        {topEdge ? (
          <View style={styles.edgeItem}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <Award color={colors.up} size={16} strokeWidth={2} />
              <Text style={[styles.panelTitle, styles.flexOne]}>Top Edge: {topEdge.name}</Text>
              <View style={[styles.pill, { backgroundColor: colors.upSoft }]}>
                <Text style={[styles.pillText, { color: colors.up }]}>{topEdge.winRate}% WR</Text>
              </View>
            </View>
            <Text style={styles.muted}>Expectancy {money(topEdge.expectancy)}/trade across {topEdge.count} trades.</Text>
          </View>
        ) : null}

        {leak ? (
          <View style={styles.edgeItem}>
            <View style={[styles.actionRow, styles.centeredRow]}>
              <XCircle color={colors.down} size={16} strokeWidth={2} />
              <Text style={[styles.panelTitle, styles.flexOne]}>Leak Setup: {leak.name}</Text>
              <View style={[styles.pill, { backgroundColor: colors.downSoft }]}>
                <Text style={[styles.pillText, { color: colors.down }]}>{leak.winRate}% WR</Text>
              </View>
            </View>
            <Text style={styles.muted}>Net loss {money(leak.netPnl)} — consider tightening rules for this setup.</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function Home({
  trades,
  pending,
  watchlist,
  onAddWatchlist,
  onDeleteWatchlist,
  onLog,
  onSync,
  syncing,
  paired,
  demoCount,
  onClearDemo,
  colors,
  styles
}: {
  trades: MobileTrade[]
  pending: number
  watchlist: WatchlistItem[]
  onAddWatchlist: (symbol: string, bias: 'Bullish' | 'Bearish' | 'Neutral', keyLevel: string, notes: string) => Promise<void>
  onDeleteWatchlist: (id: string) => Promise<void>
  onLog: () => void
  onSync: () => void
  syncing: boolean
  paired: boolean
  demoCount: number
  onClearDemo: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [sharing, setSharing] = useState(false)
  const today = localTimestamp().slice(0, 10)
  const todayTrades = trades.filter((trade) => trade.tradeDate.slice(0, 10) === today)
  const todayPnl = todayTrades.reduce((sum, trade) => sum + trade.pnl, 0)
  const todayWins = todayTrades.filter((trade) => trade.pnl > 0).length
  const todayWinRate = todayTrades.length ? todayWins / todayTrades.length : null
  const performance = computeMobileStats(trades)
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
      <TraderQuoteBanner colors={colors} styles={styles} />

      <View style={styles.pageIntro}>
        <View style={styles.flexOne}>
          <Text style={styles.eyebrow}>TODAY'S SESSION</Text>
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
            <Text style={styles.demoBannerCopy}>
              These {demoCount} trades are examples so you can see the app with numbers in it. They disappear as soon as you log a real trade or pair with desktop.
            </Text>
          </View>
          <Pressable style={styles.demoBannerButton} onPress={onClearDemo} accessibilityRole="button">
            <Text style={styles.demoBannerButtonText}>Clear</Text>
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
          <Text style={styles.heroLabel}>DAILY P&L</Text>
          <TrendingUp color={todayPnl < 0 ? colors.down : colors.accentBright} size={18} strokeWidth={2} />
        </View>
        <ScrubAnimatedNumber value={todayPnl} animateOnMount={true} duration={480} style={[styles.heroValue, { color: todayPnl < 0 ? colors.down : colors.text }]} />
        <Text style={styles.heroCaption}>
          {todayTrades.length
            ? `${todayTrades.length} trade${todayTrades.length === 1 ? '' : 's'} logged today`
            : 'Your session is clear. Log a trade when you are ready.'}
        </Text>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>TRADES</Text>
            <Text style={styles.heroMetricValue}>{todayTrades.length}</Text>
          </View>
          <View style={[styles.heroMetric, styles.heroMetricBorder]}>
            <Text style={styles.heroMetricLabel}>WIN RATE</Text>
            <Text style={styles.heroMetricValue}>{percent(todayWinRate)}</Text>
          </View>
          <View style={[styles.heroMetric, styles.heroMetricBorder]}>
            <Text style={styles.heroMetricLabel}>QUEUED</Text>
            <Text style={styles.heroMetricValue}>{pending}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionLabel}>ON-DEVICE PERFORMANCE</Text>
          <Text style={styles.sectionTitle}>Your trading pulse</Text>
        </View>
        <CalendarDays color={colors.faint} size={18} strokeWidth={1.8} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="NET P&L" value={money(performance.netPnl)} numValue={performance.netPnl} tone={performance.netPnl < 0 ? colors.down : colors.up} styles={styles} />
        <Stat label="WIN RATE" value={percent(performance.winRate)} styles={styles} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="EXPECTANCY" value={money(performance.expectancy)} numValue={performance.expectancy} tone={performance.expectancy < 0 ? colors.down : colors.up} styles={styles} />
        <Stat label="PAYOFF RATIO" value={performance.payoffRatio !== null ? `${performance.payoffRatio.toFixed(2)}x` : '--'} styles={styles} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="BEST WIN" value={money(performance.bestWin)} numValue={performance.bestWin} tone={colors.up} styles={styles} />
        <Stat label="WORST LOSS" value={money(performance.worstLoss)} numValue={performance.worstLoss} tone={colors.down} styles={styles} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="STREAK" value={performance.streak} tone={performance.streak.includes('Win') ? colors.up : colors.accent} styles={styles} />
      </View>
      <View style={styles.statsRow}>
        <Stat label="TOP SETUP" value={performance.topSetup} wide styles={styles} />
      </View>
      {performance.ruleRate !== null
        ? <Text style={styles.muted}>Rule discipline {percent(performance.ruleRate)} across your mobile checklists.</Text>
        : null}

      <EdgeAnalyticsCard trades={trades} colors={colors} styles={styles} />

      <PnlCurve trades={trades} colors={colors} styles={styles} />

      <Pressable style={styles.primaryButton} onPress={onLog}>
        <View style={styles.buttonContent}>
          <Plus color="#17130B" size={18} strokeWidth={2.5} />
          <Text style={styles.primaryButtonText}>Log a trade</Text>
        </View>
      </Pressable>

      <WatchlistSection watchlist={watchlist} onAdd={onAddWatchlist} onDelete={onDeleteWatchlist} colors={colors} styles={styles} />

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
        <Pressable accessibilityLabel="Refresh economic calendar" style={styles.iconButton} onPress={onRefresh} disabled={loading}>
          {loading
            ? <ActivityIndicator color={colors.text} size="small" />
            : <RefreshCw color={colors.text} size={18} strokeWidth={2} />}
        </Pressable>
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
            style={[styles.toggle, state.enabled && state.permission === 'granted' ? styles.toggleOn : null]}
          >
            <View style={[styles.toggleKnob, state.enabled && state.permission === 'granted' ? styles.toggleKnobOn : null]} />
          </Pressable>
        </View>
        {state.permission === 'denied' ? (
          <Pressable style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
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
        {state.warning ? <Text style={styles.warning}>{state.warning}</Text> : null}
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
            onPress={() => setShowAll(option.value)}
            style={[styles.segmentOption, showAll === option.value ? styles.segmentActive : null]}
          >
            <Text style={[styles.segmentText, showAll === option.value ? { color: colors.accent } : null]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {!upcoming.length ? (
        <View style={styles.emptyNews}>
          <Text style={styles.panelTitle}>No upcoming events</Text>
          <Text style={styles.muted}>{loading ? 'Refreshing the calendar...' : "No matching events remain on this week's calendar."}</Text>
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
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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

function QuickLog({
  rules,
  onSaved,
  onClose,
  colors,
  styles
}: {
  rules: string[]
  onSaved: (trade: MobileTrade) => Promise<void>
  onClose?: () => void
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [form, setForm] = useState<Form>(blankForm)
  const [step, setStep] = useState<'details' | 'checklist'>('details')
  const [checks, setChecks] = useState<Array<boolean | null>>(() => rules.map(() => null))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const notesFocused = useRef(false)

  const [pickerTarget, setPickerTarget] = useState<'entryTime' | 'exitTime' | null>(null)

  useEffect(() => setChecks(rules.map(() => null)), [rules])

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
      const timeStr = form.entryTime || form.exitTime ? `${form.entryTime || '--'} - ${form.exitTime || '--'}` : ''
      const trade: MobileTrade = {
        id: createLocalId(),
        createdAt: now,
        updatedAt: now,
        tradeDate: localTimestamp(),
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        pnl: Number(form.pnl) || 0,
        fees: Number(form.fees) || 0,
        timeframe: timeStr,
        setup: form.setup.trim(),
        notes: form.notes.trim(),
        screenshotUri: form.screenshotUri,
        ruleChecks,
        ruleSummary: `${followed}/${rules.length} post-trade rules followed`,
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
          <Pressable style={styles.actionRow} onPress={onClose}>
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
              <Pressable onPress={() => { triggerHaptic('light'); setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? true : value)) }}
                style={[styles.answerButton, checks[index] === true ? styles.answerYes : null]}>
                <Text style={[styles.answerText, checks[index] === true ? { color: colors.up } : null]}>Followed</Text>
              </Pressable>
              <Pressable onPress={() => { triggerHaptic('light'); setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? false : value)) }}
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
          <Pressable style={[styles.secondaryButton, styles.flexOne]} onPress={() => { setStep('details'); setError('') }}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, styles.flexOne]} onPress={finish} disabled={saving}>
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
        <Pressable style={styles.actionRow} onPress={onClose}>
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
            <Pressable key={direction} onPress={() => update('direction', direction)} style={styles.segmentOption}>
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
      <TextInput autoCapitalize="characters" placeholder="MES" placeholderTextColor={colors.dim} style={styles.input}
        value={form.symbol} onChangeText={(value) => update('symbol', value)} />

      <View style={styles.fieldRow}>
        <View style={styles.field}>
          <Text style={styles.label}>P&L</Text>
          <TextInput keyboardType="numbers-and-punctuation" placeholder="0.00" placeholderTextColor={colors.dim} style={styles.input}
            value={form.pnl} onChangeText={(value) => update('pnl', value)} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Fees</Text>
          <TextInput keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.dim} style={styles.input}
            value={form.fees} onChangeText={(value) => update('fees', value)} />
        </View>
      </View>

      <Text style={styles.label}>Setup</Text>
      <TextInput placeholder="VWAP Reclaim" placeholderTextColor={colors.dim} style={styles.input}
        value={form.setup} onChangeText={(value) => update('setup', value)} />

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

      <Text style={styles.label}>Fast note</Text>
      <TextInput multiline placeholder="What happened?" placeholderTextColor={colors.dim} style={[styles.input, styles.notes]}
        value={form.notes}
        onChangeText={(value) => update('notes', value)}
        onFocus={() => { notesFocused.current = true; revealFastNote() }}
        onBlur={() => { notesFocused.current = false }}
        onContentSizeChange={() => { if (notesFocused.current) revealFastNote() }}
      />

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

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primaryButton} onPress={continueToChecklist}>
        <View style={styles.buttonContent}>
          <Text style={styles.primaryButtonText}>Continue to checklist</Text>
          <ChevronRight color="#17130B" size={18} strokeWidth={2.5} />
        </View>
      </Pressable>

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
    </ScrollView>
    </KeyboardAvoidingView>
  )
}

function TradeEditor({
  trade,
  onClose,
  onSave,
  colors,
  styles
}: {
  trade: MobileTrade
  onClose: () => void
  onSave: (trade: MobileTrade) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const times = (trade.timeframe || '').split('-').map((t) => t.trim())
  const [form, setForm] = useState<Form>(() => ({
    symbol: trade.symbol,
    direction: trade.direction,
    pnl: String(trade.pnl),
    fees: String(trade.fees),
    entryTime: times[0] || trade.timeframe || '',
    exitTime: times[1] || '',
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
      const timeStr = form.entryTime || form.exitTime ? `${form.entryTime || '--'} - ${form.exitTime || '--'}` : ''
      await onSave({
        ...trade,
        updatedAt: new Date().toISOString(),
        tradeDate: tradeDate.trim(),
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        pnl,
        fees,
        timeframe: timeStr,
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
  onUpdate,
  onDelete,
  colors,
  styles
}: {
  trades: MobileTrade[]
  onUpdate: (trade: MobileTrade) => Promise<void>
  onDelete: (trade: MobileTrade) => Promise<void>
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [editing, setEditing] = useState<MobileTrade | null>(null)
  const [busyId, setBusyId] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const filteredTrades = useMemo(() => {
    if (!selectedDate) return trades
    return trades.filter((t) => t.tradeDate.slice(0, 10) === selectedDate)
  }, [trades, selectedDate])

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
              onPress={() => { triggerHaptic('light'); setViewMode('list') }}
              style={[styles.segmentOption, viewMode === 'list' ? styles.segmentActive : null]}
            >
              <List color={viewMode === 'list' ? colors.accent : colors.dim} size={16} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => { triggerHaptic('light'); setViewMode('calendar') }}
              style={[styles.segmentOption, viewMode === 'calendar' ? styles.segmentActive : null]}
            >
              <Calendar color={viewMode === 'calendar' ? colors.accent : colors.dim} size={16} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.copy}>{trades.length} trade{trades.length === 1 ? '' : 's'} available on this device.</Text>
      </View>

      {viewMode === 'calendar' ? (
        <CalendarView trades={trades} onSelectDate={(d) => setSelectedDate(d)} colors={colors} styles={styles} />
      ) : null}

      {selectedDate ? (
        <View style={[styles.actionRow, styles.centeredRow, styles.panel]}>
          <Text style={[styles.panelTitle, styles.flexOne]}>Filter: {selectedDate}</Text>
          <Pressable style={styles.compactButton} onPress={() => setSelectedDate(null)}>
            <Text style={styles.compactButtonText}>Clear Date Filter</Text>
          </Pressable>
        </View>
      ) : null}

      {filteredTrades.map((trade) => {
        const gradeInfo = computeTradeGrade(trade)
        return (
          <View key={trade.id} style={styles.tradeCard}>
            <View style={styles.tradeRow}>
              <View style={[styles.tradeOutcomeRail, { backgroundColor: trade.pnl < 0 ? colors.down : colors.up }]} />
              <View style={styles.flexOne}>
                <View style={styles.tradeTitleRow}>
                  <Text style={styles.tradeSymbol}>{trade.symbol || '-'}</Text>
                  <View style={[styles.gradeBadgeSmall, { backgroundColor: gradeInfo.color + '22' }]}>
                    <Text style={[styles.gradeTextSmall, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
                  </View>
                  <Text style={styles.tradeMeta}>{trade.direction} · {shortDate(trade.tradeDate)}</Text>
                </View>
                <Text style={styles.muted} numberOfLines={1}>
                  {[trade.setup, trade.timeframe, trade.ruleSummary].filter(Boolean).join(' · ') || 'No setup details'}
                </Text>
                {trade.reasons && trade.reasons.length ? (
                  <Text style={[styles.muted, { color: colors.accent, marginTop: 2 }]} numberOfLines={1}>
                    💡 {trade.reasons.join(', ')}
                  </Text>
                ) : null}
              </View>
              <View style={styles.tradeRight}>
                <View style={[styles.pnlPill, { backgroundColor: trade.pnl < 0 ? colors.downSoft : colors.upSoft }]}>
                  <Text style={[styles.tradePnl, { color: trade.pnl < 0 ? colors.down : colors.up }]}>{money(trade.pnl)}</Text>
                </View>
                <Text style={[styles.syncLabel, { color: trade.syncState === 'synced' ? colors.up : colors.accent }]}>
                  {trade.origin === 'desktop' && trade.syncState === 'synced' ? 'DESKTOP' : trade.syncState.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.historyActions}>
              <Pressable accessibilityLabel={`Edit ${trade.symbol} trade`} style={styles.historyAction}
                onPress={() => setEditing(trade)}>
                <View style={styles.buttonContent}>
                  <Pencil color={colors.text} size={14} strokeWidth={2} />
                  <Text style={styles.historyActionText}>Edit</Text>
                </View>
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${trade.symbol} trade`}
                style={[styles.historyAction, styles.dangerAction]} onPress={() => confirmDelete(trade)}
                disabled={busyId === trade.id}>
                {busyId === trade.id
                  ? <ActivityIndicator color={colors.down} size="small" />
                  : <View style={styles.buttonContent}>
                      <Trash2 color={colors.down} size={14} strokeWidth={2} />
                      <Text style={[styles.historyActionText, { color: colors.down }]}>Delete</Text>
                    </View>}
              </Pressable>
            </View>
          </View>
        )
      })}
      {editing ? (
        <TradeEditor
          trade={editing}
          onClose={() => setEditing(null)}
          onSave={onUpdate}
          colors={colors}
          styles={styles}
        />
      ) : null}
    </ScrollView>
  )
}

function Settings({
  mode,
  onMode,
  pairingCode,
  onPairingCode,
  onSync,
  syncing,
  syncMessage,
  rules,
  rulesUpdatedAt,
  onSaveRules,
  lastSyncedAt,
  colors,
  styles
}: {
  mode: ThemeMode
  onMode: (mode: ThemeMode) => void
  pairingCode: string
  onPairingCode: (value: string) => void
  onSync: () => void
  syncing: boolean
  syncMessage: string
  rules: string[]
  rulesUpdatedAt: string
  onSaveRules: (rules: string[]) => Promise<void>
  lastSyncedAt: string
  colors: Palette
  styles: ReturnType<typeof createStyles>
}) {
  const [scannerOpen, setScannerOpen] = useState(false)
  const [ruleDraft, setRuleDraft] = useState(rules)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesSaved, setRulesSaved] = useState(false)
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
      </View>

      <LinearGradient colors={colors.panelGradient} style={styles.panel}>
        <View style={[styles.actionRow, styles.centeredRow]}>
          <View style={styles.featureIcon}>
            <Smartphone color={colors.accent} size={20} strokeWidth={2} />
          </View>
          <Text style={[styles.panelTitle, styles.flexOne]}>Pair with TradeHelp Desktop</Text>
        </View>
        <Text style={styles.muted}>On desktop, open Settings → TradeHelp Mobile sync lab, start sync, then scan its pairing QR.</Text>
        <Pressable
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
        <Text style={styles.label}>Manual code fallback</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          placeholder="http://192.168.x.x:47831|pairing-token"
          placeholderTextColor={colors.dim}
          style={[styles.input, styles.pairingInput]}
          value={pairingCode}
          onChangeText={onPairingCode}
        />
        <Pressable style={styles.primaryButton} onPress={onSync} disabled={syncing || !pairingCode.trim()}>
          {syncing
            ? <ActivityIndicator color="#17130B" />
            : <View style={styles.buttonContent}>
                <Wifi color="#17130B" size={18} strokeWidth={2.3} />
                <Text style={styles.primaryButtonText}>Pair and sync now</Text>
              </View>}
        </Pressable>
        {lastSyncedAt ? <Text style={styles.muted}>Last synced {new Date(lastSyncedAt).toLocaleString()}</Text> : null}
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
              accessibilityLabel={`Remove rule ${index + 1}`}
              style={styles.removeRuleButton}
              onPress={() => setRuleDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Text style={styles.removeRuleText}>X</Text>
            </Pressable>
          </View>
        ))}
        {!ruleDraft.length ? <Text style={styles.muted}>No rules yet.</Text> : null}
        <Pressable style={styles.secondaryButton} onPress={commitRules} disabled={rulesSaving}>
          {rulesSaving
            ? <ActivityIndicator color={colors.accent} />
            : <View style={styles.buttonContent}>
                <Save color={rulesSaved ? colors.up : colors.text} size={17} strokeWidth={2} />
                <Text style={[styles.secondaryButtonText, rulesSaved ? { color: colors.up } : null]}>{rulesSaved ? 'Rules saved' : 'Save rules'}</Text>
              </View>}
        </Pressable>
        {rulesUpdatedAt ? <Text style={styles.muted}>Last changed {new Date(rulesUpdatedAt).toLocaleString()}</Text> : null}
      </View>

      <Pressable
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
          { label: '🟢 Winners Only', value: 'win' },
          { label: '🔴 Losers Only', value: 'loss' }
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
          <View style={styles.emptyNews}>
            <Text style={styles.panelTitle}>No matching charts in vault</Text>
            <Text style={styles.muted}>Log trades with chart screenshots to build your visual setup library.</Text>
          </View>
        ) : (
          filtered.map((trade) => {
            const isWin = trade.pnl > 0
            const tone = isWin ? colors.up : colors.down
            return (
              <Pressable
                key={trade.id}
                style={styles.vaultCard}
                onPress={() => { triggerHaptic('light'); setActiveTrade(trade) }}
              >
                {trade.screenshotUri ? (
                  <Image source={{ uri: trade.screenshotUri }} style={styles.vaultImage} />
                ) : (
                  <LinearGradient
                    colors={isWin ? [colors.upSoft, colors.surface2] : [colors.downSoft, colors.surface2]}
                    style={styles.vaultPlaceholder}
                  >
                    <View style={styles.actionRow}>
                      <View style={[styles.candle, { height: 18, backgroundColor: tone }]} />
                      <View style={[styles.candle, { height: 26, backgroundColor: tone }]} />
                      <View style={[styles.candle, { height: 14, backgroundColor: tone }]} />
                    </View>
                    <Text style={styles.vaultPlaceholderText}>{trade.symbol} · {trade.setup || 'Chart Record'}</Text>
                  </LinearGradient>
                )}
                
                <View style={styles.vaultOverlayHeader}>
                  <View style={[styles.pill, { backgroundColor: isWin ? colors.upSoft : colors.downSoft }]}>
                    <Text style={[styles.pillText, { color: tone }]}>{trade.direction.toUpperCase()} · {money(trade.pnl)}</Text>
                  </View>
                </View>

                <View style={styles.vaultFooter}>
                  <Text style={styles.vaultTitle}>{trade.symbol}</Text>
                  <Text style={styles.muted}>{trade.setup || 'General'} · {shortDate(trade.tradeDate)}</Text>
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
                    onPress={async () => {
                      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
                      if (!result.canceled && result.assets[0]?.uri) {
                        const updated = { ...activeTrade, screenshotUri: result.assets[0].uri }
                        await onUpdate(updated)
                        setActiveTrade(updated)
                      }
                    }}
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

function MobileApp() {
  const db = useSQLiteContext()
  const systemScheme = useColorScheme()
  const [tab, setTab] = useState<Tab>('home')
  const [trades, setTrades] = useState<MobileTrade[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [rules, setRules] = useState<string[]>([])
  const [rulesUpdatedAt, setRulesUpdatedAt] = useState('')
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [pairingCode, setPairingCode] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [pendingChangeCount, setPendingChangeCount] = useState(0)
  const [news, setNews] = useState<NewsState>(EMPTY_NEWS)
  const [newsLoading, setNewsLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [demoCount, setDemoCount] = useState(0)
  const [fabPosition, setFabPosition] = useState<{ x: number; y: number } | null>(null)
  const syncInFlight = useRef(false)
  const autoSync = useRef<() => void>(() => {})
  const colors = palette(themeMode, systemScheme)
  const styles = useMemo(() => createStyles(colors), [colors])

  const refresh = useCallback(async () => {
    const [nextTrades, nextWatch, nextRuleState, nextChanges, nextDemoCount] = await Promise.all([
      listTrades(db),
      listWatchlist(db),
      getRuleState(db),
      pendingTradeChanges(db),
      countDemoTrades(db)
    ])
    setTrades(nextTrades)
    setWatchlist(nextWatch)
    setRules(nextRuleState.rules)
    setRulesUpdatedAt(nextRuleState.updatedAt)
    setPendingChangeCount(nextChanges.length)
    setDemoCount(nextDemoCount)
  }, [db])

  useEffect(() => {
    Promise.all([
      refresh(),
      getSetting(db, 'themeMode', 'system'),
      getSetting(db, 'pairingCode'),
      getSetting(db, 'lastSyncedAt'),
      getSetting(db, 'fabPosition')
    ]).then(([, storedTheme, storedCode, storedSync, storedFab]) => {
      setThemeMode(['system', 'dark', 'light'].includes(storedTheme) ? storedTheme as ThemeMode : 'system')
      setPairingCode(storedCode)
      setLastSyncedAt(storedSync)
      try {
        const parsed = storedFab ? JSON.parse(storedFab) : null
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setFabPosition(parsed)
      } catch {
        // A corrupt value just means the button starts in its default corner.
      }
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

  const [isLogging, setIsLogging] = useState(false)

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

  const saveFabPosition = useCallback((next: { x: number; y: number }) => {
    setFabPosition(next)
    void setSetting(db, 'fabPosition', JSON.stringify(next))
  }, [db])

  async function saveNextTrade(trade: MobileTrade) {
    await clearDemoTrades(db)
    await saveTrade(db, trade)
    await refresh()
    setIsLogging(false)
    setTab('history')
    autoSync.current()
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

  async function saveRuleChanges(nextRules: string[]) {
    const state = await saveRules(db, nextRules)
    setRules(state.rules)
    setRulesUpdatedAt(state.updatedAt)
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
  const fadeAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  const changeTab = useCallback((nextTab: Tab) => {
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

  if (!ready) {
    return <View style={[styles.app, styles.loading]}><ActivityIndicator color={colors.accent} /></View>
  }

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.header} />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.bgTop, colors.bg, colors.bgBottom]}
        locations={[0, 0.45, 1]}
        style={styles.backdrop}
      />
      <View style={styles.auroraOrbTop} pointerEvents="none" />
      <View style={styles.auroraOrbBottom} pointerEvents="none" />
      <View style={styles.header}>
        <LinearGradient colors={[colors.accentSoft, colors.surface2]} style={styles.logo}>
          <View style={[styles.candle, { height: 12, backgroundColor: colors.down }]} />
          <View style={[styles.candle, { height: 19, backgroundColor: colors.accent }]} />
          <View style={[styles.candle, { height: 15, backgroundColor: colors.up }]} />
        </LinearGradient>
        <Text style={styles.brand}>Trade<Text style={{ color: colors.accent }}>Help</Text></Text>
        <View style={styles.offline}>
          <View style={[styles.statusDot, { backgroundColor: syncing ? colors.accent : colors.up }]} />
          <Text style={styles.offlineText}>{syncing ? 'SYNCING' : 'LOCAL'}</Text>
        </View>
      </View>

      <Animated.View style={[styles.screen, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {tab === 'home' && <Home trades={trades} pending={pending} watchlist={watchlist} onAddWatchlist={addWatchlist} onDeleteWatchlist={removeWatchlist} onLog={() => setIsLogging(true)} onSync={syncNow} syncing={syncing} paired={Boolean(pairingCode)} demoCount={demoCount} onClearDemo={dropDemoTrades} colors={colors} styles={styles} />}
        {tab === 'history' && <History trades={trades} onUpdate={saveTradeChanges} onDelete={removeTrade} colors={colors} styles={styles} />}
        {tab === 'vault' && <Vault trades={trades} onUpdate={saveTradeChanges} colors={colors} styles={styles} />}
        {tab === 'news' && <News state={news} loading={newsLoading} onRefresh={() => refreshMobileNews(false)} onToggle={toggleNewsAlerts} onTest={scheduleNewsTestNotification} colors={colors} styles={styles} />}
        {tab === 'settings' && <Settings mode={themeMode} onMode={chooseTheme} pairingCode={pairingCode} onPairingCode={setPairingCode} onSync={syncNow} syncing={syncing} syncMessage={syncMessage} rules={rules} rulesUpdatedAt={rulesUpdatedAt} onSaveRules={saveRuleChanges} lastSyncedAt={lastSyncedAt} colors={colors} styles={styles} />}
      </Animated.View>

      <Modal visible={isLogging} animationType="slide" onRequestClose={() => setIsLogging(false)}>
        <SafeAreaView style={styles.app}>
          <StatusBar barStyle={colors.statusBar} backgroundColor={colors.header} />
          <LinearGradient
            pointerEvents="none"
            colors={[colors.bgTop, colors.bg, colors.bgBottom]}
            locations={[0, 0.45, 1]}
            style={styles.backdrop}
          />
          <View style={styles.auroraOrbTop} pointerEvents="none" />
          <View style={styles.auroraOrbBottom} pointerEvents="none" />
          <QuickLog
            key={rules.join('|')}
            rules={rules}
            onSaved={saveNextTrade}
            onClose={() => setIsLogging(false)}
            colors={colors}
            styles={styles}
          />
        </SafeAreaView>
      </Modal>

      {/* Logging a trade is the whole point of the phone app, so it can't live
          buried below the fold on one screen — it needs to be one tap from
          anywhere. */}
      <DraggableFab
        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsLogging(true) }}
        saved={fabPosition}
        onMove={saveFabPosition}
        colors={colors}
        styles={styles}
      />

      <LinearGradient colors={[colors.nav, colors.header]} style={styles.tabBar}>
        {tabs.map((item) => {
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
        })}
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
    auroraOrbTop: {
      position: 'absolute', top: -60, right: -40, width: 240, height: 240, borderRadius: 120,
      backgroundColor: colors.accent, opacity: 0.08, filter: 'blur(40px)' as any
    },
    auroraOrbBottom: {
      position: 'absolute', bottom: 100, left: -60, width: 280, height: 280, borderRadius: 140,
      backgroundColor: colors.up, opacity: 0.06, filter: 'blur(50px)' as any
    },
    loading: { alignItems: 'center', justifyContent: 'center' },
    screen: { flex: 1 },
    flexOne: { flex: 1 },
    header: {
      height: 64, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
      flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.header
    },
    logo: {
      width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5,
      shadowColor: colors.accent, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }
    },
    candle: { width: 3.5, borderRadius: 2 },
    brand: { color: colors.text, fontSize: 20, fontWeight: '800', flex: 1, letterSpacing: -0.3 },
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
      paddingHorizontal: 18, paddingTop: 18, paddingBottom: 40, gap: 16,
      width: '100%', maxWidth: 640, alignSelf: 'center'
    },
    keyboardContent: { paddingBottom: 140 },
    pageIntro: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
    pageTitleStack: { gap: 4, marginBottom: 2 },
    demoBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent,
      borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14
    },
    demoBannerTitle: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: 3 },
    demoBannerCopy: { color: colors.dim, fontSize: 12, lineHeight: 17 },
    demoBannerButton: {
      minHeight: 36, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.accent
    },
    demoBannerButtonText: { color: '#17130B', fontSize: 13, fontWeight: '800' },
    // Placed with left/top because the position is animated and persisted;
    // pairing those with right/bottom would fight over the same axis.
    fab: {
      position: 'absolute', width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2,
      backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', zIndex: 20,
      shadowColor: colors.accent, shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
      elevation: 8
    },
    eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
    title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.4 },
    copy: { color: colors.dim, fontSize: 14, lineHeight: 21 },
    sessionBadge: {
      minHeight: 28, borderRadius: 14, paddingHorizontal: 10,
      flexDirection: 'row', alignItems: 'center', gap: 6
    },
    sessionBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
    heroCard: {
      minHeight: 240, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 20,
      padding: 22, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.28, shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 }, elevation: 6
    },
    heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroLabel: { color: colors.dim, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
    heroValue: { fontSize: 42, lineHeight: 50, fontWeight: '800', marginTop: 14, letterSpacing: -0.5 },
    heroCaption: { color: colors.dim, fontSize: 13, lineHeight: 19, marginTop: 3 },
    heroMetrics: {
      minHeight: 64, flexDirection: 'row', alignItems: 'stretch', marginTop: 22,
      borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16
    },
    heroMetric: { flex: 1, justifyContent: 'center' },
    heroMetricBorder: { borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 16 },
    heroMetricLabel: { color: colors.faint, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
    heroMetricValue: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 5 },
    sectionHeadingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8
    },
    sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.2 },
    statsRow: { flexDirection: 'row', gap: 12 },
    stat: {
      flex: 1, minWidth: 0, minHeight: 92, padding: 16, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.line, borderRadius: 16,
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }
    },
    kicker: { color: colors.dim, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    sectionLabel: { color: colors.dim, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
    statValue: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
    statValueWide: { fontSize: 19, lineHeight: 24 },
    panel: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18,
      padding: 18, gap: 14, marginTop: 4,
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }
    },
    chartPanel: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderRadius: 18, padding: 16, paddingHorizontal: 12, gap: 10, marginTop: 4, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }
    },
    chartValue: { fontSize: 28, lineHeight: 34, fontWeight: '800', marginTop: 4 },
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
    syncCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16,
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
    pairingInput: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top', fontSize: 12 },
    fieldRow: { flexDirection: 'row', gap: 12 },
    field: { flex: 1, gap: 8 },
    notes: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
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
    compactButton: {
      minWidth: 40, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12
    },
    iconButton: {
      width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong,
      backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center'
    },
    compactButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
    buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionRow: { flexDirection: 'row', gap: 10 },
    centeredRow: { alignItems: 'center' },
    toggle: {
      width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center',
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line
    },
    toggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.dim },
    toggleKnobOn: { alignSelf: 'flex-end', backgroundColor: colors.accent },
    error: { color: colors.down, fontSize: 13, lineHeight: 19 },
    segment: {
      minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 14,
      padding: 4, flexDirection: 'row', backgroundColor: colors.surface
    },
    segmentOption: { flex: 1, minWidth: 0, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    segmentActive: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
    segmentText: { color: colors.dim, fontSize: 13, fontWeight: '700' },
    ruleCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 12 },
    answerRow: { flexDirection: 'row', gap: 10 },
    answerButton: {
      flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
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
      borderRadius: 16, overflow: 'hidden',
      shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    tradeRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15 },
    tradeOutcomeRail: { width: 4, height: 48, borderRadius: 2 },
    tradeTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 5 },
    tradeSymbol: { color: colors.text, fontSize: 17, fontWeight: '800' },
    tradeMeta: { color: colors.dim, fontSize: 12 },
    tradeRight: { alignItems: 'flex-end', gap: 6 },
    tradePnl: { fontSize: 16, fontWeight: '800' },
    pnlPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
    syncLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
    historyActions: {
      minHeight: 44, flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line
    },
    historyAction: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    dangerAction: { borderLeftWidth: 1, borderLeftColor: colors.line },
    historyActionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    emptyNews: {
      minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8,
      borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 22
    },
    eventCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
      borderLeftWidth: 4, borderRadius: 16, padding: 16, gap: 10,
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
      width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.line,
      backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center'
    },
    removeRuleText: { color: colors.down, fontSize: 12, fontWeight: '800' },
    scannerScreen: { flex: 1, backgroundColor: colors.bg },
    modalScreen: { flex: 1, backgroundColor: colors.bg },
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
      minHeight: 74, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
      backgroundColor: colors.nav, flexDirection: 'row', paddingBottom: 6,
      shadowColor: colors.shadow, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: -5 }
    },
    tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' },
    tabActiveLine: {
      position: 'absolute', top: 0, width: 32, height: 3, borderRadius: 1.5,
      backgroundColor: colors.accent
    },
    tabGlyph: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    tabGlyphActive: { backgroundColor: colors.accentSoft },
    tabGlyphText: { color: colors.dim, fontSize: 13, fontWeight: '800' },
    tabLabel: { color: colors.dim, fontSize: 11, fontWeight: '700' },
    tabActiveText: { color: colors.accent },
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
      backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8
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
    vaultGrid: { gap: 14, marginTop: 10 },
    vaultCard: {
      backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line,
      overflow: 'hidden', position: 'relative',
      shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    vaultImage: { width: '100%', height: 185, backgroundColor: colors.surface2 },
    vaultPlaceholder: { width: '100%', height: 140, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16 },
    vaultPlaceholderText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    vaultOverlayHeader: { position: 'absolute', top: 12, left: 12 },
    vaultFooter: { padding: 14, borderTopWidth: 1, borderTopColor: colors.line, gap: 2 },
    vaultTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
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

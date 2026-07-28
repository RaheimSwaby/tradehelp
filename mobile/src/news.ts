import * as Notifications from 'expo-notifications'
import type { SQLiteDatabase } from 'expo-sqlite'
import { Platform } from 'react-native'
import { getSetting, setSetting } from './storage/repository'

export type EconomicEvent = {
  id: string
  title: string
  country: string
  impact: string
  ts: number
  forecast: string
  previous: string
}

export type NewsState = {
  events: EconomicEvent[]
  enabled: boolean
  permission: 'granted' | 'denied' | 'undetermined'
  scheduledCount: number
  refreshedAt: string
  warning: string
}

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const ALERT_LEADS = [30, 15, 5]
const MAX_SCHEDULED_ALERTS = 60
const CACHE_KEY = 'economicCalendar'
const REFRESH_KEY = 'economicCalendarRefreshedAt'
const ALERTS_KEY = 'newsAlertsEnabled'
const SCHEDULED_KEY = 'newsNotificationIds'
let newsOperation: Promise<NewsState> | null = null

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
})

function text(value: unknown, max = 180) {
  return String(value ?? '').trim().slice(0, max)
}

function eventId(event: Omit<EconomicEvent, 'id'>) {
  return `${event.ts}:${event.country}:${event.title}`.slice(0, 300)
}

export function normalizeEconomicEvents(payload: unknown, now = Date.now()): EconomicEvent[] {
  if (!Array.isArray(payload)) return []
  const latest = now + 8 * 24 * 60 * 60 * 1000
  const events = payload.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const title = text(record.title)
    const country = text(record.country, 20)
    const impact = text(record.impact, 30)
    const ts = Date.parse(String(record.date || ''))
    if (!title || !Number.isFinite(ts) || ts < now - 60 * 60 * 1000 || ts > latest) return []
    const event = {
      title,
      country,
      impact,
      ts,
      forecast: text(record.forecast, 80),
      previous: text(record.previous, 80)
    }
    return [{ ...event, id: eventId(event) }]
  })
  return events.sort((a, b) => a.ts - b.ts).slice(0, 80)
}

function parseCachedEvents(value: string): EconomicEvent[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const event = item as Partial<EconomicEvent>
      const ts = Number(event.ts)
      const title = text(event.title)
      if (!title || !Number.isFinite(ts) || ts < Date.now() - 60 * 60 * 1000) return []
      const normalized = {
        title,
        country: text(event.country, 20),
        impact: text(event.impact, 30),
        ts,
        forecast: text(event.forecast, 80),
        previous: text(event.previous, 80)
      }
      return [{ ...normalized, id: text(event.id, 300) || eventId(normalized) }]
    }).sort((a, b) => a.ts - b.ts)
  } catch {
    return []
  }
}

export async function fetchEconomicEvents() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(CALENDAR_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Calendar returned ${response.status}`)
    return normalizeEconomicEvents(await response.json())
  } finally {
    clearTimeout(timer)
  }
}

function permissionLabel(status: Notifications.NotificationPermissionsStatus): NewsState['permission'] {
  if (status.granted) return 'granted'
  return status.status === 'denied' ? 'denied' : 'undetermined'
}

async function cancelScheduledNews(db: SQLiteDatabase) {
  let identifiers: string[] = []
  try {
    const parsed = JSON.parse(await getSetting(db, SCHEDULED_KEY, '[]'))
    if (Array.isArray(parsed)) identifiers = parsed.map(String)
  } catch {}
  await Promise.all(identifiers.map((identifier) =>
    Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {})
  ))
  await setSetting(db, SCHEDULED_KEY, '[]')
}

async function scheduleNews(db: SQLiteDatabase, events: EconomicEvent[]) {
  await cancelScheduledNews(db)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('tradehelp-reminders', {
      name: 'TradeHelp reminders',
      importance: Notifications.AndroidImportance.DEFAULT
    })
  }

  const now = Date.now()
  const plans = events
    .filter((event) => event.impact.toLowerCase() === 'high')
    .flatMap((event) => ALERT_LEADS.map((lead) => ({
      event,
      lead,
      triggerAt: event.ts - lead * 60 * 1000
    })))
    .filter((plan) => plan.triggerAt > now + 5_000)
    .sort((a, b) => a.triggerAt - b.triggerAt)
    .slice(0, MAX_SCHEDULED_ALERTS)

  const identifiers: string[] = []
  try {
    for (const plan of plans) {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: `High-impact news in ${plan.lead} min`,
          body: `${plan.event.country} ${plan.event.title}`.trim(),
          sound: plan.lead === 5 ? 'default' : undefined,
          data: { type: 'economic-news', eventId: plan.event.id, eventTs: plan.event.ts }
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(plan.triggerAt),
          channelId: Platform.OS === 'android' ? 'tradehelp-reminders' : undefined
        }
      })
      identifiers.push(identifier)
    }
  } finally {
    await setSetting(db, SCHEDULED_KEY, JSON.stringify(identifiers))
  }
  return identifiers.length
}

export async function loadCachedNews(db: SQLiteDatabase): Promise<NewsState> {
  const [cached, enabled, refreshedAt, scheduled, permission] = await Promise.all([
    getSetting(db, CACHE_KEY, '[]'),
    getSetting(db, ALERTS_KEY, 'false'),
    getSetting(db, REFRESH_KEY),
    getSetting(db, SCHEDULED_KEY, '[]'),
    Notifications.getPermissionsAsync()
  ])
  let scheduledCount = 0
  try {
    const parsed = JSON.parse(scheduled)
    scheduledCount = Array.isArray(parsed) ? parsed.length : 0
  } catch {}
  return {
    events: parseCachedEvents(cached),
    enabled: enabled === 'true',
    permission: permissionLabel(permission),
    scheduledCount,
    refreshedAt,
    warning: ''
  }
}

async function refreshNewsNow(
  db: SQLiteDatabase,
  options: { requestPermission?: boolean } = {}
): Promise<NewsState> {
  const cached = await loadCachedNews(db)
  let events = cached.events
  let refreshedAt = cached.refreshedAt
  let warning = ''
  try {
    events = await fetchEconomicEvents()
    refreshedAt = new Date().toISOString()
    await Promise.all([
      setSetting(db, CACHE_KEY, JSON.stringify(events)),
      setSetting(db, REFRESH_KEY, refreshedAt)
    ])
  } catch (error) {
    warning = events.length
      ? 'Using the saved calendar until the next refresh.'
      : String(error instanceof Error ? error.message : error)
  }

  let permission = await Notifications.getPermissionsAsync()
  if (cached.enabled && options.requestPermission && !permission.granted && permission.status !== 'denied') {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false }
    })
  }

  let scheduledCount = cached.scheduledCount
  if (cached.enabled && permission.granted) scheduledCount = await scheduleNews(db, events)
  else if (!cached.enabled || permission.status === 'denied') {
    await cancelScheduledNews(db)
    scheduledCount = 0
  }

  return {
    events,
    enabled: cached.enabled,
    permission: permissionLabel(permission),
    scheduledCount,
    refreshedAt,
    warning
  }
}

function queueNewsOperation(operation: () => Promise<NewsState>) {
  const next = (newsOperation || Promise.resolve(EMPTY_OPERATION_STATE))
    .catch(() => EMPTY_OPERATION_STATE)
    .then(operation)
  newsOperation = next
  return next.finally(() => {
    if (newsOperation === next) newsOperation = null
  })
}

const EMPTY_OPERATION_STATE: NewsState = {
  events: [],
  enabled: false,
  permission: 'undetermined',
  scheduledCount: 0,
  refreshedAt: '',
  warning: ''
}

export function refreshNews(
  db: SQLiteDatabase,
  options: { requestPermission?: boolean } = {}
) {
  return queueNewsOperation(() => refreshNewsNow(db, options))
}

export function setNewsAlertsEnabled(db: SQLiteDatabase, enabled: boolean) {
  return queueNewsOperation(async () => {
    await setSetting(db, ALERTS_KEY, String(enabled))
    return refreshNewsNow(db, { requestPermission: enabled })
  })
}

export async function scheduleNewsTestNotification() {
  const permission = await Notifications.getPermissionsAsync()
  if (!permission.granted) throw new Error('Enable news notifications first.')
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TradeHelp news alerts are ready',
      body: 'High-impact reminders will arrive 30, 15 and 5 minutes before the event.',
      sound: 'default',
      data: { type: 'economic-news-test' }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: Platform.OS === 'android' ? 'tradehelp-reminders' : undefined
    }
  })
}

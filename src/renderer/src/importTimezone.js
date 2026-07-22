const LOCAL_ALIASES = new Set(['', 'local', 'local time'])

export const LOCAL_TIMEZONE = 'local'
export const COMMON_IMPORT_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney'
]

const formatterCache = new Map()

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidImportTimeZone(value) {
  const zone = String(value || '').trim()
  if (LOCAL_ALIASES.has(zone.toLowerCase())) return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format()
    return true
  } catch {
    return false
  }
}

export function normalizeImportTimeZone(value) {
  const zone = String(value || '').trim()
  if (LOCAL_ALIASES.has(zone.toLowerCase()) || !isValidImportTimeZone(zone)) return LOCAL_TIMEZONE
  return zone
}

export function importTimeZoneOptions() {
  let supported = []
  try { supported = Intl.supportedValuesOf?.('timeZone') || [] } catch { supported = [] }
  return [...new Set([LOCAL_TIMEZONE, localTimeZone(), ...COMMON_IMPORT_TIMEZONES, ...supported].filter(Boolean))]
}

function formatterFor(zone) {
  let formatter = formatterCache.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatterCache.set(zone, formatter)
  }
  return formatter
}

function zonedParts(date, zone) {
  const values = {}
  for (const part of formatterFor(zone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }
  return values
}

function parseWallTime(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const parts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0)
  }
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
  if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() !== parts.month - 1 ||
      check.getUTCDate() !== parts.day || check.getUTCHours() !== parts.hour ||
      check.getUTCMinutes() !== parts.minute || check.getUTCSeconds() !== parts.second) return null
  return parts
}

function wallTimeToInstant(parts, zone) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  let candidate = desired
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = zonedParts(new Date(candidate), zone)
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const correction = desired - represented
    if (correction === 0) return new Date(candidate)
    candidate += correction
  }
  return null
}

const pad2 = (value) => String(value).padStart(2, '0')

/**
 * Interprets a parsed broker timestamp as wall time in sourceTimeZone and returns
 * the same instant expressed as wall time in targetTimeZone. Invalid zones,
 * malformed timestamps, and nonexistent DST wall times are returned unchanged.
 */
export function normalizeImportWallTime(value, sourceTimeZone = LOCAL_TIMEZONE, targetTimeZone = localTimeZone()) {
  const original = String(value || '')
  if (!original) return ''
  const source = normalizeImportTimeZone(sourceTimeZone)
  if (source === LOCAL_TIMEZONE) return original
  const target = normalizeImportTimeZone(targetTimeZone)
  if (target === LOCAL_TIMEZONE || source === target) return original
  const parts = parseWallTime(original)
  if (!parts) return original
  try {
    const instant = wallTimeToInstant(parts, source)
    if (!instant) return original
    const local = zonedParts(instant, target)
    return `${local.year}-${pad2(local.month)}-${pad2(local.day)} ${pad2(local.hour)}:${pad2(local.minute)}`
  } catch {
    return original
  }
}

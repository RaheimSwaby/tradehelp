/**
 * Trade timestamps are wall-clock local time with no zone suffix — the hour a
 * trader saw on their own screen, which is the only reading that makes sense
 * for "which session was this".
 *
 * The desktop and the phone historically wrote that same value two different
 * ways: 'YYYY-MM-DD HH:mm' and 'YYYY-MM-DDTHH:mm:ss'. Storing both side by side
 * is not cosmetic — the app sorts trades with localeCompare, and ' ' (0x20)
 * sorts before 'T' (0x54), so a desktop trade always ordered ahead of a phone
 * trade on the same day regardless of the actual time. That silently reorders
 * the equity curve and the win/loss streak.
 *
 * Everything is normalised to CANONICAL on the way into the database.
 * CANONICAL: YYYY-MM-DDTHH:mm:ss, local, no suffix.
 */

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
// A trailing 'Z' or ±hh:mm makes the value an absolute instant, not a wall
// clock. This has to be tested first: WALL_CLOCK is a prefix match, so without
// it '2026-07-28T01:30:00.000Z' would match as-is and keep 01:30 as if it were
// local — silently reintroducing the off-by-one-day this module exists to fix.
const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/i

export function toLocalStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function localNow() {
  return toLocalStamp(new Date())
}

export function normalizeTradeDate(value: unknown, fallback: string = localNow()) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  // Already wall-clock (either separator): keep the digits, just pad seconds.
  // Deliberately not routed through Date — re-parsing a local wall clock only
  // creates opportunities to shift it.
  if (!ZONED.test(raw)) {
    const parts = raw.match(WALL_CLOCK)
    if (parts) return `${parts[1]}T${parts[2]}:${parts[3]}:${parts[4] ?? '00'}`
  }

  // An absolute instant ('…Z' or '+05:30') is a different thing entirely and
  // has to be converted to local before its date half means anything, or a
  // trade logged in the evening lands on tomorrow's date.
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback : toLocalStamp(parsed)
}

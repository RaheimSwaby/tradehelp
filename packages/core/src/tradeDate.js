// Trading-day keys. A trade's day is its local wall-clock date, read from the first
// field that holds a real date, so a bare clock time like '09:42' is skipped.

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function dateValueKey(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : localDateKey(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1e12 ? value * 1000 : value
    const date = new Date(milliseconds)
    return Number.isNaN(date.getTime()) ? '' : localDateKey(date)
  }

  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{10,13}$/.test(text)) return dateValueKey(Number(text))

  const leadingDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:\D|$)/)?.[1]
  if (leadingDate && !validDateKey(leadingDate)) return ''
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const zonedDate = new Date(text.replace(' ', 'T'))
    return Number.isNaN(zonedDate.getTime()) ? '' : localDateKey(zonedDate)
  }
  if (leadingDate) return leadingDate

  const date = new Date(text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date)
}

/** Return the first valid trading date, preferring entry time over fallback timestamps. */
export function tradeDateKey(trade = {}) {
  for (const field of ['entryTime', 'timestamp', 'tradeDate', 'date', 'executedAt', 'openedAt', 'exitTime']) {
    const key = dateValueKey(trade?.[field])
    if (key) return key
  }
  return ''
}

// Economic calendar for the "high-impact news is at X — wait, or get set before it breaks" alert.
// Keyless by default (ForexFactory weekly JSON via faireconomy); an FMP key swaps in their calendar.

function normFF(arr) {
  return (arr || []).map((e) => ({
    title: String(e.title || ''),
    country: String(e.country || ''), // currency code, e.g. USD
    impact: String(e.impact || ''),
    ts: Date.parse(e.date), // ForexFactory date includes a tz offset
    // `actual` is empty until the print lands, then fills in — that is what turns a
    // scheduled event into a beat or a miss.
    actual: e.actual || '', forecast: e.forecast || '', previous: e.previous || ''
  }))
}

function normFMP(arr) {
  return (arr || []).map((e) => ({
    title: String(e.event || ''),
    country: String(e.currency || e.country || ''),
    impact: String(e.impact || ''),
    ts: Date.parse(String(e.date).replace(' ', 'T') + 'Z'), // FMP date is UTC, no offset
    actual: e.actual ?? '', forecast: e.estimate ?? '', previous: e.previous ?? ''
  }))
}

/**
 * Fetches a historical date range so past trades can be matched against the news that
 * was out at the time. Only FMP exposes a range — the keyless weekly feed cannot look
 * backwards, which is why archiving happens on every ordinary fetch as well.
 */
export async function fetchEventRange(settings = {}, from, to) {
  if (!settings.fmpKey) throw new Error('Backfilling past events needs a Financial Modeling Prep API key — add one in Settings.')
  const res = await fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${settings.fmpKey}`)
  if (!res.ok) throw new Error(`The economic calendar returned ${res.status}.`)
  const events = normFMP(await res.json())
  return events.filter((e) => e.title && Number.isFinite(e.ts)).sort((a, b) => a.ts - b.ts)
}

export async function fetchEvents(settings = {}) {
  let events = []
  if (settings.fmpKey) {
    const from = new Date().toISOString().slice(0, 10)
    const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    const res = await fetch(`https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${settings.fmpKey}`)
    if (res.ok) events = normFMP(await res.json())
  } else {
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json')
    if (res.ok) events = normFF(await res.json())
  }
  // Keep the recent past hour (so a just-released print still shows) through the next week, soonest first.
  const now = Date.now()
  return events
    .filter((e) => e.title && Number.isFinite(e.ts) && e.ts >= now - 60 * 60000)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, 40)
}

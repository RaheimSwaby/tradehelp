// Economic calendar for the "high-impact news is at X — wait, or get set before it breaks" alert.
// Keyless by default (ForexFactory weekly JSON via faireconomy); an FMP key swaps in their calendar.

function normFF(arr) {
  return (arr || []).map((e) => ({
    title: String(e.title || ''),
    country: String(e.country || ''), // currency code, e.g. USD
    impact: String(e.impact || ''),
    ts: Date.parse(e.date), // ForexFactory date includes a tz offset
    forecast: e.forecast || '', previous: e.previous || ''
  }))
}

function normFMP(arr) {
  return (arr || []).map((e) => ({
    title: String(e.event || ''),
    country: String(e.currency || e.country || ''),
    impact: String(e.impact || ''),
    ts: Date.parse(String(e.date).replace(' ', 'T') + 'Z'), // FMP date is UTC, no offset
    forecast: e.estimate ?? '', previous: e.previous ?? ''
  }))
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

import { FOREX_BIAS_INSTRUMENTS } from '../../renderer/src/directionalBias.js'

export const OANDA_PRACTICE_ID = 'oanda-practice'
export const OANDA_PRACTICE_DATASET = 'OANDA v20 Practice'
export { FOREX_BIAS_INSTRUMENTS }

const BASE_URL = 'https://api-fxpractice.oanda.com'
const MAX_DAYS = 10
const CHUNK_MS = 3 * 864e5

function normalizedRoot(value) {
  const root = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (!FOREX_BIAS_INSTRUMENTS.includes(root)) throw new Error('Choose a supported forex pair')
  return root
}

function oandaInstrument(root) {
  return `${root.slice(0, 3)}_${root.slice(3)}`
}

function displayInstrument(root) {
  return `${root.slice(0, 3)}/${root.slice(3)}`
}

async function readableError(response) {
  if (response.status === 401) return 'OANDA rejected that practice token'
  if (response.status === 403) return 'That OANDA token cannot access the practice API'
  if (response.status === 429) return 'OANDA rate-limited the request; try again shortly'
  const body = await response.text().catch(() => '')
  if (body && body.length < 220) {
    try { return JSON.parse(body)?.errorMessage || body } catch { return body }
  }
  return `OANDA request failed (${response.status})`
}

export function parseOandaCandles(payload = {}) {
  const rows = []
  for (const candle of Array.isArray(payload?.candles) ? payload.candles : []) {
    if (candle?.complete === false || !candle?.mid) continue
    const timeMs = Date.parse(String(candle.time || ''))
    const values = ['o', 'h', 'l', 'c'].map((key) => Number(candle.mid[key]))
    if (Number.isNaN(timeMs) || values.some((value) => !Number.isFinite(value))) continue
    rows.push({
      time: Math.floor(timeMs / 1000),
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      // OANDA defines this as the number of prices created during the candle.
      // It is useful as a participation proxy, but it is not centralized FX volume.
      volume: Number.isFinite(Number(candle.volume)) ? Number(candle.volume) : null
    })
  }
  return rows.sort((a, b) => a.time - b.time)
}

export function createOandaPracticeProvider({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  async function request(path, token) {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(await readableError(response))
    return response
  }

  return {
    id: OANDA_PRACTICE_ID,
    label: 'OANDA Practice',
    dataset: OANDA_PRACTICE_DATASET,
    mode: 'customer-api-free',
    market: 'forex',
    noCharge: true,
    capabilities: ['bars'],
    instruments: [...FOREX_BIAS_INSTRUMENTS],

    async test(token) {
      if (String(token || '').trim().length < 20) throw new Error('Enter a valid OANDA practice token')
      const response = await request('/v3/accounts', String(token).trim())
      const data = await response.json()
      if (!Array.isArray(data?.accounts)) throw new Error('OANDA did not return an account list for that token')
      return { ok: true, dataset: OANDA_PRACTICE_DATASET, accountCount: data.accounts.length }
    },

    async estimate(_token, { instrument, days = 5 } = {}) {
      const root = normalizedRoot(instrument)
      return { instrument: root, days: Math.max(1, Math.min(MAX_DAYS, Number(days) || 5)), cost: 0, noCharge: true }
    },

    async getQuote(token, { instrument } = {}) {
      const root = normalizedRoot(instrument)
      const params = new URLSearchParams({
        price: 'M',
        granularity: 'D',
        count: '1',
        dailyAlignment: '17',
        alignmentTimezone: 'America/New_York'
      })
      const response = await request(`/v3/instruments/${oandaInstrument(root)}/candles?${params.toString()}`, String(token).trim())
      const data = await response.json()
      const candle = Array.isArray(data?.candles) ? data.candles.findLast((item) => item?.mid) : null
      const open = Number(candle?.mid?.o)
      const price = Number(candle?.mid?.c)
      if (!candle || !Number.isFinite(open) || !Number.isFinite(price) || open <= 0 || price <= 0) {
        throw new Error(`OANDA returned no current quote for ${root}`)
      }
      return {
        symbol: displayInstrument(root),
        price,
        changePct: ((price - open) / open) * 100,
        source: 'OANDA Practice',
        asOf: candle.time || ''
      }
    },

    async getHistory(token, { instrument, days = 5 } = {}) {
      const root = normalizedRoot(instrument)
      const requestedDays = Math.max(1, Math.min(MAX_DAYS, Number(days) || 5))
      const end = Number(now())
      const start = end - requestedDays * 864e5
      const byTime = new Map()

      for (let from = start; from < end; from += CHUNK_MS) {
        const to = Math.min(end, from + CHUNK_MS)
        const params = new URLSearchParams({
          price: 'M',
          granularity: 'M1',
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          smooth: 'false'
        })
        const response = await request(`/v3/instruments/${oandaInstrument(root)}/candles?${params.toString()}`, String(token).trim())
        for (const bar of parseOandaCandles(await response.json())) byTime.set(bar.time, bar)
      }

      const bars = [...byTime.values()].sort((a, b) => a.time - b.time)
      if (!bars.length) throw new Error(`OANDA returned no one-minute candles for ${root}`)
      return { instrument: root, symbol: root, bars }
    }
  }
}

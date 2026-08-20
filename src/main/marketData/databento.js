import { CME_BIAS_INSTRUMENTS } from '../../renderer/src/directionalBias.js'

export const DATABENTO_ID = 'databento'
export const DATABENTO_DATASET = 'GLBX.MDP3'
export { CME_BIAS_INSTRUMENTS }

const BASE_URL = 'https://hist.databento.com/v0'

function authorization(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

function normalizedRoot(value) {
  const root = String(value || '').trim().toUpperCase()
  if (!CME_BIAS_INSTRUMENTS.includes(root)) throw new Error('Choose a supported CME instrument')
  return root
}

function queryWindow(days, now) {
  const end = new Date(Number(now)).toISOString()
  const start = new Date(Number(now) - Math.max(1, Math.min(10, Number(days) || 5)) * 864e5).toISOString()
  return { start, end }
}

async function readableError(response) {
  if (response.status === 401) return 'Databento rejected that API key'
  if (response.status === 402 || response.status === 403) return 'This Databento account does not have access to CME Globex minute bars'
  if (response.status === 429) return 'Databento rate-limited the request; try again shortly'
  const body = await response.text().catch(() => '')
  return body && body.length < 220 ? body : `Databento request failed (${response.status})`
}

function paramsFor(root, days, now) {
  const window = queryWindow(days, now)
  return new URLSearchParams({
    dataset: DATABENTO_DATASET,
    symbols: `${root}.v.0`,
    schema: 'ohlcv-1m',
    stype_in: 'continuous',
    start: window.start,
    end: window.end
  })
}

function parseJsonLines(text) {
  const rows = []
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { continue }
    const rawTime = record.ts_event ?? record.hd?.ts_event
    const numericTime = Number(rawTime)
    const timeMs = Number.isFinite(numericTime) && numericTime > 100_000_000
      ? numericTime > 10_000_000_000_000
        ? Math.floor(numericTime / 1_000_000)
        : numericTime > 10_000_000_000
          ? Math.floor(numericTime)
          : Math.floor(numericTime * 1000)
      : Date.parse(String(rawTime || ''))
    const values = ['open', 'high', 'low', 'close'].map((key) => Number(record[key]))
    if (Number.isNaN(timeMs) || values.some((value) => !Number.isFinite(value))) continue
    rows.push({
      time: Math.floor(timeMs / 1000),
      open: values[0], high: values[1], low: values[2], close: values[3],
      volume: Number.isFinite(Number(record.volume)) ? Number(record.volume) : null
    })
  }
  return rows.sort((a, b) => a.time - b.time)
}

export function createDatabentoProvider({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  async function request(path, apiKey, options = {}) {
    const response = await fetchImpl(`${BASE_URL}/${path}`, {
      ...options,
      headers: { Authorization: authorization(apiKey), Accept: options.accept || 'application/json', ...(options.headers || {}) }
    })
    if (!response.ok) throw new Error(await readableError(response))
    return response
  }

  return {
    id: DATABENTO_ID,
    label: 'Databento Historical',
    dataset: DATABENTO_DATASET,
    mode: 'customer-api',
    capabilities: ['bars'],
    instruments: [...CME_BIAS_INSTRUMENTS],

    async test(apiKey) {
      if (!/^db-[A-Za-z0-9_-]{20,}$/.test(String(apiKey || '').trim())) throw new Error('Databento API keys start with db-')
      const response = await request(`metadata.get_dataset_range?dataset=${encodeURIComponent(DATABENTO_DATASET)}`, apiKey)
      const range = await response.json()
      return { ok: true, dataset: DATABENTO_DATASET, availableThrough: range?.schema?.['ohlcv-1m']?.end || range?.end || '' }
    },

    async estimate(apiKey, { instrument, days = 5 } = {}) {
      const root = normalizedRoot(instrument)
      const params = paramsFor(root, days, now())
      const response = await request(`metadata.get_cost?${params.toString()}`, apiKey)
      const cost = Number(await response.text())
      if (!Number.isFinite(cost) || cost < 0) throw new Error('Databento did not return a usable cost estimate')
      return { instrument: root, days: Math.max(1, Math.min(10, Number(days) || 5)), cost }
    },

    async getHistory(apiKey, { instrument, days = 5 } = {}) {
      const root = normalizedRoot(instrument)
      const params = paramsFor(root, days, now())
      params.set('encoding', 'json')
      params.set('pretty_px', 'true')
      params.set('pretty_ts', 'true')
      params.set('map_symbols', 'true')
      params.set('limit', '20000')
      const response = await request('timeseries.get_range', apiKey, {
        method: 'POST',
        accept: 'application/jsonl',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      const bars = parseJsonLines(await response.text())
      if (!bars.length) throw new Error(`Databento returned no one-minute bars for ${root}`)
      return { instrument: root, symbol: `${root}.v.0`, bars }
    }
  }
}

export { parseJsonLines as parseDatabentoJsonLines }

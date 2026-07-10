// Gumroad checkout link for the $50 one-time product.
export const CHECKOUT_URL = 'https://tradehelp.gumroad.com/l/oyftvr'
// Until a real checkout link is set, the trial/paywall stays dormant so nobody hits a dead paywall.
export const GATE_CONFIGURED = !CHECKOUT_URL.includes('YOUR-NAME')

// true if version a is newer than b (semver-ish "x.y.z")
export function isNewerVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) }
  return false
}

export const EMOTIONS = ['Disciplined', 'Confident', 'Neutral', 'Hesitant', 'Anxious', 'FOMO', 'Greedy', 'Revenge', 'Bored']
export const SELF_GRADES = ['A+', 'A', 'B', 'C', 'D', 'F']
export const SETUPS = ['Opening Range Breakout', 'VWAP Reclaim', 'Pullback', 'Trend Continuation', 'Reversal', 'Liquidity Sweep']
export const TILT = ['FOMO', 'Greedy', 'Revenge']

// Self-diagnosed cause of a win/loss. Each maps to the rating attribute it should move
// (good = nudge up, bad = nudge down). attr:null = honest-but-neutral (lucky win / good loss) — moves nothing.
export const WIN_REASONS = ['Patient — waited for setup', 'Followed my plan', 'Clean setup / good read', 'Proper risk & sizing', 'Let my winner run', 'Got lucky (no real edge)']
export const LOSS_REASONS = ['Just variance — good trade', 'Impatient — forced it', 'FOMO / chased', 'Greed — overstayed/oversized', 'Revenge trade', 'Moved / ignored my stop', 'Oversized', 'Bad setup']
export const REASONS = {
  'Patient — waited for setup': { attr: 'patience', good: true },
  'Followed my plan': { attr: 'discipline', good: true },
  'Clean setup / good read': { attr: 'edge', good: true },
  'Proper risk & sizing': { attr: 'risk', good: true },
  'Let my winner run': { attr: 'discipline', good: true },
  'Got lucky (no real edge)': { attr: null, good: false },
  'Just variance — good trade': { attr: null, good: true },
  'Impatient — forced it': { attr: 'patience', good: false },
  'FOMO / chased': { attr: 'discipline', good: false },
  'Greed — overstayed/oversized': { attr: 'discipline', good: false },
  'Revenge trade': { attr: 'discipline', good: false },
  'Moved / ignored my stop': { attr: 'risk', good: false },
  'Oversized': { attr: 'risk', good: false },
  'Bad setup': { attr: 'edge', good: false }
}

export const fmt$ = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtN = (n, d = 2) => Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
export const parseRules = (s) => {
  try { const r = JSON.parse(s?.tradeRules || '[]'); return Array.isArray(r) ? r.filter(Boolean) : [] }
  catch { return [] }
}

// Streams an AI reply: calls onChunk(delta) as tokens arrive, resolves with the full text.
// Pass a React ref as cancelRef to get a cancel() function stored on ref.current — call it
// on component unmount to remove the IPC listeners if the stream is still in flight.
// Falls back to the non-streaming call (firing onChunk once) if streaming isn't available.
export function streamChat(payload, onChunk, cancelRef) {
  return new Promise((resolve, reject) => {
    const api = typeof window !== 'undefined' && window.api
    if (api?.aiChatStream) {
      const cancel = api.aiChatStream(payload, {
        onChunk: (d) => { try { onChunk?.(d) } catch {} },
        onDone: (text) => { if (cancelRef) cancelRef.current = null; resolve(text || '') },
        onError: (err) => { if (cancelRef) cancelRef.current = null; reject(new Error(err || 'AI unavailable')) }
      })
      if (cancelRef) cancelRef.current = cancel
    } else if (api?.aiChat) {
      api.aiChat(payload).then((r) => { if (r?.ok) { onChunk?.(r.text); resolve(r.text) } else reject(new Error(r?.error || 'AI unavailable')) }).catch(reject)
    } else reject(new Error('AI unavailable'))
  })
}

// ── image helpers: downscale on the client so the DB + IPC stay light ──
export const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
export const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
export async function downscale(dataUrl, maxDim = 1600, quality = 0.82) {
  try {
    const img = await loadImg(dataUrl)
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/webp', quality)
  } catch { return dataUrl }
}
// Vision models (esp. local ones) are happiest with JPEG, so re-encode before sending.
export async function toJpeg(dataUrl) {
  try {
    const img = await loadImg(dataUrl)
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/jpeg', 0.85)
  } catch { return dataUrl }
}

// ── time-in-trade helpers ──
export const pad2 = (n) => String(n).padStart(2, '0')
export const nowLocalInput = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
export const parseLocal = (s) => { if (!s) return null; const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? null : d }
export const holdMs = (t) => { const a = parseLocal(t.entryTime), b = parseLocal(t.exitTime); return a && b ? b - a : null }
export function fmtDuration(ms) {
  if (!(ms > 0)) return null
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24), rh = h % 24
  return rh ? `${d}d ${rh}h` : `${d}d`
}

// ── review period helpers ──
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function periodKey(dateStr, gran) {
  if (!dateStr) return ''
  if (gran === 'year') return dateStr.slice(0, 4)
  if (gran === 'month') return dateStr.slice(0, 7)
  if (gran === 'quarter') { const m = +dateStr.slice(5, 7); return `${dateStr.slice(0, 4)}-Q${Math.ceil(m / 3)}` }
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return ''
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // back up to Monday
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
// Monday-of-this-week key, and the Monday one week after a given week-key (for streaks/breaks).
export const thisWeekKey = () => periodKey(new Date().toISOString().slice(0, 10), 'week')
export const nextWeekKey = (wk) => { const d = new Date(wk + 'T00:00:00'); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
export function periodLabel(key, gran) {
  if (!key) return '—'
  if (gran === 'year') return key === String(new Date().getFullYear()) ? `${key} (YTD)` : key
  if (gran === 'month') { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y}` }
  if (gran === 'quarter') { const [y, q] = key.split('-Q'); return `Q${q} ${y}` }
  const mon = new Date(key + 'T00:00:00'); const sun = new Date(mon); sun.setDate(sun.getDate() + 6)
  const md = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return `${md(mon)} – ${md(sun)}, ${sun.getFullYear()}`
}

// ── CSV import helpers ──
export function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQ = false
  text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}
export function csvNum(v) {
  let s = String(v ?? '').trim().replace(/[$,\s]/g, '')
  if (!s) return 0
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  const n = parseFloat(s)
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0
}
// Parse a broker CSV date/datetime into "YYYY-MM-DD HH:MM". Handles ISO, US (M/D/Y),
// European day-first (D/M/Y — detected when the first number is > 12), dotted/dashed/
// slashed separators, AM/PM, and epoch timestamps. Returns '' if it can't parse.
export function csvDate(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  const out = (d) => (isNaN(d) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
  // Epoch milliseconds / seconds
  if (/^\d{13}$/.test(s)) return out(new Date(+s))
  if (/^\d{10}$/.test(s)) return out(new Date(+s * 1000))
  // Numeric date a·b·c (any of / . -), optional time + AM/PM
  const m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?)?/i)
  if (m) {
    const a = +m[1], b = +m[2], c = +m[3]
    let year, mon, day
    if (m[1].length === 4) { year = a; mon = b; day = c }          // YYYY-MM-DD
    else {
      year = c < 100 ? 2000 + c : c
      if (a > 12) { day = a; mon = b }                              // D/M/Y (unambiguous)
      else if (b > 12) { mon = a; day = b }                        // M/D/Y (unambiguous)
      else { mon = a; day = b }                                    // ambiguous → assume US M/D/Y
    }
    let hh = m[4] ? +m[4] : 0
    const mm = m[5] ? +m[5] : 0, ap = (m[6] || '').toLowerCase()
    if (ap === 'pm' && hh < 12) hh += 12
    if (ap === 'am' && hh === 12) hh = 0
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return out(new Date(year, mon - 1, day, hh, mm))
  }
  // Fallback to the engine (handles "Jan 15 2024 9:30 AM", RFC, full ISO with timezone)
  return out(new Date(s))
}
export const normDir = (v) => (/^\s*(s|sell|short|sld|sold)/i.test(String(v || '')) ? 'Short' : 'Long')
const FUTURES_POINT_VALUE = {
  ES: 50, MES: 5,
  NQ: 20, MNQ: 2,
  YM: 5, MYM: 0.5,
  RTY: 50, M2K: 5,
  CL: 1000, MCL: 100,
  GC: 100, MGC: 10
}
const tradeKeyForImport = (t) => (t.entryTime ? `${t.symbol}|${t.entryTime}|${(Number(t.pnl) || 0).toFixed(2)}` : null)
const rowGetter = (headers, row) => (name) => {
  const i = headers.findIndex((h) => h.trim().toLowerCase() === String(name).trim().toLowerCase())
  return i >= 0 ? row[i] : ''
}

function ninjaOrdersToTrades(rows, headers, existingKeys = new Set()) {
  const filled = rows.map((row, i) => ({ row, i, get: rowGetter(headers, row) }))
    .filter(({ get }) => String(get('Status')).trim().toLowerCase() === 'filled' && csvNum(get('filledQty') || get('Filled Qty')) > 0)
    .map((x) => {
      const symbol = String(x.get('Product') || x.get('Contract') || '').trim().toUpperCase()
      const time = csvDate(x.get('Fill Time') || x.get('Timestamp') || x.get('Date'))
      return {
        ...x,
        symbol,
        account: String(x.get('Account') || '').trim(),
        side: String(x.get('B/S') || '').trim().toLowerCase().startsWith('s') ? 'Sell' : 'Buy',
        qty: csvNum(x.get('filledQty') || x.get('Filled Qty')),
        price: csvNum(x.get('avgPrice') || x.get('Avg Fill Price') || x.get('decimalFillAvg')),
        time,
        text: String(x.get('Text') || '').trim(),
        type: String(x.get('Type') || '').trim()
      }
    })
    .filter((f) => f.symbol && f.time && f.price && f.qty)
    .sort((a, b) => a.time.localeCompare(b.time) || a.i - b.i)

  const books = new Map()
  const trades = []
  const openDir = (side) => (side === 'Buy' ? 'Long' : 'Short')

  for (const f of filled) {
    const key = `${f.account}|${f.symbol}`
    const book = books.get(key) || []
    let qty = f.qty
    const dir = openDir(f.side)

    while (qty > 0 && book.length && book[0].dir !== dir) {
      const lot = book[0]
      const closeQty = Math.min(qty, lot.qty)
      const multiplier = FUTURES_POINT_VALUE[f.symbol] || FUTURES_POINT_VALUE[String(f.get('Contract') || '').match(/^[A-Z]+/)?.[0]] || 1
      const pnl = lot.dir === 'Long'
        ? (f.price - lot.price) * closeQty * multiplier
        : (lot.price - f.price) * closeQty * multiplier
      const t = {
        id: Date.now().toString(36) + Math.random().toString(16).slice(2),
        symbol: f.symbol,
        direction: lot.dir,
        entry: lot.price,
        exit: f.price,
        stop: 0,
        target: 0,
        size: closeQty,
        riskAmount: 0,
        pnl,
        fees: 0,
        rr: 0,
        emotion: '',
        setup: '',
        notes: `Imported from NinjaTrader Orders export. Entry: ${lot.text || lot.type || 'fill'}; Exit: ${f.text || f.type || 'fill'}.`,
        reason: '',
        entryTime: lot.time,
        exitTime: f.time,
        timestamp: lot.time,
        source: 'import'
      }
      t.dupe = existingKeys.has(tradeKeyForImport(t))
      trades.push(t)
      lot.qty -= closeQty
      qty -= closeQty
      if (lot.qty <= 0.000001) book.shift()
    }

    if (qty > 0) {
      // If the export starts after a position was opened, an isolated "Exit" row
      // cannot be reconstructed into a real trade, so leave it out.
      if (!book.length && /^exit$/i.test(f.text)) continue
      book.push({ dir, qty, price: f.price, time: f.time, text: f.text, type: f.type })
    }

    books.set(key, book)
  }
  return trades
}
// [field, label, header-guess regex, required]
export const IMPORT_FIELDS = [
  ['symbol', 'Symbol', /symbol|ticker|instrument|contract|product/i, true],
  ['direction', 'Direction', /side|action|direction|b\/s|buy|sell|long|short|type/i, false],
  ['size', 'Size / qty', /qty|quantity|size|shares|contracts|volume|lots|filled/i, false],
  ['entry', 'Entry price', /entry.*price|open.*price|avg.*entry|buy.*price|price.*open|^entry$|fill.*price/i, false],
  ['exit', 'Exit price', /exit.*price|close.*price|sell.*price|price.*close|^exit$/i, false],
  ['pnl', 'P&L (gross)', /pnl|p&l|p\/l|profit|realized|net|gain/i, false],
  ['fees', 'Fees', /fee/i, false],
  ['commission', 'Commission', /comm/i, false],
  ['entryTime', 'Entry time', /entry.*time|open.*time|time.*open|date.*open|entry.*date|opened|trade.*date|trade.*time|fill.*time|exec.*time|order.*time|transaction.*date|date.?time|datetime|^date$|^time$|timestamp/i, false],
  ['exitTime', 'Exit time', /exit.*time|close.*time|time.*close|date.*close|exit.*date|closed|sell.*time|liquidat/i, false]
]

// ── Named broker presets for the CSV importer ──
// sig: lowercased headers that identify the export; map: field → exact header name;
// post(t, get): fixes broker quirks the column map can't express — runs per row after
// the generic build, with get(header) returning that column's raw cell.
export const BROKER_PRESETS = [
  {
    key: 'ninjatrader-orders', label: 'NinjaTrader Orders',
    sig: ['order id', 'b/s', 'contract', 'product', 'avgprice', 'filledqty', 'fill time', 'status'],
    map: { symbol: 'Product', direction: 'B/S', size: 'filledQty', entry: 'avgPrice', entryTime: 'Fill Time' },
    buildRows: ninjaOrdersToTrades
  },
  {
    key: 'ninjatrader', label: 'NinjaTrader 8',
    sig: ['instrument', 'market pos.', 'entry price', 'exit price'],
    map: { symbol: 'Instrument', direction: 'Market pos.', size: 'Qty', entry: 'Entry price', exit: 'Exit price', pnl: 'Profit', commission: 'Commission', entryTime: 'Entry time', exitTime: 'Exit time' },
    post: (t) => { t.symbol = t.symbol.split(' ')[0] } // "MNQ MAR24" → "MNQ"
  },
  {
    key: 'tradovate', label: 'Tradovate',
    sig: ['buyprice', 'sellprice', 'boughttimestamp', 'soldtimestamp'],
    map: { symbol: 'symbol', size: 'qty', pnl: 'pnl' },
    // Performance exports have no side column — direction falls out of which fill came first.
    post: (t, get) => {
      const bt = csvDate(get('boughtTimestamp')), st = csvDate(get('soldTimestamp'))
      const long = bt && st ? bt <= st : true
      t.direction = long ? 'Long' : 'Short'
      t.entry = long ? csvNum(get('buyPrice')) : csvNum(get('sellPrice'))
      t.exit = long ? csvNum(get('sellPrice')) : csvNum(get('buyPrice'))
      t.entryTime = long ? bt : st
      t.exitTime = long ? st : bt
      if (t.entryTime || t.exitTime) t.timestamp = t.entryTime || t.exitTime
    }
  },
  {
    key: 'topstepx', label: 'TopstepX',
    sig: ['contractname', 'enteredat', 'exitedat'],
    map: { symbol: 'ContractName', direction: 'Type', size: 'Size', entry: 'EntryPrice', exit: 'ExitPrice', pnl: 'PnL', fees: 'Fees', entryTime: 'EnteredAt', exitTime: 'ExitedAt' },
    post: (t) => { t.symbol = t.symbol.replace(/^\//, '').replace(/^F\.US\./i, '') }
  }
]
export const detectBrokerPreset = (headers) => {
  const lower = headers.map((h) => String(h).trim().toLowerCase())
  return BROKER_PRESETS.find((p) => p.sig.every((s) => lower.includes(s))) || null
}
// Resolve a preset's field→header map against the file's actual headers (case-insensitive).
export function applyPresetMap(preset, headers) {
  const find = (name) => headers.find((h) => h.trim().toLowerCase() === name.toLowerCase()) || ''
  const m = {}
  for (const [field, header] of Object.entries(preset.map)) m[field] = find(header)
  return m
}

// ── economic-calendar helpers ──
export const IMPACT_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0, None: 0 }
export const ALERT_LEADS = [30, 15, 5] // minutes before a high-impact event to fire a notification
export const untilLabel = (ts, now) => {
  const m = Math.round((ts - now) / 60000)
  if (m <= 0) return 'now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}

export const PROP_PRESETS = {
  '25K': { accountSize: 25000, target: 1500, maxDailyLoss: 500, maxDrawdown: 1500 },
  '50K': { accountSize: 50000, target: 3000, maxDailyLoss: 1100, maxDrawdown: 2000 },
  '100K': { accountSize: 100000, target: 6000, maxDailyLoss: 2200, maxDrawdown: 3000 },
  '150K': { accountSize: 150000, target: 9000, maxDailyLoss: 3300, maxDrawdown: 5000 }
}

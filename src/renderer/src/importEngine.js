import {
  IMPORT_FIELDS, BROKER_PRESETS, applyPresetMap, csvDate, csvNum,
  detectBrokerPreset, normDir, parseCSV
} from './utils.js'

export const importTradeKey = (trade) => (trade?.entryTime
  ? `${String(trade.symbol || '').toUpperCase()}|${trade.entryTime}|${(Number(trade.pnl) || 0).toFixed(2)}`
  : null)

export function guessImportMap(headers, rows) {
  const guessed = {}
  for (const [field, , re] of IMPORT_FIELDS) guessed[field] = headers.find((header) => re.test(header)) || ''
  if (guessed.commission && guessed.commission === guessed.fees) guessed.commission = ''
  if (!guessed.entryTime) {
    const used = new Set(Object.values(guessed).filter(Boolean))
    const sample = rows.slice(0, 7)
    for (let index = 0; index < headers.length; index++) {
      if (used.has(headers[index])) continue
      const values = sample.map((row) => String(row[index] || '').trim()).filter(Boolean)
      const dateCount = values.filter((value) => /\d[/\.\-:]\d/.test(value) && csvDate(value)).length
      if (values.length >= 2 && dateCount >= Math.ceil(values.length * 0.6)) {
        guessed.entryTime = headers[index]
        break
      }
    }
  }
  return guessed
}

const generatedId = () => `${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`

export function buildImportRows({ headers, rows, map, preset, existing = [], account = '' }) {
  const existingKeys = new Set(existing.map(importTradeKey).filter(Boolean))
  if (preset?.buildRows) {
    return preset.buildRows(rows, headers, existingKeys).map((trade, index) => ({
      ...trade,
      account: account || trade.account || '',
      sourceRow: index + 2
    }))
  }
  const indexOf = (field) => (map[field] ? headers.indexOf(map[field]) : -1)
  const cell = (row, field) => { const index = indexOf(field); return index >= 0 ? row[index] : '' }
  return rows.map((row, rowIndex) => {
    const symbol = String(cell(row, 'symbol') || '').trim()
    if (!symbol) return null
    const direction = normDir(cell(row, 'direction'))
    const entry = csvNum(cell(row, 'entry'))
    const exit = csvNum(cell(row, 'exit'))
    const size = csvNum(cell(row, 'size'))
    const fees = (map.fees ? Math.abs(csvNum(cell(row, 'fees'))) : 0) +
      (map.commission ? Math.abs(csvNum(cell(row, 'commission'))) : 0)
    const grossPnl = map.pnl ? csvNum(cell(row, 'pnl')) :
      (entry && exit && size ? (exit - entry) * size * (direction === 'Long' ? 1 : -1) : 0)
    const entryTime = csvDate(cell(row, 'entryTime'))
    const exitTime = csvDate(cell(row, 'exitTime'))
    const trade = {
      id: generatedId(), symbol: symbol.toUpperCase(), direction, entry, exit, stop: 0, target: 0,
      size, riskAmount: 0, pnl: grossPnl - fees, fees, rr: 0, emotion: '', setup: '', notes: '', reason: '',
      entryTime, exitTime, timestamp: entryTime || exitTime || new Date().toISOString().slice(0, 16).replace('T', ' '),
      source: 'import', account, sourceRow: rowIndex + 2
    }
    if (preset?.post) {
      const get = (name) => {
        const index = headers.findIndex((header) => header.trim().toLowerCase() === String(name).trim().toLowerCase())
        return index >= 0 ? row[index] : ''
      }
      preset.post(trade, get)
      trade.symbol = String(trade.symbol || '').toUpperCase()
    }
    trade.dupe = existingKeys.has(importTradeKey(trade))
    return trade
  }).filter(Boolean)
}

export function prepareCsvImport(text, { existing = [], brokerKey = '', map: providedMap, account = '' } = {}) {
  const all = parseCSV(text)
  if (all.length < 2) throw new Error('That file has a header but no data rows.')
  const headers = all[0].map((header) => String(header).trim())
  const rows = all.slice(1)
  const detected = detectBrokerPreset(headers)
  const requested = BROKER_PRESETS.find((item) => item.key === brokerKey) || null
  const preset = requested || detected
  const map = providedMap || (preset ? applyPresetMap(preset, headers) : guessImportMap(headers, rows))
  const built = buildImportRows({ headers, rows, map, preset, existing, account })
  const duplicates = built.filter((trade) => trade.dupe).length
  const missingSymbols = Math.max(0, rows.length - built.length)
  const missingDates = built.filter((trade) => !trade.entryTime && !trade.exitTime).length
  const warnings = []
  if (!preset) warnings.push('Broker format was not recognized; column mapping was auto-guessed.')
  if (missingSymbols) warnings.push(`${missingSymbols} row${missingSymbols === 1 ? '' : 's'} had no symbol and will be skipped.`)
  if (missingDates) warnings.push(`${missingDates} trade${missingDates === 1 ? '' : 's'} had no usable trade date.`)
  return {
    headers, rows, map, preset, detected, built, warnings,
    rowCount: rows.length, duplicateCount: duplicates,
    skippedCount: missingSymbols, warningCount: warnings.length
  }
}

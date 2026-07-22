import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, extname, join, resolve, sep } from 'path'
import { prepareCsvImport } from '../renderer/src/importEngine.js'

const MAX_CSV_BYTES = 20 * 1024 * 1024
const POLL_MS = 5000

function insideFolder(filePath, folderPath) {
  const file = resolve(filePath)
  const folder = resolve(folderPath)
  return file.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`)
}

export function createImportWatcher(db, onChange = () => {}) {
  let timer = null
  let scanning = false

  async function autoImport(item, source) {
    if (!source.trusted) return false
    try {
      const text = readInboxFile(db, item.id).text
      const prepared = prepareCsvImport(text, {
        existing: db.listTrades(), brokerKey: source.brokerKey, account: source.account,
        timezone: source.timezone
      })
      if (!prepared.detected || (source.brokerKey && prepared.detected.key !== source.brokerKey)) return false
      const rows = prepared.built.filter((trade) => !trade.dupe).map(({ dupe, ...trade }) => trade)
      db.importTradeBatch(rows, {
        sourceId: source.id, fileName: item.fileName, brokerKey: prepared.preset?.key || '',
        brokerLabel: prepared.preset?.label || '', account: source.account, timezone: source.timezone,
        rowCount: prepared.rowCount, duplicateCount: prepared.duplicateCount,
        skippedCount: prepared.skippedCount, warningCount: prepared.warningCount, warnings: prepared.warnings
      })
      db.setImportInboxState(item.id, 'imported')
      onChange({ type: 'auto-imported', item, importedCount: rows.length })
      return true
    } catch (error) {
      db.setImportInboxState(item.id, 'error', String(error?.message || error))
      onChange({ type: 'error', item, error: String(error?.message || error) })
      return 'error'
    }
  }

  async function scanSource(source, includeExisting = false) {
    if (!source?.enabled || !source.folderPath || !existsSync(source.folderPath)) return { detected: 0, imported: 0 }
    const scanStartedAt = new Date().toISOString()
    const cutoff = includeExisting ? 0 : (Date.parse(source.lastScanAt || '') || Date.now())
    let detected = 0
    let imported = 0
    const candidates = readdirSync(source.folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.csv')
      .map((entry) => {
        const filePath = join(source.folderPath, entry.name)
        try { return { filePath, fileName: entry.name, stat: statSync(filePath) } } catch { return null }
      })
      .filter((entry) => entry && entry.stat.size <= MAX_CSV_BYTES && (includeExisting || entry.stat.mtimeMs > cutoff))
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs)
      .slice(-50)

    for (const candidate of candidates) {
      const fingerprint = `${source.id}|${resolve(candidate.filePath).toLowerCase()}|${candidate.stat.size}|${Math.trunc(candidate.stat.mtimeMs)}`
      const recorded = db.recordImportInbox({
        sourceId: source.id, filePath: candidate.filePath, fileName: candidate.fileName,
        fingerprint, size: candidate.stat.size, modifiedAt: candidate.stat.mtime.toISOString()
      })
      if (!recorded.created) continue
      detected++
      const autoResult = await autoImport(recorded.item, source)
      if (autoResult === true) imported++
      else if (autoResult !== 'error') onChange({ type: 'detected', item: recorded.item, source })
    }
    db.updateImportSourceScan(source.id, scanStartedAt)
    return { detected, imported }
  }

  async function scanAll() {
    if (scanning) return
    scanning = true
    try {
      for (const source of db.listImportSources()) await scanSource(source, false)
    } finally { scanning = false }
  }

  function start() {
    if (timer) return
    timer = setInterval(scanAll, POLL_MS)
    timer.unref?.()
    setTimeout(scanAll, 1000)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
  }

  return { start, stop, scanSource }
}

export function readInboxFile(db, id) {
  const item = db.getImportInbox(id)
  if (!item || !item.folderPath) throw new Error('Import inbox item not found')
  if (item.state !== 'pending' && item.state !== 'error') throw new Error('That import is no longer pending')
  if (!insideFolder(item.filePath, item.folderPath) || extname(item.filePath).toLowerCase() !== '.csv') throw new Error('Import file is outside the watched folder')
  if (!existsSync(item.filePath)) throw new Error('The CSV file is no longer in that folder')
  const stat = statSync(item.filePath)
  if (stat.size > MAX_CSV_BYTES) throw new Error('CSV files must be under 20 MB')
  return {
    text: readFileSync(item.filePath, 'utf8'), fileName: basename(item.filePath), inboxId: item.id,
    sourceId: item.sourceId, sourceName: item.sourceName || '', brokerKey: item.brokerKey || '',
    account: item.account || '', timezone: item.timezone || ''
  }
}

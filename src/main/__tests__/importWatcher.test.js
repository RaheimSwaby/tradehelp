import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createImportWatcher } from '../importWatcher.js'

const originalTimeZone = process.env.TZ
let folderPath

beforeEach(() => {
  process.env.TZ = 'UTC'
  folderPath = mkdtempSync(join(tmpdir(), 'tradehelp-import-watcher-'))
})

afterEach(() => {
  rmSync(folderPath, { recursive: true, force: true })
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('createImportWatcher', () => {
  it('normalizes a trusted source timezone before duplicate detection', async () => {
    const filePath = join(folderPath, 'topstepx.csv')
    writeFileSync(filePath, `Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type
1,MES,2026-07-21 09:30,2026-07-21 09:40,6700,6702,2,10,1,Long
2,MNQ,2026-07-21 10:30,2026-07-21 10:40,20000,20010,2,20,1,Long`)

    const source = {
      id: 'source-1', enabled: true, trusted: true, folderPath,
      brokerKey: 'topstepx', account: 'Evaluation', timezone: 'America/New_York'
    }
    const inbox = new Map()
    const importTradeBatch = vi.fn()
    const db = {
      listTrades: vi.fn(() => [
        { symbol: 'MES', entryTime: '2026-07-21 13:30', pnl: 8 }
      ]),
      recordImportInbox: vi.fn((entry) => {
        const item = { ...entry, id: 'inbox-1', state: 'pending' }
        inbox.set(item.id, item)
        return { created: true, item }
      }),
      getImportInbox: vi.fn((id) => {
        const item = inbox.get(id)
        return item ? { ...source, ...item, folderPath } : null
      }),
      importTradeBatch,
      setImportInboxState: vi.fn((id, state, error = '') => {
        Object.assign(inbox.get(id), { state, error })
      }),
      updateImportSourceScan: vi.fn()
    }

    const result = await createImportWatcher(db).scanSource(source, true)

    expect(result).toEqual({ detected: 1, imported: 1 })
    expect(importTradeBatch).toHaveBeenCalledOnce()
    const [rows, metadata] = importTradeBatch.mock.calls[0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      symbol: 'MNQ', account: 'Evaluation',
      entryTime: '2026-07-21 14:30',
      exitTime: '2026-07-21 14:40',
      timestamp: '2026-07-21 14:30'
    })
    expect(metadata).toMatchObject({
      sourceId: source.id, timezone: source.timezone,
      rowCount: 2, duplicateCount: 1
    })
    expect(db.setImportInboxState).toHaveBeenCalledWith('inbox-1', 'imported')
  })
})

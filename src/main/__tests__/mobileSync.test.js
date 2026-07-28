import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMobileSyncServer } from '../mobileSync.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
})

function fakeDb() {
  return {
    getMobileSyncToken: vi.fn(() => 'secret-token'),
    rotateMobileSyncToken: vi.fn(() => 'rotated-token'),
    getTradeRuleState: vi.fn(() => ({
      rules: ['Wait for setup', 'Respect risk'],
      updatedAt: '2026-07-26T12:00:00.000Z'
    })),
    mergeMobileTradeRules: vi.fn(() => ({
      rules: ['Wait for setup', 'Respect risk'],
      updatedAt: '2026-07-26T12:00:00.000Z',
      changed: false
    })),
    applyMobileTradeChanges: vi.fn(() => ({
      importedCount: 1,
      updatedCount: 0,
      deletedCount: 0,
      duplicateCount: 0,
      accepted: [{ mobileId: 'mobile-1', desktopId: 'desktop-1', operation: 'create' }]
    })),
    mobileTradeSnapshot: vi.fn(() => [{ id: 'desktop-1', symbol: 'MES', pnl: 50 }])
  }
}

describe('mobile sync server', () => {
  it('rejects sync without the pairing token', async () => {
    const server = createMobileSyncServer(fakeDb(), { host: '127.0.0.1', port: 0 })
    servers.push(server)
    const state = await server.start()
    const response = await fetch(`${state.endpoints[0]}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'phone', trades: [] })
    })
    expect(response.status).toBe(401)
  })

  it('imports queued trades and returns desktop history and rules', async () => {
    const db = fakeDb()
    const server = createMobileSyncServer(db, { host: '127.0.0.1', port: 0 })
    servers.push(server)
    const state = await server.start()
    const response = await fetch(`${state.endpoints[0]}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify({
        deviceId: 'phone',
        rules: ['Phone rule'],
        rulesUpdatedAt: '2026-07-26T11:00:00.000Z',
        trades: [{ id: 'mobile-1', symbol: 'MES' }]
      })
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.rules).toEqual(['Wait for setup', 'Respect risk'])
    expect(body.rulesUpdatedAt).toBe('2026-07-26T12:00:00.000Z')
    expect(body.trades[0].symbol).toBe('MES')
    expect(db.mergeMobileTradeRules).toHaveBeenCalledWith(['Phone rule'], '2026-07-26T11:00:00.000Z')
    expect(db.applyMobileTradeChanges).toHaveBeenCalledWith('phone', [{
      entityId: 'mobile-1',
      operation: 'create',
      payload: { id: 'mobile-1', symbol: 'MES' }
    }])
  })

  it('passes explicit create, update, and delete changes to the database', async () => {
    const db = fakeDb()
    const server = createMobileSyncServer(db, { host: '127.0.0.1', port: 0 })
    servers.push(server)
    const state = await server.start()
    const changes = [
      { entityId: 'mobile-1', operation: 'update', payload: { id: 'mobile-1', desktopId: 'desktop-1', pnl: 75 } },
      { entityId: 'desktop:2', operation: 'delete', payload: { id: 'desktop:2', desktopId: 'desktop-2' } }
    ]
    const response = await fetch(`${state.endpoints[0]}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret-token' },
      body: JSON.stringify({ deviceId: 'phone', rules: [], changes })
    })

    expect(response.status).toBe(200)
    expect(db.applyMobileTradeChanges).toHaveBeenCalledWith('phone', changes)
  })
})

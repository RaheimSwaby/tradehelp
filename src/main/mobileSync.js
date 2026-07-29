import { createServer } from 'http'
import { networkInterfaces } from 'os'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const DEFAULT_PORT = 47831

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  response.end(JSON.stringify(body))
}

function localIpv4Addresses() {
  const addresses = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address)
    }
  }
  const rank = (address) => address.startsWith('192.168.') ? 0
    : address.startsWith('10.') ? 1
      : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 2
        : 3
  return [...new Set(addresses)].sort((a, b) => rank(a) - rank(b))
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Sync request is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch { reject(new Error('Invalid sync request')) }
    })
    request.on('error', reject)
  })
}

export function createMobileSyncServer(db, options = {}) {
  const host = options.host || '0.0.0.0'
  const requestedPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT
  let server = null
  let port = requestedPort
  let token = ''

  function endpoints() {
    if (!server) return []
    if (host !== '0.0.0.0') return [`http://${host}:${port}`]
    return localIpv4Addresses().map((address) => `http://${address}:${port}`)
  }

  function status() {
    const endpointList = endpoints()
    return {
      running: Boolean(server),
      available: options.allow !== false,
      port: server ? port : requestedPort,
      endpoints: endpointList,
      pairingCodes: endpointList.map((endpoint) => `${endpoint}|${token}`),
      // One code carrying every address. We can't know which interface the
      // phone can route to, so pairing with a single address is a coin flip
      // that also breaks whenever this machine's DHCP lease changes.
      pairingCode: endpointList.length ? `${endpointList.join(',')}|${token}` : '',
      transport: 'local-http',
      warning: 'Pairing is authenticated but not encrypted. Use only on a trusted private network.'
    }
  }

  function authorized(request) {
    return request.headers.authorization === `Bearer ${token}`
  }

  async function handle(request, response) {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/v1/health') {
      json(response, 200, { ok: true, name: 'TradeHelp Desktop', protocolVersion: 3 })
      return
    }
    if (!authorized(request)) {
      json(response, 401, { ok: false, error: 'Pairing code rejected' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      const ruleState = db.getTradeRuleState()
      const accountState = db.getMobileAccountState()
      json(response, 200, {
        ok: true,
        name: 'TradeHelp Desktop',
        protocolVersion: 3,
        rules: ruleState.rules,
        rulesUpdatedAt: ruleState.updatedAt,
        accountState
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/v1/sync') {
      try {
        const body = await readJson(request)
        const ruleState = db.mergeMobileTradeRules(body.rules, body.rulesUpdatedAt)
        const accountState = db.mergeMobileAccountState(body.accountState, body.accountStateUpdatedAt)
        const changes = Array.isArray(body.changes)
          ? body.changes
          : (Array.isArray(body.trades) ? body.trades : []).map((trade) => ({
              entityId: String(trade?.id || ''),
              operation: 'create',
              payload: trade
            }))
        const result = db.applyMobileTradeChanges(body.deviceId, changes)
        options.onSync?.({ ...result, rulesChanged: ruleState.changed, accountsChanged: accountState.changed })
        json(response, 200, {
          ok: true,
          ...result,
          rules: ruleState.rules,
          rulesUpdatedAt: ruleState.updatedAt,
          accountState,
          trades: db.mobileTradeSnapshot(100),
          // Re-advertise every address on each sync so the phone keeps an
          // up-to-date candidate list and survives this machine's LAN address
          // changing between sessions.
          endpoints: endpoints(),
          syncedAt: new Date().toISOString()
        })
      } catch (error) {
        json(response, 400, { ok: false, error: String(error?.message || error) })
      }
      return
    }
    json(response, 404, { ok: false, error: 'Not found' })
  }

  async function start() {
    if (server) return status()
    if (options.allow === false) throw new Error('Mobile sync is disabled in this build')
    token = db.getMobileSyncToken()
    const nextServer = createServer((request, response) => {
      handle(request, response).catch((error) => json(response, 500, { ok: false, error: String(error?.message || error) }))
    })
    await new Promise((resolve, reject) => {
      nextServer.once('error', reject)
      nextServer.listen(requestedPort, host, () => {
        nextServer.off('error', reject)
        resolve()
      })
    })
    server = nextServer
    port = server.address().port
    return status()
  }

  async function stop() {
    if (!server) return status()
    const current = server
    server = null
    await new Promise((resolve) => current.close(resolve))
    return status()
  }

  async function rotate() {
    token = db.rotateMobileSyncToken()
    return status()
  }

  return { start, stop, rotate, status }
}

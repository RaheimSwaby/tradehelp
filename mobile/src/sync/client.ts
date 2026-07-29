import type { SQLiteDatabase } from 'expo-sqlite'
import {
  applyAccountState,
  applyRuleState,
  applySyncResult,
  getAccountState,
  getDeviceId,
  getRuleState,
  pendingTradeChanges,
  setSetting
} from '../storage/repository'

const ENDPOINT_PATTERN = /^http:\/\/(?:\d{1,3}\.){3}\d{1,3}:\d+$/
// The desktop is on the same LAN, so a reachable host answers fast. Keep this
// short: an unreachable address must fail quickly enough that we can still try
// the remaining candidates without the user thinking the app has hung.
const REQUEST_TIMEOUT_MS = 6000

export const PAIRING_EXPIRED =
  'Pairing expired. Open TradeHelp Desktop → Settings → Mobile sync and scan the code again.'
export const DESKTOP_UNREACHABLE =
  "Couldn't reach TradeHelp Desktop. Check that it's open and your phone is on the same Wi-Fi network — your changes are saved and will sync once it's reachable."

/**
 * A pairing code is `<endpoint>[,<endpoint>...]|<token>`. The desktop advertises
 * one endpoint per local network interface because we can't know which one the
 * phone can actually route to — and a home router will hand the desktop a
 * different address after a DHCP lease expires. Carrying every candidate is what
 * stops a working pair from silently going dead.
 */
export function parsePairingCode(code: string) {
  const raw = String(code || '').trim()
  const separator = raw.lastIndexOf('|')
  const token = raw.slice(separator + 1).trim()
  const endpoints = (separator > 0 ? raw.slice(0, separator) : '')
    .split(/[,\s]+/)
    .map((part) => part.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  if (!endpoints.length || token.length < 20 || !endpoints.every((entry) => ENDPOINT_PATTERN.test(entry))) {
    throw new Error('Paste the complete pairing code from TradeHelp Desktop.')
  }
  return { endpoints, token }
}

function buildPairingCode(endpoints: string[], token: string) {
  return `${endpoints.join(',')}|${token}`
}

async function postSync(endpoint: string, token: string, payload: unknown) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${endpoint}/v1/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function syncDesktop(db: SQLiteDatabase, pairingCode: string) {
  const { endpoints, token } = parsePairingCode(pairingCode)
  const deviceId = await getDeviceId(db)
  const queued = await pendingTradeChanges(db)
  const ruleState = await getRuleState(db)
  const accountState = await getAccountState(db)
  const payload = {
    deviceId,
    rules: ruleState.rules,
    rulesUpdatedAt: ruleState.updatedAt,
    accountState,
    accountStateUpdatedAt: accountState.updatedAt,
    changes: queued,
    trades: queued.filter((change) => change.operation === 'create').map((change) => change.payload)
  }

  let response: Response | null = null
  let reachedEndpoint = ''
  for (const endpoint of endpoints) {
    try {
      response = await postSync(endpoint, token, payload)
      reachedEndpoint = endpoint
      break
    } catch {
      // Unreachable address (wrong subnet, stale DHCP lease, desktop asleep).
      // Try the next candidate rather than surfacing a raw network error.
      response = null
    }
  }
  if (!response) throw new Error(DESKTOP_UNREACHABLE)

  // The token is per-desktop, so a rejected token will be rejected at every
  // address too — there is nothing to retry, the user has to re-pair.
  if (response.status === 401 || response.status === 403) throw new Error(PAIRING_EXPIRED)

  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.ok) throw new Error(body.error || 'Desktop sync failed.')

  await applySyncResult(db, body.accepted || [], body.trades || [])
  const mergedRules = await applyRuleState(
    db,
    Array.isArray(body.rules) ? body.rules : ruleState.rules,
    String(body.rulesUpdatedAt || ruleState.updatedAt)
  )
  const mergedAccounts = await applyAccountState(
    db,
    body.accountState || accountState,
    String(body.accountState?.updatedAt || accountState.updatedAt)
  )

  // Remember every address the desktop currently advertises, with the one that
  // just worked first, so the next sync starts with the address most likely to
  // answer instead of timing out through dead candidates again.
  const advertised: string[] = Array.isArray(body.endpoints)
    ? body.endpoints.filter((entry: unknown) => typeof entry === 'string' && ENDPOINT_PATTERN.test(entry))
    : []
  const ordered = [reachedEndpoint, ...advertised, ...endpoints].filter(
    (entry, index, all) => entry && all.indexOf(entry) === index
  )
  await setSetting(db, 'pairingCode', buildPairingCode(ordered, token))
  await setSetting(db, 'lastSyncedAt', String(body.syncedAt || new Date().toISOString()))

  return {
    importedCount: Number(body.importedCount) || 0,
    updatedCount: Number(body.updatedCount) || 0,
    deletedCount: Number(body.deletedCount) || 0,
    duplicateCount: Number(body.duplicateCount) || 0,
    rules: mergedRules.rules,
    rulesUpdatedAt: mergedRules.updatedAt,
    accountState: mergedAccounts,
    syncedAt: String(body.syncedAt || ''),
    pairingCode: buildPairingCode(ordered, token)
  }
}

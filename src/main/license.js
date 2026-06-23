// Trial + license gating. 14-day free trial tracked locally, then a one-time
// unlock via a Gumroad license key (verified once online, works offline after).

export const TRIAL_DAYS = 14

// ── Gumroad product ──────────────────────────────────────────────────────────
// Gumroad's verify API keys off the product_id (NOT the /l/ permalink). If you
// ever need to find it, POST to the verify endpoint once with any value — the
// error message names the exact product_id to use.
const GUMROAD_PRODUCT_ID = 'qu9Yv3jKqcNEbp1fU-aftg=='
// How many devices one key may activate before we ask the buyer to reach out.
const MAX_ACTIVATIONS = 2
const VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify'

const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000)

// Returns the current entitlement, seeding the trial start on first run.
export function status(db) {
  const s = db.getSettings()
  let trialStart = s.trialStart
  if (!trialStart) { trialStart = new Date().toISOString(); db.setSettings({ trialStart }) }
  const licensed = s.licenseStatus === 'active' && !!s.licenseKey
  const daysLeft = Math.max(0, TRIAL_DAYS - daysSince(trialStart))
  const state = licensed ? 'active' : daysLeft > 0 ? 'trial' : 'expired'
  return { state, daysLeft, key: s.licenseKey || '' }
}

// Hits Gumroad's verify endpoint with our product_id. Passing increment=true on
// activation bumps the key's use count, which is how we cap activations per key.
async function verifyKey(key, increment) {
  const body = new URLSearchParams({ product_id: GUMROAD_PRODUCT_ID, license_key: key, increment_uses_count: String(increment) })
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.success) return { ok: true, data: d }
    return { ok: false, data: d }
  } catch { return { network: true } }
}

export async function activate(db, key) {
  key = String(key || '').trim()
  if (!key) return { ok: false, error: 'Enter your license key.' }
  // Re-activating the same key on an already-licensed machine shouldn't burn a use.
  const s = db.getSettings()
  if (s.licenseStatus === 'active' && s.licenseKey === key) return { ok: true }

  const r = await verifyKey(key, true)
  if (r.network) return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' }
  if (!r.ok) return { ok: false, error: r.data?.message || 'That key is invalid for this product.' }

  const p = r.data.purchase || {}
  if (p.refunded || p.chargebacked || p.disputed) {
    return { ok: false, error: 'This purchase was refunded or disputed, so the key is no longer valid.' }
  }
  if (Number(r.data.uses) > MAX_ACTIVATIONS) {
    return { ok: false, error: `This key has already been activated on ${MAX_ACTIVATIONS} devices. If that's not right, reply to your Gumroad receipt and we'll reset it.` }
  }
  db.setSettings({ licenseKey: key, licenseInstanceId: p.id || p.sale_id || '', licenseStatus: 'active' })
  return { ok: true }
}

export function deactivate(db) {
  db.setSettings({ licenseKey: '', licenseInstanceId: '', licenseStatus: '' })
  return { ok: true }
}

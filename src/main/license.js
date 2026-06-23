// Trial + license gating. 14-day free trial tracked locally, then a one-time
// unlock via a Gumroad license key (verified once online, works offline after).

export const TRIAL_DAYS = 14

// ── Gumroad product ──────────────────────────────────────────────────────────
// Paste your product's permalink — the bit after /l/ in your product URL,
// e.g. https://you.gumroad.com/l/tradehelp  ->  'tradehelp'.
// (The numeric product_id from Gumroad's product settings also works here.)
const GUMROAD_PRODUCT = 'YOUR-GUMROAD-PRODUCT'
// How many devices one key may activate before we ask the buyer to reach out.
const MAX_ACTIVATIONS = 5
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

// Hits Gumroad's verify endpoint. Tries the configured value as a product_id
// first, then as a product_permalink, so either form the seller pastes works.
// Only the matching attempt increments the use count, so a key burns one
// activation per call regardless.
async function verifyKey(key, increment) {
  for (const field of ['product_id', 'product_permalink']) {
    const body = new URLSearchParams({ [field]: GUMROAD_PRODUCT, license_key: key, increment_uses_count: String(increment) })
    let res, d
    try {
      res = await fetch(VERIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body })
      d = await res.json().catch(() => ({}))
    } catch { return { network: true } }
    if (res.ok && d.success) return { ok: true, data: d }
    // Only fall through to the other field when the product itself wasn't found.
    if (!/product/i.test(d.message || '')) return { ok: false, data: d }
  }
  return { ok: false, data: { message: 'That key could not be verified for this product.' } }
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

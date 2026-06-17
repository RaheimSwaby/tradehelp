// Trial + license gating. 14-day free trial tracked locally, then a one-time
// unlock via a Lemon Squeezy license key (activate once online, works offline after).
import os from 'os'

export const TRIAL_DAYS = 14
const LS = 'https://api.lemonsqueezy.com/v1/licenses'

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

export async function activate(db, key) {
  key = String(key || '').trim()
  if (!key) return { ok: false, error: 'Enter your license key.' }
  try {
    const res = await fetch(`${LS}/activate`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key, instance_name: os.hostname() })
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.activated) {
      db.setSettings({ licenseKey: key, licenseInstanceId: d.instance?.id || '', licenseStatus: 'active' })
      return { ok: true }
    }
    return { ok: false, error: d.error || 'That key could not be activated (it may be invalid or out of activations).' }
  } catch {
    return { ok: false, error: 'Could not reach the license server. Check your connection and try again.' }
  }
}

export function deactivate(db) {
  db.setSettings({ licenseKey: '', licenseInstanceId: '', licenseStatus: '' })
  return { ok: true }
}

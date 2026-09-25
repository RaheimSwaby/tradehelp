export const COACH_MEMORY_KEY = 'tradehelp.coach-memory.v1'
export function normalizeCoachMemory(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).flatMap((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string' || !item.text.trim()) return []
    return [{ id: item.id.slice(0, 100), text: item.text.trim().slice(0, 800), kind: item.kind === 'correction' ? 'correction' : 'preference' }]
  })
}
export function loadCoachMemory(storage) {
  try { return normalizeCoachMemory(JSON.parse((storage || globalThis.localStorage).getItem(COACH_MEMORY_KEY) || '[]')) } catch { return [] }
}
export function saveCoachMemory(items, storage) {
  try { (storage || globalThis.localStorage).setItem(COACH_MEMORY_KEY, JSON.stringify(normalizeCoachMemory(items))); return true } catch { return false }
}

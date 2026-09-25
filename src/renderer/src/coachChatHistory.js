export const COACH_CHAT_STORAGE_KEY = 'tradehelp.coach-chat.v1'
export const COACH_CHAT_RETENTION_MS = 5 * 24 * 60 * 60 * 1000

const MAX_MESSAGES = 80
const MAX_CONTENT_CHARS = 30_000
const MAX_THINKING_CHARS = 60_000

function storageOrDefault(storage) {
  if (storage) return storage
  try { return globalThis.localStorage } catch { return null }
}

export function normalizeCoachChatHistory(input) {
  const source = Array.isArray(input) ? input : Array.isArray(input?.messages) ? input.messages : []
  return source.slice(-MAX_MESSAGES).flatMap((message) => {
    const role = message?.role === 'user' || message?.role === 'assistant' ? message.role : ''
    const content = typeof message?.content === 'string' ? message.content.slice(0, MAX_CONTENT_CHARS) : ''
    if (!role || !content.trim()) return []
    const thinking = typeof message?.thinking === 'string' ? message.thinking.slice(0, MAX_THINKING_CHARS) : ''
    const contextKey = typeof message.contextKey === 'string' ? message.contextKey.slice(0, 2000) : ''
    const raw = message.evidence
    const evidence = raw && typeof raw === 'object' ? {
      scopeLabel: String(raw.scopeLabel || '').slice(0, 500),
      matched: Math.max(0, Number(raw.matched) || 0), included: Math.max(0, Number(raw.included) || 0),
      memoryUsed: Math.max(0, Number(raw.memoryUsed) || 0), memoryTotal: Math.max(0, Number(raw.memoryTotal) || 0),
      sources: (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 100).filter((source) => source && /^[TSCR]\d+$/.test(source.key)).map((source) => ({
        key: source.key, kind: ['trade', 'summary', 'review', 'commitment'].includes(source.kind) ? source.kind : 'summary',
        ...(source.tradeId != null ? { tradeId: String(source.tradeId).slice(0, 100) } : {}),
        label: String(source.label || '').slice(0, 500), detail: String(source.detail || '').slice(0, 2500),
      })),
    } : null
    return [{ role, content, ...(thinking ? { thinking } : {}), ...(contextKey ? { contextKey } : {}), ...(evidence ? { evidence } : {}), ...(message.evidenceFallback === true ? { evidenceFallback: true } : {}) }]
  })
}

export function loadCoachChatHistory(storage, now = Date.now()) {
  const target = storageOrDefault(storage)
  if (!target) return []
  try {
    const saved = JSON.parse(target.getItem(COACH_CHAT_STORAGE_KEY) || '[]')
    const updatedAt = Number(saved?.updatedAt)
    if (Number.isFinite(updatedAt) && updatedAt > 0 && Number(now) - updatedAt >= COACH_CHAT_RETENTION_MS) {
      target.removeItem(COACH_CHAT_STORAGE_KEY)
      return []
    }
    return normalizeCoachChatHistory(saved)
  } catch {
    return []
  }
}

export function saveCoachChatHistory(messages, storage, now = Date.now()) {
  const target = storageOrDefault(storage)
  if (!target) return false
  const normalized = normalizeCoachChatHistory(messages)
  try {
    if (normalized.length === 0) target.removeItem(COACH_CHAT_STORAGE_KEY)
    else target.setItem(COACH_CHAT_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: Number(now), messages: normalized }))
    return true
  } catch {
    return false
  }
}

export function clearCoachChatHistory(storage) {
  const target = storageOrDefault(storage)
  if (!target) return false
  try {
    target.removeItem(COACH_CHAT_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

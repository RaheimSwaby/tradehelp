import { describe, expect, it } from 'vitest'
import { COACH_CHAT_RETENTION_MS, COACH_CHAT_STORAGE_KEY, clearCoachChatHistory, loadCoachChatHistory, normalizeCoachChatHistory, saveCoachChatHistory } from '../coachChatHistory.js'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key)
  }
}

describe('coach chat history', () => {
  it('saves and restores visible user and assistant messages', () => {
    const storage = memoryStorage()
    const messages = [
      { role: 'user', content: 'Review my last session.' },
      { role: 'assistant', content: 'You took two trades.', thinking: 'Read the journal.' }
    ]
    expect(saveCoachChatHistory(messages, storage)).toBe(true)
    expect(loadCoachChatHistory(storage)).toEqual(messages)
    expect(JSON.parse(storage.value(COACH_CHAT_STORAGE_KEY))).toMatchObject({ version: 1 })
  })

  it('drops invalid records and caps retained history', () => {
    const messages = Array.from({ length: 90 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` }))
    messages.push({ role: 'system', content: 'hidden prompt' }, { role: 'user', content: '' })
    const normalized = normalizeCoachChatHistory(messages)
    expect(normalized).toHaveLength(78)
    expect(normalized[0].content).toBe('message 12')
    expect(normalized.some((message) => message.role === 'system')).toBe(false)
  })

  it('returns an empty thread for corrupt storage and clears saved history', () => {
    const storage = memoryStorage({ [COACH_CHAT_STORAGE_KEY]: '{bad json' })
    expect(loadCoachChatHistory(storage)).toEqual([])
    expect(clearCoachChatHistory(storage)).toBe(true)
    expect(storage.value(COACH_CHAT_STORAGE_KEY)).toBeUndefined()
  })

  it('keeps a conversation for five days from the latest message, then removes it', () => {
    const storage = memoryStorage()
    const savedAt = Date.UTC(2026, 7, 19, 15)
    const messages = [{ role: 'user', content: 'What should I review?' }]
    saveCoachChatHistory(messages, storage, savedAt)

    expect(loadCoachChatHistory(storage, savedAt + COACH_CHAT_RETENTION_MS - 1)).toEqual(messages)
    expect(loadCoachChatHistory(storage, savedAt + COACH_CHAT_RETENTION_MS)).toEqual([])
    expect(storage.value(COACH_CHAT_STORAGE_KEY)).toBeUndefined()
  })
})

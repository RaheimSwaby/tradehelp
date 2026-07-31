const COACH_REQUEST_PROFILES = Object.freeze({
  fast: Object.freeze({
    mode: 'fast',
    maxChars: 10000,
    contextWindow: 4096,
    historyMessages: 4,
    think: false
  }),
  balanced: Object.freeze({
    mode: 'balanced',
    maxChars: 18000,
    contextWindow: 8192,
    historyMessages: 8,
    think: false
  }),
  deep: Object.freeze({
    mode: 'deep',
    maxChars: 44000,
    contextWindow: 16384,
    historyMessages: 16
  })
})

export function normalizeCoachContextMode(value) {
  const mode = String(value || '').toLowerCase()
  return Object.hasOwn(COACH_REQUEST_PROFILES, mode) ? mode : 'balanced'
}

export function coachRequestProfile(settings = {}) {
  return COACH_REQUEST_PROFILES[normalizeCoachContextMode(settings.coachContextMode)]
}

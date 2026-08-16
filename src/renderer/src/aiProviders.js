// Which providers send your data off this machine, in one place.
//
// This module exists because "is this a cloud provider?" was previously written
// as `provider === 'cloud'` in six separate files, one of which is the journal
// privacy gate. Adding a second cloud provider that way would have sent written
// journal entries to it even with "send my notes" switched off, because the gate
// only knew one provider name. Ask isCloudProvider() instead of comparing strings,
// and the next provider added here is covered everywhere by construction.

export const CLOUD_PROVIDERS = Object.freeze(['cloud', 'anthropic'])

export const isCloudProvider = (provider) => CLOUD_PROVIDERS.includes(provider)

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'

// Every request must carry this. It pins the wire format, not the model.
export const ANTHROPIC_VERSION = '2023-06-01'

// Anthropic requires max_tokens on every request; there is no server-side default.
// This is the ceiling for one coach reply, and it covers thinking plus visible text
// on models that think, so leave it generous enough that a reasoned answer is not
// cut off mid-sentence.
export const ANTHROPIC_MAX_TOKENS = 16000

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5'

// Shown when the live model list cannot be fetched (no key yet, or offline).
// Ordered most to least capable so the top entry is the sensible default.
export const ANTHROPIC_FALLBACK_MODELS = Object.freeze([
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5'
])

export const anthropicHeaders = (key) => ({
  'Content-Type': 'application/json',
  'x-api-key': String(key || '').trim(),
  'anthropic-version': ANTHROPIC_VERSION
})

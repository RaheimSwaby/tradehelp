import { dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'

const VAULT_VERSION = 1

function safeJson(path) {
  if (!existsSync(path)) return { version: VAULT_VERSION, secrets: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed?.version === VAULT_VERSION && parsed?.secrets && typeof parsed.secrets === 'object'
      ? parsed
      : { version: VAULT_VERSION, secrets: {} }
  } catch {
    return { version: VAULT_VERSION, secrets: {} }
  }
}

export function createCredentialVault({ safeStorage, filePath, platform = process.platform } = {}) {
  if (!safeStorage || !filePath) throw new Error('Credential vault needs secure storage and a file path')

  function security() {
    const backend = platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : platform === 'win32'
        ? 'windows-dpapi'
        : platform === 'darwin'
          ? 'macos-keychain'
          : 'os-credential-store'
    const available = Boolean(safeStorage.isEncryptionAvailable?.()) && backend !== 'basic_text'
    return { available, backend, protected: available }
  }

  function requireSecurity() {
    const state = security()
    if (!state.available) throw new Error('Secure credential storage is unavailable on this machine')
    return state
  }

  function persist(data) {
    mkdirSync(dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp`
    writeFileSync(temporary, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, filePath)
  }

  return {
    status(id = '') {
      const state = security()
      const data = safeJson(filePath)
      return { ...state, hasCredential: Boolean(id && data.secrets[id]) }
    },

    set(id, secret) {
      requireSecurity()
      const key = String(id || '').trim().toLowerCase()
      const value = String(secret || '').trim()
      if (!/^[a-z0-9-]+$/.test(key) || !value) throw new Error('A valid credential is required')
      const data = safeJson(filePath)
      data.secrets[key] = safeStorage.encryptString(value).toString('base64')
      persist(data)
      return this.status(key)
    },

    get(id) {
      requireSecurity()
      const key = String(id || '').trim().toLowerCase()
      const encoded = safeJson(filePath).secrets[key]
      if (!encoded) return ''
      try {
        return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
      } catch {
        throw new Error('The saved credential can no longer be decrypted on this machine')
      }
    },

    delete(id) {
      const key = String(id || '').trim().toLowerCase()
      const data = safeJson(filePath)
      if (data.secrets[key]) {
        delete data.secrets[key]
        persist(data)
      }
      return this.status(key)
    }
  }
}

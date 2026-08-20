import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createCredentialVault } from '../credentialVault.js'

const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fakeStorage({ available = true, backend = 'gnome_libsecret' } = {}) {
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => value.toString().replace(/^encrypted:/, '')
  }
}

describe('market data credential vault', () => {
  it('persists only encrypted credential material and never exposes it in status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tradehelp-vault-'))
    temporary.push(dir)
    const filePath = join(dir, 'secure', 'market-data.json')
    const vault = createCredentialVault({ safeStorage: fakeStorage(), filePath, platform: 'win32' })
    expect(vault.set('databento', 'db-secret')).toMatchObject({ hasCredential: true, protected: true, backend: 'windows-dpapi' })
    expect(vault.get('databento')).toBe('db-secret')
    const onDisk = readFileSync(filePath, 'utf8')
    expect(onDisk).not.toContain('db-secret')
    expect(vault.status('databento')).not.toHaveProperty('credential')
  })

  it('refuses plaintext Linux fallback storage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tradehelp-vault-'))
    temporary.push(dir)
    const vault = createCredentialVault({ safeStorage: fakeStorage({ backend: 'basic_text' }), filePath: join(dir, 'vault.json'), platform: 'linux' })
    expect(vault.status('databento')).toMatchObject({ available: false, protected: false })
    expect(() => vault.set('databento', 'db-secret')).toThrow(/unavailable/i)
  })

  it('removes a credential without returning its value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tradehelp-vault-'))
    temporary.push(dir)
    const vault = createCredentialVault({ safeStorage: fakeStorage(), filePath: join(dir, 'vault.json'), platform: 'win32' })
    vault.set('databento', 'db-secret')
    expect(vault.delete('databento')).toMatchObject({ hasCredential: false })
    expect(vault.get('databento')).toBe('')
  })
})

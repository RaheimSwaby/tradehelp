import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { patchKeychainSource } from './fix-mac-keychain-password.mjs'

const require = createRequire(import.meta.url)
const version = require('app-builder-lib/package.json').version
const source = await readFile(require.resolve('app-builder-lib/out/codeSign/macCodeSign.js'), 'utf8')

test('uses the keychain password for partition access, certificate passwords for imports', async () => {
  const patched = patchKeychainSource(source, version)
  const start = patched.indexOf('async function createKeychain(')
  const end = patched.indexOf('async function sign(', start)
  assert.ok(start >= 0 && end > start)
  const calls = []
  const context = {
    process: { env: {} },
    bundledCertKeychainAdded: { value: Promise.resolve() },
    path: { join: (...parts) => parts.join('/') },
    os_1: { tmpdir: () => '/tmp' },
    crypto_1: {
      createHash: () => ({ update() { return this }, digest: () => 'test-keychain' }),
      randomBytes: () => ({ toString: () => 'different-keychain-password' }),
    },
    removeKeychain: async () => {},
    listUserKeychains: async () => [],
    codesign_1: { importCertificate: async (link) => link },
    bluebird_lst_1: { default: {
      map: (items, fn) => Promise.all(items.map(fn)),
      mapSeries: async (items, fn) => { for (const item of items) await fn(item) },
    } },
    builder_util_1: { exec: async (_, args) => { calls.push(Array.from(args)); return '' } },
  }
  runInNewContext(patched.slice(start, end), context)
  await context.createKeychain({ currentDir: '/app', cscLink: 'app.p12', cscKeyPassword: 'app-password', cscILink: 'installer.p12', cscIKeyPassword: 'installer-password' })
  const imports = calls.filter(([cmd]) => cmd === 'import')
  assert.deepEqual(imports.map(args => args[args.indexOf('-P') + 1]), ['app-password', 'installer-password'])
  const partitions = calls.filter(([cmd]) => cmd === 'set-key-partition-list')
  assert.equal(partitions.length, 2)
  for (const args of partitions) assert.equal(args[args.indexOf('-k') + 1], 'different-keychain-password')
})

test('idempotent and fails closed on changed dependencies or partial patches', () => {
  const patched = patchKeychainSource(source, version)
  assert.equal(patchKeychainSource(patched, version), patched)
  assert.throws(() => patchKeychainSource(source, '26.16.1'))
  assert.throws(() => patchKeychainSource(patched.replace('keyPasswords, keychainPassword)', 'keyPasswords)'), version))
  assert.throws(() => patchKeychainSource('', version))
})

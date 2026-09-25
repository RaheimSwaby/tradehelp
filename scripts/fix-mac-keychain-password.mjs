import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Backport https://github.com/electron-userland/electron-builder/pull/10172
// Keep v25's native packaging behavior until a separately tested builder upgrade.
const replacements = [
  ['importCerts(keychainFile, certPaths, cscPasswords)', 'importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)'],
  ['async function importCerts(keychainFile, paths, keyPasswords)', 'async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)'],
  ['["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]', '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]'],
]

export function patchKeychainSource(source, version) {
  if (version !== '25.1.8') throw new Error(`Review/remove the signing backport for app-builder-lib ${version}`)
  const count = (text) => source.split(text).length - 1
  if (replacements.every(([before, after]) => count(before) === 0 && count(after) === 1)) return source
  if (!replacements.every(([before, after]) => count(before) === 1 && count(after) === 0)) {
    throw new Error('Unexpected signing implementation; refusing a partial keychain patch')
  }
  return replacements.reduce((result, [before, after]) => result.replace(before, after), source)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const require = createRequire(import.meta.url)
  const file = require.resolve('app-builder-lib/out/codeSign/macCodeSign.js')
  const { version } = require('app-builder-lib/package.json')
  const source = await readFile(file, 'utf8')
  const patched = patchKeychainSource(source, version)
  if (patched !== source) await writeFile(file, patched)
  console.log('Verified macOS keychain password backport (certificate import password unchanged)')
}

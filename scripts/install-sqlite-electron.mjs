import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronPkg = require(join(root, 'node_modules', 'electron', 'package.json'))
const betterSqliteDir = dirname(require.resolve('better-sqlite3/package.json', { paths: [root] }))
const prebuildInstall = require.resolve('prebuild-install/bin.js', { paths: [betterSqliteDir] })

const result = spawnSync(process.execPath, [
  prebuildInstall,
  '-r',
  'electron',
  '-t',
  electronPkg.version,
  '-a',
  process.arch
], {
  cwd: betterSqliteDir,
  stdio: 'inherit'
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)

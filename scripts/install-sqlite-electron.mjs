import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronPkg = require(join(root, 'node_modules', 'electron', 'package.json'))
const betterSqliteDir = dirname(require.resolve('better-sqlite3/package.json', { paths: [root] }))
const prebuildInstall = require.resolve('prebuild-install/bin.js', { paths: [betterSqliteDir] })

// The architecture being built for is not always the one running this script.
// Honor the target supplied by npm/electron-builder so an architecture-specific
// install cannot silently replace SQLite with the CI runner's native slice.
// v0.50.2 reached Intel Macs with an arm64-only better_sqlite3.node and failed
// before the trade database could open.
const targetArch = process.env.npm_config_arch
  || process.env.npm_config_target_arch
  || process.arch

const result = spawnSync(process.execPath, [
  prebuildInstall,
  '-r',
  'electron',
  '-t',
  electronPkg.version,
  '-a',
  targetArch
], {
  cwd: betterSqliteDir,
  stdio: 'inherit'
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)

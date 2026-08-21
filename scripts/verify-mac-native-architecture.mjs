import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import builderUtil from 'builder-util'

const { Arch } = builderUtil
const SQLITE_PATH = join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')

function readArchitectures(path) {
  return execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim().split(/\s+/)
}

function requireArchitectures(label, path, expected) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)

  const actual = readArchitectures(path)
  console.log(`[mac-architecture] ${label}: ${actual.join(', ')}`)
  for (const architecture of expected) {
    if (!actual.includes(architecture)) {
      throw new Error(`${label} must contain ${architecture}; found ${actual.join(', ')}`)
    }
  }
}

export default function verifyMacNativeArchitecture(context) {
  if (context.electronPlatformName !== 'darwin') return

  const architecture = Arch[context.arch]
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const resources = join(app, 'Contents', 'Resources')
  const executable = join(app, 'Contents', 'MacOS', context.packager.appInfo.productFilename)

  if (architecture === 'x64' || architecture === 'arm64') {
    const expected = architecture === 'x64' ? 'x86_64' : 'arm64'
    requireArchitectures(`${architecture} TradeHelp executable`, executable, [expected])
    requireArchitectures(`${architecture} better_sqlite3.node`, join(resources, 'app.asar.unpacked', SQLITE_PATH), [expected])
    return
  }

  if (architecture !== 'universal') {
    throw new Error(`Unexpected macOS build architecture: ${architecture || context.arch}`)
  }

  requireArchitectures('universal TradeHelp executable', executable, ['x86_64', 'arm64'])

  const commonSqlite = join(resources, 'app.asar.unpacked', SQLITE_PATH)
  const x64Sqlite = join(resources, 'app-x64.asar.unpacked', SQLITE_PATH)
  const arm64Sqlite = join(resources, 'app-arm64.asar.unpacked', SQLITE_PATH)

  if (existsSync(x64Sqlite) && existsSync(arm64Sqlite)) {
    requireArchitectures('Intel better_sqlite3.node', x64Sqlite, ['x86_64'])
    requireArchitectures('Apple Silicon better_sqlite3.node', arm64Sqlite, ['arm64'])
    return
  }

  requireArchitectures('universal better_sqlite3.node', commonSqlite, ['x86_64', 'arm64'])
}

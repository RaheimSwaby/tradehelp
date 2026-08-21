import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import builderUtil from 'builder-util'

const { Arch } = builderUtil
const SQLITE_PATH = join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')

// This is an electron-builder afterPack hook, so it runs before signing and
// uploading. v0.50.2's universal app passed the build, signature and notarization
// steps while its unpacked SQLite module was still arm64-only. Check the x64 and
// arm64 temporary apps first, then the merged app; a bad slice now stops the
// release while it is still private.
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

export function detachFromSharedBuildFile(path) {
  const before = statSync(path)
  const detached = `${path}.tradehelp-detached-${process.pid}`

  // electron-builder hard-links unpacked native modules to node_modules. The
  // next architecture rebuild then rewrites the already-packaged file through
  // that shared inode. Copy, unlink and rename gives this app its own inode while
  // preserving the bytes and mode that were just verified.
  try {
    copyFileSync(path, detached)
    chmodSync(detached, before.mode)
    unlinkSync(path)
    renameSync(detached, path)
  } finally {
    if (existsSync(detached)) unlinkSync(detached)
  }

  const after = statSync(path)
  if (after.nlink !== 1) throw new Error(`Could not detach packaged native module: ${path}`)
  console.log(`[mac-architecture] detached native module from shared build file (links ${before.nlink} -> ${after.nlink})`)
}

export default function verifyMacNativeArchitecture(context) {
  if (context.electronPlatformName !== 'darwin') return

  const architecture = Arch[context.arch]
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const resources = join(app, 'Contents', 'Resources')
  const executable = join(app, 'Contents', 'MacOS', context.packager.appInfo.productFilename)

  if (architecture === 'x64' || architecture === 'arm64') {
    const expected = architecture === 'x64' ? 'x86_64' : 'arm64'
    const sqlite = join(resources, 'app.asar.unpacked', SQLITE_PATH)
    requireArchitectures(`${architecture} TradeHelp executable`, executable, [expected])
    requireArchitectures(`${architecture} better_sqlite3.node`, sqlite, [expected])
    detachFromSharedBuildFile(sqlite)
    requireArchitectures(`${architecture} detached better_sqlite3.node`, sqlite, [expected])
    return
  }

  if (architecture !== 'universal') {
    throw new Error(`Unexpected macOS build architecture: ${architecture || context.arch}`)
  }

  requireArchitectures('universal TradeHelp executable', executable, ['x86_64', 'arm64'])

  const commonSqlite = join(resources, 'app.asar.unpacked', SQLITE_PATH)
  const x64Sqlite = join(resources, 'app-x64.asar.unpacked', SQLITE_PATH)
  const arm64Sqlite = join(resources, 'app-arm64.asar.unpacked', SQLITE_PATH)

  // With mergeASARs disabled, @electron/universal normally keeps separate ASARs
  // and lets its entrypoint select one using process.arch. If future tooling emits
  // a single unpacked tree instead, accept it only when the native module is fat.
  if (existsSync(x64Sqlite) && existsSync(arm64Sqlite)) {
    requireArchitectures('Intel better_sqlite3.node', x64Sqlite, ['x86_64'])
    requireArchitectures('Apple Silicon better_sqlite3.node', arm64Sqlite, ['arm64'])
    return
  }

  requireArchitectures('universal better_sqlite3.node', commonSqlite, ['x86_64', 'arm64'])
}

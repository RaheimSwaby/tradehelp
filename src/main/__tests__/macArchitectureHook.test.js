import { linkSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detachFromSharedBuildFile } from '../../../scripts/verify-mac-native-architecture.mjs'

describe('macOS native package isolation', () => {
  it('keeps a packaged architecture unchanged when the shared build file is rebuilt', () => {
    const directory = mkdtempSync(join(tmpdir(), 'tradehelp-native-link-'))
    const buildFile = join(directory, 'node_modules-better-sqlite3.node')
    const packagedFile = join(directory, 'packaged-better-sqlite3.node')

    try {
      writeFileSync(buildFile, 'x86_64 binary')
      linkSync(buildFile, packagedFile)
      expect(statSync(packagedFile).nlink).toBeGreaterThan(1)

      detachFromSharedBuildFile(packagedFile)
      writeFileSync(buildFile, 'arm64 binary')

      expect(readFileSync(packagedFile, 'utf8')).toBe('x86_64 binary')
      expect(statSync(packagedFile).nlink).toBe(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

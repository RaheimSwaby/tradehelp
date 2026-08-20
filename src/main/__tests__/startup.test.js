import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createStartupLogger, withDeadline } from '../startup.js'

const temporaryDirs = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('startup diagnostics', () => {
  it('persists errors and rotates an oversized previous log', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dir = mkdtempSync(join(tmpdir(), 'tradehelp-startup-'))
    temporaryDirs.push(dir)
    const file = join(dir, 'startup.log')
    const logger = createStartupLogger(file, { maxBytes: 8 })

    writeFileSync(file, 'older diagnostic')
    logger.error('database failed', new Error('native module unavailable'))

    expect(readFileSync(`${file}.1`, 'utf8')).toBe('older diagnostic')
    expect(readFileSync(file, 'utf8')).toContain('database failed native module unavailable')
  })

  it('rejects a startup operation that does not settle before its deadline', async () => {
    await expect(withDeadline(new Promise(() => {}), 10, 'renderer bind timed out'))
      .rejects.toThrow('renderer bind timed out')
  })

  it('passes through a startup operation that settles in time', async () => {
    await expect(withDeadline(Promise.resolve(43123), 100)).resolves.toBe(43123)
  })
})

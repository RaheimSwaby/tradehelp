import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const APP_SOURCE = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
// This is valid JavaScript, so Vite built it and the old suite stayed green:
//   let active = true
//   (async () => {})()
// It parses as true(async () => {})() and prevents the first render. Keep this
// guard narrow to the startup sequence; a broad newline scanner misreads JSX.
const BROKEN_STARTUP_IIFE = /\blet\s+active\s*=\s*true\s*\r?\n\s*\(async\s*\(\)\s*=>/

describe('automatic semicolon insertion hazards', () => {
  it('does not call the startup active flag as a function', () => {
    expect(APP_SOURCE).not.toMatch(BROKEN_STARTUP_IIFE)
  })
})

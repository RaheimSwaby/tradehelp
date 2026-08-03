import { describe, expect, it } from 'vitest'
import {
  PLAYBOOK_SHARE_KIND,
  buildPlaybookExport,
  parsePlaybookImport,
  playbookShareFilename,
  safeSharedScreenshot
} from '../playbookShare.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

const ENTRY = {
  name: 'VWAP Reclaim',
  description: 'Fade the first push back through VWAP',
  criteria: 'Price reclaims VWAP on rising volume',
  invalidation: 'Closes back below VWAP',
  targets: 'Prior day high',
  notes: 'Best before 11am'
}

function exported(entry = ENTRY, images = []) {
  return JSON.stringify(buildPlaybookExport(entry, images))
}

describe('playbook export', () => {
  it('round-trips every rule field through an export and import', () => {
    const result = parsePlaybookImport(exported())
    expect(result.ok).toBe(true)
    expect(result.entry).toMatchObject(ENTRY)
  })

  it('carries allowed example charts and their labels across the round trip', () => {
    const images = [{ dataUrl: PNG, tag: 'A+ example' }, { dataUrl: PNG, tag: 'failed example' }]
    const result = parsePlaybookImport(exported(ENTRY, images))
    expect(result.ok).toBe(true)
    expect(result.entry.images).toEqual(images)
    expect(result.droppedScreenshot).toBe(false)
  })

  it('never exports or imports more charts than the app allows', () => {
    const images = Array.from({ length: 9 }, (_, index) => ({ dataUrl: PNG, tag: `chart ${index}` }))
    const result = parsePlaybookImport(exported(ENTRY, images))
    expect(result.ok).toBe(true)
    expect(result.entry.images).toHaveLength(4)
  })

  it('clamps very long fields so one file cannot bloat the database', () => {
    const result = parsePlaybookImport(exported({ ...ENTRY, notes: 'x'.repeat(50000) }))
    expect(result.ok).toBe(true)
    expect(result.entry.notes.length).toBe(4000)
  })

  it('builds a filesystem-safe filename from the setup name', () => {
    expect(playbookShareFilename('VWAP Reclaim / v2')).toBe('tradehelp-vwap-reclaim-v2.json')
    expect(playbookShareFilename('', 'png')).toBe('tradehelp-setup.png')
  })
})

describe('playbook import rejects untrusted input', () => {
  it('refuses text that is not JSON', () => {
    expect(parsePlaybookImport('not json at all').ok).toBe(false)
  })

  it('refuses JSON that is not a TradeHelp setup', () => {
    expect(parsePlaybookImport(JSON.stringify({ hello: 'world' })).ok).toBe(false)
  })

  it('refuses an export from a newer version', () => {
    const payload = JSON.stringify({ kind: PLAYBOOK_SHARE_KIND, version: 99, setup: ENTRY })
    expect(parsePlaybookImport(payload).ok).toBe(false)
  })

  it('refuses a setup with no name', () => {
    expect(parsePlaybookImport(exported({ ...ENTRY, name: '   ' })).ok).toBe(false)
  })

  it('survives a setup field that is an object rather than text', () => {
    const payload = JSON.stringify({
      kind: PLAYBOOK_SHARE_KIND,
      version: 1,
      setup: { name: 'Odd', criteria: { nested: true } }
    })
    const result = parsePlaybookImport(payload)
    expect(result.ok).toBe(true)
    expect(typeof result.entry.criteria).toBe('string')
  })

  // An SVG can carry script, so it is refused on import exactly as it is on upload.
  it('drops an SVG chart but keeps the safe ones and the rules', () => {
    const payload = JSON.stringify({
      kind: PLAYBOOK_SHARE_KIND,
      version: 1,
      setup: {
        ...ENTRY,
        screenshots: [
          { dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', tag: 'hostile' },
          { dataUrl: PNG, tag: 'fine' }
        ]
      }
    })
    const result = parsePlaybookImport(payload)
    expect(result.ok).toBe(true)
    expect(result.entry.images).toEqual([{ dataUrl: PNG, tag: 'fine' }])
    expect(result.droppedScreenshot).toBe(true)
    expect(result.entry.criteria).toBe(ENTRY.criteria)
  })

  it('drops a chart that is not an inline image at all', () => {
    const payload = JSON.stringify({
      kind: PLAYBOOK_SHARE_KIND,
      version: 1,
      setup: { ...ENTRY, screenshots: [{ dataUrl: 'https://example.com/chart.png' }] }
    })
    const result = parsePlaybookImport(payload)
    expect(result.ok).toBe(true)
    expect(result.entry.images).toEqual([])
    expect(result.droppedScreenshot).toBe(true)
  })

  it('survives a screenshots field that is not an array', () => {
    const payload = JSON.stringify({
      kind: PLAYBOOK_SHARE_KIND,
      version: 1,
      setup: { ...ENTRY, screenshots: 'not-an-array' }
    })
    const result = parsePlaybookImport(payload)
    expect(result.ok).toBe(true)
    expect(result.entry.images).toEqual([])
  })
})

describe('safeSharedScreenshot', () => {
  it('accepts the same image types the uploader allows', () => {
    expect(safeSharedScreenshot(PNG)).toBe(PNG)
    expect(safeSharedScreenshot('data:image/jpeg;base64,AAAA')).toBeTruthy()
    expect(safeSharedScreenshot('data:image/webp;base64,AAAA')).toBeTruthy()
  })

  it('rejects svg, non-images, and oversized payloads', () => {
    expect(safeSharedScreenshot('data:image/svg+xml;base64,AAAA')).toBe('')
    expect(safeSharedScreenshot('data:text/html;base64,AAAA')).toBe('')
    expect(safeSharedScreenshot(`data:image/png;base64,${'A'.repeat(9 * 1024 * 1024)}`)).toBe('')
    expect(safeSharedScreenshot('')).toBe('')
  })
})

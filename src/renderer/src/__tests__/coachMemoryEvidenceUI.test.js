import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { loadCoachMemory, saveCoachMemory, normalizeCoachMemory } from '../coachMemory.js'
import { normalizeCoachChatHistory } from '../coachChatHistory.js'
import { CoachEvidenceAnswer } from '../components/CoachEvidence.jsx'

describe('approved memory and evidence persistence', () => {
  it('supports explicit create, edit and forget without changing chat', () => {
    let value = null
    const storage = { getItem: () => value, setItem: (_, text) => { value = text } }
    expect(saveCoachMemory([{ id: '1', text: 'Initial', kind: 'correction' }], storage)).toBe(true)
    expect(loadCoachMemory(storage)[0].text).toBe('Initial')
    saveCoachMemory([{ id: '1', text: 'Corrected', kind: 'correction' }], storage)
    expect(loadCoachMemory(storage)[0].text).toBe('Corrected')
    saveCoachMemory([], storage)
    expect(loadCoachMemory(storage)).toEqual([])
  })
  it('handles unavailable storage and bounds text', () => {
    const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('full') } }
    expect(loadCoachMemory(broken)).toEqual([])
    expect(saveCoachMemory([], broken)).toBe(false)
    expect(normalizeCoachMemory([{ id: '1', text: 'x'.repeat(1000) }])[0].text).toHaveLength(800)
  })
  const message = { role: 'assistant', content: 'Check [T1], not [T999].', evidence: { scopeLabel: 'MES / Live', matched: 1, included: 1, sources: [{ key: 'T1', kind: 'trade', tradeId: 't1', label: 'MES', detail: 'Recorded fields' }] } }
  it('preserves citation mappings through chat normalization', () => {
    const restored = normalizeCoachChatHistory([message])[0]
    expect(restored.evidence.sources).toEqual(message.evidence.sources)
  })
  it('renders valid trade buttons and flags invented references', () => {
    const html = renderToStaticMarkup(React.createElement(CoachEvidenceAnswer, { message, trades: [{ id: 't1' }] }))
    expect(html).toContain('Open trade')
    expect(html).toContain('T999')
    expect(html).toContain('(unverified)')
  })
  it('handles deleted trades without opening a different record', () => {
    const html = renderToStaticMarkup(React.createElement(CoachEvidenceAnswer, { message, trades: [] }))
    expect(html).toContain('Trade no longer available')
    expect(html).toContain('disabled=""')
  })
  it('does not imply a response with no citations has verified evidence', () => {
    const html = renderToStaticMarkup(React.createElement(CoachEvidenceAnswer, { message: { ...message, content: 'You always overtrade.' }, trades: [] }))
    expect(html).toContain('Treat this answer as unverified')
  })
})

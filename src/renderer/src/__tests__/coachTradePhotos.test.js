import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { coachPhotoTrades, listCoachPhotos, loadCoachPhoto } from '../coachTradePhotos.js'
import { CoachEvidenceAnswer } from '../components/CoachEvidence.jsx'
import { buildCoachEvidence, coachMessages } from '../coachEvidence.js'
import { normalizeCoachChatHistory } from '../coachChatHistory.js'

const photo = 'data:image/png;base64,aGVsbG8='
const trades = [{ id: 'a', symbol: 'MES', imageCount: 2 }, { id: 'b', symbol: 'NQ', imageCount: 1 }]
const sources = [
  { key: 'T1', kind: 'trade', tradeId: 'a', label: 'MES / 2026-10-01', detail: 'Recorded trade' },
  { key: 'T2', kind: 'trade', tradeId: 'b', label: 'NQ / 2026-10-02', detail: 'Recorded trade' },
]
const message = { role: 'assistant', content: 'Review [T1].', evidence: { sources, matched: 2, included: 2 } }

describe('coach trade screenshots', () => {
  it('selects only cited, supplied trades that still exist and have screenshots', () => {
    expect(coachPhotoTrades({ ...message, content: '[T1] [T999] [S1]' }, trades).map((item) => item.trade.id)).toEqual(['a'])
    expect(coachPhotoTrades(message, [])).toEqual([])
    expect(coachPhotoTrades(message, [{ ...trades[0], imageCount: 0 }])).toEqual([])
    expect(coachPhotoTrades({ content: '[T1]' }, trades)).toEqual([])
  })
  it('deduplicates multiple references to the same trade', () => {
    const duplicate = { ...sources[0], key: 'T3' }
    expect(coachPhotoTrades({ ...message, content: '[T1] [T3] [T1]', evidence: { sources: [...sources, duplicate] } }, trades)).toHaveLength(1)
  })
  it('reloads cited photos through persisted source IDs, without saving image bytes', () => {
    const restored = normalizeCoachChatHistory([{ ...message, photos: [photo], evidence: { ...message.evidence, dataUrl: photo } }])[0]
    expect(coachPhotoTrades(restored, trades)[0].trade.id).toBe('a')
    expect(JSON.stringify(restored)).not.toContain('data:image')
  })
  it('loads metadata only for the selected trade and rejects mismatched or duplicate rows', async () => {
    const api = { listImages: vi.fn().mockResolvedValue([
      { id: 'i1', tradeId: 'a', tag: 'Before', caption: 'Entry', dataUrl: photo },
      { id: 'i1', tradeId: 'a' }, { id: 'i2', tradeId: 'b' }, null,
    ]), getImage: vi.fn() }
    expect(await listCoachPhotos(api, 'a')).toEqual([{ id: 'i1', tag: 'Before', caption: 'Entry' }])
    expect(api.listImages).toHaveBeenCalledWith('a')
    expect(api.getImage).not.toHaveBeenCalled()
  })
  it('handles missing APIs, invalid lists, and removed attachments', async () => {
    await expect(listCoachPhotos({}, 'a')).rejects.toThrow('Open TradeHelp')
    await expect(listCoachPhotos({ listImages: async () => null, getImage() {} }, 'a')).rejects.toThrow('screenshot list')
    expect(await listCoachPhotos({ listImages: async () => [], getImage() {} }, 'a')).toEqual([])
    await expect(loadCoachPhoto({ getImage: async () => null }, 'a', 'i1')).rejects.toThrow('unavailable')
  })
  it('loads only an image belonging to the cited trade', async () => {
    const api = { getImage: vi.fn().mockResolvedValue({ id: 'i1', tradeId: 'a', dataUrl: photo }) }
    expect(await loadCoachPhoto(api, 'a', 'i1')).toBe(photo)
    expect(api.getImage).toHaveBeenCalledWith('i1')
    await expect(loadCoachPhoto(api, 'b', 'i1')).rejects.toThrow('unavailable')
    await expect(loadCoachPhoto(api, 'a', 'other')).rejects.toThrow('unavailable')
  })
  it.each(['https://example.com/chart.png', 'file:///private/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)'])('rejects unsafe or remote image source %s', async (dataUrl) => {
    await expect(loadCoachPhoto({ getImage: async () => ({ id: 'i1', tradeId: 'a', dataUrl }) }, 'a', 'i1')).rejects.toThrow('unavailable')
  })
  it('shows a labelled local-only gallery for cited trades, and none for unsupported references', () => {
    const html = renderToStaticMarkup(React.createElement(CoachEvidenceAnswer, { message, trades }))
    expect(html).toContain('Screenshots from cited trades')
    expect(html).toContain('not sent to or analysed by the coach')
    expect(html).toContain('MES / 2026-10-01')
    expect(html).not.toContain('NQ / 2026-10-02')
    const noPhotos = renderToStaticMarkup(React.createElement(CoachEvidenceAnswer, { message: { content: 'An answer [T999]' }, trades }))
    expect(noPhotos).not.toContain('th-coach-photos')
  })
  it('sends screenshot counts but never local image contents or paths to the model', () => {
    const request = buildCoachEvidence({ question: 'Show screenshots', trades: [{ ...trades[0], timestamp: '2026-10-01 10:00', pnl: 10, dataUrl: photo, file: 'PRIVATE_FILE.png' }] })
    expect(request.packet.trades[0].screenshotCount).toBe(2)
    const payload = JSON.stringify(coachMessages(request, 'Show screenshots'))
    expect(payload).not.toContain('data:image')
    expect(payload).not.toContain('PRIVATE_FILE')
    expect(request.system).toContain('Do not invent image URLs')
  })
  it('prioritizes photos within the requested scope before the sample is truncated', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({ id: String(i), symbol: 'MES', timestamp: '2026-10-01 10:00', imageCount: i === 89 ? 1 : 0, notes: 'x'.repeat(500) }))
    rows.push({ id: 'out-of-scope', symbol: 'NQ', timestamp: '2026-10-02 10:00', imageCount: 5 })
    const request = buildCoachEvidence({ question: 'Show MES screenshots', trades: rows, maxChars: 10000 })
    expect(request.evidence.sources.find((source) => source.key === 'T1').tradeId).toBe('89')
    expect(request.packet.coverage.matched).toBe(90)
    expect(request.packet.coverage.included).toBeLessThan(90)
    expect(request.packet.trades.every((trade) => trade.symbol === 'MES')).toBe(true)
  })
})

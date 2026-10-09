import { coachCitations } from './coachEvidence.js'

// Resolve only supplied citations against current journal records. Model text
// cannot nominate a file path, URL, or an unrelated attachment ID.
export function coachPhotoTrades(message, trades = []) {
  const current = new Map(trades.map((trade) => [String(trade.id), trade]))
  const seen = new Set()
  return coachCitations(message.content, message.evidence?.sources || []).valid.flatMap((source) => {
    const trade = source.kind === 'trade' && current.get(String(source.tradeId))
    if (!trade || seen.has(String(trade.id)) || !(Number(trade.imageCount) > 0)) return []
    seen.add(String(trade.id))
    return [{ source, trade }]
  })
}

export async function listCoachPhotos(api, tradeId) {
  if (!api?.listImages || !api?.getImage) throw new Error('Open TradeHelp to view local screenshots.')
  const rows = await api.listImages(tradeId)
  if (!Array.isArray(rows)) throw new Error('Could not load screenshot list.')
  const seen = new Set()
  return rows.filter((row) => {
    if (!row?.id || String(row.tradeId) !== String(tradeId) || seen.has(String(row.id))) return false
    seen.add(String(row.id))
    return true
  }).map(({ id, tag, caption }) => ({ id: String(id), tag: String(tag || '').slice(0, 80), caption: String(caption || '').slice(0, 500) }))
}

export async function loadCoachPhoto(api, tradeId, imageId) {
  const image = await api.getImage(imageId)
  if (!image || String(image.tradeId) !== String(tradeId) || String(image.id) !== String(imageId)
    || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(image.dataUrl || '')) {
    throw new Error('Screenshot unavailable. It may have been removed from this device.')
  }
  return image.dataUrl
}

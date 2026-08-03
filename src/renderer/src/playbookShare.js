// Playbook sharing — a JSON payload another TradeHelp user can import, plus a PNG
// card for posting publicly.
//
// An imported file arrives from someone else, so nothing inside it is trusted: every
// field is re-read, coerced to a string and length-capped here before it can reach the
// database, and a shared screenshot has to pass the same image allowlist the main
// process enforces on upload (notably: no SVG, which can carry script).

import { rounded, fitText } from './shareReport.js'

export const PLAYBOOK_SHARE_KIND = 'tradehelp.playbook'
export const PLAYBOOK_SHARE_VERSION = 1

const TEXT_FIELDS = ['name', 'description', 'criteria', 'invalidation', 'targets', 'notes']
const MAX_FIELD_CHARS = 4000
// Matches MAX_PLAYBOOK_IMAGES in the main process — a shared file must not be able to
// push more example charts into an entry than the app itself allows.
export const MAX_SHARED_IMAGES = 4
// Base64 runs ~4/3 the size of the bytes it encodes, so this caps a shared chart at
// roughly 6 MB of actual image — plenty for a screenshot, small enough that a hostile
// file can't wedge the app trying to parse it.
const MAX_SCREENSHOT_CHARS = 8 * 1024 * 1024
const SHARE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function cleanText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_FIELD_CHARS)
}

/** Returns the data URL when it is an allowed inline image, otherwise an empty string. */
export function safeSharedScreenshot(dataUrl) {
  const value = String(dataUrl || '')
  if (!value || value.length > MAX_SCREENSHOT_CHARS) return ''
  const match = value.match(/^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) return ''
  return SHARE_IMAGE_MIME.has(match[1].toLowerCase()) ? value : ''
}

export function buildPlaybookExport(entry = {}, images = []) {
  const setup = {}
  for (const field of TEXT_FIELDS) setup[field] = cleanText(entry[field])
  const screenshots = (Array.isArray(images) ? images : [images])
    .slice(0, MAX_SHARED_IMAGES)
    .map((image) => ({ tag: cleanText(image?.tag).slice(0, 60), dataUrl: safeSharedScreenshot(image?.dataUrl || image) }))
    .filter((image) => image.dataUrl)
  if (screenshots.length) setup.screenshots = screenshots
  return { kind: PLAYBOOK_SHARE_KIND, version: PLAYBOOK_SHARE_VERSION, exportedAt: new Date().toISOString(), setup }
}

export function playbookShareFilename(name, extension = 'json') {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `tradehelp-${slug || 'setup'}.${extension}`
}

/**
 * Reads an exported file back into a playbook entry.
 * Returns { ok: true, entry, droppedScreenshot } or { ok: false, error }.
 */
export function parsePlaybookImport(text) {
  let data
  try {
    data = JSON.parse(String(text || ''))
  } catch {
    return { ok: false, error: 'That file is not valid JSON — pick a setup exported from TradeHelp.' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'That file does not contain a shared setup.' }
  }
  if (data.kind !== PLAYBOOK_SHARE_KIND) {
    return { ok: false, error: 'That file is not a TradeHelp setup export.' }
  }
  if (Number(data.version) > PLAYBOOK_SHARE_VERSION) {
    return { ok: false, error: 'That setup was exported by a newer version of TradeHelp. Update, then import it again.' }
  }
  const source = data.setup && typeof data.setup === 'object' && !Array.isArray(data.setup) ? data.setup : {}
  const entry = {}
  for (const field of TEXT_FIELDS) entry[field] = cleanText(source[field])
  if (!entry.name) return { ok: false, error: 'That setup has no name, so there is nothing to import.' }

  const rawImages = Array.isArray(source.screenshots) ? source.screenshots.slice(0, MAX_SHARED_IMAGES) : []
  const images = rawImages
    .map((image) => ({ tag: cleanText(image?.tag).slice(0, 60), dataUrl: safeSharedScreenshot(image?.dataUrl) }))
    .filter((image) => image.dataUrl)
  entry.images = images
  // A rejected image should not block the rules — import the text and say so.
  return { ok: true, entry, droppedScreenshot: rawImages.length > images.length }
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = []
  for (const paragraph of String(text || '').split('\n')) {
    if (lines.length >= maxLines) break
    let current = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word
      if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; continue }
      if (current) lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    }
    if (current && lines.length < maxLines) lines.push(current)
  }
  if (lines.length === maxLines) lines[maxLines - 1] = fitText(ctx, lines[maxLines - 1], maxWidth)
  return lines
}

// Cover-fit: fill the slot and crop the overflow rather than squashing a chart to
// whatever aspect ratio the slot happens to be.
function drawCoverImage(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.width, h / image.height)
  const drawW = image.width * scale
  const drawH = image.height * scale
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 14)
  ctx.clip()
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH)
  ctx.restore()
}

/**
 * Draws a shareable setup card. `images` is an array of already-loaded
 * HTMLImageElements (nulls are ignored); a single element is also accepted.
 */
export function drawPlaybookCard(canvas, entry = {}, images = [], accent = '#F5B642') {
  const ctx = canvas.getContext('2d')
  canvas.width = 1080
  canvas.height = 1350
  const W = canvas.width
  const pad = 64
  const inner = W - pad * 2

  ctx.fillStyle = '#0E1117'
  ctx.fillRect(0, 0, W, canvas.height)
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, 12)

  ctx.fillStyle = '#E6EAF2'
  ctx.font = '700 38px Arial, sans-serif'
  ctx.fillText('TradeHelp', pad, 82)
  ctx.fillStyle = accent
  ctx.font = '700 18px Arial, sans-serif'
  ctx.fillText('PLAYBOOK SETUP', pad, 116)

  let y = 178
  ctx.fillStyle = '#E6EAF2'
  ctx.font = '800 60px Arial, sans-serif'
  for (const line of wrapLines(ctx, entry.name, inner, 2)) { ctx.fillText(line, pad, y); y += 66 }

  if (entry.description) {
    ctx.fillStyle = '#8A94A6'
    ctx.font = '24px Arial, sans-serif'
    for (const line of wrapLines(ctx, entry.description, inner, 2)) { ctx.fillText(line, pad, y + 6); y += 34 }
  }
  y += 26

  // The charts are the point of the card: one fills the width, several tile into a
  // grid so every example stays legible at posting size.
  const charts = (Array.isArray(images) ? images : [images])
    .filter((image) => image?.width && image?.height)
    .slice(0, MAX_SHARED_IMAGES)
  if (charts.length) {
    const gap = 14
    const columns = charts.length === 1 ? 1 : 2
    const rows = Math.ceil(charts.length / columns)
    const cellW = (inner - gap * (columns - 1)) / columns
    const cellH = charts.length === 1 ? 420 : rows === 1 ? 260 : 200
    charts.forEach((image, index) => {
      const x = pad + (index % columns) * (cellW + gap)
      const top = y + Math.floor(index / columns) * (cellH + gap)
      rounded(ctx, x, top, cellW, cellH, 14, '#151B26', '#2A3344')
      drawCoverImage(ctx, image, x, top, cellW, cellH)
    })
    y += rows * cellH + (rows - 1) * gap + 30
  }

  const blocks = [
    ['ENTRY CRITERIA', entry.criteria, accent],
    ['INVALIDATION', entry.invalidation, '#FB7185'],
    ['TARGETS', entry.targets, '#34D399']
  ].filter(([, value]) => value)

  const footerTop = canvas.height - 96
  for (const [label, value, color] of blocks) {
    ctx.font = '20px Arial, sans-serif'
    const lines = wrapLines(ctx, value, inner - 44, 4)
    const blockH = 54 + lines.length * 28
    if (y + blockH > footerTop - 16) break // stop cleanly rather than run under the footer
    rounded(ctx, pad, y, inner, blockH, 14, '#151B26', '#2A3344')
    ctx.fillStyle = color
    ctx.font = '700 16px Arial, sans-serif'
    ctx.fillText(label, pad + 22, y + 32)
    ctx.fillStyle = '#E6EAF2'
    ctx.font = '20px Arial, sans-serif'
    lines.forEach((line, index) => ctx.fillText(line, pad + 22, y + 62 + index * 28))
    y += blockH + 16
  }

  ctx.fillStyle = '#5A6478'
  ctx.font = '18px Arial, sans-serif'
  ctx.fillText('Local-first trading journal · trade-help.app', pad, canvas.height - 52)
  return canvas
}

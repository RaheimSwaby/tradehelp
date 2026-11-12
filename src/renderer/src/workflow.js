// Trading math (instruments, sizing, R, plan scoring, sessions, fingerprints) lives in
// @tradehelp/core so the desktop app, the mobile app, and other TradeHelp tools share one
// implementation. This module re-exports it and keeps the browser-only canvas helper here.
import { dHashFromRgba } from '../../../packages/core/src/workflow.js'

export * from '../../../packages/core/src/workflow.js'

export async function dHashDataUrl(dataUrl) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('Chart fingerprinting requires a browser canvas')
  const image = await new Promise((resolve, reject) => {
    const candidate = new Image()
    candidate.onload = () => resolve(candidate)
    candidate.onerror = () => reject(new Error('Could not decode screenshot'))
    candidate.src = String(dataUrl || '')
  })
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable')
  context.drawImage(image, 0, 0, 9, 8)
  return dHashFromRgba(context.getImageData(0, 0, 9, 8).data)
}

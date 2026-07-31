import React from 'react'
import { T, mono } from '../theme.js'

const BLOCK_START = /^(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+|>\s+)/
const INLINE_MARKUP = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g

function hideUnmatchedStrongMarker(value, marker) {
  const text = String(value || '')
  const count = text.split(marker).length - 1
  if (count % 2 === 0) return text
  const last = text.lastIndexOf(marker)
  return `${text.slice(0, last)}${text.slice(last + marker.length)}`
}

function renderInline(value, keyPrefix) {
  const safeValue = hideUnmatchedStrongMarker(hideUnmatchedStrongMarker(value, '**'), '__')
  return safeValue.split(INLINE_MARKUP).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded px-1 py-0.5 text-[0.92em]" style={{ ...mono, color: T.accent, background: T.surface2 }}>{part.slice(1, -1)}</code>
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key} style={{ color: T.text }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

export function parseCompactMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (!line) { index += 1; continue }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].replace(/\s+#+$/, '') })
      index += 1
      continue
    }

    const unordered = line.match(/^[-+*]\s+(.+)$/)
    if (unordered) {
      const items = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-+*]\s+(.+)$/)
        if (!item) break
        items.push(item[1])
        index += 1
      }
      blocks.push({ type: 'unordered-list', items })
      continue
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (ordered) {
      const items = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+[.)]\s+(.+)$/)
        if (!item) break
        items.push(item[1])
        index += 1
      }
      blocks.push({ type: 'ordered-list', items })
      continue
    }

    const quote = line.match(/^>\s+(.+)$/)
    if (quote) {
      const parts = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^>\s+(.+)$/)
        if (!item) break
        parts.push(item[1])
        index += 1
      }
      blocks.push({ type: 'quote', text: parts.join(' ') })
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index].trim()
      if (!next || BLOCK_START.test(next)) break
      paragraph.push(next)
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

export function CompactMarkdown({ children, className = '' }) {
  const blocks = parseCompactMarkdown(children)

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`.trim()} style={{ color: T.dim }}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`
        if (block.type === 'heading') {
          const headingClass = block.level <= 2 ? 'text-sm font-semibold pt-1' : 'text-xs font-semibold uppercase tracking-wide pt-1'
          return <div key={key} className={headingClass} style={{ color: block.level <= 2 ? T.text : T.accent }}>{renderInline(block.text, key)}</div>
        }
        if (block.type === 'unordered-list' || block.type === 'ordered-list') {
          const Tag = block.type === 'ordered-list' ? 'ol' : 'ul'
          return (
            <Tag key={key} className={`${block.type === 'ordered-list' ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}
            </Tag>
          )
        }
        if (block.type === 'quote') {
          return <blockquote key={key} className="pl-3 py-0.5" style={{ borderLeft: `2px solid ${T.accent}`, color: T.text }}>{renderInline(block.text, key)}</blockquote>
        }
        return <p key={key}>{renderInline(block.text, key)}</p>
      })}
    </div>
  )
}

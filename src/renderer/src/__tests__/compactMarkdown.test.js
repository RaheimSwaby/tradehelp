import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CompactMarkdown, parseCompactMarkdown } from '../components/CompactMarkdown.jsx'

describe('CompactMarkdown', () => {
  it('parses the compact headings, emphasis, and lists used by coach briefs', () => {
    expect(parseCompactMarkdown('### Daily brief\n\n**Keep:** Stops respected\n- Wait for confirmation\n- Protect `max loss`')).toEqual([
      { type: 'heading', level: 3, text: 'Daily brief' },
      { type: 'paragraph', text: '**Keep:** Stops respected' },
      { type: 'unordered-list', items: ['Wait for confirmation', 'Protect `max loss`'] }
    ])
  })

  it('renders markup as React elements while escaping raw HTML', () => {
    const html = renderToStaticMarkup(
      React.createElement(CompactMarkdown, null, '## Focus\n\n**Protect capital**\n\n- **Rule:** Wait for confirmation\n\n<img src=x onerror=alert(1)>')
    )

    expect(html).toContain('<strong')
    expect(html).toContain('Protect capital</strong>')
    expect(html).toContain('Rule:</strong> Wait for confirmation')
    expect(html).not.toContain('**')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
  })

  it('hides an unmatched strong marker while a streamed response is incomplete', () => {
    const html = renderToStaticMarkup(
      React.createElement(CompactMarkdown, null, '- **Rule still streaming')
    )

    expect(html).toContain('Rule still streaming')
    expect(html).not.toContain('**')
  })
})

import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X, Search, ChevronDown, ChevronRight, MessagesSquare } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { HELP_SECTIONS, searchHelp, helpItemCount } from '../helpContent.js'

// Bundled help panel. Portalled to the body so it centres over the tab content
// (the .th-fade tab wrapper is a containing block for fixed positioning).
export function HelpModal({ onClose }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState({})
  const sections = useMemo(() => searchHelp(query), [query])
  const searching = query.trim().length > 0
  const matches = helpItemCount(sections)

  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }))

  return createPortal(
    <div className="th-overlay fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }} onClick={(event) => event.stopPropagation()}>

        <div className="flex items-center gap-2 px-5 pt-5">
          <HelpCircle size={18} style={{ color: T.accent }} />
          <div>
            <div className="text-sm font-semibold">Help &amp; FAQ</div>
            <div className="text-xs" style={{ color: T.faint }}>How each feature works — available offline.</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto" style={{ color: T.faint }} aria-label="Close help"><X size={18} /></button>
        </div>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search size={13} style={{ color: T.faint, position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              style={inputStyle}
              className="w-full rounded pl-7 pr-2 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help — try “leak”, “prop”, “model”, “backup”…"
            />
          </div>
          {searching && (
            <div className="text-xs mt-1.5" style={{ color: T.faint }}>
              {matches === 0 ? 'No matches.' : `${matches} result${matches === 1 ? '' : 's'}`}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 overflow-y-auto">
          {sections.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: T.dim }}>
              Nothing matched “{query.trim()}”. Try a simpler word, or ask in the Discord below.
            </div>
          ) : sections.map((section) => (
            <div key={section.id} className="mt-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: T.accent }}>{section.title}</div>
              <div className="space-y-1.5">
                {section.items.map((item, index) => {
                  const key = `${section.id}:${index}`
                  // While searching, show answers straight away — hunting through
                  // collapsed rows defeats the point of a search box.
                  const isOpen = searching || expanded[key]
                  return (
                    <div key={key} className="rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        className="w-full flex items-start gap-2 text-left px-3 py-2.5"
                        aria-expanded={Boolean(isOpen)}
                      >
                        {isOpen ? <ChevronDown size={14} style={{ color: T.accent, flexShrink: 0, marginTop: 2 }} /> : <ChevronRight size={14} style={{ color: T.faint, flexShrink: 0, marginTop: 2 }} />}
                        <span className="text-sm font-medium">{item.q}</span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 pl-8 text-xs leading-relaxed" style={{ color: T.dim }}>{item.a}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="mt-5 rounded-lg px-3 py-2.5 flex items-center gap-2" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            <MessagesSquare size={15} style={{ color: T.accent, flexShrink: 0 }} />
            <span className="text-xs" style={{ color: T.dim }}>Still stuck, or think something is missing here?</span>
            <button
              type="button"
              onClick={() => window.api?.openExternal?.('https://discord.gg/ATfcXSD4j')}
              className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-md whitespace-nowrap"
              style={{ background: T.accent, color: '#1A1306' }}
            >Ask in Discord</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

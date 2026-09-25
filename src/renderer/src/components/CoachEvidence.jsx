import React from 'react'
import { coachCitations } from '../coachEvidence.js'
import { CompactMarkdown } from './CompactMarkdown.jsx'

export function CoachEvidenceAnswer({ message, trades, onOpenTrade }) {
  const sources = message.evidence?.sources || []
  const citations = coachCitations(message.content, sources)
  const byId = new Map(trades.map((trade) => [String(trade.id), trade]))
  const renderReference = (token) => {
    const source = sources.find((item) => `[${item.key}]` === token)
    if (!source) return <span title="Reference was not supplied to the coach">{token} (unverified)</span>
    const trade = source.kind === 'trade' ? byId.get(source.tradeId) : null
    if (trade) return <button type="button" className="th-coach-citation" title={`${source.label}: open trade`} onClick={() => onOpenTrade?.(trade)}>{token}</button>
    return <span title={`${source.label}: ${source.detail}${source.kind === 'trade' ? ' (Trade no longer available)' : ''}`}>{token}</span>
  }
  return <>
    {message.evidenceFallback && <p className="text-xs mb-2" role="status">The model response did not pass evidence checks. Showing recorded facts instead.</p>}
    <CompactMarkdown renderReference={message.evidence ? renderReference : undefined}>{message.content}</CompactMarkdown>
    {message.evidence && <details className="th-coach-evidence"><summary>Evidence / {message.evidence.included} examples of {message.evidence.matched} matching trades</summary>
      <p>{message.evidence.scopeLabel}</p>
      {message.evidence.memoryTotal > 0 && <p>{message.evidence.memoryUsed} of {message.evidence.memoryTotal} approved memories included.</p>}
      <p>References link to supplied records, not proof of the coach's interpretation.</p>
      {!citations.valid.length && <p>No supplied sources were cited. Treat this answer as unverified.</p>}
      {citations.invalid.length > 0 && <p role="status">Unrecognized references: {citations.invalid.join(', ')}</p>}
      {citations.valid.map((source) => <div key={source.key}><strong>[{source.key}] {source.label}</strong><p>{source.detail}</p>{source.kind === 'trade' && <button type="button" disabled={!byId.has(source.tradeId)} onClick={() => onOpenTrade?.(byId.get(source.tradeId))}>{byId.has(source.tradeId) ? 'Open trade' : 'Trade no longer available'}</button>}</div>)}
    </details>}
  </>
}

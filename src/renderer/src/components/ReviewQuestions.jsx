import React, { useState } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { fmt$ } from '../utils.js'
import { CommitmentModal } from './CoachCommitmentCard.jsx'

function Evidence({ trades, onOpenTrade }) {
  return <details className="th-review-evidence"><summary>Supporting trades ({trades.length})</summary>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th>Date / market</th><th>Recorded reason</th><th>Net P&amp;L</th><th /></tr></thead>
      <tbody>{trades.map((trade) => <tr key={trade.id}><td>{trade.timestamp}<br /><strong>{trade.symbol}</strong></td><td>{trade.reason || 'Not recorded'}</td><td style={{ color: Number(trade.pnl) < 0 ? T.down : T.up }}>{fmt$(Number(trade.pnl) || 0)}</td><td><button type="button" onClick={() => onOpenTrade(trade)} title="Open trade" aria-label={`Open ${trade.symbol} trade ${trade.timestamp}`}><ArrowUpRight size={16} /></button></td></tr>)}</tbody></table></div>
  </details>
}

function Finding({ finding, responses, onResponse, onOpenTrade, positive }) {
  if (!finding) return <p style={{ color: T.dim }}>Not enough recorded reasons to identify {positive ? 'a repeatable strength' : 'an execution issue'}. Missing notes are not a verdict on your trading.</p>
  const response = responses[finding.id] || {}
  return <>
    <h3>{finding.title}</h3>
    <p style={{ color: T.dim }}>{finding.count} {finding.count === 1 ? 'trade carries' : 'trades carry'} this reason. {finding.source}; not independently verified.{finding.count < 3 ? ' Small sample: treat this as a review candidate, not an established pattern.' : ''}</p>
    <Evidence trades={finding.trades} onOpenTrade={onOpenTrade} />
    <div className="th-review-verdict" role="group" aria-label={`Response to ${finding.title}`}>
      {[['agreed', 'Agree'], ['context', 'Add context'], ['dismissed', 'Dismiss']].map(([value, label]) => <button type="button" key={value} aria-pressed={response.status === value} onClick={() => onResponse(finding.id, { ...response, status: value })}>{label}</button>)}
    </div>
    {response.status === 'context' && <textarea aria-label={`Context for ${finding.title}`} style={inputStyle} className="w-full rounded p-2 text-sm mt-2" rows={3} value={response.context || ''} onChange={(event) => onResponse(finding.id, { ...response, context: event.target.value })} />}
    {response.status === 'dismissed' && <p className="text-xs" style={{ color: T.faint }}>Dismissed from your focus. The recorded evidence stays available.</p>}
  </>
}

export function ReviewQuestions({ feedback, responses, onResponse, commitments, onAddCommitment, onOpenTrade, periodLabel }) {
  const [creating, setCreating] = useState(false)
  const active = commitments.find((item) => item.status === 'active')
  return <section className="th-review-questions" aria-label="Decision review">
    <div className="th-review-questions-heading"><h2>Decisions worth reviewing</h2><span>{feedback.taggedCount}/{feedback.total} trades have recognized reasons</span></div>
    <div className="th-review-question-grid">
      <section className="th-review-question"><div className="th-review-question-label">01 / Repeat</div><h2>What should I repeat?</h2><Finding finding={feedback.repeat} responses={responses} onResponse={onResponse} onOpenTrade={onOpenTrade} positive /></section>
      <section className="th-review-question"><div className="th-review-question-label">02 / Adjust</div><h2>What needs attention?</h2><Finding finding={feedback.attention} responses={responses} onResponse={onResponse} onOpenTrade={onOpenTrade} /></section>
      <section className="th-review-question"><div className="th-review-question-label">03 / Follow-through</div><h2>Did I follow my last commitment?</h2>
        {!feedback.commitments.length ? <p style={{ color: T.dim }}>No commitment results linked to trades in {periodLabel}. This period has not been assessed.</p> : feedback.commitments.map((item) => <div key={item.id} className="th-review-commitment"><h3>{item.title}</h3><p><span style={{ color: T.up }}>{item.followed} followed</span> / <span style={{ color: T.down }}>{item.missed} missed</span> / {item.unresolved} unresolved</p><details className="th-review-evidence"><summary>Checks in this period ({item.results.length})</summary>{item.results.map((result) => <div className="th-review-check" key={result.tradeId}><button type="button" onClick={() => onOpenTrade(result.trade)}>{result.trade.symbol} / {result.trade.timestamp} <ArrowUpRight size={12} /></button><span>{result.status} / {result.source === 'manual' ? 'Your assessment' : 'Recorded-field check'}</span><p>{result.status === 'unresolved' ? 'Required information is missing; no conclusion about adherence.' : result.detail}</p></div>)}</details></div>)}
      </section>
      <section className="th-review-question"><div className="th-review-question-label">04 / Next session</div><h2>What should I practice?</h2>
        <h3>{active ? active.title : 'Choose one measurable behavior.'}</h3><p style={{ color: T.dim }}>{active ? `${active.evaluatedCount}/${active.targetCount} trades checked overall. Review-period results are shown separately.` : 'Set the rule and the number of trades. Judge adherence separately from whether those trades win.'}</p>
        <button type="button" className="th-review-start" onClick={() => setCreating(true)} disabled={!onAddCommitment}><Plus size={14} />{active ? 'Choose a new commitment' : 'Choose a commitment'}</button>
        {active && <p className="text-xs" style={{ color: T.faint }}>Starting a new commitment archives the current one; its history is retained.</p>}
      </section>
    </div>
    {creating && <CommitmentModal source={`review:${periodLabel}`} onClose={() => setCreating(false)} onSave={onAddCommitment} />}
  </section>
}

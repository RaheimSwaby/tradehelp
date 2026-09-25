import React from 'react'
import { decisionEvidence } from '../decisionEvidence.js'

export function DecisionEvidence({ trades, plans, previousTrades, previousLabel, onOpenTrade }) {
  const current = decisionEvidence(trades, plans)
  const previous = previousTrades ? decisionEvidence(previousTrades, plans) : null
  const matchedLosses = current.rows.filter(({ trade, checks }) => trade.pnl != null && trade.pnl !== '' && Number(trade.pnl) < 0 && checks.every((check) => check.status === 'matched'))
  const differentWins = current.rows.filter(({ trade, checks }) => Number(trade.pnl) > 0 && checks.some((check) => check.status === 'different'))
  return <section className="th-decision-evidence">
    <h2>Plan versus execution</h2>
    <p>{current.linked}/{current.total} trades have a linked plan locked before entry. Differences describe recorded fields, not whether a decision was good or bad.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Recorded field</th><th>Matched</th><th>Different</th><th>Unknown</th>{previous && <th>{previousLabel}: matched / assessed</th>}</tr></thead>
      <tbody>{current.metrics.map((metric, index) => <tr key={metric.label}><th>{metric.label}</th><td>{metric.matched}</td><td>{metric.different}</td><td>{metric.unknown}</td>{previous && <td>{previous.metrics[index].matched} / {previous.metrics[index].matched + previous.metrics[index].different}</td>}</tr>)}</tbody></table></div>
    <p>{matchedLosses.length} losing trades matched all four recorded plan fields. {differentWins.length} winning trades differed on at least one field. Neither outcome establishes decision quality.</p>
    {(matchedLosses.length > 0 || differentWins.length > 0) && <details><summary>Separate execution from outcome</summary>{[...matchedLosses, ...differentWins].map(({ trade }) => <div className="th-evidence-row" key={trade.id}><button type="button" onClick={() => onOpenTrade?.(trade)}>{trade.symbol} / {trade.timestamp}</button> / {Number(trade.pnl) < 0 ? 'Matched plan fields, losing outcome' : 'Different plan fields, winning outcome'}</div>)}</details>}
    <details><summary>Inspect supporting trades ({current.rows.length})</summary>
      {current.rows.map(({ trade, plan, checks }) => <div key={trade.id} className="th-evidence-row">
        <button type="button" onClick={() => onOpenTrade?.(trade)}>{trade.symbol} / {trade.timestamp}</button>
        {!plan ? <p>No verified pre-entry plan link.</p> : <ul>{checks.map((check) => <li key={check.label}>{check.label}: {check.planned ?? 'Missing'} planned / {check.actual ?? 'Missing'} recorded ({check.status})</li>)}</ul>}
      </div>)}
    </details>
  </section>
}

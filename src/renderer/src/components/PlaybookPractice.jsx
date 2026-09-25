import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, RefreshCw } from 'lucide-react'
import { practiceExamples } from '../decisionEvidence.js'
import { PlanComparison } from './DayReplayModal.jsx'
import { fmt$ } from '../utils.js'

export function PlaybookPractice({ entry, trades, plans, onClose }) {
  const examples = useMemo(() => practiceExamples(entry, trades, plans), [entry, trades, plans])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [criteria, setCriteria] = useState('')
  const [invalidation, setInvalidation] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const example = examples[index]
  useEffect(() => {
    let live = true
    setImage(''); setError('')
    if (!example) return
    Promise.resolve().then(() => window.api.getTradePlanScreenshot(example.plan.id)).then((result) => {
      if (!result?.dataUrl) throw new Error('Screenshot unavailable')
      if (live) setImage(result.dataUrl)
    }).catch(() => { if (live) setError('Could not load this plan screenshot.') })
    return () => { live = false }
  }, [example, retry])
  function next(assessment) {
    setResults((current) => [...current, { tradeId: example.trade.id, answer, criteria, invalidation, assessment }])
    setIndex((current) => current + 1)
    setAnswer(''); setCriteria(''); setInvalidation(''); setRevealed(false)
  }
  return <section className="th-practice th-page">
    <header><button type="button" onClick={onClose}><ArrowLeft size={16} /> Playbook</button><h2>{entry.name} / Practice</h2><span>{results.length} reviewed this session</span></header>
    {!example ? <div className="py-6"><h3>{examples.length ? 'Practice complete' : 'No eligible examples yet'}</h3>
      <p>{examples.length ? `${results.filter((result) => result.assessment === 'matched').length} self-assessed matches; ${results.filter((result) => result.assessment === 'different').length} to revisit; ${results.filter((result) => result.assessment === 'unclear').length} uncertain; ${skipped} skipped.` : 'This setup needs a linked trade and a plan screenshot locked before the recorded entry time.'}</p>
      {results.map((result, i) => <details key={result.tradeId}><summary>Example {i + 1}: {result.assessment}</summary><p>{result.answer} / {result.criteria}</p><p>Invalidation: {result.invalidation}</p></details>)}
    </div> : <>
      <div className="th-practice-columns"><div>
        {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} /> Retry</button></p> : image ? <img src={image} alt="Stored pre-entry plan screenshot" /> : <p role="status">Loading screenshot...</p>}
        <p>Example {index + 1} of {examples.length} / Stored pre-entry screenshot</p>
        {!revealed && <button type="button" onClick={() => { setSkipped((value) => value + 1); setIndex((value) => value + 1); setAnswer(''); setCriteria(''); setInvalidation('') }}>Skip unusable or outcome-revealing image<ArrowRight size={14} /></button>}
      </div><div>
        <h3>Current setup criteria</h3><p className="whitespace-pre-wrap">{entry.criteria || 'No criteria recorded for this setup.'}</p>
        <fieldset disabled={revealed}><legend>Would you take this setup?</legend>
          {['Take', 'Pass', 'Unclear'].map((value) => <label key={value}><input type="radio" name="practice-choice" checked={answer === value} onChange={() => setAnswer(value)} /> {value}</label>)}
          <label>Which criteria are met?<textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={3} /></label>
          <label>What invalidates it?<textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} rows={3} /></label>
        </fieldset>
        {!revealed && <button type="button" disabled={!image || !answer || !criteria.trim() || !invalidation.trim()} onClick={() => setRevealed(true)}><Eye size={16} /> Reveal recorded trade</button>}
      </div></div>
      {revealed && <section className="th-practice-result"><h3>Recorded trade / {example.trade.symbol} / {fmt$(Number(example.trade.pnl) || 0)}</h3>
        <p>Saved invalidation: {example.plan.invalidation || 'Not recorded'}</p>
        <PlanComparison plan={example.plan} trade={example.trade} />
        <fieldset><legend>How did your reasoning compare? Self-assessment, not a prediction score.</legend>
          {[['matched', 'Matched'], ['different', 'Revisit'], ['unclear', 'Uncertain']].map(([value, label]) => <button type="button" key={value} onClick={() => next(value)}>{label}<ArrowRight size={14} /></button>)}
        </fieldset>
      </section>}
    </>}
  </section>
}

import React, { useState, useEffect, useMemo } from 'react'
import { ScanSearch } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { toJpeg, streamChat } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'

/* ───────── patterns: cross-trade chart comparison ───────── */
// Cross-trade comparison runs in two passes so it works on weak local models too:
// 1) describe each chart on its own, then 2) compare the descriptions as text.
const CHART_DESCRIBE_SYSTEM = `You are a chart analyst. In 1-2 sentences, state ONLY what is visible in this trading chart: trend direction, notable levels, candle structure, and where price sits in its recent range. Be factual and concise. No advice, no predictions.`
const COMPARE_SYSTEM = `You are a trading coach. You are given short factual descriptions of a trader's WINNING chart setups and, separately, their LOSING ones. Compare the two groups: what do the winners share, what recurring condition or mistake shows up in the losers, the single clearest visual difference, and ONE concrete rule to add to their pre-trade checklist. Give 2-4 specific points, then the rule. Under ~180 words. No price predictions or buy/sell calls.`

export function Patterns({ trades }) {
  const withPics = useMemo(() => trades.filter((t) => (t.imageCount || 0) > 0), [trades])
  const setups = useMemo(() => ['All setups', ...Array.from(new Set(withPics.map((t) => t.setup).filter(Boolean)))], [withPics])
  const [setup, setSetup] = useState('All setups')
  const [state, setState] = useState(null)
  useEffect(() => { setState(null) }, [setup])

  const pool = useMemo(() => withPics.filter((t) => setup === 'All setups' || t.setup === setup), [withPics, setup])
  const winners = pool.filter((t) => (Number(t.pnl) || 0) >= 0)
  const losers = pool.filter((t) => (Number(t.pnl) || 0) < 0)
  const MAX = 3
  const ready = winners.length > 0 && losers.length > 0
  const reading = state?.phase === 'reading'

  async function firstJpeg(id) {
    const metas = await window.api.listImages(id)
    if (!metas?.length) return null
    const img = await window.api.getImage(metas[0].id)
    return img?.dataUrl ? await toJpeg(img.dataUrl) : null
  }

  async function run() {
    if (reading || !window.api?.aiChat) return
    const byRecent = (a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')
    const picks = [
      ...[...winners].sort(byRecent).slice(0, MAX).map((t) => ['win', t]),
      ...[...losers].sort(byRecent).slice(0, MAX).map((t) => ['loss', t])
    ]
    setState({ phase: 'reading', done: 0, total: picks.length })
    try {
      const wins = [], losses = []
      let winsRead = 0, lossesRead = 0, lastErr = ''
      for (const [side, t] of picks) {
        const url = await firstJpeg(t.id)
        let desc = '(no image)'
        if (url) {
          const res = await window.api.aiChat({ system: CHART_DESCRIBE_SYSTEM, messages: [{ role: 'user', content: `Describe this ${t.symbol} ${t.setup || ''} chart.`, images: [url] }] })
          if (res?.ok) { desc = res.text; if (side === 'win') winsRead++; else lossesRead++ }
          else { lastErr = res?.error || 'error'; desc = `(couldn't read: ${lastErr})` }
        }
        ;(side === 'win' ? wins : losses).push({ symbol: t.symbol, dataUrl: url, desc })
        setState((s) => (s?.phase === 'reading' ? { ...s, done: s.done + 1 } : s))
      }
      // If the model couldn't actually read the charts, stop here. Feeding the error
      // text into the comparison makes the coach "analyze" its own error message
      // (the classic "multimodal not supported" nonsense). Show an actionable fix.
      if (winsRead === 0 || lossesRead === 0) {
        const visionErr = /multimodal|does not support|vision|image/i.test(lastErr)
        setState({ wins, losses, error: visionErr
          ? 'Your AI model can\'t read chart images. In Settings → Model provider, set a vision model — e.g. "llama3.2-vision" (then run: ollama pull llama3.2-vision) — or use a cloud key with a vision-capable model like gpt-4o-mini.'
          : `Couldn't read enough charts to compare${lastErr ? ` — ${lastErr}` : '.'}` })
        return
      }
      const block = (label, arr) => `${label}:\n` + arr.map((x, i) => `${i + 1}. ${x.symbol}: ${x.desc}`).join('\n')
      const tag = setup === 'All setups' ? '' : ` ${setup}`
      const summary = `${block(`WINNING${tag} trades`, wins)}\n\n${block(`LOSING${tag} trades`, losses)}`
      setState({ wins, losses, text: '' })
      let acc = ''
      await streamChat({ system: COMPARE_SYSTEM, messages: [{ role: 'user', content: summary }] }, (d) => { acc += d; setState((s) => ({ ...s, text: acc })) })
    } catch (e) {
      setState((s) => ({ ...(s && s.wins ? s : {}), error: String(e?.message || e) }))
    }
  }

  if (withPics.length === 0) {
    return <Panel title="Pattern finder"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Attach chart screenshots to a few winning and losing trades, then come back — this finds what separates them.</div></Panel>
  }

  const Thumbs = ({ title, arr, color }) => (
    <div>
      <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color }}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {arr.map((x, i) => (
          <div key={i} className="rounded overflow-hidden" style={{ border: `1px solid ${color}`, width: 130 }} title={x.desc}>
            {x.dataUrl ? <img src={x.dataUrl} alt="" className="w-full" style={{ height: 70, objectFit: 'cover' }} /> : <div style={{ height: 70, background: T.surface2 }} />}
            <div className="px-1.5 py-0.5 text-xs truncate" style={{ color: T.dim, background: T.surface2 }}>{x.symbol}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <Panel title="Compare winners vs losers">
        <p className="text-sm mb-3" style={{ color: T.dim }}>
          The AI reads up to {MAX} winning and {MAX} losing charts for a setup, then tells you what visually separates them. Runs on your machine — the read is as good as your vision model (best with llama3.2-vision or a cloud key).
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Setup">
            <select style={inputStyle} className="rounded px-2 py-1.5 text-sm" value={setup} onChange={(e) => setSetup(e.target.value)}>
              {setups.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <div className="text-xs pb-2" style={{ color: T.faint }}>
            <span style={{ color: T.up }}>{winners.length} win{winners.length === 1 ? '' : 's'}</span> · <span style={{ color: T.down }}>{losers.length} loss{losers.length === 1 ? '' : 'es'}</span> with screenshots
          </div>
          <button type="button" onClick={run} disabled={!ready || reading}
            className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold"
            style={{ background: T.accent, color: '#1A1306', opacity: (!ready || reading) ? 0.5 : 1 }}>
            <ScanSearch size={15} /> {reading ? `Reading ${state.done}/${state.total}…` : 'Find patterns'}
          </button>
        </div>
        {!ready && <div className="text-xs mt-2" style={{ color: T.faint }}>Need at least one winning and one losing trade with a screenshot{setup === 'All setups' ? '' : ' for this setup'}.</div>}
      </Panel>

      {state?.wins && (
        <Panel title="Charts compared">
          <div className="space-y-3">
            <Thumbs title="Winners" arr={state.wins} color={T.up} />
            <Thumbs title="Losers" arr={state.losses} color={T.down} />
          </div>
        </Panel>
      )}

      {state && (state.text || state.error) && (
        <Panel title="What separates them">
          {state.error
            ? <div className="text-sm" style={{ color: T.down }}>⚠︎ {state.error}</div>
            : <div className="text-sm whitespace-pre-wrap" style={{ color: '#F3D9A0' }}>{state.text}</div>}
          {state.text && <div className="text-xs mt-2" style={{ color: T.faint }}>AI pattern read · not financial advice</div>}
        </Panel>
      )}
    </div>
  )
}

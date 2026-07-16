import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ScanSearch, X } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { fmt$, toJpeg, streamChat } from '../utils.js'
import { Panel, Field } from '../components/Shared.jsx'
import { SimilarCharts } from '../components/SimilarCharts.jsx'

/* ───────── patterns: cross-trade chart comparison ───────── */
// Cross-trade comparison runs in two passes so it works on weak local models too:
// 1) describe each chart on its own, then 2) compare the descriptions as text.
const CHART_DESCRIBE_SYSTEM = `You are a chart analyst. In 1-2 sentences, state ONLY what is visible in this trading chart: trend direction, notable levels, candle structure, and where price sits in its recent range. Be factual and concise. No advice, no predictions.`
const COMPARE_SYSTEM = `You are a trading coach. You are given short factual descriptions of a trader's WINNING chart setups and, separately, their LOSING ones. Compare the two groups: what do the winners share, what recurring condition or mistake shows up in the losers, the single clearest visual difference, and ONE concrete rule to add to their pre-trade checklist. Give 2-4 specific points, then the rule. Under ~180 words. No price predictions or buy/sell calls.`

export function Patterns({ trades, onOpenTrade }) {
  const withPics = useMemo(() => trades.filter((t) => (t.imageCount || 0) > 0), [trades])
  const setups = useMemo(() => ['All setups', ...Array.from(new Set(withPics.map((t) => t.setup).filter(Boolean)))], [withPics])
  const [setup, setSetup] = useState('All setups')
  const [state, setState] = useState(null)
  const [zoom, setZoom] = useState(null)
  useEffect(() => { setState(null) }, [setup])

  const pool = useMemo(() => withPics.filter((t) => setup === 'All setups' || t.setup === setup), [withPics, setup])
  const winners = pool.filter((t) => (Number(t.pnl) || 0) >= 0)
  const losers = pool.filter((t) => (Number(t.pnl) || 0) < 0)
  const MAX = 3
  const ready = winners.length > 0 && losers.length > 0
  const reading = state?.phase === 'reading'

  async function firstImage(id) {
    const metas = await window.api.listImages(id)
    if (!metas?.length) return null
    const img = await window.api.getImage(metas[0].id)
    return img?.dataUrl ? { ...img, jpeg: await toJpeg(img.dataUrl) } : null
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
        const image = await firstImage(t.id)
        const url = image?.jpeg
        let desc = '(no image)'
        if (url) {
          const res = await window.api.aiChat({ system: CHART_DESCRIBE_SYSTEM, messages: [{ role: 'user', content: `Describe this ${t.symbol} ${t.setup || ''} chart.`, images: [url] }] })
          if (res?.ok) { desc = res.text; if (side === 'win') winsRead++; else lossesRead++ }
          else { lastErr = res?.error || 'error'; desc = `(couldn't read: ${lastErr})` }
        }
        ;(side === 'win' ? wins : losses).push({
          tradeId: t.id,
          symbol: t.symbol,
          setup: t.setup,
          timestamp: t.timestamp,
          pnl: Number(t.pnl) || 0,
          imageTag: image?.tag || '',
          dataUrl: image?.dataUrl || '',
          desc
        })
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

  const dateLabel = (ts) => {
    const s = String(ts || '')
    if (!s) return 'No date'
    const d = new Date(s.replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return s.slice(0, 16)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const Thumbs = ({ title, arr, color }) => (
    <div>
      <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color }}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {arr.map((x, i) => (
          <button key={x.tradeId || i} type="button"
            onClick={() => x.dataUrl && setZoom(x)}
            className="rounded overflow-hidden text-left"
            style={{ border: `1px solid ${color}`, width: 156, background: T.surface2, cursor: x.dataUrl ? 'zoom-in' : 'default' }}
            title={`${dateLabel(x.timestamp)} · ${fmt$(x.pnl)}\n${x.desc}`}>
            {x.dataUrl ? <img src={x.dataUrl} alt={`${x.symbol} chart`} className="w-full" style={{ height: 82, objectFit: 'cover', background: '#000' }} /> : <div style={{ height: 82, background: T.surface2 }} />}
            <div className="px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold truncate" style={{ color: T.text }}>{x.symbol}</span>
                <span className="text-[10px] shrink-0" style={{ color: x.pnl >= 0 ? T.up : T.down }}>{fmt$(x.pnl)}</span>
              </div>
              <div className="text-[10px] truncate mt-0.5" style={{ color: T.dim }}>{dateLabel(x.timestamp)}</div>
              {(x.setup || x.imageTag) && <div className="text-[10px] truncate mt-0.5" style={{ color: T.faint }}>{x.setup || x.imageTag}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <SimilarCharts trades={trades} onOpenTrade={onOpenTrade} />
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

      {zoom && createPortal(
        <div className="th-overlay fixed inset-0 flex items-center justify-center p-6 z-[80]" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={() => setZoom(null)}>
          <button type="button" onClick={() => setZoom(null)} className="absolute top-4 right-4 rounded-md p-2" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }} title="Close">
            <X size={18} />
          </button>
          <div className="max-w-[96vw] max-h-[94vh]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: T.dim }}>
              <span style={{ color: T.text, fontWeight: 600 }}>{zoom.symbol}</span>
              <span>{dateLabel(zoom.timestamp)}</span>
              <span style={{ color: zoom.pnl >= 0 ? T.up : T.down }}>{fmt$(zoom.pnl)}</span>
              {zoom.setup && <span>{zoom.setup}</span>}
            </div>
            <img src={zoom.dataUrl} alt={`${zoom.symbol} chart`} style={{ maxWidth: '96vw', maxHeight: '88vh', objectFit: 'contain', background: '#000' }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

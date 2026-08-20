import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Panel } from './Shared.jsx'
import { T, inputStyle, mono } from '../theme.js'
import { CME_BIAS_INSTRUMENTS, FOREX_BIAS_INSTRUMENTS } from '../directionalBias.js'

const LABELS = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral', unavailable: 'Unavailable' }

function tone(state) {
  if (state === 'bullish') return T.up
  if (state === 'bearish') return T.down
  if (state === 'neutral') return T.accentText
  return T.faint
}

function freshness(value) {
  if (!value) return 'No bar timestamp'
  const minutes = Math.max(0, Math.round((Date.now() - Number(value)) / 60000))
  return minutes < 1 ? 'Latest bar under a minute old' : `Latest bar ${minutes}m old`
}

export function DirectionalBiasPanel({ onOpenSettings }) {
  const [instrument, setInstrument] = useState('ES')
  const [bias, setBias] = useState(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const result = await window.api?.directionalBias?.(instrument).catch((error) => ({ ok: false, error: error?.message }))
    setBias(result?.ok ? result.bias : { instrument, state: 'unavailable', score: null, reason: result?.error || 'Bias data is unavailable.', factors: [] })
    setLoading(false)
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [instrument]) // eslint-disable-line react-hooks/exhaustive-deps

  const state = bias?.state || 'unavailable'
  const color = tone(state)

  return (
    <Panel title="Directional bias" right={
      <div className="flex items-center gap-2">
        <select aria-label="Bias instrument" value={instrument} onChange={(event) => setInstrument(event.target.value)} className="rounded px-2 py-1 text-xs" style={inputStyle}>
          <optgroup label="CME futures">
            {CME_BIAS_INSTRUMENTS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
          </optgroup>
          <optgroup label="Forex">
            {FOREX_BIAS_INSTRUMENTS.map((symbol) => <option key={symbol} value={symbol}>{symbol.slice(0, 3)}/{symbol.slice(3)}</option>)}
          </optgroup>
        </select>
        <button type="button" onClick={load} disabled={loading} aria-label="Recalculate bias" className="rounded p-1.5" style={{ color: T.dim, background: T.surface2 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    }>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="min-w-40">
          <div className="text-2xl font-semibold" style={{ color }}>{LABELS[state]}</div>
          <div className="text-xs mt-1" style={{ color: T.faint }}>
            {bias?.score == null ? 'No score published' : <><span style={mono}>{bias.score > 0 ? '+' : ''}{bias.score}</span> weighted score</>}
          </div>
        </div>
        <div className="flex-1 min-w-56 text-xs space-y-1" style={{ color: T.dim }}>
          <div>{bias?.reason || bias?.invalidation}</div>
          <div style={{ color: T.faint }}>{bias?.source || 'No source'} · {freshness(bias?.lastBarAt)}</div>
        </div>
        {state === 'unavailable' && (
          <button type="button" onClick={onOpenSettings} className="rounded-md px-3 py-2 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
            Open data settings
          </button>
        )}
      </div>

      {bias?.factors?.length > 0 && (
        <div className="mt-4 divide-y" style={{ borderColor: T.line }}>
          {bias.factors.map((item) => (
            <div key={item.id} className="grid grid-cols-[128px_54px_1fr] gap-3 py-2 text-xs items-start" style={{ borderColor: T.line }}>
              <span className="font-semibold" style={{ color: T.text }}>{item.label}</span>
              <span style={{ ...mono, color: tone(item.direction) }}>{item.score > 0 ? '+' : ''}{item.score}/{item.weight}</span>
              <span style={{ color: T.dim }}>{item.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs mt-3" style={{ color: T.faint }}>
        Deterministic context from one-minute bars. It does not place trades, predict returns, or use AI to choose the state.
        {FOREX_BIAS_INSTRUMENTS.includes(instrument) ? ' Forex participation uses OANDA tick activity, not centralized exchange volume.' : ''}
      </div>
    </Panel>
  )
}

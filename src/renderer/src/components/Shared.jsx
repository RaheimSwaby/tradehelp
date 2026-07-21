import React, { useEffect, useMemo, useRef, useState } from 'react'
import { T, mono } from '../theme.js'
import { executionGrade } from '../stats.js'

const ANIM_MS = 720

export function numberDisplayParts(display) {
  const raw = String(display ?? '').trim()
  if (!raw || raw === '—' || raw === '∞') return null
  const match = raw.match(/^(-?\$?|\$?-?)([\d,]+(?:\.\d+)?)(.*)$/)
  if (!match) return null
  let [, prefix, body, suffix] = match
  if (suffix && !['%', 'W', 'L', ''].includes(suffix)) return null
  const n = Number(body.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const negative = prefix.includes('-')
  const currency = prefix.includes('$')
  const decimals = body.includes('.') ? body.split('.')[1].length : 0
  return { value: negative ? -n : n, currency, suffix, decimals }
}

export function formatAnimatedNumber(value, parts) {
  if (!parts) return String(value ?? '')
  const abs = Math.abs(Number(value) || 0)
  const text = abs.toLocaleString(undefined, { minimumFractionDigits: parts.decimals, maximumFractionDigits: parts.decimals })
  if (parts.currency) return `${Number(value) < 0 ? '-$' : '$'}${text}${parts.suffix}`
  return `${Number(value) < 0 ? '-' : ''}${text}${parts.suffix}`
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function AnimatedValue({ value, className = '', style }) {
  const parts = useMemo(() => numberDisplayParts(value), [value])
  const target = parts?.value ?? null
  const [current, setCurrent] = useState(target ?? 0)
  const [animating, setAnimating] = useState(false)
  const previous = useRef(null)

  useEffect(() => {
    if (target == null || prefersReducedMotion()) {
      previous.current = target
      setAnimating(false)
      if (target != null) setCurrent(target)
      return
    }
    const start = previous.current == null ? 0 : previous.current
    const delta = target - start
    previous.current = target
    if (Math.abs(delta) < 0.001) { setAnimating(false); setCurrent(target); return }
    setAnimating(true)
    let frame = 0
    const startAt = performance.now()
    const step = (now) => {
      const p = Math.min(1, (now - startAt) / ANIM_MS)
      const eased = 1 - Math.pow(1 - p, 3)
      setCurrent(start + delta * eased)
      if (p < 1) frame = requestAnimationFrame(step)
      else { setCurrent(target); setAnimating(false) }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  if (!parts) return <span key={String(value)} className={`th-val ${className}`.trim()} style={style}>{value}</span>
  const display = formatAnimatedNumber(current, parts)
  return <span className={`th-count${animating ? ' th-counting' : ''} ${className}`.trim()} data-value={display} style={style}>{display}</span>
}

// Tiny inline sparkline for stat cards — normalizes the series into a 100×28 box.
function Spark({ points, color }) {
  if (!points || points.length < 2) return null
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * 100},${26 - ((v - min) / span) * 24}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-6 mt-1" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.75" />
    </svg>
  )
}

export function Stat({ label, value, sub, tone, spark }) {
  const color = tone === 'up' ? T.up : tone === 'down' ? T.down : tone === 'accent' ? T.accent : T.text
  return (
    <div className="rounded-lg p-3 th-card" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ ...mono, color }}><AnimatedValue value={value} /></div>
      {sub && <div className="text-xs mt-0.5" style={{ color: T.dim }}>{sub}</div>}
      <Spark points={spark} color={tone === 'down' ? T.down : T.accent} />
    </div>
  )
}
export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: T.dim }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
export function Panel({ title, right, children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}
export function EmptyChart() {
  return <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: T.dim }}>Log trades to populate this chart.</div>
}
export function Readout({ label, value, tone }) {
  const color = tone === 'up' ? T.up : tone === 'down' ? T.down : T.text
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs" style={{ color: T.faint }}>{label}</span>
      <AnimatedValue value={value} style={{ color }} />
    </div>
  )
}
export function GradeChip({ t }) {
  const g = executionGrade(t)
  const c = g.tone === 'up' ? T.up : g.tone === 'accent' ? T.accent : T.down
  const title = t.source === 'import' ? 'Imported — graded on outcome until you journal it' : `Execution ${g.score}/100 — process, not outcome`
  return <span className="inline-block text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: c, border: `1px solid ${c}` }} title={title}>{g.letter}</span>
}

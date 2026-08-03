import React from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { T } from '../theme.js'
import { fmt$ } from '../utils.js'

export function PreflightStatus({ rules = [], live = false, todayNet = 0, maxLoss = 0, onBreak = false, onAction }) {
  const savedRules = rules.map((rule) => String(rule || '').trim()).filter(Boolean)
  const net = Number(todayNet) || 0
  const lossLimit = Math.max(0, Number(maxLoss) || 0)
  const lossHit = lossLimit > 0 && net <= -lossLimit

  const status = onBreak
    ? { label: 'Paused', detail: 'Break mode is active', color: T.down }
    : lossHit
      ? { label: 'Stop reached', detail: `${fmt$(net)} today`, color: T.down }
      : live
        ? { label: 'Session live', detail: 'Pre-flight completed', color: T.up }
        : savedRules.length
          ? { label: 'Ready to review', detail: `${savedRules.length} rule${savedRules.length === 1 ? '' : 's'} saved`, color: T.accent }
          : { label: 'Needs setup', detail: 'Add at least one trading rule', color: T.accent }

  return (
    <section aria-label="Pre-flight status" className="rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: T.surface2, color: status.color }}>
        <ShieldCheck size={16} />
      </div>
      <div className="min-w-[150px]">
        <div className="text-xs font-semibold" style={{ color: T.text }}>Pre-flight</div>
        <div className="text-[11px]" style={{ color: T.faint }}>Review before starting a session</div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: status.color, border: `1px solid ${status.color}` }}>{status.label}</span>
        <span className="text-xs" style={{ color: T.dim }}>{status.detail}</span>
      </div>
      {lossLimit > 0 && !lossHit && (
        <div className="text-[11px] sm:ml-auto" style={{ color: T.faint }}>Daily stop {fmt$(-lossLimit)}</div>
      )}
      {onAction && (
        <button type="button" onClick={onAction} className={`${lossLimit > 0 && !lossHit ? '' : 'sm:ml-auto '}flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold`} style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}>
          Review <ArrowRight size={12} />
        </button>
      )}
    </section>
  )
}

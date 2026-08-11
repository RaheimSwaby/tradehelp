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
          ? { label: 'Ready to review', detail: `${savedRules.length} rule${savedRules.length === 1 ? '' : 's'} saved`, color: T.accentText }
          : { label: 'Needs setup', detail: 'Add at least one trading rule', color: T.accentText }

  return (
    <section aria-label="Pre-flight status" className="th-preflight-status flex flex-wrap items-center" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
      <div className="th-preflight-label"><div className="text-sm font-semibold" style={{ color: T.text }}>Preflight</div></div>
      <div className="th-preflight-segment flex items-center gap-2"><ShieldCheck size={16} style={{ color: status.color }} /><span className="text-sm font-semibold" style={{ color: status.color }}>{status.label}</span><span className="text-xs" style={{ color: T.dim }}>{status.detail}</span></div>
      <div className="th-preflight-segment"><span className="text-xs" style={{ color: T.faint }}>Max loss</span><strong className="ml-3 text-xs" style={{ color: lossHit ? T.down : T.text }}>{lossLimit > 0 ? `${fmt$(Math.max(0, lossLimit + net))} left` : 'Not set'}</strong></div>
      <div className="th-preflight-segment"><span className="text-xs" style={{ color: T.faint }}>Break</span><strong className="ml-3 text-xs" style={{ color: onBreak ? T.down : T.text }}>{onBreak ? 'Active' : 'None'}</strong></div>
      {onAction && (
        <button type="button" onClick={onAction} className="th-preflight-action ml-auto flex items-center gap-1 rounded-md px-3 py-2 text-xs font-semibold" style={{ background: T.accent, color: '#1A1306' }}>
          Trade Mode <ArrowRight size={12} />
        </button>
      )}
    </section>
  )
}

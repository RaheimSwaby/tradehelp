import React, { useMemo } from 'react'
import { Brain, Lock, BadgeCheck, X } from 'lucide-react'
import { T, mono } from '../theme.js'
import { computeRating, computeAchievements, computeSelfGrade } from '../stats.js'
import { Panel } from '../components/Shared.jsx'

const gradeColor = (l) => (l === 'A+' || l === 'A' ? T.up : l === 'B' || l === 'C' ? T.accent : l === '—' ? T.dim : T.down)

/* ───────── rating ───────── */
export function Rating({ trades, stats, achievements, unlockedAt }) {
  const r = useMemo(() => computeRating(trades, stats), [trades, stats])
  const self = useMemo(() => computeSelfGrade(trades), [trades])
  if (stats.n === 0) {
    return <Panel title="Trader rating"><div className="py-12 text-center text-sm" style={{ color: T.dim }}>Log trades to build your rating. It grades your <span style={{ color: T.text }}>process</span> — not whether you won.</div></Panel>
  }
  const tier = r.ovr >= 90 ? 'Superstar' : r.ovr >= 84 ? 'Elite' : r.ovr >= 76 ? 'All-Star' : r.ovr >= 68 ? 'Starter' : 'Prospect'
  const ovrColor = r.provisional ? T.dim : r.ovr >= 84 ? T.up : r.ovr >= 68 ? T.accent : T.down
  const verified = r.imported > 0
  const vLabel = r.imported >= r.sampleN ? 'Verified' : verified ? `Verified ${r.imported}/${r.sampleN}` : 'Self-reported'
  const VIcon = verified ? BadgeCheck : Lock
  const ATTRS = [
    ['Edge', r.attrs.edge], ['Discipline', r.attrs.discipline], ['Risk Mgmt', r.attrs.risk],
    ['Consistency', r.attrs.consistency], ['Patience', r.attrs.patience]
  ]
  return (
    <div className="space-y-5">
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
      <div className="rounded-xl p-5" style={{ background: `linear-gradient(160deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>Overall</span>
          <span className="text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ color: verified ? T.up : T.faint, border: `1px solid ${verified ? T.up : T.line}` }}><VIcon size={11} /> {vLabel}</span>
        </div>
        <div className="flex items-end gap-3 mt-1">
          <div style={{ fontSize: 64, lineHeight: 1, fontWeight: 800, ...mono, color: ovrColor }}>{r.ovr}</div>
          <div className="pb-2">
            <div className="text-sm font-semibold">{tier}</div>
            <div className="text-xs" style={{ color: T.accent }}>{r.archetype}</div>
          </div>
        </div>
        {r.provisional && <div className="mt-2 text-xs" style={{ color: T.faint }}>Provisional · {r.sampleN}/20 trades. The rating settles as you log more.</div>}
        <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: T.dim }}>
          <Brain size={13} style={{ color: T.up }} /> Non-tilt streak <span style={{ color: T.text, ...mono }}>{stats.nonTiltStreak}</span> <span style={{ color: T.faint }}>· best {stats.bestNonTilt}</span>
        </div>
        <div className="mt-4 text-xs leading-relaxed" style={{ color: T.dim }}>
          Graded on <span style={{ color: T.text }}>process, not P&amp;L</span>. A disciplined trade that loses still scores well — that's the point.
        </div>
      </div>

      <div className="space-y-4">
        <Panel title="Attributes">
          <div className="space-y-3">
            {ATTRS.map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1"><span style={{ color: T.dim }}>{label}</span><span style={{ ...mono, color: T.text }}>{v}</span></div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                  <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 84 ? T.up : v >= 68 ? T.accent : T.down, transition: 'width .4s' }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="How it's scored">
          <ul className="text-sm space-y-1.5" style={{ color: T.dim }}>
            <li><span style={{ color: T.text }}>Edge</span> — profit factor & expectancy (the only outcome-based attribute).</li>
            <li><span style={{ color: T.text }}>Discipline</span> — your average per-trade grade: stop set, R:R, clean emotion, risk honored.</li>
            <li><span style={{ color: T.text }}>Risk Mgmt</span> — keeping drawdown small vs. profit.</li>
            <li><span style={{ color: T.text }}>Consistency</span> — win rate & staying profitable.</li>
            <li><span style={{ color: T.text }}>Patience</span> — not overtrading (trades per active day).</li>
          </ul>
          <p className="mt-3 text-xs" style={{ color: T.dim }}>Your tagged <span style={{ color: T.text }}>win/loss reasons</span> nudge the matching attribute (±10) — "lost to greed" dings Discipline; "won by being patient" lifts Patience. "Just variance" and "got lucky" move nothing.</p>
          <p className="mt-2 text-xs" style={{ color: T.faint }}>"Self-reported" becomes "Verified" once trades import from your broker.</p>
        </Panel>
      </div>
    </div>
      <Panel title="Self-graded" right={<span className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ color: T.faint, border: `1px solid ${T.line}` }}>your call · not verified</span>}>
        {self.count === 0 ? (
          <div className="text-sm" style={{ color: T.dim }}>Grade your own <span style={{ color: T.text }}>setup</span> and <span style={{ color: T.text }}>execution</span> when you log a trade — your honest read, kept separate from the app's grade above. A losing trade can still be an A+ setup.</div>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              {[['Setup', self.setupLetter], ['Execution', self.execLetter]].map(([label, letter]) => (
                <div key={label} className="rounded-lg p-3 text-center" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                  <div className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>{label}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.1, ...mono, color: gradeColor(letter) }}>{letter}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wider" style={{ color: T.faint }}>GPA</span>
              <span style={{ ...mono, fontSize: 22, fontWeight: 700, color: T.text }}>{self.gpa.toFixed(2)}</span>
              <span className="text-xs" style={{ color: T.faint }}>· {self.count} trade{self.count === 1 ? '' : 's'} you graded</span>
            </div>
          </div>
        )}
      </Panel>
      <AchievementShelf achievements={achievements} unlockedAt={unlockedAt} />
    </div>
  )
}

export function AchievementShelf({ achievements, unlockedAt }) {
  const done = achievements.filter((a) => a.unlocked).length
  return (
    <Panel title={`Achievements · ${done}/${achievements.length}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {achievements.map((a) => {
          const Icon = a.Icon
          const u = a.unlocked
          return (
            <div key={a.id} className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${u ? T.accent : T.line}`, opacity: u ? 1 : 0.7 }}>
              <div className="flex items-center gap-2">
                <Icon size={18} style={{ color: u ? T.accent : T.faint, flexShrink: 0 }} />
                <span className="text-sm font-semibold" style={{ color: u ? T.text : T.dim }}>{a.name}</span>
              </div>
              <div className="text-xs mt-1" style={{ color: T.faint }}>{a.desc}</div>
              {u ? (
                <div className="text-xs mt-2" style={{ color: T.up }}>Unlocked{unlockedAt?.[a.id] ? ` · ${unlockedAt[a.id].slice(0, 10)}` : ''}</div>
              ) : (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.surface }}>
                    <div className="h-full rounded-full" style={{ width: `${a.progress * 100}%`, background: T.accent, transition: 'width .4s' }} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: T.faint, ...mono }}>{Math.min(a.current || 0, a.goal)}/{a.goal}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export function AchievementToast({ a, onClose }) {
  const Icon = a.Icon
  return (
    <div className="fixed bottom-4 right-4 z-[80] rounded-xl p-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.accent}`, minWidth: 240, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
      <div className="rounded-lg p-2" style={{ background: T.accentSoft }}><Icon size={20} style={{ color: T.accent }} /></div>
      <div className="flex-1">
        <div className="text-xs" style={{ color: T.accent }}>Achievement unlocked</div>
        <div className="text-sm font-semibold">{a.name}</div>
      </div>
      <button type="button" onClick={onClose} style={{ color: T.faint }}><X size={16} /></button>
    </div>
  )
}

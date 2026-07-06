import React, { useState } from 'react'
import { Sparkles, ShieldCheck, Lock, Gauge, Zap, Upload, PencilLine, Building2 } from 'lucide-react'
import { T, inputStyle } from '../theme.js'
import { Field } from './Shared.jsx'
import { parseRules } from '../utils.js'
import { ImportModal } from '../widgets/ImportModal.jsx'

/* ───────── first-run setup wizard ─────────
   Shown once on a fresh install (no trades, onboarded flag unset). Three quick
   steps: what the app is → Trade Mode guardrails → get trades in. Skippable at
   any point; finishing or skipping sets settings.onboarded so it never returns. */
export function Onboarding({ settings, accounts = [], onSaveSettings, onImport, onDone }) {
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState(settings?.dailyGoal || '300')
  const [loss, setLoss] = useState(settings?.maxDailyLoss || '300')
  const [rules, setRules] = useState(parseRules(settings).join('\n'))
  const [importing, setImporting] = useState(false)
  const inp = 'w-full rounded px-2 py-1.5 text-sm'

  function saveGuardrails() {
    onSaveSettings({
      dailyGoal: String(parseFloat(goal) || 0),
      maxDailyLoss: String(parseFloat(loss) || 0),
      tradeRules: JSON.stringify(rules.split('\n').map((r) => r.trim()).filter(Boolean))
    })
    setStep(2)
  }

  const Dot = ({ i }) => (
    <span className="inline-block w-2 h-2 rounded-full" style={{ background: i === step ? T.accent : T.line }} />
  )

  return (
    <div className="th-overlay fixed inset-0 flex items-center justify-center p-4 z-[75]" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
      <div className="rounded-xl w-full max-w-lg" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: T.accent }} />
            <span className="text-sm font-semibold">Welcome to TradeHelp</span>
          </div>
          <div className="flex items-center gap-1.5"><Dot i={0} /><Dot i={1} /><Dot i={2} /></div>
        </div>

        <div className="px-6 py-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="text-lg font-semibold">Your journal. Your machine. <span style={{ color: T.accent }}>Your edge.</span></div>
              {[
                [Lock, 'Private by design', 'Trades, notes and screenshots live in a local database. Nothing leaves this computer.'],
                [Gauge, 'Grades your process, not your luck', 'A trader rating built from discipline, risk and patience — plus achievements that reward not tilting.'],
                [Zap, 'Trade Mode has your back', 'A pre-trade checklist, daily goal, and a max-loss lockout that steps in when it should.']
              ].map(([Icon, title, desc]) => (
                <div key={title} className="flex gap-3 items-start">
                  <Icon size={18} className="mt-0.5 shrink-0" style={{ color: T.accent }} />
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-xs mt-0.5" style={{ color: T.dim }}>{desc}</div>
                  </div>
                </div>
              ))}
              <div className="text-xs" style={{ color: T.faint }}>Setup takes under a minute — two quick steps.</div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} style={{ color: T.accent }} /> Set your guardrails</div>
              <div className="text-xs" style={{ color: T.dim }}>These power Trade Mode — the pre-flight checklist you confirm before going live, and the lockout that fires if the day goes wrong. You can change them anytime in Trade Mode.</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Daily profit goal ($)">
                  <input type="number" style={inputStyle} className={inp} value={goal} onChange={(e) => setGoal(e.target.value)} />
                </Field>
                <Field label="Max daily loss ($)">
                  <input type="number" style={inputStyle} className={inp} value={loss} onChange={(e) => setLoss(e.target.value)} />
                </Field>
              </div>
              <Field label="Your trading rules (one per line)">
                <textarea rows={5} style={inputStyle} className={inp} value={rules} onChange={(e) => setRules(e.target.value)} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Bring in your trades</div>
              <button type="button" onClick={() => setImporting(true)}
                className="w-full text-left rounded-lg p-4 th-card flex gap-3 items-start" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <Upload size={18} className="mt-0.5 shrink-0" style={{ color: T.accent }} />
                <div>
                  <div className="text-sm font-semibold">Import your broker CSV <span className="text-xs font-normal px-1.5 py-0.5 rounded ml-1" style={{ color: T.up, border: `1px solid ${T.line}` }}>recommended</span></div>
                  <div className="text-xs mt-0.5" style={{ color: T.dim }}>NinjaTrader, Tradovate and TopstepX exports are recognized automatically — any other CSV maps in a click. Imported trades count as Verified on your rating.</div>
                </div>
              </button>
              <button type="button" onClick={() => onDone('journal')}
                className="w-full text-left rounded-lg p-4 th-card flex gap-3 items-start" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
                <PencilLine size={18} className="mt-0.5 shrink-0" style={{ color: T.accent }} />
                <div>
                  <div className="text-sm font-semibold">Start logging manually</div>
                  <div className="text-xs mt-0.5" style={{ color: T.dim }}>Head to the Journal and log your next trade — there's a simple mode that takes under a minute per trade.</div>
                </div>
              </button>
              <div className="flex gap-2 items-center text-xs pt-1" style={{ color: T.faint }}>
                <Building2 size={13} className="shrink-0" />
                Trading a prop-firm challenge? Add your account in the Prop Firm tab — targets, drawdown and payouts are tracked per account.
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${T.line}` }}>
          <button type="button" onClick={() => onDone()} className="text-xs" style={{ color: T.faint }}>Skip setup</button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="rounded-md px-3 py-2 text-sm" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>Back</button>
            )}
            {step === 0 && (
              <button type="button" onClick={() => setStep(1)} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Get started</button>
            )}
            {step === 1 && (
              <button type="button" onClick={saveGuardrails} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Save &amp; continue</button>
            )}
            {step === 2 && (
              <button type="button" onClick={() => onDone('journal')} className="rounded-md px-4 py-2 text-sm font-semibold" style={{ background: T.accent, color: '#1A1306' }}>Finish</button>
            )}
          </div>
        </div>
      </div>

      {importing && (
        <ImportModal accounts={accounts}
          onImport={async (rows) => { await onImport(rows); onDone('journal') }}
          onClose={() => setImporting(false)} />
      )}
    </div>
  )
}

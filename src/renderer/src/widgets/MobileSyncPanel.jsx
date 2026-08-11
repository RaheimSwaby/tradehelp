import React, { useEffect, useState } from 'react'
import { Copy, RefreshCw, Smartphone, Square, Wifi } from 'lucide-react'
import QRCode from 'qrcode'
import { T, mono } from '../theme.js'
import { Panel } from '../components/Shared.jsx'

export function MobileSyncPanel() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [qr, setQr] = useState('')

  async function refresh() {
    if (!window.api?.mobileSyncStatus) return
    setState(await window.api.mobileSyncStatus())
  }

  useEffect(() => { refresh().catch(() => {}) }, [])

  async function run(action) {
    setBusy(true)
    setMessage('')
    try {
      setState(await action())
    } catch (error) {
      setMessage(String(error?.message || error))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setMessage('Pairing code copied.')
  }

  // Prefer the combined code (every local address in one string) so pairing
  // still works when this machine is reachable on a different interface than
  // the first one listed. Falls back for older desktop builds.
  const code = state?.pairingCode || state?.pairingCodes?.[0] || ''

  useEffect(() => {
    let active = true
    if (!code) { setQr(''); return undefined }
    QRCode.toDataURL(code, { width: 220, margin: 2, color: { dark: '#111827', light: '#FFFFFF' } })
      .then((value) => { if (active) setQr(value) })
      .catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [code])

  if (state?.available === false) return null

  return (
    <Panel title="TradeHelp Mobile sync lab">
      {/* One row rather than an icon tile above a heading above a paragraph above a
          button: this is optional, most sessions never start it, and it was claiming
          five rows of Settings to say so. The detail moves into the summary line. */}
      <div className="flex items-center gap-2.5">
        <Smartphone size={16} style={{ color: T.dim, flexShrink: 0 }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Same-network mobile capture</div>
          <p className="text-xs" style={{ color: T.dim }}>
            A temporary endpoint for TradeHelp Mobile. Trades import into the journal; rule edits sync both ways.
          </p>
        </div>
      </div>

      {!window.api?.mobileSyncStatus ? (
        <div className="text-xs mt-3" style={{ color: T.dim }}>Restart TradeHelp Desktop to load mobile sync.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-3">
            {!state?.running ? (
              <button type="button" disabled={busy || state?.available === false} onClick={() => run(window.api.startMobileSync)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold"
                style={{ background: T.accent, color: '#1A1306', opacity: busy || state?.available === false ? 0.5 : 1 }}>
                <Wifi size={14} /> Start mobile sync
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => run(window.api.stopMobileSync)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm"
                style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
                <Square size={13} /> Stop
              </button>
            )}
            {state?.running && (
              <>
                <button type="button" onClick={copyCode}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm"
                  style={{ background: T.surface2, color: T.text, border: `1px solid ${T.line}` }}>
                  <Copy size={14} /> Copy pairing code
                </button>
                <button type="button" disabled={busy} onClick={() => run(window.api.rotateMobileSyncCode)}
                  title="Disconnect previously paired phones"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm"
                  style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}>
                  <RefreshCw size={14} /> Rotate code
                </button>
              </>
            )}
          </div>

          {code && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-3 items-center">
              {qr && <img src={qr} alt="TradeHelp Mobile pairing QR code" className="w-28 h-28 rounded-md" />}
              <div className="rounded-md p-2.5 break-all text-xs select-all" style={{ ...mono, color: T.text, background: T.surface2, border: `1px solid ${T.line}` }}>
                {code}
                <div className="mt-2" style={{ color: T.faint }}>Scan the QR from Mobile Settings, or copy this code manually.</div>
              </div>
            </div>
          )}
          {state?.warning && <p className="text-xs mt-2" style={{ color: T.down }}>{state.warning}</p>}
          {message && <div className="text-xs mt-2" style={{ color: message.includes('copied') ? T.up : T.down }}>{message}</div>}
        </>
      )}
    </Panel>
  )
}

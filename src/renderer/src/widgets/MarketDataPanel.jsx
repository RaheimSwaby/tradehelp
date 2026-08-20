import React, { useEffect, useState } from 'react'
import { Database, KeyRound, RefreshCw, ShieldCheck, Unplug } from 'lucide-react'
import { Panel, Field } from '../components/Shared.jsx'
import { T, inputStyle, mono } from '../theme.js'
import { CME_BIAS_INSTRUMENTS, FOREX_BIAS_INSTRUMENTS } from '../directionalBias.js'

const SOURCES = {
  'oanda-practice': {
    label: 'OANDA Practice',
    option: 'OANDA Practice · free forex',
    market: 'Forex',
    credentialLabel: 'OANDA practice token',
    placeholder: 'Personal access token',
    instruments: FOREX_BIAS_INSTRUMENTS,
    free: true
  },
  databento: {
    label: 'Databento Historical',
    option: 'Databento Historical · metered CME',
    market: 'CME futures',
    credentialLabel: 'Databento API key',
    placeholder: 'db-…',
    instruments: CME_BIAS_INSTRUMENTS,
    free: false
  }
}

function instrumentLabel(symbol) {
  return FOREX_BIAS_INSTRUMENTS.includes(symbol) ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol
}

function money(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'unknown'
  if (number === 0) return '$0.00'
  return number < 0.01 ? '<$0.01' : `$${number.toFixed(2)}`
}

export function MarketDataPanel({ onBarsUpdated }) {
  const [provider, setProvider] = useState('oanda-practice')
  const [status, setStatus] = useState(null)
  const [credential, setCredential] = useState('')
  const [instrument, setInstrument] = useState(FOREX_BIAS_INSTRUMENTS[0])
  const [days, setDays] = useState(5)
  const [estimate, setEstimate] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const source = SOURCES[provider]

  async function loadStatus(selectedProvider = provider) {
    setStatus(null)
    const result = await window.api?.marketDataStatus?.(selectedProvider).catch(() => null)
    if (result?.ok) setStatus(result.status)
    else setMessage(result?.error || 'Market data status is unavailable.')
  }

  useEffect(() => { loadStatus(provider) }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEstimate(null); setMessage('') }, [instrument, days])

  function chooseProvider(event) {
    const next = event.target.value
    setProvider(next)
    setCredential('')
    setInstrument(SOURCES[next].instruments[0])
    setEstimate(null)
    setMessage('')
  }

  async function connect() {
    if (!credential.trim() || busy) return
    setBusy('connect')
    setMessage(`Verifying ${source.label}…`)
    const result = await window.api.connectMarketData({ provider, credential: credential.trim() }).catch((error) => ({ ok: false, error: error?.message }))
    if (result?.ok) {
      setStatus(result.status)
      setCredential('')
      setMessage('Connected. The credential was moved into encrypted OS storage.')
    } else setMessage(result?.error || `${source.label} could not be connected.`)
    setBusy('')
  }

  async function disconnect() {
    if (!window.confirm(`Remove the saved ${source.label} credential from this machine? Downloaded bars stay local.`)) return
    setBusy('disconnect')
    const result = await window.api.disconnectMarketData(provider).catch((error) => ({ ok: false, error: error?.message }))
    if (result?.ok) {
      setStatus(result.status)
      setEstimate(null)
      setMessage(`${source.label} disconnected. Existing local bars were kept.`)
    } else setMessage(result?.error || 'The saved credential could not be removed.')
    setBusy('')
  }

  async function checkCost() {
    setBusy('estimate')
    setMessage('Checking the Databento cost…')
    const result = await window.api.estimateMarketData({ provider, instrument, days }).catch((error) => ({ ok: false, error: error?.message }))
    if (result?.ok) {
      setEstimate(result.estimate)
      setMessage(`Estimated Databento charge: ${money(result.estimate.cost)}.`)
    } else setMessage(result?.error || 'The download cost could not be checked.')
    setBusy('')
  }

  async function download() {
    if (!source.free && (!estimate || estimate.instrument !== instrument || Number(estimate.days) !== Number(days))) return
    const confirmed = window.confirm(source.free
      ? `Refresh ${days} days of ${instrumentLabel(instrument)} one-minute candles from your OANDA practice account?\n\nThis is a read-only market-data request and does not place trades.`
      : `Download ${days} days of ${instrument} one-minute bars from Databento?\n\nEstimated provider charge: ${money(estimate.cost)}. Databento bills the actual bytes returned.`)
    if (!confirmed) return
    setBusy('sync')
    setMessage(`Downloading ${instrumentLabel(instrument)} bars…`)
    const result = await window.api.syncMarketData({ provider, instrument, days }).catch((error) => ({ ok: false, error: error?.message }))
    if (result?.ok) {
      const received = Number(result.result?.receivedCount) || Number(result.result?.barCount) || 0
      const stored = Number(result.result?.barCount) || received
      setMessage(`Received ${received.toLocaleString()} ${instrumentLabel(instrument)} bars; ${stored.toLocaleString()} are stored locally. The bias panel has been recalculated.`)
      onBarsUpdated?.(result.result)
    } else setMessage(result?.error || 'The bars could not be downloaded.')
    setBusy('')
  }

  const protectedLabel = status?.protected
    ? status.backend === 'windows-dpapi' ? 'Protected by Windows DPAPI' : status.backend === 'macos-keychain' ? 'Protected by macOS Keychain' : 'Protected by the OS credential store'
    : 'Secure credential storage is unavailable'

  return (
    <Panel title="Market data connections" right={
      <span className="text-xs flex items-center gap-1.5" style={{ color: status?.hasCredential ? T.up : T.faint }}>
        {status?.hasCredential ? <ShieldCheck size={13} /> : <Unplug size={13} />}
        {status?.hasCredential ? `${source.label} connected` : 'Not connected'}
      </span>
    }>
      <p className="text-sm" style={{ color: T.dim }}>
        The free path is a local platform export or OANDA Practice for forex. Databento remains optional for CME futures.
      </p>

      <div className="rounded-lg p-3 mt-3" style={{ background: T.surface2 }}>
        <div className="text-xs font-semibold" style={{ color: T.text }}>No account connection required</div>
        <div className="text-xs mt-1" style={{ color: T.dim }}>
          Settings → Chart data accepts bars from MetaTrader, TradingView, NinjaTrader, Sierra Chart, and standard OHLC CSV files. This is free, local, and manual.
        </div>
      </div>

      <div className="mt-4">
        <Field label="Automatic source">
          <select value={provider} onChange={chooseProvider} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle}>
            {Object.entries(SOURCES).map(([id, item]) => <option key={id} value={id}>{item.option}</option>)}
          </select>
        </Field>
        <p className="text-xs mt-2" style={{ color: T.faint }}>
          {source.free
            ? 'Use a free OANDA fxTrade Practice account and its personal access token. Demo/API availability depends on region.'
            : 'Databento Historical is metered. TradeHelp checks the estimated cost before making a billable download.'}
        </p>
      </div>

      <div className="rounded-lg p-3 mt-3" style={{ background: T.surface2 }}>
        <div className="flex gap-2 items-start">
          <KeyRound size={15} style={{ color: status?.protected ? T.up : T.down, marginTop: 1 }} />
          <div>
            <div className="text-xs font-semibold" style={{ color: status?.protected ? T.text : T.down }}>{protectedLabel}</div>
            <div className="text-xs mt-1" style={{ color: T.faint }}>The renderer never receives a saved credential. Backups and exports exclude it.</div>
          </div>
        </div>
      </div>

      {!status?.hasCredential ? (
        <div className="mt-3">
          <Field label={source.credentialLabel}>
            <input type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)}
              placeholder={source.placeholder} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle} />
          </Field>
          <button type="button" onClick={connect} disabled={!credential.trim() || busy || status?.available === false}
            className="mt-3 rounded-md px-3 py-2 text-sm font-semibold flex items-center gap-1.5"
            style={{ background: T.accent, color: '#1A1306', opacity: !credential.trim() || busy || status?.available === false ? 0.5 : 1 }}>
            <ShieldCheck size={14} /> {busy === 'connect' ? 'Verifying…' : 'Verify and save securely'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field label="Instrument">
              <select value={instrument} onChange={(event) => setInstrument(event.target.value)} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle}>
                {source.instruments.map((symbol) => <option key={symbol} value={symbol}>{instrumentLabel(symbol)}</option>)}
              </select>
            </Field>
            <Field label="History window">
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="w-full rounded px-2 py-1.5 text-sm" style={inputStyle}>
                {[2, 5, 7, 10].map((value) => <option key={value} value={value}>{value} days</option>)}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {!source.free && (
              <button type="button" onClick={checkCost} disabled={Boolean(busy)} className="rounded-md px-3 py-2 text-sm flex items-center gap-1.5"
                style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}`, opacity: busy ? 0.55 : 1 }}>
                <Database size={14} /> {busy === 'estimate' ? 'Checking…' : 'Check download cost'}
              </button>
            )}
            <button type="button" onClick={download} disabled={(!source.free && !estimate) || Boolean(busy)} className="rounded-md px-3 py-2 text-sm font-semibold flex items-center gap-1.5"
              style={{ background: T.accent, color: '#1A1306', opacity: (!source.free && !estimate) || busy ? 0.5 : 1 }}>
              <RefreshCw size={14} className={busy === 'sync' ? 'animate-spin' : ''} /> {busy === 'sync' ? 'Downloading…' : source.free ? `Refresh ${instrumentLabel(instrument)} bars` : `Download ${instrument} bars`}
            </button>
            <button type="button" onClick={disconnect} disabled={Boolean(busy)} className="ml-auto text-xs px-2 py-2" style={{ color: T.faint }}>Disconnect</button>
          </div>
          {estimate && !source.free && (
            <div className="text-xs mt-2" style={{ color: T.dim }}>
              Estimated provider charge <strong style={{ ...mono, color: T.text }}>{money(estimate.cost)}</strong>. You will confirm before the billable request.
            </div>
          )}
        </>
      )}

      {message && <div className="text-xs mt-3" style={{ color: /could not|unavailable|rejected|does not|invalid/.test(message.toLowerCase()) ? T.down : T.dim }}>{message}</div>}
      <p className="text-xs mt-3" style={{ color: T.faint }}>
        {source.free
          ? 'TradeHelp calls only the OANDA practice account check and read-only candle endpoint. The forex activity factor uses tick count, not centralized exchange volume.'
          : 'This uses Databento Historical, not a live streaming socket. Nothing refreshes automatically or creates a provider charge without confirmation.'}
      </p>
    </Panel>
  )
}

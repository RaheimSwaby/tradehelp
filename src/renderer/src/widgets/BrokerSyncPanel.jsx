import React, { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, RotateCcw, Unplug } from 'lucide-react'
import { T, inputStyle, mono } from '../theme.js'
import { Field, Panel } from '../components/Shared.jsx'

function when(value) {
  if (!value) return 'Never synced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Never synced' : date.toLocaleString()
}

function accountName(id, accounts) {
  if (!id) return 'Live / personal'
  return accounts.find((account) => account.id === id)?.label || 'Prop account'
}

export function BrokerSyncPanel({ accounts = [], onReload }) {
  const [capabilities, setCapabilities] = useState([])
  const [connections, setConnections] = useState([])
  const [draft, setDraft] = useState({ label: 'Development broker', account: '' })
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!window.api?.brokerSyncCapabilities) return
    const [available, saved] = await Promise.all([
      window.api.brokerSyncCapabilities(),
      window.api.listBrokerConnections()
    ])
    setCapabilities(Array.isArray(available) ? available : [])
    setConnections(Array.isArray(saved) ? saved : [])
  }, [])

  useEffect(() => { load().catch(() => {}) }, [load])

  if (!capabilities.length) return null

  async function connect(input = {}) {
    setBusy(input.id ? `connect:${input.id}` : 'connect')
    setMessage('')
    try {
      const next = await window.api.connectBroker({
        id: input.id,
        provider: 'development',
        label: input.label || draft.label,
        account: input.id ? input.account : draft.account
      })
      setConnections(next)
      setMessage(input.id ? 'Development broker reconnected.' : 'Development broker connected.')
    } catch (error) {
      setMessage(error?.message || 'Connection failed.')
    } finally {
      setBusy('')
    }
  }

  async function sync(connection) {
    setBusy(`sync:${connection.id}`)
    setMessage('')
    try {
      const result = await window.api.syncBroker(connection.id)
      setConnections(result.connections || [])
      setMessage(result.importedCount
        ? `${result.importedCount} new simulated trade${result.importedCount === 1 ? '' : 's'} imported; ${result.duplicateCount} duplicate${result.duplicateCount === 1 ? '' : 's'} ignored.`
        : `No new trades; ${result.duplicateCount} existing broker record${result.duplicateCount === 1 ? '' : 's'} ignored.`)
      await onReload?.()
    } catch (error) {
      setMessage(error?.message || 'Sync failed.')
      await load()
    } finally {
      setBusy('')
    }
  }

  async function disconnect(connection) {
    setBusy(`disconnect:${connection.id}`)
    setMessage('')
    try {
      setConnections(await window.api.disconnectBroker(connection.id))
      setMessage('Development broker disconnected. Imported trades stay in your journal.')
    } catch (error) {
      setMessage(error?.message || 'Disconnect failed.')
    } finally {
      setBusy('')
    }
  }

  async function reset(connection) {
    setBusy(`reset:${connection.id}`)
    setMessage('')
    try {
      const result = await window.api.resetBrokerSync(connection.id)
      setConnections(result.connections || [])
      setMessage(`${result.rolledBackCount} simulated sync batch${result.rolledBackCount === 1 ? '' : 'es'} removed. The simulator is ready to start again.`)
      await onReload?.()
    } catch (error) {
      setMessage(error?.message || 'Demo reset failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <Panel title="Broker sync lab">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Development simulator</div>
          <div className="text-xs mt-1" style={{ color: T.faint }}>Local test data only. This connector cannot view an account or place an order.</div>
        </div>
        <span className="text-[10px] uppercase font-semibold px-2 py-1 rounded" style={{ color: T.accentText, border: `1px solid ${T.accent}` }}>Dev only</span>
      </div>

      {!connections.length && (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end mt-4">
          <Field label="Connection name">
            <input style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
          </Field>
          <Field label="Journal account">
            <select style={inputStyle} className="w-full rounded px-2 py-1.5 text-sm" value={draft.account}
              onChange={(event) => setDraft({ ...draft, account: event.target.value })}>
              <option value="">Live / personal</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.label || 'Prop account'}</option>)}
            </select>
          </Field>
          <button type="button" disabled={busy === 'connect'} onClick={() => connect()}
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold"
            style={{ background: T.accent, color: '#1A1306', opacity: busy === 'connect' ? 0.6 : 1 }}>
            <Link2 size={15} /> Connect
          </button>
        </div>
      )}

      <div className="space-y-2 mt-4">
        {connections.map((connection) => {
          const connected = connection.enabled && connection.status !== 'disconnected'
          const syncing = busy === `sync:${connection.id}`
          return (
            <div key={connection.id} className="rounded-lg p-3" style={{ background: T.surface2, border: `1px solid ${connection.status === 'error' ? T.down : T.line}` }}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: connection.status === 'error' ? T.down : connected ? T.up : T.faint }} />
                <div className="grow min-w-[180px]">
                  <div className="text-sm font-semibold">{connection.label}</div>
                  <div className="text-xs mt-1" style={{ color: T.faint }}>
                    {accountName(connection.account, accounts)} · {when(connection.lastSyncAt)}
                    {connection.lastCursor ? ` · cursor ${connection.lastCursor}/5` : ''}
                  </div>
                  {connection.lastError && <div className="text-xs mt-1" style={{ color: T.down }}>{connection.lastError}</div>}
                </div>
                <div className="flex gap-2">
                  {connected ? (
                    <>
                      <button type="button" title="Sync now" disabled={Boolean(busy)} onClick={() => sync(connection)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
                        style={{ color: T.accentText, border: `1px solid ${T.line}`, opacity: busy && !syncing ? 0.5 : 1 }}>
                        <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sync now
                      </button>
                      {connection.lastCursor && (
                        <button type="button" title="Remove simulated imports and restart" disabled={Boolean(busy)} onClick={() => reset(connection)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
                          style={{ color: T.dim, border: `1px solid ${T.line}` }}>
                          <RotateCcw size={13} /> Reset demo
                        </button>
                      )}
                      <button type="button" title="Disconnect" disabled={Boolean(busy)} onClick={() => disconnect(connection)}
                        className="rounded-md p-1.5" style={{ color: T.down, border: `1px solid ${T.line}` }}>
                        <Unplug size={14} />
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={Boolean(busy)} onClick={() => connect(connection)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold"
                      style={{ color: T.accentText, border: `1px solid ${T.line}` }}>
                      <Link2 size={13} /> Reconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-xs mt-3" style={{ color: T.faint, ...mono }}>
        Sequence: 3 trades on the first sync, then 1 new trade per sync through 5. Previous broker records are returned again to exercise deduplication.
      </div>
      {message && <div role="status" className="text-xs mt-3" style={{ color: /failed|error/i.test(message) ? T.down : T.dim }}>{message}</div>}
    </Panel>
  )
}

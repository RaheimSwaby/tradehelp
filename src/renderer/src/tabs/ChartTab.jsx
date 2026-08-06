import React, { useState, useMemo, Component } from 'react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, holdMs, fmtDuration } from '../utils.js'
import { TradeChart } from '../components/TradeChart.jsx'
import { LineChart, Search, AlertCircle, Globe, BarChart2, ExternalLink, Maximize2 } from 'lucide-react'

class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('Chart Workstation Error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center rounded-xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <AlertCircle size={32} className="mx-auto" style={{ color: T.down }} />
          <div className="font-semibold text-base">Chart Workstation Error</div>
          <div className="text-xs" style={{ color: T.dim }}>{String(this.state.error?.message || this.state.error)}</div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: T.accent, color: '#1A1306' }}
          >
            Reload Chart Workstation
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const SAMPLE_DEMO_TRADE = {
  id: 'demo-sample',
  symbol: 'ES_F',
  direction: 'Long',
  entry: 5200.0,
  exit: 5225.0,
  stop: 5185.0,
  target: 5250.0,
  pnl: 1250.0,
  setup: 'Pullback',
  emotion: 'Calm',
  notes: 'Sample trade execution. Switch to Live Market View for real-time TradingView charts!',
  timestamp: new Date().toISOString().slice(0, 16).replace('T', ' ')
}

export function ChartTab({ trades = [], onOpenTrade }) {
  return (
    <ChartErrorBoundary>
      <ChartTabContent trades={trades} onOpenTrade={onOpenTrade} />
    </ChartErrorBoundary>
  )
}

function ChartTabContent({ trades = [], onOpenTrade }) {
  const [viewMode, setViewMode] = useState('live') // 'live' | 'trade'
  const [liveSymbol, setLiveSymbol] = useState('NASDAQ:NQ1!')

  const safeTrades = Array.isArray(trades) && trades.length > 0 ? trades : [SAMPLE_DEMO_TRADE]
  const [selectedId, setSelectedId] = useState(safeTrades[0]?.id || 'demo-sample')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('all') // all | win | loss

  const filteredTrades = useMemo(() => {
    return safeTrades.filter((t) => {
      if (!t) return false
      if (symbolFilter && !String(t.symbol || '').toLowerCase().includes(symbolFilter.toLowerCase())) return false
      const isWin = (Number(t.pnl) || 0) >= 0
      if (outcomeFilter === 'win' && !isWin) return false
      if (outcomeFilter === 'loss' && isWin) return false
      return true
    })
  }, [safeTrades, symbolFilter, outcomeFilter])

  const selectedTrade = useMemo(() => {
    return safeTrades.find((t) => t?.id === selectedId) || filteredTrades[0] || safeTrades[0] || SAMPLE_DEMO_TRADE
  }, [safeTrades, selectedId, filteredTrades])

  const handleOpenDetached = () => {
    if (window.api?.openDetachedChart) {
      window.api.openDetachedChart(liveSymbol)
    }
  }

  const handleOpenExternalBrowser = () => {
    const clean = encodeURIComponent(liveSymbol.replace(/\s+/g, ''))
    const url = `https://www.tradingview.com/chart/?symbol=${clean}`
    if (window.api?.openExternal) {
      window.api.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Header / Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <LineChart size={20} style={{ color: T.accent }} />
            <span className="font-semibold text-base">TradingView Workstation</span>
          </div>

          {/* Mode Switch Buttons */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            <button
              type="button"
              onClick={() => setViewMode('live')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold transition-colors"
              style={{
                background: viewMode === 'live' ? T.accent : 'transparent',
                color: viewMode === 'live' ? '#1A1306' : T.dim
              }}
            >
              <Globe size={13} /> Live Market View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('trade')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-semibold transition-colors"
              style={{
                background: viewMode === 'trade' ? T.accent : 'transparent',
                color: viewMode === 'trade' ? '#1A1306' : T.dim
              }}
            >
              <BarChart2 size={13} /> Trade Execution View
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on View Mode */}
        {viewMode === 'live' ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: T.faint }}>Quick Symbol:</span>
            {['NASDAQ:NQ1!', 'CME_MINI:ES1!', 'BINANCE:BTCUSDT', 'NASDAQ:AAPL', 'NASDAQ:TSLA'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setLiveSymbol(sym)}
                className="px-2 py-1 rounded text-[11px] font-semibold transition-colors"
                style={{
                  background: liveSymbol === sym ? T.surface2 : 'transparent',
                  color: liveSymbol === sym ? T.accent : T.dim,
                  border: `1px solid ${liveSymbol === sym ? T.accent : T.line}`
                }}
              >
                {sym.split(':')[1] || sym}
              </button>
            ))}
            <input
              type="text"
              placeholder="e.g. CME:6E1!"
              value={liveSymbol}
              onChange={(e) => setLiveSymbol(e.target.value)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, width: 120, ...mono }}
            />

            {/* Pop-out & Multi-Monitor Buttons */}
            <div className="flex items-center gap-1.5 ml-2 border-l pl-2.5" style={{ borderColor: T.line }}>
              <button
                type="button"
                onClick={handleOpenDetached}
                title="Pop out chart into a separate floating window for multi-monitor setups"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}
              >
                <Maximize2 size={12} /> Pop Out Window
              </button>
              <button
                type="button"
                onClick={handleOpenExternalBrowser}
                title="Open symbol in your default web browser on TradingView.com"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: T.surface2, color: T.dim, border: `1px solid ${T.line}` }}
              >
                <ExternalLink size={12} /> Browser Tab
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* Symbol Filter Search */}
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-2.5" style={{ color: T.faint }} />
              <input
                type="text"
                placeholder="Filter symbol..."
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs"
                style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, width: 130 }}
              />
            </div>

            {/* Outcome Filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
              {['all', 'win', 'loss'].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcomeFilter(o)}
                  className="px-2.5 py-1 text-xs rounded capitalize font-medium transition-colors"
                  style={{
                    background: outcomeFilter === o ? T.accent : 'transparent',
                    color: outcomeFilter === o ? '#1A1306' : T.dim
                  }}
                >
                  {o}
                </button>
              ))}
            </div>

            {/* Trade Picker Dropdown */}
            <select
              value={selectedTrade?.id || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, maxWidth: 240, ...mono }}
            >
              {filteredTrades.map((t) => (
                <option key={t.id || Math.random()} value={t.id}>
                  {String(t.timestamp || '').slice(0, 10)} · {t.symbol || 'Trade'} {t.direction || ''} ({(Number(t.pnl) || 0) >= 0 ? '+' : ''}{fmt$(Number(t.pnl) || 0)})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main View Container */}
      {viewMode === 'live' ? (
        <div className="w-full">
          <TradeChart mode="live" liveSymbol={liveSymbol} height={620} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Chart Area (3 Columns) */}
          <div className="lg:col-span-3">
            <TradeChart mode="trade" trade={selectedTrade} height={580} />
          </div>

          {/* Trade Specs & Details Sidebar (1 Column) */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: T.line }}>
                <div>
                  <div className="text-lg font-bold flex items-center gap-1.5">
                    {selectedTrade.symbol || 'Trade'}
                    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: selectedTrade.direction === 'Long' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: selectedTrade.direction === 'Long' ? T.up : T.down }}>
                      {selectedTrade.direction || 'Long'}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: T.faint, ...mono }}>{selectedTrade.timestamp || '—'}</div>
                </div>
                <div className="text-right" style={mono}>
                  <div className="text-lg font-bold" style={{ color: (Number(selectedTrade.pnl) || 0) >= 0 ? T.up : T.down }}>
                    {fmt$(Number(selectedTrade.pnl) || 0)}
                  </div>
                  <div className="text-xs" style={{ color: T.faint }}>
                    {selectedTrade.rr ? `1:${fmtN(selectedTrade.rr, 1)} R:R` : '—'}
                  </div>
                </div>
              </div>

              {/* Price Points */}
              <div className="grid grid-cols-2 gap-2 text-xs" style={mono}>
                <div className="p-2 rounded" style={{ background: T.surface2 }}>
                  <div style={{ color: T.faint }}>Entry Price</div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>${Number(selectedTrade.entry || 0).toFixed(2)}</div>
                </div>
                <div className="p-2 rounded" style={{ background: T.surface2 }}>
                  <div style={{ color: T.faint }}>Exit Price</div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>${Number(selectedTrade.exit || 0).toFixed(2)}</div>
                </div>
                <div className="p-2 rounded" style={{ background: T.surface2 }}>
                  <div style={{ color: T.faint }}>Stop Loss</div>
                  <div className="font-semibold text-sm" style={{ color: selectedTrade.stop ? T.down : T.faint }}>
                    {selectedTrade.stop ? `$${Number(selectedTrade.stop).toFixed(2)}` : 'None'}
                  </div>
                </div>
                <div className="p-2 rounded" style={{ background: T.surface2 }}>
                  <div style={{ color: T.faint }}>Take Profit</div>
                  <div className="font-semibold text-sm" style={{ color: selectedTrade.target ? T.up : T.faint }}>
                    {selectedTrade.target ? `$${Number(selectedTrade.target).toFixed(2)}` : 'None'}
                  </div>
                </div>
              </div>

              {/* Strategy & Notes */}
              <div className="space-y-1.5 pt-1 text-xs">
                <div className="flex justify-between" style={{ color: T.dim }}>
                  <span>Setup Strategy:</span>
                  <span className="font-semibold" style={{ color: T.text }}>{selectedTrade.setup || '—'}</span>
                </div>
                <div className="flex justify-between" style={{ color: T.dim }}>
                  <span>Emotion State:</span>
                  <span className="font-semibold" style={{ color: T.text }}>{selectedTrade.emotion || '—'}</span>
                </div>
                {holdMs(selectedTrade) > 0 && (
                  <div className="flex justify-between" style={{ color: T.dim }}>
                    <span>Duration Held:</span>
                    <span className="font-semibold" style={{ color: T.text, ...mono }}>{fmtDuration(holdMs(selectedTrade))}</span>
                  </div>
                )}
              </div>

              {selectedTrade.notes && (
                <div className="pt-2 border-t text-xs" style={{ borderColor: T.line }}>
                  <div className="uppercase tracking-wider font-semibold mb-1" style={{ color: T.faint }}>Trade Notes</div>
                  <div className="p-2 rounded leading-relaxed text-xs" style={{ background: T.surface2, color: T.dim }}>
                    {selectedTrade.notes}
                  </div>
                </div>
              )}

              {onOpenTrade && selectedTrade.id !== 'demo-sample' && (
                <button
                  type="button"
                  onClick={() => onOpenTrade(selectedTrade)}
                  className="w-full py-2 rounded-lg text-xs font-semibold mt-2 transition-opacity hover:opacity-80"
                  style={{ background: T.surface2, color: T.accent, border: `1px solid ${T.line}` }}
                >
                  Edit Full Trade Details & Screenshots
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

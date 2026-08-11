import React, { useState, useMemo, useRef, useEffect, Component } from 'react'
import { T, mono } from '../theme.js'
import { fmt$, fmtN, holdMs, fmtDuration } from '../utils.js'
import { TradeChart } from '../components/TradeChart.jsx'
import { formatTradingViewSymbol, toTimestamp } from '../utils/tradeChartUtils.js'
import { instrumentRootSymbol } from '../workflow.js'
import { LineChart, Search, AlertCircle, ExternalLink, Maximize2, ChevronDown, Check, Edit3, Lock, Save, Globe, CandlestickChart } from 'lucide-react'

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
  notes: 'Sample trade execution. Log or import your trades to see your exact price action!',
  timestamp: new Date().toISOString().slice(0, 16).replace('T', ' ')
}

const DEFAULT_QUICK_SYMBOLS = ['CME_MINI:NQ1!', 'CME_MINI:ES1!', 'BINANCE:BTCUSDT', 'NASDAQ:AAPL', 'NASDAQ:TSLA']

export function ChartTab({ trades = [], onOpenTrade, onUpdateTrade }) {
  return (
    <ChartErrorBoundary>
      <ChartTabContent trades={trades} onOpenTrade={onOpenTrade} onUpdateTrade={onUpdateTrade} />
    </ChartErrorBoundary>
  )
}

/**
 * Interactive Searchable Trade Combobox Dropdown
 */
function TradePickerCombobox({ trades = [], selectedId, onSelectTrade, barMatchedIds }) {
  // Deliberately understated: this means bars exist for that window, not that
  // they are the right contract. A reassuring badge would overclaim.
  const hasBars = (id) => barMatchedIds?.has(String(id))
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef(null)

  const selectedTrade = useMemo(() => {
    return trades.find((t) => String(t.id) === String(selectedId)) || trades[0]
  }, [trades, selectedId])

  const matchingTrades = useMemo(() => {
    if (!searchQuery.trim()) return trades
    const q = searchQuery.toLowerCase().trim()
    return trades.filter((t) => {
      if (!t) return false
      const sym = String(t.symbol || '').toLowerCase()
      const setup = String(t.setup || '').toLowerCase()
      const date = String(t.timestamp || '').toLowerCase()
      const pnl = String(t.pnl || '').toLowerCase()
      const dir = String(t.direction || '').toLowerCase()
      const notes = String(t.notes || '').toLowerCase()
      return sym.includes(q) || setup.includes(q) || date.includes(q) || pnl.includes(q) || dir.includes(q) || notes.includes(q)
    })
  }, [trades, searchQuery])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative inline-block text-left" style={{ minWidth: 260 }}>
      {/* Combobox Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
        style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text, ...mono }}
      >
        <div className="flex items-center gap-1.5 truncate">
          <Search size={13} style={{ color: T.faint, flexShrink: 0 }} />
          {selectedTrade ? (
            <span className="truncate">
              {String(selectedTrade.timestamp || '').slice(0, 10)} · <strong style={{ color: T.text }}>{selectedTrade.symbol || 'Trade'}</strong> ({selectedTrade.direction || 'Long'}) <span style={{ color: (Number(selectedTrade.pnl) || 0) >= 0 ? T.up : T.down }}>({(Number(selectedTrade.pnl) || 0) >= 0 ? '+' : ''}{fmt$(Number(selectedTrade.pnl) || 0)})</span>
            </span>
          ) : (
            <span style={{ color: T.faint }}>Select trade...</span>
          )}
          {/* Repeated on the closed picker so the state is visible without
              opening the list. */}
          {selectedTrade && hasBars(selectedTrade.id) && (
            <CandlestickChart size={12} style={{ color: '#34d399', flexShrink: 0 }} title="Imported bars cover this trade" />
          )}
        </div>
        <ChevronDown size={14} style={{ color: T.faint, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {/* Combobox Dropdown Panel */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl z-50 p-2 space-y-2 overflow-hidden"
          style={{ background: T.surface, border: `1px solid ${T.line}` }}
        >
          {/* Live Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5" style={{ color: T.faint }} />
            <input
              type="text"
              autoFocus
              placeholder="Search symbol, setup, date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
              style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.text }}
            />
          </div>

          {/* Trade List */}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {matchingTrades.length === 0 ? (
              <div className="p-3 text-center text-xs" style={{ color: T.faint }}>
                No trades match "{searchQuery}"
              </div>
            ) : (
              matchingTrades.map((t) => {
                const isSelected = String(t.id) === String(selectedId)
                const isWin = (Number(t.pnl) || 0) >= 0
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      onSelectTrade(t.id)
                      setIsOpen(false)
                    }}
                    className="flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors"
                    style={{
                      background: isSelected ? 'rgba(96, 165, 250, 0.12)' : 'transparent',
                      border: isSelected ? `1px solid rgba(96, 165, 250, 0.3)` : '1px solid transparent'
                    }}
                  >
                    <div className="space-y-0.5 truncate pr-2">
                      <div className="font-semibold flex items-center gap-1.5 truncate">
                        <span>{t.symbol || 'Trade'}</span>
                        {hasBars(t.id) && (
                          <span
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                            style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}
                            title="Imported bars cover this trade — the chart can show real candles"
                          >
                            <CandlestickChart size={10} /> bars
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded" style={{ background: t.direction === 'Short' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: t.direction === 'Short' ? T.down : T.up }}>
                          {t.direction || 'Long'}
                        </span>
                        {t.setup && <span className="text-[10px] font-normal" style={{ color: T.dim }}>({t.setup})</span>}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: T.faint }}>
                        {String(t.timestamp || '').slice(0, 16)}
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-bold" style={mono}>
                      <div style={{ color: isWin ? T.up : T.down }}>
                        {isWin ? '+' : ''}{fmt$(Number(t.pnl) || 0)}
                      </div>
                      {isSelected && <Check size={12} className="ml-auto mt-0.5" style={{ color: T.accentText }} />}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChartTabContent({ trades = [], onOpenTrade, onUpdateTrade }) {
  const [viewMode, setViewMode] = useState('candles') // 'candles' | 'live'
  const [liveSymbol, setLiveSymbol] = useState('CME_MINI:NQ1!')

  const [quickSymbols, setQuickSymbols] = useState(() => {
    try {
      const stored = localStorage.getItem('th_quick_symbols')
      return stored ? JSON.parse(stored) : DEFAULT_QUICK_SYMBOLS
    } catch {
      return DEFAULT_QUICK_SYMBOLS
    }
  })
  // Set when the live chart was opened from a specific trade, so we can point
  // the trader at the moment to scroll back to.
  const [liveOrigin, setLiveOrigin] = useState(null)
  const [editingSymbols, setEditingSymbols] = useState(false)
  const [symbolDraft, setSymbolDraft] = useState('')
  const [isSolidifying, setIsSolidifying] = useState(false)

  // Sort trades descending by timestamp so the latest trade is always first
  const safeTrades = useMemo(() => {
    const list = Array.isArray(trades) && trades.length > 0 ? trades : [SAMPLE_DEMO_TRADE]
    return [...list].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
  }, [trades])

  // Which trades have imported bars behind them. One round trip for the whole
  // list, so the picker can mark them without a query per row.
  const [barMatchedIds, setBarMatchedIds] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    if (!window.api?.matchTradesToBars) return undefined

    const items = safeTrades
      .map((t) => {
        const root = instrumentRootSymbol(t.symbol)
        const entry = toTimestamp(t.entryTime || t.timestamp, 0)
        if (!root || !entry) return null
        const exit = t.exitTime ? toTimestamp(t.exitTime, entry) : entry
        return { id: String(t.id), root, from: entry, to: Math.max(exit, entry) }
      })
      .filter(Boolean)

    if (items.length === 0) {
      setBarMatchedIds(new Set())
      return undefined
    }

    window.api
      .matchTradesToBars(items)
      .then((ids) => { if (!cancelled) setBarMatchedIds(new Set((ids || []).map(String))) })
      .catch(() => { if (!cancelled) setBarMatchedIds(new Set()) })

    return () => { cancelled = true }
  }, [safeTrades])

  const [selectedId, setSelectedId] = useState(() => safeTrades[0]?.id || 'demo-sample')
  const [symbolFilter, setSymbolFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('all')

  useEffect(() => {
    if (safeTrades[0]?.id) {
      setSelectedId(safeTrades[0].id)
    }
  }, [trades])

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
    return safeTrades.find((t) => String(t?.id) === String(selectedId)) || filteredTrades[0] || safeTrades[0] || SAMPLE_DEMO_TRADE
  }, [safeTrades, selectedId, filteredTrades])

  // Form State for Solidifying Execution Table
  const [editForm, setEditForm] = useState({
    symbol: '',
    direction: 'Long',
    entry: '',
    exit: '',
    stop: '',
    target: '',
    pnl: ''
  })

  useEffect(() => {
    if (selectedTrade) {
      setEditForm({
        symbol: selectedTrade.symbol || 'ES_F',
        direction: selectedTrade.direction || 'Long',
        entry: selectedTrade.entry || '',
        exit: selectedTrade.exit || '',
        stop: selectedTrade.stop || '',
        target: selectedTrade.target || '',
        pnl: selectedTrade.pnl || ''
      })
    }
  }, [selectedTrade])

  const handleSaveExecutionTable = () => {
    if (!selectedTrade) return
    const updated = {
      ...selectedTrade,
      symbol: editForm.symbol.trim().toUpperCase(),
      direction: editForm.direction,
      entry: Number(editForm.entry) || 0,
      exit: Number(editForm.exit) || 0,
      stop: editForm.stop ? Number(editForm.stop) : null,
      target: editForm.target ? Number(editForm.target) : null,
      pnl: Number(editForm.pnl) || 0
    }
    if (onUpdateTrade) {
      onUpdateTrade(updated)
    }
    setIsSolidifying(false)
  }

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

  const saveQuickSymbols = (newList) => {
    setQuickSymbols(newList)
    try {
      localStorage.setItem('th_quick_symbols', JSON.stringify(newList))
    } catch {}
  }

  /**
   * Jump from a trade's execution map to the live chart for that instrument.
   *
   * TradingView's embed cannot be pointed at an absolute date, so rather than
   * pretend it lands on the trade, the banner says which moment to scroll back
   * to and the trade stays selected underneath.
   */
  const handleViewLive = (symbol, trade) => {
    if (symbol) setLiveSymbol(symbol)
    setLiveOrigin(trade ? { symbol, when: trade.entryTime || trade.timestamp || '', label: trade.symbol || symbol } : null)
    setViewMode('live')
  }

  const addSymbol = () => {
    const s = symbolDraft.trim().toUpperCase()
    if (!s) return
    // Let the instrument classifier pick the exchange. Assuming NASDAQ turned
    // every future into a symbol TradingView cannot resolve (ES -> NASDAQ:ES).
    const formatted = s.includes(':') ? s : formatTradingViewSymbol(s)
    if (!quickSymbols.includes(formatted)) {
      saveQuickSymbols([...quickSymbols, formatted])
    }
    setLiveSymbol(formatted)
    setSymbolDraft('')
  }

  return (
    <div className="th-page th-page-chart space-y-4">
      {/* Top Header / Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <LineChart size={20} style={{ color: T.accentText }} />
            <span className="font-semibold text-base">Chart Workstation</span>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: T.surface2, border: `1px solid ${T.line}` }}>
            {/* The chart uses imported candles when available and falls back to
                the locally generated execution path when no bars cover it. */}
            <button
              type="button"
              onClick={() => { setLiveOrigin(null); setViewMode('candles') }}
              title="Show candles from bars you imported in Settings → Chart data"
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors"
              style={{
                background: viewMode === 'candles' ? T.accent : 'transparent',
                color: viewMode === 'candles' ? '#1A1306' : T.dim
              }}
            >
              <CandlestickChart size={13} /> Imported Candles
            </button>
            <button
              type="button"
              onClick={() => { setLiveOrigin(null); setViewMode('live') }}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded font-medium transition-colors"
              style={{
                background: viewMode === 'live' ? T.accent : 'transparent',
                color: viewMode === 'live' ? '#1A1306' : T.dim
              }}
            >
              <Globe size={13} /> Live Market View
            </button>
          </div>
        </div>

        {/* Dynamic Controls based on view mode */}
        {viewMode === 'live' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: T.faint }}>Quick Symbols:</span>
            {quickSymbols.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLiveSymbol(s)}
                className="px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                style={{
                  background: liveSymbol === s ? T.accent : T.surface2,
                  color: liveSymbol === s ? '#1A1306' : T.text,
                  border: `1px solid ${T.line}`,
                  ...mono
                }}
              >
                {s.split(':')[1] || s}
              </button>
            ))}

            {editingSymbols ? (
              <>
                <input
                  value={symbolDraft}
                  onChange={(e) => setSymbolDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSymbol() } }}
                  placeholder="EXCHANGE:SYMBOL"
                  className="px-2 py-1 rounded text-[11px] w-40"
                  style={{ background: T.bg, color: T.text, border: `1px solid ${T.line}` }}
                />
                <button type="button" onClick={addSymbol} className="px-2 py-1 rounded text-[11px] font-semibold"
                  style={{ background: T.accent, color: '#1A1306', border: 'none' }}>Add</button>
                <button type="button" onClick={() => { setEditingSymbols(false); setSymbolDraft('') }}
                  className="px-2 py-1 rounded text-[11px]" style={{ color: T.dim, background: 'transparent', border: `1px solid ${T.line}` }}>Done</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditingSymbols(true)}
                className="px-2 py-1 rounded text-[11px]" style={{ color: T.faint, background: 'transparent', border: `1px dashed ${T.line}` }}>Edit</button>
            )}
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
                style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}
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

            {/* Searchable Trade Picker Combobox Dropdown */}
            <TradePickerCombobox
              trades={filteredTrades}
              selectedId={selectedTrade?.id}
              onSelectTrade={setSelectedId}
              barMatchedIds={barMatchedIds}
            />
          </div>
        )}
      </div>

      {/* Main View Container */}
      {viewMode === 'live' ? (
        <div className="w-full space-y-2">
          {liveOrigin && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)', color: T.text }}>
              <span>
                Live chart for <strong>{liveOrigin.label}</strong>. This is real market data — scroll back to{' '}
                <strong style={mono}>{liveOrigin.when || 'the trade date'}</strong> to see the price action around your trade.
              </span>
              <button
                onClick={() => { setLiveOrigin(null); setViewMode('candles') }}
                className="px-2 py-1 rounded font-semibold shrink-0"
                style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.dim }}
              >
                Back to chart
              </button>
            </div>
          )}
          <TradeChart mode="live" liveSymbol={liveSymbol} height={620} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Chart Area (3 Columns) */}
          <div className="lg:col-span-3">
            <TradeChart
              mode="trade"
              trade={selectedTrade}
              height={580}
              onViewLive={handleViewLive}
              preferCandles={viewMode === 'candles'}
            />
          </div>

          {/* Trade Specs & Details Sidebar (1 Column) */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: T.line }}>
                <div>
                  <div className="text-lg font-bold flex items-center gap-1.5">
                    {selectedTrade.symbol || 'Trade'}
                    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: selectedTrade.direction === 'Short' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: selectedTrade.direction === 'Short' ? T.down : T.up }}>
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

              {/* Solidify & Lock Execution Table Action */}
              <div className="pt-2 border-t" style={{ borderColor: T.line }}>
                <button
                  type="button"
                  onClick={() => setIsSolidifying(!isSolidifying)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: isSolidifying ? 'rgba(96, 165, 250, 0.2)' : T.surface2,
                    color: isSolidifying ? T.accentText : T.text,
                    border: `1px solid ${isSolidifying ? T.accent : T.line}`
                  }}
                >
                  <Lock size={13} style={{ color: T.accentText }} />
                  {isSolidifying ? 'Close Execution Solidifier' : 'Solidify Execution Table'}
                </button>
              </div>

              {/* Inline Execution Solidifier Form */}
              {isSolidifying && (
                <div className="p-3 rounded-lg space-y-2.5 border mt-2 text-xs" style={{ background: T.surface2, borderColor: T.line }}>
                  <div className="font-semibold flex items-center gap-1" style={{ color: T.accentText }}>
                    <Edit3 size={13} /> Solidify Trade Parameters
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Symbol</label>
                      <input
                        type="text"
                        value={editForm.symbol}
                        onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Direction</label>
                      <select
                        value={editForm.direction}
                        onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text }}
                      >
                        <option value="Long">Long</option>
                        <option value="Short">Short</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Entry Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.entry}
                        onChange={(e) => setEditForm({ ...editForm, entry: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Exit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.exit}
                        onChange={(e) => setEditForm({ ...editForm, exit: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Stop Loss</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.stop}
                        onChange={(e) => setEditForm({ ...editForm, stop: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Take Profit</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.target}
                        onChange={(e) => setEditForm({ ...editForm, target: e.target.value })}
                        className="w-full px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold mb-0.5" style={{ color: T.faint }}>Net P&L ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.pnl}
                      onChange={(e) => setEditForm({ ...editForm, pnl: e.target.value })}
                      className="w-full px-2 py-1 rounded text-xs font-semibold"
                      style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, ...mono }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveExecutionTable}
                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded font-semibold text-xs transition-opacity hover:opacity-90 mt-1"
                    style={{ background: T.accent, color: '#1A1306' }}
                  >
                    <Save size={13} /> Save & Lock Chart Execution
                  </button>
                </div>
              )}

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
                  style={{ background: T.surface2, color: T.accentText, border: `1px solid ${T.line}` }}
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

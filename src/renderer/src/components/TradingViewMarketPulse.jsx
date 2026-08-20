import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from 'lucide-react'
import { T, mono } from '../theme.js'
import { TradeChart } from './TradeChart.jsx'
import { MarketSessionTracker } from './MarketSessionTracker.jsx'
import {
  DEFAULT_MARKET_PULSE_MARKETS,
  MARKET_PULSE_STORAGE_KEY,
  MARKET_PULSE_WATCHLIST_EVENT,
  MAX_MARKET_PULSE_ITEMS,
  createMarketPulseItem,
  normalizeMarketPulseItem,
  normalizeMarketPulseLabel,
  normalizeMarketPulseWatchlist,
  sanitizeTradingViewSymbol,
  searchMarketPulseMarkets
} from './marketPulseWatchlist.js'

function widgetDocument(script, config, height) {
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <style>
      html, body, .tradingview-widget-container, .tradingview-widget-container__widget {
        width: 100%; height: ${height}px; margin: 0; overflow: hidden; background: #111113;
      }
    </style>
  </head>
  <body>
    <div class="tradingview-widget-container">
      <div class="tradingview-widget-container__widget"></div>
      <script type="text/javascript" src="${script}" async>${json}</script>
    </div>
  </body>
</html>`
}

function TradingViewFrame({ title, srcDoc, height, interactive = true }) {
  return (
    <iframe
      title={title}
      srcDoc={srcDoc}
      className="block w-full"
      style={{ height, border: 0, background: '#111113', pointerEvents: interactive ? 'auto' : 'none' }}
      sandbox="allow-scripts allow-same-origin allow-forms"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={interactive ? 0 : -1}
    />
  )
}

export function TradingViewMarketPulse() {
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return normalizeMarketPulseWatchlist(window.localStorage.getItem(MARKET_PULSE_STORAGE_KEY))
    } catch {
      return normalizeMarketPulseWatchlist(null)
    }
  })
  const [selectedMarket, setSelectedMarket] = useState(() => watchlist[0]?.chartSymbol || '')
  const [editingWatchlist, setEditingWatchlist] = useState(false)
  const [labelDrafts, setLabelDrafts] = useState({})
  const [newLabel, setNewLabel] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false)
  const [watchlistError, setWatchlistError] = useState('')

  const activeMarket = watchlist.find((market) => market.chartSymbol === selectedMarket) || watchlist[0]
  const activeChartSymbol = sanitizeTradingViewSymbol(activeMarket?.chartSymbol) || 'BITSTAMP:BTCUSD'
  const activeTechnicalSymbol = sanitizeTradingViewSymbol(activeMarket?.technicalSymbol) || activeChartSymbol
  const symbolSuggestions = useMemo(
    () => searchMarketPulseMarkets(newSymbol, watchlist.map((market) => market.chartSymbol)),
    [newSymbol, watchlist]
  )

  useEffect(() => {
    if (!watchlist.some((market) => market.chartSymbol === selectedMarket)) {
      setSelectedMarket(watchlist[0]?.chartSymbol || '')
    }
  }, [watchlist, selectedMarket])

  const saveWatchlist = (next) => {
    const normalized = normalizeMarketPulseWatchlist(next)
    setWatchlist(normalized)
    try {
      window.localStorage.setItem(MARKET_PULSE_STORAGE_KEY, JSON.stringify(normalized))
    } catch {}
    window.dispatchEvent(new CustomEvent(MARKET_PULSE_WATCHLIST_EVENT, { detail: normalized }))
    return normalized
  }

  const openWatchlistEditor = () => {
    setLabelDrafts(Object.fromEntries(watchlist.map((market) => [market.chartSymbol, market.label])))
    setWatchlistError('')
    setEditingWatchlist(true)
  }

  const addMarket = (event) => {
    event.preventDefault()
    if (watchlist.length >= MAX_MARKET_PULSE_ITEMS) {
      setWatchlistError(`Watchlists are limited to ${MAX_MARKET_PULSE_ITEMS} markets.`)
      return
    }
    const matchingPreset = selectedPreset?.chartSymbol === sanitizeTradingViewSymbol(newSymbol)
      ? selectedPreset
      : (!newSymbol.includes(':') ? symbolSuggestions[0] : null)
    const market = matchingPreset
      ? normalizeMarketPulseItem({ ...matchingPreset, label: newLabel || matchingPreset.label })
      : createMarketPulseItem(newLabel, newSymbol)
    if (!market) {
      setWatchlistError('Pick a suggested market, or use a full TradingView symbol such as NASDAQ:AAPL.')
      return
    }
    if (watchlist.some((item) => item.chartSymbol === market.chartSymbol)) {
      setWatchlistError(`${market.chartSymbol} is already in this watchlist.`)
      return
    }
    saveWatchlist([...watchlist, market])
    setSelectedMarket(market.chartSymbol)
    setLabelDrafts((current) => ({ ...current, [market.chartSymbol]: market.label }))
    setNewLabel('')
    setNewSymbol('')
    setSelectedPreset(null)
    setShowSymbolSuggestions(false)
    setWatchlistError('')
  }

  const chooseMarketPreset = (market) => {
    setSelectedPreset(market)
    setNewLabel(market.label)
    setNewSymbol(market.chartSymbol)
    setShowSymbolSuggestions(false)
    setWatchlistError('')
  }

  const removeMarket = (chartSymbol) => {
    if (watchlist.length <= 1) {
      setWatchlistError('Keep at least one market in the watchlist.')
      return
    }
    const next = watchlist.filter((market) => market.chartSymbol !== chartSymbol)
    saveWatchlist(next)
    if (selectedMarket === chartSymbol) setSelectedMarket(next[0].chartSymbol)
    setWatchlistError('')
  }

  const moveMarket = (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= watchlist.length) return
    const next = [...watchlist]
    const [market] = next.splice(index, 1)
    next.splice(target, 0, market)
    saveWatchlist(next)
  }

  const saveMarketLabel = (market) => {
    const label = normalizeMarketPulseLabel(labelDrafts[market.chartSymbol], market.label)
    saveWatchlist(watchlist.map((item) => item.chartSymbol === market.chartSymbol ? { ...item, label } : item))
    setLabelDrafts((current) => ({ ...current, [market.chartSymbol]: label }))
  }

  const resetWatchlist = () => {
    const defaults = DEFAULT_MARKET_PULSE_MARKETS.map((market) => ({ ...market }))
    saveWatchlist(defaults)
    setSelectedMarket(defaults[0].chartSymbol)
    setLabelDrafts(Object.fromEntries(defaults.map((market) => [market.chartSymbol, market.label])))
    setWatchlistError('')
  }

  const tickerDoc = useMemo(() => widgetDocument(
    'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',
    {
      symbols: watchlist.map((market) => ({ proName: market.tickerSymbol, title: market.label })),
      showSymbolLogo: false,
      isTransparent: false,
      displayMode: 'adaptive',
      colorTheme: 'dark',
      locale: 'en'
    },
    78
  ), [watchlist])

  const technicalDoc = useMemo(() => widgetDocument(
    'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js',
    {
      interval: '1h',
      width: '100%',
      height: '100%',
      isTransparent: false,
      symbol: activeTechnicalSymbol,
      showIntervalTabs: true,
      displayMode: 'single',
      locale: 'en',
      colorTheme: 'dark'
    },
    466
  ), [activeTechnicalSymbol])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div>
          <div className="text-sm font-semibold">Account-free market pulse</div>
          <div className="mt-0.5 text-xs" style={{ color: T.faint }}>The live tape is view-only. Choose a market here to update both panels.</div>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
          {watchlist.map((market) => {
            const selected = market.chartSymbol === activeMarket.chartSymbol
            return (
              <button key={market.chartSymbol} type="button" onClick={() => setSelectedMarket(market.chartSymbol)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
                style={{ background: selected ? T.accent : T.surface2, color: selected ? '#1A1306' : T.dim, border: `1px solid ${selected ? T.accent : T.line}` }}>
                {market.label}
              </button>
            )
          })}
          <button type="button" onClick={editingWatchlist ? () => setEditingWatchlist(false) : openWatchlistEditor}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            style={{ background: editingWatchlist ? T.surface2 : 'transparent', color: editingWatchlist ? T.text : T.faint, border: `1px solid ${T.line}` }}>
            <Settings2 size={12} /> {editingWatchlist ? 'Done' : 'Watchlist'}
          </button>
        </div>
      </div>

      {editingWatchlist && (
        <section aria-label="Edit Market Pulse watchlist" className="space-y-3 rounded-lg p-3" style={{ background: T.surface }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold">Your markets</div>
              <div className="mt-0.5 text-[11px]" style={{ color: T.faint }}>Names and order are saved on this device.</div>
            </div>
            <button type="button" onClick={resetWatchlist} className="text-xs" style={{ color: T.accentText }}>Reset defaults</button>
          </div>

          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {watchlist.map((market, index) => (
              <div key={market.chartSymbol} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5" style={{ background: T.surface2 }}>
                <input
                  aria-label={`Display name for ${market.chartSymbol}`}
                  value={labelDrafts[market.chartSymbol] ?? market.label}
                  onChange={(event) => setLabelDrafts((current) => ({ ...current, [market.chartSymbol]: event.target.value }))}
                  onBlur={() => saveMarketLabel(market)}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  maxLength={28}
                  className="min-w-0 flex-1 rounded px-2 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2"
                  style={{ background: T.bg, color: T.text, border: `1px solid ${T.line}` }}
                />
                <span title={market.chartSymbol} className="max-w-32 truncate text-[10px]" style={{ ...mono, color: T.faint }}>{market.chartSymbol}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={index === 0} onClick={() => moveMarket(index, -1)} aria-label={`Move ${market.label} left`}
                    className="rounded p-1" style={{ color: T.faint, opacity: index === 0 ? 0.3 : 1 }}><ChevronLeft size={13} /></button>
                  <button type="button" disabled={index === watchlist.length - 1} onClick={() => moveMarket(index, 1)} aria-label={`Move ${market.label} right`}
                    className="rounded p-1" style={{ color: T.faint, opacity: index === watchlist.length - 1 ? 0.3 : 1 }}><ChevronRight size={13} /></button>
                  <button type="button" disabled={watchlist.length <= 1} onClick={() => removeMarket(market.chartSymbol)} aria-label={`Remove ${market.label}`}
                    className="rounded p-1" style={{ color: T.down, opacity: watchlist.length <= 1 ? 0.3 : 1 }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={addMarket} className="grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(120px,0.6fr)_minmax(220px,1fr)_auto]">
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} maxLength={28} placeholder="Display name (optional)"
              className="rounded-md px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2" style={{ background: T.bg, color: T.text, border: `1px solid ${T.line}` }} />
            <div className="relative min-w-0">
              <input
                value={newSymbol}
                onFocus={() => setShowSymbolSuggestions(true)}
                onChange={(event) => {
                  if (selectedPreset && newLabel === selectedPreset.label) setNewLabel('')
                  setNewSymbol(event.target.value)
                  setSelectedPreset(null)
                  setShowSymbolSuggestions(true)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowSymbolSuggestions(false)
                }}
                maxLength={64}
                placeholder="Search BTC, EURUSD, NQ..."
                role="combobox"
                aria-label="Find a market"
                aria-autocomplete="list"
                aria-expanded={showSymbolSuggestions && symbolSuggestions.length > 0}
                aria-controls="market-pulse-symbol-suggestions"
                className="w-full rounded-md px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
                style={{ ...mono, background: T.bg, color: T.text, border: `1px solid ${T.line}` }}
              />
              {showSymbolSuggestions && symbolSuggestions.length > 0 && (
                <div id="market-pulse-symbol-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md shadow-xl"
                  style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                  {symbolSuggestions.map((market) => (
                    <button
                      key={market.chartSymbol}
                      type="button"
                      role="option"
                      aria-selected={selectedPreset?.chartSymbol === market.chartSymbol}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseMarketPreset(market)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium" style={{ color: T.text }}>{market.label}</span>
                        <span className="block truncate text-[10px]" style={{ color: T.faint }}>{market.category}</span>
                      </span>
                      <span className="shrink-0 text-[10px]" style={{ ...mono, color: T.dim }}>{market.chartSymbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{ background: T.accent, color: '#1A1306' }}><Plus size={13} /> Add market</button>
          </form>
          <div className="flex flex-wrap items-start justify-between gap-2 text-[11px]">
            <span style={{ color: watchlistError ? T.down : T.faint }}>{watchlistError || 'Search by a familiar name or shorthand. Full TradingView symbols still work.'}</span>
            <span style={{ ...mono, color: T.faint }}>{watchlist.length}/{MAX_MARKET_PULSE_ITEMS}</span>
          </div>
        </section>
      )}

      <MarketSessionTracker />

      <div className="overflow-hidden rounded-lg" style={{ background: '#111113' }}>
        <TradingViewFrame title="Account-free market ticker powered by TradingView" srcDoc={tickerDoc} height={78} interactive={false} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(310px,1fr)] gap-3">
        <div>
          <TradeChart mode="live" liveSymbol={activeChartSymbol} height={530} />
        </div>

        <section className="overflow-hidden rounded-xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div className="text-sm font-semibold">TradingView Technical Summary</div>
            <div className="mt-1 text-xs flex items-center justify-between gap-3" style={{ color: T.faint }}>
              <span>Indicator consensus, not a TradeHelp trade signal</span>
              <span style={mono}>{activeMarket.label}</span>
            </div>
          </div>
          <TradingViewFrame title={`TradingView technical summary for ${activeTechnicalSymbol}`} srcDoc={technicalDoc} height={466} />
        </section>
      </div>

      <p className="px-1 text-[11px]" style={{ color: T.faint }}>
        Hosted by TradingView. Index and spot symbols are market-context proxies, not CME futures contracts. Availability and delay vary by venue. No brokerage or data-provider account is required.
      </p>
    </div>
  )
}

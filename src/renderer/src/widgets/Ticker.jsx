import React, { useEffect, useMemo, useState } from 'react'
import {
  MARKET_PULSE_STORAGE_KEY,
  MARKET_PULSE_WATCHLIST_EVENT,
  normalizeMarketPulseWatchlist
} from '../components/marketPulseWatchlist.js'

function loadWatchlist() {
  try {
    return normalizeMarketPulseWatchlist(window.localStorage.getItem(MARKET_PULSE_STORAGE_KEY))
  } catch {
    return normalizeMarketPulseWatchlist(null)
  }
}

export function persistentTickerSymbols(watchlist) {
  const symbols = normalizeMarketPulseWatchlist(watchlist).map((market) => market.tickerSymbol).filter(Boolean)
  return [...new Set(symbols)].slice(0, 12)
}

function tickerDocument(symbols) {
  const tickers = symbols
    .map((symbol) => `<tv-ticker-tag theme="dark" symbol="${symbol}"></tv-ticker-tag>`)
    .join('')
  const duration = Math.max(38, symbols.length * 8)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111113; color-scheme: dark; }
      .ticker-viewport { width: 100%; height: 100%; overflow: hidden; }
      .ticker-track { display: flex; width: max-content; height: 100%; align-items: center; animation: ticker-scroll ${duration}s linear infinite; }
      .ticker-segment { display: flex; flex: none; height: 100%; align-items: center; }
      tv-ticker-tag {
        display: block; flex: 0 0 210px; width: 210px; min-width: 210px; overflow: hidden;
        --tv-widget-background-color: #111113;
        --tv-widget-text-color: #ddd9d1;
        --tv-widget-accent-color: #e3ad45;
        --tv-widget-font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      @keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @media (prefers-reduced-motion: reduce) { .ticker-track { animation: none; } .ticker-segment[aria-hidden="true"] { display: none; } }
    </style>
    <script>
      document.addEventListener('tv-link-open', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    </script>
    <script type="module" src="https://widgets.tradingview-widget.com/w/en/tv-ticker-tag.js"></script>
  </head>
  <body>
    <div class="ticker-viewport">
      <div class="ticker-track">
        <div class="ticker-segment">${tickers}</div>
        <div class="ticker-segment" aria-hidden="true">${tickers}</div>
      </div>
    </div>
  </body>
</html>`
}

export function Ticker({ settings, onOpenMarketPulse }) {
  const [watchlist, setWatchlist] = useState(loadWatchlist)
  const enabled = (settings?.tickerEnabled ?? 'true') !== 'false'

  useEffect(() => {
    const syncFromEvent = (event) => setWatchlist(normalizeMarketPulseWatchlist(event.detail))
    const syncFromStorage = (event) => {
      if (event.key === MARKET_PULSE_STORAGE_KEY) setWatchlist(loadWatchlist())
    }
    window.addEventListener(MARKET_PULSE_WATCHLIST_EVENT, syncFromEvent)
    window.addEventListener('storage', syncFromStorage)
    return () => {
      window.removeEventListener(MARKET_PULSE_WATCHLIST_EVENT, syncFromEvent)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [])

  const symbols = useMemo(() => persistentTickerSymbols(watchlist), [watchlist])
  const srcDoc = useMemo(() => tickerDocument(symbols), [symbols])

  if (!enabled || symbols.length === 0) return null
  const openMarketPulse = () => onOpenMarketPulse?.()
  return (
    <section
      className="th-global-market-ticker"
      role="button"
      tabIndex={0}
      aria-label="Open Market Pulse"
      title="Open the full Market Pulse view"
      onClick={openMarketPulse}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openMarketPulse()
        }
      }}
    >
      <div className="th-global-market-ticker-label" aria-hidden="true">
        <span className="th-global-market-ticker-dot" />
        Markets
      </div>
      <iframe
        title="Persistent market ticker powered by TradingView"
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />
    </section>
  )
}

import React, { useMemo } from 'react'
import { T } from '../theme.js'

const NEWS_MARKETS = [
  'FOREXCOM:SPXUSD',
  'FOREXCOM:NSXUSD',
  'FX:EURUSD',
  'BITSTAMP:BTCUSD',
  'BITSTAMP:ETHUSD',
  'TVC:GOLD'
]

function marketBoardDocument() {
  const tickers = NEWS_MARKETS
    .map((symbol) => `<tv-ticker-tag theme="dark" symbol="${symbol}"></tv-ticker-tag>`)
    .join('')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111113; color-scheme: dark; }
      .market-board {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        align-items: center;
        gap: 8px;
        --tv-widget-background-color: #111113;
        --tv-widget-text-color: #ddd9d1;
        --tv-widget-accent-color: #e3ad45;
        --tv-widget-font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      tv-ticker-tag { display: block; min-width: 0; width: 100%; }
      .placeholder { padding: 24px; color: #858078; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
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
    <div class="market-board">
      ${tickers}
    </div>
  </body>
</html>`
}

export function NewsMarketBoard() {
  const srcDoc = useMemo(marketBoardDocument, [])

  return (
    <section aria-labelledby="news-market-board-title" className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h3 id="news-market-board-title" className="text-sm font-semibold">Markets now</h3>
          <p className="mt-0.5 text-xs" style={{ color: T.faint }}>A fixed cross-market read before the calendar and briefing.</p>
        </div>
        <span className="text-[11px]" style={{ color: T.faint }}>View-only quotes by TradingView</span>
      </div>
      <div className="overflow-hidden rounded-lg" style={{ background: '#111113' }}>
        <iframe
          title="Live cross-market quote board powered by TradingView"
          srcDoc={srcDoc}
          className="block w-full"
          style={{ height: 52, border: 0, background: '#111113', pointerEvents: 'none' }}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={-1}
        />
      </div>
    </section>
  )
}

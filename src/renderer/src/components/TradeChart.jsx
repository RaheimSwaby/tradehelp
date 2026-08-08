import React, { useEffect, useRef, useState } from 'react'
import { createChart, LineSeries, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts'
import {
  buildExecutionPath,
  buildExecutionSeries,
  CONTEXT_PADDING,
  TRADE_FIT_PADDING,
  hasExecutionPrices,
  getExecutionPriceRange,
  formatLocalDateTime,
  formatLocalTick,
  generateTradeMarkers,
  getPriceLineConfigs,
  formatTradingViewSymbol
} from '../utils/tradeChartUtils.js'
import { barsCoverTrade } from '../utils/barImport.js'
import { instrumentRootSymbol } from '../workflow.js'
import { localTimeZone } from '../importTimezone.js'
import { ChartDrawingOverlay } from './ChartDrawingOverlay.jsx'

const SAMPLE_FALLBACK_TRADE = {
  symbol: 'ES_F',
  direction: 'Long',
  entry: 5200.0,
  exit: 5225.0,
  stop: 5185.0,
  target: 5250.0,
  pnl: 1250.0,
  timestamp: new Date().toISOString()
}

export function TradeChart({ trade = SAMPLE_FALLBACK_TRADE, height = 550, mode = 'live', liveSymbol = 'CME_MINI:NQ1!', onViewLive, preferCandles = false }) {
  if (mode === 'live') {
    const targetSymbol = formatTradingViewSymbol(liveSymbol || trade?.symbol)
    return <LiveTradingViewWidget symbol={targetSymbol} height={height} />
  }

  return <LocalTradeExecutionChart trade={trade} height={height} onViewLive={onViewLive} preferCandles={preferCandles} />
}

/**
 * Official Live TradingView Widget Embed Component
 * Works seamlessly in both Dev Mode and packaged Production builds.
 */
function LiveTradingViewWidget({ symbol = 'CME_MINI:NQ1!', height = 550 }) {
  const rawClean = symbol.replace(/\s+/g, '').toUpperCase()
  const cleanSymbol = encodeURIComponent(rawClean)
  // The widget defaults to UTC, which made a 14:30 trade read as 18:30 on the
  // axis for anyone east or west of Greenwich. The rest of the app journals in
  // the trader's own wall-clock time, so the live chart must match it.
  const timezone = localTimeZone()

  const srcDocContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; background: #09090b; overflow: hidden; }
    #tv_chart_container { width: 100%; height: 100%; }
  </style>
  <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
</head>
<body>
  <div id="tv_chart_container"></div>
  <script type="text/javascript">
    try {
      new TradingView.widget({
        "autosize": true,
        "symbol": "${rawClean}",
        "interval": "5",
        "timezone": "${timezone}",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#09090b",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "container_id": "tv_chart_container"
      });
    } catch(e) {
      console.error('TradingView Widget Error:', e);
    }
  </script>
</body>
</html>`

  const widgetUrl = `https://www.tradingview.com/widgetembed/?symbol=${cleanSymbol}&interval=5&theme=dark&style=1&timezone=${encodeURIComponent(timezone)}&studies=%5B%5D&hide_side_toolbar=0&allow_symbol_change=1&save_image=1&calendar=1&hotlist=1`

  return (
    <div style={{ width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#09090b' }}>
      <iframe
        title="Live TradingView Chart"
        srcDoc={srcDocContent}
        src={widgetUrl}
        style={{ width: '100%', height: '100%', border: 'none', background: '#09090b' }}
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </div>
  )
}

/**
 * Offline-first Trade Execution Chart (Lightweight Charts v5 compatible)
 */
// Vertical space taken by the disclosure banner, toolbar and footer combined.
const CHROME_HEIGHT = 112



function LocalTradeExecutionChart({ trade = SAMPLE_FALLBACK_TRADE, height = 550, onViewLive, preferCandles = false }) {
  const activeTrade = trade || SAMPLE_FALLBACK_TRADE
  const chartContainerRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const seriesRef = useRef(null)
  const priceLinesRef = useRef([])
  const markersRef = useRef(null)

  const [activeTool, setActiveTool] = useState('select')
  const [activeColor, setActiveColor] = useState('#3b82f6')
  const [drawings, setDrawings] = useState([])
  const [showPriceLines, setShowPriceLines] = useState(true)
  const [renderNonce, setRenderNonce] = useState(0)
  const [toastMessage, setToastMessage] = useState('')

  const storageKey = `th_drawings_${activeTrade?.id || activeTrade?.symbol || 'default'}`
  const hasPrices = hasExecutionPrices(activeTrade)

  // Bars the trader imported from their own platform, if any cover this trade.
  // Absent an import this stays empty and the chart falls back to the execution
  // map, so nothing here is required to use TradeHelp.
  const [importedBars, setImportedBars] = useState([])

  useEffect(() => {
    let cancelled = false
    const { entryTime, exitTime } = buildExecutionPath(activeTrade)
    const root = instrumentRootSymbol(activeTrade?.symbol)

    if (!root || !entryTime || !window.api?.getPriceBars) {
      setImportedBars([])
      return undefined
    }

    window.api
      .getPriceBars(root, entryTime - CONTEXT_PADDING, (exitTime || entryTime) + CONTEXT_PADDING)
      .then((rows) => {
        if (!cancelled) setImportedBars(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setImportedBars([])
      })

    return () => {
      cancelled = true
    }
  }, [activeTrade])

  const { entryTime: tradeEntry, exitTime: tradeExit } = buildExecutionPath(activeTrade)
  // Asking for candles outright shows whatever was imported for this window,
  // without requiring the import to fully span entry to exit — a partial export
  // is still worth looking at, and saying nothing was the confusing part.
  const showCandles =
    importedBars.length > 0 && (preferCandles || barsCoverTrade(importedBars, tradeEntry, tradeExit))

  // Why the chart is showing what it is. Falling back silently left no way to
  // tell "no import yet" apart from "imported the wrong contract or dates".
  const barStatus = (() => {
    const root = instrumentRootSymbol(activeTrade?.symbol)
    if (showCandles) return { mode: 'candles', text: `${importedBars.length} imported bars` }
    if (!root) return { mode: 'map', text: `No instrument profile matches "${activeTrade?.symbol || '—'}", so bars cannot be matched` }
    if (importedBars.length === 0) return { mode: 'map', text: `No imported ${root} bars covering this trade` }
    return { mode: 'map', text: `Imported ${root} bars do not span this trade's entry and exit` }
  })()

  // Load drawings from localStorage whenever trade changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        setDrawings(JSON.parse(saved))
      } else {
        setDrawings([])
      }
    } catch {
      setDrawings([])
    }
  }, [storageKey])

  const handleDrawingsChange = (updater) => {
    setDrawings((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const handleUndo = () => handleDrawingsChange((prev) => (prev ? prev.slice(0, -1) : []))
  const handleClear = () => handleDrawingsChange([])

  /** Zoom tight to the trade without re-fetching or rebuilding the chart. */
  const handleFitTrade = () => {
    const scale = chartInstanceRef.current?.timeScale?.()
    if (!scale || !tradeEntry) return
    try {
      scale.setVisibleRange({ from: tradeEntry - TRADE_FIT_PADDING, to: tradeExit + TRADE_FIT_PADDING })
    } catch {
      try { scale.fitContent() } catch {}
    }
  }

  // Hard Refresh Handler
  const handleHardRefresh = () => {
    if (markersRef.current) {
      try {
        if (typeof markersRef.current.detach === 'function') markersRef.current.detach()
      } catch {}
      markersRef.current = null
    }
    if (chartInstanceRef.current) {
      try {
        chartInstanceRef.current.remove()
      } catch {}
      chartInstanceRef.current = null
    }
    seriesRef.current = null
    priceLinesRef.current = []

    if (chartContainerRef.current) {
      chartContainerRef.current.innerHTML = ''
    }

    setRenderNonce((n) => n + 1)
    setToastMessage('⚡ Chart Canvas Reset!')
    setTimeout(() => setToastMessage(''), 2000)
  }

  // Complete Chart Lifecycle & Render Effect
  useEffect(() => {
    if (!chartContainerRef.current) return
    const container = chartContainerRef.current
    container.innerHTML = '' // Clean old elements

    const initialWidth = Math.max(300, container.clientWidth || container.offsetWidth || 700)

    let chart = null
    try {
      chart = createChart(container, {
        height: height - CHROME_HEIGHT,
        width: initialWidth,
        layout: {
          background: { type: 'solid', color: '#09090b' },
          textColor: '#a1a1aa'
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.06)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        crosshair: {
          vertLine: { color: 'rgba(59, 130, 246, 0.6)', width: 1, style: 2 },
          horzLine: { color: 'rgba(59, 130, 246, 0.6)', width: 1, style: 2 }
        },
        // Lightweight Charts renders timestamps in UTC unless told otherwise,
        // which made a 14:30 trade read as 18:30 on the axis. Trades are
        // journalled in the trader's own wall-clock time, so both the axis and
        // the crosshair are formatted back to local.
        localization: {
          timeFormatter: formatLocalDateTime
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          tickMarkFormatter: formatLocalTick
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)'
        }
      })

      chartInstanceRef.current = chart

      // A line, not candles. The journal knows the entry and the exit; it does
      // not know the path between them, and drawing invented wicks in a tool
      // whose whole claim is "this is what actually happened" is the one thing
      // this view must not do. The dashed segment says the middle is unknown.
      // Real bars from the trader's own export. Their levels go on top, which
      // is the thing the live TradingView chart cannot do — it has the candles
      // but knows nothing about where this trade's stop and target were.
      if (showCandles) {
        const levels = getExecutionPriceRange(activeTrade)
        const candleConfig = {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderUpColor: '#22c55e',
          borderDownColor: '#ef4444',
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
          // Widen only far enough to keep the trade's own levels on screen; the
          // bars otherwise scale themselves.
          ...(levels
            ? {
                autoscaleInfoProvider: (original) => {
                  const base = original()
                  if (!base?.priceRange) return base
                  return {
                    ...base,
                    priceRange: {
                      minValue: Math.min(base.priceRange.minValue, levels.minValue),
                      maxValue: Math.max(base.priceRange.maxValue, levels.maxValue)
                    }
                  }
                }
              }
            : {})
        }

        let candles = null
        if (typeof chart.addSeries === 'function' && CandlestickSeries) {
          candles = chart.addSeries(CandlestickSeries, candleConfig)
        } else if (typeof chart.addCandlestickSeries === 'function') {
          candles = chart.addCandlestickSeries(candleConfig)
        }
        seriesRef.current = candles

        if (candles) {
          candles.setData(importedBars)
          const markers = generateTradeMarkers(activeTrade, tradeEntry, tradeExit)
          if (typeof candles.setMarkers === 'function') {
            candles.setMarkers(markers)
          } else if (typeof createSeriesMarkers === 'function') {
            try {
              markersRef.current = createSeriesMarkers(candles, markers)
            } catch (err) {
              console.error('Error creating markers:', err)
            }
          }
          if (showPriceLines) {
            priceLinesRef.current = getPriceLineConfigs(activeTrade).map((c) => candles.createPriceLine(c))
          }
          try {
            // Honour the chosen window rather than fitting to whatever bars
            // came back: exports contain halt and weekend gaps, so bar count is
            // not time span, and fitting made the windows look inconsistent.
            chart.timeScale().setVisibleRange({
              from: tradeEntry - CONTEXT_PADDING,
              to: tradeExit + CONTEXT_PADDING
            })
          } catch {
            try { chart.timeScale().fitContent() } catch {}
          }
        }
      } else {

      const priceRange = getExecutionPriceRange(activeTrade)
      const seriesConfig = {
        color: (Number(activeTrade.pnl) || 0) >= 0 ? '#22c55e' : '#ef4444',
        lineWidth: 2,
        lineStyle: 2, // dashed — the path between the two points is not known
        pointMarkersVisible: true,
        pointMarkersRadius: 4,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        // Keep stop and target on screen; autoscaling to the series alone hides
        // levels that sit far from the entry.
        ...(priceRange ? { autoscaleInfoProvider: () => ({ priceRange }) } : {})
      }

      let executionSeries = null
      if (typeof chart.addSeries === 'function' && LineSeries) {
        executionSeries = chart.addSeries(LineSeries, seriesConfig)
      } else if (typeof chart.addLineSeries === 'function') {
        executionSeries = chart.addLineSeries(seriesConfig)
      }
      seriesRef.current = executionSeries

      if (executionSeries) {
        const padding = CONTEXT_PADDING
        const { data, entryTime, exitTime, from, to } = buildExecutionSeries(activeTrade, padding)
        if (data.length > 0) {
          executionSeries.setData(data)
          const markers = generateTradeMarkers(activeTrade, entryTime, exitTime)

          if (typeof executionSeries.setMarkers === 'function') {
            executionSeries.setMarkers(markers)
          } else if (typeof createSeriesMarkers === 'function') {
            try {
              markersRef.current = createSeriesMarkers(executionSeries, markers)
            } catch (err) {
              console.error('Error creating markers:', err)
            }
          }

          try {
            if (from !== null && to !== null) {
              chart.timeScale().setVisibleRange({ from, to })
            } else {
              chart.timeScale().fitContent()
            }
          } catch {
            try {
              chart.timeScale().fitContent()
            } catch {}
          }
        }

        // Entry, stop and target are recorded numbers, so unlike the path they
        // can be drawn as fact.
        if (showPriceLines) {
          const lineConfigs = getPriceLineConfigs(activeTrade)
          priceLinesRef.current = lineConfigs.map((config) => executionSeries.createPriceLine(config))
        }
      }

      } // end execution-map branch
    } catch (err) {
      console.error('TradingView creation error:', err)
    }

    const resizePass = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const w = chartContainerRef.current.clientWidth
        if (w > 0) {
          chartInstanceRef.current.applyOptions({ width: w })
          try {
            chartInstanceRef.current.timeScale().fitContent()
          } catch {}
        }
      }
    }

    const t1 = setTimeout(resizePass, 50)
    const t2 = setTimeout(resizePass, 200)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && chartInstanceRef.current) {
          chartInstanceRef.current.applyOptions({ width: entry.contentRect.width })
        }
      }
    })
    resizeObserver.observe(container)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      resizeObserver.disconnect()
      if (markersRef.current) {
        try {
          if (typeof markersRef.current.detach === 'function') markersRef.current.detach()
        } catch {}
        markersRef.current = null
      }
      if (chart) {
        try {
          chart.remove()
        } catch {}
      }
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [activeTrade, height, showPriceLines, renderNonce, showCandles, importedBars])

  return (
    <div style={{ position: 'relative', width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#09090b' }}>
      {/* States plainly what this view is, so nobody reads it as price action. */}
      {showCandles ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(52,211,153,0.08)', borderBottom: '1px solid rgba(52,211,153,0.22)', fontSize: '11px', color: '#34d399', fontWeight: 600, flexWrap: 'wrap' }}>
          <span>Your imported bars</span>
          <span style={{ color: '#8A94A6', fontWeight: 500 }}>
            — real price action from your own platform export, with this trade&apos;s entry, exit,
            stop and target drawn on top. {barStatus.text}.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245,182,66,0.08)', borderBottom: '1px solid rgba(245,182,66,0.22)', fontSize: '11px', color: '#F5B642', fontWeight: 600, flexWrap: 'wrap' }}>
          <span>Execution map</span>
          <span style={{ color: '#8A94A6', fontWeight: 500 }}>
            — your recorded entry, exit, stop and target. {barStatus.text}. Import bars in
            Settings → Chart data for real candles, or press Live chart.
          </span>
        </div>
      )}

      {/* Chart Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#121215', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* No timeframe or window presets: the scale is fixed so duration
              reads correctly without clicking, and scroll-to-zoom covers the
              rest. This just returns to the trade after panning around. */}
          <button
            onClick={handleFitTrade}
            title="Zoom back to this trade"
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', background: '#18181b', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            ⤢ Fit trade
          </button>

          <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Drawing Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setActiveTool('select')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: activeTool === 'select' ? '#27272a' : 'transparent', color: activeTool === 'select' ? '#60a5fa' : '#a1a1aa' }}
            >
              👆 Pointer
            </button>
            <button
              onClick={() => setActiveTool('trendline')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: activeTool === 'trendline' ? '#27272a' : 'transparent', color: activeTool === 'trendline' ? '#60a5fa' : '#a1a1aa' }}
            >
              📈 Trendline
            </button>
            <button
              onClick={() => setActiveTool('rectangle')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: activeTool === 'rectangle' ? '#27272a' : 'transparent', color: activeTool === 'rectangle' ? '#60a5fa' : '#a1a1aa' }}
            >
              🟦 Zone Box
            </button>
            <button
              onClick={() => setActiveTool('horizontal')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: activeTool === 'horizontal' ? '#27272a' : 'transparent', color: activeTool === 'horizontal' ? '#60a5fa' : '#a1a1aa' }}
            >
              ➖ Level Ray
            </button>
            <button
              onClick={() => setActiveTool('text')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: activeTool === 'text' ? '#27272a' : 'transparent', color: activeTool === 'text' ? '#60a5fa' : '#a1a1aa' }}
            >
              📝 Note
            </button>
          </div>
        </div>

        {/* Color & Refresh Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {['#3b82f6', '#22c55e', '#ef4444', '#eab308'].map((c) => (
              <div
                key={c}
                onClick={() => setActiveColor(c)}
                style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, cursor: 'pointer', border: activeColor === c ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)' }}
              />
            ))}
          </div>
          <button onClick={handleUndo} disabled={drawings.length === 0} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: '#18181b', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)', cursor: drawings.length === 0 ? 'default' : 'pointer', opacity: drawings.length === 0 ? 0.5 : 1 }}>↩️ Undo</button>
          <button onClick={handleClear} disabled={drawings.length === 0} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', background: '#18181b', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', cursor: drawings.length === 0 ? 'default' : 'pointer', opacity: drawings.length === 0 ? 0.5 : 1 }}>🗑️ Clear</button>
          {/* The execution map has no market data; this is the way to real
              candles for the same instrument. */}
          {onViewLive && (
            <button
              onClick={() => onViewLive(formatTradingViewSymbol(activeTrade?.symbol), activeTrade)}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#27272a', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Open the live TradingView chart for this instrument"
            >
              📈 Live chart
            </button>
          )}
          <button
            onClick={handleHardRefresh}
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#27272a', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Hard reset canvas and re-render series"
          >
            🔄 Reset Chart
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'absolute', top: 50, right: 16, zIndex: 30, background: '#18181b', color: '#34d399', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', border: '1px solid rgba(52, 211, 153, 0.3)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
          {toastMessage}
        </div>
      )}

      {/* Canvas */}
      <div style={{ position: 'relative', width: '100%', height: `${height - CHROME_HEIGHT}px`, background: '#09090b' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        <ChartDrawingOverlay
          activeTool={activeTool}
          activeColor={activeColor}
          drawings={drawings}
          onDrawingsChange={handleDrawingsChange}
        />
        {!hasPrices && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#09090b', textAlign: 'center', padding: '24px' }}>
            <span style={{ fontSize: '13px', color: '#a1a1aa', fontWeight: 600 }}>No entry price recorded for this trade</span>
            <span style={{ fontSize: '12px', color: '#71717a', maxWidth: '360px' }}>
              Add an entry price to the trade and the execution map will draw. Nothing is
              estimated here, so with no price there is nothing honest to plot.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', background: '#09090b', fontSize: '11px', color: '#71717a', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span>{showCandles ? 'Imported Candles' : 'Execution Map'} • {activeTrade?.symbol || 'ES'} ({activeTrade?.direction || 'Long'}) {drawings.length > 0 ? `• ${drawings.length} drawing(s)` : ''}</span>
        <button onClick={() => setShowPriceLines(!showPriceLines)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}>
          {showPriceLines ? 'Hide Price Lines' : 'Show Price Lines'}
        </button>
      </div>
    </div>
  )
}

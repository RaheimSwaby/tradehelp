import React, { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { generateTradeCandles, generateTradeMarkers, getPriceLineConfigs } from '../utils/tradeChartUtils.js'
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

export function TradeChart({ trade = SAMPLE_FALLBACK_TRADE, height = 550, mode = 'live', liveSymbol = 'NASDAQ:NQ1!' }) {
  if (mode === 'live') {
    return <LiveTradingViewWidget symbol={liveSymbol} height={height} />
  }
  return <LocalTradeExecutionChart trade={trade} height={height} />
}

/**
 * Official Live TradingView Widget Embed Component
 * Provides live real-time market feeds, indicators, symbol lookup, and native drawing tools.
 */
function LiveTradingViewWidget({ symbol = 'NASDAQ:NQ1!', height = 550 }) {
  const cleanSymbol = encodeURIComponent(symbol.replace(/\s+/g, ''))
  const widgetUrl = `https://www.tradingview.com/widgetembed/?symbol=${cleanSymbol}&interval=5&theme=dark&style=1&timezone=Etc%2FUTC&studies=%5B%5D&hide_side_toolbar=0&allow_symbol_change=1&save_image=1&calendar=1&hotlist=1`

  return (
    <div style={{ width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#09090b' }}>
      <iframe
        title="Live TradingView Chart"
        src={widgetUrl}
        style={{ width: '100%', height: '100%', border: 'none', background: '#09090b' }}
        allowFullScreen
      />
    </div>
  )
}

/**
 * Offline-first Trade Execution Chart (Lightweight Charts)
 */
function LocalTradeExecutionChart({ trade = SAMPLE_FALLBACK_TRADE, height = 550 }) {
  const activeTrade = trade || SAMPLE_FALLBACK_TRADE
  const chartContainerRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const seriesRef = useRef(null)

  const [activeTool, setActiveTool] = useState('select')
  const [activeColor, setActiveColor] = useState('#3b82f6')
  const [drawings, setDrawings] = useState([])
  const [showPriceLines, setShowPriceLines] = useState(true)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const container = chartContainerRef.current
    const initialWidth = Math.max(300, container.clientWidth || container.offsetWidth || 700)

    let chart = null
    try {
      chart = createChart(container, {
        height: height - 80,
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
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: 'rgba(255, 255, 255, 0.1)'
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)'
        }
      })

      chartInstanceRef.current = chart

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444'
      })
      seriesRef.current = candlestickSeries

      // Generate & set candle data safely
      const { candles, entryTime, exitTime } = generateTradeCandles(activeTrade)
      if (candles && candles.length > 0) {
        candlestickSeries.setData(candles)
        const markers = generateTradeMarkers(activeTrade, entryTime, exitTime)
        candlestickSeries.setMarkers(markers)
      }

      // Add Price Lines (Entry, Stop Loss, Target)
      if (showPriceLines) {
        const lineConfigs = getPriceLineConfigs(activeTrade)
        lineConfigs.forEach((config) => candlestickSeries.createPriceLine(config))
      }
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
      if (chart) {
        try {
          chart.remove()
        } catch {}
      }
    }
  }, [activeTrade, height, showPriceLines])

  const handleUndo = () => setDrawings((prev) => prev.slice(0, -1))
  const handleClear = () => setDrawings([])

  return (
    <div style={{ position: 'relative', width: '100%', height: `${height}px`, borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#09090b' }}>
      {/* The candles are inferred from the prices on the trade, not recorded
          market data. Saying so is not optional in a journal whose whole claim
          is that it shows you what actually happened. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(245,182,66,0.08)', borderBottom: '1px solid rgba(245,182,66,0.22)', fontSize: '11px', color: '#F5B642', fontWeight: 600 }}>
        <span>Reconstruction</span>
        <span style={{ color: '#8A94A6', fontWeight: 500 }}>
          — drawn from your entry, exit, stop and target. Not recorded market data. Use a screenshot or the live chart for real price action.
        </span>
      </div>

      {/* Chart Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#121215', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: '8px', flexWrap: 'wrap' }}>
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

        {/* Color & Actions */}
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
        </div>
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', width: '100%', height: `${height - 80}px`, background: '#09090b' }}>
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        <ChartDrawingOverlay
          activeTool={activeTool}
          activeColor={activeColor}
          drawings={drawings}
          onDrawingsChange={setDrawings}
        />
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', background: '#09090b', fontSize: '11px', color: '#71717a', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span>Trade Execution Mode • {activeTrade?.symbol || 'ES'} ({activeTrade?.direction || 'Long'})</span>
        <button onClick={() => setShowPriceLines(!showPriceLines)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}>
          {showPriceLines ? 'Hide Price Lines' : 'Show Price Lines'}
        </button>
      </div>
    </div>
  )
}

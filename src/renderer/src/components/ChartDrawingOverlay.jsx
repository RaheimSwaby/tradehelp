import React, { useState, useRef } from 'react'

export function ChartDrawingOverlay({ activeTool, activeColor = '#3b82f6', drawings = [], onDrawingsChange }) {
  const [draft, setDraft] = useState(null)
  const overlayRef = useRef(null)

  const getRelativeCoords = (e) => {
    if (!overlayRef.current) return { x: 0, y: 0 }
    const rect = overlayRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const handleMouseDown = (e) => {
    if (!activeTool || activeTool === 'select') return
    const { x, y } = getRelativeCoords(e)

    if (activeTool === 'horizontal') {
      const newDrawing = { id: Date.now().toString(), type: 'hlevel', y, color: activeColor }
      onDrawingsChange?.([...drawings, newDrawing])
      return
    }

    if (activeTool === 'text') {
      const labelText = prompt('Enter annotation note:', 'Key Level / Entry Setup')
      if (labelText) {
        const newDrawing = { id: Date.now().toString(), type: 'text', x, y, text: labelText, color: activeColor }
        onDrawingsChange?.([...drawings, newDrawing])
      }
      return
    }

    setDraft({ type: activeTool, x1: x, y1: y, x2: x, y2: y, color: activeColor })
  }

  const handleMouseMove = (e) => {
    if (!draft) return
    const { x, y } = getRelativeCoords(e)
    setDraft((prev) => (prev ? { ...prev, x2: x, y2: y } : null))
  }

  const handleMouseUp = () => {
    if (!draft) return
    const newDrawing = { id: Date.now().toString(), ...draft }
    onDrawingsChange?.([...drawings, newDrawing])
    setDraft(null)
  }

  const isDrawingActive = activeTool && activeTool !== 'select'

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: isDrawingActive ? 'all' : 'none',
        cursor: isDrawingActive ? 'crosshair' : 'default',
        zIndex: 10
      }}
    >
      <svg style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Render Saved Drawings */}
        {drawings.map((item) => {
          if (item.type === 'trendline') {
            return (
              <line
                key={item.id}
                x1={item.x1}
                y1={item.y1}
                x2={item.x2}
                y2={item.y2}
                stroke={item.color || '#3b82f6'}
                strokeWidth="2.5"
                strokeDasharray="none"
              />
            )
          }
          if (item.type === 'rectangle') {
            const x = Math.min(item.x1, item.x2)
            const y = Math.min(item.y1, item.y2)
            const width = Math.abs(item.x2 - item.x1)
            const height = Math.abs(item.y2 - item.y1)
            return (
              <rect
                key={item.id}
                x={x}
                y={y}
                width={width}
                height={height}
                fill={item.color || '#22c55e'}
                fillOpacity="0.2"
                stroke={item.color || '#22c55e'}
                strokeWidth="1.5"
                rx="4"
              />
            )
          }
          if (item.type === 'horizontal') {
            return (
              <line
                key={item.id}
                x1="0"
                y1={item.y}
                x2="100%"
                y2={item.y}
                stroke={item.color || '#ef4444'}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            )
          }
          if (item.type === 'text') {
            return (
              <g key={item.id}>
                <rect
                  x={item.x - 4}
                  y={item.y - 18}
                  width={item.text.length * 8 + 12}
                  height="22"
                  fill="#18181b"
                  rx="4"
                  stroke={item.color || '#3b82f6'}
                  strokeWidth="1"
                />
                <text x={item.x + 2} y={item.y - 3} fill="#f4f4f5" fontSize="12" fontWeight="600">
                  {item.text}
                </text>
              </g>
            )
          }
          return null
        })}

        {/* Render Live Mouse Draft */}
        {draft && draft.type === 'trendline' && (
          <line
            x1={draft.x1}
            y1={draft.y1}
            x2={draft.x2}
            y2={draft.y2}
            stroke={draft.color}
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        )}
        {draft && draft.type === 'rectangle' && (
          <rect
            x={Math.min(draft.x1, draft.x2)}
            y={Math.min(draft.y1, draft.y2)}
            width={Math.abs(draft.x2 - draft.x1)}
            height={Math.abs(draft.y2 - draft.y1)}
            fill={draft.color}
            fillOpacity="0.15"
            stroke={draft.color}
            strokeWidth="1.5"
            rx="4"
          />
        )}
      </svg>
    </div>
  )
}

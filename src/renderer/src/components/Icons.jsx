import React from 'react'

// Custom tab glyphs, drawn to match Lucide's style (24x24 box, currentColor,
// 2px round strokes) so they inherit the tab's color, size and hover glow.
const base = (size) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'
})

// Trade Mode - a candlestick inside a targeting reticle ("go time").
export function CrosshairCandle({ size = 24, ...props }) {
  return (
    <svg {...base(size)} {...props} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12 H5" />
      <path d="M19 12 H22" />
      <rect x="10" y="8.5" width="4" height="7" rx="1" />
      <path d="M12 5.5 V8.5" />
      <path d="M12 15.5 V18.5" />
    </svg>
  )
}

// Coach whistle - round chamber + mouthpiece.
export function Whistle({ size = 24, ...props }) {
  return (
    <svg {...base(size)} {...props} aria-hidden="true">
      <circle cx="9" cy="14" r="6" />
      <path d="M14.5 11 H20 a1.6 1.6 0 0 1 0 3.2 H14" />
    </svg>
  )
}

// Playbook - an X's-and-O's play: a player (O), a route with an arrow, a defender (X).
export function PlayDiagram({ size = 24, ...props }) {
  return (
    <svg {...base(size)} {...props} aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="3" />
      <path d="M6.5 9.5 V13 a3 3 0 0 0 3 3 H13" />
      <path d="M11 13.5 L14 16 L11 18.5" />
      <path d="M16 15 l4 4 M20 15 l-4 4" />
    </svg>
  )
}

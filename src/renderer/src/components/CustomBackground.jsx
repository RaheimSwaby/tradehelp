import React from 'react'

export function CustomBackground({ dataUrl, settings }) {
  if (!dataUrl) return null
  const opacity = Math.max(0, Math.min(100, Number(settings?.customBackgroundOpacity ?? 22))) / 100
  const blur = Math.max(0, Math.min(24, Number(settings?.customBackgroundBlur ?? 0)))
  const dim = Math.max(0, Math.min(90, Number(settings?.customBackgroundDim ?? 42))) / 100
  const fit = ['cover', 'contain', 'auto'].includes(settings?.customBackgroundFit) ? settings.customBackgroundFit : 'cover'

  return (
    <>
      <div
        className="fixed inset-0"
        aria-hidden="true"
        style={{
          zIndex: -3,
          pointerEvents: 'none',
          backgroundImage: `url("${dataUrl}")`,
          backgroundSize: fit,
          backgroundRepeat: fit === 'auto' ? 'repeat' : 'no-repeat',
          backgroundPosition: 'center',
          opacity,
          filter: blur ? `blur(${blur}px)` : 'none',
          transform: blur ? 'scale(1.04)' : 'none'
        }}
      />
      <div
        className="fixed inset-0"
        aria-hidden="true"
        style={{
          zIndex: -2,
          pointerEvents: 'none',
          background: `rgba(0, 0, 0, ${dim})`
        }}
      />
    </>
  )
}

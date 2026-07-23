const DAY_START = 6 * 60
const DAY_END = 18 * 60
const TWILIGHT_MINUTES = 45

const clamp01 = (value) => Math.max(0, Math.min(1, value))

function smoothstep(start, end, value) {
  const progress = clamp01((value - start) / (end - start))
  return progress * progress * (3 - 2 * progress)
}

function arcPosition(progress) {
  const bounded = clamp01(progress)
  return {
    x: 0.08 + bounded * 0.84,
    y: 0.76 - Math.sin(Math.PI * bounded) * 0.61
  }
}

/**
 * A deliberately location-free sky clock. It uses a stable 06:00-18:00
 * daylight window so the backdrop remains fully offline and predictable.
 */
export function localSkyState(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const minutes = safeDate.getHours() * 60 + safeDate.getMinutes() + safeDate.getSeconds() / 60

  const sunProgress = clamp01((minutes - DAY_START) / (DAY_END - DAY_START))
  const moonMinutes = minutes < DAY_START ? minutes + 24 * 60 : minutes
  const moonProgress = clamp01((moonMinutes - DAY_END) / (24 * 60 - DAY_END + DAY_START))

  const sunRise = smoothstep(DAY_START - TWILIGHT_MINUTES, DAY_START + TWILIGHT_MINUTES, minutes)
  const sunSet = 1 - smoothstep(DAY_END - TWILIGHT_MINUTES, DAY_END + TWILIGHT_MINUTES, minutes)
  const sunAlpha = clamp01(sunRise * sunSet)
  const moonAlpha = clamp01(1 - sunAlpha)

  const dawnGlow = 1 - clamp01(Math.abs(minutes - DAY_START) / 90)
  const duskGlow = 1 - clamp01(Math.abs(minutes - DAY_END) / 90)
  const dayBlend = smoothstep(DAY_START - 60, DAY_START + 75, minutes) *
    (1 - smoothstep(DAY_END - 75, DAY_END + 60, minutes))

  return {
    minutes,
    isDay: minutes >= DAY_START && minutes < DAY_END,
    dayBlend: clamp01(dayBlend),
    dawnGlow,
    duskGlow,
    sun: { ...arcPosition(sunProgress), progress: sunProgress, alpha: sunAlpha },
    moon: { ...arcPosition(moonProgress), progress: moonProgress, alpha: moonAlpha }
  }
}

import React, { useEffect, useRef } from 'react'
import { T, withAlpha } from '../theme.js'

// Ambient animated backdrops. Variants (picked in Settings → Appearance):
//   constellation — twinkling stars + drifting dots linked by faint lines,
//                   with the occasional shooting star streaking through
//   matrix        — digital rain of katakana/currency glyphs in the accent color
//   orbs          — large soft glow orbs drifting like bokeh lights
//   embers        — little flames rising from the bottom edge, licking as they climb
//   candles       — ghostly green/red candlesticks drifting across
//   equalizer     — segmented mixer level meters bouncing along the bottom edge
// (stars is an internal scene used by constellation; not offered on its own)
// Every variant reads T at draw time, so it re-tints instantly with the accent
// picker, light/dark mode and Trade Mode. The canvas sits at z -1 — the app
// background lives on <body>, so the animation shows through on bare areas while
// opaque surfaces (cards, ticker, modals) paint over it. Honors
// prefers-reduced-motion by drawing a single static frame.

const rand = (a, b) => a + Math.random() * (b - a)

// Teardrop flame tongue: tip at the top (offset by `lick` for the licking sway),
// belly bulging at the base. Two quadratics make a convincing silhouette.
function flame(ctx, x, y, hgt, wdt, lick, fill) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x + lick, y - hgt)
  ctx.quadraticCurveTo(x + wdt, y - hgt * 0.35, x, y)
  ctx.quadraticCurveTo(x - wdt, y - hgt * 0.35, x + lick, y - hgt)
  ctx.fill()
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

// Each scene factory returns { resize(w, h), draw(ctx, w, h, dt, t, light) }.
// resize() tops up / trims its population to match the viewport; draw() advances
// one step (dt in ~60fps units, t the running clock) and paints.
const SCENES = {
  stars: () => {
    const pts = []
    let meteor = null
    let nextMeteor = rand(300, 800) // ~5–13s until the first shooting star
    return {
      resize(w, h) {
        const n = Math.min(200, Math.round((w * h) / 10000))
        while (pts.length < n) pts.push({ x: Math.random() * w, y: Math.random() * h, r: rand(0.3, 1.2), phase: rand(0, Math.PI * 2), speed: rand(0.008, 0.038) })
        pts.length = n
        // stars don't drift, so re-scatter any a resize pushed off-screen
        for (const s of pts) { if (s.x > w) s.x = Math.random() * w; if (s.y > h) s.y = Math.random() * h }
      },
      draw(ctx, w, h, dt, t, light) {
        const ink = light ? 0.5 : 1 // text-colored so they read as stars, not more accent
        for (const s of pts) {
          const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase) // 0..1 twinkle
          ctx.fillStyle = withAlpha(T.text, (0.08 + 0.38 * tw) * ink)
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
          // the biggest stars flash a tiny cross-flare at the peak of their twinkle
          if (s.r > 0.85 && tw > 0.9) {
            const f = (tw - 0.9) / 0.1
            const len = 3 + s.r * 3
            ctx.strokeStyle = withAlpha(T.text, 0.35 * f * ink)
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(s.x - len, s.y); ctx.lineTo(s.x + len, s.y)
            ctx.moveTo(s.x, s.y - len); ctx.lineTo(s.x, s.y + len)
            ctx.stroke()
          }
        }
        // shooting star: rare, fast streak with a fading tail
        nextMeteor -= dt
        if (!meteor && nextMeteor <= 0) {
          const ang = rand(0.35, 0.7) // radians below horizontal
          const sp = rand(9, 14)
          const dir = Math.random() < 0.5 ? 1 : -1
          meteor = {
            x: rand(w * 0.1, w * 0.9), y: rand(0, h * 0.35),
            vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp,
            age: 0, maxAge: rand(28, 46), tail: rand(70, 130)
          }
        }
        if (meteor) {
          meteor.age += dt
          meteor.x += meteor.vx * dt; meteor.y += meteor.vy * dt
          const p = meteor.age / meteor.maxAge
          if (p >= 1 || meteor.x < -50 || meteor.x > w + 50 || meteor.y > h + 50) {
            meteor = null
            nextMeteor = rand(300, 900) // 5–15s until the next one
          } else {
            // quick fade-in, longer burn-out
            const env = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.35)
            const mag = Math.hypot(meteor.vx, meteor.vy)
            const tx = meteor.x - (meteor.vx / mag) * meteor.tail
            const ty = meteor.y - (meteor.vy / mag) * meteor.tail
            const g = ctx.createLinearGradient(meteor.x, meteor.y, tx, ty)
            g.addColorStop(0, withAlpha(T.text, 0.85 * env * ink))
            g.addColorStop(1, withAlpha(T.text, 0))
            ctx.strokeStyle = g
            ctx.lineWidth = 1.5
            ctx.lineCap = 'round'
            ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(tx, ty); ctx.stroke()
            ctx.lineCap = 'butt'
            ctx.fillStyle = withAlpha(T.text, 0.9 * env * ink)
            ctx.beginPath(); ctx.arc(meteor.x, meteor.y, 1.6, 0, Math.PI * 2); ctx.fill()
          }
        }
      }
    }
  },

  constellation: () => {
    const starField = SCENES.stars()
    const dots = []
    const LINK = 130 // px — draw a line between dots closer than this
    return {
      resize(w, h) {
        starField.resize(w, h)
        const n = Math.min(110, Math.round((w * h) / 20000))
        while (dots.length < n) dots.push({ x: Math.random() * w, y: Math.random() * h, vx: rand(-0.15, 0.15), vy: rand(-0.15, 0.15), r: rand(1, 2.3) })
        dots.length = n
      },
      draw(ctx, w, h, dt, t, light) {
        starField.draw(ctx, w, h, dt, t, light)
        for (const d of dots) {
          d.x += d.vx * dt; d.y += d.vy * dt
          if (d.x < -10) d.x = w + 10; else if (d.x > w + 10) d.x = -10
          if (d.y < -10) d.y = h + 10; else if (d.y > h + 10) d.y = -10
        }
        ctx.lineWidth = 1
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const a = dots[i], b = dots[j]
            const dx = a.x - b.x, dy = a.y - b.y
            const d2 = dx * dx + dy * dy
            if (d2 > LINK * LINK) continue
            ctx.strokeStyle = withAlpha(T.accent, (1 - Math.sqrt(d2) / LINK) * (light ? 0.28 : 0.22))
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
        ctx.fillStyle = withAlpha(T.accent, light ? 0.5 : 0.45)
        for (const d of dots) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill() }
      }
    }
  },

  matrix: () => {
    const CELL = 18
    const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789$¥€£+−%'
    const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0]
    const cols = []
    let rows = 0
    // initial fill scatters heads across the screen; recycled columns restart above it
    const spawnCol = (i, initial) => ({
      x: i * CELL + CELL / 2,
      y: initial ? rand(-rows, rows) : rand(-rows * 0.5, 0), // head position in rows
      v: rand(0.12, 0.38), // rows per ~60fps unit
      trail: Math.round(rand(8, 18)),
      chars: Array.from({ length: Math.max(rows, 1) }, glyph)
    })
    return {
      resize(w, h) {
        rows = Math.ceil(h / CELL)
        cols.length = 0 // re-grid; columns are cheap to rebuild
        const n = Math.min(120, Math.ceil(w / CELL))
        for (let i = 0; i < n; i++) cols.push(spawnCol(i, true))
      },
      draw(ctx, w, h, dt, t, light) {
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const maxA = light ? 0.5 : 0.4
        for (const c of cols) {
          c.y += c.v * dt
          // mutate the odd glyph so the rain shimmers as it falls
          if (Math.random() < 0.08) c.chars[(Math.random() * c.chars.length) | 0] = glyph()
          const head = Math.floor(c.y)
          if (head - c.trail > rows) Object.assign(c, spawnCol((c.x - CELL / 2) / CELL, false))
          for (let k = 0; k <= c.trail; k++) {
            const row = head - k
            if (row < 0 || row >= rows) continue
            // bright head in the text color, accent trail fading behind it
            ctx.fillStyle = k === 0
              ? withAlpha(T.text, Math.min(1, maxA + 0.25))
              : withAlpha(T.accent, (1 - k / c.trail) * maxA)
            ctx.fillText(c.chars[row], c.x, row * CELL + CELL / 2)
          }
        }
      }
    }
  },

  orbs: () => {
    const orbs = []
    return {
      resize(w, h) {
        const n = Math.min(10, Math.max(6, Math.round((w * h) / 220000)))
        while (orbs.length < n) orbs.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: rand(-0.12, 0.12), vy: rand(-0.09, 0.09),
          r: rand(70, 190), phase: rand(0, Math.PI * 2), speed: rand(0.004, 0.012),
          tone: Math.random() < 0.7 ? 'accent' : Math.random() < 0.5 ? 'up' : 'down'
        })
        orbs.length = n
      },
      draw(ctx, w, h, dt, t, light) {
        for (const o of orbs) {
          o.x += o.vx * dt; o.y += o.vy * dt
          if (o.x < -o.r) o.x = w + o.r; else if (o.x > w + o.r) o.x = -o.r
          if (o.y < -o.r) o.y = h + o.r; else if (o.y > h + o.r) o.y = -o.r
          const breathe = 0.75 + 0.25 * Math.sin(t * o.speed + o.phase) // slow glow pulse
          const color = o.tone === 'accent' ? T.accent : o.tone === 'up' ? T.up : T.down
          const a = (light ? 0.16 : 0.22) * breathe
          const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
          g.addColorStop(0, withAlpha(color, a))
          g.addColorStop(0.55, withAlpha(color, a * 0.45))
          g.addColorStop(1, withAlpha(color, 0))
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
  },

  embers: () => {
    const flames = []
    // fresh flames enter from below the fold; the initial fill scatters everywhere
    const spawn = (w, h, anywhere) => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + rand(10, 60),
      vy: rand(-0.7, -0.25), sway: rand(0.5, 1.6),
      phase: rand(0, Math.PI * 2), speed: rand(0.02, 0.05),
      hgt: rand(6, 15), life: rand(0.7, 1)
    })
    return {
      resize(w, h) {
        const n = Math.min(55, Math.round((w * h) / 38000))
        while (flames.length < n) flames.push(spawn(w, h, true))
        flames.length = n
      },
      draw(ctx, w, h, dt, t, light) {
        for (const s of flames) {
          s.y += s.vy * dt
          s.x += Math.sin(t * s.speed + s.phase) * s.sway * 0.15 * dt
          if (s.y < -20) Object.assign(s, spawn(w, h, false))
          const climb = 1 - s.y / h
          const fade = climb < 0.7 ? 1 : Math.max(0, 1 - (climb - 0.7) / 0.3) // burn out near the top
          const flick = 0.75 + 0.25 * Math.sin(t * s.speed * 3 + s.phase) // height breathes
          const hgt = s.hgt * flick
          const wdt = hgt * 0.42
          const lick = Math.sin(t * s.speed * 2.3 + s.phase * 1.7) * wdt * 0.7 // tip licks sideways
          const a = (light ? 0.5 : 0.55) * s.life * fade
          flame(ctx, s.x, s.y, hgt, wdt, lick, withAlpha(T.accent, a * 0.6)) // outer tongue
          flame(ctx, s.x, s.y, hgt * 0.55, wdt * 0.55, lick * 0.6, withAlpha(T.text, a * 0.35)) // hot core
        }
      }
    }
  },

  candles: () => {
    const candles = []
    const spawn = (w, h, x) => ({
      x: x !== undefined ? x : rand(-40, w + 40), y: rand(0.05, 0.85) * h,
      vx: rand(-0.5, -0.18), w: rand(5, 9), body: rand(10, 34),
      wickTop: rand(3, 14), wickBot: rand(3, 14),
      up: Math.random() < 0.5, bob: rand(0, Math.PI * 2), bobSpeed: rand(0.005, 0.015)
    })
    return {
      resize(w, h) {
        const n = Math.min(42, Math.round(w / 42))
        while (candles.length < n) candles.push(spawn(w, h))
        candles.length = n
      },
      draw(ctx, w, h, dt, t, light) {
        const aBody = light ? 0.18 : 0.16, aWick = light ? 0.26 : 0.24
        ctx.lineWidth = 1
        for (const c of candles) {
          c.x += c.vx * dt
          if (c.x < -40) Object.assign(c, spawn(w, h, w + 40)) // recycle off the right edge
          const y = c.y + Math.sin(t * c.bobSpeed + c.bob) * 6
          const color = c.up ? T.up : T.down
          ctx.strokeStyle = withAlpha(color, aWick)
          ctx.beginPath()
          ctx.moveTo(c.x + c.w / 2, y - c.wickTop); ctx.lineTo(c.x + c.w / 2, y + c.body + c.wickBot)
          ctx.stroke()
          ctx.fillStyle = withAlpha(color, aBody)
          ctx.fillRect(c.x, y, c.w, c.body)
          ctx.strokeStyle = withAlpha(color, aBody + 0.06)
          ctx.strokeRect(c.x, y, c.w, c.body)
        }
      }
    }
  },

  money: () => {
    const drops = []
    const spawn = (w, h, initial) => {
      const bill = Math.random() < 0.58
      const scale = rand(0.78, 1.32)
      return {
        x: rand(-40, w + 40),
        y: initial ? rand(-h * 0.2, h) : rand(-140, -20),
        vy: bill ? rand(0.22, 0.62) : rand(0.28, 0.82),
        drift: rand(-0.18, 0.18),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.018, 0.018),
        rot: rand(-0.35, 0.35),
        bill,
        w: 42 * scale,
        h: 22 * scale,
        glyph: Math.random() < 0.72 ? '$' : '$$',
        font: Math.round(rand(16, 22)),
        alpha: rand(0.45, 0.9)
      }
    }
    return {
      resize(w, h) {
        const n = Math.min(64, Math.max(24, Math.round((w * h) / 26000)))
        while (drops.length < n) drops.push(spawn(w, h, true))
        drops.length = n
      },
      draw(ctx, w, h, dt, t, light) {
        const billFill = light ? 0.1 : 0.08
        const billStroke = light ? 0.3 : 0.24
        const markAlpha = light ? 0.34 : 0.28
        for (const d of drops) {
          d.y += d.vy * dt
          d.x += (d.drift + Math.sin(t * 0.018 + d.phase) * 0.16) * dt
          d.rot += d.spin * dt
          if (d.y > h + 80 || d.x < -110 || d.x > w + 110) Object.assign(d, spawn(w, h, false))

          ctx.save()
          ctx.translate(d.x, d.y)
          ctx.rotate(d.rot + Math.sin(t * 0.012 + d.phase) * 0.12)
          if (d.bill) {
            const x = -d.w / 2, y = -d.h / 2
            roundedRect(ctx, x, y, d.w, d.h, 5)
            ctx.fillStyle = withAlpha(T.up, billFill * d.alpha)
            ctx.fill()
            ctx.strokeStyle = withAlpha(T.up, billStroke * d.alpha)
            ctx.lineWidth = 1.2
            ctx.stroke()

            roundedRect(ctx, x + 6, y + 5, d.w - 12, d.h - 10, 4)
            ctx.strokeStyle = withAlpha(T.accent, (light ? 0.2 : 0.16) * d.alpha)
            ctx.lineWidth = 0.8
            ctx.stroke()

            ctx.fillStyle = withAlpha(T.text, (light ? 0.36 : 0.3) * d.alpha)
            ctx.font = `${Math.max(10, d.h * 0.55)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('$', 0, 0)

            ctx.fillStyle = withAlpha(T.up, (light ? 0.28 : 0.22) * d.alpha)
            ctx.beginPath(); ctx.arc(x + 9, y + d.h / 2, 2.1, 0, Math.PI * 2); ctx.fill()
            ctx.beginPath(); ctx.arc(x + d.w - 9, y + d.h / 2, 2.1, 0, Math.PI * 2); ctx.fill()
          } else {
            ctx.fillStyle = withAlpha(T.accent, markAlpha * d.alpha)
            ctx.font = `${d.font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(d.glyph, 0, 0)
          }
          ctx.restore()
        }
      }
    }
  },

  equalizer: () => {
    const BAR_W = 8, BAR_PITCH = 13 // bar + gap
    const SEG = 6, SEG_PITCH = 8 // LED segment + gap
    const bars = []
    let maxSegs = 0
    // classic mixer zones: green through the body, amber up high, red at the top
    const zone = (frac) => (frac < 0.6 ? T.up : frac < 0.85 ? T.accent : T.down)
    return {
      resize(w, h) {
        maxSegs = Math.max(8, Math.floor((h * 0.22) / SEG_PITCH)) // meters top out at ~22% of the window
        bars.length = 0
        const n = Math.min(150, Math.ceil(w / BAR_PITCH))
        for (let i = 0; i < n; i++) bars.push({
          sp1: rand(0.04, 0.09), ph1: rand(0, Math.PI * 2),
          sp2: rand(0.1, 0.2), ph2: rand(0, Math.PI * 2),
          j: 0, cap: 0
        })
      },
      draw(ctx, w, h, dt, t, light) {
        const aSeg = light ? 0.32 : 0.28, aCap = light ? 0.65 : 0.55
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i]
          // fake music: a shared beat that travels across the bars, two personal
          // wobbles per bar, and a damped random-walk jitter on top
          const beat = Math.pow((Math.sin(t * 0.16 + i * 0.06) + 1) / 2, 1.5) * 0.45
          const s1 = (Math.sin(t * b.sp1 + b.ph1) + 1) / 2 * 0.3
          const s2 = (Math.sin(t * b.sp2 + b.ph2) + 1) / 2 * 0.2
          b.j = (b.j + (Math.random() - 0.5) * 0.06 * dt) * 0.96
          const level = Math.max(0, Math.min(1, 0.08 + beat + s1 + s2 + b.j))
          const segs = Math.round(level * maxSegs)
          // peak cap jumps to the highest lit segment, then falls slowly — VU style
          b.cap = segs > b.cap ? segs : Math.max(0, b.cap - 0.06 * dt)
          const x = i * BAR_PITCH + (BAR_PITCH - BAR_W) / 2
          for (let sIdx = 0; sIdx < segs; sIdx++) {
            ctx.fillStyle = withAlpha(zone(sIdx / maxSegs), aSeg)
            ctx.fillRect(x, h - (sIdx + 1) * SEG_PITCH, BAR_W, SEG)
          }
          const capIdx = Math.round(b.cap)
          if (capIdx > 0) {
            ctx.fillStyle = withAlpha(zone(capIdx / maxSegs), aCap)
            ctx.fillRect(x, h - (capIdx + 1) * SEG_PITCH, BAR_W, 2)
          }
        }
      }
    }
  }
}

export const BACKDROP_OPTIONS = [
  ['constellation', '🌌 Constellation'],
  ['matrix', '💻 Matrix'],
  ['orbs', '🫧 Orbs'],
  ['embers', '🔥 Flames'],
  ['candles', '🕯️ Candles'],
  ['equalizer', '🎚️ Equalizer'],
  ['money', '$ Money Rain'],
  ['off', 'Off']
]

export function Backdrop({ variant = 'constellation' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!SCENES[variant]) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene = SCENES[variant]()
    let raf = 0
    let w = 0, h = 0
    let t = 0 // animation clock in ~60fps units

    function draw(dt) {
      ctx.clearRect(0, 0, w, h)
      // light surfaces need slightly different ink levels to stay visible
      const light = parseInt(T.bg.slice(1, 3), 16) > 127
      t += dt
      scene.draw(ctx, w, h, dt, t, light)
    }

    function resize() {
      // Decorative motion does not need full Retina density. The cap cuts the
      // canvas pixel workload substantially while keeping edges visually crisp.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = window.innerWidth; h = window.innerHeight
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      scene.resize(w, h)
      if (reduced) draw(0) // keep the static frame in sync with the new size
    }

    const frameMs = 1000 / 30
    let last = performance.now()
    function frame(now) {
      const elapsed = now - last
      if (elapsed < frameMs) {
        raf = requestAnimationFrame(frame)
        return
      }
      // The canvas is ambiance, so 30fps is enough; normalize movement to the
      // original 60fps units so scene speed does not change.
      const dt = Math.min(elapsed / 16.7, 3)
      last = now
      draw(dt)
      raf = requestAnimationFrame(frame)
    }

    resize()
    window.addEventListener('resize', resize)
    if (reduced) return () => window.removeEventListener('resize', resize)

    // Pause while the window is hidden so we don't burn CPU in the background.
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame) }
    }
    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [variant])

  if (!SCENES[variant]) return null
  return <canvas ref={ref} className="fixed inset-0" style={{ zIndex: -1, pointerEvents: 'none' }} aria-hidden="true" />
}

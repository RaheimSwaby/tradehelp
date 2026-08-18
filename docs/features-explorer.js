/* Tab switcher for the feature explorer.
 *
 * Panels ship visible and are hidden here, not in the stylesheet: with JS off
 * the section degrades to every panel stacked down the page, which still reads.
 * Hiding by default would leave a blank gap where the product demo should be.
 *
 * No transition on the swap. A cross-fade between two tall panels reads as a
 * page flicker rather than a change of view.
 */
(function () {
  var tabs = document.querySelectorAll('.xp-tab')
  var panels = document.querySelectorAll('.xp-panel')
  if (!tabs.length || tabs.length !== panels.length) return

  // Someone who has asked the OS to reduce motion gets the poster frame and a
  // control, not a clip that starts moving on its own.
  var stillOnly = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function media(panel) { return panel.querySelector('.shot-media') }

  function show(index) {
    for (var i = 0; i < tabs.length; i++) {
      var on = i === index
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false')
      tabs[i].tabIndex = on ? 0 : -1
      panels[i].hidden = !on

      var clip = media(panels[i])
      if (!clip) continue
      if (on && !stillOnly) {
        // Only the panel being looked at fetches and plays. Five clips running
        // behind hidden panels would burn bandwidth to show nobody anything.
        clip.preload = 'auto'
        var started = clip.play()
        if (started && started.catch) started.catch(function () {})
      } else {
        clip.pause()
        // Back to the first frame so returning to a tab replays the demo from
        // the start rather than resuming halfway through.
        try { clip.currentTime = 0 } catch (e) {}
      }
    }
  }

  if (stillOnly) {
    for (var m = 0; m < panels.length; m++) {
      var c = media(panels[m])
      if (c) c.controls = true
    }
  }

  for (var i = 0; i < tabs.length; i++) {
    (function (index) {
      tabs[index].addEventListener('click', function () { show(index) })
      // Arrow keys move between tabs, which is what a tablist is expected to do.
      tabs[index].addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : -1
        if (next < 0 || next >= tabs.length) return
        e.preventDefault()
        show(next)
        tabs[next].focus()
      })
    })(i)
  }

  // Each clip plays small inside the card, so give every frame a way to see it
  // properly. Built here rather than in the markup so there is one definition
  // instead of thirteen copies.
  // An in-page overlay rather than the Fullscreen API. requestFullscreen can be
  // refused - or, in some embedded browsers, silently ignored with a promise
  // that never settles - which leaves an Expand button that does nothing and
  // reports no error. This owns its own behaviour: it works the same in every
  // browser, on phones, and inside an embedded frame.
  function enlarge(clip) {
    if (document.querySelector('.shot-overlay')) return

    var overlay = document.createElement('div')
    overlay.className = 'shot-overlay'

    var big = document.createElement('video')
    big.src = clip.getAttribute('src')
    big.autoplay = true
    big.loop = true
    big.controls = true
    big.playsInline = true
    big.className = 'shot-overlay-video'

    var close = document.createElement('button')
    close.type = 'button'
    close.className = 'shot-overlay-close'
    close.textContent = 'Close'
    close.setAttribute('aria-label', 'Close the enlarged demo')

    overlay.appendChild(big)
    overlay.appendChild(close)
    document.body.appendChild(overlay)
    // The page behind must not scroll while the overlay is up.
    var priorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    close.focus()

    function dismiss() {
      if (!overlay.parentNode) return
      big.pause()
      overlay.parentNode.removeChild(overlay)
      document.body.style.overflow = priorOverflow
      document.removeEventListener('keydown', onKey)
    }
    function onKey(e) { if (e.key === 'Escape') dismiss() }

    close.addEventListener('click', dismiss)
    // Clicking the backdrop closes; clicking the video itself does not.
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss() })
    document.addEventListener('keydown', onKey)
  }

  for (var p = 0; p < panels.length; p++) {
    (function (panel) {
      var clip = media(panel)
      var frame = panel.querySelector('.shot-frame')
      if (!clip || !frame) return
      clip.addEventListener('click', function () { enlarge(clip) })
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'shot-zoom'
      btn.textContent = 'Expand'
      btn.setAttribute('aria-label', 'View this demo larger')
      btn.addEventListener('click', function () { enlarge(clip) })
      frame.appendChild(btn)
    })(panels[p])
  }

  show(0)
})()

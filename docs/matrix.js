// Matrix-rain backdrop, shared across every TradeHelp page. A lightweight vanilla
// port of the app's animated backdrop: reads the page's accent/text colors so it
// stays on-brand, keeps a low opacity so copy stays readable, honors
// reduced-motion, and pauses when the tab is hidden. Requires a
// <canvas id="bg-matrix"> in the document and the #bg-matrix CSS (index inline /
// site.css for subpages).
(function () {
  var canvas = document.getElementById('bg-matrix');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var css = getComputedStyle(document.documentElement);
  var accent = (css.getPropertyValue('--accent') || '#F5B642').trim();
  var text = (css.getPropertyValue('--text') || '#E6EAF2').trim();
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789$¥€£%';
  var CELL = 18, cols = [], rows = 0, w = 0, h = 0, raf = 0, last = 0;
  function glyph() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function spawn(i, initial) {
    return {
      x: i * CELL + CELL / 2,
      y: initial ? (Math.random() * -rows) : (-Math.random() * rows * 0.5),
      v: 0.12 + Math.random() * 0.26,        // rows per ~60fps unit
      trail: 8 + Math.round(Math.random() * 10),
      chars: []
    };
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rows = Math.ceil(h / CELL);
    cols = [];
    var n = Math.ceil(w / CELL);
    for (var i = 0; i < n; i++) cols.push(spawn(i, true));
    if (reduce) draw(0);
  }
  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    ctx.font = '13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var ci = 0; ci < cols.length; ci++) {
      var c = cols[ci];
      c.y += c.v * dt;
      if (Math.random() < 0.08) c.chars[(Math.random() * (rows || 1)) | 0] = glyph();
      var head = Math.floor(c.y);
      if (head - c.trail > rows) { cols[ci] = spawn(ci, false); continue; }
      for (var k = 0; k <= c.trail; k++) {
        var row = head - k;
        if (row < 0 || row >= rows) continue;
        if (!c.chars[row]) c.chars[row] = glyph();
        ctx.fillStyle = k === 0 ? rgba(text, 0.55) : rgba(accent, (1 - k / c.trail) * 0.32);
        ctx.fillText(c.chars[row], c.x, row * CELL + CELL / 2);
      }
    }
  }
  function frame(now) {
    var dt = Math.min((now - last) / 16.7, 3);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }
  resize();
  window.addEventListener('resize', resize);
  if (reduce) return;
  document.addEventListener('visibilitychange', function () {
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
  last = performance.now();
  raf = requestAnimationFrame(frame);
})();

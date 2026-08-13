/* Tour carousel: a scroll-snap track, so swipe and trackpad scroll come free from
   the browser and the arrows are just a nudge on top.

   Thirteen clips is roughly 9 MB, which nobody should download to read a landing
   page. Each <video> therefore ships with no source at all; the source element is
   attached only when the slide is near the viewport, and playback is tied to
   visibility so at most a couple are ever decoding. */
(function () {
  'use strict';

  var track = document.querySelector('.tour-track');
  if (!track) return;

  var slides = Array.prototype.slice.call(track.querySelectorAll('.tour-slide'));
  if (!slides.length) return;

  function videoOf(slide) { return slide.querySelector('video'); }

  // Attach the file only once, the first time a slide comes near the viewport.
  function ensureSource(video) {
    if (!video || video.dataset.loaded === '1') return;
    var src = video.getAttribute('data-src');
    if (!src) return;
    var source = document.createElement('source');
    source.src = src;
    source.type = 'video/mp4';
    video.appendChild(source);
    video.load();
    video.dataset.loaded = '1';
  }

  // Preload the neighbours so a swipe does not land on an empty frame.
  function warm(index) {
    [index - 1, index, index + 1].forEach(function (i) {
      if (slides[i]) ensureSource(videoOf(slides[i]));
    });
  }

  var current = 0;

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var video = videoOf(entry.target);
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          current = slides.indexOf(entry.target);
          warm(current);
          setLabel(current);
          var play = video.play();
          if (play && play.catch) play.catch(function () {});
        } else if (!video.paused) {
          video.pause();
        }
      });
    }, { root: track, threshold: [0, 0.6, 1] });
    slides.forEach(function (s) { io.observe(s); });
  } else {
    slides.forEach(function (s) { ensureSource(videoOf(s)); });
  }

  var label = document.querySelector('.tour-label');
  var counter = document.querySelector('.tour-counter');
  function setLabel(i) {
    var slide = slides[i];
    if (!slide) return;
    if (label) label.textContent = slide.getAttribute('data-label') || '';
    if (counter) counter.textContent = (i + 1) + ' / ' + slides.length;
  }

  function go(delta) {
    var next = Math.min(slides.length - 1, Math.max(0, current + delta));
    warm(next);
    slides[next].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  var prev = document.querySelector('.tour-prev');
  var next = document.querySelector('.tour-next');
  if (prev) prev.addEventListener('click', function () { go(-1); });
  if (next) next.addEventListener('click', function () { go(1); });

  // Arrow keys work once the track has focus, which it can take because it scrolls.
  track.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  // Fullscreen. iOS Safari does not implement the Fullscreen API on arbitrary
  // elements and ignores requestFullscreen on a <video> that carries playsinline;
  // its own webkitEnterFullscreen is the only route there. Controls are added for
  // the duration so there is a visible way back out, then removed again, since a
  // six second silent loop does not want a control bar sitting on it inline.
  var full = document.querySelector('.tour-full');
  if (full) {
    full.addEventListener('click', function () {
      var video = videoOf(slides[current]);
      if (!video) return;
      ensureSource(video);
      video.setAttribute('controls', '');
      if (video.requestFullscreen) video.requestFullscreen().catch(function () {});
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    });
  }

  function dropControls() {
    slides.forEach(function (s) {
      var v = videoOf(s);
      if (v && !document.fullscreenElement) v.removeAttribute('controls');
    });
  }
  document.addEventListener('fullscreenchange', dropControls);
  document.addEventListener('webkitfullscreenchange', dropControls);
  // iOS fires this when the native player closes.
  slides.forEach(function (s) {
    var v = videoOf(s);
    if (v) v.addEventListener('webkitendfullscreen', function () { v.removeAttribute('controls'); });
  });

  warm(0);
  setLabel(0);
})();

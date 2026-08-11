(function () {
  'use strict';

  var overlay = null;
  var imgEl = null;
  var closeBtn = null;
  var prevArrow = null;
  var nextArrow = null;
  var caption = null;
  var images = [];
  var currentIndex = -1;

  function build() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.setAttribute('aria-label', 'Image viewer');
    overlay.setAttribute('role', 'dialog');

    closeBtn = document.createElement('span');
    closeBtn.className = 'lb-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&#x2715;';
    overlay.appendChild(closeBtn);

    prevArrow = document.createElement('span');
    prevArrow.className = 'lb-arrow prev';
    prevArrow.setAttribute('aria-label', 'Previous');
    prevArrow.innerHTML = '&#x2039;';
    overlay.appendChild(prevArrow);

    nextArrow = document.createElement('span');
    nextArrow.className = 'lb-arrow next';
    nextArrow.setAttribute('aria-label', 'Next');
    nextArrow.innerHTML = '&#x203A;';
    overlay.appendChild(nextArrow);

    imgEl = document.createElement('img');
    imgEl.alt = '';
    overlay.appendChild(imgEl);

    caption = document.createElement('div');
    caption.className = 'lb-caption';
    overlay.appendChild(caption);

    document.body.appendChild(overlay);
  }

  function collectImages() {
    var nodes = document.querySelectorAll('.feature-visual img, img[data-lightbox]');
    images = Array.from(nodes);
  }

  function open(index) {
    build();
    collectImages();
    if (images.length === 0) return;
    currentIndex = index;
    showCurrent();
    overlay.classList.add('open');
    closeBtn.classList.add('visible');
    updateArrows();
    document.body.style.overflow = 'hidden';
  }

  function showCurrent() {
    var img = images[currentIndex];
    var src = img.currentSrc || img.src;
    imgEl.src = src;
    imgEl.alt = img.alt || '';
    caption.textContent = img.alt || '';
    if (img.alt) {
      caption.classList.add('visible');
    } else {
      caption.classList.remove('visible');
    }
  }

  function updateArrows() {
    if (images.length <= 1) {
      prevArrow.classList.remove('visible');
      nextArrow.classList.remove('visible');
      return;
    }
    if (currentIndex > 0) {
      prevArrow.classList.add('visible');
    } else {
      prevArrow.classList.remove('visible');
    }
    if (currentIndex < images.length - 1) {
      nextArrow.classList.add('visible');
    } else {
      nextArrow.classList.remove('visible');
    }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('open');
    closeBtn.classList.remove('visible');
    prevArrow.classList.remove('visible');
    nextArrow.classList.remove('visible');
    caption.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function showPrev() {
    if (currentIndex > 0) {
      currentIndex--;
      showCurrent();
      updateArrows();
    }
  }

  function showNext() {
    if (currentIndex < images.length - 1) {
      currentIndex++;
      showCurrent();
      updateArrows();
    }
  }

  /* Click any image inside .feature-visual, or any img[data-lightbox] */
  document.addEventListener('click', function (e) {
    var img = e.target.closest('.feature-visual img, img[data-lightbox]');
    if (!img) return;
    collectImages();
    var idx = images.indexOf(img);
    if (idx === -1) return;
    e.preventDefault();
    open(idx);
  });

  /* Close on overlay backdrop click (not on the image itself) */
  overlay && overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  /* Close button */
  document.addEventListener('click', function (e) {
    if (e.target === closeBtn) close();
  });

  /* Arrow clicks */
  document.addEventListener('click', function (e) {
    if (e.target === prevArrow) showPrev();
    if (e.target === nextArrow) showNext();
  });

  /* Escape key */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
      close();
    }
  });

  /* Left/right arrow keys */
  document.addEventListener('keydown', function (e) {
    if (!overlay || !overlay.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') showPrev();
    if (e.key === 'ArrowRight') showNext();
  });
})();

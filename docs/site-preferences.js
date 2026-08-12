(function () {
  'use strict';

  // Replace this once with the ID shown in Reddit Ads > Events Manager.
  var PIXEL_ID = 'a2_jea6edb1lg55';
  var CONSENT_KEY = 'tradehelp-reddit-marketing-consent';
  var PRODUCT_URL = 'tradehelp.gumroad.com/l/oyftvr';
  var PRODUCT = { id: 'oyftvr', name: 'TradeHelp', category: 'Trading journal' };
  var configured = PIXEL_ID && PIXEL_ID.indexOf('REPLACE_WITH_') !== 0;
  var privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  var loaded = false;

  function storedConsent() {
    if (privacySignal) return 'denied';
    try {
      return localStorage.getItem(CONSENT_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (_) {}
  }

  function productLinks() {
    return document.querySelectorAll('a[href*="' + PRODUCT_URL + '"]');
  }

  function decorateGumroadLinks(includeClickId) {
    var incoming = new URLSearchParams(window.location.search);
    var allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    if (includeClickId) allowed.push('rdt_cid');

    Array.prototype.forEach.call(productLinks(), function (link) {
      try {
        var target = new URL(link.href);
        allowed.forEach(function (key) {
          var value = incoming.get(key);
          if (value) target.searchParams.set(key, value);
        });
        link.href = target.toString();
      } catch (_) {}
    });
  }

  function queuePixel() {
    if (window.rdt) return;
    window.rdt = function () {
      window.rdt.callQueue.push(arguments);
    };
    window.rdt.callQueue = [];
  }

  function loadPixel() {
    if (!configured || loaded || storedConsent() !== 'granted') return;
    loaded = true;
    queuePixel();

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.redditstatic.com/ads/pixel.js';
    document.head.appendChild(script);

    window.rdt('init', PIXEL_ID, {
      optOut: false,
      useDecimalCurrencyValues: true
    });
    window.rdt('track', 'PageVisit');
    window.rdt('track', 'ViewContent', { products: [PRODUCT] });
    decorateGumroadLinks(true);
  }

  function track(eventName, metadata) {
    if (!configured || storedConsent() !== 'granted') return false;
    loadPixel();
    window.rdt('track', eventName, metadata || {});
    return true;
  }

  function removeConsentUi() {
    var banner = document.getElementById('th-reddit-consent');
    if (banner) banner.remove();
    var choices = document.getElementById('th-privacy-choices');
    if (choices) choices.remove();
  }

  function addStyles() {
    if (document.getElementById('th-reddit-styles')) return;
    var style = document.createElement('style');
    style.id = 'th-reddit-styles';
    style.textContent =
      '.th-consent{position:fixed;z-index:1000;left:18px;right:18px;bottom:18px;max-width:720px;margin:auto;' +
      'display:flex;align-items:center;gap:18px;padding:15px 16px;background:#141417;color:#e0ddd6;' +
      'border:1px solid rgba(255,255,255,.08);border-radius:4px;box-shadow:0 18px 48px rgba(0,0,0,.48);' +
      'font:14px/1.45 "Inter","system-ui","Segoe UI","Roboto","Helvetica Neue",sans-serif}' +
      '.th-consent-copy{flex:1}.th-consent-copy b{display:block;margin-bottom:3px}' +
      '.th-consent-copy span{color:#b5b0a8}' +
      '.th-consent-copy a{color:#d4a853;text-decoration:underline}.th-consent-actions{display:flex;gap:8px;flex-shrink:0}' +
      '.th-consent button,.th-privacy-choices{border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:9px 12px;' +
      'font:600 13px "Inter","system-ui","Segoe UI","Roboto","Helvetica Neue",sans-serif;cursor:pointer}' +
      '.th-consent-allow{background:#d4a853;color:#0b0b0c;border-color:#d4a853!important}' +
      '.th-consent-decline{background:#1a1a1d;color:#e0ddd6}' +
      '.th-privacy-choices{position:fixed;z-index:900;left:12px;bottom:12px;background:rgba(20,20,23,.92);color:#b5b0a8;padding:7px 9px}' +
      '@media(max-width:620px){.th-consent{align-items:stretch;flex-direction:column;gap:12px}.th-consent-actions{justify-content:flex-end}}';
    document.head.appendChild(style);
  }

  function showChoicesButton() {
    if (document.getElementById('th-privacy-choices')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'th-privacy-choices';
    button.className = 'th-privacy-choices';
    button.textContent = 'Privacy choices';
    button.addEventListener('click', function () {
      button.remove();
      showConsent();
    });
    document.body.appendChild(button);
  }

  function choose(value) {
    var previouslyGranted = storedConsent() === 'granted';
    saveConsent(value);
    removeConsentUi();
    if (value === 'granted') {
      loadPixel();
      showChoicesButton();
      return;
    }
    if (previouslyGranted && loaded) {
      window.location.reload();
      return;
    }
    showChoicesButton();
  }

  function showConsent() {
    if (!configured || privacySignal || document.getElementById('th-reddit-consent')) return;
    addStyles();
    var banner = document.createElement('div');
    banner.id = 'th-reddit-consent';
    banner.className = 'th-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Optional marketing analytics');
    banner.innerHTML =
      '<div class="th-consent-copy"><b>Optional campaign measurement</b>' +
      '<span>Allow Reddit Ads measurement for page visits, checkout clicks, and signups. ' +
      'Your journal data is never involved. <a href="privacy.html">Privacy details</a></span></div>' +
      '<div class="th-consent-actions"><button type="button" class="th-consent-decline">Not now</button>' +
      '<button type="button" class="th-consent-allow">Allow</button></div>';
    banner.querySelector('.th-consent-decline').addEventListener('click', function () { choose('denied'); });
    banner.querySelector('.th-consent-allow').addEventListener('click', function () { choose('granted'); });
    document.body.appendChild(banner);
  }

  function start() {
    decorateGumroadLinks(false);
    if (!configured) return;

    addStyles();
    var consent = storedConsent();
    if (consent === 'granted') {
      loadPixel();
      showChoicesButton();
    } else if (consent === 'denied') {
      showChoicesButton();
    } else {
      showConsent();
    }

    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a');
      if (!link || link.href.indexOf(PRODUCT_URL) === -1) return;
      track('AddToCart', { itemCount: 1, products: [PRODUCT] });
    });
  }

  window.tradeHelpReddit = {
    configured: configured,
    track: track,
    showChoices: showConsent
  };

  // Dropdown Click-Toggle & Click-Away handler
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.dropdown-trigger');
    var dropdown = trigger ? trigger.closest('.dropdown') : null;

    // If the click is on a link inside a dropdown, let it navigate — don't interfere
    if (!trigger && e.target.closest('.dropdown-content a')) {
      // Close all dropdowns so the menu cleans up after navigation
      document.querySelectorAll('.dropdown.is-open').forEach(function (d) {
        d.classList.remove('is-open');
      });
      return;
    }

    // Close other dropdowns
    document.querySelectorAll('.dropdown.is-open').forEach(function (d) {
      if (d !== dropdown) d.classList.remove('is-open');
    });

    if (dropdown) {
      // Toggle this dropdown
      dropdown.classList.toggle('is-open');
    } else {
      // Click outside — close all
      document.querySelectorAll('.dropdown.is-open').forEach(function (d) {
        d.classList.remove('is-open');
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

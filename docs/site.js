/* Shared JS for TradeHelp subpages — hamburger menu toggle + mobile dropdowns */
(function(){
  'use strict';
  var hamburger = document.querySelector('.hamburger');
  if (!hamburger) return;

  /* Toggle menu open/close */
  hamburger.addEventListener('click', function(e){
    e.stopPropagation();
    document.body.classList.toggle('menu-open');
  });

  /* Close menu when a nav link is clicked */
  var navLinks = document.querySelector('.nav-links');
  if (navLinks) {
    navLinks.addEventListener('click', function(e){
      if (e.target.tagName === 'A') {
        document.body.classList.remove('menu-open');
      }
    });
  }

  /* Close menu when clicking outside */
  document.addEventListener('click', function(e){
    if (document.body.classList.contains('menu-open') &&
        !e.target.closest('.nav-links') &&
        !e.target.closest('.hamburger')) {
      document.body.classList.remove('menu-open');
    }
  });

  /* Mobile dropdowns — click to toggle (hover doesn't work on touch) */
  var dropdowns = document.querySelectorAll('.nav-links .dropdown');
  for (var i = 0; i < dropdowns.length; i++) {
    (function(dd){
      var trigger = dd.querySelector('.dropdown-trigger');
      if (!trigger) return;
      trigger.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        // Close other open dropdowns
        for (var j = 0; j < dropdowns.length; j++) {
          if (dropdowns[j] !== dd) dropdowns[j].classList.remove('is-open');
        }
        dd.classList.toggle('is-open');
      });
    })(dropdowns[i]);
  }

  /* Close dropdowns when clicking outside */
  document.addEventListener('click', function(){
    for (var k = 0; k < dropdowns.length; k++) {
      dropdowns[k].classList.remove('is-open');
    }
  });
})();

/* ==================================================================
   DCITC PAGE TRANSITIONS  —  static/js/transitions.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The subtle exit animation between pages: internal links fade the
     body out (180ms) before the browser navigates.

   HOW IT CONNECTS:
     - CSS side (09-anim.css): body.page-exit applies opacity/translate
       with a 0.16s transition; reduced-motion rules neutralise it.
     - Markup side: every <a> in any page/partial. External links,
       anchors (#…), mailto:, tel:, download and target!=_self links
       are all left alone.
     - Boot: main.js calls DCITC.transitions.init().

   BEHAVIOUR:
     - One delegated document-level click listener (works for all
       current and future links, no per-link wiring).
     - Same-pathname links do nothing (no pointless exit animation).
     - prefers-reduced-motion: navigate immediately, no animation.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DURATION = 180; // ms to wait after adding .page-exit before navigating

  function isExternal(href) {
    var a = document.createElement('a');
    a.href = href;
    return a.origin !== window.location.origin;
  }

  // play the exit transition, then soft-navigate (navigate.js fetches
  // the target and swaps the DOM in-place, so the music player keeps
  // playing; only unsupported targets fall back to a real reload)
  function go(href) {
    if (window.DCITC.navigate) {
      window.DCITC.navigate.go(href);
      return;
    }
    if (reduced) {
      window.location.href = href;
      return;
    }
    document.body.classList.add('page-exit');
    setTimeout(function () {
      window.location.href = href;
    }, DURATION);
  }

  function init() {
    // single delegated listener for every link on the page
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!href) return;
      if (href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0)
        return;
      if (a.hasAttribute('download')) return;
      if (a.target && a.target !== '_self') return;
      if (isExternal(href)) return;

      var a2 = document.createElement('a');
      a2.href = href;
      if (a2.pathname === window.location.pathname) return; // same page

      e.preventDefault();
      go(a2.href);
    });
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.transitions = { init: init };
})();

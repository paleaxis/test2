/* ==================================================================
   DCITC BOOT  —  static/js/main.js
   ==================================================================
   Two entry points, called on first load (DOMContentLoaded) and by
   navigate.js after every soft navigation (DOM swap):

     DCITC.boot() — GLOBAL wiring, once per document lifetime:
       theme (toggle button, OS-scheme watcher), transitions (delegated
       link interception), navigate (popstate), musicPlayer (its card
       is BODY-level and survives swaps, so it boots once).

     DCITC.page() — PAGE-SCOPED wiring, first load + after every swap:
       horizontal (filmstrip/vertical), reveal, pages widgets, gallery,
       fluid (home ASCII backdrop). Each is re-runnable without stacking
       document/window listeners (see navigate.js bindOnce/bindScope) —
       this is what makes soft navigation safe.

   Module list (build order matches JS_FILES in build.js):
        theme.js           → DCITC.theme          (dark/light toggle)
        horizontal.js      → DCITC.horizontal     (horizontal filmstrip)
        transitions.js     → DCITC.transitions    (link interception)
        reveal.js          → DCITC.reveal         (scroll-in animations)
        pages.js           → DCITC.pages          (menu, filters, search)
        navigate.js        → DCITC.navigate       (soft navigation)
        music-player.js    → DCITC.musicPlayer    (floating YouTube player)
        fluid-triangle.js  → DCITC.fluidTriangle  (page ASCII fluid)
        main.js            → calls boot()+page()

      boot() order matters: theme first (no flash), transitions + navigate
      before anything else can look at links, music last. page() order:
      layout-critical horizontal first, then visual layers, then widgets.
   ================================================================== */
(function () {
  'use strict';

  function boot() {
    if (window.DCITC.theme) window.DCITC.theme.init();
    if (window.DCITC.transitions) window.DCITC.transitions.init();
    if (window.DCITC.navigate) window.DCITC.navigate.init();
    if (window.DCITC.musicPlayer) window.DCITC.musicPlayer.init();
  }

  function page() {
    if (window.DCITC.horizontal) window.DCITC.horizontal.init();
    if (window.DCITC.reveal) window.DCITC.reveal.init();
    if (window.DCITC.pages) window.DCITC.pages.init();
    if (window.DCITC.gallery) window.DCITC.gallery.init();
    if (window.DCITC.fluidTriangle) window.DCITC.fluidTriangle.init();
  }

  // expose to navigate.js (called after every DOM swap) and the console
  window.DCITC = window.DCITC || {};
  window.DCITC.boot = boot;
  window.DCITC.page = page;

  // run at DOMContentLoaded (scripts load with `defer`, but be safe)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot();
      page();
    });
  } else {
    boot();
    page();
  }
})();
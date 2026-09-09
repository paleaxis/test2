/* ==================================================================
   DCITC BOOT  —  static/js/main.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The single entry point that starts every module. It is
     deliberately LAST in the JS bundle (see JS_FILES in
     scripts/build.js) so every DCITC.* module below is registered:

        theme.js           → DCITC.theme          (dark/light toggle)
        horizontal.js      → DCITC.horizontal     (horizontal filmstrip)
        reveal.js          → DCITC.reveal         (scroll-in animations)
        transitions.js     → DCITC.transitions    (page-exit fade)
        pages.js           → DCITC.pages          (menu, filters, search)
        gallery.js         → DCITC.gallery        (photo gallery reveal/zoom)
        fluid-triangle.js  → DCITC.fluidTriangle  (page ASCII fluid)
        main.js            → calls each .init() in the order above

      Init order matters: theme first (no flash), then layout-critical
      horizontal scroller, then visual layers, then page widgets.
    ================================================================== */
(function () {
  'use strict';

  function init() {
    if (window.DCITC.theme) window.DCITC.theme.init();
    if (window.DCITC.horizontal) window.DCITC.horizontal.init();
    if (window.DCITC.reveal) window.DCITC.reveal.init();
    if (window.DCITC.transitions) window.DCITC.transitions.init();
    if (window.DCITC.pages) window.DCITC.pages.init();
    if (window.DCITC.gallery) window.DCITC.gallery.init();
    if (window.DCITC.fluidTriangle) window.DCITC.fluidTriangle.init();
  }

  // run at DOMContentLoaded (scripts load with `defer`, but be safe)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

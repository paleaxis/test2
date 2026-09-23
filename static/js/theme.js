/* ==================================================================
   DCITC THEME MODULE  —  static/js/theme.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The dark/light color scheme switcher (the sun/moon button in the
     nav, rendered by partials/header.html as [data-theme-toggle]).

   HOW IT CONNECTS:
     - CSS side: 01-vars.css defines all colors as custom properties on
       :root (dark defaults) and overrides them under
       html[data-theme="light"]. Setting the attribute here instantly
       re-skins every component. `colorScheme` is synced so native
       widgets (scrollbars, form controls) follow too.
     - HTML side: partials/head.html has an inline pre-paint script
       that reads localStorage('dcitc-theme') and sets data-theme BEFORE
       first paint — this module only handles user interaction after
       load, so there is never a flash of the wrong theme.
     - Boot: main.js calls DCITC.theme.init() (see JS_FILES order in
       scripts/build.js).

   BEHAVIOUR:
     - Click toggle → flip dark↔light, persist to localStorage, apply.
     - Follows OS prefers-color-scheme changes live, but ONLY while the
       user hasn't made an explicit choice (no stored key).
     - localStorage access is wrapped in try/catch for private mode.
   ================================================================== */
(function () {
  'use strict';

  var KEY = 'dcitc-theme'; // localStorage key (shared with head.html inline script)
  var root = document.documentElement; // <html data-theme="…">
  var sys = window.matchMedia('(prefers-color-scheme: light)');

  function current() {
    return root.getAttribute('data-theme') || 'dark';
  }
  // apply a theme to <html>; CSS vars + native widgets react immediately
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
  }

  // toggle button handler: flip, persist, apply. Bound via bindScope so
  // re-init after a soft navigation re-points at the fresh nav button
  // without stacking document listeners.
  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      /* private mode */
    }
    apply(next);
  }

  function onBtnClick(e) {
    if (e.target.closest('[data-theme-toggle]')) toggle();
  }

  // follow system changes unless the user chose manually (bound once —
  // matchMedia is document-global and survives DOM swaps)
  function onChange(ev) {
    try {
      if (!localStorage.getItem(KEY)) apply(ev.matches ? 'light' : 'dark');
    } catch (e) {
      apply(ev.matches ? 'light' : 'dark');
    }
  }

  function init() {
    if (window.DCITC.bindScope) window.DCITC.bindScope(document, 'theme-toggle', 'click', onBtnClick);
    if (window.DCITC.bindOnce) window.DCITC.bindOnce(sys, 'change', onChange);
    else if (sys.addEventListener) sys.addEventListener('change', onChange); // no navigate.js
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.theme = { init: init };
})();

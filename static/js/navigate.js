/* ==================================================================
   DCITC SOFT NAVIGATION  —  static/js/navigate.js
   ==================================================================
   Turns internal link clicks into same-document fetches (fetch + DOM
   swap), so the browser never reloads the page. The whole reason this
   exists is the music player: a plain navigation would tear down its
   YouTube iframe and kill the audio. With soft navigation the player
   card and iframe (both BODY-level) are never touched, so music keeps
   playing while you browse the site.

   WHAT IS SWAPPED:
     - <header> (nav active state is build-computed per page)
     - <main> (all body content incl. the footer partial)
     - document.title
     - <body> class (hx-body) + data-page
   Everything else stays: theme on <html>, decorative layers
   (.bg-grid/.bg-glow/.grain), the music player card + iframe host.

   HOW IT CONNECTS:
     - transitions.js intercepts internal links and calls
       DCITC.navigate.go(url): fade out (.page-exit) then soft-swap.
     - After a swap, DCITC.page() (see main.js) re-inits every
       page-scoped module against the fresh DOM.
     - Unsupported targets (no <header>/<main>, fetch failures, e.g. a
       funkystuff game file) fall back to a full page load.

   LISTENER HYGIENE (do not regress):
     Modules re-run init() after every swap. Two helpers here keep
     document/window listeners from stacking:
       DCITC.bindOnce(target, type, fn)  — permanent global listener;
         bound at most once per fn identity (theme's prefers-color-scheme
         watcher, horizontal's mq gate, reveal's scroll pass…).
       DCITC.bindScope(target, key, type, fn) — a listener that must
         RE-POINT at the current page's DOM every init (pages.js drop
         down/menu modals, theme's toggle button). Old fn is removed,
         new one added, keyed so re-init never piles up.

   A11y: focus moves to the fresh <main> (tabindex -1) so SRs and
   keyboard users hear the new page; back/forward (popstate) re-swaps
   without the exit fade.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FADE = 180; // ms — match transitions.js/09-anim.css
  var seq = 0; // in-flight fetch guard: a newer nav supersedes older ones

  // BODY-level widgets that are page-SCOPED (each page ships its own,
  // and every navigation must swap them). Most body-level nodes are
  // GLOBAL and must persist (the music card, bg-grid/bg-glow/grain,
  // the fluid backdrop) — only fix entries here. The batch switcher
  // (team page) is the canonical example: it lives outside <main>, so
  // the header/main swap alone would strand the previous page's FAB.
  var PAGE_BODY_WIDGETS = ['.batch-switch', '.menu-scrim'];

  /* --- listener helpers (see header note) -------------------------- */

  function bindOnce(target, type, fn, opts) {
    var store = target.__dcitcOnce || (target.__dcitcOnce = {});
    var set = store[type] || (store[type] = []);
    if (set.indexOf(fn) !== -1) return;
    set.push(fn);
    target.addEventListener(type, fn, opts);
  }

  function bindScope(target, key, type, fn) {
    var scopes = target.__dcitcScope || (target.__dcitcScope = {});
    var prev = scopes[key];
    if (prev) target.removeEventListener(prev.type, prev.fn);
    scopes[key] = { type: type, fn: fn };
    target.addEventListener(type, fn);
  }

  /* --- DOM swap ------------------------------------------------------- */

  function adopt(node) {
    return document.importNode(node, true);
  }

  function applySwap(doc) {
    var nextHeader = doc.querySelector('header');
    var nextMain = doc.querySelector('main');
    var curHeader = document.querySelector('header');
    var curMain = document.querySelector('main');
    if (!nextHeader || !nextMain || !curHeader || !curMain) {
      throw new Error('target has no header/main');
    }
    curHeader.replaceWith(adopt(nextHeader));
    curMain.replaceWith(adopt(nextMain));
    document.title = doc.title || document.title;

    var bodyClass = doc.body ? doc.body.className || '' : '';
    document.body.classList.toggle('hx-body', /(^|\s)hx-body(\s|$)/.test(bodyClass));
    var dp = doc.body ? doc.body.getAttribute('data-page') || '' : '';
    if (dp) document.body.setAttribute('data-page', dp);
    else document.body.removeAttribute('data-page');
    document.body.classList.remove('page-exit');

    // page-scoped body widgets (see PAGE_BODY_WIDGETS note): replace or
    // discard. Menu scrims are always rebuilt by pages.js after a swap,
    // but a STALE one from the outgoing page must not linger.
    PAGE_BODY_WIDGETS.forEach(function (sel) {
      var next = doc.querySelector(sel);
      var cur = document.querySelector(sel);
      if (next) {
        if (cur) cur.replaceWith(adopt(next));
        else document.body.insertBefore(adopt(next), document.body.firstChild);
      } else if (cur) {
        cur.remove();
      }
    });
  }

  // fetch + parse + swap + re-init. `replace=true` for popstate (no push).
  function present(url, replace) {
    var id = ++seq;
    // true when we arrived here via go()'s fade-out (popstate/first-load
    // swaps must NOT re-play the load-in animation)
    var wasExiting = document.body.classList.contains('page-exit');
    fetch(url, { method: 'GET', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        if (id !== seq) return; // superseded by a newer navigation
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.querySelector('parsererror')) throw new Error('malformed HTML');
        applySwap(doc);

        // re-play the load-in fade for go() swaps: the body node persists
        // across soft navigation so its initial `animation: page-in` does
        // not re-trigger on its own. Restart it explicitly (the
        // standard restart idiom); reduced-motion's `animation:none
        // !important` keeps it inert.
        if (wasExiting) {
          var b = document.body;
          b.style.animation = 'none';
          void b.offsetWidth;
          b.style.animation = '';
        }

        if (replace) history.replaceState(null, '', url);
        else history.pushState(null, '', url);

        // scroll to the top of the new page
        var m = document.querySelector('main');
        if (m && m.matches('[data-horizontal]')) {
          window.scrollTo(0, 0);
          m.scrollLeft = 0;
        } else {
          window.scrollTo(0, 0);
        }

        // move focus to the new page for SR/keyboard users
        if (m && m.focus) {
          m.setAttribute('tabindex', '-1');
          m.focus({ preventScroll: true });
        }

        if (window.DCITC && window.DCITC.page) window.DCITC.page();
      })
      .catch(function () {
        // fetch failure or odd target → plain navigation
        window.location.href = url;
      });
  }

  /* --- public ---------------------------------------------------------- */

  function go(url) {
    if (reduced) {
      present(url);
      return;
    }
    document.body.classList.add('page-exit');
    setTimeout(function () {
      present(url);
    }, FADE);
  }

  function onPop() {
    present(location.href, true);
  }

  function init() {
    bindOnce(window, 'popstate', onPop);
  }

  window.DCITC = window.DCITC || {};
  window.DCITC.navigate = { init: init, go: go };
  window.DCITC.bindOnce = bindOnce;
  window.DCITC.bindScope = bindScope;
})();
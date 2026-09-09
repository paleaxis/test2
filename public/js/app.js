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

  // toggle button handler: flip, persist, apply
  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {
      /* private mode */
    }
    apply(next);
  }

  function init() {
    // wire the nav button ([data-theme-toggle] in header.html)
    var btn = document.querySelector('[data-theme-toggle]');
    if (btn) btn.addEventListener('click', toggle);

    // follow system changes unless the user chose manually
    var onChange = function (ev) {
      try {
        if (!localStorage.getItem(KEY)) apply(ev.matches ? 'light' : 'dark');
      } catch (e) {
        apply(ev.matches ? 'light' : 'dark');
      }
    };
    if (sys.addEventListener) sys.addEventListener('change', onChange);
    else if (sys.addListener) sys.addListener(onChange); // older Safari
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.theme = { init: init };
})();

/* ==================================================================
   DCITC HORIZONTAL SCROLLER  —  static/js/horizontal.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The signature interaction of the site: on viewports ≥900px the
     page is a horizontal filmstrip. This module drives it.

   HOW IT CONNECTS:
     - Markup: pages wrap their sections in
         <main id="main" class="hx" data-horizontal> … <section class="sec"> …
       (see src/pages/*.html). No such main → the page is vertical and
       initVertical() tracks document scroll instead (article.html).
     - CSS side: 04-layout.css makes body.hx-body/main.hx a flex row
       with overflow-x:auto; 06-horizontal.css adds drag cursors.
       The 900px breakpoint here MUST match --hx-break in 01-vars.css
       and the @media rules in the CSS files.
      - Progress bar: .progress-fill (partials' .progress strip under
        the nav) is filled from real scroll position, both modes.
      - Backdrop drift: the fixed .bg-grid counter-moves slightly with
        scroll (04-layout.css) for a touch of depth.
      - Boot: main.js calls DCITC.horizontal.init().

   BEHAVIOUR:
     - Wheel: deltaY/deltaX mapped to horizontal goal; eased at 0.16
       per frame toward the goal ("drive" mode). Snap was deliberately
       REMOVED — pure smooth manual scroll only.
     - Keyboard: arrows/PageUp/PageUp/Home/End/Space (when not typing
       in a field). Space = page-right.
       - Mouse drag: pointer capture on main, grabs unless the target is
         interactive (a/button/input/.nav-links/[data-more]…) or inside a
         [data-hx-nodrag] zone (on HOME the whole strip is nodrag — mouse
         drags stir the ASCII fluid instead of panning; wheel/keys/touch
         still pan).
     - Touch: untouched — native horizontal pan of the scroll container.
     - prefers-reduced-motion: easing disabled (instant jumps).
     - Below 900px everything unbinds (disable()) and CSS stacks
       sections vertically; progress bar switches to document scroll.
   ================================================================== */
(function () {
  'use strict';

  // public namespace — main.js calls DCITC.horizontal.init()
  var HX = (window.DCITC.horizontal = {});

  var main = null; // <main data-horizontal> (null on vertical pages)
  var elProgress; // .progress-fill bar under the nav
  var enabled = false; // listeners bound? (true only ≥900px)
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mq = window.matchMedia('(min-width: 900px)'); // keep in sync with CSS --hx-break

  var goal = null; // desired scrollLeft (wheel / keys / drag)
  var mode = null; // 'drive' while easing toward goal, null when idle
  var raf = null; // active animation-frame handle
  var lastMax = 0; // cached max scroll for UI math

  function getMax() {
    var m = main.scrollWidth - main.clientWidth;
    return m > 0 ? m : 0;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function measure() {
    lastMax = getMax();
  }

  // set a new scroll target and make sure the rAF loop is running
  function setGoal(g, m) {
    goal = clamp(g, 0, getMax());
    mode = m;
    if (!raf && enabled) raf = requestAnimationFrame(loop);
  }

  // fill the fixed progress bar (0–100% of horizontal travel)
  function updateUI(x) {
    var max = lastMax;
    var pct = max > 0 ? clamp(x / max, 0, 1) : 0;
    if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
  }

  // the single rAF loop: eases scrollLeft toward `goal`, then updates
  // progress + parallax every frame regardless of mode
  function loop() {
    raf = null;
    var cur = main.scrollLeft;
    var max = getMax();

    if (mode) {
      var delta = goal - cur;
      var eased = delta * 0.16; // smoothing factor — the "feel"
      if (reduced) {
        eased = delta;
      } // reduced motion: jump instantly
      var next = Math.abs(eased) < 0.6 ? goal : cur + eased;
      main.scrollLeft = clamp(next, 0, max);
      if (Math.abs(goal - main.scrollLeft) < 0.6) {
        mode = null; // arrived — stop driving
        goal = null;
      }
      raf = requestAnimationFrame(loop);
    }

    updateUI(main.scrollLeft);
    parallax(main.scrollLeft);
  }

  /* --- input ----------------------------------------------------- */

  // wheel → horizontal. Vertical wheel intent scrolls the strip.
  // EXCEPTION: [data-vzone] regions (e.g. the resources card list) are
  // vertical scroll zones — return WITHOUT preventDefault so native
  // wheel scrolls that zone's content. Everything else, including a
  // section's header/chrome around the zone, keeps panning horizontally.
  function onWheel(e) {
    if (!enabled) return;
    if (e.ctrlKey || e.metaKey) return; // pinch-zoom / page zoom
    if (e.target.closest('[data-vzone]')) return;
    e.preventDefault();
    var d = e.deltaY + e.deltaX;
    d = clamp(d, -140, 140); // tame huge trackpad flings
    var base = mode === null ? main.scrollLeft : goal;
    setGoal(base + d, 'drive');
  }

  // keyboard paging; ignored while focus is in a form field
  function onKey(e) {
    if (!enabled) return;
    var t = e.target;
    if (
      t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable)
    )
      return;
    var k = e.key;
    if (k === ' ') {
      e.preventDefault();
      k = 'ArrowRight';
    } // space = page right
    var map = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: 1,
      PageUp: -1,
      Home: 'home',
      End: 'end',
    };
    if (k in map) {
      e.preventDefault();
      if (map[k] === 'home') setGoal(0, 'drive');
      else if (map[k] === 'end') setGoal(getMax(), 'drive');
      else
        setGoal(
          main.scrollLeft + Math.sign(map[k]) * Math.min(main.clientWidth * 0.85, 1000),
          'drive',
        );
    }
  }

  // native scrolling (touch pan, scrollbar drag): just sync UI
  function onScroll() {
    updateUI(main.scrollLeft);
    parallax(main.scrollLeft);
  }

  /* --- mouse drag -------------------------------------------------- */

  var drag = null;
  function onPointerDown(e) {
    if (!enabled || e.button !== 0 || e.pointerType !== 'mouse') return;
    // never hijack presses on interactive elements or 3D/drag zones
    if (
      e.target.closest(
        'a, button, input, select, textarea, details, [data-more], .nav-links, [data-hx-nodrag]',
      )
    )
      return;
    drag = { x: e.clientX, start: main.scrollLeft, moved: false };
    mode = null;
    goal = null; // hand control to the pointer
    main.classList.add('is-drag-ready');
    try {
      main.setPointerCapture(e.pointerId);
    } catch (err) {}
  }
  function onPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) {
      drag.moved = true;
      main.classList.add('is-dragging');
    }
    if (drag.moved) {
      main.scrollLeft = clamp(drag.start - dx, 0, getMax()); // direct 1:1 drag
    }
  }
  function onPointerUp(e) {
    if (!drag) return;
    main.classList.remove('is-dragging', 'is-drag-ready');
    drag = null;
  }

  function onResize() {
    measure();
    if (enabled && mode === null) {
      updateUI(main.scrollLeft);
    }
  }

  // backdrop drift: the fixed grid counter-moves with scroll for depth
  function parallax(x) {
    var grid = document.querySelector('.bg-grid');
    if (grid && !reduced) grid.style.transform = 'translateX(' + (-x * 0.02).toFixed(1) + 'px)';
  }

  /* --- lifecycle ------------------------------------------------------ */

  // bind everything (called when viewport crosses to ≥900px)
  function enable() {
    if (enabled) return;
    enabled = true;
    measure();
    main.addEventListener('wheel', onWheel, { passive: false });
    main.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onKey);
    main.addEventListener('pointerdown', onPointerDown);
    main.addEventListener('pointermove', onPointerMove);
    main.addEventListener('pointerup', onPointerUp);
    main.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    if (!raf) raf = requestAnimationFrame(loop);
    updateUI(main.scrollLeft);
  }

  // unbind + reset (called below 900px; CSS takes over stacking)
  function disable() {
    enabled = false;
    main.removeEventListener('wheel', onWheel);
    main.removeEventListener('scroll', onScroll);
    document.removeEventListener('keydown', onKey);
    main.removeEventListener('pointerdown', onPointerDown);
    main.removeEventListener('pointermove', onPointerMove);
    main.removeEventListener('pointerup', onPointerUp);
    main.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    mode = null;
    goal = null;
    if (elProgress) elProgress.style.width = '0%';
    parallax(0);
  }

  // vertical fallback for pages without <main data-horizontal>
  // (article.html): progress bar tracks normal document scroll.
  function initVertical() {
    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? window.scrollY / max : 0;
      if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // entry point (main.js). Decides horizontal vs vertical and reacts
  // live when the viewport crosses the 900px breakpoint.
  HX.init = function () {
    main = document.querySelector('main[data-horizontal]');
    elProgress = document.querySelector('.progress-fill');

    if (!main) {
      initVertical();
      return;
    }

    var apply = function (e) {
      e.matches ? enable() : disable();
    };
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
    apply(mq);
  };
})();

/* ==================================================================
   DCITC REVEAL SYSTEM  —  static/js/reveal.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
      Scroll-in animations: elements fade/slide in as they enter the
      viewport, and the hero headline lines rise out of a clip mask.

   HOW IT CONNECTS:
      - CSS side (09-anim.css): [data-reveal] / [data-stagger] children
        start hidden ONLY under html.js (the class is added by the
        inline script in partials/head.html, so no-JS visitors see
        everything). Adding .is-in — here or via the safety net —
        triggers the CSS transition. Stagger delays are pure CSS
        (:nth-child → --d custom property).
      - Markup side: pages opt in with data-reveal[="fade|left|right|
        scale|up"] or data-stagger on a parent; hero uses
        .hero-line > .hl spans.
      - anime.js (vendored, loaded before app.js in partials/scripts.html)
        animates the hero lines.
      - Boot: main.js calls DCITC.reveal.init().

   BEHAVIOUR:
      - IntersectionObserver reveals at 12% visibility; unobserves after.
      - Safety net: a rAF-throttled scroll/resize pass force-reveals
        anything already in view or scrolled PAST — covers fast jumps
        (Home/End keys, anchor links) that the observer can miss in a
        horizontally-scrolling layout.
      - prefers-reduced-motion: everything is revealed instantly, no
        anime.js calls at all.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // hero headline: .hero-line clips overflow; inner .hl slides up
  function heroReveal() {
    var lines = document.querySelectorAll('.hero-line .hl');
    if (!lines.length) return;
    if (reduced || !window.anime) {
      lines.forEach(function (l) {
        l.classList.add('is-in');
      }); // CSS fallback position
      return;
    }
    window.anime({
      targets: lines,
      translateY: ['112%', '0%'], // from below the clip
      easing: 'cubicBezier(0.16, 1, 0.3, 1)',
      duration: 950,
      delay: window.anime.stagger(130, { start: 200 }),
    });
  }

  function init() {
    var els = document.querySelectorAll('[data-reveal], [data-stagger]');

    if (reduced || !('IntersectionObserver' in window)) {
      // no motion / no observer: show everything immediately
      els.forEach(function (el) {
        el.classList.add('is-in');
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              en.target.classList.add('is-in');
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
      );
      els.forEach(function (el) {
        io.observe(el);
      });

      // safety net: reveal anything in view after fast scrolls the
      // observer may have skipped (e.g. Home/End jumps on the
      // horizontal strip). rAF-throttled so it costs one pass/frame.
      var ticking = false;
      function revealVisible() {
        ticking = false;
        els.forEach(function (el) {
          if (el.classList.contains('is-in')) return;
          var r = el.getBoundingClientRect();
          if (!(r.top >= window.innerHeight || r.left >= window.innerWidth)) {
            el.classList.add('is-in');
            io.unobserve(el);
          }
        });
      }
      window.addEventListener(
        'scroll',
        function () {
          if (!ticking) {
            ticking = true;
            requestAnimationFrame(revealVisible);
          }
        },
        { passive: true },
      );
      window.addEventListener('resize', revealVisible);
      revealVisible();
    }

    heroReveal();
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.reveal = { init: init };
})();

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

  // play the exit transition, then really navigate
  function go(href) {
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

// WHAT THIS FILE CONTROLS:
// All page-level UI widgets, in init order:
//   1. initMobileMenu — the ≤899px slide-in nav drawer
//   2. initMore       — the desktop "More" dropdown in the navbar
//   3. initFilters    — tag-button filtering (funkystuff library)
//   4. initSearch     — live text search (resources page)
//
// HOW IT CONNECTS:
//   - header.html renders [data-menu-toggle] + [data-mobile-menu]
//     (#1) and [data-more]/[data-more-btn] (#2).
//   - funkystuff.html: .gal-filters[data-filter-group=".fs-list"] with
//     button[data-filter] controls .fs-row[data-filter] items (#3).
//   - resources.html: input[data-search] in the shelf head against
//     article[data-searchable] items (#4).
//   - events.html: [data-evx] collapsing deck (#5); index.html:
//     .do-dept rows + [data-dept-modal] (#6); achievements.html:
//     details.fold → ach tabs (#7); team.html: [data-batch-switch] (#8).
//     Boot: main.js calls DCITC.pages.init().
(function () {
  'use strict';

  /* 1 ─ mobile menu drawer (≤899px) --------------------------------- */
  // Visibility is CLASS-toggled only (no `hidden` attribute — it was
  // deliberately removed so CSS transitions work). A scrim div is
  // created here and appended to <body>; CSS (.menu-scrim in
  // 05-nav.css) styles and shows it via .is-open.
  function initMobileMenu() {
    var btn = document.querySelector('[data-menu-toggle]');
    var menu = document.querySelector('[data-mobile-menu]');
    if (!btn || !menu) return;

    var scrim = document.createElement('div');
    scrim.className = 'menu-scrim';
    document.body.appendChild(scrim);

    function open() {
      menu.classList.add('is-open');
      scrim.classList.add('is-open');
      btn.classList.add('is-open'); // animates hamburger → X
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
    }
    function close() {
      menu.classList.remove('is-open');
      scrim.classList.remove('is-open');
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
    }

    btn.addEventListener('click', function () {
      menu.classList.contains('is-open') ? close() : open();
    });
    scrim.addEventListener('click', close);
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  /* 2 ─ desktop "More" dropdown -------------------------------------- */
  // Click toggles .is-open on .nav-more; clicking anywhere else closes.
  // (:hover/:focus-within rules in 05-nav.css also open it.)
  function initMore() {
    var more = document.querySelector('[data-more]');
    if (!more) return;
    var btn = more.querySelector('[data-more-btn]');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = more.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!more.contains(e.target)) {
        more.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* 3 ─ filter buttons ------------------------------------------------ */
  // Generic mechanism: a container with data-filter-group="<selector>"
  // holds button[data-filter="X"]; elements matching <selector> carry
  // data-filter="X". "*" shows everything. Used by funkystuff.
  function initFilters() {
    document.querySelectorAll('[data-filter-group]').forEach(function (group) {
      var selector = group.getAttribute('data-filter-group');
      // Filterable items are the data-filter descendants INSIDE the
      // target container (e.g. ".res-list [data-filter]") — never the
      // container itself, which carries no data-filter and would be
      // hidden wholesale on the first category click.
      var items = document.querySelectorAll(selector + ' [data-filter]');
      var buttons = group.querySelectorAll('[data-filter]');
      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          buttons.forEach(function (x) {
            x.classList.remove('is-on');
          });
          b.classList.add('is-on');
          var f = b.getAttribute('data-filter');
          items.forEach(function (it) {
            var show = f === '*' || it.getAttribute('data-filter') === f;
            it.style.display = show ? '' : 'none';
          });
        });
      });
    });
  }

  /* 4 ─ live search ---------------------------------------------------- */
  // input[data-search] filters any element carrying data-searchable="
  // …text…" (space-separated haystack set by the template).
  function initSearch() {
    var input = document.querySelector('[data-search]');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll('[data-searchable]').forEach(function (el) {
        var hay = (el.getAttribute('data-searchable') || '').toLowerCase();
        el.style.display = hay.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  /* 5 ─ collapsing event deck (events page, upcoming) ------------------ */
  // Markup: ul[data-evx] > li.evx-item > article. One item carries
  // data-active="true" (first upcoming, set by the build); the rest
  // collapse to thin strips. Activation triggers: pointerenter, click
  // and focusin (keyboard users tabbing into a card's CTA expand it).
  //
  // Mechanics: the deck is a grid whose track sizes are rewritten to
  // "10fr 1fr …" with the active column first-class; grid-template-
  // columns is animatable in modern browsers, so the CSS transition on
  // .evx produces the expand/collapse motion — no anime.js needed here
  // (content fade/slide is pure CSS too, see .evx-body in 08-pages.css).
  function initEventDeck() {
    var deck = document.querySelector('[data-evx]');
    if (!deck) return;
    var items = Array.prototype.slice.call(deck.querySelectorAll('.evx-item'));
    if (!items.length) return;
    var current = -1;

    function activate(idx) {
      if (idx === current) return;
      current = idx;
      var cols = [];
      for (var i = 0; i < items.length; i++) {
        if (i === idx) {
          items[i].setAttribute('data-active', 'true');
          cols.push('10fr');
        } else {
          items[i].removeAttribute('data-active');
          cols.push('1fr');
        }
      }
      deck.style.gridTemplateColumns = cols.join(' ');
    }

    items.forEach(function (item, i) {
      item.addEventListener('pointerenter', function () {
        activate(i);
      });
      item.addEventListener('click', function () {
        activate(i);
      });
      item.addEventListener('focusin', function () {
        activate(i);
      });
    });

    // initial state: honor the pre-rendered data-active, else first card
    var start = items.findIndex(function (it) {
      return it.hasAttribute('data-active');
    });
    activate(start === -1 ? 0 : start);
  }

  /* 6 ─ home department detail modal ----------------------------------- */
  // Each .do-dept row opens a dialog with the department's richer info.
  // Markup (index.html): a .dept-modal[data-dept-modal] holder whose
  // body is filled at runtime from the matching <template data-dept-body
  // ="...">; the row's data-dept key selects it. The dialog is kept
  // aria-hidden until opened. Clicking backdrop, the close button, or
  // pressing Escape closes it; the previously focused row gets focus
  // back. While open, body scroll is locked.
  function initDeptModal() {
    var modal = document.querySelector('[data-dept-modal]');
    if (!modal) return;
    var rows = document.querySelectorAll('.do-dept');
    if (!rows.length) return;

    var dialog = modal.querySelector('.dept-modal-dialog');
    var bodyEl = modal.querySelector('.dept-modal-body');
    var titleEl = modal.querySelector('.dept-modal-title');
    var lastFocus = null;

    function populate(deptKey) {
      var tpl = document.querySelector('[data-dept-body="' + deptKey + '"]');
      if (!tpl) return;
      bodyEl.innerHTML = '';
      bodyEl.appendChild(tpl.content.cloneNode(true));
    }

    function open(row) {
      lastFocus = row;
      var deptKey = row.getAttribute('data-dept');
      var title = row.getAttribute('data-dept-title');
      titleEl.textContent = title;
      populate(deptKey);
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      var closeBtn = modal.querySelector('[data-dept-close]');
      try {
        closeBtn.focus();
      } catch (err) {}
    }

    function close() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      if (lastFocus) {
        try {
          lastFocus.focus();
        } catch (err) {}
      }
      lastFocus = null;
    }

    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        open(row);
      });
    });
    modal.querySelectorAll('[data-dept-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }

  /* 7 ─ achievements expanded record → tabs (desktop) ──────────────── */
  // On desktop (≥900px hx mode), the details.fold accordions become
  // horizontal tabs: a row of buttons + one visible panel. On mobile
  // the native <details> accordion is left untouched.
  function initAchTabs() {
    var container = document.querySelector('.stack--lg[data-stagger]');
    if (!container) return;
    var folds = Array.prototype.slice.call(container.querySelectorAll('details.fold'));
    if (folds.length < 2) return;

    var mql = window.matchMedia('(min-width: 900px)');
    var tabsEl = null;
    var panelsEl = null;
    var panels = [];
    var btns = [];
    var active = 0;
    var built = false;

    function build() {
      if (built) return;
      built = true;

      // create tab bar
      tabsEl = document.createElement('div');
      tabsEl.className = 'ach-tabs';
      tabsEl.setAttribute('role', 'tablist');

      // create panel container
      panelsEl = document.createElement('div');

      folds.forEach(function (fold, i) {
        var summary = fold.querySelector('summary');
        var body = fold.querySelector('.fold-body');
        if (!summary || !body) return;

        // tab button
        var btn = document.createElement('button');
        btn.className = 'ach-tab-btn';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        btn.textContent = summary.querySelector('.mono')
          ? summary.querySelector('.mono').textContent
          : summary.textContent;
        btn.addEventListener('click', function () { activate(i); });
        btns.push(btn);
        tabsEl.appendChild(btn);

        // panel
        var panel = document.createElement('div');
        panel.className = 'ach-tab-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.innerHTML = body.innerHTML;
        panels.push(panel);
        panelsEl.appendChild(panel);

        // hide native details
        fold.style.display = 'none';
      });

      container.insertBefore(tabsEl, container.firstChild);
      container.appendChild(panelsEl);
      activate(0);
    }

    function destroy() {
      if (!built) return;
      tabsEl.remove();
      panelsEl.remove();
      folds.forEach(function (fold) { fold.style.display = ''; });
      built = false;
      btns = [];
      panels = [];
    }

    function activate(i) {
      active = i;
      btns.forEach(function (b, j) {
        b.classList.toggle('is-active', j === i);
        b.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      panels.forEach(function (p, j) {
        p.classList.toggle('is-active', j === i);
      });
    }

    function onBreakpoint() {
      if (mql.matches) { build(); } else { destroy(); }
    }

    mql.addEventListener('change', onBreakpoint);
    onBreakpoint();
  }

  /* 7 ─ team floating batch switcher ---------------------------------- */
  // A bottom-right floating button on the team page opens a menu of
  // batch links (team/<id>/). Clicking outside or pressing Escape
  // closes it; the active batch is highlighted.
  function initBatchSwitch() {
    var wrap = document.querySelector('[data-batch-switch]');
    if (!wrap) return;
    var btn = wrap.querySelector('[data-batch-toggle]');
    var menu = wrap.querySelector('[data-batch-menu]');
    if (!btn || !menu) return;

    function open() {
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.contains('is-open') ? close() : open();
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.pages = {
    init: function () {
      initMobileMenu();
      initMore();
      initFilters();
      initSearch();
      initEventDeck();
      initDeptModal();
      initAchTabs();
      initBatchSwitch();
    },
  };
})();

/* ==================================================================
   DCITC PAGE FLUID  —  static/js/fluid-triangle.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The ASCII fluid that lives behind the WHOLE home page — a fixed
     full-viewport layer rendered once per frame, visible through the
     transparent sections while the filmstrip scrolls over it.

   PROVENANCE:
     This is javierbyte/fluid-triangle (MIT), adapted — NOT rewritten.
     The solver, constants, character ramps, diagonal banding,
     drag-the-triangle interaction and device-motion support are all
     upstream code. Fluid physics originally from "10 minute physics"
     (18-flip.html), Copyright 2022 Matthias Müller, MIT.

   ADAPTATIONS (kept to the minimum that makes it a background):
     - mounts into .page-fluid in index.html instead of owning <body>;
       bails immediately when the mount is absent (every page but home)
     - colors come from site tokens via CSS (.page-fluid rules in
       08-pages.css) so dark/light themes just work; the layer's
       background is the page itself, not upstream's pure black
     - pointer listeners live on window and never preventDefault:
       drags stir the fluid while wheel/keys/touch keep operating the
       filmstrip (index.html marks home's <main> [data-hx-nodrag] so
       horizontal.js hands mouse-drag control to the fluid)
     - device motion permission is only requested from inside a tap,
       denial is silent, gravity falls back to plain -9.81
     - resize re-runs setupScene after a debounce (upstream reloaded
       the whole page)
     - prefers-reduced-motion: one settled frame, no loop/listeners
     - dropped upstream dead weight: the never-enabled canvas pixel
       renderer, its <canvas>, p/m pause hotkeys, console.log spam
     - upstream quirk handled: setObstacle()'s grid-stamping loop read
       f.numX/f.numY (undefined) so it NEVER ran on the published site;
       it was a Ten Minute Physics leftover that carves a CIRCLE. We
       drop that body entirely (see setObstacle) — drag stirring works
       through handleParticleCollisions' moving triangle, exactly like
       javierbyte's live demo

   BEHAVIOUR: exactly one fluid.simulate() per animation frame (the
   original loop shape — no catch-up stepping, no quality governor).
   ================================================================== */
(function () {
  'use strict';

  var NS = (window.DCITC = window.DCITC || {});
  var mounted = false;

  /* ------------------------------------------------------------------
     upstream constants + character ramps (unchanged) */
  var TARGET_LONG_SIDE = 128 * 74;
  var MIN_GRID_SIZE = 8;
  var CELL_CROP_X = 1;
  var CELL_CROP_Y = 2;

  var BASE = [
    ['~', 12198],
    [':', 6921],
    ['-', 5589],
    ['·', 3267],
    [' ', 0],
    [' ', 0],
  ];

  var RENDER_CHARS = [
    [
      ['F', 26574],
      ['F', 26574],
      ['f', 17490],
    ].concat(BASE),
    [
      ['L', 21327],
      ['L', 21327],
      ['l', 14019],
    ].concat(BASE),
    [
      ['U', 32973],
      ['U', 32973],
      ['u', 24093],
    ].concat(BASE),
    [
      ['I', 14883],
      ['I', 14883],
      ['i', 13638],
    ].concat(BASE),
    [
      ['D', 36198],
      ['D', 36198],
      ['d', 30762],
    ].concat(BASE),
  ];

  var SPEED_1 = 1.0 / 60.0 / 16;
  var SPEED_BASE = 1.0 / 60.0 / 3;
  var SPEED_2 = 1.0 / 60.0 / 1.25;

  function clamp(x, min, max) {
    if (x < min) return min;
    else if (x > max) return max;
    else return x;
  }

  /* ================================================================
     FLIP simulator — upstream code (Ten Minute Physics / javierbyte),
     verbatim except: `gravityVector` is module-local, not on window.
     ================================================================ */
  var GRAVITY = -9.81;
  var gravityVector = null;

  function FlipFluid(density, width, height, spacing, particleRadius, maxParticles) {
    this.density = density;
    this.fNumX = Math.floor(width / spacing);
    this.fNumY = Math.floor(height / spacing);
    this.h = Math.max(width / this.fNumX, height / this.fNumY);
    this.fInvSpacing = 1.0 / this.h;
    this.fNumCells = this.fNumX * this.fNumY;

    this.u = new Float32Array(this.fNumCells);
    this.v = new Float32Array(this.fNumCells);
    this.du = new Float32Array(this.fNumCells);
    this.dv = new Float32Array(this.fNumCells);
    this.prevU = new Float32Array(this.fNumCells);
    this.prevV = new Float32Array(this.fNumCells);
    this.p = new Float32Array(this.fNumCells);
    this.s = new Float32Array(this.fNumCells);
    this.cellType = new Int32Array(this.fNumCells);
    this.cellColor = new Float32Array(3 * this.fNumCells);

    this.maxParticles = maxParticles;

    this.particlePos = new Float32Array(2 * this.maxParticles);
    this.particleVel = new Float32Array(2 * this.maxParticles);

    this.particleDensity = new Float32Array(this.fNumCells);
    this.particleRestDensity = 0.0;

    this.particleRadius = particleRadius;
    this.pInvSpacing = 1.0 / (2.2 * particleRadius);
    this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
    this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
    this.pNumCells = this.pNumX * this.pNumY;

    this.numCellParticles = new Int32Array(this.pNumCells);
    this.firstCellParticle = new Int32Array(this.pNumCells + 1);
    this.cellParticleIds = new Int32Array(maxParticles);

    this.numParticles = 0;
  }

  FlipFluid.prototype.integrateParticles = function (dt) {
    for (var i = 0; i < this.numParticles; i++) {
      var gravityX = 0;
      var gravityY = GRAVITY;
      if (gravityVector) {
        gravityX = gravityVector.x;
        gravityY = gravityVector.y;
      }
      this.particleVel[2 * i] += dt * gravityX;
      this.particleVel[2 * i + 1] += dt * gravityY;
      this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
      this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
    }
  };

  FlipFluid.prototype.pushParticlesApart = function (numIters) {
    var colorDiffusionCoeff = 0.001;

    // count particles per cell
    this.numCellParticles.fill(0);

    for (var i = 0; i < this.numParticles; i++) {
      var x = this.particlePos[2 * i];
      var y = this.particlePos[2 * i + 1];
      var xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      var yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      var cellNr = xi * this.pNumY + yi;
      this.numCellParticles[cellNr]++;
    }

    // partial sums
    var first = 0;
    for (var i2 = 0; i2 < this.pNumCells; i2++) {
      first += this.numCellParticles[i2];
      this.firstCellParticle[i2] = first;
    }
    this.firstCellParticle[this.pNumCells] = first; // guard

    // fill particles into cells
    for (var i3 = 0; i3 < this.numParticles; i3++) {
      var x3 = this.particlePos[2 * i3];
      var y3 = this.particlePos[2 * i3 + 1];
      var xi3 = clamp(Math.floor(x3 * this.pInvSpacing), 0, this.pNumX - 1);
      var yi3 = clamp(Math.floor(y3 * this.pInvSpacing), 0, this.pNumY - 1);
      var cellNr3 = xi3 * this.pNumY + yi3;
      this.firstCellParticle[cellNr3]--;
      this.cellParticleIds[this.firstCellParticle[cellNr3]] = i3;
    }

    // push particles apart
    var minDist = 2.0 * this.particleRadius;
    var minDist2 = minDist * minDist;

    for (var iter = 0; iter < numIters; iter++) {
      for (var i4 = 0; i4 < this.numParticles; i4++) {
        var px = this.particlePos[2 * i4];
        var py = this.particlePos[2 * i4 + 1];
        var pxi = Math.floor(px * this.pInvSpacing);
        var pyi = Math.floor(py * this.pInvSpacing);
        var x0 = Math.max(pxi - 1, 0);
        var y0 = Math.max(pyi - 1, 0);
        var x1 = Math.min(pxi + 1, this.pNumX - 1);
        var y1 = Math.min(pyi + 1, this.pNumY - 1);

        for (var xi4 = x0; xi4 <= x1; xi4++) {
          for (var yi4 = y0; yi4 <= y1; yi4++) {
            var cellNr4 = xi4 * this.pNumY + yi4;
            var first4 = this.firstCellParticle[cellNr4];
            var last = this.firstCellParticle[cellNr4 + 1];
            for (var j = first4; j < last; j++) {
              var id = this.cellParticleIds[j];
              if (id === i4) continue;
              var qx = this.particlePos[2 * id];
              var qy = this.particlePos[2 * id + 1];
              var dx = qx - px;
              var dy = qy - py;
              var d2 = dx * dx + dy * dy;
              if (d2 > minDist2 || d2 === 0.0) continue;
              var d = Math.sqrt(d2);
              var s = (0.5 * (minDist - d)) / d;
              dx *= s;
              dy *= s;
              this.particlePos[2 * i4] -= dx;
              this.particlePos[2 * i4 + 1] -= dy;
              this.particlePos[2 * id] += dx;
              this.particlePos[2 * id + 1] += dy;
            }
          }
        }
      }
    }
  };

  FlipFluid.prototype.handleParticleCollisions = function (obstacleX, obstacleY, obstacleRadius) {
    var h = 1.0 / this.fInvSpacing;
    var r = this.particleRadius;

    var minX = h + r;
    var maxX = (this.fNumX - 1) * h - r;
    var minY = h + r;
    var maxY = (this.fNumY - 1) * h - r;

    for (var i = 0; i < this.numParticles; i++) {
      var x = this.particlePos[2 * i];
      var y = this.particlePos[2 * i + 1];

      // triangle obstacle vertices from centre + radius (upstream)
      var trianglePoints = [
        { x: obstacleX, y: obstacleY + obstacleRadius },
        {
          x: obstacleX - obstacleRadius * Math.cos(Math.PI / 6),
          y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
        },
        {
          x: obstacleX + obstacleRadius * Math.cos(Math.PI / 6),
          y: obstacleY - obstacleRadius * Math.sin(Math.PI / 6),
        },
      ];

      function pointInTriangle(px, py, v1, v2, v3) {
        var d1 = sign(px, py, v1.x, v1.y, v2.x, v2.y);
        var d2 = sign(px, py, v2.x, v2.y, v3.x, v3.y);
        var d3 = sign(px, py, v3.x, v3.y, v1.x, v1.y);
        var hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        var hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(hasNeg && hasPos);
      }
      function sign(px, py, x1, y1, x2, y2) {
        return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
      }

      if (pointInTriangle(x, y, trianglePoints[0], trianglePoints[1], trianglePoints[2])) {
        // closest point on the triangle, then push the particle out
        var closestPoint = { x: x, y: y };
        var minDist = Number.MAX_VALUE;
        for (var e = 0; e < 3; e++) {
          var p1 = trianglePoints[e];
          var p2 = trianglePoints[(e + 1) % 3];
          var edge = { x: p2.x - p1.x, y: p2.y - p1.y };
          var point = { x: x - p1.x, y: y - p1.y };
          var len = edge.x * edge.x + edge.y * edge.y;
          var t = Math.max(0, Math.min(1, (point.x * edge.x + point.y * edge.y) / len));
          var proj = { x: p1.x + t * edge.x, y: p1.y + t * edge.y };
          var dist = Math.sqrt((x - proj.x) * (x - proj.x) + (y - proj.y) * (y - proj.y));
          if (dist < minDist) {
            minDist = dist;
            closestPoint = proj;
          }
        }
        var dx = x - closestPoint.x;
        var dy = y - closestPoint.y;
        var dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > 0) {
          x = closestPoint.x;
          y = closestPoint.y;
        }
        this.particleVel[2 * i] = 0;
        this.particleVel[2 * i + 1] = 0;
      }

      // wall collisions
      if (x < minX) {
        x = minX;
        this.particleVel[2 * i] = 0.0;
      }
      if (x > maxX) {
        x = maxX;
        this.particleVel[2 * i] = 0.0;
      }
      if (y < minY) {
        y = minY;
        this.particleVel[2 * i + 1] = 0.0;
      }
      if (y > maxY) {
        y = maxY;
        this.particleVel[2 * i + 1] = 0.0;
      }
      this.particlePos[2 * i] = x;
      this.particlePos[2 * i + 1] = y;
    }
  };

  FlipFluid.prototype.updateParticleDensity = function () {
    var n = this.fNumY;
    var h = this.h;
    var h1 = this.fInvSpacing;
    var h2 = 0.5 * h;
    var d = this.particleDensity;
    d.fill(0.0);

    for (var i = 0; i < this.numParticles; i++) {
      var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
      var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
      var x0 = Math.floor((x - h2) * h1);
      var tx = (x - h2 - x0 * h) * h1;
      var x1 = Math.min(x0 + 1, this.fNumX - 2);
      var y0 = Math.floor((y - h2) * h1);
      var ty = (y - h2 - y0 * h) * h1;
      var y1 = Math.min(y0 + 1, this.fNumY - 2);
      var sx = 1.0 - tx;
      var sy = 1.0 - ty;
      if (x0 < this.fNumX && y0 < this.fNumY) d[x0 * n + y0] += sx * sy;
      if (x1 < this.fNumX && y0 < this.fNumY) d[x1 * n + y0] += tx * sy;
      if (x1 < this.fNumX && y1 < this.fNumY) d[x1 * n + y1] += tx * ty;
      if (x0 < this.fNumX && y1 < this.fNumY) d[x0 * n + y1] += sx * ty;
    }

    if (this.particleRestDensity === 0.0) {
      var sum = 0.0;
      var numFluidCells = 0;
      for (var c = 0; c < this.fNumCells; c++) {
        if (this.cellType[c] === FLUID_CELL) {
          sum += d[c];
          numFluidCells++;
        }
      }
      if (numFluidCells > 0) this.particleRestDensity = sum / numFluidCells;
    }
  };

  FlipFluid.prototype.transferVelocities = function (toGrid, flipRatio) {
    var n = this.fNumY;
    var h = this.h;
    var h1 = this.fInvSpacing;
    var h2 = 0.5 * h;

    if (toGrid) {
      this.prevU.set(this.u);
      this.prevV.set(this.v);
      this.du.fill(0.0);
      this.dv.fill(0.0);
      this.u.fill(0.0);
      this.v.fill(0.0);
      for (var ci = 0; ci < this.fNumCells; ci++)
        this.cellType[ci] = this.s[ci] === 0.0 ? SOLID_CELL : AIR_CELL;
      for (var pi = 0; pi < this.numParticles; pi++) {
        var pxi = clamp(Math.floor(this.particlePos[2 * pi] * h1), 0, this.fNumX - 1);
        var pyi = clamp(Math.floor(this.particlePos[2 * pi + 1] * h1), 0, this.fNumY - 1);
        var pc = pxi * n + pyi;
        if (this.cellType[pc] === AIR_CELL) this.cellType[pc] = FLUID_CELL;
      }
    }

    for (var component = 0; component < 2; component++) {
      var dx = component === 0 ? 0.0 : h2;
      var dy = component === 0 ? h2 : 0.0;
      var f = component === 0 ? this.u : this.v;
      var prevF = component === 0 ? this.prevU : this.prevV;
      var d = component === 0 ? this.du : this.dv;

      for (var i = 0; i < this.numParticles; i++) {
        var x = clamp(this.particlePos[2 * i], h, (this.fNumX - 1) * h);
        var y = clamp(this.particlePos[2 * i + 1], h, (this.fNumY - 1) * h);
        var x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2);
        var tx = (x - dx - x0 * h) * h1;
        var x1 = Math.min(x0 + 1, this.fNumX - 2);
        var y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2);
        var ty = (y - dy - y0 * h) * h1;
        var y1 = Math.min(y0 + 1, this.fNumY - 2);
        var sx = 1.0 - tx;
        var sy = 1.0 - ty;
        var d0 = sx * sy;
        var d1 = tx * sy;
        var d2 = tx * ty;
        var d3 = sx * ty;
        var nr0 = x0 * n + y0;
        var nr1 = x1 * n + y0;
        var nr2 = x1 * n + y1;
        var nr3 = x0 * n + y1;

        if (toGrid) {
          var pv = this.particleVel[2 * i + component];
          f[nr0] += pv * d0;
          d[nr0] += d0;
          f[nr1] += pv * d1;
          d[nr1] += d1;
          f[nr2] += pv * d2;
          d[nr2] += d2;
          f[nr3] += pv * d3;
          d[nr3] += d3;
        } else {
          var offset = component === 0 ? n : 1;
          var valid0 =
            this.cellType[nr0] !== AIR_CELL || this.cellType[nr0 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid1 =
            this.cellType[nr1] !== AIR_CELL || this.cellType[nr1 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid2 =
            this.cellType[nr2] !== AIR_CELL || this.cellType[nr2 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var valid3 =
            this.cellType[nr3] !== AIR_CELL || this.cellType[nr3 - offset] !== AIR_CELL ? 1.0 : 0.0;
          var v = this.particleVel[2 * i + component];
          var dv = valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;
          if (dv > 0.0) {
            var picV =
              (valid0 * d0 * f[nr0] +
                valid1 * d1 * f[nr1] +
                valid2 * d2 * f[nr2] +
                valid3 * d3 * f[nr3]) /
              dv;
            var corr =
              (valid0 * d0 * (f[nr0] - prevF[nr0]) +
                valid1 * d1 * (f[nr1] - prevF[nr1]) +
                valid2 * d2 * (f[nr2] - prevF[nr2]) +
                valid3 * d3 * (f[nr3] - prevF[nr3])) /
              dv;
            var flipV = v + corr;
            this.particleVel[2 * i + component] = (1.0 - flipRatio) * picV + flipRatio * flipV;
          }
        }
      }

      if (toGrid) {
        for (var fi = 0; fi < f.length; fi++) if (d[fi] > 0.0) f[fi] /= d[fi];
        // restore solid cells
        for (var ix = 0; ix < this.fNumX; ix++) {
          for (var jy = 0; jy < this.fNumY; jy++) {
            var solid = this.cellType[ix * n + jy] === SOLID_CELL;
            if (solid || (ix > 0 && this.cellType[(ix - 1) * n + jy] === SOLID_CELL))
              this.u[ix * n + jy] = this.prevU[ix * n + jy];
            if (solid || (jy > 0 && this.cellType[ix * n + jy - 1] === SOLID_CELL))
              this.v[ix * n + jy] = this.prevV[ix * n + jy];
          }
        }
      }
    }
  };

  FlipFluid.prototype.solveIncompressibility = function (
    numIters,
    dt,
    overRelaxation,
    compensateDrift,
  ) {
    this.p.fill(0.0);
    this.prevU.set(this.u);
    this.prevV.set(this.v);

    var n = this.fNumY;
    var cp = (this.density * this.h) / dt;

    for (var iter = 0; iter < numIters; iter++) {
      for (var i = 1; i < this.fNumX - 1; i++) {
        for (var j = 1; j < this.fNumY - 1; j++) {
          if (this.cellType[i * n + j] !== FLUID_CELL) continue;
          var center = i * n + j;
          var left = (i - 1) * n + j;
          var right = (i + 1) * n + j;
          var bottom = i * n + j - 1;
          var top = i * n + j + 1;
          var s = this.s[left] + this.s[right] + this.s[bottom] + this.s[top];
          if (s === 0.0) continue;
          var div = this.u[right] - this.u[center] + this.v[top] - this.v[center];
          if (this.particleRestDensity > 0.0 && compensateDrift) {
            var k = 1.0;
            var compression = this.particleDensity[i * n + j] - this.particleRestDensity;
            if (compression > 0.0) div = div - k * compression;
          }
          var p = -div / s;
          p *= overRelaxation;
          this.p[center] += cp * p;
          this.u[center] -= this.s[left] * p;
          this.u[right] += this.s[right] * p;
          this.v[center] -= this.s[bottom] * p;
          this.v[top] += this.s[top] * p;
        }
      }
    }
  };

  FlipFluid.prototype.updateCellColors = function () {
    this.cellColor.fill(0.0);
    for (var i = 0; i < this.fNumCells; i++) {
      if (this.cellType[i] === SOLID_CELL) {
        this.cellColor[3 * i] = 0.5;
        this.cellColor[3 * i + 1] = 0.5;
        this.cellColor[3 * i + 2] = 0.5;
      } else if (this.cellType[i] === FLUID_CELL) {
        var d = this.particleDensity[i];
        if (this.particleRestDensity > 0.0) d /= this.particleRestDensity;
        var val = Math.min(Math.max(d, 0.0), 2.0 - 0.0001);
        val = val / 2.0;
        var m = 0.25;
        var num = Math.floor(val / m);
        var s = (val - num * m) / m;
        var g = num % 2 === 0 ? s : 1.0 - s; // upstream saw-band, condensed
        this.cellColor[3 * i] = g;
        this.cellColor[3 * i + 1] = g;
        this.cellColor[3 * i + 2] = g;
      }
    }
  };

  FlipFluid.prototype.simulate = function (
    dt,
    gravity,
    flipRatio,
    numPressureIters,
    numParticleIters,
    overRelaxation,
    compensateDrift,
    separateParticles,
    obstacleX,
    obstacleY,
    obstacleRadius,
  ) {
    var numSubSteps = 1;
    var sdt = dt / numSubSteps;
    for (var step = 0; step < numSubSteps; step++) {
      this.integrateParticles(sdt);
      if (separateParticles) this.pushParticlesApart(numParticleIters);
      this.handleParticleCollisions(obstacleX, obstacleY, obstacleRadius);
      this.transferVelocities(true);
      this.updateParticleDensity();
      this.solveIncompressibility(numPressureIters, sdt, overRelaxation, compensateDrift);
      this.transferVelocities(false, flipRatio);
    }
    this.updateCellColors();
  };

  var FLUID_CELL = 0;
  var AIR_CELL = 1;
  var SOLID_CELL = 2;

  /* ================================================================
     scene + main loop — upstream structure (one simulate per frame)
     ================================================================ */
  var scene = {
    gravity: GRAVITY,
    dt: SPEED_BASE,
    flipRatio: 0.9,
    numPressureIters: 30,
    numParticleIters: 2,
    overRelaxation: 1.9,
    compensateDrift: true,
    separateParticles: true,
    obstacleX: 0.0,
    obstacleY: 0.0,
    obstacleRadius: 0,
    paused: true,
    fluid: null,
  };

  var GRID_SIZE = MIN_GRID_SIZE;
  var renderEl = null;

  function computeGrid() {
    GRID_SIZE = Math.max(
      Math.round(Math.sqrt((window.innerWidth * window.innerHeight) / TARGET_LONG_SIDE)),
      MIN_GRID_SIZE,
    );
  }

  function realWidth() {
    return Math.ceil(window.innerWidth / GRID_SIZE + CELL_CROP_X * 2) * GRID_SIZE;
  }
  function realHeight() {
    return Math.ceil(window.innerHeight / GRID_SIZE + CELL_CROP_Y * 2) * GRID_SIZE;
  }

  var Y_RESOLUTION = 0;
  var RESOLUTION = 0;
  var simHeight = 2.0;
  var cScale = 1;
  var simWidth = 0;
  var f = null;

  function setupScene() {
    computeGrid();
    var rw = realWidth();
    var rh = realHeight();
    Y_RESOLUTION = rh / GRID_SIZE;
    RESOLUTION = Y_RESOLUTION;

    cScale = rh / simHeight;
    simWidth = rw / cScale;

    if (renderEl) {
      // explicit box like upstream — the y-flip in simCoords() relies on
      // the element filling the simulation rect exactly
      renderEl.style.width = realWidth() + 'px';
      renderEl.style.height = realHeight() + 'px';
      renderEl.style.setProperty('font-size', GRID_SIZE + 'px');
      renderEl.style.lineHeight = GRID_SIZE + 'px';
    }

    var res = RESOLUTION;
    var tankHeight = 1.0 * simHeight;
    var tankWidth = 1.0 * simWidth;
    var h = tankHeight / res;
    var density = 1000.0;
    var relWaterHeight = 0.618;
    var relWaterWidth = 1;

    // dam break particle grid (upstream)
    var r = 0.3 * h;
    var dx = 2.0 * r;
    var dy = (Math.sqrt(3.0) / 2.0) * dx;
    var numX = Math.floor((relWaterWidth * tankWidth - 2.0 * h - 2.0 * r) / dx);
    var numY = Math.floor((relWaterHeight * tankHeight - 2.0 * h - 2.0 * r) / dy);
    var maxParticles = numX * numY;

    f = scene.fluid = new FlipFluid(density, tankWidth, tankHeight, h, r, maxParticles);

    f.numParticles = numX * numY;
    var p = 0;
    for (var i = 0; i < numX; i++) {
      for (var j = 0; j < numY; j++) {
        var xOffset = (tankWidth - numX * dx) / 2;
        var yOffset = (tankHeight - numY * dy) * -0.5;
        f.particlePos[p++] = h + r + dx * i + (j % 2 === 0 ? 0.0 : r) + xOffset;
        f.particlePos[p++] = h + r + dy * j + yOffset;
      }
    }

    // tank cells: solid left/right/bottom rim, open top (upstream)
    var n = f.fNumY;
    for (var ix = 0; ix < f.fNumX; ix++) {
      for (var jy = 0; jy < f.fNumY; jy++) {
        var s = 1.0;
        if (ix === 0 || ix === f.fNumX - 1 || jy === 0) s = 0.0;
        f.s[ix * n + jy] = s;
      }
    }
  }

  /* setObstacle only tracks the pointer-driven obstacle position.
     Upstream also carried a grid-stamping loop inherited from the Ten
     Minute Physics demo that carved a CIRCLE of solid cells — but it
     read f.numX/f.numY (undefined), so on javierbyte's published site
     it never executed and his demo's water only ever interacts with
     the moving TRIANGLE via handleParticleCollisions(). Restoring that
     loop (our first pass) resurrected a growing disc mid-screen; to
     match the original's visible behaviour we drop the stamping and
     keep just the position/velocity bookkeeping. */
  function setObstacle(x, y, reset) {
    var vx = 0.0;
    var vy = 0.0;
    if (!reset) {
      vx = (x - scene.obstacleX) / scene.dt;
      vy = (y - scene.obstacleY) / scene.dt;
    }
    scene.obstacleX = x;
    scene.obstacleY = y;
  }

  /* --- interaction (upstream model, window-scoped listeners) -------- */
  var mouseDown = false;

  function simCoords(clientX, clientY) {
    var rect = renderEl.getBoundingClientRect();
    var mx = clientX - rect.left;
    var my = clientY - rect.top;
    return {
      x: mx / cScale,
      y: (rect.height - my) / cScale,
    };
  }

  function startDrag(clientX, clientY) {
    mouseDown = true;
    document.body.classList.add('is-fluid-grabbing');
    var c = simCoords(clientX, clientY);
    setObstacle(c.x, c.y, true);
    scene.paused = false;
  }

  function drag(clientX, clientY) {
    if (!mouseDown) return;
    var c = simCoords(clientX, clientY);
    setObstacle(c.x, c.y, false);
  }

  function endDrag() {
    mouseDown = false;
    document.body.classList.remove('is-fluid-grabbing');
  }

  function onMouseDown(e) {
    if (e.button !== 0 || reduced.matches) return;
    scene.obstacleRadius = 0.0;
    scene.dt = SPEED_1;
    startDrag(e.clientX, e.clientY);
  }
  function onMouseMove(e) {
    drag(e.clientX, e.clientY);
  }
  function onMouseUp() {
    scene.dt = SPEED_2;
    endDrag();
  }
  function onTouchStart(e) {
    if (!e.touches.length || reduced.matches) return;
    scene.obstacleRadius = 0.0;
    scene.dt = SPEED_1;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }
  function onTouchMove(e) {
    if (!mouseDown || !e.touches.length) return;
    drag(e.touches[0].clientX, e.touches[0].clientY); // passive: strip pans too
  }
  function onTouchEnd() {
    scene.dt = SPEED_2;
    endDrag();
  }

  /* --- device motion (upstream, permission only inside a gesture) ---- */
  function requestDeviceMotion() {
    if (
      typeof window.DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      DeviceMotionEvent.requestPermission()
        .then(function (permission) {
          if (permission === 'granted') setupDeviceMotion();
        })
        .catch(function () {
          /* denied → default gravity */
        });
    } else if (typeof window.DeviceMotionEvent !== 'undefined') {
      setupDeviceMotion();
    }
  }

  function setupDeviceMotion() {
    window.addEventListener('devicemotion', function (event) {
      var a = event.accelerationIncludingGravity;
      if (!a || (a.x == null && a.y == null)) return;
      var x = a.x || 0;
      var y = a.y || 0;
      if (!x && !y) return;
      // screen-orientation compensation (modern API + legacy fallback)
      var angle = 0;
      if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number')
        angle = screen.orientation.angle;
      else if (typeof window.orientation === 'number') angle = window.orientation;
      if (angle === 90) {
        var t = x;
        x = -y;
        y = t;
      } else if (angle === -90 || angle === 270) {
        var t2 = x;
        x = y;
        y = -t2;
      } else if (angle === 180 || angle === -180) {
        x = -x;
        y = -y;
      }
      gravityVector = { x: x, y: y };
      scene.gravity = 0;
    });
  }

  /* --- main loop: ONE simulate + ONE render per RENDERED frame.
         Rendered frames are capped at ~30fps by skipping whole frames
         (a skipped frame does NO sim work — no catch-up debt). The
         render goes through textContent instead of upstream's
         innerHTML: the field is plain ASCII, so per-frame HTML parsing
         is pure overhead. --- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rafId = null;
  var FRAME_MIN_MS = 1000 / 30;
  var lastFrameT = 0;

  function update(now) {
    rafId = null;
    if (!pausedForever && now - lastFrameT < FRAME_MIN_MS) {
      rafId = requestAnimationFrame(update);
      return;
    }
    lastFrameT = now;
    var MAX_RADIUS = window.innerWidth > window.innerHeight ? 0.47 : 0.37;
    scene.obstacleRadius = (scene.obstacleRadius * 3 + MAX_RADIUS) / 4;

    if (!scene.paused) {
      scene.fluid.simulate(
        scene.dt,
        scene.gravity,
        scene.flipRatio,
        scene.numPressureIters,
        scene.numParticleIters,
        scene.overRelaxation,
        scene.compensateDrift,
        scene.separateParticles,
        scene.obstacleX,
        scene.obstacleY,
        scene.obstacleRadius,
      );
    }

    // ASCII render into the layer's <pre> (upstream innerHTML path;
    // dictionaries are pre-sorted once here instead of per cell)
    var toRender = '';
    for (var i = f.fNumY - CELL_CROP_Y; i > CELL_CROP_Y; i--) {
      var row = '';
      for (var j = CELL_CROP_X; j < f.fNumX - CELL_CROP_X; j++) {
        var dict = RENDER_DICTS[(i + j + 1) % RENDER_DICTS.length];
        var cellColor = f.cellColor[3 * (j * f.fNumY + i)];
        row += dict[Math.floor(cellColor * dict.length)];
      }
      toRender += row + '\n';
    }
    renderEl.textContent = toRender;

    if (!pausedForever) {
      if (settleFrames > 0) {
        // reduced-motion settle: count down, then halt the loop
        if (--settleFrames === 0) {
          pausedForever = true;
          scene.paused = true;
        }
      }
      if (!pausedForever) rafId = requestAnimationFrame(update);
    }
  }

  var RENDER_DICTS = RENDER_CHARS.map(function (ramp) {
    return ramp
      .slice()
      .sort(function (a, b) {
        return a[1] - b[1];
      })
      .map(function (pair) {
        return pair[0];
      })
      .join('');
  });

  var pausedForever = false; // set once the loop must stop for good
  var settleFrames = 0; // >0 while reduced-motion settling

  /* --- desktop-only gate + start/stop lifecycle ---
     The fluid runs on pointer/desktop viewports only (site breakpoint
     900px): mobile CPUs and batteries shouldn't pay for a background
     toy. The gate is live — crossing 900px boots or stops the loop, so
     tablet orientation changes behave too. Below 900px nothing is
     mounted and zero listeners are bound. --- */
  var DESKTOP_MQ = window.matchMedia('(min-width: 900px)');
  var listenersBound = false;

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    // interaction — on window so the fluid reacts everywhere on the
    // page even though the layer sits behind the content
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    // device motion: upstream gesture-gated request (never at load)
    var motionOnce = function () {
      window.removeEventListener('mousedown', motionOnce);
      window.removeEventListener('touchend', motionOnce);
      requestDeviceMotion();
    };
    window.addEventListener('mousedown', motionOnce, { once: true });
    window.addEventListener('touchend', motionOnce, { once: true });

    // resize → soft rebuild (upstream did location.reload()); inert
    // while stopped on a sub-900px viewport
    var resizeTimer;
    window.addEventListener('resize', function () {
      if (!DESKTOP_MQ.matches) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        setupScene();
        startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
        endDrag();
      }, 250);
    });
  }

  function start() {
    if (!renderEl) {
      var mount = document.querySelector('[data-fluid-triangle]');
      if (!mount) return;
      renderEl = document.createElement('div');
      renderEl.className = 'render';
      mount.appendChild(renderEl);
    }
    setupScene();
    bindListeners();
    pausedForever = false;

    if (reduced.matches) {
      // prefers-reduced-motion: no permanent animation. Run a SHORT
      // async settle burst so the opening frame looks calm, then stop
      // the loop for good.
      settleFrames = 60;
      scene.paused = false;
      startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
      endDrag();
      rafId = requestAnimationFrame(update);
      return;
    }

    // draw the initial obstacle + start the capped upstream-style loop
    startDrag(window.innerWidth / 2, window.innerHeight * 0.54);
    endDrag();
    scene.paused = false;
    rafId = requestAnimationFrame(update);
  }

  function stopAll() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    scene.paused = true;
    pausedForever = true;
    if (renderEl) renderEl.textContent = '';
  }

  function onDesktopGate(e) {
    if (e.matches) start();
    else stopAll();
  }

  function init() {
    if (mounted) return;

    // DESKTOP ONLY: below 900px this is the whole init — nothing
    // mounts, nothing runs; the CSS also display:none's the layer.
    mounted = true;
    DESKTOP_MQ.addEventListener('change', onDesktopGate);
    if (DESKTOP_MQ.matches) start();
  }

  NS.fluidTriangle = { init: init };
})();

/* ==================================================================
   GALLERY MODULE  —  static/js/gallery.js
   ==================================================================
   WHAT THIS FILE CONTROLS:
     The photo gallery on /gallery/. Items are PRE-RENDERED at build
     time from the content/gallery/ folder (see build.js `loadGallery`),
     so this module does NOT fetch or render anything. It only wires the
     three motion behaviours that CSS alone can't fully drive:

       1. Reveal cascade   images fade/scale in one after another with a
                           small stagger (the "showImages" feel from the
                           reference strip).
       2. Parallax         while the page's horizontal filmstrip scrolls,
                           each tile translates at its own data-speed
                           (1–4) so higher-speed tiles overtake the rail
                           (speed 1) — layered depth like the reference.
       3. Click-to-zoom    clicking a tile briefly scales its image 5×
                           then re-runs the reveal cascade (.-clicked).

   PARALLAX DESIGN (important — do not regress):
     - It is driven by its OWN requestAnimationFrame loop that reads the
       active scroller's scroll position every frame, so it stays in sync
       with horizontal.js's eased "drive" mode (an event-driven scroll
       listener lags a frame and feels rubbery). On mobile the strip is
       its own scroller — same loop reads track.scrollLeft instead.
     - It translates the whole .gal-item tile, never the inner <img>.
       Translating the img slides the photo out of its frame and exposes
       the background (visible gaps). Translating the tile keeps the
       image filling it — tiles just overlap more, which is the point.
     - Centre is measured per frame from the LIVE tile rect MINUS the
       offset we already applied (so the measurement never reads our own
       transform back — feedback drift). We still cache nothing: reading
       ~5-8 visible tiles' rects per frame is cheap and lets the SAME code
       drive both the page filmstrip (main.scrollLeft) and the mobile
       strip (track.scrollLeft) with zero breakpoint bookkeeping.
     - Rez = screen position = centre + off, with off = centre*(speed-1)*K
       (K = PAR_F). A tile right of viewport centre (centre>0) gets pulled
       further right (off>0); left of centre pulled further left. Net
       result: screen speed = scroll speed × (1 + K*(speed-1)) — high
       speeds OVERTAKE the rail (speed 1) and visibly shoot past it, low
       speeds lag behind: the classic foreground/background depth cue that
       data-scroll-speed implies. this.offset is clamped so tiles never
       wander off the strip.
     - RUNS on desktop AND the mobile strip so parallax "works" on both.
       prefers-reduced-motion disables it entirely.

   NOTES:
     - The gallery's <main> is the drag surface; horizontal.js calls
       main.setPointerCapture() on pointerdown, which redirects click
       targets to <main>. So click-zoom listens on the document root and
       resolves the element under the cursor via elementFromPoint(),
       which ignores pointer capture.
   ================================================================== */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mqDesktop = window.matchMedia('(min-width: 900px)');

  var PAR_F = 0.12; // overtake factor per (speed-1): screen x (1 + F*(speed-1))
  var PAR_MAX = 260; // hard clamp so tiles never wander off the strip

  function init() {
    var track = document.querySelector('[data-gallery]');
    if (!track) return;
    var items = Array.prototype.slice.call(track.querySelectorAll('.gal-item'));
    if (!items.length) return;

    var main = document.querySelector('main[data-horizontal]');
    var imgs = items.map(function (it) { return it.querySelector('img'); });
    var speeds = items.map(function (it) { return parseFloat(it.getAttribute('data-speed')) || 1; });
    var clicked = false;
    var running = false;
    var raf = null;

    // --- reveal cascade -------------------------------------------------
    function reveal() {
      imgs.forEach(function (img, i) {
        img.style.transitionDelay = reduced ? '0s' : (i % 4) * 0.06 + 's';
        img.classList.add('-active');
      });
    }

    // --- click-to-zoom --------------------------------------------------
    // Listen on document (see header note) and resolve the image under
    // the cursor, so the pointer-captured <main> can't absorb the click.
    function wireClick() {
      document.addEventListener('click', function (e) {
        if (!mqDesktop.matches) return;
        var hit = document.elementFromPoint(e.clientX, e.clientY);
        var img = hit && hit.closest('.gal-item img');
        if (!img) return;
        clicked = true;
        img.classList.add('-clicked');
        setTimeout(function () {
          img.classList.remove('-clicked');
          // re-run the cascade: fade everything out, then back in
          imgs.forEach(function (im) { im.classList.remove('-active'); });
          setTimeout(function () {
            reveal();
            clicked = false; // resume parallax after the re-cascade
          }, 120);
        }, 1200);
      });
    }

    // --- parallax -------------------------------------------------------
    // offset_i = centre_i * (speed_i - 1) * PAR_F, applied to the TILE.
    // centre is measured live but always MINUS what we already applied,
    // so no feedback. Runs on desktop (page scroller) and mobile (strip
    // scroller) with the same code.
    var offs = new Array(items.length).fill(0);
    function tick() {
      raf = null;
      if (!running) return;
      var half = window.innerWidth / 2;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var r = it.getBoundingClientRect();
        var centre = r.left + r.width / 2 - offs[i] - half; // subtract our own shift
        var target = centre * (speeds[i] - 1) * PAR_F;
        if (target > PAR_MAX) target = PAR_MAX;
        else if (target < -PAR_MAX) target = -PAR_MAX;
        // low-pass toward target: no pops when a tile first enters the
        // window, and the motion reads as silk instead of quantised jumps
        var off = offs[i] + (target - offs[i]) * 0.18;
        if (Math.abs(off - offs[i]) > 0.05) {
          offs[i] = off;
          it.style.transform = 'translateX(' + off.toFixed(1) + 'px)';
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function resetTiles() {
      items.forEach(function (it, i) {
        it.style.transform = '';
        offs[i] = 0;
      });
    }

    // Parallax runs on desktop (page filmstrip) AND the mobile strip —
    // the loop reads live rects, so whichever scroller moves the tiles is
    // picked up. Reduced motion keeps it off.
    if (!reduced) {
      running = true;
      if (!raf) raf = requestAnimationFrame(tick);
    } else {
      resetTiles();
    }

    reveal();
    wireClick();
  }

  window.DCITC = window.DCITC || {};
  window.DCITC.gallery = { init: init };
})();
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

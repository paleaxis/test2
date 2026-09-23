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
  var mqBound = false; // mq 'change' gate wired once (module is re-initable)
  var vertical = null; // vertical fallback currently active?
  var vScroll, vResize; // vertical mode listener refs

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

  // vertical fallback for pages without <main data-horizontal> (article):
  // progress bar tracks normal document scroll. Plain paired add/remove —
  // setVertical(false) on the next horizontal page tears it down.
  function setVertical(on) {
    if (on === vertical) return;
    vertical = on;
    if (on) {
      vScroll = function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        var pct = max > 0 ? window.scrollY / max : 0;
        if (elProgress) elProgress.style.width = (pct * 100).toFixed(2) + '%';
      };
      vResize = vScroll;
      window.addEventListener('scroll', vScroll, { passive: true });
      window.addEventListener('resize', vResize);
      vScroll();
    } else {
      window.removeEventListener('scroll', vScroll);
      window.removeEventListener('resize', vResize);
      vScroll = vResize = null;
      if (elProgress) elProgress.style.width = '0%';
    }
  }

  // breakpoint gate, module-scope so it can be wired once
  function apply(e) {
    e.matches ? enable() : disable();
  }

  // entry point. Decides horizontal vs vertical and reacts live when the
  // viewport crosses the 900px breakpoint. RE-RUNNABLE: main.js calls it
  // again after every soft navigation with a fresh <main>; disable() runs
  // first so the previous page's element listeners are released and the
  // mq gate is never stacked (bindOnce handles that part).
  HX.init = function () {
    if (main) disable();
    if (vertical) setVertical(false);

    main = document.querySelector('main[data-horizontal]');
    elProgress = document.querySelector('.progress-fill');

    if (!main) {
      setVertical(true);
      return;
    }

    if (!mqBound) {
      mqBound = true;
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply); // older Safari
    }
    apply(mq);
  };
})();

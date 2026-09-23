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

  // RE-INIT SAFETY (soft navigation): state for the CURRENT page's
  // strip lives here at module scope so a second init() cancels the
  // previous page's rAF loop and re-points the single document click
  // handler, which stays bound once across navigations.
  var state = null; // { items, imgs, speeds, offs, running, raf }
  var clickBound = false;

  function cancelLoop() {
    if (!state) return;
    state.running = false;
    if (state.raf !== null) cancelAnimationFrame(state.raf);
    state.items.forEach(function (it, i) {
      it.style.transform = '';
      state.offs[i] = 0;
    });
    state = null;
  }

  function onDocClick(e) {
    if (!state || !clickBound) return;
    // Listen on document (see header note) and resolve the image under
    // the cursor, so the pointer-captured <main> can't absorb the click.
    if (!mqDesktop.matches) return;
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    var img = hit && hit.closest('.gal-item img');
    if (!img) return;
    var imgs = state.imgs;
    img.classList.add('-clicked');
    setTimeout(function () {
      img.classList.remove('-clicked');
      // re-run the cascade: fade everything out, then back in
      imgs.forEach(function (im) { im.classList.remove('-active'); });
      setTimeout(function () {
        imgs.forEach(function (im, i) {
          im.style.transitionDelay = reduced ? '0s' : (i % 4) * 0.06 + 's';
          im.classList.add('-active');
        });
      }, 120);
    }, 1200);
  }

  function init() {
    // drop any previous page's loop before re-scanning
    cancelLoop();
    if (!clickBound) {
      clickBound = true;
      document.addEventListener('click', onDocClick);
    }

    var track = document.querySelector('[data-gallery]');
    if (!track) return;
    var items = Array.prototype.slice.call(track.querySelectorAll('.gal-item'));
    if (!items.length) return;

    var imgs = items.map(function (it) { return it.querySelector('img'); });
    var speeds = items.map(function (it) { return parseFloat(it.getAttribute('data-speed')) || 1; });
    var offs = new Array(items.length).fill(0);

    state = { items: items, imgs: imgs, speeds: speeds, offs: offs, running: false, raf: null };

    // --- reveal cascade -------------------------------------------------
    function reveal() {
      imgs.forEach(function (img, i) {
        img.style.transitionDelay = reduced ? '0s' : (i % 4) * 0.06 + 's';
        img.classList.add('-active');
      });
    }

    // --- parallax -------------------------------------------------------
    // offset_i = centre_i * (speed_i - 1) * PAR_F, applied to the TILE.
    // centre is measured live but always MINUS what we already applied,
    // so no feedback. Runs on desktop (page scroller) and mobile (strip
    // scroller) with the same code.
    function tick() {
      state.raf = null;
      if (!state.running) return;
      var half = window.innerWidth / 2;
      for (var i = 0; i < state.items.length; i++) {
        var it = state.items[i];
        var r = it.getBoundingClientRect();
        var centre = r.left + r.width / 2 - state.offs[i] - half; // subtract our own shift
        var target = centre * (state.speeds[i] - 1) * PAR_F;
        if (target > PAR_MAX) target = PAR_MAX;
        else if (target < -PAR_MAX) target = -PAR_MAX;
        // low-pass toward target: no pops when a tile first enters the
        // window, and the motion reads as silk instead of quantised jumps
        var off = state.offs[i] + (target - state.offs[i]) * 0.18;
        if (Math.abs(off - state.offs[i]) > 0.05) {
          state.offs[i] = off;
          it.style.transform = 'translateX(' + off.toFixed(1) + 'px)';
        }
      }
      state.raf = requestAnimationFrame(tick);
    }

    // Parallax runs on desktop (page filmstrip) AND the mobile strip —
    // the loop reads live rects, so whichever scroller moves the tiles is
    // picked up. Reduced motion keeps it off.
    if (!reduced) {
      state.running = true;
      if (!state.raf) state.raf = requestAnimationFrame(tick);
    }

    reveal();
  }

  window.DCITC = window.DCITC || {};
  window.DCITC.gallery = { init: init };
})();
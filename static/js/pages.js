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

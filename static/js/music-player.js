/* ==================================================================
   DCITC MUSIC PLAYER  —  static/js/music-player.js
   ==================================================================
   Floating YouTube music card — desktop (≥900px) only, TOP-RIGHT corner
   below the sticky nav (the team-page batch switcher owns bottom-right).
   Plays the hardcoded playlist below; add/edit/remove tracks here.

   ADD A TRACK:
     Paste a song's YouTube video id + title + artist into TRACKS.
     The id is the 11-character code from any of these URLs:
       https://www.youtube.com/watch?v=<ID>
       https://youtu.be/<ID>            https://www.youtube.com/shorts/<ID>
       https://www.youtube.com/embed/<ID>

   DESIGN:
     - The card is body-level markup (src/partials/music.html) shared by
       every page, so with soft navigation (navigate.js) it is NEVER
       re-created — it and the hidden YouTube iframe survive page
       changes and the audio keeps playing. init() therefore runs once
       at boot, not per page.
     - Zero network cost on page load: the Google-hosted
       youtube.com/iframe_api bridge is injected only on the FIRST play
       tap (perf-pass mindset).
     - Pausing on tab leave: a visibilitychange listener pauses playback
       when the tab is hidden; returning does NOT auto-resume (browser
       policies + user intent), the player just sits paused.
     - Playlist position is persisted to localStorage('dcitc-music') so
       a hard reload resumes the right track (paused). Index shifts as
       TRACKS is edited are tolerated (clamped, default 0).
     - Nothing is ever injected from user input — there is none.
   ================================================================== */
(function () {
  'use strict';

  /* ─────────────────────── playlist ─────────────────────────────── */
  // Add songs below. Order = next-track order; it wraps around.
  var TRACKS = [
    { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', author: 'Rick Astley' },
    { id: '9bZkp7q19f0', title: 'Gangnam Style', author: 'PSY' },
    { id: 'kJQP7kiw5Fk', title: 'Despacito (audio)', author: 'Luis Fonsi & Daddy Yankee' },
  ];

  var LS_KEY = 'dcitc-music';
  var YT_HOST = 'https://www.youtube.com/iframe_api';
  var THUMB = 'https://i.ytimg.com/vi/%ID%/mqdefault.jpg';

  var mq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
  var root, fields = {};
  var player = null;
  var index = 0; // current playlist position
  var bound = false;

  /* 1 ─ lazy YouTube IFrame API --------------------------------------
     Injected once, on the first PLAY tap (a user gesture). Resolves
     when window.YT.Player is ready. */
  function ensureApi() {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      var queue = window.__dcitcYtQueue || (window.__dcitcYtQueue = []);
      queue.push({ resolve: resolve, reject: reject });
      if (window.__dcitcYtLoading) return;

      window.__dcitcYtLoading = true;
      window.onYouTubeIframeAPIReady = function () {
        var q = window.__dcitcYtQueue;
        window.__dcitcYtQueue = [];
        window.__dcitcYtLoading = false;
        q.forEach(function (e) { e.resolve(); });
      };
      var s = document.createElement('script');
      s.src = YT_HOST;
      s.async = true;
      s.onerror = function () {
        window.__dcitcYtLoading = false;
        var q = window.__dcitcYtQueue;
        window.__dcitcYtQueue = [];
        q.forEach(function (e) { e.reject(); });
      };
      document.head.appendChild(s);
    });
  }

  /* 2 ─ UI ------------------------------------------------------------ */
  function track() { return TRACKS[index % TRACKS.length] || TRACKS[0]; }

  function render() {
    var t = track();
    fields.title.textContent = t.title;
    fields.sub.textContent = t.author;
    fields.count.textContent = pad(index + 1) + ' / ' + pad(TRACKS.length);
    var img = fields.thumb;
    if (img.dataset.src !== t.id) {
      img.onerror = function () { img.hidden = true; };
      img.src = THUMB.replace('%ID%', t.id);
      img.hidden = false;
      img.dataset.src = t.id;
    }
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function setStatus(label) { fields.status.textContent = label; }

  function setError(msg) {
    fields.err.textContent = msg;
    fields.err.hidden = !msg;
    root.classList.toggle('is-error', !!msg);
  }

  function setPlaying(on) {
    root.classList.toggle('is-playing', on);
    fields.play.textContent = on ? '\u275A\u275A' : '\u25B6';
    fields.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    setStatus(on ? 'PLAYING' : 'PAUSED');
  }

  /* 3 ─ playback --------------------------------------------------------- */
  function buildPlayer() {
    var host = document.createElement('div');
    host.className = 'mus-frame-host';
    document.body.appendChild(host);
    player = new window.YT.Player(host, {
      width: '1',
      height: '1',
      playerVars: {
        rel: 0,
        controls: 0,
        disablekb: 1,
        playsinline: 1,
        iv_load_policy: 3,
      },
      events: {
        onStateChange: function (e) {
          var ST = window.YT.PlayerState;
          root.classList.remove('is-buffering');
          if (e.data === ST.PLAYING) {
            setPlaying(true);
          } else if (e.data === ST.PAUSED || e.data === ST.CUED) {
            setPlaying(false);
          } else if (e.data === ST.BUFFERING) {
            root.classList.add('is-buffering');
            setStatus('BUFFERING');
          } else if (e.data === ST.ENDED) {
            // auto-advance; the playlist never stops
            setPlaying(false);
            load(index + 1);
          }
        },
        onError: function () {
          root.classList.remove('is-buffering');
          setPlaying(false);
          setError('Could not play that track. Check the video id.');
        },
      },
    });
  }

  // load playlist position `i`, starting playback. Callers are user
  // gestures (play/prev/next) or the ENDED auto-advance.
  function play(i) {
    index = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    var t = track();
    setError(null);
    root.classList.add('is-buffering');
    setStatus('LOADING');
    render();
    ensureApi()
      .then(function () {
        if (!player) buildPlayer();
        try {
          player.loadVideoById({ videoId: t.id });
        } catch (e) {
          player.loadVideoById(t.id);
        }
        player.playVideo();
      })
      .catch(function () {
        setError('YouTube could not be reached. Check your connection.');
      });
    persist();
  }

  function toggle() {
    if (player && player.getPlayerState && player.getPlayerState() === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
      return;
    }
    play(index);
  }

  /* 4 ─ persistence ---------------------------------------------------- */
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ i: index, n: TRACKS.length }));
    } catch (e) {}
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { return; }
    if (!raw) return;
    try {
      var d = JSON.parse(raw);
      if (d && typeof d.i === 'number' && d.i >= 0 && d.i < TRACKS.length) index = d.i;
    } catch (e) {}
  }

  /* 5 ─ bindings --------------------------------------------------------- */
  function bind() {
    if (bound) return;
    bound = true;
    fields.open.addEventListener('click', function () { root.classList.add('is-open'); });
    fields.close.addEventListener('click', function () { root.classList.remove('is-open'); });
    fields.play.addEventListener('click', toggle);
    fields.next.addEventListener('click', function () { play(index + 1); });
    fields.prev.addEventListener('click', function () { play(index - 1); });

    // pause when the tab is hidden; stays paused when it returns
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && player && player.pauseVideo) player.pauseVideo();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('is-open')) root.classList.remove('is-open');
    });
  }

  /* 6 ─ boot -------------------------------------------------------------- */
  // Re-runnable and idempotent: it also fires from the live 900px gate so
  // a tablet orientation flip (mobile → desktop) boots the player without
  // stacking listeners (bindOnce) or binding twice (bound guard). The
  // card is BODY-level, so soft navigations never re-run this.
  function init() {
    var now = window.matchMedia('(min-width: 900px)').matches;
    if (!now && window.DCITC.bindOnce) {
      window.DCITC.bindOnce(mq, 'change', onGate);
      return;
    }
    root = document.querySelector('[data-mus]');
    if (!root) return; // desktop but no card (shouldn't happen)
    fields = {
      open: root.querySelector('[data-mus-open]'),
      close: root.querySelector('[data-mus-close]'),
      play: root.querySelector('[data-mus-play]'),
      prev: root.querySelector('[data-mus-prev]'),
      next: root.querySelector('[data-mus-next]'),
      title: root.querySelector('[data-mus-title]'),
      sub: root.querySelector('[data-mus-sub]'),
      count: root.querySelector('[data-mus-count]'),
      thumb: root.querySelector('[data-mus-thumb]'),
      status: root.querySelector('[data-mus-status]'),
      err: root.querySelector('[data-mus-err]'),
    };
    if (!fields.open || !fields.close || !fields.play) return;
    restore();
    render();
    setStatus('PAUSED');
    bind();
  }

  function onGate(e) {
    if (e.matches) init();
  }

  // register on the shared namespace consumed by main.js
  window.DCITC = window.DCITC || {};
  window.DCITC.musicPlayer = { init: init };
})();
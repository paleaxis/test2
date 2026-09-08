/* ==================================================================
   DCITC ADMIN APP  —  static/admin/app.js
   ==================================================================
   Standalone admin application (served at /admin/). Talks to Supabase
   with the PUBLIC PUBLISHABLE KEY only (the legacy anon key is the
   fallback) — the database RLS policies (see
   supabase/migrations/001_init.sql) are what actually authorize every
   read/write; this UI merely reflects them. Draft rows are filtered
   server-side for anon, and every write fails for non-admins.

   Placeholders below ({{ADMIN_…}}) are substituted at build time by
   scripts/build.js with public, non-secret values only.
   ================================================================== */
(function () {
  'use strict';

  /* ---------- build-time injected, public-only values ---------- */
  const SUPABASE_URL = '{{ADMIN_SUPABASE_URL}}';
  const SUPABASE_PUBLISHABLE_KEY = '{{ADMIN_SUPABASE_PUBLISHABLE_KEY}}';
  // slug catalogs for featured config (projects/resources stay in repo JSON)
  const PROJECT_SLUGS = {{ADMIN_PROJECT_SLUGS}};
  const RESOURCE_SLUGS = {{ADMIN_RESOURCE_SLUGS}};
  // repo seeds for the six managed collections ("Seed from repo" buttons)
  window.ADMIN_COLLECTION_SEEDS = {{ADMIN_COLLECTION_SEEDS}};

  if (!SUPABASE_URL || SUPABASE_URL.indexOf('{{') === 0) {
    document.body.innerHTML =
      '<div class="login-wrap"><div class="login-box"><h1>Admin not configured</h1>' +
      '<p class="hint">The build has no Supabase URL yet. Create <code class="k">.env</code> from ' +
      '<code class="k">.env.example</code> and rebuild the site.</p></div></div>';
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  let ADMIN = false;
  let current = 'dashboard';

  /* ---------- tiny helpers ---------- */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

  let statusTimer;
  function status(msg, kind) {
    const el = $('#status');
    el.textContent = msg;
    el.className = `status show ${kind || ''}`;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (el.className = 'status'), 4200);
  }

  // every DB call funnels through here so failures are always surfaced
  async function db(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  function fmtErr(e) {
    return (e && (e.message || e.error_description || e.error)) || String(e);
  }

  function renderMarkdownPreview(md, target) {
    const raw = window.marked.parse(md || '');
    target.innerHTML = window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  /* ---------- auth gate ---------- */

  // A failed sign-in (bad credentials) never reaches onAuthStateChange
  // with SIGNED_OUT, but a session that dies mid-page does. To keep the
  // login box able to show the REAL error, distinguish the two:
  //   1. sign-in submit renders its own inline message (and clears it on
  //      the next attempt);
  //   2. the SIGNED_OUT listener only toasts when there isn't already an
  //      inline login error on screen.
  function loginErrorBox() {
    const box = $('#login-error');
    if (!box) {
      status('', '');
      return null;
    }
    return box;
  }
  function showLoginError(msg) {
    const box = loginErrorBox();
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  }
  function clearLoginError() {
    const box = loginErrorBox();
    if (box) {
      box.textContent = '';
      box.hidden = true;
    }
  }

  async function loadProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    try {
      const rows = await db(sb.from('profiles').select('email,is_admin').eq('id', user.id).single());
      ADMIN = Boolean(rows && rows.is_admin);
      $('#whoami').textContent = (rows && rows.email) || user.email || user.id;
    } catch (e) {
      ADMIN = false;
      $('#whoami').textContent = user.email || user.id;
    }
    return ADMIN;
  }

  function showLogin(message) {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    if (message) status(message, 'err');
  }

  async function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    nav(current);
  }

  async function checkSession() {
    const ok = await loadProfile();
    if (ok) showApp();
    else {
      await sb.auth.signOut();
      showLogin(ok === false && $('#whoami').textContent ? 'This account does not have admin access.' : '');
    }
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();
    const btn = $('#login-btn');
    btn.disabled = true;
    try {
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!(await loadProfile())) {
        await sb.auth.signOut();
        throw new Error('This account does not have admin access.');
      }
      clearLoginError();
      status('Signed in.', 'ok');
      showApp();
    } catch (err) {
      // TRANSLATE the raw auth errors into what the club member actually
      // needs to do. The generic signOut() fallback above (non-admin)
      // surfaces here as an Error too.
      const raw = fmtErr(err);
      const em = $('#login-email').value.trim() || '';
      let msg = raw;
      const lower = `${raw} ${em}`.toLowerCase();
      if (lower.includes('invalid login credentials') || lower.includes('invalid credentials') || lower.includes('wrong password')) {
        msg = 'Email or password is incorrect. Check the credentials and try again.';
      } else if (lower.includes('email not confirmed')) {
        msg = 'Email not confirmed yet. Check your inbox (and spam) for the confirmation link, or ask an admin to confirm it for you.';
      } else if (lower.includes('already registered') || lower.includes('already exists')) {
        msg = 'Account exists but can not sign in — it was provisioned by the club; if this is new, confirm the email first.';
      } else if (lower.includes('admin access') || lower.includes('not have admin')) {
        msg = 'This account is not an administrator. Ask the club to grant admin access.';
      } else if (lower.includes('invalid api key')) {
        msg = 'Admin is not configured for this build yet (rebuild the site with Supabase keys in .env).';
      }
      showLoginError(msg);
      status(msg, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout-btn').addEventListener('click', () => sb.auth.signOut());

  // covers logout from another tab, expired refresh tokens, etc. Only
  // toast when there's no inline login error — otherwise a mid-login
  // session death would overwrite the real reason with "Signed out.".
  sb.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    const box = $('#login-error');
    if (box && !box.hidden) return;
    showLogin('Signed out.');
  });

  /* ---------- router ---------- */

  const views = {};
  function nav(name) {
    current = name;
    $$('.admin-side [data-nav]').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === name));
    const main = $('#main');
    main.innerHTML = '';
    views[name](main).catch((e) => {
      main.innerHTML = `<div class="panel"><h2>Could not load “${esc(name)}”</h2><p class="hint">${esc(fmtErr(e))}</p></div>`;
    });
  }
  $$('.admin-side [data-nav]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.nav)));

  /* ---------- shared editors ---------- */

  function chipEditor(items, placeholder) {
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    const render = () => {
      wrap.innerHTML =
        items.map((it, i) => `<span class="chip">${esc(it)}<button type="button" data-i="${i}" aria-label="remove">×</button></span>`).join('') +
        `<input type="text" placeholder="${esc(placeholder || 'add…')}" style="max-width:160px" />`;
    };
    render();
    wrap.addEventListener('click', (e) => {
      const i = e.target.dataset && e.target.dataset.i;
      if (i !== undefined) {
        items.splice(Number(i), 1);
        render();
      }
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.value.trim()) {
        e.preventDefault();
        items.push(e.target.value.trim());
        render();
        $('input', wrap).focus();
      }
    });
    wrap.getItems = () => items.filter((x) => String(x).trim());
    return wrap;
  }

  // program timeline editor: rows of {time, title}
  function programEditor(rows) {
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    const render = () => {
      wrap.innerHTML = rows
        .map(
          (r, i) => `<div class="row" data-i="${i}" style="grid-template-columns:110px 1fr 40px">
            <input type="text" data-k="time" value="${esc(r.time)}" placeholder="14:00" />
            <input type="text" data-k="title" value="${esc(r.title)}" placeholder="Segment title" />
            <button type="button" class="btn small danger" data-del="${i}" aria-label="remove">×</button>
          </div>`,
        )
        .join('') + '<button type="button" class="btn small" data-add>+ add row</button>';
    };
    render();
    wrap.addEventListener('input', (e) => {
      const box = e.target.closest('[data-i]');
      if (box) rows[Number(box.dataset.i)][e.target.dataset.k] = e.target.value;
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.dataset.del !== undefined) {
        rows.splice(Number(e.target.dataset.del), 1);
        render();
      } else if (e.target.dataset.add !== undefined) {
        rows.push({ time: '', title: '' });
        render();
        const inputs = $$('input', wrap);
        inputs[inputs.length - 2].focus();
      }
    });
    wrap.getRows = () => rows.filter((r) => String(r.title || '').trim() || String(r.time || '').trim());
    return wrap;
  }

  function field(label, inputHtml) {
    return `<label class="field"><span>${esc(label)}</span>${inputHtml}</label>`;
  }
  function textField(name, label, value, attrs) {
    return field(label, `<input type="text" name="${name}" value="${esc(value == null ? '' : value)}" ${attrs || ''} />`);
  }

  function mdEditor(name, value) {
    return `<div class="field"><span>Markdown</span>
      <textarea name="${name}" class="md" spellcheck="false">${esc(value || '')}</textarea>
      <div class="btn-row"><button type="button" class="btn small" data-preview>Preview</button></div>
      <div class="panel md-preview" style="display:none"></div>
    </div>`;
  }
  // delegate preview toggles inside any form
  document.addEventListener('click', (e) => {
    if (!e.target.dataset || e.target.dataset.preview === undefined) return;
    const btn = e.target;
    const form = btn.closest('form, .panel');
    const ta = $('textarea.md', form);
    const box = $('.md-preview', form);
    if (box.style.display === 'none') {
      renderMarkdownPreview(ta.value, box);
      box.style.display = '';
      btn.textContent = 'Hide preview';
    } else {
      box.style.display = 'none';
      btn.textContent = 'Preview';
    }
  });

  /* ================================================================
     DASHBOARD
     ================================================================ */
  views.dashboard = async (main) => {
    const [posts, events, funky] = await Promise.all([
      db(sb.from('posts').select('slug,draft')),
      db(sb.from('events').select('slug,draft,status')),
      db(sb.from('funkystuff_items').select('slug,draft')),
    ]);
    const live = (arr) => arr.filter((x) => !x.draft).length;
    const upcoming = events.filter((e) => e.status === 'upcoming' && !e.draft).length;
    main.innerHTML = `
      <h1 class="admin-title">Dashboard</h1>
      <p class="admin-sub">Content lives in Supabase. After editing, rebuild the static site
      (<code class="k">node scripts/build.js</code>) to publish it to the public pages —
      the build reads everything you change here.</p>
      <div class="featured-cols">
        <div class="panel"><h2>Posts</h2><p class="mono">${live(posts)} live · ${posts.length - live(posts)} draft</p></div>
        <div class="panel"><h2>Events</h2><p class="mono">${live(events)} live · ${upcoming} upcoming</p></div>
        <div class="panel"><h2>Funkystuff</h2><p class="mono">${live(funky)} live · ${funky.length - live(funky)} draft</p></div>
      </div>
      <div class="panel"><h2>Publish flow</h2>
        <p class="hint">1. edit content here (drafts stay private) → 2. flip to live →
        3. rebuild <code class="k">node scripts/build.js</code> → the static site regenerates from the database.
        Drafts are never readable by the public site — the database refuses it.</p>
      </div>`;
  };

  /* ================================================================
     POSTS
     ================================================================ */
  views.posts = async (main) => {
    const rows = await db(sb.from('posts').select('*').order('date', { ascending: false }));
    main.innerHTML = `
      <h1 class="admin-title">Posts</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-post">+ New post</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Date</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.date)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              ${r.draft ? '' : `<a class="btn small" href="/blog/${esc(r.slug)}/" target="_blank" rel="noopener">View</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="5" class="empty">No posts yet.</td></tr>'}</tbody></table></div>`;
    $('#new-post', main).addEventListener('click', () => postForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => postForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete post “${b.dataset.slug}” permanently?`)) return;
        try {
          await db(sb.from('posts').delete().eq('id', b.dataset.del));
          status('Post deleted.', 'ok');
          nav('posts');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  function postForm(row) {
    const r = row || { tags: [], date: new Date().toISOString().slice(0, 10), draft: true };
    const tags = chipEditor(Array.isArray(r.tags) ? [...r.tags] : [], 'add tag');
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit post' : 'New post'}</h1>
      <form id="post-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (the URL: /blog/&lt;slug&gt;/)', r.slug, r.slug ? 'readonly' : 'required pattern="[a-z0-9][a-z0-9-]*"')}
            ${field('Date', `<input type="date" name="date" value="${esc(r.date)}" required />`)}
          </div>
          <div class="row">
            ${textField('author', 'Author', r.author == null ? 'DCITC' : r.author)}
            ${textField('role', 'Author role', r.role == null ? 'Contributor' : r.role)}
            ${textField('category', 'Category chip', r.category)}
          </div>
          ${textField('description', 'Description (cards + meta)', r.description)}
          ${field('Tags', '')}
          <div id="tags-slot"></div>
          ${textField('image', 'Cover image URL (blank = generated plate)', r.image)}
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden from the public site</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live — publishes on next build</option>
            </select>
          </label>
          ${mdEditor('content_markdown', r.content_markdown)}
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
            <span class="hint" style="margin-left:auto">Saved markdown is sanitized when the site is built.</span>
          </div>
        </div>
      </form>`;
    $('#tags-slot', main).appendChild(tags);
    $('#cancel-edit', main).addEventListener('click', () => nav('posts'));
    $('#post-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const slug = f.slug.value.trim();
      if (!SLUG_RE.test(slug)) return status('Slug must be lowercase letters, digits and hyphens.', 'err');
      if (!f.title.value.trim()) return status('Title is required.', 'err');
      const payload = {
        slug,
        title: f.title.value.trim(),
        date: f.date.value,
        description: f.description.value.trim(),
        author: f.author.value.trim() || 'DCITC',
        role: f.role.value.trim() || 'Contributor',
        category: f.category.value.trim() || null,
        tags: tags.getItems(),
        image: f.image.value.trim() || null,
        draft: f.draft.value === 'true',
        content_markdown: f.content_markdown.value,
      };
      try {
        if (row) await db(sb.from('posts').update(payload).eq('id', row.id));
        else await db(sb.from('posts').insert(payload));
        status(row ? 'Post saved.' : 'Post created.', 'ok');
        nav('posts');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     EVENTS
     ================================================================ */
  views.events = async (main) => {
    const rows = await db(sb.from('events').select('*').order('date', { ascending: false }));
    main.innerHTML = `
      <h1 class="admin-title">Events</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-event">+ New event</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Date</th><th>Status</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.date)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.status)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              ${r.draft ? '' : `<a class="btn small" href="/events/${esc(r.slug)}/" target="_blank" rel="noopener">View</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="6" class="empty">No events yet.</td></tr>'}</tbody></table></div>`;
    $('#new-event', main).addEventListener('click', () => eventForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => eventForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete event “${b.dataset.slug}” permanently?`)) return;
        try {
          await db(sb.from('events').delete().eq('id', b.dataset.del));
          status('Event deleted.', 'ok');
          nav('events');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  function eventForm(row) {
    const r = row || {
      status: 'upcoming',
      date: new Date().toISOString().slice(0, 10),
      draft: true,
      speaker: {},
      program: [],
      resources: [],
    };
    const resources = chipEditor(Array.isArray(r.resources) ? [...r.resources] : [], 'add track');
    const program = programEditor(Array.isArray(r.program) ? r.program.map((p) => ({ ...p })) : []);
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit event' : 'New event'}</h1>
      <form id="event-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (the URL: /events/&lt;slug&gt;/)', r.slug, r.slug ? 'readonly' : 'required pattern="[a-z0-9][a-z0-9-]*"')}
            ${field('Date', `<input type="date" name="date" value="${esc(r.date)}" required />`)}
            ${field('Status', `<select name="status">
              ${['upcoming', 'ongoing', 'past'].map((s) => `<option ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>`)}
          </div>
          ${textField('subtitle', 'Subtitle (deck/archive cards)', r.subtitle)}
          ${textField('description', 'Short brief (detail page fallback)', r.description)}
          <div class="row">
            ${textField('location', 'Location', r.location)}
            ${textField('duration', 'Duration', r.duration)}
            ${textField('level', 'Level', r.level)}
          </div>
          <div class="row">
            ${textField('speaker_name', 'Speaker name', r.speaker && r.speaker.name)}
            ${textField('speaker_role', 'Speaker role', r.speaker && r.speaker.role)}
          </div>
          ${field('Program timeline', '')}
          <div id="program-slot"></div>
          ${field('Resource tracks', '')}
          <div id="resources-slot"></div>
          ${textField('register', 'Registration note', r.register)}
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden from the public site</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live — publishes on next build</option>
            </select>
          </label>
          ${mdEditor('content_markdown', r.content_markdown)}
          <p class="hint">Optional long-form writeup. Keep it short — the event page renders it inside the About plate.</p>
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
          </div>
        </div>
      </form>`;
    $('#program-slot', main).appendChild(program);
    $('#resources-slot', main).appendChild(resources);
    $('#cancel-edit', main).addEventListener('click', () => nav('events'));
    $('#event-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const slug = f.slug.value.trim();
      if (!SLUG_RE.test(slug)) return status('Slug must be lowercase letters, digits and hyphens.', 'err');
      if (!f.title.value.trim()) return status('Title is required.', 'err');
      const payload = {
        slug,
        title: f.title.value.trim(),
        date: f.date.value,
        status: f.status.value,
        subtitle: f.subtitle.value.trim(),
        description: f.description.value.trim(),
        location: f.location.value.trim() || null,
        duration: f.duration.value.trim() || null,
        level: f.level.value.trim() || null,
        speaker: { name: f.speaker_name.value.trim(), role: f.speaker_role.value.trim() },
        program: program.getRows(),
        resources: resources.getItems(),
        register: f.register.value.trim() || null,
        draft: f.draft.value === 'true',
        content_markdown: f.content_markdown.value,
      };
      try {
        if (row) await db(sb.from('events').update(payload).eq('id', row.id));
        else await db(sb.from('events').insert(payload));
        status(row ? 'Event saved.' : 'Event created.', 'ok');
        nav('events');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     FUNKYSTUFF
     ================================================================ */
  views.funkystuff = async (main) => {
    const rows = await db(sb.from('funkystuff_items').select('*').order('sort'));
    main.innerHTML = `
      <h1 class="admin-title">Funkystuff</h1>
      <div class="btn-row" style="margin-bottom:1rem"><button class="btn primary" id="new-funky">+ Add project</button></div>
      <div class="panel"><table class="list"><thead><tr><th>Title</th><th>Slug</th><th>Dept</th><th>By</th><th>State</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td>${esc(r.title)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.slug)}</td>
            <td class="mono" style="font-size:.8rem">${esc(r.dept)}</td>
            <td style="font-size:.85rem">${esc(r.by)}</td>
            <td><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'draft' : 'live'}</span></td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn small" data-edit="${r.id}">Edit</button>
              <button class="btn small" data-files="${r.slug}">Files</button>
              ${r.draft ? '' : `<a class="btn small" href="${esc(r.entry_file === 'index.html' ? '/funkystuff/' + esc(r.slug) + '/' : '/funkystuff/' + esc(r.slug) + '/' + esc(r.entry_file))}" target="_blank" rel="noopener">Open</a>`}
              <button class="btn small danger" data-del="${r.id}" data-slug="${esc(r.slug)}">Del</button>
            </td>
          </tr>`,
        )
        .join('') || '<tr><td colspan="6" class="empty">Nothing here yet.</td></tr>'}</tbody></table></div>
      <div id="files-panel"></div>`;
    $('#new-funky', main).addEventListener('click', () => funkyForm(null));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => funkyForm(rows.find((r) => r.id === b.dataset.edit))));
    $$('[data-files]', main).forEach((b) => b.addEventListener('click', () => showFunkyFiles(b.dataset.files)));
    $$('[data-del]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete funkystuff project “${b.dataset.slug}” (metadata + all files)?`)) return;
        try {
          const objs = await sb.storage.from('funkystuff').list(b.dataset.slug, { limit: 1000 });
          if (objs && objs.length) {
            await sb.storage.from('funkystuff').remove(objs.map((o) => `${b.dataset.slug}/${o.name}`));
          }
          await db(sb.from('funkystuff_items').delete().eq('id', b.dataset.del));
          status('Project deleted.', 'ok');
          nav('funkystuff');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  async function showFunkyFiles(slug) {
    const panel = $('#files-panel');
    panel.innerHTML = `<div class="panel"><h2>Files — <span class="mono">${esc(slug)}</span></h2><p class="empty">loading…</p></div>`;
    const objs = await sb.storage.from('funkystuff').list(slug, { limit: 1000 });
    panel.innerHTML = `<div class="panel"><h2>Files — <span class="mono">${esc(slug)}</span></h2>
      ${
        objs && objs.length
          ? `<table class="list"><tbody>${objs
              .map(
                (o) => `<tr><td class="mono" style="font-size:.8rem">${esc(o.name)}</td>
                  <td style="text-align:right"><button class="btn small danger" data-rm="${esc(o.name)}">Delete</button></td></tr>`,
              )
              .join('')}</tbody></table>`
          : '<p class="empty">No files uploaded yet.</p>'
      }
      <div class="btn-row"><input type="file" id="file-input" multiple />
        <button class="btn" id="upload-btn">Upload to ${esc(slug)}/</button></div>
      <p class="hint">Multiple files are supported (multi-asset projects). The entry file listed on the item opens in a new tab.</p>
    </div>`;
    $$('[data-rm]', panel).forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`Delete file ${b.dataset.rm}?`)) return;
        try {
          await sb.storage.from('funkystuff').remove([`${slug}/${b.dataset.rm}`]);
          showFunkyFiles(slug);
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
    $('#upload-btn', panel).addEventListener('click', async () => {
      const files = $('#file-input', panel).files;
      if (!files.length) return status('Choose files first.', 'err');
      try {
        for (const f of files) {
          const { error } = await sb.storage.from('funkystuff').upload(`${slug}/${f.name}`, f, { upsert: true });
          if (error) throw error;
        }
        status(`${files.length} file(s) uploaded.`, 'ok');
        showFunkyFiles(slug);
      } catch (e) {
        status(fmtErr(e), 'err');
      }
    });
  }

  function funkyForm(row) {
    const r = row || { entry_file: 'index.html', sort: 0, draft: true };
    const main = $('#main');
    main.innerHTML = `
      <h1 class="admin-title">${row ? 'Edit project' : 'Add project'}</h1>
      <form id="funky-form">
        <div class="panel">
          <div class="row">
            ${textField('title', 'Title', r.title, 'required')}
            ${textField('slug', 'Slug (also the storage folder)', r.slug, r.slug ? 'readonly' : 'required')}
            ${textField('dept', 'Department (filter chip)', r.dept, 'required')}
            ${textField('by', 'Author byline', r.by)}
          </div>
          <div class="row">
            ${textField('entry_file', 'Entry file (opened by list rows)', r.entry_file)}
            ${field('Sort order', `<input type="number" name="sort" value="${Number(r.sort) || 0}" />`)}
          </div>
          <label class="field"><span>State</span>
            <select name="draft">
              <option value="true" ${r.draft ? 'selected' : ''}>Draft — hidden</option>
              <option value="false" ${!r.draft ? 'selected' : ''}>Live</option>
            </select>
          </label>
          <p class="hint">Save first, then use “Files” on the list row to upload the project's HTML/assets.</p>
          <div class="btn-row">
            <button type="submit" class="btn primary">Save</button>
            <button type="button" class="btn" id="cancel-edit">Back</button>
          </div>
        </div>
      </form>`;
    $('#cancel-edit', main).addEventListener('click', () => nav('funkystuff'));
    $('#funky-form', main).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.title.value.trim() || !f.dept.value.trim()) return status('Title and department are required.', 'err');
      const payload = {
        title: f.title.value.trim(),
        dept: f.dept.value.trim(),
        by: f.by.value.trim(),
        entry_file: f.entry_file.value.trim() || 'index.html',
        sort: Number(f.sort.value) || 0,
        draft: f.draft.value === 'true',
      };
      try {
        if (row) {
          await db(sb.from('funkystuff_items').update(payload).eq('id', row.id));
        } else {
          const slug = f.slug.value.trim();
          if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) return status('Slug must be URL-safe (letters/digits/-/_/.).', 'err');
          await db(sb.from('funkystuff_items').insert({ ...payload, slug }));
        }
        status('Project saved.', 'ok');
        nav('funkystuff');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
  }

  /* ================================================================
     GALLERY
     ================================================================ */
  // The photo strip: metadata lives in gallery_items, image files in the
  // `gallery` storage bucket (flat — object key IS the file name). RLS:
  // anon reads published rows + downloads; admins manage everything.
  views.gallery = async (main) => {
    const rows = await db(sb.from('gallery_items').select('*').order('sort')).catch(() => []).then((r) => r || []);
    main.innerHTML = `
      <h1 class="admin-title">Gallery</h1>
      <p class="admin-sub">Drop images here and toggle each to live. The strip is rebuilt on the next
      <code class="k">node scripts/build.js</code> — sort order drives left-to-right placement.</p>
      <div class="panel">
        <div class="btn-row">
          <input type="file" id="gallery-files" accept="image/*" multiple />
          <button class="btn primary" id="gallery-upload">+ Upload</button>
        </div>
        <p class="hint" style="margin-top:.4rem">jpg/jpeg/png/webp/gif/svg. Filenames must be URL-safe
        (letters, digits, dash, underscore, dot — no spaces). The file name becomes the URL: /gallery/&lt;file&gt;.</p>
      </div>
      <div class="panel"><div class="gal-grid" id="gallery-grid">
        ${
          rows.length
            ? rows
                .map(
                  (r) => `<div class="gal-row" data-file="${esc(r.file)}">
                    <img src="${esc(`/gallery/${r.file}`)}" alt="" loading="lazy" />
                    <div class="gal-meta"><input type="text" data-caption value="${esc(r.caption)}" placeholder="caption" />
                      <span class="mono" style="font-size:.75rem">${esc(r.file)}</span></div>
                    <label class="chk">live
                      <input type="checkbox" data-draft ${r.draft ? '' : 'checked'} />
                    </label>
                    <button class="btn small danger" data-del="${esc(r.file)}">Del</button>
                  </div>`,
                )
                .join('')
            : '<p class="empty">No gallery items yet.</p>'
        }
      </div></div>`;
    $('#gallery-upload', main).addEventListener('click', uploadGalleryFiles);
    $('#gallery-grid', main).addEventListener('change', async (e) => {
      const rowEl = e.target.closest('[data-file]');
      if (!rowEl) return;
      const file = rowEl.dataset.file;
      const caption = $('[data-caption]', rowEl).value.trim();
      const live = $('[data-draft]', rowEl).checked;
      try {
        await db(sb.from('gallery_items').update({ caption, draft: !live }).eq('file', file));
        status('Gallery item updated.', 'ok');
      } catch (err) {
        status(fmtErr(err), 'err');
      }
    });
    $('#gallery-grid', main).addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      (async () => {
        if (!confirm(`Delete gallery item ${btn.dataset.del} (row + file)?`)) return;
        try {
          await sb.storage.from('gallery').remove([btn.dataset.del]);
          await db(sb.from('gallery_items').delete().eq('file', btn.dataset.del));
          status('Gallery item deleted.', 'ok');
          nav('gallery');
        } catch (err) {
          status(fmtErr(err), 'err');
        }
      })();
    });
  };

  async function uploadGalleryFiles() {
    const input = $('#gallery-files');
    const files = Array.from(input.files || []);
    if (!files.length) return status('Choose image files first.', 'err');
    let ok = 0;
    for (const f of files) {
      const name = f.name;
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        status(`Skipped ${esc(name)} — filename must be URL-safe (letters/digits/-/_/.).`, 'err');
        continue;
      }
      try {
        // upsert the storage object (created first so the public-download
        // RLS sees a published row later, not mid-upload)
        const { error: upErr } = await sb.storage.from('gallery').upload(name, f, { upsert: true });
        if (upErr) throw upErr;
        // row upsert on file — resolution=merge-duplicates keeps it single
        const { error: rowErr } = await sb.from('gallery_items').upsert(
          { file: name, caption: '', sort: 0, draft: false },
          { onConflict: 'file' },
        );
        if (rowErr) throw rowErr;
        ok++;
      } catch (err) {
        status(`Upload ${esc(name)} failed: ${fmtErr(err)}`, 'err');
        return;
      }
    }
    status(ok ? `${ok} image(s) uploaded (live). Rebuild the site to publish.` : 'Nothing uploaded.', ok ? 'ok' : 'err');
    input.value = '';
    nav('gallery');
  }

  /* ================================================================
     COLLECTIONS  (repo JSON collections managed as key → JSONB)
     ================================================================ */
  // site / nav / team / projects / resources / achievements — the
  // collections that used to be plain repo files. Each row is a payload
  // blob; the static build uses the row when present and falls back to
  // the local file otherwise. Saving here = authoring the next build.
  const COLLECTION_KEYS = ['site', 'nav', 'team', 'projects', 'resources', 'achievements'];
  views.collections = async (main) => {
    const rows = await db(sb.from('content_collections').select('key,payload,updated_at')).catch(() => []);
    const byKey = Object.fromEntries((rows || []).map((r) => [r.key, r]));
    main.innerHTML = `
      <h1 class="admin-title">Collections</h1>
      <p class="admin-sub">The <b>site</b>/<b>nav</b>/<b>team</b>/<b>projects</b>/<b>resources</b>/<b>achievements</b>
      collections that live as JSON. Each key is optional: when a row exists the build uses it as the
      source of truth; an absent row falls back to the file in the repo. Delete a row to “reset” it
      back to the repo file.</p>
      <div class="col-grid">${COLLECTION_KEYS.map(
        (key) => `<div class="panel col-card" data-key="${key}">
          <h2>${key}</h2>
          <p class="hint">${byKey[key] ? 'DB row (source of truth).' : 'Repo file (no DB row yet — click “Seed from repo” to create one).'}</p>
          <textarea class="col-editor mono" spellcheck="false" data-json>${esc(JSON.stringify((byKey[key] && byKey[key].payload) ?? null, null, 2))}</textarea>
          <div class="btn-row">
            <button class="btn primary small" data-save>Save</button>
            <button class="btn small" data-seed>Seed from repo</button>
            <button class="btn small danger" data-reset>Delete row</button>
          </div>
        </div>`,
      ).join('')}</div>`;

    // seed buttons: embed the repo files' JSON in the page (injected at
    // build time by scripts/build.js — same shape the site uses now)
    const seeds = window.ADMIN_COLLECTION_SEEDS || {};
    $$('[data-seed]', main).forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.closest('[data-key]').dataset.key;
        if (!(key in seeds)) return status(`No repo seed for "${key}".`, 'err');
        const ta = $('[data-json]', b.closest('[data-key]'));
        ta.value = JSON.stringify(seeds[key], null, 2);
        status(`Editor filled from repo "${key}.json". Save to write it.`, 'ok');
      });
    });
    $$('[data-save]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        const card = b.closest('[data-key]');
        const key = card.dataset.key;
        let payload;
        try {
          payload = JSON.parse($('[data-json]', card).value);
        } catch (e) {
          return status(`Collection "${key}" is not valid JSON: ${e.message.split('\n')[0]}`, 'err');
        }
        try {
          const { error } = await sb.from('content_collections').upsert({ key, payload }, { onConflict: 'key' });
          if (error) throw error;
          status(`Collection "${key}" saved. Rebuild the site to publish.`, 'ok');
          nav('collections');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
    $$('[data-reset]', main).forEach((b) =>
      b.addEventListener('click', async () => {
        const card = b.closest('[data-key]');
        const key = card.dataset.key;
        if (!confirm(`Delete the DB row for "${key}"? The repo file becomes the source again.`)) return;
        try {
          const { error } = await sb.from('content_collections').delete().eq('key', key);
          if (error) throw error;
          status(`Collection "${key}" reset to repo file.`, 'ok');
          nav('collections');
        } catch (e) {
          status(fmtErr(e), 'err');
        }
      }),
    );
  };

  /* ================================================================
     FEATURED CONFIG
     ================================================================ */
  // drag-to-reorder lists of slugs, add/remove per box. Array order is
  // exactly what the build uses — nothing is ever sorted implicitly.
  function refBox(title, items, available) {
    const wrap = document.createElement('div');
    wrap.className = 'panel';
    wrap.innerHTML = `<h2>${esc(title)}</h2>
      ${title.indexOf('Projects') === 0 ? '<p class="hint">Home grid + projects deck are tuned for at most 3.</p>' : ''}
      <div class="ref-box" data-list></div>
      <div class="ref-add"><select data-sel></select><button type="button" class="btn small" data-add>Add</button></div>`;
    const list = $('[data-list]', wrap);
    const sel = $('[data-sel]', wrap);
    const render = () => {
      list.innerHTML = items.length
        ? items
            .map(
              (s, i) =>
                `<div class="ref-item" draggable="true" data-i="${i}"><span class="mono">${String(i + 1).padStart(2, '0')}</span> ${esc(s)} <button type="button" data-rm="${i}" aria-label="remove" style="all:unset;cursor:pointer;color:var(--ink-dim)">×</button></div>`,
            )
            .join('')
        : '<p class="empty" style="padding:.4rem">Empty — section hidden on the site.</p>';
      sel.innerHTML =
        `<option value="">add…</option>` +
        available
          .filter((s) => !items.includes(s))
          .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
          .join('');
      sel.disabled = sel.options.length <= 1;
    };
    render();
    let dragIdx = null;
    list.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-i]');
      if (!it) return;
      dragIdx = Number(it.dataset.i);
      it.classList.add('is-dragging');
    });
    list.addEventListener('dragend', (e) => {
      const it = e.target.closest && e.target.closest('.is-dragging');
      if (it) it.classList.remove('is-dragging');
    });
    list.addEventListener('dragover', (e) => e.preventDefault());
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      const it = e.target.closest('[data-i]');
      const to = it ? Number(it.dataset.i) : items.length - 1;
      if (dragIdx === null || to === dragIdx) return;
      const [moved] = items.splice(dragIdx, 1);
      items.splice(to, 0, moved);
      dragIdx = null;
      render();
    });
    list.addEventListener('click', (e) => {
      if (e.target.dataset.rm !== undefined) {
        items.splice(Number(e.target.dataset.rm), 1);
        render();
      }
    });
    $('[data-add]', wrap).addEventListener('click', () => {
      if (sel.value) {
        items.push(sel.value);
        render();
      }
    });
    wrap.getItems = () => items.slice();
    return wrap;
  }

  views.featured = async (main) => {
    const rows = await db(sb.from('site_config').select('config').eq('id', 1));
    const cfg = (rows && rows[0] && rows[0].config) || {
      featured: { projects: [], posts: [], resources: [] },
      home: { events: [] },
    };
    // available slugs: published posts/events from the DB; projects and
    // resources come from the build-injected catalogs (they live in
    // repo JSON, not the database)
    const [pubPosts, pubEvents] = await Promise.all([
      db(sb.from('posts').select('slug').eq('draft', false)),
      db(sb.from('events').select('slug').eq('draft', false).in('status', ['upcoming', 'ongoing'])),
    ]);
    const avail = {
      'featured.projects': PROJECT_SLUGS,
      'featured.posts': pubPosts.map((p) => p.slug),
      'featured.resources': RESOURCE_SLUGS,
      'home.events': pubEvents.map((e) => e.slug),
    };
    const boxes = {
      'featured.projects': refBox('Featured projects', [...(cfg.featured.projects || [])], avail['featured.projects']),
      'featured.posts': refBox('Featured posts', [...(cfg.featured.posts || [])], avail['featured.posts']),
      'featured.resources': refBox('Featured resources', [...(cfg.featured.resources || [])], avail['featured.resources']),
      'home.events': refBox('Home events', [...(cfg.home.events || [])], avail['home.events']),
    };
    main.innerHTML = `
      <h1 class="admin-title">Featured content</h1>
      <p class="admin-sub">Drag to reorder — the order here is exactly the display order on the site.
      Removing everything hides that section. Only published items are offered.</p>
      <div class="featured-cols" id="featured-cols"></div>
      <div class="btn-row"><button class="btn primary" id="save-config">Save configuration</button></div>`;
    const cols = $('#featured-cols', main);
    Object.values(boxes).forEach((b) => cols.appendChild(b));
    $('#save-config', main).addEventListener('click', async () => {
      const next = {
        featured: {
          projects: boxes['featured.projects'].getItems(),
          posts: boxes['featured.posts'].getItems(),
          resources: boxes['featured.resources'].getItems(),
        },
        home: { events: boxes['home.events'].getItems() },
      };
      if (next.featured.projects.length > 3) {
        return status('featured.projects is capped at 3 — the home grid breaks beyond that.', 'err');
      }
      try {
        const { error } = await sb.from('site_config').update({ config: next }).eq('id', 1);
        if (error) throw error;
        status('Configuration saved. Rebuild the site to publish it.', 'ok');
      } catch (e) {
        status(fmtErr(e), 'err');
      }
    });
  };

  /* ---------- boot ---------- */

  checkSession();
})();

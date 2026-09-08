#!/usr/bin/env node
'use strict';

/**
 * CONTENT SOURCE  —  scripts/lib/content-source.js
 * ==================================================================
 * The single adapter between the existing build pipeline and content
 * sources. Priority:
 *
 *   1. Supabase (if SUPABASE_URL + a server-side key are set:
 *      SUPABASE_SECRET_KEY, or the legacy SUPABASE_SERVICE_ROLE_KEY)
 *   2. Local files (content/blog, content/events, src/data/funkystuff.json)
 *      as fallback / offline mode — the original behavior.
 *
 * Every returned collection is already enriched with EXACTLY the fields
 * build.js always computed (slug, url, code, cover, readingTime, status
 * booleans, contentHtml …) so the templates never learn where content
 * came from. Markdown → HTML conversion + sanitization lives HERE so
 * both sources share one renderer.
 *
 * Validation errors throw with the same message style the build has
 * always used ("blog post \"x\" is missing required frontmatter …") so
 * existing CI/tooling expectations keep working.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const rest = require('./supabase-rest');

const ROOT = path.join(__dirname, '..', '..');

/* ------------------------------------------------------------------ */
/* markdown rendering (shared by both sources)                         */
/* ------------------------------------------------------------------ */

// escape raw text going inside <code> in fenced blocks
function escHtml(x) {
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(token) {
      return `<pre class="code"><code>${escHtml(token.text)}</code></pre>`;
    },
  },
});

// Sanitizer allowlist — mirrors the styles 08-pages.css (.md-body) can
// render: headings, lists, tables, quotes, code, links, images, hr.
// Scripts/iframe/style/event handlers never survive. Relative image/src
// values stay relative; javascript: URLs are dropped by default.
const SANITIZE_OPTS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'strong', 'em', 'del', 's', 'br', 'hr', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['align'],
    td: ['align'],
    // marked's code-fence renderer emits <pre class="code"> — the site's
    // terminal styling (07-components.css) hangs off exactly that class.
    pre: ['class'],
  },
  allowedClasses: {
    // …and only THAT class may survive
    pre: ['code'],
  },
  transformTags: {
    // force external links out of the page frame; internal absolute
    // links (/blog/…) are untouched
    a: (tagName, attribs) => {
      const href = attribs.href || '';
      const out = { ...attribs };
      if (/^https?:\/\//i.test(href)) {
        out.target = '_blank';
        out.rel = 'noopener noreferrer';
      }
      return { tagName, attribs: out };
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
};

function renderMarkdown(md) {
  const raw = marked.parse(String(md || ''));
  return sanitizeHtml(raw, SANITIZE_OPTS);
}

/* ------------------------------------------------------------------ */
/* shared enrichment (identical math to the original inline code)      */
/* ------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseISO(s) {
  const [y, m, d] = String(s || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function fmtDate(s) {
  const dt = parseISO(s);
  if (!dt) return s;
  return `${dt.d} ${MONTHS[dt.m - 1]} ${dt.y}`;
}

function readingTime(words) {
  const n = Number(words) || 0;
  return `${Math.max(1, Math.round(n / 200))} min read`;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* LOCAL loaders — byte-identical behavior to the original build.js     */
/* (kept here so build.js stops owning the details; both sources flow   */
/*  through the same enrichment below)                                  */
/* ------------------------------------------------------------------ */

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function parseFrontmatter(file, raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)} has no ---frontmatter--- block`);
  let fm;
  try {
    fm = yaml.load(m[1]);
  } catch (e) {
    throw new Error(`${path.basename(file)} has invalid frontmatter YAML: ${e.message}`);
  }
  return { fm: fm || {}, body: m[2] };
}

function localPosts() {
  const BLOG_DIR = path.join(ROOT, 'content', 'blog');
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();

  const posts = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (!SLUG_RE.test(slug)) {
      throw new Error(`blog filename "${f}" must be lowercase-hyphenated (it becomes the URL)`);
    }
    const { fm, body } = parseFrontmatter(path.join(BLOG_DIR, f), read(path.join(BLOG_DIR, f)));
    if (fm.draft) continue;
    for (const key of ['title', 'date']) {
      if (!fm[key]) throw new Error(`blog post "${f}" is missing required frontmatter "${key}"`);
    }
    if (!parseISO(fm.date)) throw new Error(`blog post "${f}" has an unparsable date ("${fm.date}")`);
    posts.push(normalizePost({ ...fm, slug, content_markdown: body }));
  }
  return posts;
}

function localEvents() {
  const EVENTS_DIR = path.join(ROOT, 'content', 'events');
  if (!fs.existsSync(EVENTS_DIR)) return [];
  const files = fs
    .readdirSync(EVENTS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort();

  const evs = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (!SLUG_RE.test(slug)) {
      throw new Error(`event filename "${f}" must be lowercase-hyphenated (it becomes the URL)`);
    }
    const { fm, body } = parseFrontmatter(path.join(EVENTS_DIR, f), read(path.join(EVENTS_DIR, f)));
    if (fm.draft) continue;
    for (const key of ['title', 'date', 'status']) {
      if (!fm[key]) throw new Error(`event "${f}" is missing required frontmatter "${key}"`);
    }
    if (!parseISO(fm.date)) throw new Error(`event "${f}" has an unparsable date ("${fm.date}")`);
    if (!['upcoming', 'ongoing', 'past'].includes(fm.status)) {
      throw new Error(`event "${f}" status must be upcoming|ongoing|past (got "${fm.status}")`);
    }
    evs.push(normalizeEvent({ ...fm, slug, content_markdown: body }));
  }
  return evs;
}

function localFunkystuff() {
  const FUNKY_DIR = path.join(ROOT, 'funkystuff');
  const metaPath = path.join(ROOT, 'src', 'data', 'funkystuff.json');
  if (!fs.existsSync(metaPath)) return [];
  const meta = JSON.parse(read(metaPath));
  const files = fs.existsSync(FUNKY_DIR)
    ? fs.readdirSync(FUNKY_DIR).filter((f) => /\.html?$/i.test(f))
    : [];

  return meta.map((m, i) => {
    if (!m.file || !files.includes(m.file)) {
      throw new Error(`funkystuff: manifest entry ${i + 1} references "${m.file}" but no such file exists in funkystuff/`);
    }
    if (!String(m.title || '').trim() || !String(m.dept || '').trim()) {
      throw new Error(`funkystuff: "${m.file}" needs non-empty "title" and "dept" in src/data/funkystuff.json`);
    }
    return normalizeFunky({
      slug: m.file.replace(/\.html?$/i, ''),
      title: m.title,
      dept: m.dept,
      by: m.by || '',
      entry_file: m.file,
      sort: i,
      draft: false,
      _localFile: m.file, // single-file legacy shape → build copies from funkystuff/
    });
  });
}

function localSiteConfig() {
  const p = path.join(ROOT, 'src', 'config', 'site.json');
  return JSON.parse(read(p));
}

/* ------------------------------------------------------------------ */
/* normalization — same field enrichment for BOTH sources              */
/* ------------------------------------------------------------------ */

function normalizePost(row) {
  if (!row.slug || !SLUG_RE.test(row.slug)) {
    throw new Error(`post "${row.slug || '?'}": slug must be lowercase-hyphenated (it becomes the URL)`);
  }
  if (!row.title) throw new Error(`post "${row.slug}" is missing required "title"`);
  if (!row.date || !parseISO(row.date)) {
    throw new Error(`post "${row.slug}" has an unparsable date ("${row.date}") — use YYYY-MM-DD`);
  }
  const body = String(row.content_markdown || '');
  const words = body.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    ...row,
    tags,
    url: `/blog/${row.slug}/`,
    subtitle: row.description || '',
    category: row.category || tags[0] || 'Journal',
    author: row.author || 'DCITC',
    role: row.role || 'Contributor',
    cover: row.image || `/img/gen/${row.slug}.svg`,
    readingTime: readingTime(words),
    dateFmt: fmtDate(row.date),
    contentHtml: renderMarkdown(body),
  };
}

function normalizeEvent(row) {
  if (!row.slug || !SLUG_RE.test(row.slug)) {
    throw new Error(`event "${row.slug || '?'}": slug must be lowercase-hyphenated (it becomes the URL)`);
  }
  if (!row.title) throw new Error(`event "${row.slug}" is missing required "title"`);
  if (!row.date || !parseISO(row.date)) {
    throw new Error(`event "${row.slug}" has an unparsable date ("${row.date}") — use YYYY-MM-DD`);
  }
  if (!['upcoming', 'ongoing', 'past'].includes(row.status)) {
    throw new Error(`event "${row.slug}" status must be upcoming|ongoing|past (got "${row.status}")`);
  }
  const body = String(row.content_markdown || '');
  return {
    ...row,
    speaker: row.speaker && typeof row.speaker === 'object' ? row.speaker : {},
    program: Array.isArray(row.program) ? row.program : [],
    resources: Array.isArray(row.resources) ? row.resources : [],
    url: `/events/${row.slug}/`,
    contentHtml: body.trim() ? renderMarkdown(body) : '',
    dateFmt: fmtDate(row.date),
  };
}

function normalizeFunky(row) {
  if (!row.slug || !/^[a-z0-9][a-z0-9._-]*$/.test(row.slug)) {
    throw new Error(`funkystuff "${row.slug || '?'}": slug must be URL-safe (letters/digits/-/_/.)`);
  }
  if (!String(row.title || '').trim()) throw new Error(`funkystuff "${row.slug}" needs a title`);
  if (!String(row.dept || '').trim()) throw new Error(`funkystuff "${row.slug}" needs a dept`);
  // url = what list rows open. Local single-file projects keep the flat
  // legacy path (/funkystuff/<file>.html); remote projects are served
  // from their slug folder in public/funkystuff/<slug>/….
  const entry = row.entry_file || 'index.html';
  return {
    ...row,
    // legacy shape: `file` = the flat public filename (local mode); the
    // build's local copy loop uses it. Remote mode serves from the slug
    // folder instead and ignores it.
    file: row._localFile || entry,
    url: row._localFile ? `/funkystuff/${row._localFile}` : `/funkystuff/${row.slug}/${entry}`,
  };
}

/* ------------------------------------------------------------------ */
/* SUPABASE loader — reads published content via the REST surface       */
/* ------------------------------------------------------------------ */

async function supabasePosts(c) {
  const rows = await rest.fetchAll(c, 'posts', 'select=*&draft=is.false&order=date.desc,slug.asc');
  return rows.map(normalizePost);
}

async function supabaseEvents(c) {
  const rows = await rest.fetchAll(c, 'events', 'select=*&draft=is.false&order=date.desc,slug.asc');
  return rows.map(normalizeEvent);
}

async function supabaseGallery(c) {
  // published items in display order (sort asc, then file for stability)
  const items = await rest.fetchAll(
    c,
    'gallery_items',
    'select=file,caption,sort&draft=is.false&order=sort.asc,file.asc',
  );

  // object index of every file in the gallery bucket (flat, at bucket
  // root — key = file name). Used by build.js to download each file
  // verbatim into public/gallery/.
  let files = [];
  if (items.length) {
    const objs = await rest.listObjects(c, 'gallery', '');
    // with an empty prefix the storage API returns names relative to the
    // bucket root, i.e. the full file name — exactly what we want
    files = objs.filter((o) => o.name && !o.name.endsWith('/')).map((o) => ({ path: o.name }));
  }
  return { items, files };
}

async function supabaseCollections(c) {
  // The six repo JSON collections that were still file-managed:
  // site/nav/team/projects/resources/achievements (the site_config table
  // covers src/config/site.json separately). Returns { key: payload }.
  const rows = await rest.fetchAll(c, 'content_collections', 'select=key,payload');
  const out = {};
  for (const r of rows) out[r.key] = r.payload;
  return out;
}

async function supabaseFunkystuff(c) {
  // published items, manifest (sort) order first, then slug for stability
  const rows = await rest.fetchAll(
    c,
    'funkystuff_items',
    'select=*&draft=is.false&order=sort.asc,slug.asc',
  );
  const items = rows.map((r) =>
    normalizeFunky({ ...r, _remote: true }),
  );

  // Every project's files are copied verbatim from storage into
  // public/funkystuff/<slug>/… — fetch the object index now so build.js
  // gets one flat list of {slug, path} to download.
  const files = [];
  for (const it of items) {
    const objs = await rest.listObjects(c, 'funkystuff', `${it.slug}/`);
    for (const o of objs) {
      if (!o.name || o.name.endsWith('/')) continue; // synthetic folder rows
      // The storage API reports names RELATIVE to the requested prefix
      // (confirmed live: 'line-runner/' lists 'line-runner.html'), unlike
      // some SDK docs. Downstream expects the full key from the bucket
      // root, so the slug folder is re-prefixed (guarded for providers
      // that already return full keys).
      const base = `${it.slug}/`;
      files.push({ slug: it.slug, path: o.name.startsWith(base) ? o.name : `${base}${o.name}` });
    }
  }
  return { items, files };
}

/* ------------------------------------------------------------------ */
/* PUBLIC API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Load all backend-managed content collections.
 * @returns {Promise<{
 *   source: 'supabase'|'local',
 *   posts: Array, events: Array,
 *   funky: Array, funkyFiles: Array<{slug,path}>|null,
 *   gallery: {items:Array,files:Array<{path}>}|null,
 *   collections: object|null,        // { key: payload } or null (local mode)
 *   siteConfig: object,
 *   notices: string[]
 * }>}
 */
async function loadContent() {
  const c = rest.client();
  const notices = [];

  if (!c.enabled) {
    return {
      source: 'local',
      posts: enrichPosts(localPosts()),
      events: enrichEvents(localEvents()),
      funky: localFunkystuff(),
      funkyFiles: null,
      gallery: null,
      collections: null,
      siteConfig: localSiteConfig(),
      notices,
    };
  }

  console.log('content source: Supabase (build-time service key)');
  try {
    const [posts, events, funky, siteConfig, gallery, collections] = await Promise.all([
      supabasePosts(c),
      supabaseEvents(c),
      supabaseFunkystuff(c),
      rest
        .fetchAll(c, 'site_config', 'select=config&id=eq.1')
        .then((r) => (r[0] && r[0].config) || null),
      supabaseGallery(c),
      supabaseCollections(c),
    ]);

    // Fallbacks: an empty/unset site_config row falls back to the local
    // file (which stays in the repo as the seed/default).
    const config = siteConfig || localSiteConfig();
    if (!siteConfig) {
      notices.push('site_config row empty/missing in Supabase — falling back to src/config/site.json');
    }
    if (funky.items.length === 0 && localFunkystuff().length > 0) {
      notices.push('no funkystuff items in Supabase yet — falling back to local manifest');
      return {
        source: 'supabase+local-funky',
        posts: enrichPosts(posts),
        events: enrichEvents(events),
        funky: localFunkystuff(),
        funkyFiles: null,
        gallery,
        collections,
        siteConfig: config,
        notices,
      };
    }
    if (gallery.items.length === 0) {
      notices.push('no published gallery items in Supabase yet — falling back to content/gallery/');
    }

    return {
      source: 'supabase',
      posts: enrichPosts(posts),
      events: enrichEvents(events),
      funky: funky.items,
      funkyFiles: funky.files,
      gallery,
      collections,
      siteConfig: config,
      notices,
    };
  } catch (e) {
    // A dead/unreachable Supabase must not brick the static build — the
    // site can always fall back to the last-known local content, loudly.
    notices.push(`Supabase fetch failed (${e.message.split('\n')[0]}) — falling back to local content`);
    return {
      source: 'local-fallback',
      posts: enrichPosts(localPosts()),
      events: enrichEvents(localEvents()),
      funky: localFunkystuff(),
      funkyFiles: null,
      gallery: null,
      collections: null,
      siteConfig: localSiteConfig(),
      notices,
    };
  }
}

/* sorting + codes (post-source; identical rules to the original build) */

function enrichPosts(posts) {
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return posts.map((p, i) => ({ ...p, code: `ART.${String(i + 1).padStart(2, '0')}` }));
}

function enrichEvents(evs) {
  evs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  const mapped = evs.map((ev, i) => ({
    ...ev,
    code: `EVENT.${String(i + 1).padStart(2, '0')}`,
    past: ev.status === 'past',
    ongoing: ev.status === 'ongoing',
    upcoming: ev.status === 'upcoming',
    dateFmt: ev.dateFmt || fmtDate(ev.date),
  }));
  const firstUpcoming = mapped.find((ev) => ev.upcoming);
  if (firstUpcoming) firstUpcoming.first = true;
  return mapped;
}

module.exports = {
  loadContent,
  renderMarkdown,
  SANITIZE_OPTS,
  parseISO,
  SLUG_RE,
  ISO_DATE_RE,
};

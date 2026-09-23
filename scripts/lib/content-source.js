#!/usr/bin/env node
'use strict';

/**
 * CONTENT SOURCE  —  scripts/lib/content-source.js
 * ==================================================================
 * Pure file-system content loader. All content lives in local files:
 *
 *   content/blog/*.md        → blog posts
 *   content/events/*.md      → events
 *   content/gallery/*        → gallery images (any jpg/png/webp/gif/svg)
 *   src/data/funkystuff.json → funkystuff manifest (+ funkystuff/*.html)
 *   src/config/site.json     → featured/curated selections
 *
 * Drop a .md file in content/blog/ or content/events/ with valid
 * frontmatter and it appears on the next build. Drop an image in
 * content/gallery/ and it becomes a gallery item.
 *
 * Every returned collection is enriched with the fields build.js
 * expects (slug, url, code, cover, readingTime, status booleans,
 * contentHtml …). Markdown → HTML + sanitization lives here.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const ROOT = path.join(__dirname, '..', '..');

/* ------------------------------------------------------------------ */
/* markdown rendering                                                   */
/* ------------------------------------------------------------------ */

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
    pre: ['class'],
  },
  allowedClasses: {
    pre: ['code'],
  },
  transformTags: {
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
/* shared helpers                                                       */
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

/* ------------------------------------------------------------------ */
/* normalization — same field enrichment for all sources                */
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
  return {
    ...row,
    file: row._localFile || row.entry_file || 'index.html',
    url: `/funkystuff/${row._localFile || row.entry_file || 'index.html'}`,
  };
}

/* ------------------------------------------------------------------ */
/* LOCAL loaders — read from the file system                            */
/* ------------------------------------------------------------------ */

function loadPosts() {
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

  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return posts.map((p, i) => ({ ...p, code: `ART.${String(i + 1).padStart(2, '0')}` }));
}

function loadEvents() {
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

  evs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return evs.map((ev, i) => ({
    ...ev,
    code: `EVENT.${String(i + 1).padStart(2, '0')}`,
    past: ev.status === 'past',
    ongoing: ev.status === 'ongoing',
    upcoming: ev.status === 'upcoming',
    dateFmt: ev.dateFmt || fmtDate(ev.date),
  }));
}

function loadFunkystuff() {
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
      _localFile: m.file,
    });
  });
}

function loadSiteConfig() {
  const p = path.join(ROOT, 'src', 'config', 'site.json');
  return JSON.parse(read(p));
}

/* ------------------------------------------------------------------ */
/* PUBLIC API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Load all content from local files.
 * @returns {{
 *   posts: Array, events: Array,
 *   funky: Array,
 *   siteConfig: object
 * }}
 */
function loadContent() {
  return {
    posts: loadPosts(),
    events: loadEvents(),
    funky: loadFunkystuff(),
    siteConfig: loadSiteConfig(),
  };
}

module.exports = {
  loadContent,
  renderMarkdown,
  SANITIZE_OPTS,
  parseISO,
  SLUG_RE,
  ISO_DATE_RE,
};

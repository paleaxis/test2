#!/usr/bin/env node
'use strict';

/**
 * DCITC STATIC SITE BUILDER  —  scripts/build.js
 * ==============================================
 * WHAT THIS FILE CONTROLS:
 *   This is the entire build pipeline of the website. Running
 *   `node scripts/build.js` reads every source file and writes the
 *   finished site into /public. Nothing else in the repo executes at
 *   build time — this one script does all of it:
 *
 *     1. Loads all content from src/data/*.json and enriches each item
 *        with computed fields (codes like "PROJ.01", urls, formatted
 *        dates, featured subsets, counts).
 *     2. Renders every page template in src/pages/*.html through the
 *        template engine below, producing directory-style output:
 *        public/<page>/index.html.
 *     3. Renders per-item pages (one per project/event/article) into
 *        public/projects|events|blog/<slug>/index.html.
 *     4. Generates deterministic SVG artwork (project covers, gallery
 *        plates, team avatars, logo/favicon) into public/img/gen/.
 *     5. Concatenates static/css/01..09 → public/css/main.css and
 *        static/js/theme…main → public/js/app.js (order matters: see
 *        CSS_FILES / JS_FILES near the bottom), then copies vendored
 *        libraries (anime.min.js) into public/ verbatim.
 *
 * WHY HUGO-COMPATIBLE:
 *   The output in /public is plain static HTML + CSS + JS, laid out in
 *   a Hugo-compatible way so the site can later move to Hugo without
 *   redesigning the interface:
 *
 *     src/data/     ->  becomes Hugo content/ + data/ collections
 *     src/partials/ ->  becomes Hugo layouts/partials/
 *     src/pages/    ->  becomes Hugo layouts/_default/ + layouts/<type>/
 *     static/       ->  maps 1:1 to Hugo static/
 *     public/       ->  build output (Hugo "public")
 *
 * THE TEMPLATE LANGUAGE (a tiny Hugo-flavoured subset):
 *   {{ .path }}                    variable output (raw)
 *   {{ each .collection }}..{{ end }}   loop (inside, . is the item)
 *   {{ if .cond }}..{{ else }}..{{ end }}
 *   {{ if not .cond }}..{{ end }}
 *   {{ if or (eq .a "x") (eq .b "y") }}   boolean groups in parens
 *   {{ include "partials/x.html" }}
 *   {{ fmtDate .date }}            helper calls (see `helpers` object)
 *   {{ $.rootField }}              escape to root scope
 *
 * REGRESSION GUARDS (bugs that were fixed here — do not reintroduce):
 *   - `or`/`and` arguments must be evaluated as CONDITIONS. condVal()
 *     strips wrapping parens and routes condition-looking args to
 *     evalCond(); bare paths are checked for truthiness instead.
 *   - splitArgs() must group (...) segments via paren-depth tracking
 *     AND preserve quotes inside paren groups. If it didn't,
 *     `(eq .role "X")` would split into `(eq`, `.role`, `X)` and the
 *     stray `(eq` string would make every `or` condition true.
 *   - Hard guards: template depth > 60 or > 1M render iterations throw.
 */

const fs = require('fs');
const path = require('path');
const { minifyCss, minifyJs, minifyHtml } = require('./lib/minify');
// Content adapter — reads all content from the file system
// (content/blog/*.md, content/events/*.md, src/data/*.json…). See
// scripts/lib/content-source.js.
const contentSource = require('./lib/content-source');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const STATIC = path.join(ROOT, 'static');
const OUT = path.join(ROOT, 'public');

/* ------------------------------------------------------------------ */
/* small utilities                                                     */
/* ------------------------------------------------------------------ */

// read a file as utf-8 text
function read(p) {
  return fs.readFileSync(p, 'utf8');
}
// write text, creating parent directories on demand (used everywhere)
function write(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c);
}
// write a rendered page through the HTML minifier (comments stripped,
// formatting whitespace collapsed; pre/script/style preserved verbatim)
// DCITC_NO_MINIFY=1 rebuilds untouched output (debug/forensics only).
function writeHtml(p, c) {
  write(p, process.env.DCITC_NO_MINIFY ? c : minifyHtml(c));
}
// read + parse a JSON data file from src/data/
function readJSON(p) {
  return JSON.parse(read(p));
}

// FNV-1a string hash → uint32. Turns any seed string ("nodhini",
// "tanvir", …) into a number we can feed the PRNG below. Deterministic:
// same seed → same artwork, every build.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 — tiny seeded PRNG. Paired with hashStr it gives every
// generated SVG reproducible "randomness" without storing anything.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_L = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// "2026-09-18" → { y: 2026, m: 9, d: 18 } or null if malformed.
// Used by the date helpers; deliberately avoids Date() timezone issues.
function parseISO(s) {
  const [y, m, d] = String(s || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/* ------------------------------------------------------------------ */
/* template engine                                                     */
/* ------------------------------------------------------------------ */

// One-argument output helpers callable from templates as {{ name path }}.
// Each receives the resolved value of the path (see renderTokens' helper
// branch). Only helpers actually referenced by templates live here.
const helpers = {
  fmtDate(s) {
    // "2026-09-18" → "18 Sep 2026"
    const dt = parseISO(s);
    if (!dt) return s;
    return `${dt.d} ${MONTHS[dt.m - 1]} ${dt.y}`;
  },
  fmtDateLong(s) {
    // "2026-09-18" → "September 18, 2026"
    const dt = parseISO(s);
    if (!dt) return s;
    return `${MONTHS_L[dt.m - 1]} ${dt.d}, ${dt.y}`;
  },
  fmtYear(s) {
    // "2026-01-01" → "2026" (footer © year)
    const dt = parseISO(s);
    if (!dt) return s;
    return String(dt.y);
  },
  upper(v) {
    return String(v == null ? '' : v).toUpperCase();
  },
  readingTime(words) {
    // word count → "N min read" (~200 wpm)
    const n = Number(words) || 0;
    return `${Math.max(1, Math.round(n / 200))} min read`;
  },
  len(v) {
    return Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : 0;
  },
};

// Truthiness for conditions. Empty string/array/object, null, undefined,
// false and NaN are falsy; everything else truthy. Mirrors Hugo semantics
// closely enough for this site's templates.
function truthy(v) {
  if (v === null || v === undefined || v === false || v === '') return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

// Resolve a dotted path against the current scope.
//   "."      → the scope itself (current each-item)
//   ".a.b"   → scope.a.b
//   "$.a.b"  → ROOT.a.b (escape back to page root inside an each loop)
// Returns '' for missing values so raw output never prints "undefined".
function resolve(expr, scope, root) {
  let p = expr.trim();
  if (!p) return '';
  if (p === '.') return scope;
  if (p.startsWith('$.')) {
    scope = root;
    p = p.slice(2); // drop '$.' → "activeBatchId"
  } else if (p.startsWith('.')) p = p.slice(1);
  else if (p.startsWith('$')) {
    scope = root;
    p = p.slice(1);
  }
  let val = scope;
  const parts = p.split('.');
  for (const part of parts) {
    if (val === null || val === undefined) return '';
    val = val[part];
  }
  return val === undefined || val === null ? '' : val;
}

// Split an argument list into tokens:  .a "b c"  -> ['.a', 'b c']
// CRITICAL: paren-aware. `(eq .role "X")` stays ONE argument because we
// track depth: whitespace inside (...) does not split, and quotes inside
// (...) are kept literally instead of toggling quote state. Getting this
// wrong is the historical bug that made every `or` condition true — see
// REGRESSION GUARDS in the header.
function splitArgs(s) {
  const out = [];
  let cur = '',
    inQ = false,
    started = false,
    depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (depth > 0) {
          cur += ch;
        } else {
          inQ = false;
        }
      } else cur += ch;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) {
        cur += ch;
        started = true;
      } else {
        inQ = true;
        started = true;
      }
      continue;
    }
    if (ch === '(') {
      depth++;
      cur += ch;
      started = true;
      continue;
    }
    if (ch === ')') {
      depth--;
      cur += ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (depth === 0) {
        if (started) {
          out.push(cur);
          cur = '';
          started = false;
        }
        continue;
      }
      cur += ch;
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

// Binary comparison operators usable in {{ if }} expressions.
// eq/ne use loose equality so `"5" eq 5` works with JSON data;
// lt/gt/le/ge coerce to Number.
function compare(op, a, b) {
  if (op === 'eq') return a == b;
  if (op === 'ne') return a != b;
  if (op === 'lt') return Number(a) < Number(b);
  if (op === 'gt') return Number(a) > Number(b);
  if (op === 'le') return Number(a) <= Number(b);
  if (op === 'ge') return Number(a) >= Number(b);
  return false;
}

function isVarPath(x) {
  return x.startsWith('.') || x.startsWith('$');
}
// An argument is either a variable path (resolve it) or a literal string.
function evalVal(x, scope, root) {
  return isVarPath(x) ? resolve(x, scope, root) : x;
}

// Evaluate one full condition expression, e.g:
//   eq .status "active"          not .featured
//   or (eq .role "VP") (eq .role "GS")
//   and .members (eq .group "primary")
function evalCond(expr, scope, root) {
  expr = expr.trim();
  if (expr.startsWith('not ')) return !evalCond(expr.slice(4).trim(), scope, root);
  if (expr.startsWith('or ')) {
    // every arg must be evaluated AS A CONDITION (condVal), not as a value
    return splitArgs(expr.slice(3).trim()).some((a) => condVal(a, scope, root));
  }
  if (expr.startsWith('and ')) {
    return splitArgs(expr.slice(4).trim()).every((a) => condVal(a, scope, root));
  }
  const cmp = expr.match(/^(eq|ne|lt|gt|le|ge)\s+(.+)$/);
  if (cmp) {
    const args = splitArgs(cmp[2]);
    return compare(cmp[1], evalVal(args[0], scope, root), evalVal(args[1], scope, root));
  }
  // bare path: truthy check on the resolved value
  return truthy(resolve(expr, scope, root));
}

// Evaluate ONE argument of or/and as a condition.
// Strips one layer of wrapping parens first, then: if it looks like a
// comparison/logical op route to evalCond, otherwise treat as a bare
// path and check truthiness. This routing is what keeps
// `or (eq .role "X") .flag` from mis-evaluating either side.
function condVal(a, scope, root) {
  let t = a.trim();
  if (t[0] === '(' && t[t.length - 1] === ')') t = t.slice(1, -1).trim();
  if (/^(eq|ne|lt|gt|le|ge|not|or|and)\b/.test(t)) return evalCond(t, scope, root);
  return truthy(evalVal(t, scope, root));
}

// Pass 1: turn template text into a flat token list.
// Text between {{ … }} markers becomes {t:'text'} tokens; the inner
// expression becomes a single {t:'x'} token. Block structure (each/if/
// else/end) is resolved later by findBlock, not here.
function tokenize(tpl) {
  const tokens = [];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0,
    m;
  while ((m = re.exec(tpl))) {
    if (m.index > last) tokens.push({ t: 'text', v: tpl.slice(last, m.index) });
    tokens.push({ t: 'x', v: m[1].trim() });
    last = re.lastIndex;
  }
  if (last < tpl.length) tokens.push({ t: 'text', v: tpl.slice(last) });
  return tokens;
}

// Pass 2 helper: given the token index just after an `each`/`if` opener,
// walk forward and return the body tokens up to the MATCHING `end`
// (nesting-aware), plus any `else` body at depth 0.
//   { body: tokens[], elseBody: tokens[], next: indexAfterEnd }
function findBlock(tokens, start) {
  let depth = 0,
    endIdx = -1;
  for (let i = start; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === 'x') {
      const e = t.v;
      if (e.startsWith('each ') || e.startsWith('if ')) depth++;
      else if (e === 'end') {
        if (depth === 0) {
          endIdx = i;
          break;
        }
        depth--;
      }
    }
  }
  if (endIdx === -1) return { body: [], elseBody: [], next: tokens.length };

  // second scan: locate an `else` that belongs to THIS block (depth 0)
  let elseIdx = -1,
    d2 = 0;
  for (let j = start; j < endIdx; j++) {
    const t = tokens[j];
    if (t.t === 'x') {
      const e = t.v;
      if (e.startsWith('each ') || e.startsWith('if ')) d2++;
      else if (e === 'end') d2--;
      else if (e.startsWith('else') && d2 === 0) {
        elseIdx = j;
        break;
      }
    }
  }
  const body = tokens.slice(start, elseIdx === -1 ? endIdx : elseIdx);
  const elseBody = elseIdx === -1 ? [] : tokens.slice(elseIdx + 1, endIdx);
  return { body, elseBody, next: endIdx + 1 };
}

// Pass 2: walk the token list and emit output. `scope` is the current
// each-item (or the page scope at top level); `root` always points at
// the page scope so `$.field` can escape a loop. Depth/guard counters
// throw on runaway recursion or infinite loops instead of hanging.
function renderTokens(tokens, scope, root, depth = 0) {
  let out = '';
  let i = 0;
  let guard = 0;
  if (depth > 60) throw new Error('template include depth exceeded');
  while (i < tokens.length) {
    if (++guard > 1000000) throw new Error('template iteration guard exceeded');
    const t = tokens[i];
    // plain text: pass through untouched
    if (t.t === 'text') {
      out += t.v;
      i++;
      continue;
    }
    const e = t.v;

    // {{ each .arr }}BODY{{ end }} — render BODY once per item with the
    // item as the new scope ("." inside the loop is the item).
    if (e.startsWith('each ')) {
      const arr = resolve(e.slice(5).trim(), scope, root);
      const block = findBlock(tokens, i + 1);
      if (Array.isArray(arr)) {
        for (const item of arr) out += renderTokens(block.body, item, root, depth + 1);
      }
      i = block.next;
      continue;
    }

    // {{ if COND }}A{{ else }}B{{ end }} — pick branch by condition
    if (e.startsWith('if ')) {
      const cond = evalCond(e.slice(3).trim(), scope, root);
      const block = findBlock(tokens, i + 1);
      out += renderTokens(cond ? block.body : block.elseBody, scope, root, depth + 1);
      i = block.next;
      continue;
    }

    // {{ include "partials/x.html" }} — splice another template in,
    // rendered with the CURRENT scope (partials see .page/.site/.nav…)
    if (e.startsWith('include ')) {
      let p = e
        .slice(8)
        .trim()
        .replace(/^"(.*)"$/, '$1');
      const inc = path.join(SRC, p);
      out += renderTokens(tokenize(read(inc)), scope, root, depth + 1);
      i++;
      continue;
    }

    // {{ helper path }} — one-arg output helpers (fmtDate, upper, …)
    const hm = e.match(/^([A-Za-z]+)\s+(.+)$/);
    if (hm && helpers[hm[1]]) {
      const arg = hm[2].trim();
      const val = resolve(arg, scope, root);
      out += String(
        helpers[hm[1]](val, scope, root) == null ? '' : helpers[hm[1]](val, scope, root),
      );
      i++;
      continue;
    }

    // fallback: {{ .some.path }} — raw variable output ('' when missing)
    out += String(resolve(e, scope, root) == null ? '' : resolve(e, scope, root));
    i++;
  }
  return out;
}

// Convenience wrapper used by buildPage/makeItem below.
function renderTemplate(tpl, scope, root) {
  return renderTokens(tokenize(tpl), scope, root);
}

/* ------------------------------------------------------------------ */
/* data loading + enrichment                                           */
/* ------------------------------------------------------------------ */
// Every content collection lives in src/data/*.json. Below, each is
// mapped once to add DERIVED fields the templates rely on:
//   code      — display index like "PROJ.01" / "EVENT.03"
//   url       — canonical directory-style link ("/projects/<slug>/")
//   thumb/src — generated SVG artwork path (see SVG section)
// plus per-type extras (status booleans, formatted dates, reading time).

// LOCAL SEEDS — every collection starts from its repo JSON file. All
// content comes straight from these files (src/data/*.json,
// content/blog/*.md, content/events/*.md, content/gallery/, …): drop a
// file in and it appears on the next build.
const siteSeed = readJSON(path.join(SRC, 'data', 'site.json')); // global identity: name, socials, facts…
const navSeed = readJSON(path.join(SRC, 'data', 'nav.json')); // nav items + active-match rules
const projectsSeed = readJSON(path.join(SRC, 'data', 'projects.json'));
const achievementsSeed = readJSON(path.join(SRC, 'data', 'achievements.json'));
const resourcesSeed = readJSON(path.join(SRC, 'data', 'resources.json'));
const teamSeed = readJSON(path.join(SRC, 'data', 'team.json'));
// CENTRAL SITE CONFIG — src/config/site.json controls which content is
// featured/curated and in what ORDER, by referencing each item's slug
// (or title for resources). Content files stay the single source of
// truth for the content itself; this config only holds relationships.
// A reference to a nonexistent item is a hard build error (see the
// resolveRefs helper in the "selecting featured content" section).
const config = readJSON(path.join(SRC, 'config', 'site.json'));

// EVENTS PAGE CONFIG — src/config/events.json controls where each event
// appears on the events page: `featured` → the collapsing deck, `normal`
// → the rows underneath. Same philosophy as the site config above:
// references are by slug, content stays in content/events/*.md, and a
// missing/duplicate reference is a hard build error (see
// resolveEventsPage in the "selecting featured content" section).
const eventsConfigPath = path.join(SRC, 'config', 'events.json');
const eventsConfig = fs.existsSync(eventsConfigPath) ? readJSON(eventsConfigPath) : null;

// enriched (derived) values — reassigned by deriveCollections()
let site = siteSeed;
let navDef = navSeed;
let projects = projectsSeed;
let achievements = achievementsSeed;
let resources = resourcesSeed;
let team = teamSeed; // { current, batches } — see deriveCollections
let teamRaw = teamSeed;
let teamBatches = {};
let currentBatchId = teamSeed.current;
let teamBatchesList = [];
let activeProjectsCount = 0;
let gallery = [];

// enrichment — derives display fields every template consumes
function enrichProjects(list) {
  return list.map((p, i) => ({
    ...p,
    code: `PROJ.${String(i + 1).padStart(2, '0')}`,
    url: `/projects/${p.slug}/`,
    stackList: p.stack ? p.stack.join(' · ') : '',
    teamList: p.team ? p.team.map((m) => m.name).join(', ') : '',
    thumb: p.thumb || `/img/gen/${p.slug}.svg`, // falls back to generated art
    approach: (p.approach || []).map((a, j) => ({ ...a, n: String(j + 1).padStart(2, '0') })),
  }));
}

function enrichAchievements(list) {
  return list.map((a, i) => ({
    ...a,
    code: `MIL.${String(i + 1).padStart(2, '0')}`,
  }));
}

function enrichResources(list) {
  return list.map((r, i) => ({
    ...r,
    code: `RES.${String(i + 1).padStart(2, '0')}`,
  }));
}

// Resource filter chips (resources page "Browse" section). Order here
// is the order the buttons render in.
// deriveCollections() — run enrichment + team derivation from the local
// seed files. Called once at module load.
const TEAM_PHOTO_DIR = path.join(ROOT, 'content', 'team');
const TEAM_PHOTO_RE = /\.(jpe?g|png|webp)$/i;
function scanTeamPhotos(batchId) {
  const dir = path.join(TEAM_PHOTO_DIR, batchId);
  const map = {};
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (TEAM_PHOTO_RE.test(f)) {
        const seed = f.replace(TEAM_PHOTO_RE, '');
        map[seed] = f;
      }
    }
  }
  return map;
}

function deriveCollections() {
  site = siteSeed;
  navDef = navSeed;
  projects = enrichProjects(projectsSeed);
  achievements = enrichAchievements(achievementsSeed);
  resources = enrichResources(resourcesSeed);

  // team is array-free: it's { current, batches }
  const raw = teamSeed;
  teamRaw = raw;
  teamBatches = {};
  for (const [batchId, batch] of Object.entries(raw.batches || {})) {
    const photos = scanTeamPhotos(batchId);
    teamBatches[batchId] = batch.groups.map((g, i) => ({
      ...g,
      code: `TEAM.${String(i + 1).padStart(2, '0')}`,
      many: (g.members || []).length > 4,
      members: (g.members || []).map((m) => {
        const photo = photos[m.seed];
        return photo ? { ...m, photo } : m;
      }),
    }));
  }
  currentBatchId = raw.current;
  team = teamBatches[currentBatchId] || []; // backward compat: about page uses {{ .team }}
  teamBatchesList = Object.entries(raw.batches || {}).map(([id, b]) => ({
    id,
    label: b.label,
  }));
  activeProjectsCount = projects.filter((p) => p.status === 'active').length;
}

deriveCollections(); // local seeds → enriched defaults

/* ------------------------------------------------------------------ */
/* content source — pure file-system reads                             */
/* ------------------------------------------------------------------ */
// All content — blog posts, events, funkystuff and the centralized
// site config — is loaded from local files through scripts/lib/
// content-source.js. Drop a .md file in content/blog/ or content/events/
// and it appears on the next build; drop an image in content/gallery/ and
// it becomes a gallery item.
//
// The loader returns collections ALREADY enriched with exactly the
// fields the rest of this file has always consumed (slug, url, code,
// cover, readingTime, status booleans, contentHtml …) and Markdown is
// rendered + SANITIZED there. Loading is synchronous — no network, no
// waits.

const { posts, events, funky, siteConfig } = contentSource.loadContent();

// the centralized config object is the file itself; keep the reference
Object.assign(config, siteConfig);

/* GALLERY — photo strip. Single source: <root>/content/gallery/ — drop
   any image (jpg/jpeg/png/webp/gif/svg) in and it becomes an item,
   captions optionally overridden by content/gallery/captions.json.
   Layout metadata is index-based (cycling GALLERY_LAYOUT/GALLERY_SPEEDS)
   so the scattered, mixed-size strip holds no matter the file count. */
const GALLERY_DIR = path.join(ROOT, 'content', 'gallery');
const GALLERY_IMAGE_RE = /\.(jpe?g|png|webp|gif|svg)$/i;

// deterministic size/speed layout: indexes cycle big/normal/small × orientation
const GALLERY_LAYOUT = [
  ['big', false],
  ['normal', true],
  ['normal', false],
  ['small', true],
  ['small', false],
  ['big', true],
  ['normal', false],
  ['big', false],
  ['small', true],
  ['small', false],
  ['normal', true],
  ['big', true],
  ['normal', false],
  ['normal', true],
  ['small', false],
  ['big', false],
  ['small', true],
  ['normal', false],
];
const GALLERY_SPEEDS = [1, 2, 3, 4];

function humanizeCaption(name) {
  return name
    .replace(/\.(jpe?g|png|webp|gif|svg)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// galleryItemsFromRows(rows) — deterministic size/speed layout by index.
// `rows` = [{ file, caption }] in display order, from the folder scan.
function galleryItemsFromRows(rows) {
  if (!rows.length) return [];
  return rows.map((r, i) => {
    const f = r.file;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(f)) {
      throw new Error(`gallery filename "${f}" is not URL-safe (keep letters/digits/-/_)`);
    }
    const [size, horiz] = GALLERY_LAYOUT[i % GALLERY_LAYOUT.length];
    return {
      file: f,
      src: `/gallery/${f}`,
      // srcset with a 2x retina variant reusing the same file on modern
      // browsers isn't worth it here — keep serving the original at 1x.
      caption: r.caption || humanizeCaption(f),
      code: `GAL.${String(i + 1).padStart(2, '0')}`,
      size, // 'big' | 'normal' | 'small'
      horizontal: horiz, // true = wider-than-tall tile
      speed: GALLERY_SPEEDS[i % GALLERY_SPEEDS.length], // parallax 1–3
    };
  });
}

// Local source: scan content/gallery/ (+ optional captions.json sidecar)
function loadLocalGallery() {
  if (!fs.existsSync(GALLERY_DIR)) {
    throw new Error(
      `content/gallery/ does not exist. Create it and drop image files in — they become gallery items.`,
    );
  }
  const files = fs.readdirSync(GALLERY_DIR).filter((f) => GALLERY_IMAGE_RE.test(f));

  // optional captions sidecar
  let captions = {};
  const capPath = path.join(GALLERY_DIR, 'captions.json');
  if (fs.existsSync(capPath)) {
    captions = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    for (const k of Object.keys(captions)) {
      if (!files.includes(k)) console.warn(`captions.json references "${k}" but that file is not in content/gallery/`);
    }
  }

  if (!files.length) {
    console.warn(`content/gallery/ is empty — the gallery page will show no images. Drop image files in.`);
    return [];
  }

  files.sort((a, b) => a.localeCompare(b));
  return galleryItemsFromRows(files.map((f) => ({ file: f, caption: captions[f] })));
}

// deriveGallery() — build the gallery from the local content/gallery/ folder.
function deriveGallery() {
  gallery = loadLocalGallery();
}

/* ------------------------------------------------------------------ */
/* central content selection (config-driven)                           */
/* ------------------------------------------------------------------ */
// resolveRefs(list, coll, label) turns an array of reference keys from
// src/config/site.json into the underlying content items, preserving
// the CONFIG order (which is why it also drives ordering). Every key is
// validated against the collection — a reference that doesn't match any
// existing slug/title throws a clear build error listing what's valid,
// so a typo or a deleted file can never silently drop content.
function resolveRefs(list, coll, label, key) {
  if (list === undefined) {
    throw new Error(
      `config: missing "${label}" list in src/config/site.json — add it to control ${label}`,
    );
  }
  if (!Array.isArray(list)) {
    throw new Error(`config: "${label}" must be an array of ${key} values`);
  }
  const index = new Map(coll.map((it) => [it[key], it]));
  return list.map((ref) => {
    const found = index.get(ref);
    if (!found) {
      const keys = [...index.keys()].sort().join(', ') || 'none';
      throw new Error(
        `config: "${label}" references "${ref}" but no such ${key} exists (available: ${keys})`,
      );
    }
    return found;
  });
}

// resolveEventsPage(eventsConfig, allEvents) → { featured, normal }
// Builds the events-page placement from src/config/events.json. Both
// lists are slug arrays resolved against the loaded events, preserving
// CONFIG order (which drives display order). Validation is strict so a
// typo or a deleted .md can never silently drop an event from the page:
//   - a slug with no matching event   → hard error (available slugs listed)
//   - a slug repeated in one list     → hard error
//   - a slug in BOTH lists            → hard error (an event renders twice)
// Unassigned events (present in content/events/, in neither list) only
// WARN — they still build their own detail page at /events/<slug>/, so a
// warning matches the funkystuff unlisted-files convention. The first
// featured event is flagged `first` so the deck ships with the initially
// expanded card pre-rendered (data-active), mirroring how featured.projects
// primes the projects deck.
function resolveEventsPage(eventsConfig, allEvents) {
  if (!eventsConfig) {
    throw new Error(
      'config: src/config/events.json does not exist — create it with "featured" and "normal" slug lists to control the events page',
    );
  }
  for (const section of ['featured', 'normal']) {
    if (eventsConfig[section] === undefined) {
      throw new Error(
        `config: src/config/events.json is missing the "${section}" list — add it to control the events page`,
      );
    }
    if (!Array.isArray(eventsConfig[section])) {
      throw new Error(
        `config: src/config/events.json "${section}" must be an array of event slugs`,
      );
    }
  }

  const index = new Map(allEvents.map((ev) => [ev.slug, ev]));

  const resolveSection = (section) => {
    const seen = new Set();
    return eventsConfig[section].map((ref) => {
      if (typeof ref !== 'string' || !ref) {
        throw new Error(
          `config: src/config/events.json "${section}" entries must be event slug strings (got ${JSON.stringify(ref)})`,
        );
      }
      if (seen.has(ref)) {
        throw new Error(
          `config: src/config/events.json "${section}" lists "${ref}" more than once — each event may appear only once`,
        );
      }
      seen.add(ref);
      const found = index.get(ref);
      if (!found) {
        const keys = [...index.keys()].sort();
        throw new Error(
          `config: src/config/events.json "${section}" references unknown event ` +
            `"${ref}"\n\nAvailable events:\n- ${keys.join('\n- ') || 'none'}`,
        );
      }
      return found;
    });
  };

  const featured = resolveSection('featured');
  const normal = resolveSection('normal');

  // no event may sit in two sections — that would render it twice
  const inFeatured = new Set(featured.map((ev) => ev.slug));
  for (const ev of normal) {
    if (inFeatured.has(ev.slug)) {
      throw new Error(
        `config: src/config/events.json lists "${ev.slug}" in both "featured" and "normal" — ` +
          `each event may appear in only one section`,
      );
    }
  }

  // every event on disk should be assigned to exactly one section
  const assigned = new Set([...featured, ...normal].map((ev) => ev.slug));
  for (const ev of allEvents) {
    if (!assigned.has(ev.slug)) {
      console.warn(
        `events: "${ev.slug}" is not listed in "featured" or "normal" in src/config/events.json — ` +
          `it won't appear on the events index (its detail page still builds). ` +
          `Add the slug to one of the lists to show it.`,
      );
    }
  }

  // a past event in the "Upcoming" deck would contradict the section name
  for (const ev of featured) {
    if (ev.past) {
      console.warn(
        `events: "${ev.slug}" is featured but its status is "past" — it will sit in the ` +
          `Upcoming deck. Consider moving it to "normal" or updating its status.`,
      );
    }
  }

  // first featured event ships as the deck's initially expanded card
  if (featured[0]) featured[0].first = true;

  return { featured, normal };
}

// Select everything the templates consume, straight from config:
//   featured.projects → home "Featured projects" + projects-page deck
//   featured.posts    → home "Tech Journal" + blog "Featured"
//   featured.resources→ home "Curated resources" (home-only, no page copy)
//   home.events       → home "Upcoming events" (curated; home-only)
//   eventsPage        → events INDEX placement: featured → .evx deck,
//                       normal → .ev-row list (see src/config/events.json)
// The `featured` boolean previously scattered across content files is
// gone — this config is now the single source of truth for featured and
// ordering. Per-event status booleans (upcoming/ongoing/past) remain
// status-derived and answer WHAT an event is; placement answers WHERE.
let featuredProjects;
let featuredPosts;
let featuredResources;
let homeEvents;
let eventsPage;

function deriveSelections() {
  featuredProjects = resolveRefs(config.featured.projects, projects, 'featured.projects', 'slug');
  if (featuredProjects[0]) featuredProjects[0].first = true; // ships data-active pre-rendered
  if (featuredProjects.length > 3) {
    // home cards + deck are tuned for exactly three; fail loudly rather
    // than silently overflowing the layout
    throw new Error(
      `config: "featured.projects" lists ${featuredProjects.length} projects — the home grid + ` +
        `projects deck are tuned for at most 3. Trim the list in src/config/site.json.`,
    );
  }
  featuredPosts = resolveRefs(config.featured.posts, posts, 'featured.posts', 'slug');
  featuredResources = resolveRefs(config.featured.resources, resources, 'featured.resources', 'slug');
  homeEvents = resolveRefs(config.home.events, events, 'home.events', 'slug');

  // events page placement — src/config/events.json decides where every
  // event appears (featured → deck, normal → rows), in config order.
  eventsPage = resolveEventsPage(eventsConfig, events);
}


/* FUNKYSTUFF — self-contained web toys/games library -----------------
   Single source: <root>/funkystuff/*.html plus the listing manifest
   src/data/funkystuff.json. Each manifest entry names a file; the build
   copies those files verbatim into public/funkystuff/. Drop a new toy
   in funkystuff/ AND list it in the manifest to grow the shelf.

   Templates see: n / url / title / dept / by
   (n = padded row index, assigned in content-source normalization). */
const FUNKY_DIR = path.join(ROOT, 'funkystuff');
let funkyDepts = [];

/* ------------------------------------------------------------------ */
/* SVG asset generation                                                */
/* ------------------------------------------------------------------ */
// The site ships zero binary images. All "photos", covers and avatars
// are deterministic technical-looking SVG plates generated here from a
// seed string. Same seed → same image on every build/machine.

// XML-escape text going into SVG <text> nodes.
function esc(x) {
  return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

// Shared palette for every generated plate (matches the dark theme).
const PLATE_COLORS = {
  bg: '#0d1117',
  line: '#d7dce3',
  faint: '#2c3540',
  faint2: '#3a4655',
  accent: '#4fd1a5',
  accent2: '#e0b26a',
  blue: '#7ba4d9',
};

// genPlate(seed, variant) → 1200×800 SVG "photo" for gallery/projects/posts.
// Variant picks the drawing style; the seed drives all randomness so the
// output is stable. Variants are assigned per-seed in main() below.
function genPlate(seed, variant) {
  const rnd = mulberry32(hashStr(seed));
  const W = 1200,
    H = 800;
  const C = PLATE_COLORS;
  const el = [];
  const rect = (x, y, w, h, fill, stroke, sw) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
  const line = (x1, y1, x2, y2, stroke, sw) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw || 1}"/>`;
  const circle = (cx, cy, r, fill, stroke, sw) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${sw || 1}"/>`;
  const text = (x, y, s, size, fill, anchor, ff) =>
    `<text x="${x}" y="${y}" font-family="${ff || 'monospace'}" font-size="${size}" fill="${fill}" text-anchor="${anchor || 'start'}" letter-spacing="1">${esc(s)}</text>`;

  const baseGrid = () => {
    let g = '';
    for (let x = 0; x <= W; x += 80) g += line(x, 0, x, H, C.faint, 0.5);
    for (let y = 0; y <= H; y += 80) g += line(0, y, W, y, C.faint, 0.5);
    return g;
  };

  if (variant === 'grid') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const y = 200 + rnd() * 300;
    el.push(line(80, y, W - 80, y, C.line, 2));
    el.push(circle(80, y, 6, C.accent, 'none'));
    el.push(circle(W - 200, y, 6, C.line, 'none'));
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const x = 80 + (i / steps) * (W - 280);
      const hh = 40 + rnd() * 160 * (i % 2 ? 1 : 0.4);
      el.push(line(x, y, x, y - hh, C.faint2, 1));
      el.push(line(x, y - hh, x + 30, y - hh, C.faint2, 1));
      el.push(text(x + 36, y - hh + 4, `t+${i}`, 14, C.faint2));
    }
    el.push(text(80, 60, 'FIELD PLOT // 001', 15, C.faint2));
    el.push(
      text(
        W - 80,
        H - 40,
        `x=${String(rnd()).slice(2, 5)} y=${String(rnd()).slice(2, 5)}`,
        14,
        C.faint2,
        'end',
      ),
    );
  } else if (variant === 'rings') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const cx = W / 2 + (rnd() - 0.5) * 200,
      cy = H / 2 + (rnd() - 0.5) * 100;
    const rings = [60, 120, 200, 300];
    rings.forEach((r, i) => {
      el.push(circle(cx, cy, r, 'none', i === 0 ? C.accent : C.faint2, i === 0 ? 2 : 1));
      el.push(circle(cx, cy, r, 'none', 'none', 1));
    });
    el.push(line(cx - 340, cy, cx + 340, cy, C.faint, 0.5));
    el.push(line(cx, cy - 340, cx, cy + 340, C.faint, 0.5));
    el.push(circle(cx, cy, 5, C.accent, 'none'));
    const ang = rnd() * Math.PI * 2;
    const px = cx + Math.cos(ang) * 300,
      py = cy + Math.sin(ang) * 300;
    el.push(line(cx, cy, px, py, C.accent, 1.5));
    el.push(circle(px, py, 5, C.line, 'none'));
    el.push(text(cx + 320, cy - 12, 'φ 0.62 rad', 14, C.faint2, 'end'));
    el.push(text(80, 60, 'VECTOR FIELD // 002', 15, C.faint2));
  } else if (variant === 'bars') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const n = 24;
    const bw = (W - 160) / n;
    const baseline = H - 140;
    let bars = '';
    for (let i = 0; i < n; i++) {
      const hh = 30 + rnd() * (H - 260);
      const c = i % 5 === 0 ? C.accent : i % 7 === 0 ? C.accent2 : C.faint2;
      bars += rect(
        80 + i * bw + 3,
        baseline - hh,
        bw - 6,
        hh,
        c === C.faint2 ? '#141a22' : 'none',
        c,
        1.5,
      );
    }
    el.push(bars);
    el.push(line(80, baseline, W - 80, baseline, C.line, 1.5));
    el.push(text(80, 60, 'SPECTRUM // 003', 15, C.faint2));
    el.push(text(W - 80, H - 40, 'sample/48kHz', 14, C.faint2, 'end'));
  } else if (variant === 'lines') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const ys = [];
    for (let i = 0; i < 8; i++) ys.push(120 + i * 80 + rnd() * 20);
    ys.forEach((y, i) => {
      el.push(line(80, y, W - 80, y, i === 3 ? C.accent : C.faint2, i === 3 ? 2 : 1));
      el.push(text(84, y - 6, `${String(i + 1).padStart(2, '0')}.0`, 13, C.faint2));
      el.push(circle(W - 80, y, 4, i === 3 ? C.accent : C.line, 'none'));
    });
    el.push(text(80, 60, 'TRACE MATRIX // 004', 15, C.faint2));
    el.push(text(W - 80, H - 40, 'ls -l /dev/tty*', 14, C.faint2, 'end'));
  } else if (variant === 'dots') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const nodes = [];
    for (let i = 0; i < 9; i++) {
      nodes.push({ x: 120 + rnd() * (W - 240), y: 120 + rnd() * (H - 240), r: 5 + rnd() * 6 });
    }
    const edges = [
      [0, 1],
      [1, 2],
      [1, 4],
      [2, 5],
      [3, 4],
      [4, 5],
      [5, 8],
      [6, 7],
      [7, 4],
    ];
    edges.forEach(([a, b]) => {
      el.push(line(nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, C.faint2, 1));
    });
    nodes.forEach((n, i) => {
      el.push(
        circle(n.x, n.y, n.r, i === 4 ? C.accent : '#141a22', i === 4 ? C.accent : C.faint2, 1.5),
      );
    });
    el.push(text(nodes[4].x + 14, nodes[4].y - 10, 'core', 14, C.accent));
    el.push(text(80, 60, 'NODE GRAPH // 005', 15, C.faint2));
  } else if (variant === 'circuit') {
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const seg = (x1, y1, x2, y2) => {
      const mx = x1 + (x2 - x1) / 2;
      return (
        line(x1, y1, mx, y1, C.faint2, 1.5) +
        line(mx, y1, mx, y2, C.faint2, 1.5) +
        line(mx, y2, x2, y2, C.faint2, 1.5)
      );
    };
    el.push(seg(120, 600, 360, 200));
    el.push(seg(360, 200, 640, 520));
    el.push(seg(640, 520, 900, 220));
    el.push(seg(900, 220, 1080, 560));
    el.push(circle(120, 600, 7, C.accent, 'none'));
    el.push(circle(360, 200, 7, C.line, 'none'));
    el.push(circle(640, 520, 7, C.accent2, 'none'));
    el.push(circle(900, 220, 7, C.line, 'none'));
    el.push(circle(1080, 560, 7, C.accent, 'none'));
    const traces = '';
    el.push(traces);
    el.push(text(80, 60, 'PCB TRACE // 006', 15, C.faint2));
    el.push(text(1120, 600, 'GND', 13, C.faint2, 'end'));
  } else {
    // plot (default variant — growth curve with area fill)
    el.push(rect(0, 0, W, H, C.bg));
    el.push(baseGrid());
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const x = 120 + (i / 20) * (W - 200);
      const y = H - 120 - (50 + rnd() * (H - 300)) * (i / 20 + 0.3);
      pts.push([x, y]);
    }
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      const my = (pts[i - 1][1] + pts[i][1]) / 2;
      d += ` C ${mx} ${pts[i - 1][1]}, ${mx} ${pts[i][1]}, ${pts[i][0]} ${pts[i][1]}`;
    }
    el.push(`<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="2"/>`);
    const area = `${d} L ${pts[pts.length - 1][0]} ${H - 120} L ${pts[0][0]} ${H - 120} Z`;
    el.push(`<path d="${area}" fill="${C.accent}" opacity="0.08"/>`);
    pts.forEach((p, i) => {
      if (i % 3 === 0) el.push(circle(p[0], p[1], 3, '#141a22', C.line, 1));
    });
    el.push(line(120, H - 120, W - 80, H - 120, C.line, 1.5));
    el.push(line(120, 60, 120, H - 120, C.line, 1.5));
    el.push(text(80, 60, 'GROWTH CURVE // 007', 15, C.faint2));
    el.push(text(W - 80, H - 90, 't →', 14, C.faint2, 'end'));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(seed)}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  ${el.join('\n')}
  </svg>`;
}

// genAvatar(seed, name) → 480×480 initials avatar for team members.
// Tinted background + big initials + "ID:" strip. Used by team.html and
// the about-page carousel via /img/gen/av-<seed>.svg.
function genAvatar(seed, name) {
  const rnd = mulberry32(hashStr(seed));
  const tints = ['#17332b', '#2b2a1c', '#1f2a3a'];
  const bg = tints[Math.floor(rnd() * tints.length)];
  const initials = String(name || 'DC')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const W = 480,
    H = 480;
  const C = PLATE_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <g opacity="0.35">
    <path d="M0 ${H / 2} H${W}" stroke="${C.line}" stroke-width="1"/>
    <path d="M${W / 2} 0 V${H}" stroke="${C.line}" stroke-width="1"/>
    <circle cx="${W / 2}" cy="${H / 2}" r="150" fill="none" stroke="${C.accent}" stroke-width="1" opacity="0.5"/>
  </g>
  <text x="${W / 2}" y="${H / 2 + 8}" text-anchor="middle" font-family="sans-serif" font-size="150" font-weight="600" fill="${C.line}" letter-spacing="4">${esc(initials)}</text>
  <text x="26" y="${H - 22}" font-family="monospace" font-size="15" fill="${C.faint2}">ID: ${esc(seed.slice(0, 6))}</text>
  </svg>`;
}

// genLogo() → 96×96 node-graph monogram. Rendered twice: as the nav
// brand mark (/img/logo.svg, uses currentColor so it themes) and as
// /img/favicon.svg.
function genLogo() {
  const C = PLATE_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <rect x="4" y="4" width="88" height="88" rx="18" fill="none" stroke="currentColor" stroke-width="3"/>
  <path d="M 14 66 L 34 30" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M 34 30 L 62 58" stroke="currentColor" stroke-width="3" fill="none"/>
  <path d="M 62 58 L 82 22" stroke="currentColor" stroke-width="3" fill="none"/>
  <circle cx="34" cy="30" r="7" fill="currentColor"/>
  <circle cx="14" cy="66" r="5" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="62" cy="58" r="7" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="82" cy="22" r="6" fill="${C.accent}"/>
  <text x="48" y="88" text-anchor="middle" font-family="monospace" font-size="9" fill="currentColor" opacity="0.55" letter-spacing="1">CURATE · BUILD · UNDERSTAND</text>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* CSS / JS concat                                                     */
/* ------------------------------------------------------------------ */
// Bundling is plain concatenation — ORDER IS SIGNIFICANCE:
//   CSS: tokens → reset → type → layout → nav → horizontal →
//        components → pages → animation (later files may override
//        earlier ones; 08-pages.css tunes what earlier files set).
//   JS:  theme → horizontal → reveal → transitions → pages →
//        fluid-triangle → main.
//        Each file registers itself on window.DCITC.*; main.js (last)
//        calls every .init() in that same order.
const CSS_FILES = [
  '01-vars.css',
  '02-reset.css',
  '03-type.css',
  '04-layout.css',
  '05-nav.css',
  '06-horizontal.css',
  '07-components.css',
  '08-pages.css',
  '09-anim.css',
];

const JS_FILES = [
  'theme.js',
  'horizontal.js',
  'transitions.js',
  'reveal.js',
  'pages.js',
  'navigate.js',
  'music-player.js',
  'fluid-triangle.js',
  'gallery.js',
  'main.js',
];

function concat(dir, files) {
  return files.map((f) => read(path.join(dir, f))).join('\n');
}

/* ------------------------------------------------------------------ */
/* page assembly                                                       */
/* ------------------------------------------------------------------ */

const NAV = navDef.items;

// navFor(page) → nav items with `isActive` computed for THIS page.
// Match rules come from nav.json: "/" exact, "/foo*" prefix, otherwise
// exact-or-subpage ("/events" matches "/events/<slug>/"). The header
// partial uses .isActive to set the accent + aria-current.
function navFor(page) {
  return NAV.map((item) => {
    let active = false;
    if (item.match === '/') active = page.url === '/';
    else if (item.match.endsWith('*')) active = page.url.startsWith(item.match.slice(0, -1));
    else active = page.url === item.match || page.url.startsWith(item.match + '/');
    return { ...item, isActive: active };
  });
}

// Render one top-level page template and write it to public/.
// The scope exposed to templates: site, page, nav, all collections,
// featured subsets, counts. `root` == scope so $.field works anywhere.
function buildPage(page) {
  const scope = {
    site,
    page,
    nav: navFor(page),
    projects,
    events,
    eventsPage,
    homeEvents,
    featuredProjects,
    featuredPosts,
    featuredResources,
    achievements,
    resources,
    posts,
    team,
    teamBatches,
    currentBatchId,
    batchesList: teamBatchesList,
    activeBatchId: currentBatchId,
    gallery,
    funky,
    funkyDepts,
    activeProjectsCount,
  };
  const tpl = read(path.join(SRC, 'pages', page.template || page.file));
  const html = renderTemplate(tpl, scope, scope);
  writeHtml(path.join(OUT, page.out), html);
  console.log(`  ✓ ${page.out}`);
}

/* ------------------------------------------------------------------ */
/* main — build entry point                                            */
/* ------------------------------------------------------------------ */
// Pipeline order: wipe public/ → generate SVG assets → write CSS/JS
// bundles → render top-level pages → render per-item pages → extras.

// The pipeline entry: derive the funky department chips + padded row
// indexes from the file-loaded rows, derive the config selections, then
// run the synchronous template pipeline.
function boot() {
  deriveGallery();
  funkyDepts = [...new Set(funky.map((f) => f.dept))];
  // padded row index for the divided list (templates print {{ .n }})
  funky.forEach((f, i) => {
    f.n = String(i + 1).padStart(2, '0');
  });
  deriveSelections();
  build();
}

function build() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });

  console.log('DCITC site builder');

  // 1. generated SVG assets -----------------------------------------
  // One plate per unique seed (gallery seeds + project/post slugs);
  // variant chosen by hash so the mix of styles is stable per seed.
  console.log('assets');
  const genDir = path.join(OUT, 'img', 'gen');
  fs.mkdirSync(genDir, { recursive: true });
  const variants = ['grid', 'rings', 'bars', 'lines', 'dots', 'circuit', 'plot'];
  const seeds = new Set();
  projects.forEach((p) => seeds.add(p.slug));
  posts.forEach((p) => seeds.add(p.slug));
  seeds.forEach((s, i) => {
    const v = variants[hashStr(s) % variants.length];
    write(path.join(genDir, `${s}.svg`), genPlate(s, v));
  });
  write(path.join(OUT, 'img', 'logo.svg'), genLogo());
  write(path.join(OUT, 'img', 'favicon.svg'), genLogo().replace('<svg ', '<svg role="img" '));
  team.forEach((g) =>
    g.members.forEach((m) => {
      write(path.join(genDir, `av-${m.seed}.svg`), genAvatar(m.seed, m.name));
    }),
  );
  // also generate avatars for non-current batches
  for (const groups of Object.values(teamBatches)) {
    groups.forEach((g) =>
      g.members.forEach((m) => {
        write(path.join(genDir, `av-${m.seed}.svg`), genAvatar(m.seed, m.name));
      }),
    );
  }

  // 2. CSS / JS bundles (see CSS_FILES/JS_FILES for order rules) ----
  // Both are run through the zero-dependency minifiers (scripts/lib/
  // minify.js) — comments + indentation stripped, whitespace collapsed.
  // The minifiers are deliberately conservative: they never rename
  // tokens or drop separating whitespace, so the bundles behave byte-
  // for-byte like the unminified concat (verified by /tmp/opencode/
  // regress-events.js after every rebuild).
  console.log('bundles');
  const cssBundle = concat(path.join(STATIC, 'css'), CSS_FILES);
  const jsBundle = concat(path.join(STATIC, 'js'), JS_FILES);
  write(path.join(OUT, 'css', 'main.css'), process.env.DCITC_NO_MINIFY ? cssBundle : minifyCss(cssBundle));
  write(path.join(OUT, 'js', 'app.js'), process.env.DCITC_NO_MINIFY ? jsBundle : minifyJs(jsBundle));
  // vendored lib (anime.min.js, used by reveal.js) is copied verbatim —
  // never concatenated, it loads as-is before the bundle.
  fs.cpSync(path.join(STATIC, 'js', 'vendor'), path.join(OUT, 'js', 'vendor'), { recursive: true });

  // 2b. funkystuff library files -------------------------------------
  // copied verbatim so /funkystuff/<file> URLs work; the launcher page
  // (/funkystuff/) opens each one in a new tab.
  console.log('funkystuff');
  fs.mkdirSync(path.join(OUT, 'funkystuff'), { recursive: true });
  // copy manifest-listed files verbatim
  for (const it of funky) {
    write(path.join(OUT, 'funkystuff', it.file), read(path.join(FUNKY_DIR, it._localFile || it.file)));
  }

  // 2c. team photos ---------------------------------------------------
  // Copies content/team/<batch>/<seed>.<ext> → public/content/team/<batch>/
  // verbatim so real member photos (referenced by the avatar img) are served.
  if (fs.existsSync(TEAM_PHOTO_DIR)) {
    for (const batchId of Object.keys(teamRaw.batches)) {
      const srcDir = path.join(TEAM_PHOTO_DIR, batchId);
      if (!fs.existsSync(srcDir)) continue;
      const outDir = path.join(OUT, 'content', 'team', batchId);
      fs.mkdirSync(outDir, { recursive: true });
      for (const f of fs.readdirSync(srcDir)) {
        if (TEAM_PHOTO_RE.test(f)) {
          write(path.join(outDir, f), fs.readFileSync(path.join(srcDir, f)));
        }
      }
    }
  }

  // 2d. gallery assets ------------------------------------------------
  // Copy image files to public/gallery/ verbatim from the local
  // content/gallery/ folder. captions.json is metadata only — never
  // copied. Items are pre-rendered into the page; this makes the files
  // servable.
  console.log('gallery');
  if (fs.existsSync(GALLERY_DIR)) {
    const gdir = path.join(OUT, 'gallery');
    fs.mkdirSync(gdir, { recursive: true });
    const files = fs.readdirSync(GALLERY_DIR).filter((f) => GALLERY_IMAGE_RE.test(f));
    for (const f of files) {
      const data = fs.readFileSync(path.join(GALLERY_DIR, f));
      write(path.join(gdir, f), data);
    }
  }

  // 3. top-level pages from src/data/pages.json ---------------------
  // Each def maps a template file → output path + metadata (title,
  // desc, url) that head.html and navFor() consume.
  console.log('pages');
  const pageDefs = JSON.parse(read(path.join(SRC, 'data', 'pages.json')));
  for (const p of pageDefs) {
    buildPage({ ...p, url: p.url || `/${p.out}` });
  }

  // 3b. team batch pages (team/<batch>/index.html) -------------------
  // One page per batch in team.json. Each is the SAME team template
  // rendered with `team` = that batch's groups, so the layout is
  // identical and adding a batch is purely a team.json edit.
  const teamPageDef = pageDefs.find((p) => p.file === 'team.html');
  if (teamPageDef) {
    for (const batchId of Object.keys(teamBatches)) {
      const batch = teamRaw.batches[batchId];
      const scope = {
        site,
        page: { ...teamPageDef, url: `/team/${batchId}/` },
        nav: navFor({ url: `/team/${batchId}/` }),
        team: teamBatches[batchId],
        activeBatchId: batchId,
        teamBatches,
        currentBatchId,
        batchesList: teamBatchesList,
        projects,
        events,
        eventsPage,
        homeEvents,
        featuredProjects,
        featuredPosts,
        featuredResources,
        achievements,
resources,
    posts,
    gallery,
    funky,
    funkyDepts,
    activeProjectsCount,
      };
      writeHtml(
        path.join(OUT, 'team', batchId, 'index.html'),
        renderTemplate(read(path.join(SRC, 'pages', 'team.html')), scope, scope),
      );
      console.log(`  ✓ team/${batchId}/index.html`);
    }
  }

  // 4. per-item pages (project/event/article singles) ---------------
  // makeItem renders one template once per collection item. It injects
  // `item` plus prev/next neighbours (wrap-around) for the pager, and
  // synthesizes a `page` object so head/nav/footer behave like any
  // other page. Output is directory-style: <type>/<slug>/index.html.
  console.log('item pages');
  const makeItem = (template, outFn, coll, getCtx) => {
    for (const item of coll) {
      const idx = coll.indexOf(item);
      const prev = coll[(idx - 1 + coll.length) % coll.length];
      const next = coll[(idx + 1) % coll.length];
      const scope = {
        site,
        item,
        prev,
        next,
        page: {
          code: item.code,
          section: item.section || 'item',
          horizontal: item.horizontal !== false,
          isSingle: true,
          title: item.title,
          desc: item.summary || item.subtitle || '',
          path: item.url,
        },
        nav: navFor({ url: item.url }),
        projects,
        events,
        eventsPage,
        homeEvents,
        featuredProjects,
        featuredPosts,
        featuredResources,
        achievements,
        resources,
        posts,
        team,
        teamBatches,
        currentBatchId,
        batchesList: teamBatchesList,
        activeBatchId: currentBatchId,
        gallery,
        funky,
        funkyDepts,
        activeProjectsCount,
      };
      writeHtml(
        path.join(OUT, outFn(item)),
        renderTemplate(read(path.join(SRC, 'pages', template)), scope, scope),
      );
      console.log(`  ✓ ${outFn(item)}`);
    }
  };
  makeItem(
    'project.html',
    (p) => `projects/${p.slug}/index.html`,
    projects,
    (p) => p,
  );
  makeItem(
    'event.html',
    (e) => `events/${e.slug}/index.html`,
    events,
    (e) => e,
  );
  makeItem(
    'article.html',
    (p) => `blog/${p.slug}/index.html`,
    posts,
    (p) => p,
  );

  // 5. site extras ---------------------------------------------------
  write(path.join(OUT, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  // Cloudflare Pages cache headers (served from CF; vercel.json carries
  // the equivalent `headers` for Vercel). Conservative TTLs — css/js are
  // NOT fingerprint-versioned, so a 1-day cache + stale-while-revalidate
  // keeps deploys fresh while caching the heavy repeats. Generated art
  // (img/, gallery/) is immutable-by-name so it caches longer.
  write(
    path.join(OUT, '_headers'),
    [
      '/*',
      '  Cache-Control: no-cache',
      '/css/*',
      '  Cache-Control: public, max-age=86400, stale-while-revalidate=604800',
      '/js/*',
      '  Cache-Control: public, max-age=86400, stale-while-revalidate=604800',
      '/img/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/gallery/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/content/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '',
    ].join('\n'),
  );

  console.log(`done in ${Date.now() - t0}ms → public/`);
}

try {
  boot();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

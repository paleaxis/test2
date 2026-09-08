#!/usr/bin/env node
'use strict';

/**
 * MOCK SUPABASE END-TO-END TEST  —  scripts/mock-supabase-test.js
 * =====================================================================
 * Spins up a tiny fake of the Supabase surface (PostgREST subset +
 * storage subset), then drives the REAL project scripts against it:
 *
 *   1. `node scripts/import-content.js`        (repo content → "DB")
 *   2. `node scripts/build.js`                 ("DB" → public/)
 *
 * and asserts the built site reflects DATABASE content, not local
 * files. Also checks that drafts never leak and that the admin bundle
 * receives only public config values.
 *
 * Run:  node scripts/mock-supabase-test.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

// async on purpose: the mock HTTP server lives in THIS process's event
// loop — a synchronous execFile would block the loop and deadlock the
// child's HTTP requests against it.
const run = promisify(execFile);

const ROOT = path.join(__dirname, '..');

// Mock the NEW Supabase key system: an opaque publishable and an opaque
// secret key. The legacy JWT key is covered separately (see header test).
const MOCK_PUBLISHABLE = 'sb_publishable_mock12345678901234567890_abcdef';
const MOCK_SECRET = 'sb_secret_mockABCDEFGHIJKLMNOPQRSTUVWX_12345678';
// A legacy JWT-shaped service key, used to prove apikey+Authorization both
// get sent for old keys (so the header behavior test is meaningful).
const MOCK_LEGACY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy.mock';

/* ------------------------------------------------------------------ */
/* in-memory database                                                  */
/* ------------------------------------------------------------------ */

const DB = {
  posts: [
    {
      id: 'p-remote-1',
      slug: 'from-the-database',
      title: 'This Post Lives in Supabase',
      date: '2026-09-05',
      description: 'Proves the build reads posts from the backend.',
      author: 'Backend Bot',
      role: 'Integration test',
      category: 'Meta',
      tags: ['test'],
      image: null,
      content_markdown: 'Remote **content** with a [link](https://example.com).\n\n```bash\necho hello\n```',
      draft: false,
      created_at: '2026-09-05T00:00:00Z',
      updated_at: '2026-09-05T00:00:00Z',
    },
    {
      id: 'p-remote-2',
      slug: 'secret-draft-post',
      title: 'Secret Draft',
      date: '2026-09-04',
      description: 'Must never appear publicly.',
      content_markdown: 'secret',
      draft: true,
      tags: [],
    },
  ],
  events: [
    {
      id: 'e-remote-1',
      slug: 'database-event',
      title: 'Event From the Database',
      date: '2026-09-20',
      status: 'upcoming',
      subtitle: 'Served from PostgREST',
      description: 'Integration fixture.',
      location: 'Lab 9',
      duration: '2 hours',
      level: 'Beginner',
      speaker: { name: 'Ada Lovelace', role: 'Pioneer' },
      program: [{ time: '14:00', title: 'Hello' }],
      resources: ['Systems'],
      register: 'Nowhere.',
      content_markdown: '',
      draft: false,
    },
  ],
  funkystuff_items: [
    {
      id: 'f-remote-1',
      slug: 'remote-game',
      title: 'Remote Game',
      dept: 'Games',
      by: 'Tester',
      entry_file: 'index.html',
      sort: 0,
      draft: false,
    },
  ],
  gallery_items: [
    {
      id: 'g-remote-1',
      file: 'db-photo.jpg',
      caption: 'Served from the database',
      sort: 0,
      draft: false,
    },
  ],
  content_collections: [
    {
      key: 'site',
      payload: {
        name: 'Dhaka College IT Club (DB collection)',
        tagline: 'Rendered from content_collections',
        socials: [],
      },
    },
  ],
  site_config: [
    {
      id: 1,
      config: {
        featured: {
          projects: ['nodhini', 'campusmesh', 'voltab'],
          posts: ['from-the-database'],
          resources: ['linux-journey'],
        },
        home: { events: ['database-event'] },
      },
    },
  ],
};

const STORAGE = {
  'funkystuff/remote-game/index.html':
    '<!doctype html><title>Remote Game</title><h1>Remote Game fixture</h1>',
  // gallery bucket objects live at bucket ROOT (flat) — key IS filename;
  // the mock mirrors that shape exactly like the live Storage API.
  'gallery/db-photo.jpg': 'global-header-length',
};

/* ------------------------------------------------------------------ */
/* fake server (PostgREST + Storage subset)                            */
/* ------------------------------------------------------------------ */

const seen = { requests: [] };

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseQuery(url) {
  const out = {};
  const q = new URL(url, 'http://x').searchParams;
  for (const [k, v] of q.entries()) out[k] = v;
  return out;
}

// minimal draft filter + ordering for the queries the build actually makes
function filterRows(rows, query) {
  let out = rows;
  if (query.draft === 'is.false') out = out.filter((r) => !r.draft);
  if (query.status && query.status.startsWith('in.')) {
    const vals = query.status
      .slice(3)
      .replace(/[()]/g, '')
      .split(',');
    out = out.filter((r) => vals.includes(r.status));
  }
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('id') || k === 'select') continue;
    if (v.startsWith('eq.')) out = out.filter((r) => String(r[k]) === v.slice(3));
  }
  if (query.order) {
    const parts = query.order.split(','); // e.g. "date.desc,slug.asc"
    out = [...out].sort((a, b) => {
      for (const part of parts) {
        const [k, dir] = part.split('.');
        const av = a[k];
        const bv = b[k];
        if (av === bv) continue;
        const cmp = av > bv ? 1 : -1;
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }
  return out;
}

const server = http.createServer((req, res) => {
  seen.requests.push({ url: req.url, apikey: req.headers['apikey'], auth: req.headers['authorization'] || null });
  const url = req.url;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();

    // ---- PostgREST ----
    if (url.startsWith('/rest/v1/')) {
      const [tablePart, queryStr] = url.slice(9).split('?');
      const table = tablePart.replace(/\/$/, '');
      const query = parseQuery(url);
      if (!DB[table]) return json(res, 404, { message: `table ${table} not found` });
      if (req.method === 'GET') {
        return json(res, 200, filterRows(DB[table], query).map((r) => {
          const copy = {};
          for (const k of (query.select || '*').split(',')) {
            if (k === '*') return r;
            copy[k] = r[k];
          }
          return copy;
        }));
      }
      if (req.method === 'POST') {
        const row = JSON.parse(body);
        // content_collections uses key PK; gallery_items unique on file —
        // an upsert (on_conflict=…) updates the existing row in place
        // instead of appending a duplicate, mirroring PostgREST's
        // resolution=merge-duplicates upsert behavior.
        const conflict = new URL(url, 'http://x').searchParams.get('on_conflict');
        const unique = conflict === 'key' ? 'key' : conflict === 'file' ? 'file' : null;
        const existing = unique ? DB[table].find((r) => r[unique] === row[unique]) : null;
        if (existing) {
          Object.assign(existing, row);
          return json(res, 201, [existing]);
        }
        row.id = `${table}-new`;
        DB[table].push(row);
        return json(res, 201, [row]);
      }
      if (req.method === 'PATCH') {
        // apply to rows matched by query (mock: single-row slug/id matches)
        const target = DB[table].find((r) =>
          Object.entries(query).every(([k, v]) => (v.startsWith('eq.') ? String(r[k]) === v.slice(3) : true)),
        );
        if (!target) return json(res, 200, []);
        Object.assign(target, JSON.parse(body));
        return json(res, 200, [target]);
      }
    }

    // ---- Storage ----
    if (url.startsWith('/storage/v1/object/list/')) {
      const bucket = decodeURIComponent(url.slice('/storage/v1/object/list/'.length).split('?')[0]);
      const { prefix } = JSON.parse(body);
      const names = Object.keys(STORAGE).filter((k) => k.startsWith(`${bucket}/${prefix}`) && !k.endsWith('/'));
      // names are prefix-relative (mirrors the live Storage API)
      return json(
        res,
        200,
        names.map((k) => ({ name: k.slice((bucket + '/' + prefix).length), id: k })),
      );
    }
    if (req.method === 'GET' && url.startsWith('/storage/v1/object/')) {
      const key = decodeURIComponent(url.slice('/storage/v1/object/'.length));
      if (STORAGE[key]) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(STORAGE[key]);
      }
      return json(res, 404, { message: 'not found' });
    }
    if (req.method === 'POST' && url.startsWith('/storage/v1/object/gallery/')) {
      const key = decodeURIComponent(url.slice('/storage/v1/object/gallery/'.length));
      STORAGE[`gallery/${key}`] = Buffer.from(body);
      return json(res, 200, { Key: key });
    }
    if (req.method === 'POST' && url.startsWith('/storage/v1/object/funkystuff/')) {
      const key = decodeURIComponent(url.slice('/storage/v1/object/funkystuff/'.length));
      STORAGE[key] = Buffer.from(body);
      return json(res, 200, { Key: key });
    }

    json(res, 404, { message: `no route: ${url}` });
  });
});

/* ------------------------------------------------------------------ */
/* assertions                                                          */
/* ------------------------------------------------------------------ */

let failures = 0;
function check(name, ok) {
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}`);
  if (!ok) failures++;
}

function main() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}`;

      try {
        // ---------- 1. import repo content through the REAL script ----
        console.log('\n[1] import-content.js against mock Supabase (NEW secret key)');
        await run('node', [path.join(ROOT, 'scripts', 'import-content.js')], {
          env: { ...process.env, SUPABASE_URL: url, SUPABASE_SECRET_KEY: MOCK_SECRET },
        });
        check('import created rows in mock DB', DB.posts.some((p) => p.slug === 'reading-man-pages'));
        check('import stored funkystuff file in mock storage', Boolean(STORAGE['line-runner/line-runner.html']));

        // ---------- 2. build through the REAL build script ------------
        // Simulate the admin curating via the UI after import: featured
        // now points at the DB-native fixture post/event, and a DB
        // collection overrides the repo "site" JSON (admin edited it).
        DB.site_config[0].config = {
          featured: {
            projects: ['nodhini', 'campusmesh', 'voltab'],
            posts: ['from-the-database'],
            resources: ['linux-journey'],
          },
          home: { events: ['database-event'] },
        };
        // the imported repo rows for nav/team/etc. exist now (seeded by
        // import); the fixture "site" row we pre-seeded must still win.
        const siteCol = DB.content_collections.find((r) => r.key === 'site');
        siteCol.payload = {
          name: 'Dhaka College IT Club (DB collection)',
          tagline: 'Rendered from content_collections',
          socials: [],
        };
        console.log('\n[2] build.js against mock Supabase (NEW secret/publishable keys)');
        await run('node', [path.join(ROOT, 'scripts', 'build.js')], {
          env: {
            ...process.env,
            SUPABASE_URL: url,
            SUPABASE_SECRET_KEY: MOCK_SECRET,
            SUPABASE_PUBLISHABLE_KEY: MOCK_PUBLISHABLE,
          },
        });

        // New opaque keys must NOT ride on Authorization (they aren't JWTs)
        // — only on `apikey`. Assert every request the build made sent the
        // secret key on apikey and NO Authorization header.
        const allReq = seen.requests.filter((r) => r.url.startsWith('/rest/') || r.url.startsWith('/storage/'));
        check(
          'build sent new secret key on apikey only (no Authorization header)',
          allReq.length > 0 && allReq.every((r) => r.apikey === MOCK_SECRET && !r.auth),
        );

        const readFile = (p) => fs.readFileSync(path.join(ROOT, 'public', p), 'utf8');

        const home = readFile('index.html');
        check('home page features DB post (featured.posts from site_config)', home.includes('This Post Lives in Supabase'));
        check('home page features DB event (home.events from site_config)', home.includes('Event From the Database'));
        check('DB draft post NOT rendered anywhere', !home.includes('Secret Draft'));

        const article = readFile('blog/from-the-database/index.html');
        check('DB post page exists at /blog/<slug>/', article.includes('Remote <strong>content</strong>'));
        check('fenced code keeps terminal styling (pre.code)', article.includes('<pre class="code"><code>'));
        check('external link sanitized with target/rel', article.includes('target="_blank"') && article.includes('rel="noopener'));
        check('markdown link preserved', article.includes('href="https://example.com"'));

        check('DB draft post has NO page generated', !fs.existsSync(path.join(ROOT, 'public/blog/secret-draft-post')));

        const eventsIdx = readFile('events/index.html');
        check('DB event appears on events page', eventsIdx.includes('Event From the Database'));

        const ev = readFile('events/database-event/index.html');
        check('event structured fields render (speaker)', ev.includes('Ada Lovelace'));
        check('event program timeline renders', ev.includes('14:00') && ev.includes('Hello'));

        check('funkystuff lists DB project', readFile('funkystuff/index.html').includes('Remote Game'));
        check(
          'storage file copied into public/funkystuff/<slug>/',
          readFile('funkystuff/remote-game/index.html').includes('Remote Game fixture'),
        );

        check('imported repo posts are served from the DB (post-import build)', fs.existsSync(path.join(ROOT, 'public/blog/reading-man-pages')));

        // ---------- 2b. collections + gallery from the backend ---------
        console.log('\n[2b] collections + gallery override');

        // site collection from the DB (name overridden; shallow-merged
        // over the seed so untouched fields like `meta` keep working)
        check(
          'DB site collection overrides repo site.json (name + merge keeps seed fields)',
          readFile('index.html').includes('Dhaka College IT Club (DB collection)'),
        );
        check(
          'DB site override shallow-merges seed fields (logo survives)',
          readFile('index.html').includes('/img/logo.svg'),
        );

        // repo-managed collections were seeded by import and stay usable
        check('repo team collection seeded into content_collections', DB.content_collections.some((r) => r.key === 'team'));

        // the DB gallery row + storage file beat the local folder
        const gal = readFile('gallery/index.html');
        check('DB gallery item renders on the gallery page', gal.includes('db-photo.jpg'));
        check('DB gallery caption used (not the humanized filename)', gal.includes('Served from the database'));
        check('DB gallery photo copied from storage bucket into public/gallery/', fs.existsSync(path.join(ROOT, 'public/gallery/db-photo.jpg')));

        // ---------- 3. admin bundle contains public values only -------
        console.log('\n[3] admin bundle security');
        const adminJs = readFile('admin/app.js');
        const adminHtml = readFile('admin/index.html');
        check('admin bundle has URL injected', adminJs.includes(url));
        check('admin bundle receives the PUBLISHABLE key', adminJs.includes(MOCK_PUBLISHABLE));
        check('admin bundle does NOT contain the secret key', !adminJs.includes(MOCK_SECRET));
        check('admin page does NOT contain the secret key', !adminHtml.includes(MOCK_SECRET));
        const allPublic = [];
        const walk = (d) => {
          for (const f of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, f.name);
            if (f.isDirectory()) walk(p);
            else allPublic.push(p);
          }
        };
        walk(path.join(ROOT, 'public'));
        const leaked = allPublic.filter((p) => {
          try {
            return fs.readFileSync(p, 'utf8').includes(MOCK_SECRET) || fs.readFileSync(p, 'utf8').includes(MOCK_LEGACY);
          } catch {
            return false; // binary
          }
        });
        check('secret key appears in NO file under public/', leaked.length === 0);

        // ---------- 4. featured ordering preserved --------------------
        console.log('\n[4] featured ordering');
        const orderOk = home.indexOf('nodhini') < home.indexOf('campusmesh') && home.indexOf('campusmesh') < home.indexOf('voltab');
        check('featured.projects order preserved (config order, not sorted)', orderOk);

        // ---------- 5. key-resolution + header semantics ---------------
        console.log('\n[5] key resolution & header semantics');
        const restLib = require(path.join(ROOT, 'scripts', 'lib', 'supabase-rest'));
        // new secret preferred over legacy service_role
        const cNew = restLib.client({ url, key: MOCK_SECRET });
        const hNew = restLib.authHeaders(cNew);
        check('new opaque key → apikey only, no Authorization', hNew.apikey === MOCK_SECRET && !('Authorization' in hNew));
        check('new opaque key flagged as non-legacy', cNew.legacy === false);
        // legacy JWT key → apikey + Authorization both present
        const cLegacy = restLib.client({ url, key: MOCK_LEGACY });
        const hLegacy = restLib.authHeaders(cLegacy);
        check(
          'legacy JWT key → apikey AND Authorization: Bearer',
          hLegacy.apikey === MOCK_LEGACY && hLegacy.Authorization === `Bearer ${MOCK_LEGACY}`,
        );
        check('legacy JWT key flagged as legacy', cLegacy.legacy === true);
      } catch (e) {
        check(`unexpected error: ${e.message}`, false);
      }

      server.close(() => resolve());
      // undici (node fetch) holds keep-alive sockets open, which would
      // make server.close() wait forever — drop them explicitly.
      if (server.closeAllConnections) server.closeAllConnections();
    });
  });
}

main()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll mock-Supabase integration checks passed.');
    process.exit(failures ? 1 : 0);
  });

#!/usr/bin/env node
'use strict';

/**
 * CONTENT IMPORT  —  scripts/import-content.js
 * =====================================================================
 * One-time (repeatable, idempotent) migration of the repo's existing
 * content into Supabase:
 *
 *     node scripts/import-content.js --dry-run   # validate only
 *     node scripts/import-content.js             # import
 *     node scripts/import-content.js --force     # also update changed rows
 *
 * Imports:
 *   content/blog/*.md        → posts
 *   content/events/*.md      → events
 *   src/data/funkystuff.json + funkystuff/*.html → funkystuff_items + storage
 *   src/config/site.json     → site_config (singleton row)
 *
 * SAFETY
 *   • validates every record BEFORE writing anything (slugs, dates,
 *     required fields, duplicate slugs within the import set)
 *   • NON-DESTRUCTIVE: existing rows with the same slug are skipped
 *     unless --force is passed (and even then only UPDATEd, never
 *     deleted); nothing is ever removed from the database
 *   • every action is reported; a summary ends the run and the process
 *     exits non-zero if any record failed
 *
 * The storage upload requires the secret key (or legacy service-role
 * key), server-side only.
 */

const fs = require('fs');
const path = require('path');
const rest = require('./lib/supabase-rest');

const ROOT = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const FORCE = args.has('--force');

const results = { created: [], updated: [], skipped: [], failed: [], uploaded: [] };

function report(kind, msg) {
  results[kind].push(msg);
  const mark = { created: '+', updated: '~', skipped: '=', failed: '✗', uploaded: '↑' }[kind];
  console.log(`  ${mark} ${msg}`);
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const problems = [];
function complain(msg) {
  problems.push(msg);
  console.error(`  ✗ VALIDATION: ${msg}`);
}

function yamlDate(v) {
  // js-yaml may hand us a Date for unquoted dates — normalize to ISO
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

/* ------------------------------------------------------------------ */
/* source readers (mirror the original build loaders exactly)          */
/* ------------------------------------------------------------------ */

function parseFrontmatter(file, raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${path.basename(file)} has no ---frontmatter--- block`);
  const yaml = require('js-yaml');
  return { fm: yaml.load(m[1]) || {}, body: m[2] };
}

function readPosts() {
  const dir = path.join(ROOT, 'content', 'blog');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { fm, body } = parseFrontmatter(path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8'));
      if (fm.draft) {
        console.log(`  - ${f}: draft — skipping (never imported)`);
        return null;
      }
      return { slug, ...fm, date: yamlDate(fm.date), content_markdown: body, _file: f };
    })
    .filter(Boolean);
}

function readEvents() {
  const dir = path.join(ROOT, 'content', 'events');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map((f) => {
      const slug = f.replace(/\.md$/, '');
      const { fm, body } = parseFrontmatter(path.join(dir, f), fs.readFileSync(path.join(dir, f), 'utf8'));
      if (fm.draft) {
        console.log(`  - ${f}: draft — skipping (never imported)`);
        return null;
      }
      return {
        slug,
        ...fm,
        date: yamlDate(fm.date),
        speaker: fm.speaker && typeof fm.speaker === 'object' ? fm.speaker : {},
        program: Array.isArray(fm.program) ? fm.program : [],
        resources: Array.isArray(fm.resources) ? fm.resources : [],
        content_markdown: body || '',
        _file: f,
      };
    })
    .filter(Boolean);
}

function readFunkystuff() {
  const manifestPath = path.join(ROOT, 'src', 'data', 'funkystuff.json');
  const folder = path.join(ROOT, 'funkystuff');
  if (!fs.existsSync(manifestPath)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => /\.html?$/i.test(f)) : [];
  return manifest.map((m, i) => ({
    slug: m.file.replace(/\.html?$/i, ''),
    title: m.title,
    dept: m.dept,
    by: m.by || '',
    entry_file: m.file,
    sort: i,
    draft: false,
    _sourceFile: path.join(folder, m.file),
    _fileExists: files.includes(m.file),
  }));
}

// Gallery — mirrors the build's local reader: every image file in
// content/gallery/ (with the optional captions.json sidecar) becomes a
// gallery_items row + a file in the `gallery` storage bucket (flat, at
// bucket root — object key IS the file name).
const GALLERY_IMAGE_RE = /\.(jpe?g|png|webp|gif|svg)$/i;
function readGallery() {
  const dir = path.join(ROOT, 'content', 'gallery');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => GALLERY_IMAGE_RE.test(f));
  let captions = {};
  const capPath = path.join(dir, 'captions.json');
  if (fs.existsSync(capPath)) captions = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  return files
    .sort((a, b) => a.localeCompare(b))
    .map((file, i) => ({
      file,
      caption: captions[file] || '',
      sort: i,
      draft: false,
      _filePath: path.join(dir, file),
    }));
}

// The six repo-JSON collections that stay file-managed in the repo but
// can be overridden per-key from Supabase. Import seeds the DB rows ONCE
// (administrators then edit them via /admin/ → Collections; the local
// files remain the seed + offline fallback).
function readCollections() {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', `${name}.json`), 'utf8'));
  return {
    site: read('site'),
    nav: read('nav'),
    team: read('team'),
    projects: read('projects'),
    resources: read('resources'),
    achievements: read('achievements'),
  };
}

// content_collections upsert — key is the PK, so this never duplicates.
async function upsertCollection(c, key, payload) {
  const res = await fetch(`${c.url}/rest/v1/content_collections?on_conflict=key`, {
    method: 'POST',
    headers: {
      ...rest.authHeaders(c),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ key, payload }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`content_collections upsert ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// gallery_items upsert — file is the natural key (unique).
async function upsertGalleryItem(c, row) {
  const res = await fetch(`${c.url}/rest/v1/gallery_items?on_conflict=file`, {
    method: 'POST',
    headers: {
      ...rest.authHeaders(c),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`gallery_items upsert ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* REST upsert helpers (service key required)                          */
/* ------------------------------------------------------------------ */

async function insertRow(c, table, row) {
  const res = await fetch(`${c.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...rest.authHeaders(c),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table} insert ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function updateRow(c, table, slug, patch) {
  const res = await fetch(`${c.url}/rest/v1/${table}?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      ...rest.authHeaders(c),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${table} update ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function uploadObject(c, bucket, objectPath, buffer, contentType) {
  const res = await fetch(`${c.url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      ...rest.authHeaders(c),
      'Content-Type': contentType || 'text/html; charset=utf-8',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`storage upload ${bucket}/${objectPath} ${res.status}: ${body.slice(0, 300)}`);
  }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const c = rest.client();
  if (!DRY && !c.enabled) {
    console.error('Supabase is not configured.');
    console.error('Set SUPABASE_URL and a server-side key in .env: SUPABASE_SECRET_KEY');
    console.error('(or the legacy SUPABASE_SERVICE_ROLE_KEY). Keys are server-side only.');
    console.error('Then apply supabase/migrations/001_init.sql and run this import again.');
    process.exit(1);
  }

  console.log(`DCITC content import${DRY ? ' — DRY RUN (no writes)' : ''}\n`);

  /* ---------- gather + validate everything FIRST ---------- */

  const posts = readPosts();
  const events = readEvents();
  const funky = readFunkystuff();
  const gallery = readGallery();
  const collections = readCollections();
  const siteConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'config', 'site.json'), 'utf8'));

  const seenSlugs = { posts: new Set(), events: new Set(), funky: new Set() };

  for (const p of posts) {
    if (!SLUG_RE.test(p.slug)) complain(`post ${p._file}: slug "${p.slug}" must be lowercase-hyphenated`);
    if (seenSlugs.posts.has(p.slug)) complain(`post ${p._file}: duplicate slug "${p.slug}"`);
    seenSlugs.posts.add(p.slug);
    if (!p.title) complain(`post ${p._file}: missing title`);
    if (!p.date || !ISO_DATE_RE.test(p.date)) complain(`post ${p._file}: bad date "${p.date}" (YYYY-MM-DD)`);
  }
  for (const e of events) {
    if (!SLUG_RE.test(e.slug)) complain(`event ${e._file}: slug "${e.slug}" must be lowercase-hyphenated`);
    if (seenSlugs.events.has(e.slug)) complain(`event ${e._file}: duplicate slug "${e.slug}"`);
    seenSlugs.events.add(e.slug);
    if (!e.title) complain(`event ${e._file}: missing title`);
    if (!e.date || !ISO_DATE_RE.test(e.date)) complain(`event ${e._file}: bad date "${e.date}"`);
    if (!['upcoming', 'ongoing', 'past'].includes(e.status)) complain(`event ${e._file}: bad status "${e.status}"`);
  }
  for (const f of funky) {
    if (!f._fileExists) complain(`funkystuff "${f.slug}": file "${f.entry_file}" not found in funkystuff/`);
    if (seenSlugs.funky.has(f.slug)) complain(`funkystuff: duplicate slug "${f.slug}"`);
    seenSlugs.funky.add(f.slug);
    if (!f.title || !f.dept) complain(`funkystuff "${f.slug}": title and dept are required`);
  }
  for (const g of gallery) {
    if (!SLUG_RE.test(g.file) && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(g.file)) {
      complain(`gallery "${g.file}": filename must be URL-safe (letters/digits/-/_)`);
    }
  }
  const COLLECTION_KEYS = ['site', 'nav', 'team', 'projects', 'resources', 'achievements'];
  for (const key of Object.keys(collections)) {
    if (!COLLECTION_KEYS.includes(key)) complain(`collection "${key}": not in ${COLLECTION_KEYS.join(', ')}`);
  }
  // config references must resolve against the import sets
  for (const slug of siteConfig.featured.posts) {
    if (!seenSlugs.posts.has(slug)) complain(`site_config: featured.posts references unknown slug "${slug}"`);
  }
  for (const slug of siteConfig.home.events) {
    if (!seenSlugs.events.has(slug)) complain(`site_config: home.events references unknown slug "${slug}"`);
  }

  if (problems.length) {
    console.error(`\n${problems.length} validation problem(s) — nothing was written. Fix and re-run.`);
    process.exit(1);
  }
  console.log(
    `Validation OK: ${posts.length} posts, ${events.length} events, ${funky.length} funkystuff items, ` +
      `${gallery.length} gallery images, ${Object.keys(collections).length} collections.\n`,
  );
  if (DRY) {
    console.log('Dry run complete — no writes performed.');
    return;
  }

  /* ---------- write: posts ---------- */

  console.log('posts');
  const existingPosts = await rest.fetchAll(c, 'posts', 'select=slug,title,date,content_markdown').catch(() => []);
  const postIndex = new Map(existingPosts.map((r) => [r.slug, r]));
  for (const p of posts) {
    const row = {
      slug: p.slug,
      title: p.title,
      date: p.date,
      description: p.description || '',
      author: p.author || 'DCITC',
      role: p.role || 'Contributor',
      category: p.category ?? (Array.isArray(p.tags) && p.tags[0]) ?? null,
      tags: Array.isArray(p.tags) ? p.tags : [],
      image: p.image || null,
      content_markdown: p.content_markdown,
      draft: false,
    };
    const before = postIndex.get(p.slug);
    if (!before) {
      try {
        await insertRow(c, 'posts', row);
        report('created', `posts/${p.slug}`);
      } catch (e) {
        report('failed', `posts/${p.slug}: ${e.message.split('\n')[0]}`);
      }
    } else if (FORCE) {
      try {
        await updateRow(c, 'posts', p.slug, row);
        report('updated', `posts/${p.slug}`);
      } catch (e) {
        report('failed', `posts/${p.slug}: ${e.message.split('\n')[0]}`);
      }
    } else {
      report('skipped', `posts/${p.slug} already exists (use --force to update)`);
    }
  }

  /* ---------- write: events ---------- */

  console.log('\nevents');
  const existingEvents = await rest.fetchAll(c, 'events', 'select=slug').catch(() => []);
  const eventIndex = new Set(existingEvents.map((r) => r.slug));
  for (const e of events) {
    const row = {
      slug: e.slug,
      title: e.title,
      date: e.date,
      status: e.status,
      subtitle: e.subtitle || '',
      description: e.description || '',
      location: e.location || null,
      duration: e.duration || null,
      level: e.level || null,
      speaker: e.speaker,
      program: e.program,
      resources: e.resources,
      register: e.register || null,
      content_markdown: e.content_markdown,
      draft: false,
    };
    if (!eventIndex.has(e.slug)) {
      try {
        await insertRow(c, 'events', row);
        report('created', `events/${e.slug}`);
      } catch (err) {
        report('failed', `events/${e.slug}: ${err.message.split('\n')[0]}`);
      }
    } else if (FORCE) {
      try {
        await updateRow(c, 'events', e.slug, row);
        report('updated', `events/${e.slug}`);
      } catch (err) {
        report('failed', `events/${e.slug}: ${err.message.split('\n')[0]}`);
      }
    } else {
      report('skipped', `events/${e.slug} already exists (use --force to update)`);
    }
  }

  /* ---------- write: funkystuff (metadata + storage) ---------- */

  console.log('\nfunkystuff');
  const existingFunky = await rest.fetchAll(c, 'funkystuff_items', 'select=slug').catch(() => []);
  const funkyIndex = new Set(existingFunky.map((r) => r.slug));
  for (const f of funky) {
    const row = {
      slug: f.slug,
      title: f.title,
      dept: f.dept,
      by: f.by,
      entry_file: f.entry_file,
      sort: f.sort,
      draft: false,
    };
    if (!funkyIndex.has(f.slug)) {
      try {
        await insertRow(c, 'funkystuff_items', row);
        report('created', `funkystuff_items/${f.slug}`);
      } catch (err) {
        report('failed', `funkystuff_items/${f.slug}: ${err.message.split('\n')[0]}`);
        continue;
      }
    } else if (FORCE) {
      try {
        await updateRow(c, 'funkystuff_items', f.slug, row);
        report('updated', `funkystuff_items/${f.slug}`);
      } catch (err) {
        report('failed', `funkystuff_items/${f.slug}: ${err.message.split('\n')[0]}`);
        continue;
      }
    } else {
      report('skipped', `funkystuff_items/${f.slug} already exists`);
    }
    // upload the file (upsert → safe to re-run)
    try {
      const buf = fs.readFileSync(f._sourceFile);
      await uploadObject(c, 'funkystuff', `${f.slug}/${f.entry_file}`, buf, 'text/html; charset=utf-8');
      report('uploaded', `storage:funkystuff/${f.slug}/${f.entry_file}`);
    } catch (err) {
      report('failed', `storage ${f.slug}: ${err.message.split('\n')[0]}`);
    }
  }

  /* ---------- write: gallery (metadata + storage bucket) ---------- */

  console.log('\ngallery');
  const existingGallery = await rest.fetchAll(c, 'gallery_items', 'select=file').catch(() => []);
  const galleryIndex = new Set(existingGallery.map((r) => r.file));
  for (const g of gallery) {
    if (!galleryIndex.has(g.file)) {
      try {
        await upsertGalleryItem(c, {
          file: g.file,
          caption: g.caption,
          sort: g.sort,
          draft: g.draft,
        });
        report('created', `gallery_items/${g.file}`);
      } catch (err) {
        report('failed', `gallery_items/${g.file}: ${err.message.split('\n')[0]}`);
        continue;
      }
    } else if (FORCE) {
      try {
        await upsertGalleryItem(c, {
          file: g.file,
          caption: g.caption,
          sort: g.sort,
          draft: g.draft,
        });
        report('updated', `gallery_items/${g.file}`);
      } catch (err) {
        report('failed', `gallery_items/${g.file}: ${err.message.split('\n')[0]}`);
        continue;
      }
    } else {
      report('skipped', `gallery_items/${g.file} already exists (use --force to update)`);
    }
    // upload the image (upsert → safe to re-run). Object key = file name
    // (flat at bucket root — matches the public-download policy join).
    try {
      const buf = fs.readFileSync(g._filePath);
      await uploadObject(c, 'gallery', g.file, buf, 'image/*');
      report('uploaded', `storage:gallery/${g.file}`);
    } catch (err) {
      report('failed', `storage:gallery ${g.file}: ${err.message.split('\n')[0]}`);
    }
  }

  /* ---------- write: content collections (seed once, admin-owned) ---------- */

  // Collections are ADMIN-owned once seeded: a row, once created, is the
  // source of truth (the build prefers it over the repo file). So this
  // seeds per-key ONLY when no row exists yet, exactly like posts/events
  // — --force re-seeds from the repo (which is how you undo an edit).
  console.log('\ncontent_collections');
  const existingCollections = await rest
    .fetchAll(c, 'content_collections', 'select=key')
    .catch(() => []);
  const collectionIndex = new Set(existingCollections.map((r) => r.key));
  for (const [key, payload] of Object.entries(collections)) {
    if (!collectionIndex.has(key) || FORCE) {
      try {
        await upsertCollection(c, key, payload);
        report('created', `content_collections/${key}`);
      } catch (err) {
        report('failed', `content_collections/${key}: ${err.message.split('\n')[0]}`);
      }
    } else {
      report('skipped', `content_collections/${key} already exists (use --force to re-seed)`);
    }
  }

  /* ---------- write: site config ---------- */

  console.log('\nsite_config');
  try {
    const res = await fetch(`${c.url}/rest/v1/site_config?id=eq.1`, {
      method: 'PATCH',
      headers: {
        ...rest.authHeaders(c),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ config: siteConfig }),
    });
    const rows = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(rows).slice(0, 300)}`);
    if (rows.length) report('updated', 'site_config (row 1)');
    else {
      await insertRow(c, 'site_config', { id: 1, config: siteConfig });
      report('created', 'site_config (row 1)');
    }
  } catch (e) {
    report('failed', `site_config: ${e.message.split('\n')[0]}`);
  }

  /* ---------- summary ---------- */

  console.log(
    `\nSummary: ${results.created.length} created, ${results.updated.length} updated, ` +
      `${results.skipped.length} skipped, ${results.uploaded.length} uploaded, ${results.failed.length} failed.`,
  );
  if (results.failed.length) {
    console.error('Some records failed — see ✗ lines above.');
    process.exit(1);
  }
  console.log('\nNext: rebuild the site to pull from Supabase:  node scripts/build.js');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

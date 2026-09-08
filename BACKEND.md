# BACKEND.md — DCITC content backend (Supabase)

The site you already have is untouched: same templates, same URLs, same
build. What changed is **where content comes from**. The build now has
two interchangeable sources:

```
admin edits ──▶ Supabase (Postgres + Auth + Storage)
                     │
                     ▼  build-time fetch (service key, server-side only)
        scripts/build.js  ──▶  public/  ──▶ Cloudflare Pages
                     ▲
                     │  fallback when Supabase is not configured
        content/*.md, src/data/*.json  (the original local files)
```

The public visitor sees exactly the same static site as before. Drafts
never leave the database. Markdown is sanitized at build time regardless
of source.

---

## 1. One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Apply the schema**: open *SQL Editor* and paste
   [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql),
   or run `supabase db push` if you use the CLI. This creates:
   - `posts`, `events`, `funkystuff_items`, `site_config`, `profiles`
   - Row Level Security policies on every table (see §3)
   - the `funkystuff` storage bucket + storage policies
   - the `is_admin()` gate and a trigger that profiles every new user
3. **Disable public signups**: *Authentication → Providers → Email →*
   turn off **“Allow new users to sign up”**. Visitors never need
   accounts; admin accounts are created by hand:
   - *Authentication → Users → Add user* (email + password)
   - then promote it in the SQL editor:
     ```sql
     update public.profiles set is_admin = true where email = 'you@example.com';
     ```
4. **Copy the keys** (*Dashboard → Settings → API Keys → “Publishable and
   secret API keys”*): Project URL, the **publishable** key, and the
   **secret** key into `.env` (see §2). If your project only has legacy
   keys yet, the old `anon` / `service_role` names work too.

## 2. Environment variables

```bash
cp .env.example .env      # then fill in the values
```

Supabase's key system has two "audiences". The build uses the **new**
publishable / secret keys (opaque `sb_publishable_…` / `sb_secret_…`
strings — the legacy JWT `anon` / `service_role` keys still work and
are the automatic fallback; they are deprecated by Supabase by end of
2026).

| Variable | Where it may appear | Used by |
| --- | --- | --- |
| `SUPABASE_URL` | server **and** browser | build scripts, `/admin/` app |
| `SUPABASE_PUBLISHABLE_KEY` | server **and** browser (public by design) | `/admin/` app |
| `SUPABASE_SECRET_KEY` | **server-side only** — never in `public/`, never in git, never in Cloudflare's public env vars | `scripts/build.js`, `scripts/import-content.js` |
| `SUPABASE_ANON_KEY` *(legacy)* | server **and** browser | fallback for `/admin/` when the publishable key is absent |
| `SUPABASE_SERVICE_ROLE_KEY` *(legacy)* | **server-side only** | fallback for the build scripts when the secret key is absent |

`.env` is gitignored. The build injects only the URL + the **publishable
key** into `public/admin/` (they are public values; RLS is the security
boundary). A grep of `public/` for the secret key is part of the test
suite (`node scripts/mock-supabase-test.js`, section [3]).

> **Header rule (new keys).** The opaque publishable/secret keys are NOT
> JWTs, so they must be sent on the `apikey` header only — putting them
> on `Authorization: Bearer` makes Supabase reject the request
> ("Invalid JWT"). The build's REST client handles this automatically:
> new `sb_` keys go on `apikey` only, legacy JWT keys go on both. There
> is nothing to configure; see `scripts/lib/supabase-rest.js`.

## 3. Security model (RLS)

| Who | Can do |
| --- | --- |
| `anon` (the world) | `SELECT` on **published** posts/events/funkystuff only (`draft = false`). No writes, anywhere, ever. |
| `authenticated` non-admin | Nothing. `is_admin()` returns false → all policies deny. |
| `authenticated` admin | Full CRUD on content tables + storage folder management + site config. |

The rules live in the database, not the frontend. The admin UI checks
`profiles.is_admin` only to show/hide interface; a non-admin gets the
same refusal with or without the UI. Draft rows are unreadable by anon
at the engine level — no query pattern can leak them.

Markdown is rendered by `marked` and passed through
[`sanitize-html`](https://github.com/apostrophecms/sanitize-html) at
build time (`scripts/lib/content-source.js`): scripts, iframes, event
handlers and `javascript:` URLs are stripped; the site's terminal-style
code blocks, tables, images and external-link hardening survive.

## 4. Migrate existing content

```bash
npm run import:check        # dry run: validate only, nothing written
npm run import:content      # import (skips rows that already exist)
npm run import:content -- --force   # also update changed rows
```

Imports `content/blog/*.md` → `posts`, `content/events/*.md` →
`events`, the funkystuff manifest + files → `funkystuff_items` + the
storage bucket, and `src/config/site.json` → the `site_config` row.
Validation covers slug shape, required fields, ISO dates, duplicate
slugs and dangling config references — **any problem aborts the whole
run before a single write**. The import is additive: it never deletes
anything, and re-running it is safe (existing rows are skipped unless
`--force`).

## 5. The admin app

Visit `/admin/` — on any page of the site, Ctrl+K (Cmd+K on macOS)
jumps straight here (it opens the login screen if you're signed out).

Sections:

- **Dashboard** — live/draft counts and the publish flow.
- **Posts** — create/edit/delete, markdown with preview, tags, draft ⇄
  live, slug (fixed once created — it IS the URL).
- **Events** — same, plus the structured fields (status
  upcoming/ongoing/past, speaker, program timeline, resource tracks).
- **Funkystuff** — metadata + multi-file upload to the storage bucket;
  the entry file is what the public list opens.
- **Gallery** — the photo strip. Upload images (backed by the `gallery`
  storage bucket), set captions, flip each to live/draft. Sort order =
  left-to-right placement. Layout/speed metadata is automatic (see
  AGENTS.md).
- **Collections** — the six repo JSON collections (`site`, `nav`, `team`,
  `projects`, `resources`, `achievements`) as one editable JSON blob per
  key. A row is the source of truth for its key once it exists; **Delete
  row** resets back to the repo file; **Seed from repo** pre-fills the
  editor with the file's current contents.
- **Featured** — the four curated lists with **drag-to-reorder**. Array
  order = display order, exactly like `site.json` before. `featured.projects`
  stays capped at 3 (the home grid is tuned for it).

**Sign-in UX**: login boxes with messages for each failure mode — wrong
credentials, unconfirmed email, non-admin account, or a build without
the publishable key injected. Because email confirmation is **enabled**
on this project (`auth.mailer_autoconfirm = false`), a brand-new account
must confirm its email before it can sign in; the login error explains
this instead of the raw GoTrue error, and the auto "Signed out." toast
never clobbers the real reason.

**Publishing**: edits are saved to Supabase immediately, but the public
site is static — run `node scripts/build.js` (locally or in CI) to
regenerate `public/` from the database. Drafts are invisible everywhere;
flipping to live + rebuild publishes.

## 6. Local development without Supabase

No `.env`, no problem: the build uses the local `content/` files and
behaves byte-identically to before the backend existed. If Supabase is
configured but unreachable, the build prints a warning and falls back
to local content rather than failing — you always get a site.

## 7. Deployment (GitHub + Cloudflare Pages)

- Build command: `npm run build` (or `node scripts/build.js`).
- Output directory: `public`.
- Env vars in the Pages project: `SUPABASE_URL`,
  `SUPABASE_SECRET_KEY` (build-time only). Mark the secret key
  as **secret**; it is consumed by the build and never appears in the
  bundle or pages. `SUPABASE_PUBLISHABLE_KEY` is only needed if the Pages
  build environment differs from local — it is embedded into
  `public/admin/` at build time either way. (The legacy
  `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` names are accepted
  as fallbacks.)

## 8. Testing

```bash
node scripts/mock-supabase-test.js   # 32 integration checks, no real Supabase needed
node scripts/build.js                # local-mode build (offline mode)
node scripts/import-content.js --dry-run
```

The mock test spins a fake PostgREST + storage server and drives the
**real** import and build scripts through it, asserting: DB content
renders, drafts never leak (pages nor listings), markdown keeps the
site styling and is sanitized, funkystuff files land at their public
URLs, **DB collections override the repo JSON (site/nav/team/… via
shallow per-key merge) and DB gallery items + files beat the local
folder**, featured ordering is preserved, the admin bundle carries the publishable
key and no secret, and the secret key appears in no file under `public/`.

## 9. Where the code lives

```
supabase/migrations/001_init.sql   schema + RLS + storage (+ gallery_items,
                                   content_collections in 002_gallery_collections.sql)
scripts/lib/supabase-rest.js       build-time REST client (secret key)
scripts/lib/content-source.js      source adapter: Supabase ↔ local files,
                                   markdown render + sanitize, enrichment
scripts/import-content.js          migration (validate → import)
static/admin/{index.html,app.js,admin.css}  admin app (publishable key only)
scripts/mock-supabase-test.js      integration suite
```

`scripts/build.js` consumes `contentSource.loadContent()` and passes
the result to the unchanged template pipeline — that adapter is the
only seam between the backend and the site.

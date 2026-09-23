# DCITC — Dhaka College IT Club website

Static site generator with zero runtime dependencies. Content lives in
`src/data/*.json` + `content/`, layouts in `src/pages/` + `src/partials/`,
styles and scripts in `static/`. The build outputs a fully static site to
`public/`.

**File-driven content:** drop a `.md` file in `content/blog/` or
`content/events/` and it appears on the next build. Drop an image in
`content/gallery/` and it becomes a gallery tile. Same for every other
content type — the file system *is* the content source. No database, no
backend, no admin app. Works on any static host (Vercel, Cloudflare
Pages, GitHub Pages…).

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Build `public/` from source (CSS/JS/HTML are minified by `scripts/lib/minify.js`; `DCITC_NO_MINIFY=1` disables for forensics) |
| `npm run serve` | Static file server for `public/` (zero-dep, defaults to `http://localhost:8080`) |
| `npm run dev` | Watch source + rebuild on change (needs `node` >= 18) |

## Performance

- **Minified output**: every build runs the CSS/JS/HTML through the
  conservative zero-dependency minifiers in `scripts/lib/minify.js`
  (comments + indentation stripped, token semantics preserved). Sizes:
  `main.css` 100→59KB, `app.js` 76→42KB, HTML −30–45%.
- **Non-blocking fonts**: the Google Fonts stylesheet uses
  `media="print" onload` (+ `noscript` fallback) so it never blocks
  first paint; `display=swap` keeps text rendering immediately.
- **Cache headers**: `public/_headers` (Cloudflare Pages) and
  `vercel.json` `headers` (Vercel) long-cache generated art
  (`/img`, `/gallery`, `/content`) and give `/css` `/js` a 1-day
  cache + stale-while-revalidate.
- **Measured** (`/tmp/opencode/perf-audit.js`): home cold transfer
  238→148KB; desktop home LCP 1308→616ms; throttled-mobile home LCP
  1972→~1440ms. Minified-vs-unminified rendering is pixel-identical.

## Centralized content config (`src/config/site.json`)

The site's featured/curated content and its ordering are controlled from
one file: **`src/config/site.json`**. It only *references* content by
slug — it never copies content. Each project/event/article/resource
keeps its single source of truth in its content/data file.

```json
{
  "featured": {
    "projects": ["nodhini", "campusmesh", "voltab"],
    "posts": ["the-journal-now-runs-on-markdown", "reading-man-pages"],
    "resources": [
      "the-c-programming-language",
      "the-missing-semester-of-your-cs-education",
      "linux-journey",
      "operating-systems-three-easy-pieces"
    ]
  },
  "home": {
    "events": ["build-week", "git-and-open-source", "linux-fundamentals-workshop"]
  }
}
```

**What each key controls:**

| Key | Controls | How items are referenced |
| --- | --- | --- |
| `featured.projects` | Home "Featured projects" cards **and** the projects-page "Fresh off the bench" deck (same trio, both pages). | by `slug` (`/projects/<slug>/`) |
| `featured.posts` | Home "Tech Journal" teaser **and** the blog "Start here." Featured section. | by slug (`/blog/<slug>/`) |
| `featured.resources` | Home "Curated resources" grid (home-only). | by `slug` in `resources.json` |
| `home.events` | Home "Upcoming events" list (home-only). Where an event sits on the **events page** is a separate config — see `src/config/events.json` below. | by slug (`/events/<slug>/`) |

**How to change featured content / ordering:**

1. Edit an array in `src/config/site.json` — list the slugs (or resource
   slugs) in the order you want them to appear.
2. Run `node scripts/build.js` (or `npm run build`).

The array order is the display order, so reordering the list reorders
the page. Emptying an array hides that section on the relevant page
without touching any content file.

**Validation:** the build resolves every reference against the actual
content and **fails loudly** if a slug doesn't exist, printing which
reference is bad and what slugs *are* available — so a typo or a deleted
content file is caught at build time, never silently dropped.

**What is NOT in the config:** the actual content and per-item metadata
stay in `content/` (markdown) and `src/data/` (JSON). Per-event status
booleans (upcoming vs. ongoing vs. past) and the active-projects count are
computed from each item's `status`/`date` fields. The `featured` boolean
that used to live in content files was removed — the config is now the
single source of truth for featured selection.

### Content references by type

- **Projects** — `src/data/projects.json`, keyed by `slug`.
- **Blog posts** — `content/blog/*.md`, keyed by filename (minus `.md`).
- **Events** — `content/events/*.md`, keyed by filename (minus `.md`).
- **Resources** — `src/data/resources.json`, keyed by `slug` (added
  alongside each resource's content; unique in the file).

## Events page config (`src/config/events.json`)

Where each event appears on the events page — and in what order — is
controlled from **`src/config/events.json`**. It only *references* event
slugs; the content stays in `content/events/*.md`.

```json
{
  "featured": ["git-and-open-source", "linux-fundamentals-workshop", "build-week"],
  "normal": [
    "first-code-night",
    "networking-deep-dive",
    "ctf-beginner-track",
    "orientation-2026"
  ]
}
```

- **`featured`** — events rendered in the collapsing deck section. The
  **first slug** is the initially expanded card (matching the old
  "newest upcoming is expanded" behavior — the config author decides).
- **`normal`** — every other event, rendered as rows underneath. An
  event in `normal` may be `upcoming`, `ongoing` **or** `past` — its
  row's status chip comes from the frontmatter `status` field, which
  answers *what* the event is, not *where* it sits.
- **Array order is display order.** Reordering an array reorders that
  section; moving a slug between `featured` and `normal` moves the event
  without touching its Markdown file or any HTML.
- **Validation (the build enforces it):**
  - a slug that matches no event → **hard error** that prints the
    available slugs (catches typos at deploy time, never silently drops
    an event),
  - a slug listed twice in one section → **hard error**,
  - a slug in **both** sections → **hard error** (an event would render
    twice),
  - an event on disk but in neither section → **warning** — it still
    builds its own `/events/<slug>/` page, it just won't be listed on
    the index. Add the slug to a list to show it.
  - a `past` event in `featured` → **warning** (it sits in the deck
    labelled "Upcoming").

**What an event's `status` still controls:** the row/badge chips
(`upcoming`/`ongoing`/`past`), the event single page, sorting of the
home list — and nothing about placement on the events page.

To add an event: drop `content/events/<slug>.md`, add `<slug>` to one of
the lists above, build. To move it: edit the list. Done.

## Structure

```
scripts/
  build.js     template engine + asset pipeline (reads content/, src/data/, src/config/)
  serve.js     static server with directory-index resolution
  dev.js       watch + rebuild
  lib/
    content-source.js   file-system content loader (markdown → HTML, enrichment)
    minify.js           zero-dependency minifiers for build output (CSS/JS/HTML)
src/
  config/      central content-selection config (featured/ordering + events page placement)
  data/        content collections (site, nav, projects, resources, team, …)
  pages/       page templates (home, about, projects, blog, …)
  partials/    head, header, footer, scripts
static/
  css/         tokens → type → layout → nav → horizontal → components → pages → anim
  js/          theme, horizontal, transitions, reveal, pages, navigate,
               music-player, fluid-triangle, gallery, main (+ vendored libs)
public/        build output (everything below is generated, do not edit)
```

> `navigate.js` turns internal links into soft navigations (fetch + DOM swap
> preserving `<body>`-level chrome), so the music player (`music-player.js`,
> a hardcoded-YouTube-playlist card) keeps playing across page changes. The
> player playlist lives in the `TRACKS` array at the top of that file — add
> songs there and rebuild. `main.js` splits boot (one-time) vs page (re-runs
> on every load and every soft-nav swap); page-scoped modules must stay
> re-runnable without stacking document/window listeners (see `bindOnce` /
> `bindScope` in navigate.js).

## Editing content

Content is file-driven — drop files in a content folder and rebuild; the
items appear automatically:

- `content/blog/*.md` → Tech Journal posts
- `content/events/*.md` → events calendar (placement on the events page
  is set by slug in `src/config/events.json` — see above)
- `content/gallery/*` (jpg/png/webp/gif/svg) → gallery strip (optional
  `captions.json` sidecar overrides captions)
- `content/team/<batch>/<seed>.<ext>` → real member photos (auto-detected)
- `funkystuff/*.html` + an entry in `src/data/funkystuff.json` → game shelf
- `src/data/*.json` → the structured collections (site, nav, team, projects,
  resources, achievements, pages, funkystuff manifest). Each collection is a
  flat array of objects; the engine exposes every item's fields as `.field`
  and computes a few helpers (`.n` = 1-based index, `.slug`, `.url`,
  `.isActive` for the current page).
- `src/config/site.json` → featured/curated selections + ordering by slug
- `src/config/events.json` → events page placement (featured deck / normal
  rows) by slug

> JSON cannot carry comments, so every data file is documented here.
> Field-level behaviour (codes, urls, thumbs, status booleans…) is added
> in `scripts/lib/content-source.js` (markdown) and the "enrichment"
> functions of `scripts/build.js` (JSON collections).

> Publishing blog posts or events? Read **`way.md`** — the step-by-step
> content guide.

## Markdown blog (`content/blog/`) and events (`content/events/`)

The Tech Journal and the events calendar share the same authoring model:
one Markdown file per item, filename (minus `.md`) **is** the slug
(`/blog/<slug>/`, `/events/<slug>/`). YAML frontmatter carries metadata;
the body is converted to HTML by `marked` at build time.

Blog post frontmatter:

```markdown
---
title: "My New Article"        # required
date: "2026-08-24"             # required — newest first sorting
description: "Short summary."  # card + article subtitle
author: "Your Name"            # default "DCITC"
role: "Study group lead"       # byline detail, default "Contributor"
category: "Linux"              # chip; defaults to first tag
tags:
  - Linux
  - CLI
image: /img/blog/photo.png     # cover; default = generated plate /img/gen/<slug>.svg
draft: true                    # skipped entirely — never published
---
```

Event frontmatter (`title`/`date`/`status` required; status must be
`upcoming`, `ongoing` or `past`):

```markdown
---
title: "Linux Fundamentals Workshop"
date: "2026-09-18"
status: upcoming               # chip/badge state — placement is set in src/config/events.json
subtitle: "Card text."         # deck card + row
description: "Short brief."    # detail page fallback when no body
location: "Lab 4"
duration: "3 hours"
level: "Beginner"
speaker:
  name: "Arif Chowdhury"
  role: "Systems study group lead"
program:
  - time: "14:00"
    title: "Why the shell"
resources:
  - Linux
register: "Seats are limited."
---

Optional long-form writeup in markdown — renders in the About plate of
the event page. Without a body the short `description` is shown.
```

Workflow: drop a file → add its slug to `featured` or `normal` in
`src/config/events.json` → `node scripts/build.js`. Detail-page codes
(EVENT.xx) and the home list sort newest first (ties: slug asc). Deleting
a `.md` removes its page on the next build (the build wipes `public/`
wholesale). Drafts are dropped before anything runs. Blog images can live
anywhere under `static/` — e.g. `static/img/blog/` served at
`/img/blog/…` — and should be referenced with absolute URLs so they
resolve from nested `/blog/<slug>/` pages.

Dependencies added for this: `marked` (Markdown→HTML) and `js-yaml`
(frontmatter parsing). Nothing else changed about the pipeline.

### Gallery (`content/gallery/`)

The gallery page is a photo strip driven entirely by folders — **no JSON
to touch**. Drop any image file (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`,
`.svg`) into `content/gallery/` and rebuild; it becomes a gallery tile
automatically and is served from `/gallery/<filename>`.

- **Layout is auto-assigned.** The build cycles tiles through a fixed
  mixed-size pattern (big / normal / small × orientation) and assigns each
  a parallax `data-speed` of 1–3, so the strip keeps its scattered,
  layered look no matter how many (or few) images exist.
- **Captions** default to the filename with `-`/`_` → spaces, title-cased
  (`my-session.svg` → "My Session"). To override, add an optional
  `content/gallery/captions.json` mapping `{ "<filename>": "caption" }`
  (it's not copied to `public/`).
- **URL-unsafe filenames** (anything but letters/digits/`-`/`_`/`.`) fail
  the build loudly, since the filename becomes the served path and alt text.
- **Deleting** an image removes its tile on the next build (the build
  wipes `public/` wholesale).

Behavior: on desktop (≥900px) the gallery is a wide filmstrip section that
scrolls with the page's own horizontal scroller; tiles reveal in a cascade,
drift at their own parallax speed while panning, and click-to-zoom briefly
scales a tile 5× then re-cascades. No grayscale (user preference). Below
900px the strip becomes a self-contained touch-scrollable row.

### Funkystuff game library (`funkystuff/`)

The project-root `funkystuff/` folder holds standalone `.html` files
(games, demos, toys). `src/data/funkystuff.json` is the listing
manifest — one entry per item you want on `/funkystuff/`, a vertical
library page with doc-style department filters and a divided list.
Each entry assigns the display fields yourself:

```json
{ "file": "line-runner.html", "title": "Line Runner",
  "dept": "Games", "by": "Tahmid Ahmed Shofol" }
```

- `file` (required) must exist in the folder; the build throws if not
- `title` and `dept` are required (`dept` drives the filter chips)
- optional `by` renders the author byline
- JSON order = list order

Every `.html` in the folder is copied verbatim to
`public/funkystuff/<file>` regardless of listing, so rows can open
games in a new tab. Unlisted files are copied but not shown (the build
warns); filenames must be URL-safe. Games are standalone pages outside
the template engine — edit them directly; site-owned assets they may
use are the vendored `/js/vendor/three.min.js` and
`/js/vendor/anime.min.js`.

### Data file reference (`src/data/`)

| File | Controls | Consumed by |
| --- | --- | --- |
| `site.json` | Global identity: name, short name ("DCITC"), wordmark, tagline, statement, founding year, email, locations, logo path/alt, social links (footer EXTERNAL + contact channels), meta (language/domain), and `facts` — the EST./MEMBERS/PROJECTS stat pairs shown on the home hero, about intro and home identity section. | header.html (brand), footer.html (statement/socials/©), head.html (og:site_name), index/about/contact pages |
| `nav.json` | The single source of truth for navigation. Each item: `label`, `href`, `match` (URL rule used by `navFor()` to compute active state: `/` exact, trailing `*` = prefix, otherwise exact-or-subpage), `code` (the "01"–"10" mono prefix), `group` (`primary` → inline header link, `more` → "More" dropdown; everything appears in the mobile drawer), `cta: true` marks the accent button (Join). | header.html via `navFor()` |
| `pages.json` | The page registry. One entry per top-level page: which template file renders it (`file`), where it's written (`out`, directory-style), canonical `url`, `<title>`/`desc` meta, display `code` (shown in the footer kicker), `section` label, `horizontal` flag. Order here does not matter for nav (that's nav.json) but documents the sitemap. | build.js `buildPage()` loop |
| `projects.json` | Project portfolio. Key fields per item: `slug` (→ `/projects/<slug>/` + generated cover art seed), `title`, `tagline`, `status` (active/past…), `year`, `category`, `stack[]` (chips), `summary`, `problem`, `approach[]` (numbered at build), `metrics[{k,v}]`, `result`, `notes`, `team[{name,role}]`, `capabilities[]`, `links{github,demo}`. Featured/ordering is set in `src/config/site.json` (`featured.projects`), not here. | projects.html, project.html, home featured |
| `events.json` | *(removed)* — events are Markdown files now. See "Markdown blog (`content/blog/`)" below — events use the same pipeline via `content/events/`. | — |
| `posts.json` | *(removed)* — the Tech Journal is no longer mock JSON. See "Markdown blog (`content/blog/`)" below. | — |
| `team.json` | Team groups (e.g. Executive Committee, Core). Each group: `name`, `note`, `members[]` with `name`, `role`, `seed` (avatar art key → `/img/gen/av-<seed>.svg`), `note`, `tags[]`. Roles drive the about-page carousel filter (President, VP, General Secretary, Technical Lead). team.html renders one section per group automatically. | team.html, about.html carousel |
| `achievements.json` | Milestone timeline. Each entry: `year`, `summary`, `items[{title,detail}]`. Rendered twice on achievements.html (vertical timeline + expandable record) and summarized on the home spark section. | achievements.html, home |
| `resources.json` | Curated knowledge base. Per item: `slug` (unique key, referenced by the home config), `title`, `category` (must match a CATEGORIES entry in build.js for filtering), `kind` (book/doc/tool…), `level`, `tag`, `description`, `link`. Featured/ordering is set in `src/config/site.json` (`featured.resources`), not here. | resources.html, home |
| `gallery.json` | *(removed)* — the gallery is no longer JSON-driven. See "Gallery (`content/gallery/`)" below. | — |
| `funkystuff.json` | Toy/game library manifest (see "Funkystuff game library" above). Per entry: `file` (must exist in `<root>/funkystuff/`), `title`, `dept` (filter chips), optional `by`; JSON order = list order. | funkystuff.html |

To swap the logo: put a file in `static/img/` and set `site.logo.path`.

## Template syntax

- `{{ .field }}`, `{{ .a.b }}` — field access
- `{{ each .projects }} … {{ end }}` — iterate an array
- `{{ if / if not / if eq .x "v" }} … {{ else }} … {{ end }}`
- `{{ if and (eq .a "x") (ne .b "y") }}` — logical helpers: `and`, `or`, `not`,
  `eq`, `ne`, `gt`, `lt`
- `{{ include "partials/head.html" }}` — partial include
- Helpers (single-argument only): `fmtDate`, `fmtDateLong`, `fmtYear`,
  `upper`, `len`, `readingTime`

Precompute values in `build.js` if a field needs more than one helper call.

## Design system

- Dark-first; accent `#4fd1a5` (dark) / `#157a5b` (light). Toggle persists in
  `localStorage` and never causes a flash (`data-theme` is set inline in
  `<head>`).
- Space Grotesk / Inter / JetBrains Mono (Google Fonts).
- Horizontal browsing on viewports ≥ 900px: `main[data-horizontal]` scrolls
  horizontally via wheel, keyboard, or drag with gentle inertia easing (no
  snap — deliberately removed); below 900px it falls back to a normal vertical
  page and the nav collapses to a drawer.
- `prefers-reduced-motion: reduce` disables scroll animations, reveals, and
  parallax; all content stays readable without JS.
- Procedural SVG generation (logo, favicon, gallery plates, avatars) means no
  binary assets to maintain.

## Migrating to Hugo

This project mirrors Hugo's conventions so migration is mechanical:

- `src/data/*.json` → `content/*` + `data/` (front matter + page bundles)
- `src/pages/*.html` → `layouts/_default/*.html`
- `src/partials/*.html` → `layouts/partials/*.html`
- `static/` → `static/` (unchanged)

The template syntax maps cleanly to Go templates: `{{ each }}` → `{{ range }}`,
`{{ if eq }}` → `{{ if eq }}`, `{{ include }}` → `{{ partial }}`. The horizontal
scroller, theme system, and CSS/JS are pure static assets and carry over as-is.
# way.md — how to publish blog posts and events

Everything you need to know to add content to the DCITC site without
touching a single HTML file. One Markdown file per post/event, run the
build, done.

```
content/
├── blog/      ← Tech Journal articles  →  /blog/<slug>/
└── events/    ← events calendar        →  /events/<slug>/
```

**The three commands that matter**

```bash
node scripts/build.js                              # build → public/
python3 -m http.server 8080 --directory public     # preview at localhost:8080
```

Rebuild after every edit — the dev server does NOT hot-reload. The build
wipes and regenerates `public/` from scratch every time, so you never get
stale leftovers.

---

## 1. The golden rules

| Rule | Why |
| --- | --- |
| The **filename is the URL**, forever. | `my-post.md` becomes `/blog/my-post/`. Pick a name you still like in five years; changing it later breaks links. |
| Filenames must be lowercase letters, digits, hyphens. Start with a letter or digit. | The build throws on anything else — it refuses to ship ugly URLs like `/blog/My Post (final)/`. Use `reading-man-pages`, never `Reading Man Pages.md`. |
| Files starting with `_` are ignored. | Handy for notes/draft scraps: `_ideas.md` will never publish. |
| One topic = one file. | Each file is exactly one page. |
| Never edit anything in `public/`. | It is generated output; your changes get wiped next build. |

---

## 2. Writing a blog post

### 2.1 Create the file

`content/blog/my-new-article.md`

### 2.2 Full anatomy (copy-paste starter)

```markdown
---
title: "My New Article"
date: "2026-08-24"
description: "One sentence that sells the article in listings."
author: "Your Name"
role: "Study group lead"
category: "Linux"
tags:
  - Linux
  - CLI
draft: false
---

Opening paragraph — the hook. Cards show the description; the page shows
this.

## First section

Body text with **bold**, *italic*, [links](https://example.com) and
`inline code`.

```bash
echo "fenced code blocks render in the site's terminal style"
```

- bullet lists
- work normally

1. numbered lists
2. too

> Blockquotes render with an accent bar.

| Tables | Work |
| ------ | ---- |
| a      | b    |

---

Closing paragraph or call to action.
```

### 2.3 Frontmatter field reference

**Required** — the build fails loudly without them:

| Field | Format | Notes |
| --- | --- | --- |
| `title` | string | Shown as the article `<h1>` and on cards. |
| `date` | `"YYYY-MM-DD"` | ISO format, quoted. Drives sorting AND the display code (see §6). |

**Optional** — sensible defaults, add only when needed:

| Field | Default | What it does |
| --- | --- | --- |
| `description` | empty | Short text shown on the home teaser, blog index cards and archive cards. Also becomes the meta description. Write it — it is the only thing most people read before deciding to click. |
| `author` | `"DCITC"` | Byline name. |
| `role` | `"Contributor"` | Byline detail after the author ("BY NAME · ROLE"). |
| `category` | first tag, else `"Journal"` | The accent chip on cards. Keep values short and consistent across posts ("Linux", "Web", "Systems", "Meta"…). |
| `tags` | `[]` | List of chips rendered at the end of the article. |
| `image` | generated plate `/img/gen/<slug>.svg` | Custom cover art. See §5. |
| `draft` | `false` | `true` = invisible everywhere. See §7. |

> **Featured is config, not a frontmatter field.** Home-page and blog
> "Featured" selection/ordering is set in `src/config/site.json`
> (`featured.posts`, list of slugs in display order) — NOT via a
> `featured` flag in the `.md` file. To feature a post, add its filename
> slug to that array and rebuild. See README "Centralized content
> config".

Minimal valid post — this alone builds fine:

```markdown
---
title: "Hello World"
date: "2026-09-01"
---

Content here.
```

### 2.4 Body writing guidelines

- **Do NOT start the body with `# H1`** — the template already renders
  your frontmatter `title` as the page's single `<h1>`. Start at `##`.
- Reading time is auto-computed from word count (~200 wpm) — no need to state it.
- Fenced code blocks: use them freely; they render as bordered
  terminal-style boxes with a language-agnostic monospace look. Tag the
  language (`bash`, `js`, `py`) for clarity even though there is no
  syntax coloring.
- Long code lines scroll horizontally inside their box instead of breaking layout.
- Horizontal rules (`---`) render as hairlines — nice between major parts,
  don't sprinkle them everywhere.
- Absolute internal links work from any depth: link to another post as
  `[text](/blog/other-slug/)`.

---

## 3. Writing an event

Same model as blog posts, plus a few structured fields because the site
renders event data as components (deck card, status badge, program
timeline).

### 3.1 Full anatomy

`content/events/linux-fundamentals-workshop.md`

```markdown
---
title: "Linux Fundamentals Workshop"
date: "2026-09-18"
status: upcoming
subtitle: "From double-click to the shell: files, permissions, pipes."
description: "A hands-on session for first-years who have never opened a terminal."
location: "Lab 4, Computer Science Building"
duration: "3 hours"
level: "Beginner"
speaker:
  name: "Arif Chowdhury"
  role: "Systems study group lead"
program:
  - time: "14:00"
    title: "Why the shell"
  - time: "14:30"
    title: "Files, permissions, processes"
resources:
  - Linux
  - Dev Tools
register: "Notify the club page — seats are limited to 24."

Optional long-form writeup here (markdown). Shows in the About plate of
the event page.
---
```

### 3.2 Frontmatter field reference

**Required:**

| Field | Format | Notes |
| --- | --- | --- |
| `title` | string | Page `<h1>` + card titles. |
| `date` | `"YYYY-MM-DD"` | Drives ordering and codes. For multi-day events use the START date. |
| `status` | `upcoming` \| `ongoing` \| `past` | Exactly these three words, lowercase, no quotes needed (quotes fine too). Controls everything about WHERE the event appears: |

| `status` | Appears in | Badge says |
| --- | --- | --- |
| `upcoming` | Home list + events-page collapsing deck | `upcoming` |
| `ongoing` | events-page "Ongoing series" section | `ongoing` |
| `past` | events-page Archive grid | `done` |

Flip the status as reality happens — that is the whole update process.
The FIRST upcoming event by date order ships as the expanded card in the
collapsing deck.

**Optional:**

| Field | What it does |
| --- | --- |
| `subtitle` | Deck/archive card text. Punchy one-liner. |
| `description` | Short brief. Shown on the detail page ONLY when there is no markdown body — so always fill it, it keeps working as fallback. |
| `location` · `duration` · `level` | The four-cell meta row on the event page (with Date). |
| `speaker` | `name` + `role`, rendered as the big speaker datum. Use `name: "—"` for events with deliberately no speaker (see First Code Night). |
| `program` | Timeline rows `{time, title}`. Time strings are free-form: `"14:00"`, `"Fri 09:00"`, `"Wk 3"` all fine. |
| `resources` | Track-name chips (match the resources-page categories when possible: Linux, Web, Security, Systems, Programming, Dev Tools…). |
| `register` | Registration note rendered in an accent box. Past events: `"Closed."` |
| `draft` | Same as blog — `true` hides the event entirely. Useful while negotiating dates with venues. |

### 3.3 The markdown body

Optional. If present it becomes the long-form writeup inside the About
plate of the event page (headings, lists, tables, quotes, code — all
styled). Good uses:

- what to bring / prerequisites,
- judging criteria for hackathons,
- post-event recap with a results table.

Keep bodies short — the event page is a horizontal-scroll section and
very tall content gets clipped on small laptop screens. A few paragraphs
or one table max.

No body? Nothing breaks: the page falls back to the `description`
paragraph.

---

## 4. Markdown cheat sheet (both systems)

| You type | You get |
| --- | --- |
| `## Heading` / `### Heading` | Section headings |
| `**bold**` / `*italic*` / `~~strike~~` | bold / italic / strikethrough |
| `` `code` `` | accent-tinted inline code chip |
| ```` ```lang ```` fence | terminal-style code box |
| `- item` / `1. item` | themed bullet / zero-padded numbered lists |
| `> quote` | accent-barred blockquote |
| `\| a \| b \|` rows | styled table |
| `![alt](/img/blog/x.png)` | rounded, bordered image |
| `[text](https://…)` | accent underlined link |
| `---` alone on a line | hairline divider |

YAML gotchas:

- Quote any string containing a colon: `subtitle: "Why: the shell"` —
  unquoted colons break YAML parsing (the build tells you which file).
- Quote strings starting with special chars (`*`, `&`, `>`).
- Dates: quote them (`date: "2026-08-24"`) — unquoted dates work but
  quoted is safer and consistent.
- Indentation is 2 spaces, tabs forbidden.

---

## 5. Images & covers

- **Cover** (cards + article header): default is a generated SVG plate
  unique to your slug — zero effort, looks native. To use real imagery:
  1. drop the file under `static/img/blog/<your-slug>/cover.png`
     (events: `static/img/events/<your-slug>/`),
  2. set `image: /img/blog/<your-slug>/cover.png` in frontmatter.
- Paths must be **absolute** (`/img/...`) — relative paths break on
  nested URLs like `/blog/my-post/`.
- Inline images anywhere in the body: `![Alt text](/img/blog/slug/pic.png)`.

---

## 6. Ordering, codes and rotation (how the site stays tidy)

You never assign numbers. The build sorts by **date, newest first**
(ties broken alphabetically by slug) and then assigns display codes:

- newest post → `ART.01`, next → `ART.02`, …
- newest event → `EVENT.01`, …

Consequences worth knowing:

- Codes are positional. Publishing something newer shifts older items'
  codes — nobody needs to care, nothing links numerically.
- Featured posts: the home teaser and blog Featured row show exactly the
  slugs listed under `featured.posts` in `src/config/site.json`, in that
  order. To feature a post, add its slug (filename minus `.md`) there and
  rebuild. There is **no** per-post `featured` flag anymore.
- The events deck ships expanded on the **latest-dated** upcoming event
  (upcoming events are ordered newest-first). Set realistic dates and it
  picks right; flip statuses as time passes.
- Home-page lists and every listing re-sort themselves on every build.

---

## 7. Drafts

```yaml
draft: true
```

A drafted file is skipped BEFORE anything runs: no page generated, absent
from every listing, doesn't count toward reading-time stats or codes.
Flip to `draft: false` (or delete the line) to publish. Drafts are also
how you stage content during a meeting without blocking other builds.

---

## 8. Editing & deleting

- **Edit**: change the `.md`, rebuild. That's it.
- **Delete**: remove the `.md`, rebuild. The build wipes `public/`
  wholesale each run, so the page, its entry in listings, its generated
  cover plate seed — everything disappears together. No manual cleanup,
  ever.
- Renaming a file = new URL. If the old URL was shared anywhere, keep a
  tiny stub post at the old slug linking onward, or accept the break.

---

## 9. Troubleshooting — build errors mean what they say

| Error | Meaning / fix |
| --- | --- |
| `has no ---frontmatter--- block` | File must START with a line containing exactly `---`, then metadata, then another `---` line, THEN the body. |
| `invalid frontmatter YAML` | Typo in YAML — usually an unquoted colon or a tab character. The message names the file. |
| `missing required frontmatter "title"/"date"/"status"` | Add the field. |
| `unparsable date` | Use `"YYYY-MM-DD"`. |
| `status must be upcoming\|ongoing\|past` | Exact lowercase word, no synonyms. |
| `filename must be lowercase-hyphenated` | Rename the file; it becomes the URL. |

If the build succeeds, the site is correct — the pipeline validates
itself rather than shipping junk.

---

## 10. Pre-publish checklist

- [ ] Filename is clean, lowercase-hyphenated, meaningful (it IS the URL).
- [ ] `title`, `date` present (event: also `status`).
- [ ] `description` written — it's the sales pitch on cards.
- [ ] Event `status` reflects reality today, and `register` isn't stale.
- [ ] No `# H1` at the top of the body.
- [ ] Image paths absolute (`/img/...`).
- [ ] `node scripts/build.js` runs green, spot-check `localhost:8080`.

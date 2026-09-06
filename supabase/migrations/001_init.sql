-- =====================================================================
-- DCITC CONTENT BACKEND — initial schema + security
-- =====================================================================
-- Apply via:  supabase db push   (or paste into the SQL editor)
--
-- MODEL
--   auth.users                Supabase Auth (signups disabled for public)
--   profiles                  1:1 with auth.users; is_admin flag
--   posts                     Tech Journal (content/blog/*.md)
--   events                    Events calendar (content/events/*.md)
--   funkystuff_items          listing manifest (src/data/funkystuff.json)
--   funkystuff_files          storage object index for a project's files
--   site_config               centralized featured/home-events config
--
-- SECURITY MODEL
--   anon (public visitor)  → SELECT published (non-draft) rows only
--   authenticated admin    → full CRUD on content
--   authenticated non-admin → nothing (RLS denies by default)
--
--   draft rows are NEVER readable by anon — enforced here, in the
--   database, not in the frontend. Frontend checks are UI-only.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: who is an admin
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- a user may read their own profile (the admin UI uses it for gating UI)
create policy "read own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

-- ONLY a current admin may grant/revoke admin. No self-service elevation:
-- brand-new users get is_admin=false (trigger below) and can never flip it.
create policy "admins manage profiles"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- auto-create a non-admin profile for every new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_admin(): single point of truth for "can write content".
-- Public signups are disabled (config: Disable new user signups); the
-- first admin account is created in the dashboard and flagged by hand:
--   update public.profiles set is_admin = true where email = 'you@…';
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- posts  (Tech Journal)
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  date             date not null,
  description      text not null default '',
  author           text not null default 'DCITC',
  role             text not null default 'Contributor',
  category         text,
  tags             jsonb not null default '[]'::jsonb,
  image            text,
  content_markdown text not null default '',
  draft            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint posts_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint posts_title_len check (char_length(title) between 1 and 300)
);

alter table public.posts enable row level security;

create policy "public reads published posts"
  on public.posts for select to anon, authenticated
  using (draft = false);

create policy "admins read all posts"
  on public.posts for select to authenticated
  using (public.is_admin());

create policy "admins insert posts"
  on public.posts for insert to authenticated
  with check (public.is_admin());

create policy "admins update posts"
  on public.posts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete posts"
  on public.posts for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- events  (events calendar — structured fields preserved as JSONB)
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  date        date not null,
  status      text not null default 'upcoming',
  subtitle    text not null default '',
  description text not null default '',
  location    text,
  duration    text,
  level       text,
  speaker     jsonb not null default '{}'::jsonb,  -- { name, role }
  program     jsonb not null default '[]'::jsonb,  -- [{ time, title }]
  resources   jsonb not null default '[]'::jsonb,  -- [track names]
  register    text,
  content_markdown text not null default '',       -- optional long-form body
  draft       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_slug_shape check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint events_status_valid check (status in ('upcoming','ongoing','past')),
  constraint events_title_len check (char_length(title) between 1 and 300)
);

alter table public.events enable row level security;

create policy "public reads published events"
  on public.events for select to anon, authenticated
  using (draft = false);

create policy "admins read all events"
  on public.events for select to authenticated
  using (public.is_admin());

create policy "admins insert events"
  on public.events for insert to authenticated
  with check (public.is_admin());

create policy "admins update events"
  on public.events for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete events"
  on public.events for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- funkystuff  (standalone games/toys library)
-- ---------------------------------------------------------------------
-- Metadata lives in the DB; the FILES (single .html or a directory of
-- assets) live in Supabase Storage under bucket `funkystuff`,
-- object key = <slug>/<path>. The build downloads them verbatim.
create table if not exists public.funkystuff_items (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- storage folder name
  title       text not null,
  dept        text not null,                      -- filter chip
  by          text not null default '',           -- author byline
  entry_file  text not null default 'index.html', -- file to open (within the slug folder)
  sort        integer not null default 0,         -- list order (lower first)
  draft       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint funkystuff_slug_shape check (slug ~ '^[a-z0-9][a-z0-9._-]+$'),
  constraint funkystuff_title_len check (char_length(title) between 1 and 200),
  constraint funkystuff_dept_len check (char_length(dept) between 1 and 60)
);

alter table public.funkystuff_items enable row level security;

create policy "public reads published funkystuff"
  on public.funkystuff_items for select to anon, authenticated
  using (draft = false);

create policy "admins read all funkystuff"
  on public.funkystuff_items for select to authenticated
  using (public.is_admin());

create policy "admins insert funkystuff"
  on public.funkystuff_items for insert to authenticated
  with check (public.is_admin());

create policy "admins update funkystuff"
  on public.funkystuff_items for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins delete funkystuff"
  on public.funkystuff_items for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- site_config  (centralized featured/curated selection — one row)
-- ---------------------------------------------------------------------
-- Replaces src/config/site.json as the SOURCE OF TRUTH once the
-- backend is live. Shape mirrors site.json exactly:
-- {
--   "featured": { "projects": [...], "posts": [...], "resources": [...] },
--   "home":     { "events": [...] }
-- }
-- Array ORDER is the display order — preserved byte-for-byte, never sorted.
create table if not exists public.site_config (
  id         integer primary key default 1 check (id = 1),  -- singleton
  config     jsonb not null,
  updated_at timestamptz not null default now(),
  constraint site_config_shape check (
    config ? 'featured' and config ? 'home'
  )
);

alter table public.site_config enable row level security;

-- the rendered site only needs config to SELECT featured content, and
-- every selection in it references PUBLISHED content only (the build
-- re-validates), so the shape itself carries no draft data.
create policy "public reads site config"
  on public.site_config for select to anon, authenticated
  using (true);

create policy "admins update site config"
  on public.site_config for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins insert site config"
  on public.site_config for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['posts','events','funkystuff_items','site_config'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- grants (RLS is the real gate; these are belt-and-braces defaults)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.posts, public.events, public.funkystuff_items, public.site_config to anon, authenticated;
-- writes go through RLS-protected policies; explicit grants so the API
-- can attempt them and let RLS decide:
grant insert, update, delete on public.posts, public.events, public.funkystuff_items, public.site_config to authenticated;

-- =====================================================================
-- STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('funkystuff', 'funkystuff', true)
on conflict (id) do nothing;

-- public visitors may DOWNLOAD files of published projects only.
-- Draft-ness is enforced by joining the metadata table: the storage
-- policy checks that the object's top-level folder (the slug) belongs
-- to a non-draft item. Admins bypass via the second policy.
create policy "public downloads published funkystuff files"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'funkystuff'
    and exists (
      select 1 from public.funkystuff_items fi
      where fi.draft = false
        and (storage.foldername(name))[1] = fi.slug
    )
  );

create policy "admins manage funkystuff storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'funkystuff'
    and public.is_admin()
  )
  with check (
    bucket_id = 'funkystuff'
    and public.is_admin()
  );

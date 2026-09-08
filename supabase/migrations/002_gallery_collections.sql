-- =====================================================================
-- DCITC CONTENT BACKEND — 002: gallery + content collections
-- =====================================================================
-- Apply AFTER 001_init.sql (also idempotent — safe to re-run).
--
-- WHAT THIS ADDS
--   gallery_items        photo-strip metadata (content/gallery/*.svg)
--   + `gallery` storage bucket (object key = file name at bucket root)
--   content_collections  the repo JSON collections that were still file-
--                        managed: 'site', 'nav', 'team', 'projects',
--                        'resources', 'achievements' (key → payload).
--                        src/config/site.json stays in site_config (001).
--   profiles backfill    every existing auth.users row gets a profile so
--                        the admin gate can read is_admin for accounts
--                        created before the 001 trigger existed.
--
-- RLS (same shape as 001)
--   anon               reads published gallery items only
--   authenticated admin -> full CRUD on the tables + storage
--   content_collections is PUBLIC-read (all of it ends up in the static
--   site anyway — same rationale as site_config).
-- =====================================================================

-- ---------------------------------------------------------------------
-- gallery_items
-- ---------------------------------------------------------------------
create table if not exists public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  file        text not null unique,               -- filename; served as /gallery/<file>
  caption     text not null default '',
  sort        integer not null default 0,         -- display order (lower first)
  draft       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint gallery_file_shape check (file ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$')
);

alter table public.gallery_items enable row level security;

drop policy if exists "public reads published gallery" on public.gallery_items;
create policy "public reads published gallery"
  on public.gallery_items for select to anon, authenticated
  using (draft = false);

drop policy if exists "admins read all gallery" on public.gallery_items;
create policy "admins read all gallery"
  on public.gallery_items for select to authenticated
  using (public.is_admin());

drop policy if exists "admins insert gallery" on public.gallery_items;
create policy "admins insert gallery"
  on public.gallery_items for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update gallery" on public.gallery_items;
create policy "admins update gallery"
  on public.gallery_items for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete gallery" on public.gallery_items;
create policy "admins delete gallery"
  on public.gallery_items for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- content_collections  (key → jsonb payload; site data is public)
-- ---------------------------------------------------------------------
create table if not exists public.content_collections (
  key         text primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint content_collections_key_valid check (
    key in ('site', 'nav', 'team', 'projects', 'resources', 'achievements')
  )
);

alter table public.content_collections enable row level security;

-- like site_config: everything here ships to the public static site
drop policy if exists "public reads content collections" on public.content_collections;
create policy "public reads content collections"
  on public.content_collections for select to anon, authenticated
  using (true);

drop policy if exists "admins insert content collections" on public.content_collections;
create policy "admins insert content collections"
  on public.content_collections for insert to authenticated
  with check (public.is_admin());

drop policy if exists "admins update content collections" on public.content_collections;
create policy "admins update content collections"
  on public.content_collections for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete content collections" on public.content_collections;
create policy "admins delete content collections"
  on public.content_collections for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- profiles backfill — accounts created before the 001 trigger existed
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, is_admin)
select u.id, u.email, false
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- updated_at maintenance (extend the 001 trigger loop)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['posts','events','funkystuff_items','site_config','gallery_items','content_collections'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------
grant select on public.gallery_items, public.content_collections to anon, authenticated;
grant insert, update, delete on public.gallery_items, public.content_collections to authenticated;

-- =====================================================================
-- STORAGE — gallery bucket (flat filenames at bucket root)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- public DOWNLOAD of published items' files only (filename = object key)
drop policy if exists "public downloads published gallery files" on storage.objects;
create policy "public downloads published gallery files"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'gallery'
    and exists (
      select 1 from public.gallery_items gi
      where gi.draft = false
        and gi.file = storage.filename(name)
    )
  );

drop policy if exists "admins manage gallery storage" on storage.objects;
create policy "admins manage gallery storage"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'gallery'
    and public.is_admin()
  )
  with check (
    bucket_id = 'gallery'
    and public.is_admin()
  );
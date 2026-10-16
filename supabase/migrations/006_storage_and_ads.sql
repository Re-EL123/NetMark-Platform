-- NetMark Platform - migration 006: file uploads (Supabase Storage), adverts
-- and per-entity media columns. Idempotent: safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Storage: a single public bucket holds every uploaded file.
--   products/  companies/  stores/  users/  drivers/  ads/  announcements/  misc/
-- Public read; uploads happen via short-lived signed upload URLs minted by the
-- API using the service-role key, so no storage RLS policy is required.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('netmark', 'netmark', true, 52428800)
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit;
exception when others then
  raise notice 'Could not create storage bucket "netmark" automatically (%). Create it manually in Storage.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Media columns for entities that gain picture/document uploads.
-- ---------------------------------------------------------------------------
alter table public.stores add column if not exists logo text;
alter table public.stores add column if not exists banner text;
alter table public.companies add column if not exists cover_image text;
alter table public.companies add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.stores add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.drivers add column if not exists profile_image text;
alter table public.drivers add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists gallery jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Adverts: platform-managed promotions shown as banners, popups and sections.
--   media_type : image | video | link | none
--   media_url  : uploaded file URL (image/video) OR external URL for link ads
--   placements : banner | popup | section  (an ad may target several)
--   audience   : all | customer | owner | storeOwner | driver | platformAdmin
-- ---------------------------------------------------------------------------
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  media_type text not null default 'image'
    check (media_type in ('image','video','link','none')),
  media_url text,
  link_url text,
  cta_label text,
  placements text[] not null default array['banner']::text[],
  audience text not null default 'all',
  priority integer not null default 0,
  is_active boolean not null default true,
  dismissible boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ads_active_idx on public.ads (is_active);
create index if not exists ads_audience_idx on public.ads (audience);

drop trigger if exists set_updated_at on public.ads;
create trigger set_updated_at before update on public.ads
  for each row execute function public.set_updated_at();

alter table public.ads enable row level security;

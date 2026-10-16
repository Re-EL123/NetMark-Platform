-- NetMark Platform - migration 005: per-company store owner links.
--
-- A store owner may sell products from several companies. Each company is
-- unlocked by that company's code. The link is what grants access: while the
-- code behind a link stays active and unexpired, the store owner's listings of
-- that company's products are visible to customers. When the code expires (or
-- the company disables it) the listings stay in the store owner's panel but are
-- hidden from customers until the store owner links a valid code again.
--
-- Idempotent: safe to run repeatedly against an existing database.

create table if not exists public.company_links (
  id uuid primary key default gen_random_uuid(),
  store_owner_id uuid not null,
  company_id uuid not null,
  code_id uuid,
  code text,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_renewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One link per store owner + company (re-linking renews the same row).
create unique index if not exists company_links_owner_company_key
  on public.company_links (store_owner_id, company_id);
create index if not exists company_links_store_owner_id_idx on public.company_links (store_owner_id);
create index if not exists company_links_company_id_idx on public.company_links (company_id);

drop trigger if exists set_updated_at on public.company_links;
create trigger set_updated_at before update on public.company_links
  for each row execute function public.set_updated_at();

alter table public.company_links enable row level security;

-- Backfill: store owners that already joined a company (via a referral code at
-- registration, or the 004 backfill) keep working. These legacy links carry no
-- code row, so they never expire until the owner links a coded company.
insert into public.company_links (store_owner_id, company_id)
select id, company_id
from public.users
where role = 'storeOwner' and company_id is not null
on conflict do nothing;

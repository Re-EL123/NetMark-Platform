-- ---------------------------------------------------------------------------
-- 017: per-company downline memberships, configurable rank ladder, and the
--      wholesale/retail sourcing toggle for store listings.
--
-- Model
--   * A store owner recruits members *per company* into their downline. The
--     relationship lives in company_memberships (company_id + user_id +
--     sponsor_id) so the same person can sit in several companies' networks.
--   * Every membership gets a permanent member_no (identification number) that
--     never expires; activity can be paused/resumed at any time.
--   * Ranks form a cumulative ladder (Basic → Crown Ambassador). Thresholds are
--     admin-configurable in the `ranks` table; promotion never demotes.
--   * Volume is measured in BV (business volume) = net-of-VAT ZAR. personal_bv
--     and group_bv accumulate lifetime for rank; personal_period_bv and
--     group_period_bv reset each calendar month for bonus eligibility.
--   * store_products.mode selects how a store owner sources a listing:
--       'add'       – no upfront buy; they earn (retail - wholesale) per sale
--       'wholesale' – they prepay via /purchases and keep the full retail
-- ---------------------------------------------------------------------------

create table if not exists public.ranks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  level integer not null default 0,
  min_personal_bv numeric not null default 0,
  min_group_bv numeric not null default 0,
  min_personal_period_bv numeric not null default 0,
  retail_override_percent numeric not null default 0,
  monthly_bonus_zar numeric not null default 0,
  leadership_pool_percent numeric not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ranks_level_idx on public.ranks(level);

insert into public.ranks
  (name, slug, level, min_personal_bv, min_group_bv, min_personal_period_bv,
   retail_override_percent, monthly_bonus_zar, leadership_pool_percent, sort_order)
values
  ('Basic Store Owner',   'basic',             0,      0,       0,      0,  0,    0, 0, 0),
  ('Bronze',              'bronze',            1,   1000,    5000,    500,  2,    0, 0, 1),
  ('Silver',              'silver',            2,   2500,   15000,   1000,  3,    0, 0, 2),
  ('Gold',                'gold',              3,   5000,   40000,   2000,  4,  250, 1, 3),
  ('Platinum',            'platinum',          4,  10000,  100000,   4000,  5,  750, 2, 4),
  ('Diamond',             'diamond',           5,  25000,  300000,   8000,  6, 2000, 3, 5),
  ('Crown Ambassador',    'crown-ambassador',  6,  50000, 1000000,  15000,  7, 5000, 5, 6)
on conflict (slug) do nothing;

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  sponsor_id uuid references public.users(id) on delete set null,
  member_no text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'suspended', 'terminated')),
  rank_id uuid references public.ranks(id) on delete set null,
  personal_bv numeric not null default 0,
  group_bv numeric not null default 0,
  personal_period_bv numeric not null default 0,
  group_period_bv numeric not null default 0,
  period_key text,
  joined_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  paused_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, member_no)
);
create index if not exists company_memberships_company_idx on public.company_memberships(company_id);
create index if not exists company_memberships_user_idx on public.company_memberships(user_id);
create index if not exists company_memberships_sponsor_idx on public.company_memberships(sponsor_id);
create index if not exists company_memberships_status_idx on public.company_memberships(status);
create index if not exists company_memberships_activity_idx on public.company_memberships(last_activity_at);

-- Sourcing mode for a store listing.
alter table public.store_products add column if not exists mode text not null default 'add';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_products_mode_check'
  ) then
    alter table public.store_products
      add constraint store_products_mode_check check (mode in ('add', 'wholesale'));
  end if;
end $$;

-- A non-uuid dedupe key lets scheduled bonuses stay idempotent without
-- colliding with the uuid ref_id used for order/purchase commissions.
alter table public.commissions add column if not exists dedupe_key text;
create unique index if not exists commissions_dedupe_key_key
  on public.commissions(dedupe_key) where dedupe_key is not null;

-- NetMark Platform - migration 009: tenant plans, code/store pricing, purchases
begin;

-- Plans (platform plans + tenant overrides)
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tier text not null default 'standard',
  base_fee_zar numeric not null default 0,
  per_active_distributor_zar numeric not null default 0,
  min_distributors integer,
  max_distributors integer,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  billing_status text not null default 'active',
  base_fee_zar numeric not null default 0,
  per_active_distributor_zar numeric not null default 0,
  active_distributors_count integer not null default 0,
  next_billing_at date,
  last_billed_at date,
  custom_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id)
);

-- Code pricing
alter table public.distributor_codes add column if not exists price_zar numeric not null default 0;
alter table public.distributor_codes add column if not exists is_for_sale boolean not null default false;
alter table public.distributor_codes add column if not exists purchased boolean not null default false;
alter table public.distributor_codes add column if not exists purchased_by uuid;
alter table public.distributor_codes add column if not exists purchased_at timestamptz;

-- Code purchases
create table if not exists public.code_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  purchaser_id uuid references public.users(id),
  purchaser_email text,
  code_id uuid references public.distributor_codes(id) on delete cascade,
  code text not null,
  price_zar numeric not null default 0,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_method text,
  payment_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store pricing
alter table public.stores add column if not exists price_zar numeric not null default 0;
alter table public.stores add column if not exists is_for_sale boolean not null default false;
alter table public.stores add column if not exists purchased boolean not null default false;
alter table public.stores add column if not exists purchased_by uuid;
alter table public.stores add column if not exists purchased_at timestamptz;
alter table public.stores add column if not exists owned_by_company uuid references public.companies(id);

-- Store purchases
create table if not exists public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  purchaser_id uuid references public.users(id),
  purchaser_email text,
  store_id uuid references public.stores(id) on delete cascade,
  store_name text,
  price_zar numeric not null default 0,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_method text,
  payment_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default plans
insert into public.plans (name, slug, tier, base_fee_zar, per_active_distributor_zar, min_distributors, max_distributors, features, is_active, is_default, sort_order)
values
  ('Starter', 'starter', 'starter', 299, 1.50, 1, 500, '{"users":true,"stores":true,"codes":true}', true, true, 1),
  ('Growth', 'growth', 'growth', 599, 1.00, 501, 2000, '{"users":true,"stores":true,"codes":true,"whiteLabel":true}', true, false, 2),
  ('Scale', 'scale', 'scale', 999, 0.70, 2001, null, '{"users":true,"stores":true,"codes":true,"whiteLabel":true,"api":true}', true, false, 3)
on conflict (slug) do nothing;

commit;

-- NetMark Platform — Supabase (Postgres) schema (COMPLETE)
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
-- This single file builds the entire schema: the base tables plus migrations
-- 002 → 014 consolidated below. It is idempotent — safe to run repeatedly.
-- (The same statements also live under supabase/migrations/ for reference.)
-- The API talks to the database with the service_role key, so RLS is enabled
-- with no policies (deny all) to keep the anon/authenticated keys locked out.

create extension if not exists pgcrypto;

-- ---------- updated_at trigger helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- companies ----------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo text,
  contact jsonb,
  address jsonb,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- users (app profile linked to auth.users) ----------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  phone text,
  role text not null default 'customer'
    check (role in ('platformAdmin','owner','storeOwner','customer','driver')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected')),
  company_id uuid references public.companies(id) on delete set null,
  profile_image text,
  distributor_code text,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_company_id_idx on public.users(company_id);
create index if not exists users_role_idx on public.users(role);

-- ---------- drivers ----------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  is_available boolean not null default false,
  current_location jsonb,
  vehicle_type text,
  vehicle_number text,
  vehicle_model text,
  license_number text,
  license_expiry date,
  bank_details jsonb,
  push_token text,
  rejection_reason text,
  stats jsonb not null default '{"totalDeliveries":0,"totalEarnings":0,"rating":0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drivers_company_id_idx on public.drivers(company_id);
create index if not exists drivers_status_idx on public.drivers(status);

-- ---------- stores ----------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  company_id uuid references public.companies(id) on delete set null,
  distributor_id uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stores_company_id_idx on public.stores(company_id);

-- ---------- products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text,
  price numeric,
  category text,
  company_id uuid references public.companies(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_company_id_idx on public.products(company_id);

-- ---------- store_products ----------
create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_products_store_id_idx on public.store_products(store_id);

-- ---------- orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  assigned_driver_id uuid references public.drivers(id) on delete set null,
  order_status text not null default 'ready',
  delivery_status text not null default 'unassigned'
    check (delivery_status in ('unassigned','assigned','picked_up','in_transit','delivered','failed')),
  delivery_otp text,
  accepted_at timestamptz,
  delivered_at timestamptz,
  delivery_notes text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_company_id_idx on public.orders(company_id);
create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_assigned_driver_id_idx on public.orders(assigned_driver_id);
create index if not exists orders_delivery_status_idx on public.orders(delivery_status);
create index if not exists orders_order_status_idx on public.orders(order_status);

-- ---------- driver_earnings ----------
create table if not exists public.driver_earnings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  amount numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_earnings_driver_id_idx on public.driver_earnings(driver_id);

-- ---------- generic CRUD tables (appointments, payments, distributor codes) ----------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distributor_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','drivers','stores','products','store_products',
    'orders','driver_earnings','appointments','payments','distributor_codes'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();', t, t);
  end loop;
end;
$$;

-- ---------- Row Level Security: lock everything down for anon/authenticated ----------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','drivers','stores','products','store_products',
    'orders','driver_earnings','appointments','payments','distributor_codes'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end;
$$;

-- ===========================================================================
-- Migrations 002 → 014 — consolidated below so this single file builds the
-- complete schema. Every statement is idempotent and safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 002: full role build-out, admin control, PayFast payments, audit, settings,
--      notifications, payouts.
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists status text not null default 'active';
alter table public.users add column if not exists notes text;
alter table public.users add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists store_id uuid;
alter table public.users add column if not exists distributor_id uuid;

alter table public.companies add column if not exists plan text not null default 'standard';
alter table public.companies add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.companies add column if not exists owner_id uuid;
alter table public.companies add column if not exists suspended_reason text;
alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('active', 'inactive', 'suspended'));

alter table public.stores add column if not exists store_owner_id uuid;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.products add column if not exists stock integer not null default 0;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image text;
alter table public.products add column if not exists store_id uuid;
alter table public.products add column if not exists is_active boolean not null default true;

alter table public.orders add column if not exists store_id uuid;
alter table public.orders add column if not exists customer_id uuid;
alter table public.orders add column if not exists distributor_id uuid;
alter table public.orders add column if not exists subtotal numeric not null default 0;
alter table public.orders add column if not exists delivery_fee numeric not null default 0;
alter table public.orders add column if not exists total numeric not null default 0;
alter table public.orders add column if not exists refund_amount numeric not null default 0;
alter table public.orders add column if not exists payment_status text not null default 'unpaid';
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_ref text;
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists address jsonb;
alter table public.orders add column if not exists notes text;
alter table public.orders add column if not exists order_type text not null default 'delivery';

alter table public.payments add column if not exists order_id uuid;
alter table public.payments add column if not exists user_id uuid;
alter table public.payments add column if not exists amount numeric not null default 0;
alter table public.payments add column if not exists status text not null default 'pending';
alter table public.payments add column if not exists provider text not null default 'payfast';
alter table public.payments add column if not exists provider_ref text;
alter table public.payments add column if not exists raw jsonb;

alter table public.appointments add column if not exists user_id uuid;
alter table public.appointments add column if not exists store_id uuid;
alter table public.appointments add column if not exists service text;
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists appointment_time text;
alter table public.appointments add column if not exists status text not null default 'pending';
alter table public.appointments add column if not exists notes text;

alter table public.distributor_codes add column if not exists code text;
alter table public.distributor_codes add column if not exists distributor_id uuid;
alter table public.distributor_codes add column if not exists uses integer not null default 0;
alter table public.distributor_codes add column if not exists max_uses integer;
alter table public.distributor_codes add column if not exists is_active boolean not null default true;
alter table public.distributor_codes add column if not exists expires_at timestamptz;
create unique index if not exists distributor_codes_code_key on public.distributor_codes (code) where code is not null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  company_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_company_id_idx on public.audit_logs (company_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'platform',
  company_id uuid,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists settings_scope_company_key_key
  on public.settings (scope, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  role text,
  company_id uuid,
  type text not null default 'info',
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_read_idx on public.notifications (read);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  driver_id uuid,
  amount numeric not null default 0,
  status text not null default 'pending',
  reference text,
  method text,
  period_start date,
  period_end date,
  notes text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payouts_driver_id_idx on public.payouts (driver_id);
create index if not exists payouts_company_id_idx on public.payouts (company_id);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  audience text not null default 'all',
  company_id uuid,
  created_by uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  store_id uuid,
  product_id uuid,
  user_id uuid,
  company_id uuid,
  rating integer not null default 5,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists reviews_store_id_idx on public.reviews (store_id);

-- ---------------------------------------------------------------------------
-- 003: merge distributor into owner + store-product listing model.
-- ---------------------------------------------------------------------------
update public.users set role = 'owner' where role = 'distributor';
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('platformAdmin','owner','storeOwner','customer','driver'));

alter table public.store_products add column if not exists price numeric;
alter table public.store_products add column if not exists is_active boolean not null default true;
create unique index if not exists store_products_store_product_key
  on public.store_products (store_id, product_id);
create index if not exists store_products_product_id_idx on public.store_products(product_id);
create index if not exists store_products_company_id_idx on public.store_products(company_id);

insert into public.store_products (store_id, product_id, company_id, price, is_active)
select p.store_id, p.id, p.company_id, p.price, coalesce(p.is_active, true)
from public.products p
where p.store_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 004: store-owner wholesale purchases.
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  reference text unique,
  company_id uuid,
  store_id uuid,
  store_owner_id uuid,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_method text,
  payment_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in ('pending', 'confirmed', 'ready', 'completed', 'cancelled'));
alter table public.purchases drop constraint if exists purchases_payment_status_check;
alter table public.purchases add constraint purchases_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded'));
create index if not exists purchases_company_id_idx on public.purchases (company_id);
create index if not exists purchases_store_owner_id_idx on public.purchases (store_owner_id);
create index if not exists purchases_store_id_idx on public.purchases (store_id);
update public.stores
set company_id = coalesce(company_id, (select company_id from public.users where users.id = stores.store_owner_id))
where store_owner_id is not null and company_id is null;

-- ---------------------------------------------------------------------------
-- 005: per-company store owner links.
-- ---------------------------------------------------------------------------
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
create unique index if not exists company_links_owner_company_key
  on public.company_links (store_owner_id, company_id);
create index if not exists company_links_store_owner_id_idx on public.company_links (store_owner_id);
create index if not exists company_links_company_id_idx on public.company_links (company_id);
insert into public.company_links (store_owner_id, company_id)
select id, company_id
from public.users
where role = 'storeOwner' and company_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 006: file uploads (Supabase Storage), adverts and per-entity media.
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

alter table public.stores add column if not exists logo text;
alter table public.stores add column if not exists banner text;
alter table public.companies add column if not exists cover_image text;
alter table public.companies add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.stores add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.drivers add column if not exists profile_image text;
alter table public.drivers add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists gallery jsonb not null default '[]'::jsonb;

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

-- ---------------------------------------------------------------------------
-- 007: company change requests.
-- ---------------------------------------------------------------------------
create table if not exists public.company_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid,
  requested_by_email text,
  changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_change_requests_company_id_idx
  on public.company_change_requests (company_id);
create index if not exists company_change_requests_status_idx
  on public.company_change_requests (status);
create index if not exists company_change_requests_created_at_idx
  on public.company_change_requests (created_at desc);
create unique index if not exists company_change_requests_one_pending
  on public.company_change_requests (company_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 008: independent self-registered accounts (detach code-referred members).
-- ---------------------------------------------------------------------------
update public.users
set company_id = null
where role not in ('owner', 'platformAdmin')
  and company_id is not null
  and distributor_code is not null;

-- ---------------------------------------------------------------------------
-- 009: tenant plans, code/store pricing, purchases.
-- ---------------------------------------------------------------------------
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

alter table public.distributor_codes add column if not exists price_zar numeric not null default 0;
alter table public.distributor_codes add column if not exists is_for_sale boolean not null default false;
alter table public.distributor_codes add column if not exists purchased boolean not null default false;
alter table public.distributor_codes add column if not exists purchased_by uuid;
alter table public.distributor_codes add column if not exists purchased_at timestamptz;

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

alter table public.stores add column if not exists price_zar numeric not null default 0;
alter table public.stores add column if not exists is_for_sale boolean not null default false;
alter table public.stores add column if not exists purchased boolean not null default false;
alter table public.stores add column if not exists purchased_by uuid;
alter table public.stores add column if not exists purchased_at timestamptz;
alter table public.stores add column if not exists owned_by_company uuid references public.companies(id);

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

insert into public.plans (name, slug, tier, base_fee_zar, per_active_distributor_zar, min_distributors, max_distributors, features, is_active, is_default, sort_order)
values
  ('Starter', 'starter', 'starter', 299, 1.50, 1, 500, '{"users":true,"stores":true,"codes":true}', true, true, 1),
  ('Growth', 'growth', 'growth', 599, 1.00, 501, 2000, '{"users":true,"stores":true,"codes":true,"whiteLabel":true}', true, false, 2),
  ('Scale', 'scale', 'scale', 999, 0.70, 2001, null, '{"users":true,"stores":true,"codes":true,"whiteLabel":true,"api":true}', true, false, 3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 010: SA compliance, tenant, billing, consent, wallet, commissions, orders.
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists tenant_id uuid default gen_random_uuid();
create index if not exists companies_tenant_id_idx on public.companies(tenant_id);

alter table public.users add column if not exists tenant_id uuid;
-- Registration / invite paths insert users without an explicit tenant_id, so
-- give the column a default before it is made NOT NULL below.
alter table public.users alter column tenant_id set default gen_random_uuid();
alter table public.stores add column if not exists tenant_id uuid;
alter table public.products add column if not exists tenant_id uuid;
alter table public.orders add column if not exists tenant_id uuid;
alter table public.ads add column if not exists tenant_id uuid;
alter table public.distributor_codes add column if not exists tenant_id uuid;
update public.companies set tenant_id = coalesce(tenant_id, gen_random_uuid());
update public.users u set tenant_id = coalesce(u.tenant_id, c.tenant_id, gen_random_uuid()) from public.companies c where u.company_id = c.id;
update public.users set tenant_id = coalesce(tenant_id, gen_random_uuid()) where tenant_id is null;
update public.stores s set tenant_id = coalesce(s.tenant_id, c.tenant_id) from public.companies c where s.company_id = c.id;
update public.products p set tenant_id = coalesce(p.tenant_id, c.tenant_id) from public.companies c where p.company_id = c.id;
update public.orders o set tenant_id = coalesce(o.tenant_id, c.tenant_id) from public.companies c where o.company_id = c.id;
update public.distributor_codes d set tenant_id = coalesce(d.tenant_id, c.tenant_id) from public.companies c where d.company_id = c.id;
alter table public.users alter column tenant_id set not null;
alter table public.companies alter column tenant_id set not null;
create index if not exists users_tenant_id_idx on public.users(tenant_id);
create index if not exists stores_tenant_id_idx on public.stores(tenant_id);
create index if not exists products_tenant_id_idx on public.products(tenant_id);
create index if not exists orders_tenant_id_idx on public.orders(tenant_id);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  tenant_id uuid,
  purpose text not null,
  wording text not null,
  mechanism text,
  granted boolean not null default true,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists consent_user_idx on public.consent_records(user_id);
create index if not exists consent_tenant_idx on public.consent_records(tenant_id);

create table if not exists public.dsar_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  tenant_id uuid,
  type text not null check (type in ('access','correct','delete')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','denied')),
  details jsonb not null default '{}'::jsonb,
  response jsonb,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dsar_user_idx on public.dsar_requests(user_id);
create index if not exists dsar_tenant_idx on public.dsar_requests(tenant_id);

alter table public.orders add column if not exists vat_rate numeric not null default 0.15;
alter table public.orders add column if not exists vat_amount numeric not null default 0;
alter table public.orders add column if not exists subtotal_excl_vat numeric not null default 0;
alter table public.companies add column if not exists vat_registered boolean not null default false;
alter table public.companies add column if not exists vat_number text;
alter table public.companies add column if not exists information_officer text;
alter table public.users add column if not exists vat_registered boolean not null default false;
alter table public.users add column if not exists vat_number text;

alter table public.orders add column if not exists cooling_off_expires_at timestamptz;
alter table public.orders add column if not exists cooling_off_waived boolean not null default false;
alter table public.orders add column if not exists direct_marketing_optout boolean not null default false;
alter table public.orders add column if not exists cpa_disclosures_accepted boolean not null default false;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  tenant_id uuid,
  balance_zar numeric not null default 0,
  pending_zar numeric not null default 0,
  currency text not null default 'ZAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets(id) on delete cascade,
  tenant_id uuid,
  type text not null,
  amount_zar numeric not null,
  balance_after numeric not null,
  ref_id uuid,
  ref_type text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wallet_ledger_wallet_idx on public.wallet_ledger(wallet_id);
create index if not exists wallet_tenant_idx on public.wallets(tenant_id);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid references public.users(id),
  company_id uuid references public.companies(id),
  order_id uuid references public.orders(id),
  source text not null default 'sale',
  bonus_type text,
  level integer,
  amount_zar numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','paid','reversed')),
  paid_at timestamptz,
  payout_batch_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists commissions_user_idx on public.commissions(user_id);
create index if not exists commissions_tenant_idx on public.commissions(tenant_id);
create index if not exists commissions_status_idx on public.commissions(status);

-- ---------------------------------------------------------------------------
-- 014: commission engine v2 — 3-level retail override with a hold window,
-- purchase attribution and idempotency.
-- ---------------------------------------------------------------------------
alter table public.commissions add column if not exists ref_id uuid;
alter table public.commissions add column if not exists ref_type text;
alter table public.commissions add column if not exists release_at timestamptz;
alter table public.commissions add column if not exists released_at timestamptz;
alter table public.commissions add column if not exists reversed_at timestamptz;
alter table public.commissions add column if not exists description text;

-- Commission holds get their own bucket: `pending_zar` already means "withdrawal
-- in flight", so reusing it would let a release steal money earmarked for a payout.
alter table public.wallets add column if not exists held_zar numeric not null default 0;

create unique index if not exists commissions_ref_uk
  on public.commissions (ref_type, ref_id, user_id, (coalesce(level, 0)))
  where ref_id is not null;
create index if not exists commissions_due_idx
  on public.commissions (release_at)
  where status = 'pending';
create index if not exists commissions_user_status_idx
  on public.commissions (user_id, status, created_at);

update public.commissions
  set release_at = coalesce(release_at, created_at + interval '7 days')
  where status = 'pending' and release_at is null;


create table if not exists public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid references public.companies(id),
  currency text not null default 'ZAR',
  total_zar numeric not null default 0,
  status text not null default 'draft' check (status in ('draft','submitted','processing','paid','failed')),
  bank_format text default 'EFT',
  file_ref text,
  notes text,
  submitted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payoutb_tenant_idx on public.payout_batches(tenant_id);

-- ---------------------------------------------------------------------------
-- 011 / 013: autoship subscriptions.
-- ---------------------------------------------------------------------------
create table if not exists public.autoship_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid references public.users(id),
  order_id uuid references public.orders(id),
  interval_days integer not null default 30,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_error text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','paused','cancelled','failed')),
  failed_count integer not null default 0,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists autoship_user_idx on public.autoship_subscriptions(user_id);
create index if not exists autoship_tenant_idx on public.autoship_subscriptions(tenant_id);
create index if not exists autoship_next_idx on public.autoship_subscriptions(next_run_at);

-- ---------------------------------------------------------------------------
-- 012: platform infra (API keys, webhooks, feature flags).
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes text[] not null default array['read'],
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_tenant_idx on public.api_keys(tenant_id);
create index if not exists api_keys_prefix_idx on public.api_keys(prefix);

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  company_id uuid references public.companies(id) on delete set null,
  url text not null,
  secret text,
  events text[] not null default array['*'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_tenant_idx on public.webhooks(tenant_id);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid references public.webhooks(id) on delete cascade,
  event text not null,
  status_code int,
  success boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists webhook_deliveries_hook_idx on public.webhook_deliveries(webhook_id);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  enabled boolean not null default false,
  rollout_percent int not null default 100 check (rollout_percent between 0 and 100),
  tenant_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, tenant_id)
);
create unique index if not exists feature_flags_global_key on public.feature_flags(key) where tenant_id is null;

insert into public.feature_flags (key, enabled, description)
select v.key, false, v.description
from (values
  ('autoship', 'Scheduled repeat orders'),
  ('white-label', 'White-label branding for companies'),
  ('store-purchases', 'Purchase-required stores'),
  ('commissions-v2', 'Commission engine v2 bonuses')
) as v(key, description)
on conflict (key) where tenant_id is null do nothing;

-- ---------------------------------------------------------------------------
-- Consolidated updated_at triggers (all tables that carry updated_at).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','drivers','stores','products','store_products',
    'orders','driver_earnings','appointments','payments','distributor_codes',
    'settings','payouts','announcements','purchases','company_links','ads',
    'company_change_requests','plans','companies_plans','code_purchases',
    'store_purchases','dsar_requests','wallets','commissions','payout_batches',
    'autoship_subscriptions','feature_flags'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consolidated RLS: lock every table down for anon/authenticated keys.
-- The API uses the service_role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','drivers','stores','products','store_products',
    'orders','driver_earnings','appointments','payments','distributor_codes',
    'audit_logs','settings','notifications','payouts','announcements','reviews',
    'purchases','company_links','ads','company_change_requests','plans',
    'companies_plans','code_purchases','store_purchases','consent_records',
    'dsar_requests','wallets','wallet_ledger','commissions','payout_batches',
    'autoship_subscriptions','api_keys','webhooks','webhook_deliveries','feature_flags'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default platform settings.
-- ---------------------------------------------------------------------------
insert into public.settings (scope, key, value)
select 'platform', 'general', jsonb_build_object(
  'platformName', 'NetMark',
  'currency', 'ZAR',
  'currencySymbol', 'R',
  'supportEmail', 'support@re-el.co.za',
  'deliveryFee', 25,
  'commissionPercent', 10,
  'driverCommissionPercent', 80,
  'minOrderAmount', 50,
  'deliveryRadiusKm', 15,
  'maintenanceMode', false,
  'allowRegistrations', true
)
where not exists (select 1 from public.settings where scope = 'platform' and key = 'general');

-- NetMark Platform — Supabase (Postgres) schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
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

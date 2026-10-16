-- 010: SA compliance, tenant, billing, consent, wallet, commissions, orders
begin;

-- Tenant
alter table public.companies add column if not exists tenant_id uuid default gen_random_uuid();
create index if not exists companies_tenant_id_idx on public.companies(tenant_id);

-- Tenancy
alter table public.users add column if not exists tenant_id uuid;
alter table public.stores add column if not exists tenant_id uuid;
alter table public.products add column if not exists tenant_id uuid;
alter table public.orders add column if not exists tenant_id uuid;
alter table public.ads add column if not exists tenant_id uuid;
alter table public.distributor_codes add column if not exists tenant_id uuid;
update public.companies set tenant_id = coalesce(tenant_id, gen_random_uuid());
update public.users u set tenant_id = coalesce(u.tenant_id, c.tenant_id) from public.companies c where u.company_id=c.id;
update public.stores s set tenant_id = coalesce(s.tenant_id, c.tenant_id) from public.companies c where s.company_id=c.id;
update public.products p set tenant_id = coalesce(p.tenant_id, c.tenant_id) from public.companies c where p.company_id=c.id;
update public.orders o set tenant_id = coalesce(o.tenant_id, c.tenant_id) from public.companies c where o.company_id=c.id;
-- ads.tenant_id set only if company_id exists; skipped
update public.distributor_codes d set tenant_id = coalesce(d.tenant_id, c.tenant_id) from public.companies c where d.company_id=c.id;
alter table public.users alter column tenant_id set not null;
alter table public.companies alter column tenant_id set not null;
create index if not exists users_tenant_id_idx on public.users(tenant_id);
create index if not exists stores_tenant_id_idx on public.stores(tenant_id);
create index if not exists products_tenant_id_idx on public.products(tenant_id);
create index if not exists orders_tenant_id_idx on public.orders(tenant_id);

-- Consent (POPIA)
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

-- DSAR
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

-- VAT/SARS
alter table public.orders add column if not exists vat_rate numeric not null default 0.15;
alter table public.orders add column if not exists vat_amount numeric not null default 0;
alter table public.orders add column if not exists subtotal_excl_vat numeric not null default 0;
alter table public.companies add column if not exists vat_registered boolean not null default false;
alter table public.companies add column if not exists vat_number text;
alter table public.companies add column if not exists information_officer text;
alter table public.users add column if not exists vat_registered boolean not null default false;
alter table public.users add column if not exists vat_number text;

-- CPA/checkout
alter table public.orders add column if not exists cooling_off_expires_at timestamptz;
alter table public.orders add column if not exists cooling_off_waived boolean not null default false;
alter table public.orders add column if not exists direct_marketing_optout boolean not null default false;
alter table public.orders add column if not exists cpa_disclosures_accepted boolean not null default false;

-- Wallet
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

-- Commissions
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

-- Payout batches
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

alter table public.commissions add column if not exists payout_batch_id uuid references public.payout_batches(id);

commit;

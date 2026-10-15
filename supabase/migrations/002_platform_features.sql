-- NetMark Platform - migration 002: full role build-out, admin control,
-- PayFast payments, audit, settings, notifications, payouts.
-- Idempotent: safe to run repeatedly against an existing database.

-- ---------------------------------------------------------------------------
-- Column additions
-- ---------------------------------------------------------------------------

-- users: account status + admin notes/metadata
alter table public.users add column if not exists status text not null default 'active';
alter table public.users add column if not exists notes text;
alter table public.users add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.users add column if not exists store_id uuid;
alter table public.users add column if not exists distributor_id uuid;

-- companies: plan, settings blob, explicit owner, suspension metadata
alter table public.companies add column if not exists plan text not null default 'standard';
alter table public.companies add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.companies add column if not exists owner_id uuid;
alter table public.companies add column if not exists suspended_reason text;

-- The base schema restricts company status to active/inactive; allow suspension.
alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('active', 'inactive', 'suspended'));

-- stores: scope fields that make store ownership explicit
alter table public.stores add column if not exists store_owner_id uuid;
alter table public.stores add column if not exists address text;
alter table public.stores add column if not exists settings jsonb not null default '{}'::jsonb;

-- products: inventory + presentation
alter table public.products add column if not exists stock integer not null default 0;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image text;
alter table public.products add column if not exists store_id uuid;
alter table public.products add column if not exists is_active boolean not null default true;

-- orders: money, payment, items, address
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

-- payments: typed columns on top of the generic table
alter table public.payments add column if not exists order_id uuid;
alter table public.payments add column if not exists user_id uuid;
alter table public.payments add column if not exists amount numeric not null default 0;
alter table public.payments add column if not exists status text not null default 'pending';
alter table public.payments add column if not exists provider text not null default 'payfast';
alter table public.payments add column if not exists provider_ref text;
alter table public.payments add column if not exists raw jsonb;

-- appointments: typed columns
alter table public.appointments add column if not exists user_id uuid;
alter table public.appointments add column if not exists store_id uuid;
alter table public.appointments add column if not exists service text;
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists appointment_time text;
alter table public.appointments add column if not exists status text not null default 'pending';
alter table public.appointments add column if not exists notes text;

-- distributor_codes: typed columns
alter table public.distributor_codes add column if not exists code text;
alter table public.distributor_codes add column if not exists distributor_id uuid;
alter table public.distributor_codes add column if not exists uses integer not null default 0;
alter table public.distributor_codes add column if not exists max_uses integer;
alter table public.distributor_codes add column if not exists is_active boolean not null default true;
alter table public.distributor_codes add column if not exists expires_at timestamptz;
create unique index if not exists distributor_codes_code_key on public.distributor_codes (code) where code is not null;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

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
-- updated_at triggers + RLS for the new tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','payouts','announcements']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();', t, t);
  end loop;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'audit_logs','settings','notifications','payouts','announcements','reviews'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default platform settings
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
